// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
import * as NodeEvents from "node:events";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { homedirMock, readImageMock, spawnMock, watchMock } = vi.hoisted(() => ({
  homedirMock: vi.fn(),
  readImageMock: vi.fn(),
  spawnMock: vi.fn(),
  watchMock: vi.fn(),
}));

vi.mock("electron", () => ({
  clipboard: { readImage: readImageMock },
}));

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: homedirMock };
});

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, spawn: spawnMock };
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, watch: watchMock };
});

import { captureOmarchyScreenshot } from "./OmarchyScreenshotCapture.ts";

type FakeChild = NodeEvents.EventEmitter & {
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  stdout: NodeEvents.EventEmitter & {
    setEncoding: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  stderr: NodeEvents.EventEmitter & {
    setEncoding: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  kill: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
};

type FakeWatcher = NodeEvents.EventEmitter & { close: ReturnType<typeof vi.fn> };

function pngBytes(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+7iQAAAAASUVORK5CYII=",
    "base64",
  );
}

function clipboardImage(data: Uint8Array | null) {
  return {
    isEmpty: () => data === null,
    toPNG: () => Buffer.from(data ?? []),
  };
}

function fakeChild(): FakeChild {
  const child = new NodeEvents.EventEmitter() as FakeChild;
  child.pid = 4242;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = Object.assign(new NodeEvents.EventEmitter(), {
    setEncoding: vi.fn(),
    destroy: vi.fn(),
  });
  child.stderr = Object.assign(new NodeEvents.EventEmitter(), {
    setEncoding: vi.fn(),
    destroy: vi.fn(),
  });
  child.kill = vi.fn((signal: NodeJS.Signals) => {
    queueMicrotask(() => terminateFakeChild(child, null, signal));
    return true;
  });
  child.unref = vi.fn();
  return child;
}

function terminateFakeChild(
  child: FakeChild,
  code: number | null,
  signal: NodeJS.Signals | null,
  emitClose = true,
): void {
  child.exitCode = code;
  child.signalCode = signal;
  child.emit("exit", code, signal);
  if (emitClose) child.emit("close", code, signal);
}

function fakeWatcher(): FakeWatcher {
  return Object.assign(new NodeEvents.EventEmitter(), { close: vi.fn() });
}

describe("captureOmarchyScreenshot", () => {
  const tempDirectories: string[] = [];
  let homeDirectory: string;
  let outputDirectory: string;
  let watcher: FakeWatcher;

  beforeEach(async () => {
    homeDirectory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "omarchy-capture-"));
    tempDirectories.push(homeDirectory);
    outputDirectory = NodePath.join(homeDirectory, "Pictures");
    await NodeFSP.mkdir(outputDirectory, { recursive: true });
    homedirMock.mockReturnValue(homeDirectory);
    readImageMock.mockReset().mockReturnValue(clipboardImage(null));
    spawnMock.mockReset();
    watcher = fakeWatcher();
    watchMock.mockReset().mockReturnValue(watcher);
  });

  afterEach(async () => {
    delete NodeProcess.env.OMARCHY_SCREENSHOT_DIR;
    await Promise.all(
      tempDirectories
        .splice(0)
        .map((directoryPath) => NodeFSP.rm(directoryPath, { recursive: true, force: true })),
    );
  });

  it("waits for a delayed file to become a complete PNG", async () => {
    const child = fakeChild();
    const complete = pngBytes();
    const filePath = NodePath.join(outputDirectory, "delayed.png");
    spawnMock.mockImplementation(() => {
      setTimeout(() => {
        void NodeFSP.writeFile(filePath, complete.subarray(0, complete.byteLength - 8));
      }, 5);
      setTimeout(() => {
        void NodeFSP.writeFile(filePath, complete);
      }, 25);
      setTimeout(() => terminateFakeChild(child, 0, null), 60);
      return child;
    });

    const capture = await captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
      pollIntervalMs: 5,
      closeSettleMs: 50,
      timeoutMs: 500,
    });

    expect(capture).toMatchObject({ name: "delayed.png", mimeType: "image/png" });
    expect(Array.from(capture?.data ?? [])).toEqual(Array.from(complete));
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("accepts only a changed valid clipboard image", async () => {
    const child = fakeChild();
    const before = pngBytes();
    const after = Buffer.from(before);
    after[after.byteLength - 1] = after[after.byteLength - 1]! ^ 1;
    let clipboardData = before;
    readImageMock.mockImplementation(() => clipboardImage(clipboardData));
    spawnMock.mockImplementation(() => {
      setTimeout(() => {
        clipboardData = after;
      }, 20);
      setTimeout(() => terminateFakeChild(child, 0, null), 60);
      return child;
    });

    const capture = await captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
      pollIntervalMs: 5,
      closeSettleMs: 50,
      timeoutMs: 500,
    });

    expect(Array.from(capture?.data ?? [])).toEqual(Array.from(after));
    expect(readImageMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("returns null for explicit cancellation and cleans every owned watcher", async () => {
    const child = fakeChild();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => {
        child.stderr.emit("data", "cancelled by user");
        terminateFakeChild(child, 1, null);
      });
      return child;
    });

    await expect(
      captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
        pollIntervalMs: 5,
        timeoutMs: 500,
      }),
    ).resolves.toBeNull();
    expect(child.kill).not.toHaveBeenCalled();
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("kills a timed out capture and closes polling resources", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    await expect(
      captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
        pollIntervalMs: 5,
        timeoutMs: 30,
      }),
    ).rejects.toThrow("timed out after 30 ms");
    expect(child.kill).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("keeps polling after a watcher failure and terminates the live child on success", async () => {
    const child = fakeChild();
    const complete = pngBytes();
    const filePath = NodePath.join(outputDirectory, "after-watcher-error.png");
    spawnMock.mockImplementation(() => {
      setTimeout(() => watcher.emit("error", new Error("watch failed")), 5);
      setTimeout(() => {
        void NodeFSP.writeFile(filePath, complete);
      }, 15);
      return child;
    });

    await expect(
      captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
        pollIntervalMs: 5,
        timeoutMs: 500,
      }),
    ).resolves.toMatchObject({ name: "after-watcher-error.png" });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("waits for confirmed exit without waiting for inherited stdio handles to close", async () => {
    const child = fakeChild();
    child.kill.mockImplementation(() => true);
    const complete = pngBytes();
    const filePath = NodePath.join(outputDirectory, "clipboard-owner-still-live.png");
    spawnMock.mockImplementation(() => {
      setTimeout(() => {
        void NodeFSP.writeFile(filePath, complete);
      }, 10);
      return child;
    });

    let resolved = false;
    const capturePromise = captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
      pollIntervalMs: 5,
      timeoutMs: 500,
    }).then((capture) => {
      resolved = true;
      return capture;
    });

    await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith("SIGTERM"));
    expect(resolved).toBe(false);
    terminateFakeChild(child, null, "SIGTERM", false);

    await expect(capturePromise).resolves.toMatchObject({
      name: "clipboard-owner-still-live.png",
    });
    expect(child.listenerCount("exit")).toBe(0);
    expect(child.listenerCount("close")).toBe(0);
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("escalates an ignored SIGTERM and waits for an actual disposable child to exit", async () => {
    const actualChildProcess =
      await vi.importActual<typeof import("node:child_process")>("node:child_process");
    const scriptPath = NodePath.join(homeDirectory, "ignore-term.cjs");
    await NodeFSP.writeFile(
      scriptPath,
      [
        "#!/usr/bin/env node",
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        'process.on("SIGTERM", () => {});',
        `const png = Buffer.from("${pngBytes().toString("base64")}", "base64");`,
        'fs.writeFileSync(path.join(process.env.OMARCHY_SCREENSHOT_DIR, "capture.png"), png);',
        "setInterval(() => {}, 1000);",
      ].join("\n"),
      "utf8",
    );
    await NodeFSP.chmod(scriptPath, 0o755);
    NodeProcess.env.OMARCHY_SCREENSHOT_DIR = outputDirectory;

    const actualChildRef: { current: import("node:child_process").ChildProcess | null } = {
      current: null,
    };
    spawnMock.mockImplementation(
      (
        command: string,
        args: ReadonlyArray<string>,
        options: import("node:child_process").SpawnOptions,
      ) => {
        actualChildRef.current = actualChildProcess.spawn(command, [...args], options);
        return actualChildRef.current;
      },
    );

    try {
      await expect(
        captureOmarchyScreenshot(scriptPath, {
          forceKillTimeoutMs: 500,
          pollIntervalMs: 5,
          terminationGraceMs: 20,
          timeoutMs: 1_000,
        }),
      ).resolves.toMatchObject({ name: "capture.png" });
      expect(actualChildRef.current).not.toBeNull();
      expect(actualChildRef.current?.signalCode).toBe("SIGKILL");
      expect(watcher.close).toHaveBeenCalledOnce();
    } finally {
      const childAfterCapture = actualChildRef.current;
      if (
        childAfterCapture &&
        childAfterCapture.exitCode === null &&
        childAfterCapture.signalCode === null
      ) {
        const exit = new Promise<void>((resolve) => {
          childAfterCapture.once("exit", () => resolve());
        });
        childAfterCapture.kill("SIGKILL");
        await exit;
      }
    }
  });

  it("escalates after a thrown SIGTERM request and settles only after SIGKILL exit", async () => {
    const child = fakeChild();
    child.kill
      .mockImplementationOnce(() => {
        throw new Error("private termination detail");
      })
      .mockImplementationOnce((signal: NodeJS.Signals) => {
        queueMicrotask(() => terminateFakeChild(child, null, signal, false));
        return true;
      });
    const filePath = NodePath.join(outputDirectory, "throwing-term.png");
    spawnMock.mockImplementation(() => {
      setTimeout(() => {
        void NodeFSP.writeFile(filePath, pngBytes());
      }, 5);
      return child;
    });

    await expect(
      captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
        forceKillTimeoutMs: 100,
        pollIntervalMs: 5,
        terminationGraceMs: 5,
        timeoutMs: 500,
      }),
    ).resolves.toMatchObject({ name: "throwing-term.png" });
    expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
  });

  it("rejects boundedly when both termination signals fail and removes owned resources", async () => {
    const child = fakeChild();
    child.kill.mockReturnValue(false);
    const filePath = NodePath.join(outputDirectory, "failed-kill.png");
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => child.stderr.emit("data", "private image bytes 137 80 78 71"));
      setTimeout(() => {
        void NodeFSP.writeFile(filePath, pngBytes());
      }, 5);
      return child;
    });

    const error = await captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
      forceKillTimeoutMs: 10,
      pollIntervalMs: 5,
      terminationGraceMs: 5,
      timeoutMs: 500,
    }).catch((failure: unknown) => failure);

    expect(error).toMatchObject({ name: "OmarchyScreenshotTerminationError" });
    expect(String(error)).not.toContain("137 80 78 71");
    expect(child.kill.mock.calls).toEqual([["SIGTERM"], ["SIGKILL"]]);
    expect(child.listenerCount("error")).toBe(0);
    expect(child.listenerCount("exit")).toBe(0);
    expect(child.listenerCount("close")).toBe(0);
    expect(child.stdout.listenerCount("data")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);
    expect(child.stdout.destroy).toHaveBeenCalledOnce();
    expect(child.stderr.destroy).toHaveBeenCalledOnce();
    expect(child.unref).toHaveBeenCalledOnce();
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("reports an invalid artifact only after the adapter process has closed", async () => {
    const child = fakeChild();
    const filePath = NodePath.join(outputDirectory, "invalid.png");
    spawnMock.mockImplementation(() => {
      setTimeout(() => {
        void NodeFSP.writeFile(filePath, "not a png");
      }, 5);
      setTimeout(() => terminateFakeChild(child, 0, null), 15);
      return child;
    });

    await expect(
      captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
        closeSettleMs: 20,
        pollIntervalMs: 5,
        timeoutMs: 500,
      }),
    ).rejects.toThrow("invalid PNG");
    expect(child.kill).not.toHaveBeenCalled();
    expect(watcher.close).toHaveBeenCalledOnce();
  });

  it("rejects a successful process with no changed artifact after its settle window", async () => {
    const child = fakeChild();
    spawnMock.mockImplementation(() => {
      queueMicrotask(() => terminateFakeChild(child, 0, null));
      return child;
    });

    await expect(
      captureOmarchyScreenshot("/opt/bin/omarchy-capture-screenshot", {
        closeSettleMs: 20,
        pollIntervalMs: 5,
        timeoutMs: 500,
      }),
    ).rejects.toThrow("without producing a changed PNG artifact");
    expect(watcher.close).toHaveBeenCalledOnce();
  });
});
