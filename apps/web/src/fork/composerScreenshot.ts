import type { DesktopBridge, DesktopScreenshotCapture } from "@t3tools/contracts";

import type { ComposerImageAttachment } from "../composerDraftStore";

export type AttachDesktopScreenshotResult =
  | { status: "attached"; image: ComposerImageAttachment }
  | { status: "cancelled" }
  | { status: "too-large"; maxBytes: number; sizeBytes: number; name: string }
  | { status: "too-many"; maxAttachments: number }
  | { status: "unavailable" };

export interface AttachDesktopScreenshotOptions {
  addImage: (image: ComposerImageAttachment) => void;
  bridge: Pick<DesktopBridge, "captureScreenshot"> | null | undefined;
  createImageId: () => string;
  currentImageCount: number;
  maxAttachments: number;
  maxImageBytes: number;
}

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

function decodePngDataUrl(dataUrl: string): Uint8Array {
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw new Error("Desktop screenshot data must be a PNG data URL.");
  }

  const payload = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  const binary = globalThis.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function composerImageFromDesktopScreenshot(
  capture: DesktopScreenshotCapture,
  imageId: string,
): ComposerImageAttachment {
  const bytes = decodePngDataUrl(capture.dataUrl);
  const fileBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(fileBuffer).set(bytes);
  const file = new File([fileBuffer], capture.name || "screenshot.png", {
    type: capture.mimeType,
    lastModified: Date.now(),
  });

  return {
    type: "image",
    id: imageId,
    name: capture.name || "screenshot.png",
    mimeType: capture.mimeType,
    sizeBytes: file.size,
    previewUrl: capture.dataUrl,
    file,
  };
}

export async function attachDesktopScreenshotToComposerDraft({
  addImage,
  bridge,
  createImageId,
  currentImageCount,
  maxAttachments,
  maxImageBytes,
}: AttachDesktopScreenshotOptions): Promise<AttachDesktopScreenshotResult> {
  if (typeof bridge?.captureScreenshot !== "function") {
    return { status: "unavailable" };
  }
  if (currentImageCount >= maxAttachments) {
    return { status: "too-many", maxAttachments };
  }

  const capture = await bridge.captureScreenshot();
  if (!capture) {
    return { status: "cancelled" };
  }
  if (capture.sizeBytes > maxImageBytes) {
    return {
      status: "too-large",
      maxBytes: maxImageBytes,
      sizeBytes: capture.sizeBytes,
      name: capture.name,
    };
  }

  const image = composerImageFromDesktopScreenshot(capture, createImageId());
  addImage(image);
  return { status: "attached", image };
}
