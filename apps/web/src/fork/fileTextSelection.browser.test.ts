import { describe, expect, it } from "vite-plus/test";

import { captureAssistantTextSelection } from "~/lib/assistantTextSelection";

import { captureFileTextSelection } from "./fileTextSelection";

/** A file card on the board, its code in a shadow root as the file view renders it. */
function fileCard(editable: boolean) {
  const viewport = document.createElement("div");
  viewport.innerHTML = `
    <div data-canvas-card-id="card-1">
      <div data-file-citation-path="src/app.ts"><diffs-container></diffs-container></div>
    </div>
    <p>Outside the file.</p>`;
  const root = viewport.querySelector("diffs-container")!.attachShadow({ mode: "open" });
  root.innerHTML = `
    <pre><code data-code>
      <div data-gutter><div data-column-number="11">11</div><div data-column-number="12">12</div></div>
      <div data-content ${editable ? 'contenteditable="true"' : ""}><div data-line="11"><span>const a = 1;</span></div><div data-line="12"><span>const b = 2;</span></div><div data-line="13"><span>return a + b;</span></div><div data-line="14"><span>
</span></div></div>
    </code></pre>`;
  document.body.append(viewport);
  const line = (number: number) => root.querySelector(`[data-line="${number}"] span`)!.firstChild!;
  return { viewport, line, outside: viewport.querySelector("p")!.firstChild! };
}

describe("captureFileTextSelection", () => {
  it.each([false, true])(
    "quotes the selected text with its file path and lines (editable: %s)",
    (editable) => {
      const { viewport, line, outside } = fileCard(editable);
      const selection = document.getSelection()!;
      try {
        selection.setBaseAndExtent(line(11), 6, line(12), 7);
        // The code sits behind a shadow root, out of the assistant text reader's reach.
        expect(captureAssistantTextSelection(viewport, selection)).toBeNull();
        const captured = captureFileTextSelection(viewport, selection);
        expect(captured?.messageId).toBe("card-1");
        expect(captured?.selector).toEqual({
          text: "a = 1;\nconst b",
          start: 0,
          end: 14,
          prefix: "",
          suffix: "",
          file: { path: "src/app.ts", startLine: 11, endLine: 12 },
        });
        expect(captured?.range.toString()).toBe("a = 1;const b");
        // A drag that ends at the start of the next line takes only the lines above it.
        selection.setBaseAndExtent(line(12), 0, line(13), 0);
        expect(captureFileTextSelection(viewport, selection)?.selector).toMatchObject({
          text: "const b = 2;",
          file: { path: "src/app.ts", startLine: 12, endLine: 12 },
        });
        // A selected blank final line stays in the quote.
        selection.setBaseAndExtent(line(13), 0, line(14), 1);
        expect(captureFileTextSelection(viewport, selection)?.selector).toMatchObject({
          text: "return a + b;\n",
          file: { path: "src/app.ts", startLine: 13, endLine: 14 },
        });
        selection.setBaseAndExtent(outside, 0, outside, 7);
        expect(captureFileTextSelection(viewport, selection)).toBeNull();
      } finally {
        selection.removeAllRanges();
        viewport.remove();
      }
    },
  );
});
