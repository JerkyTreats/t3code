import type { ReactTestRenderer } from "react-test-renderer";
import type { RenderResult } from "mermaid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

process.env.NODE_ENV = "development";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const renderMermaidDiagram = vi.hoisted(() => vi.fn());

vi.mock("./mermaidRenderer", () => ({
  MERMAID_CONFIG_REVISION: 2,
  renderMermaidDiagram,
}));

const React = await import("react");
const TestRenderer = await import("react-test-renderer");
const { clearMermaidRenderCache } = await import("./mermaidRenderCache");
const { isMermaidFenceLanguage, MermaidDiagramBlock } = await import("./MermaidDiagramBlock");

const RESULT: RenderResult = {
  svg: '<svg id="rendered-diagram" />',
  diagramType: "flowchart",
};

function diagram(input?: {
  key?: string;
  isStreaming?: boolean;
  code?: string;
  theme?: "light" | "dark";
}) {
  return (
    <MermaidDiagramBlock
      key={input?.key}
      surfaceId="message:assistant-1"
      sourceStart={12}
      sourceEnd={45}
      code={input?.code ?? "graph TD; A --> B"}
      fallback={
        <pre>
          <code>{input?.code ?? "graph TD; A --> B"}</code>
        </pre>
      }
      theme={input?.theme ?? "dark"}
      isStreaming={input?.isStreaming ?? false}
    />
  );
}

async function createDiagram(element: React.ReactElement): Promise<ReactTestRenderer> {
  let renderer: ReactTestRenderer | undefined;
  await React.act(async () => {
    renderer = TestRenderer.create(element);
  });
  if (!renderer) throw new Error("Renderer was not created.");
  return renderer;
}

beforeEach(() => {
  clearMermaidRenderCache();
  renderMermaidDiagram.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MermaidDiagramBlock", () => {
  it("accepts only the exact Mermaid fence languages", () => {
    expect(isMermaidFenceLanguage("mermaid")).toBe(true);
    expect(isMermaidFenceLanguage("MMD")).toBe(true);
    expect(isMermaidFenceLanguage("mermaid-js")).toBe(false);
    expect(isMermaidFenceLanguage("")).toBe(false);
  });

  it("keeps a streaming placeholder without starting work", async () => {
    const renderer = await createDiagram(diagram({ isStreaming: true }));

    expect(renderer.root.findByProps({ role: "status" }).children).toEqual([
      "Waiting for diagram...",
    ]);
    expect(renderMermaidDiagram).not.toHaveBeenCalled();

    await React.act(async () => renderer.unmount());
  });

  it("starts rendering when a streaming diagram completes", async () => {
    renderMermaidDiagram.mockResolvedValue(RESULT);
    const renderer = await createDiagram(diagram({ isStreaming: true }));

    await React.act(async () => {
      renderer.update(diagram({ isStreaming: false }));
    });

    expect(renderMermaidDiagram).toHaveBeenCalledOnce();
    expect(renderMermaidDiagram.mock.calls[0]?.[0]).toMatchObject({
      code: "graph TD; A --> B",
      theme: "dark",
      palette: { appearance: "dark" },
    });
    expect(
      renderer.root.findByProps({ className: "chat-markdown-mermaid-viewport" }).props,
    ).toHaveProperty("dangerouslySetInnerHTML", { __html: RESULT.svg });

    await React.act(async () => renderer.unmount());
  });

  it("reuses pending and completed semantic work across remounts", async () => {
    let finishRender = (_result: RenderResult): void => {
      throw new Error("Render promise was not initialized.");
    };
    renderMermaidDiagram.mockImplementationOnce(
      () =>
        new Promise<RenderResult>((resolve) => {
          finishRender = resolve;
        }),
    );
    const renderer = await createDiagram(diagram({ key: "first" }));

    await React.act(async () => {
      renderer.update(diagram({ key: "replacement" }));
    });
    expect(renderMermaidDiagram).toHaveBeenCalledTimes(1);

    await React.act(async () => {
      finishRender(RESULT);
    });
    expect(
      renderer.root.findByProps({ className: "chat-markdown-mermaid-viewport" }).props,
    ).toHaveProperty("dangerouslySetInnerHTML", { __html: RESULT.svg });

    await React.act(async () => {
      renderer.update(diagram({ key: "completed-remount" }));
    });
    expect(renderMermaidDiagram).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findByProps({ className: "chat-markdown-mermaid-viewport" }).props,
    ).toHaveProperty("dangerouslySetInnerHTML", { __html: RESULT.svg });

    await React.act(async () => renderer.unmount());
  });

  it("binds rendered interactions to the current viewport", async () => {
    const viewport = { kind: "mermaid-viewport" };
    const bindFunctions = vi.fn();
    renderMermaidDiagram.mockResolvedValue({ ...RESULT, bindFunctions });
    let renderer: ReactTestRenderer | undefined;

    await React.act(async () => {
      renderer = TestRenderer.create(diagram(), {
        createNodeMock: (element) => {
          const props = element.props as { className?: string };
          return props.className === "chat-markdown-mermaid-viewport" ? viewport : null;
        },
      });
    });

    expect(bindFunctions).toHaveBeenCalledWith(viewport);
    await React.act(async () => renderer?.unmount());
  });

  it.each([
    ["dynamic import", "Unable to load Mermaid renderer"],
    ["render", "Unexpected token on line 2"],
  ])("shows readable source and retry when %s fails", async (_failure, message) => {
    renderMermaidDiagram.mockRejectedValue(new Error(message));
    const renderer = await createDiagram(diagram());
    const error = renderer.root.findByProps({ className: "chat-markdown-mermaid-error" });

    expect(error.findByType("strong").children).toEqual(["Diagram render failed"]);
    expect(error.findByType("span").children).toEqual([message]);
    expect(error.findByType("code").children).toEqual(["graph TD; A --> B"]);
    expect(error.findByProps({ "aria-label": "Retry Mermaid diagram" }).props.type).toBe("button");

    await React.act(async () => renderer.unmount());
  });

  it("retries failed work in place without remounting", async () => {
    renderMermaidDiagram
      .mockRejectedValueOnce(new Error("Mermaid render admission limit reached."))
      .mockResolvedValueOnce(RESULT);
    const renderer = await createDiagram(diagram());

    expect(renderer.root.findByType("strong").children).toEqual(["Diagram render failed"]);
    await React.act(async () => {
      renderer.root.findByProps({ "aria-label": "Retry Mermaid diagram" }).props.onClick();
    });

    expect(renderMermaidDiagram).toHaveBeenCalledTimes(2);
    expect(
      renderer.root.findByProps({ className: "chat-markdown-mermaid-viewport" }).props,
    ).toHaveProperty("dangerouslySetInnerHTML", { __html: RESULT.svg });

    await React.act(async () => renderer.unmount());
  });

  it.each([
    ["source", { code: "graph TD; B --> C", theme: "dark" as const }],
    ["theme", { code: "graph TD; A --> B", theme: "light" as const }],
  ])("ignores a stale %s completion", async (_label, next) => {
    const completions: Array<(result: RenderResult) => void> = [];
    renderMermaidDiagram.mockImplementation(
      () =>
        new Promise<RenderResult>((resolve) => {
          completions.push(resolve);
        }),
    );
    const renderer = await createDiagram(diagram());

    await React.act(async () => {
      renderer.update(diagram(next));
    });
    expect(renderMermaidDiagram).toHaveBeenCalledTimes(2);

    const currentResult = { ...RESULT, svg: '<svg id="current" />' };
    await React.act(async () => {
      completions[1]?.(currentResult);
    });
    await React.act(async () => {
      completions[0]?.({ ...RESULT, svg: '<svg id="stale" />' });
    });

    expect(
      renderer.root.findByProps({ className: "chat-markdown-mermaid-viewport" }).props,
    ).toHaveProperty("dangerouslySetInnerHTML", { __html: currentResult.svg });
    await React.act(async () => renderer.unmount());
  });
});
