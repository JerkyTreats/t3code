import { DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildDesktopScreenshotCapture,
  inspectDesktopScreenshotPng,
} from "./DesktopScreenshotPng.ts";

function pngBytes(): Uint8Array {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+7iQAAAAASUVORK5CYII=",
    "base64",
  );
}

function writeUint32(data: Uint8Array, offset: number, value: number): void {
  new DataView(data.buffer, data.byteOffset + offset, 4).setUint32(0, value, false);
}

function writeType(data: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    data[offset + index] = value.charCodeAt(index);
  }
}

function maximumSizePng(): Uint8Array {
  const data = new Uint8Array(DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES);
  data.set([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  writeUint32(data, offset, 13);
  writeType(data, offset + 4, "IHDR");
  offset += 25;
  const fillerLength = data.byteLength - offset - 12 - 12;
  writeUint32(data, offset, fillerLength);
  writeType(data, offset + 4, "IDAT");
  offset += fillerLength + 12;
  writeUint32(data, offset, 0);
  writeType(data, offset + 4, "IEND");
  return data;
}

describe("DesktopScreenshotPng", () => {
  it("accepts a complete PNG and builds the byte contract", () => {
    const bytes = pngBytes();
    const capture = buildDesktopScreenshotCapture(bytes, "capture.png");

    expect(capture).toMatchObject({
      name: "capture.png",
      mimeType: "image/png",
    });
    expect(Array.from(capture?.data ?? [])).toEqual(Array.from(bytes));
    expect(capture?.data).not.toBe(bytes);
  });

  it("distinguishes a valid pending prefix from malformed input", () => {
    const bytes = pngBytes();
    expect(inspectDesktopScreenshotPng(bytes.subarray(0, 4))).toEqual({ status: "pending" });
    expect(inspectDesktopScreenshotPng(bytes.subarray(0, bytes.byteLength - 8))).toEqual({
      status: "pending",
    });
    expect(inspectDesktopScreenshotPng(Uint8Array.of(1, 2, 3))).toEqual({
      status: "invalid",
      reason: "PNG signature is invalid.",
    });
  });

  it("requires IHDR first and a terminal empty IEND", () => {
    const badHeader = pngBytes();
    badHeader.set(Buffer.from("IDAT"), 12);
    expect(inspectDesktopScreenshotPng(badHeader)).toMatchObject({ status: "invalid" });

    const trailing = new Uint8Array(pngBytes().byteLength + 1);
    trailing.set(pngBytes());
    expect(inspectDesktopScreenshotPng(trailing)).toMatchObject({ status: "invalid" });
  });

  it("accepts the exact size ceiling and rejects one byte beyond it", () => {
    const exact = maximumSizePng();
    expect(inspectDesktopScreenshotPng(exact).status).toBe("ready");

    const oversized = new Uint8Array(DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES + 1);
    oversized.set(exact);
    expect(inspectDesktopScreenshotPng(oversized)).toMatchObject({ status: "invalid" });
  });
});
