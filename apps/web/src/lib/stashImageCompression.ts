import { MAX_STASH_IMAGE_DATA_URL_CHARS } from "../promptStashPolicy";

const MAX_IMAGE_DIMENSION = 2048;
const QUALITY_STEPS = [0.9, 0.8, 0.7, 0.6] as const;
const DIMENSION_STEPS = [1, 0.75, 0.5] as const;

export type StashImageNormalizationResult =
  | {
      readonly ok: true;
      readonly dataUrl: string;
      readonly mimeType: string;
      readonly sizeBytes: number;
    }
  | { readonly ok: false; readonly reason: "too-large" | "unreadable" };

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)));
  }
  return btoa(chunks.join(""));
}

async function blobToDataUrl(blob: Blob, mimeType = blob.type): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${mimeType || "application/octet-stream"};base64,${bytesToBase64(bytes)}`;
}

function dataUrlSizeBytes(dataUrl: string): number {
  const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

async function encodeCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  mimeType: "image/webp" | "image/jpeg",
  quality: number,
): Promise<string | null> {
  if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
    const dataUrl = canvas.toDataURL(mimeType, quality);
    return dataUrl.startsWith(`data:${mimeType}`) ? dataUrl : null;
  }
  const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: mimeType, quality });
  if (blob.type && blob.type !== mimeType) return null;
  return blobToDataUrl(blob, mimeType);
}

function createCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    return context ? { canvas, context } : null;
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  return context ? { canvas, context } : null;
}

async function recompressImage(file: File, budgetChars: number): Promise<string | null> {
  if (typeof createImageBitmap !== "function") return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("unreadable");
  }
  try {
    const longestEdge = Math.max(bitmap.width, bitmap.height);
    const baseScale = Math.min(1, MAX_IMAGE_DIMENSION / longestEdge);
    for (const dimensionStep of DIMENSION_STEPS) {
      const scale = baseScale * dimensionStep;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const target = createCanvas(width, height);
      if (!target) return null;

      let mimeType: "image/webp" | "image/jpeg" = "image/webp";
      try {
        const webpProbe = await encodeCanvas(target.canvas, "image/webp", QUALITY_STEPS[0]);
        if (!webpProbe) mimeType = "image/jpeg";
      } catch {
        mimeType = "image/jpeg";
      }
      if (mimeType === "image/jpeg") {
        target.context.fillStyle = "#ffffff";
        target.context.fillRect(0, 0, width, height);
      }
      target.context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of QUALITY_STEPS) {
        try {
          const dataUrl = await encodeCanvas(target.canvas, mimeType, quality);
          if (dataUrl && dataUrl.length <= budgetChars) return dataUrl;
        } catch {
          // A smaller canvas may still succeed after an allocation or codec failure.
        }
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

export async function normalizeImageForStash(
  file: File,
  budgetChars = MAX_STASH_IMAGE_DATA_URL_CHARS,
): Promise<StashImageNormalizationResult> {
  let originalDataUrl: string;
  try {
    originalDataUrl = await blobToDataUrl(file);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (originalDataUrl.length <= budgetChars) {
    return {
      ok: true,
      dataUrl: originalDataUrl,
      mimeType: file.type,
      sizeBytes: file.size,
    };
  }

  try {
    const dataUrl = await recompressImage(file, budgetChars);
    if (!dataUrl) return { ok: false, reason: "too-large" };
    return {
      ok: true,
      dataUrl,
      mimeType: dataUrl.slice(5, dataUrl.indexOf(";")) || "image/jpeg",
      sizeBytes: dataUrlSizeBytes(dataUrl),
    };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}
