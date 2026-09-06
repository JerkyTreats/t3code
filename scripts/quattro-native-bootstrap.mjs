#!/usr/bin/env node

import * as NodeCrypto from "node:crypto";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const runtimeProcess = process;

export const QUATTRO_BOOTSTRAP_CONTRACT_VERSION = 2;
export const QUATTRO_MANAGED_MARKER = "Managed by T3 Code Quattro bootstrap v2";
const LEGACY_QUATTRO_MANAGED_MARKER = "Managed by T3 Code Quattro bootstrap v1";

const MANAGED_FILE_MODES = {
  launcher: 0o755,
  verifier: 0o755,
  environment: 0o600,
  service: 0o644,
  manifest: 0o600,
};

function requireAbsolutePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.includes("\n") ||
    value.includes("\r") ||
    !NodePath.isAbsolute(value) ||
    NodePath.resolve(value) !== value
  ) {
    throw new Error(`${label} must be one normalized absolute path.`);
  }
  return value;
}

function requirePort(value) {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error("Host port must be an integer between 1 and 65535.");
  }
  return value;
}

function requireHost(value) {
  if (typeof value !== "string" || !/^[0-9A-Za-z:.[\]-]+$/.test(value)) {
    throw new Error("Host bind address contains unsupported characters.");
  }
  return value;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function systemdQuote(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

function systemdPath(value) {
  return Array.from(Buffer.from(value), (byte) => {
    const character = String.fromCharCode(byte);
    if (/^[0-9A-Za-z_./:-]$/.test(character)) return character;
    if (character === "%") return "%%";
    return `\\x${byte.toString(16).padStart(2, "0")}`;
  }).join("");
}

export function resolveQuattroPaths(environment = runtimeProcess.env) {
  const home = requireAbsolutePath(environment.HOME || NodeOS.homedir(), "Home directory");
  const dataHome = requireAbsolutePath(
    environment.XDG_DATA_HOME || NodePath.join(home, ".local", "share"),
    "XDG data home",
  );
  const configHome = requireAbsolutePath(
    environment.XDG_CONFIG_HOME || NodePath.join(home, ".config"),
    "XDG config home",
  );
  return {
    home,
    dataHome,
    configHome,
    launcherPath: NodePath.join(home, ".local", "bin", "t3code-host-serve"),
    verifierPath: NodePath.join(home, ".local", "bin", "t3code-host-verify"),
    releaseLink: NodePath.join(dataHome, "t3code-host", "current"),
    ownershipManifestPath: NodePath.join(dataHome, "t3code-host", "install-manifest.json"),
    environmentPath: NodePath.join(configHome, "t3code", "host.env"),
    servicePath: NodePath.join(configHome, "systemd", "user", "t3code-host.service"),
  };
}

export function normalizeQuattroConfiguration(input) {
  const suppliedPaths = input.paths ?? resolveQuattroPaths(input.environment);
  const paths = Object.fromEntries(
    Object.entries(suppliedPaths).map(([name, filePath]) => [
      name,
      requireAbsolutePath(filePath, `Managed ${name}`),
    ]),
  );
  const releaseRoot = requireAbsolutePath(input.releaseRoot, "Release root");
  const releasePath = requireAbsolutePath(input.releasePath, "Release path");
  if (
    NodePath.dirname(releasePath) !== releaseRoot ||
    !NodePath.basename(releasePath).startsWith("t3code-deploy-v")
  ) {
    throw new Error(
      "Release path must be one versioned deployment directly below the release root.",
    );
  }
  return {
    paths,
    releaseRoot,
    releasePath,
    stateDirectory: requireAbsolutePath(input.stateDirectory, "T3 home"),
    workspaceRoot: requireAbsolutePath(input.workspaceRoot, "Workspace root"),
    nodePath: requireAbsolutePath(input.nodePath, "Node runtime"),
    host: requireHost(input.host ?? "0.0.0.0"),
    port: requirePort(input.port ?? 3773),
  };
}

async function validatePhysicalFile(filePath, label, options = {}) {
  const status = await NodeFSP.lstat(filePath).catch((error) => {
    throw new Error(`${label} is missing.`, { cause: error });
  });
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a physical regular file.`);
  }
  if (options.executable === true) {
    await NodeFSP.access(filePath, NodeFS.constants.X_OK).catch((error) => {
      throw new Error(`${label} must be executable.`, { cause: error });
    });
  }
}

async function validatePhysicalDirectory(directory, label) {
  const status = await NodeFSP.lstat(directory).catch((error) => {
    throw new Error(`${label} is missing.`, { cause: error });
  });
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    (await NodeFSP.realpath(directory)) !== directory
  ) {
    throw new Error(`${label} must be one physical directory.`);
  }
}

async function ensurePhysicalManagedParent(directory, createMissing = false) {
  let ancestor = directory;
  while (true) {
    const status = await NodeFSP.lstat(ancestor).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (status !== null) {
      if (
        !status.isDirectory() ||
        status.isSymbolicLink() ||
        (await NodeFSP.realpath(ancestor)) !== ancestor
      ) {
        throw new Error("Production host destination has an unsafe managed ancestor.");
      }
      break;
    }
    const parent = NodePath.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (createMissing) await NodeFSP.mkdir(directory, { recursive: true });
  const finalStatus = await NodeFSP.lstat(directory).catch((error) => {
    if (error?.code === "ENOENT" && !createMissing) return null;
    throw error;
  });
  if (
    finalStatus !== null &&
    (!finalStatus.isDirectory() ||
      finalStatus.isSymbolicLink() ||
      (await NodeFSP.realpath(directory)) !== directory)
  ) {
    throw new Error("Production host destination has an unsafe managed ancestor.");
  }
}

async function validateHostDestinationParents(rendered, createMissing = false) {
  const parents = new Set([
    ...rendered.files.map((file) => NodePath.dirname(file.path)),
    NodePath.dirname(rendered.configuration.paths.releaseLink),
  ]);
  await Promise.all(
    [...parents].map((directory) => ensurePhysicalManagedParent(directory, createMissing)),
  );
}

export async function validateQuattroRelease(configuration) {
  const rootStatus = await NodeFSP.lstat(configuration.releaseRoot);
  const releaseStatus = await NodeFSP.lstat(configuration.releasePath);
  if (
    !rootStatus.isDirectory() ||
    rootStatus.isSymbolicLink() ||
    !releaseStatus.isDirectory() ||
    releaseStatus.isSymbolicLink()
  ) {
    throw new Error("Release root and release path must be physical directories.");
  }
  const [physicalRoot, physicalRelease] = await Promise.all([
    NodeFSP.realpath(configuration.releaseRoot),
    NodeFSP.realpath(configuration.releasePath),
  ]);
  if (
    physicalRoot !== configuration.releaseRoot ||
    physicalRelease !== configuration.releasePath ||
    NodePath.dirname(physicalRelease) !== physicalRoot
  ) {
    throw new Error("Release path escapes the physical deployment root.");
  }
  await Promise.all([
    validatePhysicalFile(
      NodePath.join(physicalRelease, "apps/server/dist/bin.mjs"),
      "Server entry",
    ),
    validatePhysicalFile(
      NodePath.join(physicalRelease, "apps/server/dist/client/index.html"),
      "Bundled web client",
    ),
    validatePhysicalFile(
      NodePath.join(physicalRelease, "package.json"),
      "Release package metadata",
    ),
    validatePhysicalFile(configuration.nodePath, "Node runtime", { executable: true }),
    validatePhysicalDirectory(configuration.stateDirectory, "T3 state directory"),
    validatePhysicalDirectory(configuration.workspaceRoot, "Workspace root"),
  ]);
}

function renderVerifier(configuration) {
  return `#!/usr/bin/env bash
# ${QUATTRO_MANAGED_MARKER}
set -euo pipefail

release_link=${shellQuote(configuration.paths.releaseLink)}
release_root=${shellQuote(configuration.releaseRoot)}
node_path=${shellQuote(configuration.nodePath)}

fail_verification() {
  printf 'T3 Code host release verification failed: %s\\n' "$1" >&2
  exit 78
}

[[ -L "$release_link" ]] || fail_verification "release link is not a symbolic link"
release_path=$(readlink -f -- "$release_link")
[[ -n "$release_path" ]] || fail_verification "release link does not resolve"
[[ "$(dirname -- "$release_path")" == "$release_root" ]] || fail_verification "release target escapes the deployment root"
[[ "$(basename -- "$release_path")" == t3code-deploy-v* ]] || fail_verification "release target is not versioned"
[[ -d "$release_path" && ! -L "$release_path" ]] || fail_verification "release target is not a physical directory"

for required_file in \\
  "$release_path/apps/server/dist/bin.mjs" \\
  "$release_path/apps/server/dist/client/index.html" \\
  "$release_path/package.json"; do
  [[ -f "$required_file" && ! -L "$required_file" && -r "$required_file" ]] \\
    || fail_verification "required release file is unavailable"
done

[[ -x "$node_path" && ! -L "$node_path" ]] || fail_verification "pinned Node runtime is unavailable"
"$node_path" --check "$release_path/apps/server/dist/bin.mjs" >/dev/null \\
  || fail_verification "server entry fails the Node syntax check"

if [[ "\${1:-}" == --print-path ]]; then
  printf '%s\\n' "$release_path"
elif [[ $# -ne 0 ]]; then
  fail_verification "unexpected verifier argument"
fi
`;
}

function renderLauncher(configuration) {
  return `#!/usr/bin/env bash
# ${QUATTRO_MANAGED_MARKER}
set -euo pipefail

verifier=${shellQuote(configuration.paths.verifierPath)}
node_path=${shellQuote(configuration.nodePath)}
release_path="$("$verifier" --print-path)"

if [[ -z "\${T3CODE_HOME:-}" ]]; then
  export T3CODE_HOME=${shellQuote(configuration.stateDirectory)}
fi
if [[ -z "\${T3CODE_HOST:-}" ]]; then
  export T3CODE_HOST=${shellQuote(configuration.host)}
fi
if [[ -z "\${T3CODE_PORT:-}" ]]; then
  export T3CODE_PORT=${shellQuote(String(configuration.port))}
fi
if [[ -z "\${T3CODE_NO_BROWSER:-}" ]]; then
  export T3CODE_NO_BROWSER=true
fi
workspace_root="\${T3CODE_WORKSPACE_ROOT:-}"
if [[ -z "$workspace_root" ]]; then
  workspace_root=${shellQuote(configuration.workspaceRoot)}
fi

exec "$node_path" "$release_path/apps/server/dist/bin.mjs" \\
  serve \\
  --host "$T3CODE_HOST" \\
  --port "$T3CODE_PORT" \\
  --base-dir "$T3CODE_HOME" \\
  "$workspace_root"
`;
}

function renderEnvironment(configuration) {
  return `# ${QUATTRO_MANAGED_MARKER}
T3CODE_HOME=${systemdQuote(configuration.stateDirectory)}
T3CODE_HOST=${systemdQuote(configuration.host)}
T3CODE_PORT=${systemdQuote(String(configuration.port))}
T3CODE_NO_BROWSER=true
T3CODE_WORKSPACE_ROOT=${systemdQuote(configuration.workspaceRoot)}
`;
}

function renderService(configuration) {
  return `# ${QUATTRO_MANAGED_MARKER}
[Unit]
Description=T3 Code production host server
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=60s
StartLimitBurst=4

[Service]
Type=exec
WorkingDirectory=${systemdPath(configuration.workspaceRoot)}
Environment=NODE_ENV=production
EnvironmentFile=${systemdPath(configuration.paths.environmentPath)}
UMask=0077
ExecStartPre=${systemdQuote(configuration.paths.verifierPath)}
ExecStart=${systemdQuote(configuration.paths.launcherPath)}
KillMode=control-group
KillSignal=SIGTERM
FinalKillSignal=SIGKILL
SendSIGKILL=yes
TimeoutStartSec=45s
TimeoutStopSec=45s
Restart=on-failure
RestartPreventExitStatus=78
RestartSec=5s
SuccessExitStatus=130 143 SIGINT SIGTERM
StandardOutput=journal
StandardError=journal
SyslogIdentifier=t3code-host

[Install]
WantedBy=default.target
`;
}

export function renderQuattroFiles(input) {
  const configuration = normalizeQuattroConfiguration(input);
  const manifest = {
    contractVersion: QUATTRO_BOOTSTRAP_CONTRACT_VERSION,
    owner: "t3code-production-host",
    releasePath: configuration.releasePath,
    managedPaths: [
      configuration.paths.launcherPath,
      configuration.paths.verifierPath,
      configuration.paths.environmentPath,
      configuration.paths.servicePath,
      configuration.paths.releaseLink,
    ],
  };
  return {
    configuration,
    files: [
      {
        id: "launcher",
        path: configuration.paths.launcherPath,
        mode: MANAGED_FILE_MODES.launcher,
        content: renderLauncher(configuration),
      },
      {
        id: "verifier",
        path: configuration.paths.verifierPath,
        mode: MANAGED_FILE_MODES.verifier,
        content: renderVerifier(configuration),
      },
      {
        id: "environment",
        path: configuration.paths.environmentPath,
        mode: MANAGED_FILE_MODES.environment,
        content: renderEnvironment(configuration),
      },
      {
        id: "service",
        path: configuration.paths.servicePath,
        mode: MANAGED_FILE_MODES.service,
        content: renderService(configuration),
      },
      {
        id: "manifest",
        path: configuration.paths.ownershipManifestPath,
        mode: MANAGED_FILE_MODES.manifest,
        content: `# ${QUATTRO_MANAGED_MARKER}\n${JSON.stringify(manifest, null, 2)}\n`,
      },
    ],
  };
}

function legacyHostContent(file) {
  if (file.id === "manifest") return null;
  return file.content
    .replaceAll(QUATTRO_MANAGED_MARKER, LEGACY_QUATTRO_MANAGED_MARKER)
    .replace(
      "Description=T3 Code production host server",
      "Description=T3 Code Quattro native host server",
    );
}

async function inspectManagedFile(file) {
  try {
    const status = await NodeFSP.lstat(file.path);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(`Managed path collision is not a physical file: ${file.path}`);
    }
    const content = await NodeFSP.readFile(file.path, "utf8");
    if (content !== file.content && content !== legacyHostContent(file)) {
      throw new Error(`Refusing to replace an existing ${file.id} file: ${file.path}`);
    }
    const mode = status.mode & 0o777;
    if (mode !== file.mode) {
      throw new Error(`Existing ${file.id} file mode differs. Refusing replacement.`);
    }
    return { exists: true, mode, legacyCompatible: content !== file.content };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false };
    throw error;
  }
}

async function inspectReleaseLink(configuration) {
  const status = await NodeFSP.lstat(configuration.paths.releaseLink).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (status === null) return { exists: false };
  if (!status.isSymbolicLink()) {
    throw new Error("Current release path exists and is not a symbolic link.");
  }
  const target = await NodeFSP.realpath(configuration.paths.releaseLink).catch((error) => {
    throw new Error("Existing production release pointer does not resolve. Refusing replacement.", {
      cause: error,
    });
  });
  if (target !== configuration.releasePath) {
    throw new Error(
      "Existing production release pointer targets a different release. Refusing replacement.",
    );
  }
  return { exists: true };
}

export async function preflightQuattroNative(input) {
  if (input.activate === true) {
    throw new Error(
      "Activation is not supported. Production server lifecycle remains an explicit operator action.",
    );
  }
  const rendered = renderQuattroFiles(input);
  await validateQuattroRelease(rendered.configuration);
  await validateHostDestinationParents(rendered);
  const states = new Map();
  for (const file of rendered.files) states.set(file.id, await inspectManagedFile(file));
  const releaseState = await inspectReleaseLink(rendered.configuration);
  return { ...rendered, states, releaseState };
}

async function writeNewManagedFile(file, dependencies, recordCreated) {
  await dependencies.beforeManagedWrite?.(file);
  await ensurePhysicalManagedParent(NodePath.dirname(file.path), true);
  const temporaryPath = `${file.path}.${runtimeProcess.pid}.${NodeCrypto.randomUUID()}.tmp`;
  const expected = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
  await NodeFSP.writeFile(temporaryPath, expected, { mode: file.mode, flag: "wx" });
  try {
    await NodeFSP.chmod(temporaryPath, file.mode);
    const temporaryStatus = await NodeFSP.lstat(temporaryPath);
    await NodeFSP.link(temporaryPath, file.path);
    recordCreated({
      kind: "file",
      path: file.path,
      content: expected,
      mode: file.mode,
      dev: temporaryStatus.dev,
      ino: temporaryStatus.ino,
    });
  } finally {
    await NodeFSP.rm(temporaryPath, { force: true });
  }
}

async function createReleaseLink(configuration, dependencies, recordCreated) {
  await dependencies.beforeReleasePromotion?.(configuration.paths.releaseLink);
  await ensurePhysicalManagedParent(NodePath.dirname(configuration.paths.releaseLink), true);
  const temporaryPath = `${configuration.paths.releaseLink}.${runtimeProcess.pid}.${NodeCrypto.randomUUID()}.tmp`;
  await NodeFSP.symlink(configuration.releasePath, temporaryPath);
  try {
    const temporaryStatus = await NodeFSP.lstat(temporaryPath);
    await NodeFSP.link(temporaryPath, configuration.paths.releaseLink);
    recordCreated({
      kind: "symlink",
      path: configuration.paths.releaseLink,
      target: configuration.releasePath,
      dev: temporaryStatus.dev,
      ino: temporaryStatus.ino,
    });
    await dependencies.afterReleasePromotion?.(configuration.paths.releaseLink);
  } finally {
    await NodeFSP.rm(temporaryPath, { force: true });
  }
}

async function inspectCreatedPath(filePath) {
  try {
    const status = await NodeFSP.lstat(filePath);
    if (status.isSymbolicLink()) {
      const target = await NodeFSP.readlink(filePath);
      const current = await NodeFSP.lstat(filePath);
      if (!current.isSymbolicLink() || current.dev !== status.dev || current.ino !== status.ino) {
        throw new Error(`Production host path changed during rollback inspection: ${filePath}`);
      }
      return { kind: "symlink", path: filePath, target, dev: status.dev, ino: status.ino };
    }
    if (!status.isFile()) return { kind: "other", path: filePath };
    const content = await NodeFSP.readFile(filePath);
    const current = await NodeFSP.lstat(filePath);
    if (!current.isFile() || current.dev !== status.dev || current.ino !== status.ino) {
      throw new Error(`Production host path changed during rollback inspection: ${filePath}`);
    }
    return {
      kind: "file",
      path: filePath,
      content,
      mode: status.mode & 0o777,
      dev: status.dev,
      ino: status.ino,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { kind: "missing", path: filePath };
    throw error;
  }
}

function createdPathMatches(receipt, current) {
  if (receipt.kind !== current.kind) return false;
  if (receipt.kind === "symlink") {
    return (
      receipt.target === current.target &&
      receipt.dev === current.dev &&
      receipt.ino === current.ino
    );
  }
  return (
    receipt.mode === current.mode &&
    receipt.content.equals(current.content) &&
    receipt.dev === current.dev &&
    receipt.ino === current.ino
  );
}

async function removeCreatedPathIfStillOwned(receipt) {
  const current = await inspectCreatedPath(receipt.path);
  if (!createdPathMatches(receipt, current)) {
    throw new Error(
      `Refusing to roll back a production host path that changed after installation: ${receipt.path}`,
    );
  }
  await NodeFSP.rm(receipt.path);
}

export async function installQuattroNative(input, dependencies = {}) {
  const plan = await preflightQuattroNative(input);
  const created = [];
  const changed = [];
  try {
    for (const file of plan.files) {
      const state = plan.states.get(file.id);
      if (state.exists) continue;
      await writeNewManagedFile(file, dependencies, (receipt) => created.push(receipt));
      changed.push(file.id);
    }
    if (!plan.releaseState.exists) {
      await createReleaseLink(plan.configuration, dependencies, (receipt) => created.push(receipt));
      changed.push("release-link");
    }
    return { changed, configuration: plan.configuration };
  } catch (error) {
    const results = await Promise.allSettled(
      created.toReversed().map((receipt) => removeCreatedPathIfStillOwned(receipt)),
    );
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      const rollbackError = new Error(
        `Production host installation failed and ${failures.length} new paths could not be safely removed.`,
        { cause: error },
      );
      rollbackError.rollbackErrors = failures.map((failure) => failure.reason);
      throw rollbackError;
    }
    throw error;
  }
}

function commandResult(command, args) {
  return new Promise((resolve) => {
    const child = NodeChildProcess.spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => resolve({ code: null, stdout, stderr, error }));
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

async function inspectHostRuntime(configuration, findings, dependencies) {
  const run = dependencies.runCommand ?? commandResult;
  const result = await run("systemctl", [
    "--user",
    "show",
    "t3code-host.service",
    "--property=FragmentPath",
    "--property=MainPID",
    "--property=ControlGroup",
    "--property=ActiveState",
    "--property=NeedDaemonReload",
    "--property=ExecStart",
    "--property=ExecStartPre",
  ]);
  if (result.code !== 0) {
    findings.push("runtime:unavailable");
    return;
  }
  const properties = Object.fromEntries(
    result.stdout
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 1 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  if (properties.FragmentPath !== configuration.paths.servicePath) {
    findings.push("runtime:fragment-path-drift");
  }
  if (properties.NeedDaemonReload !== "no") findings.push("runtime:daemon-reload-needed");
  const loadedCommandPath = (value) => {
    const rendered = String(value ?? "");
    const match = /^\{ path=(.*?) ; argv\[\]=(.*?) ;/u.exec(rendered);
    return match && !rendered.includes("} {") && match[1] === match[2] ? match[1] : null;
  };
  if (loadedCommandPath(properties.ExecStart) !== configuration.paths.launcherPath) {
    findings.push("runtime:exec-start-drift");
  }
  if (loadedCommandPath(properties.ExecStartPre) !== configuration.paths.verifierPath) {
    findings.push("runtime:exec-start-pre-drift");
  }
  if (properties.ActiveState !== "active") findings.push("runtime:inactive");
  const mainPid = Number(properties.MainPID);
  if (!Number.isSafeInteger(mainPid) || mainPid <= 0) {
    findings.push("runtime:main-pid-invalid");
    return;
  }
  if (!properties.ControlGroup?.startsWith("/")) {
    findings.push("runtime:control-group-invalid");
    return;
  }
  try {
    const readFile = dependencies.readFile ?? NodeFSP.readFile;
    const readLink = dependencies.readLink ?? NodeFSP.readlink;
    const processCgroup = await readFile(`/proc/${String(mainPid)}/cgroup`, "utf8");
    const owned = processCgroup
      .split("\n")
      .some((line) => line === `0::${properties.ControlGroup}`);
    if (!owned) findings.push("runtime:control-group-drift");
    const executable = await readLink(`/proc/${String(mainPid)}/exe`);
    if (executable !== configuration.nodePath) findings.push("runtime:executable-drift");
    const commandLine = await readFile(`/proc/${String(mainPid)}/cmdline`);
    const expectedArguments = [
      configuration.nodePath,
      NodePath.join(configuration.releasePath, "apps/server/dist/bin.mjs"),
      "serve",
      "--host",
      configuration.host,
      "--port",
      String(configuration.port),
      "--base-dir",
      configuration.stateDirectory,
      configuration.workspaceRoot,
    ];
    const expectedCommandLine = Buffer.from(`${expectedArguments.join("\0")}\0`);
    if (!Buffer.from(commandLine).equals(expectedCommandLine)) {
      findings.push("runtime:arguments-drift");
    }
  } catch {
    findings.push("runtime:main-pid-unverifiable");
  }
}

export async function doctorQuattroNative(input, dependencies = {}) {
  const rendered = renderQuattroFiles(input);
  await validateQuattroRelease(rendered.configuration);
  const findings = [];
  for (const file of rendered.files) {
    try {
      const status = await NodeFSP.lstat(file.path);
      if (!status.isFile() || status.isSymbolicLink()) {
        findings.push(`${file.id}:unsafe-type`);
        continue;
      }
      const content = await NodeFSP.readFile(file.path, "utf8");
      if (content !== file.content && content !== legacyHostContent(file)) {
        findings.push(`${file.id}:content-drift`);
      }
      if ((status.mode & 0o777) !== file.mode) findings.push(`${file.id}:mode-drift`);
    } catch (error) {
      if (error?.code === "ENOENT") findings.push(`${file.id}:missing`);
      else throw error;
    }
  }
  try {
    const status = await NodeFSP.lstat(rendered.configuration.paths.releaseLink);
    if (!status.isSymbolicLink()) findings.push("release-link:unsafe-type");
    else {
      const target = await NodeFSP.realpath(rendered.configuration.paths.releaseLink);
      if (target !== rendered.configuration.releasePath) findings.push("release-link:target-drift");
    }
  } catch (error) {
    if (error?.code === "ENOENT") findings.push("release-link:missing");
    else throw error;
  }
  if (input.inspectRuntime !== false) {
    await inspectHostRuntime(rendered.configuration, findings, dependencies);
  }
  return { ok: findings.length === 0, findings, configuration: rendered.configuration };
}

function parseArguments(arguments_) {
  const command = arguments_[0];
  if (!new Set(["install", "doctor"]).has(command)) {
    throw new Error(
      "Usage: quattro-native-bootstrap <install|doctor> --release PATH --state-dir PATH --workspace-root PATH",
    );
  }
  const values = {};
  for (let index = 1; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (name === "--activate") {
      throw new Error(
        "Activation is not supported. Production server lifecycle remains an explicit operator action.",
      );
    }
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${name ?? "argument"}.`);
    }
    values[name] = value;
  }
  for (const required of ["--release", "--state-dir", "--workspace-root"]) {
    if (!values[required]) throw new Error(`${required} is required.`);
  }
  const releasePath = NodePath.resolve(values["--release"]);
  return {
    command,
    input: {
      releaseRoot: NodePath.dirname(releasePath),
      releasePath,
      stateDirectory: NodePath.resolve(values["--state-dir"]),
      workspaceRoot: NodePath.resolve(values["--workspace-root"]),
      nodePath: NodePath.resolve(values["--node"] ?? runtimeProcess.execPath),
      host: values["--host"] ?? "0.0.0.0",
      port: values["--port"] ? Number(values["--port"]) : 3773,
    },
  };
}

async function main() {
  const parsed = parseArguments(runtimeProcess.argv.slice(2));
  if (parsed.command === "install") {
    const result = await installQuattroNative(parsed.input);
    console.log(
      `T3 Code production host files installed. Managed paths changed: ${result.changed.length}.`,
    );
    return;
  }
  const result = await doctorQuattroNative(parsed.input);
  if (!result.ok) {
    for (const finding of result.findings) console.error(finding);
    runtimeProcess.exitCode = 1;
    return;
  }
  console.log("T3 Code production host files are healthy.");
}

if (
  runtimeProcess.argv[1] &&
  NodePath.resolve(runtimeProcess.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    runtimeProcess.exitCode = 1;
  });
}
