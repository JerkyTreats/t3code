import {
  DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES,
  type DesktopScreenshotCapture,
} from "@t3tools/contracts";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CHUNK_OVERHEAD_BYTES = 12;
const PNG_IHDR_DATA_BYTES = 13;

export type DesktopScreenshotPngInspection =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "invalid"; reason: string }>
  | Readonly<{ status: "ready"; data: Uint8Array }>;

function hasSignaturePrefix(data: Uint8Array): boolean {
  const prefixLength = Math.min(data.byteLength, PNG_SIGNATURE.byteLength);
  for (let index = 0; index < prefixLength; index += 1) {
    if (data[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

function chunkType(data: Uint8Array, offset: number): string {
  return String.fromCharCode(
    data[offset + 4]!,
    data[offset + 5]!,
    data[offset + 6]!,
    data[offset + 7]!,
  );
}

export function inspectDesktopScreenshotPng(data: Uint8Array): DesktopScreenshotPngInspection {
  if (data.byteLength > DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES) {
    return {
      status: "invalid",
      reason: `PNG exceeds the ${DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES} byte capture limit.`,
    };
  }
  if (!hasSignaturePrefix(data)) {
    return { status: "invalid", reason: "PNG signature is invalid." };
  }
  if (data.byteLength < PNG_SIGNATURE.byteLength) return { status: "pending" };

  let offset = PNG_SIGNATURE.byteLength;
  let chunkIndex = 0;
  while (offset < data.byteLength) {
    if (data.byteLength - offset < 8) return { status: "pending" };

    const view = new DataView(data.buffer, data.byteOffset + offset, 4);
    const dataLength = view.getUint32(0, false);
    const type = chunkType(data, offset);
    const chunkLength = PNG_CHUNK_OVERHEAD_BYTES + dataLength;

    if (chunkLength > DESKTOP_SCREENSHOT_CAPTURE_MAX_BYTES - offset) {
      return { status: "invalid", reason: "PNG chunk length exceeds the capture limit." };
    }
    if (data.byteLength - offset < chunkLength) return { status: "pending" };

    if (chunkIndex === 0 && (type !== "IHDR" || dataLength !== PNG_IHDR_DATA_BYTES)) {
      return { status: "invalid", reason: "PNG must begin with a 13 byte IHDR chunk." };
    }
    if (chunkIndex > 0 && type === "IHDR") {
      return { status: "invalid", reason: "PNG contains more than one IHDR chunk." };
    }
    if (type === "IEND") {
      if (dataLength !== 0) {
        return { status: "invalid", reason: "PNG IEND chunk must be empty." };
      }
      if (offset + chunkLength !== data.byteLength) {
        return { status: "invalid", reason: "PNG contains data after its IEND chunk." };
      }
      return { status: "ready", data: new Uint8Array(data) };
    }

    offset += chunkLength;
    chunkIndex += 1;
  }

  return { status: "pending" };
}

export function buildDesktopScreenshotCapture(
  data: Uint8Array,
  name: string,
): DesktopScreenshotCapture | null {
  const inspection = inspectDesktopScreenshotPng(data);
  if (inspection.status !== "ready") return null;
  return {
    name,
    mimeType: "image/png",
    data: inspection.data,
  };
}
