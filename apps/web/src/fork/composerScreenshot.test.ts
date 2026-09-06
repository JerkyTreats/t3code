import type { DesktopBridge } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  captureComposerScreenshot,
  composerScreenshotFile,
  resolveComposerScreenshotCapture,
} from "./composerScreenshot";

describe("composerScreenshot", () => {
  it("reports no capture capability outside the supported desktop bridge", () => {
    expect(resolveComposerScreenshotCapture(undefined)).toBeNull();
    expect(resolveComposerScreenshotCapture({} as DesktopBridge)).toBeNull();
  });

  it("uses only the optional desktop screenshot bridge capability", async () => {
    const captureDesktopScreenshot = vi.fn(async () => null);
    const bridge = { captureDesktopScreenshot } as unknown as DesktopBridge;

    const capture = resolveComposerScreenshotCapture(bridge);

    expect(capture).toBe(captureDesktopScreenshot);
    await expect(capture?.()).resolves.toBeNull();
    expect(captureDesktopScreenshot).toHaveBeenCalledOnce();
  });

  it("preserves the exact PNG filename and view bytes in a fresh File", async () => {
    const storage = Uint8Array.of(99, 137, 80, 78, 71, 13, 10, 26, 10, 42);
    const data = storage.subarray(1, 9);
    const file = composerScreenshotFile({
      name: "screenshot-2026-08-16T12-34-56-789Z.png",
      mimeType: "image/png",
      data,
    });
    storage.fill(0);

    expect(file.name).toBe("screenshot-2026-08-16T12-34-56-789Z.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(8);
    expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    expect("dataUrl" in file).toBe(false);
    expect("sizeBytes" in file).toBe(false);
  });

  it("returns one PNG File from the desktop capture", async () => {
    const captureScreenshot = vi.fn(async () => ({
      name: "capture.png",
      mimeType: "image/png" as const,
      data: Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
    }));

    const file = await captureComposerScreenshot(captureScreenshot);

    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("capture.png");
  });

  it("keeps explicit desktop cancellation silent", async () => {
    await expect(captureComposerScreenshot(vi.fn(async () => null))).resolves.toBeNull();
  });

  it("lets the bounded UI boundary handle capture failures", async () => {
    const failure = new Error("private capture bytes 137 80 78 71");
    await expect(
      captureComposerScreenshot(
        vi.fn(async () => {
          throw failure;
        }),
      ),
    ).rejects.toBe(failure);
  });
});
