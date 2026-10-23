import { Suspense } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { act, render } from "../../../test/render";
import { MermaidDiagram } from "../../components/chat/MermaidDiagram";
import { clearMermaidDiagramHeights, rememberMermaidDiagramHeight } from "./mermaidDiagramHeights";
import { MermaidVisibleDiagram } from "./MermaidVisibleDiagram";

const SOURCE = "graph TD; A-->B";

// Rendered heights outlive a mount by design; each test starts and ends with none.
function freshHeights(): Disposable {
  clearMermaidDiagramHeights();
  return { [Symbol.dispose]: clearMermaidDiagramHeights };
}

function renderBelowFold(source: string) {
  const viewport = document.createElement("div");
  viewport.style.cssText = "height: 300px; overflow-y: auto;";
  return render(
    <div>
      <div style={{ height: 2000 }} />
      <MermaidVisibleDiagram source={source} placeholder={<pre data-testid="placeholder" />}>
        <div data-testid="diagram">
          <svg width="10" height="10" />
        </div>
      </MermaidVisibleDiagram>
    </div>,
    { container: viewport, router: false },
  );
}

describe("MermaidVisibleDiagram", () => {
  it("defers the diagram until its fence scrolls into view", async () => {
    using _heights = freshHeights();
    await using screen = await renderBelowFold(SOURCE);
    const viewport = screen.container;
    const gate = () => viewport.querySelector<HTMLElement>("[data-mermaid-visibility]")!;

    expect(gate().dataset.mermaidVisibility).toBe("pending");
    expect(viewport.querySelector("[data-testid=diagram]")).toBeNull();
    expect(viewport.querySelector("[data-testid=placeholder]")).not.toBeNull();

    await act(async () => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    await vi.waitFor(() => expect(gate().dataset.mermaidVisibility).toBe("visible"));
    expect(viewport.querySelector("[data-testid=diagram]")).not.toBeNull();
  });

  it("keeps a remounted cached diagram gated while reserving its rendered height", async () => {
    using _heights = freshHeights();
    rememberMermaidDiagramHeight(SOURCE, 240);
    await using screen = await renderBelowFold(SOURCE);
    const viewport = screen.container;
    const gate = viewport.querySelector<HTMLElement>("[data-mermaid-visibility]")!;

    expect(gate.dataset.mermaidVisibility).toBe("pending");
    expect(gate.style.minHeight).toBe("240px");
    expect(viewport.querySelector("[data-testid=diagram]")).toBeNull();
  });

  it("renders pele output that follows live semantic theme colors", async () => {
    using _heights = freshHeights();
    const viewport = document.createElement("div");
    viewport.className = "chat-markdown";
    await using _screen = await render(
      <MermaidVisibleDiagram source={SOURCE} placeholder={null}>
        <Suspense fallback={null}>
          <MermaidDiagram source={SOURCE} onExpand={() => undefined} />
        </Suspense>
      </MermaidVisibleDiagram>,
      { container: viewport, router: false },
    );
    await vi.waitFor(() => expect(viewport.querySelector("svg")).not.toBeNull(), {
      timeout: 10_000,
    });
    const svg = viewport.querySelector("svg")!;
    expect(svg.outerHTML).toContain("var(--pele-");

    // A same-mode palette change, like the transient Omarchy projection, recolors the
    // rendered diagram through the semantic role without another render.
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--background");
    root.style.setProperty("--background", "rgb(1, 2, 3)");
    try {
      expect(getComputedStyle(svg).getPropertyValue("--pele-bg").trim()).toBe("rgb(1, 2, 3)");
    } finally {
      root.style.setProperty("--background", previous);
    }
  });

  it("keeps the reading position when a diagram above the viewport changes height", async () => {
    using _heights = freshHeights();
    const viewport = document.createElement("div");
    viewport.style.cssText = "height: 300px; overflow-y: auto;";
    const tree = (height: number) => (
      <div>
        <MermaidVisibleDiagram source={SOURCE} placeholder={null}>
          <div style={{ height }}>
            <svg width="10" height="10" />
          </div>
        </MermaidVisibleDiagram>
        <div style={{ height: 4000 }} />
      </div>
    );
    await using screen = await render(tree(50), { container: viewport, router: false });
    await vi.waitFor(() =>
      expect(viewport.querySelector("[data-mermaid-visibility=visible]")).not.toBeNull(),
    );
    await act(async () => {
      viewport.scrollTop = 1000;
    });

    await screen.rerender(tree(250));
    await vi.waitFor(() => expect(viewport.scrollTop).toBe(1200));
  });
});
