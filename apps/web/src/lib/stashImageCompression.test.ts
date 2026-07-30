import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { MAX_STASH_IMAGE_DATA_URL_CHARS } from "../promptStashPolicy";
import { normalizeImageForStash } from "./stashImageCompression";

const originalCreateImageBitmap = globalThis.createImageBitmap;
const originalOffscreenCanvas = globalThis.OffscreenCanvas;

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.createImageBitmap = originalCreateImageBitmap;
  globalThis.OffscreenCanvas = originalOffscreenCanvas;
});

describe("normalizeImageForStash", () => {
  it("keeps a small image without decoding it", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const file = new File([new Uint8Array(256)], "small.png", { type: "image/png" });

    const result = await normalizeImageForStash(file);

    expect(result.ok).toBe(true);
    expect(result.ok && result.mimeType).toBe("image/png");
    expect(result.ok && result.dataUrl.length).toBeLessThanOrEqual(MAX_STASH_IMAGE_DATA_URL_CHARS);
    expect(decode).not.toHaveBeenCalled();
  });

  it("reports an oversized image when browser codecs are unavailable", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const bytes = Math.ceil((MAX_STASH_IMAGE_DATA_URL_CHARS * 3) / 4);
    const file = new File([new Uint8Array(bytes)], "large.png", { type: "image/png" });

    await expect(normalizeImageForStash(file)).resolves.toEqual({
      ok: false,
      reason: "too-large",
    });
  });
});
