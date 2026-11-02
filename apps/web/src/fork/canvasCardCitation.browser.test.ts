import { describe, expect, it } from "vite-plus/test";

import { captureAssistantTextSelection } from "~/lib/assistantTextSelection";

describe("a canvas card as a citation source", () => {
  it("lets the timeline's Cite capture words selected in a card, keyed by the card id", () => {
    const viewport = document.createElement("div");
    viewport.dataset.assistantCitationViewport = "true";
    viewport.innerHTML = `
      <div class="turn-layer"><div class="canvas-card" data-canvas-card="markdown">
        <div data-assistant-citation-source="aie-roadmap-map/asks"
             data-assistant-citation-environment="env" data-assistant-citation-thread="thread">
          <table><tbody><tr><td id="cell">PENG-274: NetBox token + Childress records</td></tr></tbody></table>
        </div>
      </div></div>`;
    document.body.append(viewport);
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(viewport.querySelector("#cell")!);
    selection.removeAllRanges();
    selection.addRange(range);
    const captured = captureAssistantTextSelection(viewport, selection);
    expect(captured?.source.dataset.assistantCitationSource).toBe("aie-roadmap-map/asks");
    expect(captured?.selector.text).toBe("PENG-274: NetBox token + Childress records");
    selection.removeAllRanges();
    viewport.remove();
  });
});
