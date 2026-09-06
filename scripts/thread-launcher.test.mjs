import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeStream from "node:stream";

import { expect, it } from "vite-plus/test";

import {
  externalIntentLaunchId,
  launchThread,
  parseLauncherActivation,
  spawnAppImage,
} from "./thread-launcher.mjs";

const launchId = "01234567-89ab-4def-8abc-0123456789ab";
const activation = Buffer.from(JSON.stringify({ contractVersion: 1, launchId }));

function spawnFixture(readiness) {
  return NodeChildProcess.spawn(
    NodeProcess.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import * as fs from "node:fs";
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        fs.writeSync(3, Buffer.concat(chunks));
        fs.closeSync(3);
        fs.writeSync(4, ${JSON.stringify(readiness)});
        fs.closeSync(4);
        setTimeout(() => process.exit(0), 200);
      `,
    ],
    { stdio: ["pipe", "ignore", "ignore", "pipe", "pipe"] },
  );
}

function readAll(stream) {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.once("end", () => resolve(Buffer.concat(chunks)));
  });
}

const externalIntentId = "0123456789abcdef0123456789abcdef";
const externalIntent = {
  contractVersion: 1,
  intentId: externalIntentId,
  source: "crash-notification",
  action: "draft",
  draft: { text: "Inspect this crash before I choose Send." },
  crash: {
    journalCursor: "s=cursor-one",
    bootId: "boot-one",
    messageId: "fc2e22bc6ee647b6b90729ab34a250b1",
    userId: 1000,
    pid: 4242,
    command: "example",
    executable: "/usr/bin/example",
    signal: "SIGSEGV",
    timestampUsec: "1788206400000000",
  },
};

it("creates a fresh empty activation from exact zero-byte input", () => {
  const freshLaunchId = "11234567-89ab-4def-8abc-0123456789ab";
  expect(parseLauncherActivation(Buffer.alloc(0), 1000, () => freshLaunchId)).toEqual({
    activation: { contractVersion: 1, launchId: freshLaunchId, workingDirectory: NodeOS.homedir() },
    responseChannel: "external",
  });
  expect(() => parseLauncherActivation(Buffer.alloc(0), 1000, () => "not-a-launch-id")).toThrow(
    "fresh launch identity is invalid",
  );
});

it("derives one stable internal UUID from the full external intent identity", () => {
  const first = externalIntentLaunchId(externalIntentId);
  expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/u);
  expect(externalIntentLaunchId(externalIntentId)).toBe(first);
  expect(externalIntentLaunchId("1123456789abcdef0123456789abcdef")).not.toBe(first);
});

it("translates an exact external crash intent into draft-only internal activation", () => {
  expect(parseLauncherActivation(Buffer.from(JSON.stringify(externalIntent)), 1000)).toEqual({
    activation: {
      contractVersion: 1,
      launchId: externalIntentLaunchId(externalIntentId),
      draft: externalIntent.draft.text,
      workingDirectory: NodeOS.homedir(),
    },
    responseChannel: "external",
  });
});

it("relays exact readiness from the independent app process", async () => {
  const ready = `${JSON.stringify({ contractVersion: 1, launchId, ready: true })}\n`;
  let child;
  let relayed;
  try {
    await launchThread({
      activationInput: NodeStream.Readable.from([activation]),
      appImagePath: "/fixture/T3-Thread.AppImage",
      spawnApp: () => {
        child = spawnFixture(ready);
        return { child, ready: child.stdio[4] };
      },
      writeReady: (bytes, channel) => {
        relayed = { bytes, channel };
      },
      timeoutMs: 2_000,
    });
    expect(relayed?.channel).toBe("desktop");
    expect(relayed?.bytes.toString("utf8")).toBe(ready);
    expect(child?.exitCode).toBeNull();
  } finally {
    child?.kill("SIGTERM");
  }
});

it("launches concurrent children with independently correlated readiness", async () => {
  const launchIds = [
    "01234567-89ab-4def-8abc-0123456789ab",
    "11234567-89ab-4def-8abc-0123456789ab",
  ];
  const children = [];
  const receivedActivations = [];
  const relayed = [];
  try {
    await Promise.all(
      launchIds.map((nextLaunchId) =>
        launchThread({
          activationInput: NodeStream.Readable.from([
            Buffer.from(JSON.stringify({ contractVersion: 1, launchId: nextLaunchId })),
          ]),
          appImagePath: "/fixture/T3-Thread.AppImage",
          spawnApp: () => {
            const child = spawnFixture(
              `${JSON.stringify({ contractVersion: 1, launchId: nextLaunchId, ready: true })}\n`,
            );
            children.push(child);
            receivedActivations.push(readAll(child.stdio[3]));
            return { child, ready: child.stdio[4] };
          },
          writeReady: (bytes, channel) => relayed.push({ bytes, channel }),
          timeoutMs: 2_000,
        }),
      ),
    );
    expect(new Set(children.map((child) => child.pid)).size).toBe(2);
    expect(relayed).toEqual(
      expect.arrayContaining(
        launchIds.map((nextLaunchId) => ({
          bytes: Buffer.from(
            `${JSON.stringify({ contractVersion: 1, launchId: nextLaunchId, ready: true })}\n`,
          ),
          channel: "desktop",
        })),
      ),
    );
    expect(
      (await Promise.all(receivedActivations)).map((bytes) => JSON.parse(bytes.toString("utf8"))),
    ).toEqual(
      expect.arrayContaining(
        launchIds.map((nextLaunchId) => ({ contractVersion: 1, launchId: nextLaunchId })),
      ),
    );
  } finally {
    for (const child of children) child.kill("SIGTERM");
  }
});

it("supervises the acknowledged app until it exits when requested", async () => {
  const ready = `${JSON.stringify({ contractVersion: 1, launchId, ready: true })}\n`;
  let child;
  await launchThread({
    activationInput: NodeStream.Readable.from([activation]),
    appImagePath: "/fixture/T3-Thread.AppImage",
    spawnApp: () => {
      child = spawnFixture(ready);
      return { child, ready: child.stdio[4] };
    },
    superviseAfterReady: true,
    writeReady: () => undefined,
    timeoutMs: 2_000,
  });
  expect(child?.exitCode).toBe(0);
});

it("gives concurrent extract-and-run wrappers separate private temp directories", async () => {
  const runtimeDirectory = NodeFS.mkdtempSync(
    NodePath.join(NodeOS.tmpdir(), "t3-thread-launcher-runtime-"),
  );
  const spawns = [];
  const spawn = (command, arguments_, options) => {
    const ready = new NodeStream.PassThrough();
    const child = { stdio: [new NodeStream.PassThrough(), null, null, ready] };
    spawns.push({ command, arguments_, options, child });
    return child;
  };
  try {
    const [first, second] = await Promise.all([
      spawnAppImage("/artifact/T3-Thread.AppImage", {
        environment: { XDG_RUNTIME_DIR: runtimeDirectory },
        spawn,
      }),
      spawnAppImage("/artifact/T3-Thread.AppImage", {
        environment: { XDG_RUNTIME_DIR: runtimeDirectory },
        spawn,
      }),
    ]);

    expect(first.temporaryDirectory).not.toBe(second.temporaryDirectory);
    expect(spawns).toHaveLength(2);
    expect(spawns.map(({ options }) => options.env.TMPDIR)).toEqual([
      first.temporaryDirectory,
      second.temporaryDirectory,
    ]);
    for (const temporaryDirectory of [first.temporaryDirectory, second.temporaryDirectory]) {
      expect(NodePath.dirname(temporaryDirectory)).toBe(runtimeDirectory);
      expect(NodePath.basename(temporaryDirectory)).toMatch(/^t3code-thread-appimage-/u);
      expect(NodeFS.statSync(temporaryDirectory).mode & 0o777).toBe(0o700);
    }
    first.cleanup();
    second.cleanup();
    expect(NodeFS.existsSync(first.temporaryDirectory)).toBe(false);
    expect(NodeFS.existsSync(second.temporaryDirectory)).toBe(false);
  } finally {
    NodeFS.rmSync(runtimeDirectory, { recursive: true, force: true });
  }
});

it("rejects a linked XDG runtime directory", async () => {
  const runtimeContainer = NodeFS.mkdtempSync(
    NodePath.join(NodeOS.tmpdir(), "t3-thread-launcher-linked-runtime-"),
  );
  const runtimeDirectory = NodePath.join(runtimeContainer, "physical");
  const linkedRuntimeDirectory = NodePath.join(runtimeContainer, "linked");
  try {
    NodeFS.mkdirSync(runtimeDirectory, { mode: 0o700 });
    NodeFS.symlinkSync(runtimeDirectory, linkedRuntimeDirectory);
    await expect(
      spawnAppImage("/artifact/T3-Thread.AppImage", {
        environment: { XDG_RUNTIME_DIR: linkedRuntimeDirectory },
        spawn: () => {
          throw new Error("spawn must not run");
        },
      }),
    ).rejects.toThrow("XDG runtime directory is unsafe");
  } finally {
    NodeFS.rmSync(runtimeContainer, { recursive: true, force: true });
  }
});

it("stages an external draft only in the independent app activation", async () => {
  const internalLaunchId = externalIntentLaunchId(externalIntentId);
  const ready = `${JSON.stringify({ contractVersion: 1, launchId: internalLaunchId, ready: true })}\n`;
  let child;
  let activationInput;
  let relayed;
  try {
    await launchThread({
      activationInput: NodeStream.Readable.from([Buffer.from(JSON.stringify(externalIntent))]),
      appImagePath: "/fixture/T3-Thread.AppImage",
      expectedUserId: 1000,
      spawnApp: () => {
        child = spawnFixture(ready);
        activationInput = readAll(child.stdio[3]);
        return { child, ready: child.stdio[4] };
      },
      writeReady: (bytes, channel) => {
        relayed = { bytes, channel };
      },
      timeoutMs: 2_000,
    });
    expect(relayed?.channel).toBe("external");
    expect(relayed?.bytes.toString("utf8")).toBe('{"contractVersion":1,"status":"completed"}\n');
    expect(JSON.parse((await activationInput).toString("utf8"))).toEqual({
      contractVersion: 1,
      launchId: internalLaunchId,
      draft: externalIntent.draft.text,
      workingDirectory: NodeOS.homedir(),
    });
  } finally {
    child?.kill("SIGTERM");
  }
});

it("rejects malformed readiness and terminates the app", async () => {
  let child;
  await expect(
    launchThread({
      activationInput: NodeStream.Readable.from([activation]),
      appImagePath: "/fixture/T3-Thread.AppImage",
      spawnApp: () => {
        child = spawnFixture('{"ready":true}\n');
        return { child, ready: child.stdio[4] };
      },
      writeReady: () => undefined,
      timeoutMs: 2_000,
    }),
  ).rejects.toThrow("readiness acknowledgement is invalid");
  expect(child?.killed).toBe(true);
});

it("rejects oversized or excess external activation before spawning", async () => {
  const spawnApp = () => {
    throw new Error("must not spawn");
  };
  await expect(
    launchThread({
      activationInput: NodeStream.Readable.from([Buffer.alloc(65_537, 0x78)]),
      appImagePath: "/fixture/T3-Thread.AppImage",
      spawnApp,
      writeReady: () => undefined,
    }),
  ).rejects.toThrow("activation is oversized");
  expect(() =>
    parseLauncherActivation(
      Buffer.from(JSON.stringify({ ...externalIntent, target: "private" })),
      1000,
    ),
  ).toThrow("external draft intent is invalid");
});

it("matches the shared activation conformance vectors and UTF-8 byte boundaries", () => {
  const vectors = JSON.parse(
    NodeFS.readFileSync(
      new URL("../packages/contracts/test-fixtures/thread-app-activation.json", import.meta.url),
      "utf8",
    ),
  );
  for (const vector of vectors) {
    const decode = () => parseLauncherActivation(Buffer.from(JSON.stringify(vector.value)), 1000);
    if (vector.valid) expect(decode().activation).toEqual(vector.value);
    else expect(decode).toThrow("activation is invalid");
  }
  const exactDraft = "é".repeat(16 * 1024);
  expect(
    parseLauncherActivation(
      Buffer.from(JSON.stringify({ contractVersion: 1, launchId, draft: exactDraft })),
    ).activation.draft,
  ).toBe(exactDraft);
  expect(() =>
    parseLauncherActivation(
      Buffer.from(JSON.stringify({ contractVersion: 1, launchId, draft: `${exactDraft}é` })),
    ),
  ).toThrow("activation is invalid");
  expect(() =>
    parseLauncherActivation(
      Buffer.concat([
        Buffer.from(`{"contractVersion":1,"launchId":"${launchId}","draft":"`),
        Buffer.from([0xff]),
        Buffer.from('"}'),
      ]),
    ),
  ).toThrow("activation is invalid");
  expect(() => parseLauncherActivation(Buffer.alloc(65_537))).toThrow("activation is oversized");
});

it("carries exact zero-byte and fd3 activation through the executable launcher stub", async () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-thread-launcher-cli-"));
  const runtimeDirectory = NodePath.join(root, "runtime");
  const appImagePath = NodePath.join(root, "T3-Thread.AppImage");
  const capturePath = NodePath.join(root, "activation.json");
  NodeFS.mkdirSync(runtimeDirectory, { mode: 0o700 });
  NodeFS.writeFileSync(
    appImagePath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
process.stdin.on("end", () => {
  const activation = Buffer.concat(chunks);
  fs.writeFileSync(process.env.FIXTURE_CAPTURE, activation);
  const parsed = JSON.parse(activation.toString("utf8"));
  fs.writeSync(3, Buffer.concat([
    Buffer.from(JSON.stringify({ contractVersion: 1, launchId: parsed.launchId, ready: true })),
    Buffer.from([10]),
  ]));
  setTimeout(() => process.exit(0), 100);
});
`,
    { mode: 0o755 },
  );
  const runLauncher = async (input, directoryOverride) => {
    const child = NodeChildProcess.spawn(
      NodeProcess.execPath,
      [new URL("./thread-launcher.mjs", import.meta.url).pathname, appImagePath],
      {
        env: {
          ...NodeProcess.env,
          XDG_RUNTIME_DIR: runtimeDirectory,
          FIXTURE_CAPTURE: capturePath,
          T3_THREAD_WORKING_DIRECTORY: directoryOverride,
        },
        stdio: ["pipe", "pipe", "pipe", "pipe"],
      },
    );
    const stdout = readAll(child.stdout);
    const stderr = readAll(child.stderr);
    const fd3 = readAll(child.stdio[3]);
    child.stdin.end(input);
    const exit = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code));
    });
    return { exit, stdout: await stdout, stderr: await stderr, fd3: await fd3 };
  };
  try {
    const fresh = await runLauncher(Buffer.alloc(0));
    expect(fresh.stderr.toString("utf8")).toBe("");
    expect(fresh.exit).toBe(0);
    expect(JSON.parse(fresh.stdout.toString("utf8"))).toEqual({
      contractVersion: 1,
      status: "completed",
    });
    expect(JSON.parse(NodeFS.readFileSync(capturePath, "utf8"))).toEqual({
      contractVersion: 1,
      workingDirectory: NodeOS.homedir(),
      launchId: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      ),
    });

    const scoped = await runLauncher(Buffer.alloc(0), "/workspace/explicit");
    expect(scoped.exit).toBe(0);
    expect(JSON.parse(NodeFS.readFileSync(capturePath, "utf8")).workingDirectory).toBe(
      "/workspace/explicit",
    );

    const exactInput = Buffer.from(
      JSON.stringify({ contractVersion: 1, launchId, draft: "byte exact draft" }),
    );
    const desktop = await runLauncher(exactInput);
    expect(desktop.exit).toBe(0);
    expect(desktop.stdout.byteLength).toBe(0);
    expect(desktop.fd3).toEqual(
      Buffer.from(`${JSON.stringify({ contractVersion: 1, launchId, ready: true })}\n`),
    );
    expect(NodeFS.readFileSync(capturePath)).toEqual(exactInput);
    expect(NodeFS.readdirSync(runtimeDirectory)).toEqual([]);
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

it("preserves explicit external scope and rejects invalid directories", () => {
  const parse = (workingDirectory) =>
    parseLauncherActivation(
      Buffer.from(
        JSON.stringify({
          ...externalIntent,
          workingDirectory,
        }),
      ),
      1000,
    );
  expect(parse("/workspace/wallpaper").activation.workingDirectory).toBe("/workspace/wallpaper");
  const limit = "/" + "é".repeat(2047) + "x";
  expect(parse(limit).activation.workingDirectory).toBe(limit);
  for (const path of ["", "relative", "~/example", "/bad\0path", limit + "x", null]) {
    expect(() => parse(path)).toThrow();
  }
  expect(() => parseLauncherActivation(Buffer.alloc(0), 1000, () => launchId, "relative")).toThrow(
    "default working directory is invalid",
  );
});
