// @effect-diagnostics nodeBuiltinImport:off
import path from "node:path";

import type { ProjectReadFileResult } from "@t3tools/contracts";

export const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;
export const MAX_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024;

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);

export function resolvePreviewLanguage(relativePath: string): string {
  const extension = path.extname(relativePath).toLowerCase();
  switch (extension) {
    case ".md":
    case ".markdown":
    case ".mdown":
    case ".mkd":
      return "markdown";
    case ".sh":
      return "bash";
    case ".yml":
      return "yaml";
    default:
      return extension.length > 1 ? extension.slice(1) : "text";
  }
}

export function isMarkdownPreviewPath(relativePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

export function classifyPreviewLineEnding(text: string): "lf" | "crlf" | "cr" | "none" {
  if (text.length === 0) {
    return "none";
  }
  if (text.includes("\r\n")) {
    return "crlf";
  }
  if (text.includes("\r")) {
    return "cr";
  }
  return "lf";
}

export function decodeUtf8PreviewText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) {
    return null;
  }

  let suspiciousControlBytes = 0;
  for (const byte of bytes) {
    if (byte === 9 || byte === 10 || byte === 13) {
      continue;
    }
    if (byte < 32) {
      suspiciousControlBytes += 1;
    }
  }

  if (bytes.length > 0 && suspiciousControlBytes / bytes.length > 0.05) {
    return null;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function buildPreviewResult(input: {
  relativePath: string;
  mimeType: string;
  byteSize: number;
  bytes: Uint8Array;
}): ProjectReadFileResult {
  if (input.mimeType.startsWith("image/")) {
    return {
      kind: "image",
      path: input.relativePath,
      dataUrl: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString("base64")}`,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
    };
  }

  const decodedText = decodeUtf8PreviewText(input.bytes);
  if (decodedText === null) {
    return {
      kind: "binary",
      path: input.relativePath,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
    };
  }

  return {
    kind: "text",
    path: input.relativePath,
    text: decodedText,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    language: resolvePreviewLanguage(input.relativePath),
    lineEnding: classifyPreviewLineEnding(decodedText),
    isMarkdown: isMarkdownPreviewPath(input.relativePath),
  };
}
