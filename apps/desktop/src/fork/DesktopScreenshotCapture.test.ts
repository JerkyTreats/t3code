// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
import * as NodePath from "node:path";

import { describe, expect, it, vi } from "vite-plus/test";

import {
  captureDesktopScreenshot,
  type DesktopScreenshotCaptureRuntime,
} from "./DesktopScreenshotCapture.ts";
import { OmarchyScreenshotTerminationError } from "./OmarchyScreenshotCapture.ts";

function pngBytes(): Uint8Array {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+7iQAAAAASUVORK5CYII=",
    "base64",
  );
}

function runtime(
  executablePaths: ReadonlyArray<string>,
  overrides: Partial<DesktopScreenshotCaptureRuntime> = {},
): DesktopScreenshotCaptureRuntime {
  const executables = new Set(executablePaths);
  return {
    host: {
      platform: "linux",
      homeDirectory: "/home/tester",
      pathValue: ["/opt/bin", "/usr/bin"].join(NodePath.delimiter),
      isExecutable: (filePath) => executables.has(filePath),
    },
    makeTempDirectory: vi.fn().mockResolvedValue("/tmp/capture-test"),
    readFile: vi.fn().mockResolvedValue(pngBytes()),
    removeFile: vi.fn().mockResolvedValue(undefined),
    removeDirectory: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    captureOmarchy: vi.fn().mockRejectedValue(new Error("adapter unavailable")),
    now: () => new Date("2026-08-16T12:34:56.000Z"),
    ...overrides,
  };
}

describe("captureDesktopScreenshot", () => {
  it("falls back from Omarchy and returns the new Uint8Array contract", async () => {
    const captureRuntime = runtime([
      "/home/tester/.local/share/omarchy/bin/omarchy-capture-screenshot",
      "/usr/bin/grimblast",
    ]);

    const capture = await captureDesktopScreenshot(captureRuntime);

    expect(captureRuntime.captureOmarchy).toHaveBeenCalledWith(
      "/home/tester/.local/share/omarchy/bin/omarchy-capture-screenshot",
    );
    expect(captureRuntime.execute).toHaveBeenCalledWith("/usr/bin/grimblast", [
      "--freeze",
      "--notify",
      "save",
      "area",
      "/tmp/capture-test/capture.png",
    ]);
    expect(capture).toMatchObject({
      name: "screenshot-2026-08-16T12-34-56-000Z.png",
      mimeType: "image/png",
    });
    expect(Array.from(capture?.data ?? [])).toEqual(Array.from(pngBytes()));
    expect(captureRuntime.removeDirectory).toHaveBeenCalledWith("/tmp/capture-test");
  });

  it("does not start a fallback after Omarchy child termination fails", async () => {
    const captureRuntime = runtime(
      ["/home/tester/.local/share/omarchy/bin/omarchy-capture-screenshot", "/usr/bin/grimblast"],
      {
        captureOmarchy: vi.fn().mockRejectedValue(new OmarchyScreenshotTerminationError()),
      },
    );

    await expect(captureDesktopScreenshot(captureRuntime)).rejects.toThrow(
      OmarchyScreenshotTerminationError,
    );
    expect(captureRuntime.execute).not.toHaveBeenCalled();
    expect(captureRuntime.removeDirectory).toHaveBeenCalledOnce();
  });

  it("uses region capture before grim fullscreen and falls back after invalid output", async () => {
    const readFile = vi
      .fn()
      .mockResolvedValueOnce(Uint8Array.of(1, 2, 3))
      .mockResolvedValueOnce(pngBytes());
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "10,20 300x200\n", stderr: "" })
      .mockResolvedValue({ stdout: "", stderr: "" });
    const captureRuntime = runtime(["/usr/bin/grim", "/usr/bin/slurp"], {
      readFile,
      execute,
    });

    await expect(captureDesktopScreenshot(captureRuntime)).resolves.toMatchObject({
      mimeType: "image/png",
    });
    expect(execute.mock.calls).toEqual([
      ["/usr/bin/slurp", []],
      ["/usr/bin/grim", ["-g", "10,20 300x200", "/tmp/capture-test/capture.png"]],
      ["/usr/bin/grim", ["/tmp/capture-test/capture.png"]],
    ]);
  });

  it("treats explicit adapter cancellation as final and still cleans up", async () => {
    const cancellation = Object.assign(new Error("cancelled"), { code: 1, stderr: "cancelled" });
    const execute = vi.fn().mockRejectedValue(cancellation);
    const captureRuntime = runtime(["/usr/bin/grimblast", "/usr/bin/grim"], { execute });

    await expect(captureDesktopScreenshot(captureRuntime)).resolves.toBeNull();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(captureRuntime.removeDirectory).toHaveBeenCalledOnce();
  });

  it("fails closed outside Linux and when no adapter exists", async () => {
    const linux = runtime(["/usr/bin/grim"]);
    const nonLinux = { ...linux, host: { ...linux.host, platform: "darwin" as const } };
    await expect(captureDesktopScreenshot(nonLinux)).rejects.toThrow("Linux desktop only");

    await expect(captureDesktopScreenshot(runtime([]))).rejects.toThrow(
      "No supported executable screenshot adapter",
    );
  });
});
