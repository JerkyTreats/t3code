export type ComposerRichDraftFormat = "bold" | "italic" | "bullet-list" | "link" | "code";

export interface ComposerRichDraftEdit {
  rangeStart: number;
  rangeEnd: number;
  replacement: string;
  nextExpandedCursor: number;
}

function clampCursor(text: string, cursor: number): number {
  if (!Number.isFinite(cursor)) {
    return text.length;
  }
  return Math.max(0, Math.min(text.length, Math.floor(cursor)));
}

function normalizeSelectionRange(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): { start: number; end: number } {
  const safeStart = clampCursor(text, selectionStart);
  const safeEnd = clampCursor(text, selectionEnd);
  return safeStart <= safeEnd
    ? { start: safeStart, end: safeEnd }
    : { start: safeEnd, end: safeStart };
}

function wrapSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix = prefix,
): ComposerRichDraftEdit {
  const { start, end } = normalizeSelectionRange(text, selectionStart, selectionEnd);
  const selectedText = text.slice(start, end);
  if (selectedText.length === 0) {
    return {
      rangeStart: start,
      rangeEnd: end,
      replacement: `${prefix}${suffix}`,
      nextExpandedCursor: start + prefix.length,
    };
  }
  return {
    rangeStart: start,
    rangeEnd: end,
    replacement: `${prefix}${selectedText}${suffix}`,
    nextExpandedCursor: start + prefix.length + selectedText.length + suffix.length,
  };
}

function buildBulletListEdit(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): ComposerRichDraftEdit {
  const { start, end } = normalizeSelectionRange(text, selectionStart, selectionEnd);
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let lineEnd = end;
  while (lineEnd < text.length && text[lineEnd] !== "\n") {
    lineEnd += 1;
  }

  const selectedBlock = text.slice(lineStart, lineEnd);
  const lines = selectedBlock.length > 0 ? selectedBlock.split("\n") : [""];
  const shouldUnwrap = lines.every((line) => line.startsWith("- "));
  const replacement = shouldUnwrap
    ? lines.map((line) => line.slice(2)).join("\n")
    : lines.map((line) => (line.startsWith("- ") ? line : `- ${line}`)).join("\n");

  return {
    rangeStart: lineStart,
    rangeEnd: lineEnd,
    replacement,
    nextExpandedCursor: lineStart + replacement.length,
  };
}

function buildLinkEdit(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): ComposerRichDraftEdit {
  const { start, end } = normalizeSelectionRange(text, selectionStart, selectionEnd);
  const selectedText = text.slice(start, end);
  const label = selectedText.length > 0 ? selectedText : "link text";
  const url = "https://";
  const replacement = `[${label}](${url})`;
  return {
    rangeStart: start,
    rangeEnd: end,
    replacement,
    nextExpandedCursor: start + replacement.length - 1,
  };
}

function buildCodeEdit(
  text: string,
  selectionStart: number,
  selectionEnd: number,
): ComposerRichDraftEdit {
  const { start, end } = normalizeSelectionRange(text, selectionStart, selectionEnd);
  const selectedText = text.slice(start, end);
  if (selectedText.includes("\n")) {
    const replacement = `\`\`\`\n${selectedText}\n\`\`\``;
    return {
      rangeStart: start,
      rangeEnd: end,
      replacement,
      nextExpandedCursor: start + replacement.length,
    };
  }
  if (selectedText.length === 0) {
    return {
      rangeStart: start,
      rangeEnd: end,
      replacement: "``",
      nextExpandedCursor: start + 1,
    };
  }
  return {
    rangeStart: start,
    rangeEnd: end,
    replacement: `\`${selectedText}\``,
    nextExpandedCursor: start + selectedText.length + 2,
  };
}

export function buildComposerRichDraftEdit(options: {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  format: ComposerRichDraftFormat;
}): ComposerRichDraftEdit {
  const { text, selectionStart, selectionEnd, format } = options;
  switch (format) {
    case "bold":
      return wrapSelection(text, selectionStart, selectionEnd, "**");
    case "italic":
      return wrapSelection(text, selectionStart, selectionEnd, "_");
    case "bullet-list":
      return buildBulletListEdit(text, selectionStart, selectionEnd);
    case "link":
      return buildLinkEdit(text, selectionStart, selectionEnd);
    case "code":
      return buildCodeEdit(text, selectionStart, selectionEnd);
  }
}
