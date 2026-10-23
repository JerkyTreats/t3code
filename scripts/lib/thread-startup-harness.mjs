import * as NodeCrypto from "node:crypto";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeStream from "node:stream";
import * as NodeUtil from "node:util";

import { launchThread, spawnAppImage } from "../thread-launcher.mjs";

export const THREAD_STARTUP_HARNESS_CONTRACT_VERSION = 1;
export const THREAD_STARTUP_TARGET_MARK = "renderer.composer-inputable";
export const THREAD_STARTUP_ISOLATED_TARGET_MARK = "renderer.composer-prepared";

export const THREAD_STARTUP_MILESTONES = [
  "harness.started",
  "launcher.started",
  "launcher.activation-read",
  "launcher.spawn-started",
  "launcher.release-verified",
  "launcher.child-spawned",
  "electron.module-evaluated",
  "electron.activation-read",
  "electron.ready",
  "electron.window-created",
  "electron.load-started",
  "renderer.preload-evaluated",
  "renderer.dom-content-loaded",
  "electron.dom-ready",
  "electron.load-finished",
  "electron.activation-sent",
  "renderer.activation-received",
  "renderer.composer-mounted",
  "renderer.composer-editable",
  "renderer.composer-enabled",
  THREAD_STARTUP_ISOLATED_TARGET_MARK,
  "renderer.composer-visible",
  THREAD_STARTUP_TARGET_MARK,
];

const knownMilestones = new Set([
  ...THREAD_STARTUP_MILESTONES,
  "electron.ready-to-show",
  "electron.launcher-acknowledged",
  "electron.renderer-gone",
  "electron.startup-failed",
  "electron.window-closed",
  "launcher.activation-sent",
  "launcher.ack-received",
  "renderer.window-focused",
  "renderer.activation-completed",
]);

const sources = new Set(["electron", "harness", "launcher", "renderer"]);
const graphicalEnvironmentKeys = new Set([
  "DBUS_SESSION_BUS_ADDRESS",
  "DISPLAY",
  "ELECTRON_OZONE_PLATFORM_HINT",
  "HYPRLAND_INSTANCE_SIGNATURE",
  "OZONE_PLATFORM",
  "WAYLAND_DISPLAY",
  "XAUTHORITY",
  "XDG_RUNTIME_DIR",
  "XDG_SESSION_TYPE",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nowMilliseconds() {
  return performance.timeOrigin + performance.now();
}

export function parseGraphicalEnvironment(text) {
  const values = {};
  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (graphicalEnvironmentKeys.has(key) && value && !value.includes("\0")) values[key] = value;
  }
  return values;
}

async function graphicalEnvironment(environment, execFile) {
  if (environment.WAYLAND_DISPLAY || environment.DISPLAY) return environment;
  const { stdout } = await execFile("systemctl", ["--user", "show-environment"], {
    timeout: 5_000,
  });
  const resolved = { ...environment, ...parseGraphicalEnvironment(stdout) };
  if (!resolved.WAYLAND_DISPLAY && !resolved.DISPLAY) {
    throw new Error("T3 Thread startup harness requires a graphical desktop session.");
  }
  return resolved;
}

export function validateStartupEvent(value) {
  if (
    !isRecord(value) ||
    Object.keys(value).toSorted().join("\0") !==
      ["atMs", "contractVersion", "name", "source"].toSorted().join("\0") ||
    value.contractVersion !== THREAD_STARTUP_HARNESS_CONTRACT_VERSION ||
    !sources.has(value.source) ||
    !knownMilestones.has(value.name) ||
    !Number.isFinite(value.atMs) ||
    value.atMs <= 0
  ) {
    throw new Error("thread-startup-trace-invalid");
  }
  return { ...value };
}

export function createStartupTraceParser(onEvent) {
  let buffered = "";
  let totalBytes = 0;
  return {
    push(chunk) {
      const text = Buffer.from(chunk).toString("utf8");
      totalBytes += Buffer.byteLength(text);
      if (totalBytes > 256 * 1024) throw new Error("thread-startup-trace-oversized");
      buffered += text;
      if (buffered.length > 16 * 1024 && !buffered.includes("\n")) {
        throw new Error("thread-startup-trace-line-oversized");
      }
      while (true) {
        const newline = buffered.indexOf("\n");
        if (newline < 0) return;
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        if (line.length === 0 || line.length > 16 * 1024) {
          throw new Error("thread-startup-trace-line-invalid");
        }
        onEvent(validateStartupEvent(JSON.parse(line)));
      }
    },
    finish() {
      if (buffered.length !== 0) throw new Error("thread-startup-trace-incomplete");
    },
  };
}

function distribution(values) {
  if (values.length === 0) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const percentile = (value) => sorted[Math.ceil((value / 100) * sorted.length) - 1];
  return {
    samples: sorted.length,
    minMs: Math.round(sorted[0]),
    p50Ms: Math.round(percentile(50)),
    p95Ms: Math.round(percentile(95)),
    maxMs: Math.round(sorted.at(-1)),
  };
}

export function summarizeStartupRuns(
  runs,
  targetMark = THREAD_STARTUP_TARGET_MARK,
  milestoneSequence = THREAD_STARTUP_MILESTONES,
) {
  const successful = runs.filter((run) => run.success);
  const elapsedFor = (run, name) => {
    const start = run.events.find((event) => event.name === "harness.started");
    const event = run.events.find((candidate) => candidate.name === name);
    return start && event ? Math.max(0, event.atMs - start.atMs) : null;
  };
  const milestones = Object.fromEntries(
    [...knownMilestones]
      .map((name) => [
        name,
        distribution(
          successful.map((run) => elapsedFor(run, name)).filter((value) => value !== null),
        ),
      ])
      .filter(([, value]) => value !== null),
  );
  const segments = [];
  for (let index = 1; index < milestoneSequence.length; index += 1) {
    const from = milestoneSequence[index - 1];
    const to = milestoneSequence[index];
    const values = successful
      .map((run) => {
        const left = run.events.find((event) => event.name === from);
        const right = run.events.find((event) => event.name === to);
        if (!left || !right || right.atMs < left.atMs) return null;
        return right.atMs - left.atMs;
      })
      .filter((value) => value !== null);
    const stats = distribution(values);
    if (stats) segments.push({ from, to, ...stats });
  }
  segments.sort((left, right) => right.p50Ms - left.p50Ms);
  return {
    contractVersion: THREAD_STARTUP_HARNESS_CONTRACT_VERSION,
    target: targetMark,
    requestedRuns: runs.length,
    successfulRuns: successful.length,
    failedRuns: runs.length - successful.length,
    total: milestones[targetMark] ?? null,
    milestones,
    segments,
  };
}

function integerOption(value, name, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

export function parseThreadStartupHarnessArguments(arguments_) {
  const parsed = { runs: 5, timeoutMs: 15_000, channel: "production" };
  const flags = new Map([
    ["--artifact", "artifactPath"],
    ["--channel", "channel"],
    ["--output-dir", "outputDirectory"],
    ["--runs", "runs"],
    ["--server-url", "serverUrl"],
    ["--timeout-ms", "timeoutMs"],
    ["--working-directory", "workingDirectory"],
    ["--workspace", "workspace"],
  ]);
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = flags.get(arguments_[index]);
    const value = arguments_[index + 1];
    if (!key || value === undefined)
      throw new Error("T3 Thread startup harness arguments are invalid.");
    parsed[key] = value;
  }
  parsed.runs = integerOption(parsed.runs, "Runs", 1, 50);
  parsed.timeoutMs = integerOption(parsed.timeoutMs, "Timeout", 1_000, 120_000);
  if (parsed.workspace !== undefined) {
    parsed.workspace = integerOption(parsed.workspace, "Workspace", 1, 99);
  }
  if (parsed.channel !== "production" && parsed.channel !== "staging") {
    throw new Error("Channel must be production or staging.");
  }
  if ((parsed.artifactPath === undefined) !== (parsed.serverUrl === undefined)) {
    throw new Error("Artifact and server URL must be supplied together.");
  }
  return parsed;
}

export function startupDesktopActionArguments(action, target) {
  const address = target.address;
  const workspace = target.workspace;
  if (address !== undefined && !/^0x[0-9a-f]+$/u.test(address)) {
    throw new Error("thread-startup-workspace-isolation-failed");
  }
  if (workspace !== undefined && (!Number.isSafeInteger(workspace) || workspace < 1)) {
    throw new Error("thread-startup-workspace-isolation-failed");
  }
  if (action === "move" && address && workspace) {
    return [
      "dispatch",
      `hl.dsp.window.move({workspace="${workspace}",window="address:${address}",follow=false})`,
    ];
  }
  if (action === "focus" && address) {
    return ["dispatch", `hl.dsp.focus({window="address:${address}"})`];
  }
  if (action === "workspace" && workspace) {
    return ["dispatch", `hl.dsp.focus({workspace="${workspace}"})`];
  }
  throw new Error("thread-startup-workspace-isolation-failed");
}

async function hyprctl(environment, execFile, arguments_) {
  const signature = environment.HYPRLAND_INSTANCE_SIGNATURE;
  if (!signature) throw new Error("thread-startup-workspace-isolation-unavailable");
  const { stdout } = await execFile("/usr/bin/hyprctl", ["--instance", signature, ...arguments_], {
    env: environment,
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

async function snapshotDesktop(environment, execFile) {
  const [workspace, activeWindow] = await Promise.all([
    hyprctl(environment, execFile, ["activeworkspace", "-j"]),
    hyprctl(environment, execFile, ["activewindow", "-j"]),
  ]);
  const parsedWorkspace = JSON.parse(workspace);
  const parsedActiveWindow = JSON.parse(activeWindow);
  if (!Number.isSafeInteger(parsedWorkspace.id) || parsedWorkspace.id < 1) {
    throw new Error("thread-startup-workspace-isolation-failed");
  }
  return {
    workspace: parsedWorkspace.id,
    activeAddress:
      typeof parsedActiveWindow.address === "string" &&
      /^0x[0-9a-f]+$/u.test(parsedActiveWindow.address)
        ? parsedActiveWindow.address
        : null,
  };
}

async function clients(environment, execFile) {
  const value = JSON.parse(await hyprctl(environment, execFile, ["clients", "-j"]));
  if (!Array.isArray(value)) throw new Error("thread-startup-workspace-isolation-failed");
  return value;
}

async function untilDesktop(predicate, timeoutMs) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("thread-startup-workspace-isolation-failed");
}

async function restoreDesktop(environment, execFile, initial) {
  await hyprctl(
    environment,
    execFile,
    startupDesktopActionArguments("workspace", { workspace: initial.workspace }),
  );
  if (
    initial.activeAddress &&
    (await clients(environment, execFile)).some(
      (client) => client.address === initial.activeAddress,
    )
  ) {
    await hyprctl(
      environment,
      execFile,
      startupDesktopActionArguments("focus", { address: initial.activeAddress }),
    );
  }
}

function parentProcessId(stat) {
  const commandEnd = stat.lastIndexOf(")");
  if (commandEnd < 2) return null;
  const fields = stat
    .slice(commandEnd + 1)
    .trim()
    .split(/\s+/u);
  const parent = Number(fields[1]);
  return Number.isSafeInteger(parent) && parent > 0 ? parent : null;
}

export function processBelongsToStartupLaunch(
  candidatePid,
  launchPid,
  readStat = (pid) => NodeFS.readFileSync(`/proc/${pid}/stat`, "utf8"),
) {
  if (!Number.isSafeInteger(candidatePid) || !Number.isSafeInteger(launchPid)) return false;
  let current = candidatePid;
  for (let depth = 0; depth < 128 && current > 1; depth += 1) {
    if (current === launchPid) return true;
    try {
      const parent = parentProcessId(readStat(current));
      if (parent === null || parent === current) return false;
      current = parent;
    } catch {
      return false;
    }
  }
  return false;
}

async function isolateWindow(environment, execFile, childPid, channel, workspace, initial) {
  const expectedClass = channel === "staging" ? "t3-thread-staging" : "t3-thread";
  const window = await untilDesktop(async () => {
    const matching = (await clients(environment, execFile)).filter(
      (client) =>
        client.class === expectedClass && processBelongsToStartupLaunch(client.pid, childPid),
    );
    if (matching.length > 1 || matching[0]?.xwayland === true) {
      throw new Error("thread-startup-workspace-isolation-failed");
    }
    return matching[0] ?? false;
  }, 5_000);
  if (window.workspace?.id === workspace) return;
  await hyprctl(
    environment,
    execFile,
    startupDesktopActionArguments("move", { address: window.address, workspace }),
  );
  await untilDesktop(
    async () =>
      (await clients(environment, execFile)).some(
        (client) =>
          client.address === window.address &&
          processBelongsToStartupLaunch(client.pid, childPid) &&
          client.class === expectedClass &&
          client.workspace?.id === workspace,
      ),
    5_000,
  );
  await restoreDesktop(environment, execFile, initial);
}

function exactHttpsOrigin(value) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("T3 Thread startup server URL must be one credential-free HTTPS origin.");
  }
  return url.origin;
}

async function sha256(filePath) {
  const hash = NodeCrypto.createHash("sha256");
  const stream = NodeFS.createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function installedTarget(environment) {
  const home = environment.HOME || NodeOS.homedir();
  const dataHome = environment.XDG_DATA_HOME || NodePath.join(home, ".local", "share");
  const installRoot = NodePath.join(dataHome, "t3code-thread");
  const manifest = JSON.parse(
    await NodeFSP.readFile(NodePath.join(installRoot, "install-manifest.json"), "utf8"),
  );
  if (
    !isRecord(manifest) ||
    manifest.owner !== "t3code-thread-client" ||
    !/^[0-9a-f]{64}$/u.test(manifest.contentId) ||
    !/^[0-9a-f]{64}$/u.test(manifest.artifactSha256)
  ) {
    throw new Error("Installed T3 Thread manifest is invalid.");
  }
  const current = await NodeFSP.realpath(NodePath.join(installRoot, "current"));
  const expected = NodePath.join(installRoot, "artifacts", manifest.contentId);
  if (current !== expected) throw new Error("Installed T3 Thread pointer is invalid.");
  const artifactPath = NodePath.join(current, "T3-Thread.AppImage");
  if ((await sha256(artifactPath)) !== manifest.artifactSha256) {
    throw new Error("Installed T3 Thread artifact is invalid.");
  }
  return {
    artifactPath,
    serverUrl: exactHttpsOrigin(manifest.productionServerUrl),
    targetKind: "installed",
  };
}

async function explicitTarget(options) {
  const artifactPath = await NodeFSP.realpath(NodePath.resolve(options.artifactPath));
  const status = await NodeFSP.stat(artifactPath);
  if (!status.isFile() || (status.mode & 0o111) === 0) {
    throw new Error("T3 Thread startup artifact must be executable.");
  }
  return {
    artifactPath,
    serverUrl: exactHttpsOrigin(options.serverUrl),
    targetKind: "explicit",
  };
}

async function consumeTrace(stream, record) {
  const parser = createStartupTraceParser(record);
  for await (const chunk of stream) parser.push(chunk);
  parser.finish();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function runOne(input) {
  const initialDesktop = input.workspace
    ? await snapshotDesktop(input.environment, input.execFile)
    : null;
  const events = [];
  const names = new Set();
  const target = deferred();
  const activationCompleted = deferred();
  let child;
  let traceStream;
  let traceConsumption = Promise.resolve();
  let workspaceIsolation = Promise.resolve();
  const record = (raw) => {
    const event = validateStartupEvent(raw);
    if (names.has(event.name)) return;
    names.add(event.name);
    events.push(event);
    if (
      names.has(input.targetMark) &&
      (input.workspace !== undefined || names.has("renderer.window-focused"))
    ) {
      target.resolve();
    }
    if (event.name === "renderer.activation-completed") activationCompleted.resolve();
  };
  record({
    contractVersion: 1,
    source: "harness",
    name: "harness.started",
    atMs: nowMilliseconds(),
  });
  const environment = {
    ...input.environment,
    T3_THREAD_CHANNEL: input.channel,
    T3_THREAD_SERVER_URL: input.serverUrl,
    T3_THREAD_STARTUP_TRACE: "1",
  };
  const launch = launchThread({
    activationInput: NodeStream.Readable.from([]),
    appImagePath: input.artifactPath,
    defaultWorkingDirectory: input.workingDirectory,
    markStartup: record,
    spawnApp: async (appImagePath) => {
      const launched = await spawnAppImage(appImagePath, { environment, markStartup: record });
      child = launched.child;
      if (!launched.trace) throw new Error("thread-startup-trace-unavailable");
      traceStream = launched.trace;
      traceConsumption = consumeTrace(traceStream, record);
      void traceConsumption.catch(() => undefined);
      if (input.workspace && initialDesktop) {
        workspaceIsolation = isolateWindow(
          input.environment,
          input.execFile,
          launched.child.pid,
          input.channel,
          input.workspace,
          initialDesktop,
        );
        void workspaceIsolation.catch(() => undefined);
      }
      return launched;
    },
    superviseAfterReady: true,
    timeoutMs: input.timeoutMs,
    writeReady: () => undefined,
  });
  let failure = null;
  let timer;
  try {
    await Promise.race([
      target.promise,
      launch.then(() => {
        throw new Error("thread-startup-exited-before-inputable");
      }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("thread-startup-inputable-timeout")),
          input.timeoutMs,
        );
      }),
    ]);
    await workspaceIsolation;
    await Promise.race([
      activationCompleted.promise,
      new Promise((resolve) => setTimeout(resolve, 250)),
    ]);
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : "thread-startup-failed";
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await Promise.race([
      launch.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await Promise.race([
      launch.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    const traceDrained = await Promise.race([
      traceConsumption
        .then(() => true)
        .catch((cause) => {
          const expectedTermination =
            isRecord(cause) &&
            cause.code === "ERR_STREAM_PREMATURE_CLOSE" &&
            names.has(input.targetMark);
          if (!expectedTermination) {
            failure ??= cause instanceof Error ? cause.message : "thread-startup-trace-failed";
          }
          return true;
        }),
      new Promise((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    if (!traceDrained) traceStream?.destroy();
    if (initialDesktop) {
      await restoreDesktop(input.environment, input.execFile, initialDesktop).catch(
        () => undefined,
      );
    }
  }
  events.sort((left, right) => left.atMs - right.atMs);
  return {
    success:
      failure === null &&
      names.has(input.targetMark) &&
      (input.workspace !== undefined || names.has("renderer.window-focused")),
    failure,
    workspace: input.workspace ?? null,
    events,
  };
}

export async function runThreadStartupHarness(options, dependencies = {}) {
  const execFile = dependencies.execFile ?? NodeUtil.promisify(NodeChildProcess.execFile);
  const environment = await graphicalEnvironment(dependencies.environment ?? process.env, execFile);
  const target = options.artifactPath
    ? await explicitTarget(options)
    : await installedTarget(environment);
  const workingDirectory = await NodeFSP.realpath(
    NodePath.resolve(options.workingDirectory ?? environment.HOME ?? NodeOS.homedir()),
  );
  if (!(await NodeFSP.stat(workingDirectory)).isDirectory()) {
    throw new Error("T3 Thread startup working directory is invalid.");
  }
  let outputDirectory;
  if (options.outputDirectory) {
    outputDirectory = NodePath.resolve(options.outputDirectory);
    await NodeFSP.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
    if ((await NodeFSP.readdir(outputDirectory)).length !== 0) {
      throw new Error("T3 Thread startup output directory must be empty.");
    }
  } else {
    outputDirectory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-thread-startup-"));
  }
  await NodeFSP.chmod(outputDirectory, 0o700);
  const runs = [];
  const targetMark = options.workspace
    ? THREAD_STARTUP_ISOLATED_TARGET_MARK
    : THREAD_STARTUP_TARGET_MARK;
  const milestoneSequence = options.workspace
    ? THREAD_STARTUP_MILESTONES.slice(
        0,
        THREAD_STARTUP_MILESTONES.indexOf(THREAD_STARTUP_ISOLATED_TARGET_MARK) + 1,
      )
    : THREAD_STARTUP_MILESTONES;
  for (let index = 0; index < options.runs; index += 1) {
    const run = await runOne({
      ...target,
      environment,
      channel: options.channel,
      timeoutMs: options.timeoutMs,
      workingDirectory,
      workspace: options.workspace,
      execFile,
      targetMark,
    });
    runs.push(run);
    await NodeFSP.writeFile(
      NodePath.join(outputDirectory, `run-${String(index + 1).padStart(2, "0")}.json`),
      `${JSON.stringify({ contractVersion: 1, run: index + 1, ...run }, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
  }
  const summary = {
    ...summarizeStartupRuns(runs, targetMark, milestoneSequence),
    channel: options.channel,
    targetKind: target.targetKind,
    workspace: options.workspace ?? null,
  };
  await NodeFSP.writeFile(
    NodePath.join(outputDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    { mode: 0o600, flag: "wx" },
  );
  return { outputDirectory, summary };
}
