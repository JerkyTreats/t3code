import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodeNet from "node:net";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeSqlite from "node:sqlite";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import * as NodeModule from "node:module";

import { readAndVerifyLinuxThreadReleaseDescriptor } from "../linux-thread-release-artifact.mjs";
import { readPairingCredential, verifyPrivateDirectory } from "./staging-thread-harness-config.mjs";
import {
  createMetricTimeline,
  sanitizeFailure,
  sha256Text,
  writeEvidence,
} from "./staging-thread-harness-evidence.mjs";
import {
  assertProtectedProcesses,
  identityIsAlive,
  processBelongsToLaunch,
  readProcessIdentity,
  selectOwnedProcessIdentities,
  signalExactCapturedProcess,
  signalExactOwnedProcess,
} from "./staging-thread-harness-process.mjs";

const execFile = NodeUtil.promisify(NodeChildProcess.execFile);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function withDeadline(operation, timeoutMs, failure = "cleanup-deadline-exceeded") {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(failure)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function assertDesktopUnlocked(run = execFile) {
  let stdout;
  try {
    ({ stdout } = await run("/usr/share/omarchy/bin/omarchy-shell", ["lock", "isLocked"], {
      timeout: 5_000,
      maxBuffer: 1024,
    }));
  } catch {
    throw new Error("desktop-lock-state-unavailable");
  }
  if (stdout.trim() === "true") throw new Error("desktop-locked");
  if (stdout.trim() !== "false") throw new Error("desktop-lock-state-unavailable");
}

export function observeCodeDraft(probe, text) {
  if (typeof text !== "string") throw new Error("core-code-draft-unobserved");
  const fingerprint = sha256Text(text);
  if (probe.composerFingerprint === undefined) probe.composerFingerprint = fingerprint;
  else if (probe.composerFingerprint !== fingerprint) throw new Error("core-code-not-usable");
  probe.composerObservations = (probe.composerObservations ?? 0) + 1;
}

async function until(operation, failure, timeoutMs = 30_000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const value = await operation();
    if (value) return value;
    await delay(100);
  }
  throw new Error(failure);
}

async function reserveLoopbackPort() {
  const server = NodeNet.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("cdp-unavailable");
  let released = false;
  return {
    port: address.port,
    async release() {
      if (released) return;
      released = true;
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

async function hyprctl(config, arguments_) {
  const { stdout } = await execFile(
    "/usr/bin/hyprctl",
    ["--instance", NodeProcess.env.HYPRLAND_INSTANCE_SIGNATURE, ...arguments_],
    {
      env: NodeProcess.env,
      timeout: 5_000,
      maxBuffer: 1024 * 1024,
    },
  );
  return stdout;
}

async function snapshotDesktop(config) {
  const [workspace, active] = await Promise.all([
    hyprctl(config, ["activeworkspace", "-j"]),
    hyprctl(config, ["activewindow", "-j"]),
  ]);
  const parsedWorkspace = JSON.parse(workspace);
  const parsedActive = JSON.parse(active);
  return {
    workspace: parsedWorkspace.id,
    activeAddress: typeof parsedActive.address === "string" ? parsedActive.address : null,
  };
}

async function findOwnedWindow(config, identity, observe = () => undefined) {
  return until(
    async () => {
      const clients = JSON.parse(await hyprctl(config, ["clients", "-j"]));
      const owned = clients.filter((client) => client.pid === identity.pid);
      observe(owned.map((client) => client.class));
      const matching = owned.filter((client) => client.class === config.hyprland.threadClass);
      if (matching.length > 1) throw new Error("window-identity-mismatch");
      if (matching[0]?.xwayland === true) throw new Error("native-focus-failed");
      return matching[0] ?? false;
    },
    "window-identity-mismatch",
    config.thresholds.windowMs,
  );
}

export function desktopActionArguments(action, target) {
  const address = target.address;
  const workspace = target.workspace;
  if (address !== undefined && !/^0x[0-9a-f]+$/u.test(address))
    throw new Error("native-focus-failed");
  if (workspace !== undefined && (!Number.isSafeInteger(workspace) || workspace < 1))
    throw new Error("native-focus-failed");
  if (action === "move" && address && workspace)
    return [
      "dispatch",
      `hl.dsp.window.move({workspace="${workspace}",window="address:${address}",follow=false})`,
    ];
  if (action === "focus" && address)
    return ["dispatch", `hl.dsp.focus({window="address:${address}"})`];
  if (action === "workspace" && workspace)
    return ["dispatch", `hl.dsp.focus({workspace="${workspace}"})`];
  throw new Error("native-focus-failed");
}

async function moveOwnedWindow(config, item, workspace) {
  await assertDesktopUnlocked();
  const current = JSON.parse(await hyprctl(config, ["clients", "-j"]));
  const matching = current.filter(
    (client) =>
      client.address === item.window.address &&
      client.pid === item.mainIdentity.pid &&
      client.class === config.hyprland.threadClass,
  );
  if (matching.length !== 1) throw new Error("window-identity-mismatch");
  await hyprctl(
    config,
    desktopActionArguments("move", { workspace, address: item.window.address }),
  );
  await until(
    async () => {
      const clients = JSON.parse(await hyprctl(config, ["clients", "-j"]));
      return clients.some(
        (client) =>
          client.address === item.window.address &&
          client.pid === item.mainIdentity.pid &&
          client.workspace?.id === workspace,
      );
    },
    "window-identity-mismatch",
    5_000,
  );
}

async function restoreDesktop(config, initial) {
  try {
    await assertDesktopUnlocked();
    await hyprctl(config, desktopActionArguments("workspace", { workspace: initial.workspace }));
    const clients = JSON.parse(await hyprctl(config, ["clients", "-j"]));
    const activeStillExists =
      initial.activeAddress && clients.some((client) => client.address === initial.activeAddress);
    if (activeStillExists)
      await hyprctl(config, desktopActionArguments("focus", { address: initial.activeAddress }));
    const restored = await snapshotDesktop(config);
    return (
      restored.workspace === initial.workspace &&
      (!activeStillExists || restored.activeAddress === initial.activeAddress)
    );
  } catch {
    return false;
  }
}

export function readinessIdentity(filePath) {
  const value = JSON.parse(NodeFS.readFileSync(filePath, "utf8"));
  const keys = [
    "artifactSha256",
    "bootId",
    "commitHash",
    "desktopMainPid",
    "desktopMainProcessStartTicks",
    "generation",
    "productAppId",
    "version",
  ];
  const identity = Object.fromEntries(keys.map((key) => [key, value[key]]));
  if (
    !Number.isInteger(identity.desktopMainPid) ||
    !Number.isSafeInteger(identity.desktopMainProcessStartTicks) ||
    identity.desktopMainProcessStartTicks < 1
  )
    throw new Error("protected-process-changed");
  if (
    !identityIsAlive({
      pid: identity.desktopMainPid,
      startTicks: String(identity.desktopMainProcessStartTicks),
    })
  )
    throw new Error("protected-process-changed");
  return identity;
}

async function serviceSnapshot(names) {
  return Promise.all(
    names.map(async (name) => {
      const { stdout } = await execFile(
        "systemctl",
        [
          "--user",
          "show",
          name,
          "--property=LoadState",
          "--property=ActiveState",
          "--property=SubState",
          "--property=MainPID",
          "--no-pager",
        ],
        { timeout: 5_000 },
      );
      const values = Object.fromEntries(
        stdout
          .trim()
          .split("\n")
          .map((line) => line.split(/=(.*)/su).slice(0, 2)),
      );
      const mainPid = Number(values.MainPID);
      const main = mainPid > 1 ? readProcessIdentity(mainPid) : null;
      return {
        name,
        loadState: values.LoadState,
        activeState: values.ActiveState,
        subState: values.SubState,
        main,
      };
    }),
  );
}

async function protectedSnapshot(config) {
  assertProtectedProcesses(config.protectedProcesses);
  return {
    codeReadiness: readinessIdentity(config.codeReadinessPath),
    services: await serviceSnapshot(config.protectedServices),
  };
}

function sameProtectedSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function serverProbe(config) {
  try {
    const response = await fetch(new URL("/.well-known/t3/environment", config.stagingOrigin), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    const exact =
      response.url === new URL("/.well-known/t3/environment", config.stagingOrigin).href;
    await response.body?.cancel();
    if (response.status !== 200 || response.redirected || !exact)
      throw new Error("server-probe-failed");
  } catch {
    throw new Error("server-probe-failed");
  }
}

export function noSendSnapshot(databasePath) {
  let database;
  try {
    database = new NodeSqlite.DatabaseSync(databasePath, { readOnly: true });
    const turns = database.prepare("SELECT count(*) AS count FROM projection_turns").get();
    const events = database
      .prepare(
        "SELECT count(*) AS count, coalesce(max(sequence), 0) AS highWater FROM orchestration_events WHERE event_type IN ('thread.turn-start-requested', 'thread.message-sent')",
      )
      .get();
    if (
      !Number.isSafeInteger(turns.count) ||
      !Number.isSafeInteger(events.count) ||
      !Number.isSafeInteger(events.highWater)
    )
      throw new Error("database-observation-failed");
    return {
      projectionTurns: turns.count,
      sendAdmissionEvents: events.count,
      highWater: events.highWater,
    };
  } catch {
    throw new Error("database-observation-failed");
  } finally {
    database?.close();
  }
}

function playwrightChromium() {
  const require = NodeModule.createRequire(NodePath.resolve("apps/desktop/package.json"));
  return require("playwright-core").chromium;
}

async function attachCodeProbe(config, chromium) {
  if (!config.codeCdpPort) return null;
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.codeCdpPort}`, {
    timeout: config.thresholds.windowMs,
  });
  try {
    const page = await until(
      () =>
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => candidate.url().startsWith(config.stagingOrigin)),
      "core-code-not-usable",
      config.thresholds.windowMs,
    );
    const browserSession = await browser.newBrowserCDPSession();
    const processInfo = await browserSession.send("SystemInfo.getProcessInfo");
    const browserProcess = processInfo.processInfo.find((entry) => entry.type === "browser");
    const identity = browserProcess && readProcessIdentity(browserProcess.id);
    const expected = readinessIdentity(config.codeReadinessPath);
    if (
      !identity ||
      identity.pid !== expected.desktopMainPid ||
      identity.startTicks !== String(expected.desktopMainProcessStartTicks)
    )
      throw new Error("core-code-not-usable");
    const network = await page.context().newCDPSession(page);
    let sentTurnFrames = 0;
    network.on("Network.webSocketFrameSent", (event) => {
      if (
        event.response.opcode === 1 &&
        /(?:turn\.start|thread\.start|prompt\.submit|chat\.send)/u.test(event.response.payloadData)
      )
        sentTurnFrames += 1;
    });
    await network.send("Network.enable");
    return { browser, page, identity, sentTurnFrames: () => sentTurnFrames };
  } catch (cause) {
    await browser.close().catch(() => undefined);
    throw cause;
  }
}

async function assertCodeUsable(config, probe) {
  if (!probe || !identityIsAlive(probe.identity) || probe.sentTurnFrames() !== 0)
    throw new Error("core-code-not-usable");
  const status = await probe.page.evaluate(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store", redirect: "error" });
    const authenticated = response.status === 200 && (await response.json()).authenticated === true;
    const composer = document.querySelector('[data-testid="composer-editor"]');
    const expand = [...document.querySelectorAll("button")].some(
      (button) => button.getAttribute("aria-label") === "Expand composer",
    );
    return {
      authenticated,
      composerPresent: Boolean(composer) || expand,
      composerText: composer?.innerText ?? null,
    };
  });
  if (!status.authenticated || !status.composerPresent) throw new Error("core-code-not-usable");
  observeCodeDraft(probe, status.composerText);
}

async function disconnectCodeProbe(probe) {
  if (!probe) return;
  await withDeadline(() => probe.browser.close(), 2_000);
}

async function attachToCase(config, item, chromium) {
  await until(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${item.port}/json/list`, {
          signal: AbortSignal.timeout(500),
        });
        return (await response.json()).some((target) => target.type === "page");
      } catch {
        return false;
      }
    },
    "cdp-unavailable",
    config.thresholds.windowMs,
  );
  item.browser = await chromium.connectOverCDP(`http://127.0.0.1:${item.port}`, {
    timeout: config.thresholds.windowMs,
  });
  item.page = await until(
    () =>
      item.browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((page) => page.url().startsWith(config.stagingOrigin)),
    "cdp-unavailable",
    config.thresholds.windowMs,
  );
  item.network = await item.page.context().newCDPSession(item.page);
  item.browserSession = await item.browser.newBrowserCDPSession();
  item.sentTurnFrames = 0;
  item.socket101 = 0;
  item.socketUrls = new Map();
  item.openSockets = new Set();
  item.network.on("Network.webSocketFrameSent", (event) => {
    if (
      event.response.opcode === 1 &&
      /(?:turn\.start|thread\.start|prompt\.submit|chat\.send)/u.test(event.response.payloadData)
    )
      item.sentTurnFrames += 1;
  });
  item.network.on("Network.webSocketCreated", (event) =>
    item.socketUrls.set(event.requestId, event.url),
  );
  item.network.on("Network.webSocketHandshakeResponseReceived", (event) => {
    const socketUrl = item.socketUrls.get(event.requestId);
    if (!socketUrl) return;
    const url = new URL(socketUrl);
    if (
      event.response.status === 101 &&
      url.origin === config.stagingOrigin.replace("https:", "wss:") &&
      url.pathname === "/ws"
    ) {
      item.socket101 += 1;
      item.openSockets.add(event.requestId);
    }
  });
  item.network.on("Network.webSocketClosed", (event) => item.openSockets.delete(event.requestId));
  await item.network.send("Network.enable");
  const processInfo = await item.browserSession.send("SystemInfo.getProcessInfo");
  const browserProcess = processInfo.processInfo.find((entry) => entry.type === "browser");
  const observedMainIdentity = browserProcess && readProcessIdentity(browserProcess.id);
  item.observedMainIdentity = observedMainIdentity;
  item.lastStage = "browser-ownership";
  if (!observedMainIdentity || !processBelongsToLaunch(observedMainIdentity, item.launchIdentity))
    throw new Error("window-identity-mismatch");
  item.mainIdentity = observedMainIdentity;
  item.lastStage = "compositor-window";
  item.observedWindowClasses = JSON.parse(await hyprctl(config, ["clients", "-j"]))
    .filter((client) => client.pid === item.mainIdentity.pid)
    .map((client) => client.class);
  item.window = await findOwnedWindow(config, item.mainIdentity, (classes) => {
    item.observedWindowClasses = classes;
  });
  item.timeline.mark("window");
}

async function authenticated(item, timeoutMs) {
  return until(
    async () => {
      try {
        return await item.page.evaluate(async () => {
          const response = await fetch("/api/auth/session", {
            cache: "no-store",
            redirect: "error",
          });
          if (response.status !== 200) return false;
          const body = await response.json();
          return body.authenticated === true && body.sessionMethod === "bearer-access-token";
        });
      } catch {
        return false;
      }
    },
    "primary-session-not-authenticated",
    timeoutMs,
  );
}

async function pairIfNeeded(config, item, credential) {
  const alreadyAuthenticated = await item.page
    .evaluate(async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      return response.status === 200 && (await response.json()).authenticated === true;
    })
    .catch(() => false);
  if (alreadyAuthenticated) return false;
  if (!credential) throw new Error("pairing-required");
  const input = item.page.locator("#pairing-token");
  await input.waitFor({ state: "visible", timeout: config.thresholds.connectedMs });
  await input.fill(credential);
  await item.page.getByRole("button", { name: "Continue", exact: true }).click();
  return true;
}

async function editorText(editor) {
  return editor.evaluate((element) => {
    // Chromium renders an empty contenteditable paragraph as one visual newline.
    // Preserve every nonempty draft byte, including intentional blank lines.
    return element.textContent === "" && element.innerText === "\n" ? "" : element.innerText;
  });
}

async function composerText(item, expected, timeoutMs) {
  const editor = item.page.locator('[data-testid="composer-editor"]');
  const expand = item.page.getByRole("button", { name: "Expand composer", exact: true });
  await until(
    async () => (await editor.isVisible()) || (await expand.isVisible()),
    "composer-mismatch",
    timeoutMs,
  );
  if (!(await editor.isVisible())) await expand.click();
  await editor.waitFor({ state: "visible", timeout: timeoutMs });
  await until(async () => (await editorText(editor)) === expected, "composer-mismatch", timeoutMs);
  return editor;
}

export function matchesProjectScopeObservation(observation, workingDirectory) {
  const project = observation.projects.find(
    (candidate) => candidate.workspaceRoot === workingDirectory,
  );
  if (!project || !observation.routeDraftId) return false;
  try {
    const persisted = JSON.parse(observation.persistedDrafts ?? "null");
    const draft = persisted?.state?.draftThreadsByThreadKey?.[observation.routeDraftId];
    return draft?.projectId === project.id && draft?.environmentId === project.environmentId;
  } catch {
    return false;
  }
}

async function exactProjectScope(item, workingDirectory) {
  const result = await until(
    async () => {
      const observation = await item.page.evaluate(() => {
        const root = document.querySelector("#root");
        const key =
          root && Object.keys(root).find((candidate) => candidate.startsWith("__reactContainer$"));
        const current = key && root[key]?.stateNode?.current;
        const stack = current ? [current] : [];
        const projected = [];
        const registries = new Set();
        while (stack.length) {
          const fiber = stack.pop();
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
          const props = fiber.memoizedProps;
          if (props?.value && typeof props.value.getNodes === "function")
            registries.add(props.value);
        }
        for (const registry of registries) {
          for (const node of registry.getNodes().values()) {
            if (node.atom?.label?.[0] !== "environment-project-list") continue;
            if (Array.isArray(node._value)) projected.push(...node._value);
          }
        }
        // Hosted Thread uses browser history; only the full desktop bridge selects hash history.
        const route = window.desktopBridge === undefined ? location.pathname : location.hash;
        const match = route.match(/\/draft\/([^/?#]+)/u);
        return {
          persistedDrafts: localStorage.getItem("t3code:composer-drafts:v1"),
          projects: projected,
          registryCount: registries.size,
          routeDraftId: match ? decodeURIComponent(match[1]) : null,
        };
      });
      const project = observation.projects.find(
        (candidate) => candidate.workspaceRoot === workingDirectory,
      );
      let draft;
      try {
        draft = JSON.parse(observation.persistedDrafts ?? "null")?.state?.draftThreadsByThreadKey?.[
          observation.routeDraftId
        ];
      } catch {}
      item.scopeObservation = {
        registryCount: observation.registryCount,
        projectCount: observation.projects.length,
        expectedProjectFound: Boolean(project),
        routeFound: Boolean(observation.routeDraftId),
        draftStored: Boolean(draft),
        projectMatches: Boolean(project && draft?.projectId === project.id),
        environmentMatches: Boolean(project && draft?.environmentId === project.environmentId),
      };
      return matchesProjectScopeObservation(observation, workingDirectory);
    },
    "project-scope-mismatch",
    10_000,
  );
  if (!result) throw new Error("project-scope-mismatch");
}

function profilePathForProcess(identity, profileRoot) {
  try {
    const matches = new Set();
    for (const descriptor of NodeFS.readdirSync(`/proc/${identity.pid}/fd`)) {
      try {
        const target = NodeFS.readlinkSync(`/proc/${identity.pid}/fd/${descriptor}`);
        const relative = NodePath.relative(profileRoot, target);
        if (!relative.startsWith("..") && relative !== "")
          matches.add(relative.split(NodePath.sep)[0]);
      } catch {}
    }
    return matches.size === 1 ? NodePath.join(profileRoot, [...matches][0]) : null;
  } catch {
    return null;
  }
}

function captureCurrentOwned(item) {
  for (const identity of selectOwnedProcessIdentities(item.launchIdentity))
    item.capturedOwned.set(identity.pid, identity.startTicks);
}

async function launchCase(config, adapter, entryConfig, chromium, spec) {
  const reservation = await reserveLoopbackPort();
  const item = {
    name: spec.name,
    expectedDraft: spec.prompt ?? "",
    port: reservation.port,
    workspace: spec.workspace,
    capturedOwned: new Map(),
  };
  let spawnSeenResolve;
  const spawnSeen = new Promise((resolve) => {
    spawnSeenResolve = resolve;
  });
  await reservation.release();
  const arguments_ = ["--config", config.entryConfigPath];
  if (spec.cwd) arguments_.push("--cwd", spec.cwd);
  if (spec.prompt) arguments_.push("--prompt", spec.prompt);
  item.entryPromise = adapter
    .runStagingThreadEntry(arguments_, {
      homeDirectory: config.homeWorkingDirectory,
      environment: NodeProcess.env,
      readConfig: async () => entryConfig,
      spawn: (command, argumentsForApp, options) => {
        item.timeline = createMetricTimeline();
        const child = NodeChildProcess.spawn(
          command,
          [
            ...argumentsForApp,
            `--remote-debugging-port=${item.port}`,
            "--remote-debugging-address=127.0.0.1",
            ...(config.certificateSpki
              ? [`--ignore-certificate-errors-spki-list=${config.certificateSpki}`]
              : []),
          ],
          {
            ...options,
            detached: true,
            stdio: [options.stdio?.[0] ?? "pipe", "ignore", "ignore", options.stdio?.[3] ?? "pipe"],
          },
        );
        item.child = child;
        item.launchIdentity = readProcessIdentity(child.pid);
        if (item.launchIdentity)
          item.capturedOwned.set(item.launchIdentity.pid, item.launchIdentity.startTicks);
        item.ownershipTimer = setInterval(() => captureCurrentOwned(item), 50);
        item.extractionDirectory = options.env?.TMPDIR;
        spec.register(item);
        spawnSeenResolve();
        return child;
      },
      stdout: {
        write() {
          if (!item.timeline.has("ack")) item.timeline.mark("ack");
        },
      },
    })
    .catch(() => {
      item.entryFailed = true;
    })
    .finally(() => {
      clearInterval(item.ownershipTimer);
    });
  await Promise.race([
    spawnSeen,
    delay(config.thresholds.windowMs).then(() => {
      throw new Error("cdp-unavailable");
    }),
  ]);
  if (!item.launchIdentity) throw new Error("window-identity-mismatch");
  item.lastStage = "cdp-attach";
  await attachToCase(config, item, chromium);
  await moveOwnedWindow(config, item, spec.workspace);
  return item;
}

async function countProfiles(stateDirectory) {
  try {
    return (
      await NodeFSP.readdir(NodePath.join(stateDirectory, "profiles"), { withFileTypes: true })
    ).filter((entry) => entry.isDirectory() && entry.name.startsWith("thread-")).length;
  } catch (cause) {
    if (cause?.code === "ENOENT") return 0;
    throw cause;
  }
}

async function makeUsable(config, item, credential, expectedDraft, expectedProject) {
  await pairIfNeeded(config, item, credential);
  await authenticated(item, config.thresholds.connectedMs);
  await until(() => item.timeline.has("ack"), "cdp-unavailable", config.thresholds.ackMs);
  if (item.socket101 === 0) {
    await delay(1_000);
    if (item.socket101 === 0) {
      await item.page.reload({
        waitUntil: "domcontentloaded",
        timeout: config.thresholds.connectedMs,
      });
      await authenticated(item, config.thresholds.connectedMs);
    }
  }
  await until(
    () => item.socket101 > 0,
    "primary-websocket-not-connected",
    config.thresholds.connectedMs,
  );
  item.timeline.mark("connected");
  await composerText(item, expectedDraft, config.thresholds.usableMs);
  if (expectedProject) await exactProjectScope(item, expectedProject);
  if (item.sentTurnFrames !== 0) throw new Error("no-send-frame-observed");
  item.timeline.mark("usable");
  item.profilePath = await until(
    () =>
      profilePathForProcess(item.mainIdentity, NodePath.join(config.stateDirectory, "profiles")),
    "window-identity-mismatch",
    5_000,
  );
}

async function assertThreadSurvivor(config, item) {
  if (
    !identityIsAlive(item.mainIdentity) ||
    !processBelongsToLaunch(item.mainIdentity, item.launchIdentity)
  )
    throw new Error("window-identity-mismatch");
  await authenticated(item, config.thresholds.connectedMs);
  await composerText(item, item.expectedDraft, config.thresholds.usableMs);
  if (item.openSockets.size === 0) throw new Error("primary-websocket-not-connected");
  if (item.sentTurnFrames !== 0) throw new Error("no-send-frame-observed");
}

async function nativeInput(config, target, siblings) {
  await assertDesktopUnlocked();
  const started = performance.now();
  const siblingDrafts = new Map();
  for (const sibling of siblings)
    siblingDrafts.set(
      sibling,
      await editorText(sibling.page.locator('[data-testid="composer-editor"]')),
    );
  if (
    !identityIsAlive(target.mainIdentity) ||
    !processBelongsToLaunch(target.mainIdentity, target.launchIdentity)
  )
    throw new Error("native-focus-failed");
  await hyprctl(config, desktopActionArguments("workspace", { workspace: target.workspace }));
  await hyprctl(config, desktopActionArguments("focus", { address: target.window.address }));
  await until(
    async () => {
      const active = JSON.parse(await hyprctl(config, ["activewindow", "-j"]));
      return (
        active.address === target.window.address &&
        active.pid === target.mainIdentity.pid &&
        active.class === config.hyprland.threadClass
      );
    },
    "native-focus-failed",
    5_000,
  );
  await target.page.locator('[data-testid="composer-editor"]').click();
  await target.page.locator('[data-testid="composer-editor"]').evaluate((editor) => {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
  });
  if (
    !identityIsAlive(target.mainIdentity) ||
    !processBelongsToLaunch(target.mainIdentity, target.launchIdentity) ||
    !(await target.page
      .locator('[data-testid="composer-editor"]')
      .evaluate((editor) => document.activeElement === editor))
  )
    throw new Error("native-focus-failed");
  await assertDesktopUnlocked();
  await execFile("/usr/bin/wtype", ["--", config.nativeTypeSentinel], {
    env: NodeProcess.env,
    timeout: 5_000,
  });
  await composerText(
    target,
    target.expectedDraft + config.nativeTypeSentinel,
    config.thresholds.inputMs,
  );
  for (const sibling of siblings) {
    if (
      (await editorText(sibling.page.locator('[data-testid="composer-editor"]'))) !==
      siblingDrafts.get(sibling)
    )
      throw new Error("composer-mismatch");
  }
  if ([target, ...siblings].some((item) => item.sentTurnFrames !== 0))
    throw new Error("no-send-frame-observed");
  target.operationMetrics = {
    ...target.operationMetrics,
    input: Math.round(performance.now() - started),
  };
}

async function stopCase(item, mode, timeoutMs) {
  const started = performance.now();
  captureCurrentOwned(item);
  if (!identityIsAlive(item.mainIdentity)) throw new Error("window-identity-mismatch");
  if (!processBelongsToLaunch(item.mainIdentity, item.launchIdentity))
    throw new Error("signal-target-not-owned");
  if (mode === "close")
    await withDeadline(() => item.browserSession.send("Browser.close"), timeoutMs);
  else
    signalExactOwnedProcess({
      target: item.mainIdentity,
      launch: item.launchIdentity,
      signal: "SIGKILL",
    });
  await until(() => !identityIsAlive(item.mainIdentity), "window-identity-mismatch", timeoutMs);
  item.operationMetrics = {
    ...item.operationMetrics,
    [mode]: Math.round(performance.now() - started),
  };
  item.closed = true;
}

async function cleanupCases(items) {
  for (const item of items) {
    try {
      captureCurrentOwned(item);
    } catch {}
  }
  for (const item of items.toReversed()) {
    if (
      identityIsAlive(item.mainIdentity) &&
      processBelongsToLaunch(item.mainIdentity, item.launchIdentity)
    )
      await withDeadline(() => item.browserSession?.send("Browser.close"), 2_000).catch(
        () => undefined,
      );
    else await withDeadline(() => item.browser?.close(), 2_000).catch(() => undefined);
  }
  await delay(500);
  for (const item of items.toReversed()) {
    clearInterval(item.ownershipTimer);
    for (const identity of [...item.capturedOwned]
      .map(([pid, startTicks]) => ({ pid, startTicks }))
      .filter((candidate) => candidate.pid !== item.launchIdentity?.pid)) {
      try {
        signalExactCapturedProcess({
          target: identity,
          captured: item.capturedOwned,
          signal: "SIGTERM",
        });
      } catch {}
    }
  }
  await delay(500);
  for (const item of items.toReversed()) {
    for (const identity of [...item.capturedOwned]
      .map(([pid, startTicks]) => ({ pid, startTicks }))
      .filter((candidate) => candidate.pid !== item.launchIdentity?.pid)) {
      try {
        signalExactCapturedProcess({
          target: identity,
          captured: item.capturedOwned,
          signal: "SIGKILL",
        });
      } catch {}
    }
    if (identityIsAlive(item.launchIdentity)) {
      try {
        signalExactOwnedProcess({
          target: item.launchIdentity,
          launch: item.launchIdentity,
          signal: "SIGTERM",
        });
      } catch {}
    }
  }
  await Promise.race([Promise.allSettled(items.map((item) => item.entryPromise)), delay(2_000)]);
}

function caseMetrics(item, thresholds) {
  const metrics = item.timeline.publicResult(thresholds);
  for (const [name, elapsedMs] of Object.entries(item.operationMetrics ?? {})) {
    const thresholdMs = thresholds[`${name}Ms`];
    metrics[name] = { elapsedMs, thresholdMs, withinBudget: elapsedMs <= thresholdMs };
  }
  return metrics;
}

export async function runStagingThreadHarness(config, outputDirectory) {
  NodeProcess.umask(0o077);
  const diagnostics = {
    contractVersion: 1,
    success: false,
    stage: "config",
    cases: [],
    checks: [],
  };
  const summary = {
    contractVersion: 1,
    success: false,
    stage: "config",
    caseCount: 0,
    checks: {},
    metrics: {},
    budgetBreaches: [],
  };
  const instances = [];
  let initialDesktop;
  let baseline;
  let codeProbe;
  let noSendBaseline;
  let stage = "config";
  try {
    await Promise.all([
      verifyPrivateDirectory(config.stateDirectory),
      verifyPrivateDirectory(outputDirectory),
    ]);
    if ((await NodeFSP.readdir(outputDirectory)).length !== 0)
      throw new Error("artifact-verification-failed");
    if (
      !NodeProcess.env.HYPRLAND_INSTANCE_SIGNATURE ||
      !NodeProcess.env.WAYLAND_DISPLAY ||
      !NodeProcess.env.DBUS_SESSION_BUS_ADDRESS ||
      !NodePath.isAbsolute(NodeProcess.env.XDG_RUNTIME_DIR ?? "")
    )
      throw new Error("artifact-verification-failed");
    stage = "desktop-preflight";
    await assertDesktopUnlocked();
    stage = "inputs";
    const adapter = await import(NodeURL.pathToFileURL(config.entryAdapterPath).href);
    if (
      typeof adapter.runStagingThreadEntry !== "function" ||
      typeof adapter.readStagingEntryConfig !== "function"
    )
      throw new Error("artifact-verification-failed");
    const entryConfig = await adapter.readStagingEntryConfig(config.entryConfigPath);
    for (const key of [
      "artifactPath",
      "descriptorPath",
      "launcherPath",
      "stagingOrigin",
      "stateDirectory",
    ]) {
      if (entryConfig[key] !== config[key]) throw new Error("artifact-verification-failed");
    }
    await readAndVerifyLinuxThreadReleaseDescriptor(config);
    const [
      homeStat,
      projectStat,
      homePhysical,
      projectPhysical,
      adapterStat,
      adapterPhysical,
      artifactStat,
      launcherStat,
      databaseStat,
      databasePhysical,
    ] = await Promise.all([
      NodeFSP.stat(config.homeWorkingDirectory),
      NodeFSP.stat(config.projectWorkingDirectory),
      NodeFSP.realpath(config.homeWorkingDirectory),
      NodeFSP.realpath(config.projectWorkingDirectory),
      NodeFSP.lstat(config.entryAdapterPath),
      NodeFSP.realpath(config.entryAdapterPath),
      NodeFSP.lstat(config.artifactPath),
      NodeFSP.lstat(config.launcherPath),
      NodeFSP.lstat(config.stagingDatabasePath),
      NodeFSP.realpath(config.stagingDatabasePath),
    ]);
    if (
      !homeStat.isDirectory() ||
      !projectStat.isDirectory() ||
      homePhysical !== config.homeWorkingDirectory ||
      projectPhysical !== config.projectWorkingDirectory ||
      !adapterStat.isFile() ||
      adapterStat.isSymbolicLink() ||
      adapterPhysical !== config.entryAdapterPath ||
      !artifactStat.isFile() ||
      artifactStat.isSymbolicLink() ||
      (artifactStat.mode & 0o111) === 0 ||
      !launcherStat.isFile() ||
      launcherStat.isSymbolicLink() ||
      (launcherStat.mode & 0o111) === 0 ||
      !databaseStat.isFile() ||
      databaseStat.isSymbolicLink() ||
      databasePhysical !== config.stagingDatabasePath
    )
      throw new Error("artifact-verification-failed");
    initialDesktop = await snapshotDesktop(config);
    stage = "protected-baseline";
    baseline = await protectedSnapshot(config);
    stage = "server-probe";
    await serverProbe(config);
    const chromium = playwrightChromium();
    codeProbe = await attachCodeProbe(config, chromium);
    if (codeProbe) await assertCodeUsable(config, codeProbe);
    noSendBaseline = noSendSnapshot(config.stagingDatabasePath);
    const credential = await readPairingCredential(config);
    const runDirectory = outputDirectory;
    const profileBaseline = await countProfiles(config.stateDirectory);
    stage = "fresh-launch";
    const fresh = await launchCase(config, adapter, entryConfig, chromium, {
      name: "fresh-home",
      runDirectory,
      register: (item) => instances.push(item),
      workspace: config.hyprland.defaultWorkspace,
    });
    stage = "pairing";
    await makeUsable(config, fresh, credential, "", config.homeWorkingDirectory);
    if (!sameProtectedSnapshot(baseline, await protectedSnapshot(config)))
      throw new Error("protected-service-changed");
    stage = "concurrency";
    const pending = [
      launchCase(config, adapter, entryConfig, chromium, {
        name: "crash-prefill",
        prompt: config.syntheticCrashDraft,
        runDirectory,
        register: (item) => instances.push(item),
        workspace: config.hyprland.defaultWorkspace,
      }),
      launchCase(config, adapter, entryConfig, chromium, {
        name: "project-scope",
        cwd: config.projectWorkingDirectory,
        runDirectory,
        register: (item) => instances.push(item),
        workspace: config.hyprland.projectWorkspace,
      }),
    ];
    for (let index = 3; index < config.concurrentWindows; index += 1) {
      pending.push(
        launchCase(config, adapter, entryConfig, chromium, {
          name: `rapid-fresh-${index + 1}`,
          runDirectory,
          register: (item) => instances.push(item),
          workspace: config.hyprland.defaultWorkspace,
        }),
      );
    }
    const settledLater = await Promise.allSettled(pending);
    const rejectedLaunch = settledLater.find((result) => result.status === "rejected");
    if (rejectedLaunch) throw rejectedLaunch.reason;
    const later = settledLater.map((result) => result.value);
    const crash = later[0];
    const project = later[1];
    await Promise.all([
      makeUsable(config, crash, undefined, config.syntheticCrashDraft, config.homeWorkingDirectory),
      makeUsable(config, project, undefined, "", config.projectWorkingDirectory),
      ...later
        .slice(2)
        .map((item) => makeUsable(config, item, undefined, "", config.homeWorkingDirectory)),
    ]);
    const profiles = await countProfiles(config.stateDirectory);
    if (
      new Set(instances.map((item) => item.mainIdentity.pid)).size !== instances.length ||
      new Set(instances.map((item) => item.extractionDirectory)).size !== instances.length ||
      new Set(instances.map((item) => item.profilePath)).size !== instances.length ||
      profiles - profileBaseline < instances.length
    )
      throw new Error("window-identity-mismatch");
    if (!sameProtectedSnapshot(baseline, await protectedSnapshot(config)))
      throw new Error("protected-service-changed");
    if (codeProbe) await assertCodeUsable(config, codeProbe);
    stage = "native-input";
    await nativeInput(
      config,
      crash,
      instances.filter((item) => item !== crash),
    );
    crash.expectedDraft += config.nativeTypeSentinel;
    if (!(await restoreDesktop(config, initialDesktop))) throw new Error("native-focus-failed");
    if (!sameProtectedSnapshot(baseline, await protectedSnapshot(config)))
      throw new Error("protected-service-changed");
    if (codeProbe) await assertCodeUsable(config, codeProbe);
    if (config.captureScreenshots) {
      await crash.page.screenshot({ path: NodePath.join(outputDirectory, "crash-prefill.png") });
      await NodeFSP.chmod(NodePath.join(outputDirectory, "crash-prefill.png"), 0o600);
    }
    stage = "graceful-close";
    await stopCase(fresh, "close", config.thresholds.closeMs);
    if (
      instances.filter((item) => item !== fresh).some((item) => !identityIsAlive(item.mainIdentity))
    )
      throw new Error("window-identity-mismatch");
    await Promise.all(
      instances.filter((item) => item !== fresh).map((item) => assertThreadSurvivor(config, item)),
    );
    if (codeProbe) await assertCodeUsable(config, codeProbe);
    if (!sameProtectedSnapshot(baseline, await protectedSnapshot(config)))
      throw new Error("protected-service-changed");
    stage = "crash-isolation";
    await stopCase(crash, "crash", config.thresholds.crashMs);
    if (
      instances
        .filter((item) => item !== fresh && item !== crash)
        .some((item) => !identityIsAlive(item.mainIdentity))
    )
      throw new Error("window-identity-mismatch");
    await Promise.all(
      instances
        .filter((item) => item !== fresh && item !== crash)
        .map((item) => assertThreadSurvivor(config, item)),
    );
    if (codeProbe) await assertCodeUsable(config, codeProbe);
    if (!sameProtectedSnapshot(baseline, await protectedSnapshot(config)))
      throw new Error("protected-service-changed");
    for (const item of instances) {
      const metrics = caseMetrics(item, config.thresholds);
      summary.metrics[item.name] = metrics;
      for (const [name, value] of Object.entries(metrics))
        if (!value.withinBudget) summary.budgetBreaches.push({ case: item.name, milestone: name });
      diagnostics.cases.push({
        name: item.name,
        main: item.mainIdentity,
        launch: item.launchIdentity,
        workspace: item.workspace,
        draft: {
          utf8Bytes: Buffer.byteLength(item.expectedDraft),
          sha256: sha256Text(item.expectedDraft),
        },
        metrics,
      });
    }
    summary.success = true;
    summary.stage = "complete";
    summary.caseCount = instances.length;
    summary.checks = {
      artifactVerified: true,
      authenticatedSession200: true,
      exactPrimaryWebSocket101: true,
      exactComposerDraft: true,
      noAutomaticSend: true,
      nativeInputIsolation: true,
      lifecycleIsolation: true,
      protectedRuntimeInvariant: true,
      coreCodeUsable: Boolean(codeProbe),
      coreCodeDraftUnchanged: (codeProbe?.composerObservations ?? 0) >= 2,
    };
    diagnostics.success = true;
    diagnostics.stage = "complete";
    diagnostics.checks.push(
      "Synthetic crash text exercised through the staging entry adapter. The real notification producer remains a separate adapter acceptance step.",
    );
    if (!codeProbe)
      diagnostics.checks.push(
        "Core Code process and readiness invariance passed. Core Code composer and authenticated UI need an explicit codeCdpPort.",
      );
  } catch (cause) {
    const failure = sanitizeFailure(stage, cause);
    Object.assign(summary, {
      success: false,
      stage: failure.stage,
      failure: { code: failure.code, message: failure.message },
    });
    Object.assign(diagnostics, {
      success: false,
      stage: failure.stage,
      failure: { code: failure.code },
    });
  } finally {
    stage = "cleanup";
    try {
      await cleanupCases(instances);
    } catch (cause) {
      summary.success = false;
      diagnostics.success = false;
      summary.stage = "cleanup";
      diagnostics.stage = "cleanup";
      summary.failure = sanitizeFailure("cleanup", cause);
    }
    if (initialDesktop) {
      diagnostics.desktopRestored = await restoreDesktop(config, initialDesktop);
      if (!diagnostics.desktopRestored) {
        summary.success = false;
        diagnostics.success = false;
        summary.stage = "cleanup";
        diagnostics.stage = "cleanup";
        summary.failure = sanitizeFailure("cleanup", new Error("native-focus-failed"));
      }
    }
    summary.attemptedCaseCount = instances.length;
    for (const item of instances) {
      if (!summary.metrics[item.name]) {
        const metrics = caseMetrics(item, config.thresholds);
        summary.metrics[item.name] = metrics;
        for (const [name, metric] of Object.entries(metrics)) {
          if (!metric.withinBudget)
            summary.budgetBreaches.push({ case: item.name, milestone: name });
        }
      }
    }
    diagnostics.observations = instances.map((item) => ({
      name: item.name,
      stage: item.lastStage,
      launchIdentity: item.launchIdentity,
      observedMainIdentity: item.observedMainIdentity,
      observedWindowClasses: item.observedWindowClasses,
      scope: item.scopeObservation,
    }));
    diagnostics.cleanup = instances.map((item) => ({
      name: item.name,
      mainStopped: !identityIsAlive(item.mainIdentity),
      launcherStopped: !identityIsAlive(item.launchIdentity),
      capturedDescendantsStopped: [...item.capturedOwned].every(
        ([pid, startTicks]) => !identityIsAlive({ pid, startTicks }),
      ),
    }));
    if (
      diagnostics.cleanup.some(
        (item) => !item.mainStopped || !item.launcherStopped || !item.capturedDescendantsStopped,
      )
    ) {
      summary.success = false;
      diagnostics.success = false;
      summary.stage = "cleanup";
      diagnostics.stage = "cleanup";
    }
    if (baseline) {
      const protectedRuntimeUnchanged = await protectedSnapshot(config)
        .then((current) => sameProtectedSnapshot(baseline, current))
        .catch(() => false);
      if (!protectedRuntimeUnchanged) {
        summary.success = false;
        diagnostics.success = false;
        summary.stage = "cleanup";
        diagnostics.stage = "cleanup";
      }
    }
    if (noSendBaseline) {
      try {
        if (
          JSON.stringify(noSendSnapshot(config.stagingDatabasePath)) !==
          JSON.stringify(noSendBaseline)
        ) {
          summary.success = false;
          diagnostics.success = false;
          summary.stage = "cleanup";
          diagnostics.stage = "cleanup";
          summary.failure = {
            code: "no-send-frame-observed",
            message:
              "A bounded staging acceptance assertion failed. Inspect the private diagnostics for its stage and category.",
          };
          summary.checks.noAutomaticSend = false;
        }
      } catch {
        summary.success = false;
        diagnostics.success = false;
        summary.stage = "cleanup";
        diagnostics.stage = "cleanup";
      }
    }
    await disconnectCodeProbe(codeProbe).catch(() => {
      summary.success = false;
      diagnostics.success = false;
      summary.stage = "cleanup";
      diagnostics.stage = "cleanup";
    });
    await writeEvidence(outputDirectory, summary, diagnostics);
  }
  return { summary, diagnostics };
}
