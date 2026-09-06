#!/usr/bin/env node

import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import {
  claimLinuxDesktopUrlHandler,
  doctorLinuxDesktop,
  installLinuxDesktop,
  preflightLinuxDesktopInstall,
  refreshLinuxDesktopIntegration,
} from "./install-linux-desktop.mjs";
import {
  doctorLinuxThread,
  installLinuxThread,
  preflightLinuxThreadInstall,
} from "./install-linux-thread.mjs";
import {
  doctorQuattroNative,
  installQuattroNative,
  preflightQuattroNative,
} from "./quattro-native-bootstrap.mjs";
import { OFFICIAL_LINUX_LAUNCHER_IDENTITY } from "./linux-desktop-launcher.mjs";
import { OFFICIAL_THREAD_PRODUCT_APP_ID } from "./linux-thread-release-artifact.mjs";

const runtimeProcess = process;
// oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone Linux installer validates its host platform before filesystem work.
const HOST_PLATFORM = NodeOS.platform();
const TRANSACTION_FILE_BYTE_LIMIT = 8 * 1024 * 1024;

async function captureTransactionPath(filePath, allowDirectory = false) {
  const status = await NodeFSP.lstat(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (status === null) return { kind: "missing", filePath };
  if (status.isSymbolicLink()) {
    return {
      kind: "symlink",
      filePath,
      target: await NodeFSP.readlink(filePath),
      dev: status.dev,
      ino: status.ino,
    };
  }
  if (allowDirectory && status.isDirectory()) {
    const names = (await NodeFSP.readdir(filePath)).toSorted();
    if (names.length > 16) {
      throw new Error(`Topology artifact root has too many entries: ${filePath}`);
    }
    const entries = [];
    for (const name of names) {
      const entry = await NodeFSP.lstat(NodePath.join(filePath, name));
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`Topology artifact root contains an unsafe entry: ${filePath}`);
      }
      entries.push({
        name,
        dev: entry.dev,
        ino: entry.ino,
        size: entry.size,
        mode: entry.mode & 0o777,
        mtimeMs: entry.mtimeMs,
        ctimeMs: entry.ctimeMs,
      });
    }
    return { kind: "directory", filePath, dev: status.dev, ino: status.ino, entries };
  }
  if (!status.isFile() || status.size > TRANSACTION_FILE_BYTE_LIMIT) {
    throw new Error(`Topology transaction cannot snapshot managed path: ${filePath}`);
  }
  const noFollow = NodeFS.constants.O_NOFOLLOW;
  if (!Number.isInteger(noFollow)) {
    throw new Error("Topology transaction requires no-follow file support.");
  }
  const handle = await NodeFSP.open(filePath, NodeFS.constants.O_RDONLY | noFollow);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== status.dev || opened.ino !== status.ino) {
      throw new Error(`Managed topology path changed during snapshot: ${filePath}`);
    }
    const content = await handle.readFile();
    const final = await handle.stat();
    if (final.size !== opened.size || final.mtimeMs !== opened.mtimeMs) {
      throw new Error(`Managed topology path changed during snapshot: ${filePath}`);
    }
    return {
      kind: "file",
      filePath,
      content,
      mode: status.mode & 0o777,
      dev: status.dev,
      ino: status.ino,
    };
  } finally {
    await handle.close();
  }
}

function transactionSnapshotsMatch(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "missing") return true;
  if (left.dev !== right.dev || left.ino !== right.ino) return false;
  if (left.kind === "symlink") return left.target === right.target;
  if (left.kind === "directory") {
    return JSON.stringify(left.entries) === JSON.stringify(right.entries);
  }
  return left.mode === right.mode && left.content.equals(right.content);
}

async function prepareTransactionJournal(component, paths, directoryPaths = []) {
  const directorySet = new Set(directoryPaths);
  const entries = await Promise.all(
    [...new Set(paths)].map(async (filePath) => ({
      prior: await captureTransactionPath(filePath, directorySet.has(filePath)),
      allowDirectory: directorySet.has(filePath),
    })),
  );
  return { component, entries, completed: false };
}

async function checkpointTransactionJournal(journal) {
  for (const entry of journal.entries) {
    entry.installed = await captureTransactionPath(entry.prior.filePath, entry.allowDirectory);
  }
  journal.completed = true;
}

async function restoreTransactionSnapshot(snapshot) {
  if (snapshot.kind === "missing") return;
  await NodeFSP.mkdir(NodePath.dirname(snapshot.filePath), { recursive: true });
  if (snapshot.kind === "symlink") {
    await NodeFSP.symlink(snapshot.target, snapshot.filePath);
    return;
  }
  if (snapshot.kind === "directory") {
    throw new Error("Refusing to reconstruct a pre-existing topology directory.");
  }
  await NodeFSP.writeFile(snapshot.filePath, snapshot.content, {
    flag: "wx",
    mode: snapshot.mode,
  });
  await NodeFSP.chmod(snapshot.filePath, snapshot.mode);
}

async function rollbackTransactionJournal(journal) {
  if (!journal.completed) return;
  for (const entry of journal.entries.toReversed()) {
    if (transactionSnapshotsMatch(entry.prior, entry.installed)) continue;
    const current = await captureTransactionPath(entry.prior.filePath, entry.allowDirectory);
    if (!transactionSnapshotsMatch(current, entry.installed)) {
      throw new Error(
        `Refusing to roll back a topology path that changed after installation: ${entry.prior.filePath}`,
      );
    }
    if (current.kind !== "missing") {
      await NodeFSP.rm(current.filePath, {
        recursive: current.kind === "directory",
        force: true,
      });
    }
    await restoreTransactionSnapshot(entry.prior);
  }
}

function desktopTransactionPaths(plan) {
  const prior = plan.priorOwnershipManifest;
  return [
    ...plan.files.map((file) => file.path),
    plan.paths.ownershipManifestPath,
    plan.paths.currentPath,
    ...(prior?.managedPaths ?? []),
    ...(prior?.managedSharedPaths ?? []).map((entry) => entry.path),
    plan.targetRoot,
  ];
}

function rejectActivation(input) {
  if (input.activate === true) {
    throw new Error(
      "Activation is not supported. Install files first, then manage the production server explicitly.",
    );
  }
}

function componentInputs(input) {
  const productionServerUrl = input.productionServerUrl;
  return {
    host: {
      ...input.host,
      environment: input.environment,
      paths: input.host?.paths,
      activate: input.activate,
    },
    desktop: {
      ...input.desktop,
      environment: input.environment,
      paths: input.desktop?.paths,
      productionServerUrl,
      stagingServerUrl: input.stagingServerUrl,
      refreshDesktopIntegration: false,
    },
    thread: {
      ...input.thread,
      environment: input.environment,
      paths: input.thread?.paths,
      productionServerUrl,
    },
  };
}

export async function preflightLinuxProductionTopology(input, dependencies = {}) {
  rejectActivation(input);
  const components = componentInputs(input);
  const [host, desktop, thread] = await Promise.all([
    preflightQuattroNative(components.host),
    preflightLinuxDesktopInstall(components.desktop, dependencies.desktop),
    preflightLinuxThreadInstall(components.thread, dependencies.thread),
  ]);
  return { components, host, desktop, thread };
}

export async function installLinuxProductionTopology(input, dependencies = {}) {
  const plan = await preflightLinuxProductionTopology(input, dependencies);
  const desktopWasHealthy = (
    await doctorLinuxDesktop(plan.components.desktop, dependencies.desktop)
  ).ok;
  const journals = {
    host: await prepareTransactionJournal("host", [
      ...plan.host.files.map((file) => file.path),
      plan.host.configuration.paths.releaseLink,
    ]),
    desktop: await prepareTransactionJournal("desktop", desktopTransactionPaths(plan.desktop), [
      plan.desktop.targetRoot,
    ]),
    thread: await prepareTransactionJournal(
      "thread",
      [
        ...plan.thread.files.map((file) => file.path),
        plan.thread.paths.currentPath,
        plan.thread.paths.appImagePath,
        plan.thread.targetRoot,
      ],
      [plan.thread.targetRoot],
    ),
  };
  const installedComponents = [];
  const runStage = async (component, operation, journal) => {
    try {
      const result = await operation();
      if (journal) await checkpointTransactionJournal(journal);
      installedComponents.push(component);
      return result;
    } catch (cause) {
      const installed = [...installedComponents];
      const error = new Error(
        `Linux production topology failed during ${component}. Already installed components: ${installed.length === 0 ? "none" : installed.join(", ")}.`,
        { cause },
      );
      error.failedComponent = component;
      error.installedComponents = installed;
      throw error;
    }
  };
  try {
    const host = await runStage(
      "host",
      () => installQuattroNative(plan.components.host, dependencies.host),
      journals.host,
    );
    const desktop = await runStage(
      "desktop",
      () => installLinuxDesktop(plan.components.desktop, dependencies.desktop),
      journals.desktop,
    );
    const thread = await runStage(
      "thread",
      () => installLinuxThread(plan.components.thread, dependencies.thread),
      journals.thread,
    );
    let integration = { refreshed: false };
    if (
      input.refreshDesktopIntegration !== false &&
      (!desktopWasHealthy || thread.changed.length > 0)
    ) {
      await runStage("desktop-integration", async () => {
        await refreshLinuxDesktopIntegration(desktop.paths, dependencies.integration);
        await claimLinuxDesktopUrlHandler(desktop.paths, dependencies.integration);
        integration = { refreshed: true };
      });
    }
    return { host, desktop, thread, integration };
  } catch (error) {
    const completed = Object.values(journals)
      .filter((journal) => journal.completed)
      .toReversed();
    const rollbackErrors = [];
    for (const journal of completed) {
      try {
        await rollbackTransactionJournal(journal);
      } catch (cause) {
        rollbackErrors.push(cause);
      }
    }
    if (rollbackErrors.length > 0) {
      const rollbackError = new Error(
        `Linux production topology failed and ${rollbackErrors.length} components could not be rolled back.`,
        { cause: error },
      );
      rollbackError.failedComponent = error.failedComponent;
      rollbackError.installedComponents = error.installedComponents;
      rollbackError.rollbackErrors = rollbackErrors;
      throw rollbackError;
    }
    error.rolledBackComponents = completed.map((journal) => journal.component);
    throw error;
  }
}

export async function doctorLinuxProductionTopology(input, dependencies = {}) {
  rejectActivation(input);
  const components = componentInputs({ ...input, refreshDesktopIntegration: false });
  const [host, desktop, thread] = await Promise.all([
    doctorQuattroNative(components.host, dependencies.host),
    doctorLinuxDesktop(components.desktop, dependencies.desktop),
    doctorLinuxThread(components.thread),
  ]);
  const findings = [
    ...host.findings.map((finding) => `host:${finding}`),
    ...desktop.findings.map((finding) => `desktop:${finding}`),
    ...thread.findings.map((finding) => `thread:${finding}`),
  ];
  const identities = await inspectVisibleApplicationIdentities(
    input.environment,
    NodePath.dirname(desktop.prepared.paths.desktopEntryPath),
    findings,
  );
  const expectedCodeCount = input.stagingServerUrl ? 2 : 1;
  if (identities.code !== expectedCodeCount) {
    findings.push(`applications:t3-code-visible-count=${identities.code}`);
  }
  if (identities.thread !== 1) {
    findings.push(`applications:t3-thread-visible-count=${identities.thread}`);
  }
  return { ok: findings.length === 0, findings, components: { host, desktop, thread } };
}

const APPLICATION_FILE_LIMIT = 4096;
const APPLICATION_BYTE_LIMIT = 8 * 1024 * 1024;
const APPLICATION_FILE_BYTE_LIMIT = 256 * 1024;

function desktopValues(content) {
  const values = new Map();
  let inDesktopEntry = false;
  for (const line of content.split(/\r?\n/u)) {
    if (line.startsWith("[") && line.endsWith("]")) {
      if (line === "[Desktop Entry]" && !inDesktopEntry) {
        inDesktopEntry = true;
        continue;
      }
      if (inDesktopEntry) break;
    }
    if (!inDesktopEntry) continue;
    const separator = line.indexOf("=");
    if (separator > 0 && !values.has(line.slice(0, separator))) {
      values.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }
  return values;
}

function classifyDesktopIdentity(fileName, values) {
  const productAppId = values.get("X-T3Code-ProductAppId");
  const wmClass = values.get("StartupWMClass");
  const executable = values.get("Exec") ?? "";
  const code =
    new Set(["t3code.desktop", "t3code-staging.desktop"]).has(fileName) ||
    values.get("X-T3Code-Managed") === "true" ||
    productAppId === OFFICIAL_LINUX_LAUNCHER_IDENTITY.productAppId ||
    new Set([OFFICIAL_LINUX_LAUNCHER_IDENTITY.linuxWmClass, "t3code-staging"]).has(wmClass) ||
    executable.split(/\s+/u).includes("t3code-desktop.service") ||
    values.get("MimeType") === "x-scheme-handler/t3code;";
  const thread =
    fileName === "t3-thread.desktop" ||
    values.get("X-T3Code-Thread-Managed") === "true" ||
    productAppId === OFFICIAL_THREAD_PRODUCT_APP_ID ||
    wmClass === "t3-thread" ||
    executable.split(/\s+/u).some((token) => NodePath.basename(token) === "t3code-thread");
  return { code, thread };
}

async function inspectVisibleApplicationIdentities(environment, userRoot, findings) {
  const roots = [
    userRoot,
    ...(environment?.XDG_DATA_DIRS ?? "/usr/local/share:/usr/share")
      .split(":")
      .filter(Boolean)
      .map((directory) => NodePath.join(directory, "applications")),
  ];
  const pending = [...new Set(roots)].filter((root) => {
    if (!NodePath.isAbsolute(root) || NodePath.resolve(root) !== root) {
      findings.push("applications:unsafe-root");
      return false;
    }
    return true;
  });
  const identities = { code: 0, thread: 0 };
  let files = 0;
  let bytes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    const directoryStatus = await NodeFSP.lstat(current).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (directoryStatus === null) continue;
    if (!directoryStatus.isDirectory() || directoryStatus.isSymbolicLink()) {
      findings.push("applications:unsafe-entry");
      continue;
    }
    const entries = await NodeFSP.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (files >= APPLICATION_FILE_LIMIT || bytes >= APPLICATION_BYTE_LIMIT) {
        findings.push("applications:scan-limit");
        return identities;
      }
      const entryPath = NodePath.join(current, entry.name);
      if (entry.isDirectory()) continue;
      if (!entry.name.endsWith(".desktop")) continue;
      files += 1;
      const status = await NodeFSP.lstat(entryPath);
      if (status.isSymbolicLink()) {
        const identity = classifyDesktopIdentity(entry.name, new Map());
        if (current === userRoot || identity.code || identity.thread) {
          findings.push("applications:unsafe-entry");
        }
        continue;
      }
      if (!status.isFile()) {
        findings.push("applications:unsafe-entry");
        continue;
      }
      if (
        status.size > APPLICATION_FILE_BYTE_LIMIT ||
        bytes + status.size > APPLICATION_BYTE_LIMIT
      ) {
        findings.push("applications:scan-limit");
        continue;
      }
      bytes += status.size;
      let content;
      try {
        const noFollow = NodeFS.constants.O_NOFOLLOW;
        if (!Number.isInteger(noFollow)) throw new Error("No no-follow support.");
        const handle = await NodeFSP.open(entryPath, NodeFS.constants.O_RDONLY | noFollow);
        try {
          const openStatus = await handle.stat();
          if (
            !openStatus.isFile() ||
            openStatus.size !== status.size ||
            openStatus.dev !== status.dev ||
            openStatus.ino !== status.ino
          ) {
            throw new Error("Desktop entry changed during inspection.");
          }
          content = await handle.readFile("utf8");
          const finalStatus = await handle.stat();
          if (finalStatus.size !== openStatus.size || finalStatus.mtimeMs !== openStatus.mtimeMs) {
            throw new Error("Desktop entry changed during inspection.");
          }
        } finally {
          await handle.close();
        }
      } catch {
        findings.push("applications:unsafe-entry");
        continue;
      }
      const values = desktopValues(content);
      if (values.get("Hidden") === "true" || values.get("NoDisplay") === "true") continue;
      const identity = classifyDesktopIdentity(entry.name, values);
      if (identity.code) identities.code += 1;
      if (identity.thread) identities.thread += 1;
    }
  }
  return identities;
}

export function parseLinuxProductionTopologyArguments(
  arguments_,
  environment = runtimeProcess.env,
) {
  const command = arguments_[0];
  if (!new Set(["install", "doctor"]).has(command)) {
    throw new Error(
      "Usage: install-linux-production-topology <install|doctor> --release PATH --desktop-artifact PATH --desktop-descriptor PATH --thread-artifact PATH --thread-launcher PATH --thread-descriptor PATH --production-server-url URL --state-dir PATH --workspace-root PATH",
    );
  }
  const values = {};
  const allowed = new Set([
    "--release",
    "--desktop-artifact",
    "--desktop-descriptor",
    "--thread-artifact",
    "--thread-launcher",
    "--thread-descriptor",
    "--production-server-url",
    "--staging-server-url",
    "--state-dir",
    "--workspace-root",
    "--runtime-dir",
    "--node",
    "--host",
    "--port",
    "--icon",
  ]);
  const optionStart = arguments_[1] === "--" ? 2 : 1;
  for (let index = optionStart; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    if (name === "--activate") {
      throw new Error(
        "Activation is not supported. Install files first, then manage the production server explicitly.",
      );
    }
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${name ?? "argument"}.`);
    }
    if (!allowed.has(name)) throw new Error(`Unknown option: ${name}.`);
    if (Object.hasOwn(values, name)) throw new Error(`Duplicate option: ${name}.`);
    values[name] = value;
  }
  for (const required of [
    "--release",
    "--desktop-artifact",
    "--desktop-descriptor",
    "--thread-artifact",
    "--thread-launcher",
    "--thread-descriptor",
    "--production-server-url",
    "--state-dir",
    "--workspace-root",
  ]) {
    if (!values[required]) throw new Error(`${required} is required.`);
  }
  const releasePath = NodePath.resolve(values["--release"]);
  const runtimeDirectory = values["--runtime-dir"] ?? environment.XDG_RUNTIME_DIR;
  if (!runtimeDirectory) throw new Error("--runtime-dir or XDG_RUNTIME_DIR is required.");
  return {
    command,
    input: {
      environment,
      productionServerUrl: values["--production-server-url"],
      stagingServerUrl: values["--staging-server-url"],
      host: {
        releaseRoot: NodePath.dirname(releasePath),
        releasePath,
        stateDirectory: NodePath.resolve(values["--state-dir"]),
        workspaceRoot: NodePath.resolve(values["--workspace-root"]),
        nodePath: NodePath.resolve(values["--node"] ?? runtimeProcess.execPath),
        host: values["--host"] ?? "0.0.0.0",
        port: values["--port"] ? Number(values["--port"]) : 3773,
      },
      desktop: {
        artifactPath: NodePath.resolve(values["--desktop-artifact"]),
        descriptorPath: NodePath.resolve(values["--desktop-descriptor"]),
        iconPath: values["--icon"] ? NodePath.resolve(values["--icon"]) : undefined,
        runtimeDirectory: NodePath.resolve(runtimeDirectory),
        nodeExecutable: NodePath.resolve(values["--node"] ?? runtimeProcess.execPath),
      },
      thread: {
        artifactPath: NodePath.resolve(values["--thread-artifact"]),
        launcherPath: NodePath.resolve(values["--thread-launcher"]),
        descriptorPath: NodePath.resolve(values["--thread-descriptor"]),
      },
    },
  };
}

async function main() {
  if (HOST_PLATFORM !== "linux") {
    throw new Error("The production topology installer is supported only on Linux.");
  }
  const parsed = parseLinuxProductionTopologyArguments(runtimeProcess.argv.slice(2));
  if (parsed.command === "install") {
    await installLinuxProductionTopology(parsed.input);
    console.log("Installed the Linux production topology.");
    return;
  }
  const result = await doctorLinuxProductionTopology(parsed.input);
  if (!result.ok) {
    for (const finding of result.findings) console.error(finding);
    runtimeProcess.exitCode = 1;
    return;
  }
  console.log("The Linux production topology is healthy.");
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
