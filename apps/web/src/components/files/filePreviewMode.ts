export const isMarkdownPreviewFile = (path: string): boolean => /\.(?:md|mdx)$/i.test(path);

export type FilePreviewMode = "rendered-markdown" | "source" | "code";

export function markdownLineRevealRequestKey(
  ownerKey: string,
  relativePath: string | null,
  revealLine: number | null,
  revealRequestId: number,
): string | null {
  if (!relativePath || revealLine === null || !isMarkdownPreviewFile(relativePath)) {
    return null;
  }
  return JSON.stringify([ownerKey, relativePath, revealRequestId]);
}

export function markdownLineRevealSourcePath(
  ownerKey: string,
  relativePath: string | null,
  revealLine: number | null,
  revealRequestId: number,
  dismissedRequestKey: string | null,
): string | null {
  const requestKey = markdownLineRevealRequestKey(
    ownerKey,
    relativePath,
    revealLine,
    revealRequestId,
  );
  return requestKey === null || requestKey === dismissedRequestKey ? null : relativePath;
}

export function resolveFilePreviewMode(
  relativePath: string | null,
  markdownSourcePath: string | null,
): FilePreviewMode {
  if (!relativePath || !isMarkdownPreviewFile(relativePath)) {
    return "code";
  }
  return markdownSourcePath === relativePath ? "source" : "rendered-markdown";
}

export function setMarkdownTaskChecked(
  markdown: string,
  markerOffset: number,
  checked: boolean,
): string {
  if (
    markerOffset < 0 ||
    markdown[markerOffset] !== "[" ||
    !/[ xX]/.test(markdown[markerOffset + 1] ?? "") ||
    markdown[markerOffset + 2] !== "]"
  ) {
    return markdown;
  }

  return `${markdown.slice(0, markerOffset + 1)}${checked ? "x" : " "}${markdown.slice(markerOffset + 2)}`;
}
