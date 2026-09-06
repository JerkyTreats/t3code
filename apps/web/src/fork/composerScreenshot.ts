import type { DesktopBridge, DesktopScreenshotCapture } from "@t3tools/contracts";

export type ComposerScreenshotCapture = NonNullable<DesktopBridge["captureDesktopScreenshot"]>;

export function resolveComposerScreenshotCapture(
  desktopBridge: DesktopBridge | undefined,
): ComposerScreenshotCapture | null {
  return desktopBridge?.captureDesktopScreenshot ?? null;
}

export function composerScreenshotFile(capture: DesktopScreenshotCapture): File {
  const bytes = Uint8Array.from(capture.data);
  return new File([bytes.buffer], capture.name, { type: "image/png" });
}

export async function captureComposerScreenshot(
  captureScreenshot: ComposerScreenshotCapture,
): Promise<File | null> {
  const capture = await captureScreenshot();
  return capture === null ? null : composerScreenshotFile(capture);
}
