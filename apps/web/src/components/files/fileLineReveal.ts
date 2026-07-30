export const FILE_LINK_REVEAL_ATTRIBUTE = "data-file-link-reveal";

export type FileRevealGenerationOwnership = "advanced" | "current" | "stale";

export function claimFileRevealGeneration(
  latestRequestIdsByPath: Map<string, number>,
  relativePath: string,
  revealRequestId: number,
): FileRevealGenerationOwnership {
  const latestRequestId = latestRequestIdsByPath.get(relativePath);
  if (latestRequestId !== undefined && revealRequestId < latestRequestId) {
    return "stale";
  }
  if (latestRequestId === revealRequestId) {
    return "current";
  }
  latestRequestIdsByPath.set(relativePath, revealRequestId);
  return "advanced";
}

export function clampFileLine(contents: string, requestedLine: number): number {
  let lineCount = 1;
  for (let index = 0; index < contents.length; index += 1) {
    const character = contents.charCodeAt(index);
    if (character === 10) {
      lineCount += 1;
    } else if (character === 13) {
      lineCount += 1;
      if (contents.charCodeAt(index + 1) === 10) index += 1;
    }
  }
  return Math.min(Math.max(1, requestedLine), lineCount);
}

export function updateFileLinkReveal(fileContainer: HTMLElement, line: number | null): void {
  const root = fileContainer.shadowRoot ?? fileContainer;
  for (const element of root.querySelectorAll<HTMLElement>(`[${FILE_LINK_REVEAL_ATTRIBUTE}]`)) {
    element.removeAttribute(FILE_LINK_REVEAL_ATTRIBUTE);
  }
  if (line === null) return;

  root
    .querySelector<HTMLElement>(`[data-line="${line}"]`)
    ?.setAttribute(FILE_LINK_REVEAL_ATTRIBUTE, "");
  root
    .querySelector<HTMLElement>(`[data-column-number="${line}"]`)
    ?.setAttribute(FILE_LINK_REVEAL_ATTRIBUTE, "");
}

export function centeredFileRevealScrollTop(input: {
  scrollTop: number;
  scrollHeight: number;
  viewportHeight: number;
  fileTop: number;
  lineTop: number;
  lineHeight: number;
}): number {
  const centeredTop = Math.max(
    0,
    input.scrollTop +
      input.fileTop +
      input.lineTop -
      Math.max(0, (input.viewportHeight - input.lineHeight) / 2),
  );
  return Math.min(centeredTop, Math.max(0, input.scrollHeight - input.viewportHeight));
}
