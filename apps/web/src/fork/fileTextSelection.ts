import type { AssistantCitationFile } from "@t3tools/contracts";

/** The line a node sits on in a file view: a code row's `data-line` or a gutter number. */
function lineOf(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  const row = element?.closest<HTMLElement>("[data-line], [data-column-number]");
  const line = Number(row?.dataset.line ?? row?.dataset.columnNumber);
  return Number.isSafeInteger(line) && line > 0 ? line : null;
}

/** The selected range inside a shadow root; browsers without `getComposedRanges` keep it on the root. */
function rangeIn(selection: Selection, root: ShadowRoot): AbstractRange | undefined {
  if (typeof selection.getComposedRanges === "function") {
    return selection.getComposedRanges({ shadowRoots: [root] })[0];
  }
  const own = (root as ShadowRoot & { getSelection?: () => Selection | null }).getSelection?.();
  return own && own.rangeCount > 0 ? own.getRangeAt(0) : undefined;
}

/**
 * The text selected in a file card on the board, with its path and lines, for Cite. The file view
 * renders its code in a shadow root, read-only or editable, so the selection is read through it.
 */
export function captureFileTextSelection(viewport: HTMLElement, selection: Selection | null) {
  if (selection === null || selection.rangeCount !== 1) return null;
  for (const view of viewport.querySelectorAll<HTMLElement>("[data-file-citation-path]")) {
    const path = view.dataset.fileCitationPath;
    const messageId = view.closest<HTMLElement>("[data-canvas-card-id]")?.dataset.canvasCardId;
    if (!path || !messageId) continue;
    for (const host of view.querySelectorAll("diffs-container")) {
      const root = host.shadowRoot;
      const composed = root ? rangeIn(selection, root) : undefined;
      if (!root || !composed || composed.collapsed) continue;
      const startLine = lineOf(composed.startContainer);
      const lastLine = lineOf(composed.endContainer);
      const source = root.querySelector<HTMLElement>("[data-content]");
      if (startLine === null || lastLine === null || source === null) continue;
      const range = document.createRange();
      range.setStart(composed.startContainer, composed.startOffset);
      range.setEnd(composed.endContainer, composed.endOffset);
      const lines = [...root.querySelectorAll<HTMLElement>("[data-line]")]
        .filter(
          (row) => Number(row.dataset.line) >= startLine && Number(row.dataset.line) <= lastLine,
        )
        .map((row) => {
          const part = document.createRange();
          part.selectNodeContents(row);
          if (row.contains(range.startContainer))
            part.setStart(range.startContainer, range.startOffset);
          if (row.contains(range.endContainer)) part.setEnd(range.endContainer, range.endOffset);
          return part.toString();
        });
      let endLine = lastLine;
      // A drag that ends at the start of a line selects none of it; a selected blank line keeps its newline.
      if (lines.length > 1 && lines.at(-1) === "") {
        lines.pop();
        endLine -= 1;
      }
      const text = lines.map((line) => line.replace(/\r?\n$/, "")).join("\n");
      if (!text.trim()) return null;
      const file: AssistantCitationFile = { path, startLine, endLine };
      return {
        source,
        range,
        messageId,
        selector: { text, start: 0, end: text.length, prefix: "", suffix: "", file },
      };
    }
  }
  return null;
}
