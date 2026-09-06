// @effect-diagnostics nodeBuiltinImport:off globalTimers:off preferSchemaOverJson:off -- Artifact acceptance owns local package inspection and one explicitly selected compositor launch.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

import { extractFile, listPackage } from "@electron/asar";

const runtimeProcess = process;

interface SmokeConfiguration {
  readonly appImagePath: string;
  readonly launcherPath: string;
  readonly fixtureRoot: string;
  readonly mode: "inspect" | "open" | "quattro";
  readonly target?: string;
}

function requireAbsolutePath(value: string | undefined, name: string): string {
  if (!value || !NodePath.isAbsolute(value) || NodePath.resolve(value) !== value) {
    throw new Error(`${name} must be one normalized absolute path.`);
  }
  return value;
}

function requireFixtureChild(value: string, fixtureRoot: string, name: string): string {
  const relative = NodePath.relative(fixtureRoot, value);
  if (!relative || relative.startsWith(`..${NodePath.sep}`) || NodePath.isAbsolute(relative)) {
    throw new Error(`${name} must be inside the explicit disposable fixture root.`);
  }
  return value;
}

function requireTarget(value: string | undefined): string {
  let target: URL;
  try {
    target = new URL(value ?? "");
  } catch (cause) {
    throw new Error("--target must be a valid URL.", { cause });
  }
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("--target must be one credential-free HTTPS origin.");
  }
  return target.href;
}

export function parseThreadArtifactSmokeArguments(
  arguments_: ReadonlyArray<string>,
): SmokeConfiguration {
  let mode: SmokeConfiguration["mode"] = "inspect";
  const values = new Map<string, string>();
  const allowedValues = new Set(["--artifact", "--launcher", "--fixture-root", "--target"]);
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--open" || argument === "--quattro") {
      if (mode !== "inspect") throw new Error("Select only one T3 Thread smoke launch mode.");
      mode = argument === "--open" ? "open" : "quattro";
      continue;
    }
    if (argument === undefined || !allowedValues.has(argument)) {
      throw new Error(`Unknown T3 Thread smoke option: ${String(argument)}`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}.`);
    if (values.has(argument)) throw new Error(`Duplicate T3 Thread smoke option: ${argument}`);
    values.set(argument, value);
    index += 1;
  }
  const fixtureRoot = requireAbsolutePath(values.get("--fixture-root"), "--fixture-root");
  const appImagePath = requireFixtureChild(
    requireAbsolutePath(values.get("--artifact"), "--artifact"),
    fixtureRoot,
    "--artifact",
  );
  const launcherPath = requireFixtureChild(
    requireAbsolutePath(values.get("--launcher"), "--launcher"),
    fixtureRoot,
    "--launcher",
  );
  const target = mode === "inspect" ? undefined : requireTarget(values.get("--target"));
  if (mode === "inspect" && values.has("--target")) {
    throw new Error("--target is accepted only with an explicit smoke launch mode.");
  }
  return {
    appImagePath,
    launcherPath,
    fixtureRoot,
    mode,
    ...(target === undefined ? {} : { target }),
  };
}

function run(
  command: string,
  arguments_: ReadonlyArray<string>,
  input?: string,
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {},
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, [...arguments_], {
      cwd: options.cwd,
      env: options.env ?? NodeProcess.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const output = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(output);
      else
        reject(
          new Error(`${command} failed with ${signal ?? `exit ${String(code)}`}: ${output.stderr}`),
        );
    });
    child.stdin.end(input);
  });
}

async function requireExecutable(path: string): Promise<void> {
  const status = await NodeFSP.lstat(path);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o111) === 0) {
    throw new Error(`${path} is not one physical executable file.`);
  }
}

async function requirePhysicalDirectory(path: string, label: string): Promise<void> {
  const status = await NodeFSP.lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink() || (await NodeFSP.realpath(path)) !== path) {
    throw new Error(`${label} must be one physical directory.`);
  }
}

async function ensureFixtureDirectory(path: string, fixtureRoot: string): Promise<void> {
  requireFixtureChild(path, fixtureRoot, "Fixture directory");
  const status = await NodeFSP.lstat(path).catch((cause: unknown) => {
    if ((cause as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw cause;
  });
  if (status === null) await NodeFSP.mkdir(path);
  await requirePhysicalDirectory(path, "Fixture directory");
}

async function inspectAppImage(configuration: SmokeConfiguration): Promise<void> {
  await requireExecutable(configuration.appImagePath);
  await requireExecutable(configuration.launcherPath);
  const extractionRoot = NodePath.join(configuration.fixtureRoot, "extraction");
  await ensureFixtureDirectory(extractionRoot, configuration.fixtureRoot);
  const temporaryRoot = await NodeFSP.mkdtemp(NodePath.join(extractionRoot, "artifact-"));
  try {
    await run(configuration.appImagePath, ["--appimage-extract"], undefined, {
      cwd: temporaryRoot,
    });
    const asarPath = NodePath.join(temporaryRoot, "squashfs-root", "resources", "app.asar");
    const entries = listPackage(asarPath, { isPack: false });
    for (const required of [
      "/dist-electron/main.cjs",
      "/dist-electron/preload.cjs",
      "/package.json",
    ]) {
      if (!entries.includes(required))
        throw new Error(`T3 Thread artifact is missing ${required}.`);
    }
    const main = extractFile(asarPath, "dist-electron/main.cjs").toString("utf8");
    const preload = extractFile(asarPath, "dist-electron/preload.cjs").toString("utf8");
    const packageDocument = JSON.parse(extractFile(asarPath, "package.json").toString("utf8")) as {
      readonly main?: unknown;
      readonly productName?: unknown;
    };
    for (const required of ["T3_THREAD_SERVER_URL", "t3-thread-client", "mkdtempSync"]) {
      if (!main.includes(required)) throw new Error(`T3 Thread main is missing ${required}.`);
    }
    for (const forbidden of [
      "DesktopThreadHandoffOwner",
      "thread-adapter-handoff",
      "apps/server",
      "requestSingleInstanceLock",
      "second-instance",
    ]) {
      if (main.includes(forbidden)) throw new Error(`T3 Thread main contains ${forbidden}.`);
    }
    if (!preload.includes("t3ThreadBridge") || preload.includes("desktopBridge")) {
      throw new Error("T3 Thread preload ownership is invalid.");
    }
    if (
      packageDocument.main !== "dist-electron/main.cjs" ||
      packageDocument.productName !== "T3 Thread"
    ) {
      throw new Error("T3 Thread package identity is invalid.");
    }
  } finally {
    await NodeFSP.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function waitForWindow(): Promise<{ readonly pid: number; readonly title: string }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const output = await run("hyprctl", ["clients", "-j"]);
    const clients = JSON.parse(output.stdout) as ReadonlyArray<{
      readonly mapped?: unknown;
      readonly pid?: unknown;
      readonly title?: unknown;
      readonly visible?: unknown;
    }>;
    const client = clients.find(
      (candidate) =>
        candidate.title === "T3 Thread" && candidate.mapped === true && candidate.visible === true,
    );
    if (client && typeof client.pid === "number" && typeof client.title === "string") {
      return { pid: client.pid, title: client.title };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("T3 Thread window was not visibly presented.");
}

async function launchFixture(configuration: SmokeConfiguration): Promise<void> {
  const activation =
    configuration.mode === "quattro"
      ? JSON.stringify({
          contractVersion: 1,
          intentId: NodeCrypto.randomBytes(16).toString("hex"),
          source: "direct-launch",
          action: "draft",
          draft: { text: "Inspect this draft before explicit Send." },
        })
      : "";
  const launched = run(configuration.launcherPath, [configuration.appImagePath], activation, {
    env: {
      ...NodeProcess.env,
      T3_THREAD_SERVER_URL: configuration.target,
      XDG_RUNTIME_DIR: NodePath.join(configuration.fixtureRoot, "runtime"),
    },
  });
  const window = await waitForWindow();
  const acknowledgement = JSON.parse((await launched).stdout) as {
    readonly contractVersion?: unknown;
    readonly status?: unknown;
  };
  if (acknowledgement.contractVersion !== 1 || acknowledgement.status !== "completed") {
    throw new Error("T3 Thread fixture acknowledgement is invalid.");
  }
  NodeProcess.stdout.write(`T3 Thread independent window ready at PID ${String(window.pid)}.\n`);
}

export async function runThreadArtifactSmoke(configuration: SmokeConfiguration): Promise<void> {
  await requirePhysicalDirectory(configuration.fixtureRoot, "--fixture-root");
  const runtimeDirectory = NodePath.join(configuration.fixtureRoot, "runtime");
  await ensureFixtureDirectory(runtimeDirectory, configuration.fixtureRoot);
  await NodeFSP.chmod(runtimeDirectory, 0o700);
  await inspectAppImage(configuration);
  if (configuration.mode !== "inspect") await launchFixture(configuration);
  else NodeProcess.stdout.write(`T3 Thread artifact verified: ${configuration.appImagePath}\n`);
}

if (
  NodeProcess.argv[1] &&
  NodePath.resolve(NodeProcess.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  runThreadArtifactSmoke(parseThreadArtifactSmokeArguments(NodeProcess.argv.slice(2))).catch(
    (cause) => {
      NodeProcess.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
      runtimeProcess.exitCode = 1;
    },
  );
}
