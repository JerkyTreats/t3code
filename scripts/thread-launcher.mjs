#!/usr/bin/env node
import * as NodeFS from "node:fs";
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodeFSP from "node:fs/promises";
import * as NodeUtil from "node:util";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ACTIVATION_BYTES = 65_536;
const MAX_DRAFT_BYTES = 32 * 1024;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const INTERNAL_LAUNCH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EXTERNAL_INTENT_ID_PATTERN = /^[0-9a-f]{32}$/u;
const THREAD_RUNTIME_PREFIX = "t3code-thread-runtime-";

async function releaseDigest(path) {
  const hash = NodeCrypto.createHash("sha256");
  for await (const bytes of NodeFS.createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

async function ownedReleaseDirectory(path) {
  const status = await NodeFSP.lstat(path);
  if (
    !status.isDirectory() ||
    status.isSymbolicLink() ||
    (status.mode & 0o022) !== 0 ||
    status.uid !== NodeProcess.getuid?.() ||
    (await NodeFSP.realpath(path)) !== path
  )
    throw new Error("T3 Thread prepared release directory is unsafe.");
}

async function releaseInventory(root) {
  await ownedReleaseDirectory(root);
  const entries = [];
  const visit = async (relative) => {
    const directory = NodePath.join(root, relative);
    for (const name of (await NodeFSP.readdir(directory)).sort()) {
      const path = NodePath.join(directory, name);
      const key = NodePath.relative(root, path);
      const status = await NodeFSP.lstat(path);
      if (++visit.count > 8192 || status.uid !== NodeProcess.getuid?.()) {
        throw new Error("T3 Thread prepared release inventory is unsafe.");
      }
      if (status.isSymbolicLink()) {
        const target = await NodeFSP.readlink(path);
        const resolved = await NodeFSP.realpath(path);
        if (NodePath.isAbsolute(target) || !resolved.startsWith(`${root}${NodePath.sep}`)) {
          throw new Error("T3 Thread prepared release link escapes its code root.");
        }
        entries.push({ path: key, kind: "link", target });
      } else if ((status.mode & 0o7022) !== 0) {
        throw new Error("T3 Thread prepared release permissions are unsafe.");
      } else if (status.isDirectory()) {
        entries.push({ path: key, kind: "directory", mode: status.mode & 0o777 });
        await visit(key);
      } else if (status.isFile() && status.nlink === 1 && status.size <= 1024 ** 3) {
        entries.push({
          path: key,
          kind: "file",
          mode: status.mode & 0o777,
          sha256: await releaseDigest(path),
        });
      } else {
        throw new Error("T3 Thread prepared release contains an unsupported file.");
      }
    }
  };
  visit.count = 0;
  await visit("");
  if (
    !entries.some(
      (entry) => entry.path === "t3-thread" && entry.kind === "file" && entry.mode & 0o100,
    )
  ) {
    throw new Error("T3 Thread prepared release executable is missing.");
  }
  return entries;
}

async function verifyPreparedRelease(root, artifactSha256) {
  await ownedReleaseDirectory(root);
  const manifestPath = NodePath.join(root, "release.json");
  const status = await NodeFSP.lstat(manifestPath);
  if (
    !status.isFile() ||
    status.isSymbolicLink() ||
    status.nlink !== 1 ||
    status.size > 2 * 1024 * 1024 ||
    status.uid !== NodeProcess.getuid?.() ||
    (status.mode & 0o077) !== 0
  ) {
    throw new Error("T3 Thread prepared release manifest is unsafe.");
  }
  const manifest = JSON.parse(await NodeFSP.readFile(manifestPath, "utf8"));
  if (
    !isRecord(manifest) ||
    !hasExactKeys(manifest, ["contractVersion", "artifactSha256", "entries"]) ||
    manifest.contractVersion !== 1 ||
    manifest.artifactSha256 !== artifactSha256 ||
    JSON.stringify(manifest.entries) !==
      JSON.stringify(await releaseInventory(NodePath.join(root, "squashfs-root")))
  ) {
    throw new Error("T3 Thread prepared release failed integrity verification.");
  }
  return NodePath.join(root, "squashfs-root", "t3-thread");
}

export async function verifyThreadRelease(appImagePath) {
  const artifactPath = await NodeFSP.realpath(NodePath.resolve(appImagePath));
  const artifactSha256 = await releaseDigest(artifactPath);
  return verifyPreparedRelease(
    NodePath.join(NodePath.dirname(artifactPath), ".t3-thread-releases", artifactSha256),
    artifactSha256,
  );
}

// The installer and direct-artifact cold path share one release realization owner.
// Published code is never repaired or collected by a client lifetime.
export async function prepareThreadRelease(appImagePath, dependencies = {}) {
  const artifactPath = await NodeFSP.realpath(NodePath.resolve(appImagePath));
  const artifactStatus = await NodeFSP.lstat(artifactPath);
  if (
    !artifactStatus.isFile() ||
    (artifactStatus.mode & 0o111) === 0 ||
    (artifactStatus.mode & 0o022) !== 0
  ) {
    throw new Error("T3 Thread release artifact is unsafe.");
  }
  const artifactSha256 = await releaseDigest(artifactPath);
  const parent = NodePath.join(NodePath.dirname(artifactPath), ".t3-thread-releases");
  await ownedReleaseDirectory(NodePath.dirname(artifactPath));
  await NodeFSP.mkdir(parent, { mode: 0o700 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  await ownedReleaseDirectory(parent);
  const root = NodePath.join(parent, artifactSha256);
  const exists = await NodeFSP.lstat(root).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (exists) return verifyPreparedRelease(root, artifactSha256);
  const staging = await NodeFSP.mkdtemp(NodePath.join(parent, ".preparing-"));
  try {
    const extract = dependencies.extract ?? NodeUtil.promisify(NodeChildProcess.execFile);
    await extract(artifactPath, ["--appimage-extract"], {
      cwd: staging,
      timeout: 60_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    if ((await releaseDigest(artifactPath)) !== artifactSha256) {
      throw new Error("T3 Thread artifact changed during preparation.");
    }
    // AppImage carries a setuid sandbox helper; this user-owned release uses
    // Chromium's existing unprivileged sandbox, never a setuid executable.
    await ownedReleaseDirectory(NodePath.join(staging, "squashfs-root"));
    const sandbox = NodePath.join(staging, "squashfs-root", "chrome-sandbox");
    const sandboxStatus = await NodeFSP.lstat(sandbox).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (sandboxStatus?.isFile() && sandboxStatus.nlink === 1) await NodeFSP.chmod(sandbox, 0o755);
    // electron-builder's default AppImage icons are emitted with mode 0664.
    // Normalize only those generated icons before the strict inventory check.
    const iconRoot = NodePath.join(staging, "squashfs-root", "usr/share/icons/hicolor");
    const iconSizes = await NodeFSP.readdir(iconRoot).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    if (iconSizes.length > 0) await ownedReleaseDirectory(iconRoot);
    for (const size of iconSizes) {
      if (!/^\d+x\d+$/.test(size)) continue;
      const apps = NodePath.join(iconRoot, size, "apps");
      await ownedReleaseDirectory(NodePath.dirname(apps));
      await ownedReleaseDirectory(apps);
      const icon = NodePath.join(apps, "t3-thread.png");
      const status = await NodeFSP.lstat(icon).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (status?.isFile() && status.nlink === 1 && (status.mode & 0o7777) === 0o664)
        await NodeFSP.chmod(icon, 0o644);
    }
    const entries = await releaseInventory(NodePath.join(staging, "squashfs-root"));
    await NodeFSP.writeFile(
      NodePath.join(staging, "release.json"),
      JSON.stringify({
        contractVersion: 1,
        artifactSha256,
        entries,
      }),
      { mode: 0o600, flag: "wx" },
    );
    try {
      await NodeFSP.rename(staging, root);
    } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
      // Concurrent preparation may publish first; only its fully verified
      // release can win, never its partial staging directory.
    }
    return await verifyPreparedRelease(root, artifactSha256);
  } finally {
    await NodeFSP.rm(staging, { recursive: true, force: true });
  }
}

function startupMark(input, name) {
  input.markStartup?.({
    contractVersion: 1,
    source: "launcher",
    name,
    atMs: performance.timeOrigin + performance.now(),
  });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, required, optional = []) {
  const keys = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key))
  );
}

function fitsUtf8(value, maximum) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= maximum;
}

function isWorkingDirectory(value) {
  return fitsUtf8(value, 4096) && value.startsWith("/") && !value.includes("\0");
}

function readInput(input) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let byteLength = 0;
    const onData = (chunk) => {
      const bytes = Buffer.from(chunk);
      byteLength += bytes.byteLength;
      if (byteLength > MAX_ACTIVATION_BYTES) {
        input.off("data", onData);
        input.resume();
        reject(new Error("T3 Thread activation is oversized."));
        return;
      }
      chunks.push(bytes);
    };
    input.on("data", onData);
    input.once("error", reject);
    input.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

export function externalIntentLaunchId(intentId) {
  if (!EXTERNAL_INTENT_ID_PATTERN.test(intentId)) {
    throw new Error("T3 Thread external intent identity is invalid.");
  }
  const digest = NodeCrypto.createHash("sha256").update(`omarchy:${intentId}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function validateCrash(crash, expectedUserId) {
  const keys = [
    "journalCursor",
    "bootId",
    "messageId",
    "userId",
    "pid",
    "command",
    "executable",
    "signal",
    "timestampUsec",
  ];
  if (!isRecord(crash) || !hasExactKeys(crash, keys)) return false;
  return (
    fitsUtf8(crash.journalCursor, 4096) &&
    crash.journalCursor.length > 0 &&
    fitsUtf8(crash.bootId, 256) &&
    crash.bootId.length > 0 &&
    crash.messageId === "fc2e22bc6ee647b6b90729ab34a250b1" &&
    Number.isInteger(crash.userId) &&
    crash.userId === expectedUserId &&
    Number.isInteger(crash.pid) &&
    crash.pid > 0 &&
    fitsUtf8(crash.command, 256) &&
    fitsUtf8(crash.executable, 4096) &&
    fitsUtf8(crash.signal, 256) &&
    fitsUtf8(crash.timestampUsec, 256) &&
    crash.timestampUsec.length > 0
  );
}

export function parseLauncherActivation(
  bytes,
  expectedUserId = NodeProcess.getuid?.(),
  createLaunchId = NodeCrypto.randomUUID,
  defaultWorkingDirectory = NodeOS.homedir(),
) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength > MAX_ACTIVATION_BYTES) {
    throw new Error("T3 Thread activation is oversized.");
  }
  if (bytes.byteLength === 0) {
    if (!isWorkingDirectory(defaultWorkingDirectory)) {
      throw new Error("T3 Thread default working directory is invalid.");
    }
    const launchId = createLaunchId();
    if (!INTERNAL_LAUNCH_ID_PATTERN.test(launchId)) {
      throw new Error("T3 Thread fresh launch identity is invalid.");
    }
    return {
      activation: { contractVersion: 1, launchId, workingDirectory: defaultWorkingDirectory },
      responseChannel: "external",
    };
  }
  let input;
  try {
    input = JSON.parse(UTF8_DECODER.decode(bytes));
  } catch {
    throw new Error("T3 Thread activation is invalid.");
  }
  if (!isRecord(input) || input.contractVersion !== 1) {
    throw new Error("T3 Thread activation is invalid.");
  }
  if (Object.hasOwn(input, "launchId")) {
    if (
      !hasExactKeys(input, ["contractVersion", "launchId"], ["draft", "workingDirectory"]) ||
      (Object.hasOwn(input, "workingDirectory") && !isWorkingDirectory(input.workingDirectory)) ||
      !INTERNAL_LAUNCH_ID_PATTERN.test(input.launchId) ||
      (Object.hasOwn(input, "draft") &&
        (!fitsUtf8(input.draft, MAX_DRAFT_BYTES) || input.draft.includes("\0")))
    ) {
      throw new Error("T3 Thread activation is invalid.");
    }
    return { activation: input, responseChannel: "desktop" };
  }

  if (
    !hasExactKeys(
      input,
      ["contractVersion", "intentId", "source", "action", "draft"],
      ["workingDirectory", "crash"],
    ) ||
    !EXTERNAL_INTENT_ID_PATTERN.test(input.intentId) ||
    (input.source !== "direct-launch" && input.source !== "crash-notification") ||
    input.action !== "draft" ||
    (Object.hasOwn(input, "workingDirectory") && !isWorkingDirectory(input.workingDirectory)) ||
    !isRecord(input.draft) ||
    !hasExactKeys(input.draft, ["text"]) ||
    !fitsUtf8(input.draft.text, MAX_DRAFT_BYTES) ||
    input.draft.text.length === 0 ||
    input.draft.text.includes("\0") ||
    (input.source === "crash-notification" &&
      (!Object.hasOwn(input, "crash") ||
        typeof expectedUserId !== "number" ||
        !validateCrash(input.crash, expectedUserId))) ||
    (input.source === "direct-launch" && Object.hasOwn(input, "crash"))
  ) {
    throw new Error("T3 Thread external draft intent is invalid.");
  }
  const workingDirectory = input.workingDirectory ?? defaultWorkingDirectory;
  if (!isWorkingDirectory(workingDirectory)) {
    throw new Error("T3 Thread default working directory is invalid.");
  }
  return {
    activation: {
      contractVersion: 1,
      launchId: externalIntentLaunchId(input.intentId),
      draft: input.draft.text,
      workingDirectory,
    },
    responseChannel: "external",
  };
}

function parseReadyAck(bytes, launchId) {
  const line = bytes.toString("utf8");
  if (!line.endsWith("\n") || line.indexOf("\n") !== line.length - 1) {
    throw new Error("T3 Thread readiness acknowledgement is not one JSON line.");
  }
  const ack = JSON.parse(line);
  if (
    ack === null ||
    typeof ack !== "object" ||
    Object.keys(ack).sort().join(",") !== "contractVersion,launchId,ready" ||
    ack.contractVersion !== 1 ||
    ack.launchId !== launchId ||
    ack.ready !== true
  ) {
    throw new Error("T3 Thread readiness acknowledgement is invalid.");
  }
  return bytes;
}

export async function launchThread(input) {
  startupMark(input, "launcher.started");
  const receivedBytes = await readInput(input.activationInput);
  startupMark(input, "launcher.activation-read");
  const parsed = parseLauncherActivation(
    receivedBytes,
    input.expectedUserId,
    input.createLaunchId ?? NodeCrypto.randomUUID,
    input.defaultWorkingDirectory,
  );
  const activationBytes = Buffer.from(JSON.stringify(parsed.activation));
  startupMark(input, "launcher.spawn-started");
  const launched = await input.spawnApp(input.appImagePath);
  startupMark(input, "launcher.child-spawned");
  const child = launched.child;
  const ready = launched.ready;
  if (!child.stdin || !ready) {
    child.kill();
    throw new Error("T3 Thread launcher did not create its inherited channels.");
  }

  let readyBytes = Buffer.alloc(0);
  let childExited = false;
  const completion = new Promise((_resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      childExited = true;
      reject(
        new Error(`T3 Thread exited before readiness with ${signal ?? `exit ${String(code)}`}.`),
      );
    });
  });
  const acknowledgement = new Promise((resolve, reject) => {
    let settled = false;
    ready.on("data", (chunk) => {
      readyBytes = Buffer.concat([readyBytes, Buffer.from(chunk)]);
      if (settled || !readyBytes.includes(0x0a)) return;
      try {
        settled = true;
        resolve(parseReadyAck(readyBytes, parsed.activation.launchId));
      } catch (cause) {
        settled = true;
        reject(cause);
      }
    });
    ready.once("error", reject);
    ready.once("end", () => {
      if (settled) return;
      try {
        resolve(parseReadyAck(readyBytes, parsed.activation.launchId));
      } catch (cause) {
        reject(cause);
      }
    });
  });

  child.stdin.end(activationBytes);
  startupMark(input, "launcher.activation-sent");
  let timeout;
  try {
    const ack = await Promise.race([
      acknowledgement,
      completion.then(() => {
        throw new Error("T3 Thread exited before readiness.");
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("T3 Thread readiness timed out.")),
          input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );
      }),
    ]);
    startupMark(input, "launcher.ack-received");
    input.writeReady(
      parsed.responseChannel === "desktop"
        ? ack
        : Buffer.from(`${JSON.stringify({ contractVersion: 1, status: "completed" })}\n`),
      parsed.responseChannel,
    );
    if (input.superviseAfterReady) {
      await new Promise((resolve, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          resolve();
          return;
        }
        child.once("error", reject);
        child.once("exit", resolve);
      });
    } else {
      child.unref();
    }
  } catch (cause) {
    if (!childExited) child.kill("SIGTERM");
    await completion.catch(() => undefined);
    throw cause;
  } finally {
    clearTimeout(timeout);
    ready.destroy();
    await launched.cleanup?.({ childExited });
  }
}

export function resolveAppImagePath(arguments_, launcherPath = NodeProcess.argv[1]) {
  if (arguments_.length > 1) throw new Error("Usage: t3-thread-launcher.mjs [AppImage].");
  return NodePath.resolve(
    arguments_[0] ?? NodePath.join(NodePath.dirname(launcherPath), "T3-Thread.AppImage"),
  );
}

export function allocateThreadRuntimeDirectory(environment = NodeProcess.env, fileSystem = NodeFS) {
  const configuredRuntimeDirectory = environment.XDG_RUNTIME_DIR?.trim();
  if (!configuredRuntimeDirectory || !NodePath.isAbsolute(configuredRuntimeDirectory)) {
    throw new Error("T3 Thread requires an absolute XDG runtime directory.");
  }
  const runtimeDirectory = NodePath.resolve(configuredRuntimeDirectory);
  const physicalRuntimeDirectory = fileSystem.realpathSync(runtimeDirectory);
  const initialRuntimeStat = fileSystem.lstatSync(runtimeDirectory);
  const expectedUserId = NodeProcess.getuid?.();
  if (
    physicalRuntimeDirectory !== runtimeDirectory ||
    !initialRuntimeStat.isDirectory() ||
    initialRuntimeStat.isSymbolicLink() ||
    (initialRuntimeStat.mode & 0o077) !== 0 ||
    (typeof expectedUserId === "number" && initialRuntimeStat.uid !== expectedUserId)
  ) {
    throw new Error("T3 Thread XDG runtime directory is unsafe.");
  }
  const temporaryDirectory = fileSystem.mkdtempSync(
    NodePath.join(runtimeDirectory, THREAD_RUNTIME_PREFIX),
  );
  const temporaryStat = fileSystem.lstatSync(temporaryDirectory);
  const finalRuntimeStat = fileSystem.lstatSync(runtimeDirectory);
  if (
    !temporaryStat.isDirectory() ||
    temporaryStat.isSymbolicLink() ||
    (temporaryStat.mode & 0o077) !== 0 ||
    (typeof expectedUserId === "number" && temporaryStat.uid !== expectedUserId) ||
    initialRuntimeStat.dev !== finalRuntimeStat.dev ||
    initialRuntimeStat.ino !== finalRuntimeStat.ino ||
    NodePath.dirname(fileSystem.realpathSync(temporaryDirectory)) !== physicalRuntimeDirectory
  ) {
    throw new Error("T3 Thread temporary directory is unsafe.");
  }
  return temporaryDirectory;
}

export async function spawnAppImage(appImagePath, dependencies = {}) {
  const environment = dependencies.environment ?? NodeProcess.env;
  const temporaryDirectory = allocateThreadRuntimeDirectory(
    environment,
    dependencies.fileSystem ?? NodeFS,
  );
  const fileSystem = dependencies.fileSystem ?? NodeFS;
  const cleanup = ({ childExited = false } = {}) => {
    try {
      if (childExited) fileSystem.rmSync(temporaryDirectory, { recursive: true, force: true });
      else fileSystem.rmdirSync(temporaryDirectory);
    } catch (cause) {
      if (
        cause &&
        typeof cause === "object" &&
        (cause.code === "ENOENT" || cause.code === "ENOTEMPTY" || cause.code === "EEXIST")
      ) {
        return;
      }
      throw cause;
    }
  };
  const spawn = dependencies.spawn ?? NodeChildProcess.spawn;
  const startupTraceEnabled = environment.T3_THREAD_STARTUP_TRACE === "1";
  try {
    const executable = await (dependencies.prepareRelease ?? prepareThreadRelease)(appImagePath);
    startupMark(dependencies, "launcher.release-verified");
    const childEnvironment = { ...environment };
    delete childEnvironment.APPIMAGE_EXTRACT_AND_RUN;
    delete childEnvironment.APPIMAGE;
    delete childEnvironment.APPDIR;
    const child = spawn(executable, [], {
      env: {
        ...childEnvironment,
        T3_THREAD_STDOUT_READY: "1",
        TMPDIR: temporaryDirectory,
      },
      stdio: startupTraceEnabled
        ? ["pipe", "ignore", "ignore", "pipe", "pipe"]
        : ["pipe", "ignore", "ignore", "pipe"],
    });
    return {
      child,
      ready: child.stdio[3],
      trace: startupTraceEnabled ? child.stdio[4] : undefined,
      temporaryDirectory,
      cleanup,
    };
  } catch (cause) {
    cleanup();
    throw cause;
  }
}

async function main() {
  if (NodeProcess.argv[2] === "--prepare") {
    await prepareThreadRelease(resolveAppImagePath(NodeProcess.argv.slice(3)));
    return;
  }
  await launchThread({
    activationInput: NodeProcess.stdin,
    appImagePath: resolveAppImagePath(NodeProcess.argv.slice(2)),
    defaultWorkingDirectory: NodeProcess.env.T3_THREAD_WORKING_DIRECTORY ?? NodeOS.homedir(),
    spawnApp: spawnAppImage,
    // Only writable runtime data belongs to this process; release code survives it.
    superviseAfterReady: true,
    writeReady: (bytes, channel) => {
      if (channel === "desktop") NodeFS.writeSync(3, bytes);
      else NodeProcess.stdout.write(bytes);
    },
  });
}

if (
  NodePath.resolve(NodeProcess.argv[1] ?? "") ===
  NodePath.resolve(new URL(import.meta.url).pathname)
) {
  main().catch((cause) => {
    NodeProcess.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  });
}
