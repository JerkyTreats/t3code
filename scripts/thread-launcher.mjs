#!/usr/bin/env node
import * as NodeFS from "node:fs";
import * as NodeCrypto from "node:crypto";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeChildProcess from "node:child_process";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ACTIVATION_BYTES = 65_536;
const MAX_DRAFT_BYTES = 32 * 1024;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const INTERNAL_LAUNCH_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EXTERNAL_INTENT_ID_PATTERN = /^[0-9a-f]{32}$/u;
const APPIMAGE_RUNTIME_PREFIX = "t3code-thread-appimage-";

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
) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength > MAX_ACTIVATION_BYTES) {
    throw new Error("T3 Thread activation is oversized.");
  }
  if (bytes.byteLength === 0) {
    const launchId = createLaunchId();
    if (!INTERNAL_LAUNCH_ID_PATTERN.test(launchId)) {
      throw new Error("T3 Thread fresh launch identity is invalid.");
    }
    return {
      activation: { contractVersion: 1, launchId },
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
      !hasExactKeys(input, ["contractVersion", "launchId"], ["draft"]) ||
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
    (Object.hasOwn(input, "workingDirectory") &&
      (!fitsUtf8(input.workingDirectory, 4096) || !NodePath.isAbsolute(input.workingDirectory))) ||
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
  return {
    activation: {
      contractVersion: 1,
      launchId: externalIntentLaunchId(input.intentId),
      draft: input.draft.text,
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
  const receivedBytes = await readInput(input.activationInput);
  const parsed = parseLauncherActivation(
    receivedBytes,
    input.expectedUserId,
    input.createLaunchId ?? NodeCrypto.randomUUID,
  );
  const activationBytes = Buffer.from(JSON.stringify(parsed.activation));
  const launched = await input.spawnApp(input.appImagePath);
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

export function allocateAppImageTempDirectory(environment = NodeProcess.env, fileSystem = NodeFS) {
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
    NodePath.join(runtimeDirectory, APPIMAGE_RUNTIME_PREFIX),
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
    throw new Error("T3 Thread AppImage temporary directory is unsafe.");
  }
  return temporaryDirectory;
}

export async function spawnAppImage(appImagePath, dependencies = {}) {
  const environment = dependencies.environment ?? NodeProcess.env;
  const temporaryDirectory = allocateAppImageTempDirectory(
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
  try {
    const child = spawn(appImagePath, [], {
      env: {
        ...environment,
        APPIMAGE_EXTRACT_AND_RUN: "1",
        T3_THREAD_STDOUT_READY: "1",
        TMPDIR: temporaryDirectory,
      },
      stdio: ["pipe", "ignore", "ignore", "pipe"],
    });
    return { child, ready: child.stdio[3], temporaryDirectory, cleanup };
  } catch (cause) {
    cleanup();
    throw cause;
  }
}

async function main() {
  await launchThread({
    activationInput: NodeProcess.stdin,
    appImagePath: resolveAppImagePath(NodeProcess.argv.slice(2)),
    spawnApp: spawnAppImage,
    // The wrapper owns the private extraction root for exactly the app lifetime.
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
