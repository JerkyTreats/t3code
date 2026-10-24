import { Suspense, type ReactElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { act, render } from "../../../test/render";
import { MarkdownMermaidCodeBlock } from "../../components/chat/MarkdownMermaidCodeBlock";
import { MarkdownFindContext } from "../../components/chat/markdownFindContext";
import { MermaidDiagram } from "../../components/chat/MermaidDiagram";
import { clearMermaidDiagramHeights } from "./mermaidDiagramHeights";

// A synchronous stand-in for pele: the first word of a source is its diagram type, so
// each test owns a type and the module-level load cache cannot leak between tests.
const pele = vi.hoisted(() => ({
  log: [] as string[],
  failingLoads: new Set<string>(),
  throwingMounts: new Set<string>(),
}));
vi.mock("pele/lazy", () => ({
  detectType: (source: string) => source.split(/\s/)[0],
  load: async (type: string) => {
    if (pele.failingLoads.delete(type)) throw new Error("chunk failed");
    return true;
  },
  mount: (
    container: HTMLElement,
    source: string,
    options: { onRender?: () => void; onError?: (error: unknown) => void },
  ) => {
    if (pele.throwingMounts.delete(source)) throw new Error("mount crashed");
    pele.log.push(`mount ${source}`);
    if (source.includes("invalid")) {
      options.onError?.(new Error("Parse error on line 1"));
    } else {
      container.innerHTML = `<svg data-source="${source}" width="10" height="10"></svg>`;
      options.onRender?.();
    }
    return {
      destroy: () => {
        pele.log.push(`destroy ${source}`);
        container.replaceChildren();
      },
    };
  },
}));

function freshPele(): Disposable {
  const reset = () => {
    pele.log.length = 0;
    pele.failingLoads.clear();
    pele.throwingMounts.clear();
    clearMermaidDiagramHeights();
  };
  reset();
  return { [Symbol.dispose]: reset };
}

function block(
  code: string,
  props: { theme?: "light" | "dark"; isStreaming?: boolean; onExpand?: (url: string) => void } = {},
): ReactElement {
  return (
    <MarkdownMermaidCodeBlock
      code={code}
      fenceTitle={null}
      theme={props.theme ?? "light"}
      isStreaming={props.isStreaming ?? false}
      onExpand={props.onExpand ?? (() => undefined)}
    >
      <pre data-testid="source">{code}</pre>
    </MarkdownMermaidCodeBlock>
  );
}

function diagramSources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("svg[data-source]"), (svg) =>
    svg.getAttribute("data-source"),
  ).filter((source) => source !== null);
}

function button(container: HTMLElement, label: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

describe("MarkdownMermaidCodeBlock", () => {
  it("renders through the visibility gate and toggles between diagram and source", async () => {
    using _pele = freshPele();
    const source = "toggle A-->B";
    await using screen = await render(block(source), { router: false });
    const { container } = screen;

    await vi.waitFor(() => expect(diagramSources(container)).toEqual([source]));
    expect(container.querySelector("[data-mermaid-visibility=visible]")).not.toBeNull();
    expect(container.querySelector("[data-testid=source]")).toBeNull();

    await act(async () => button(container, "Show code")!.click());
    expect(diagramSources(container)).toEqual([]);
    expect(container.querySelector("[data-testid=source]")?.textContent).toBe(source);
    expect(pele.log).toEqual([`mount ${source}`, `destroy ${source}`]);

    await act(async () => button(container, "Show diagram")!.click());
    await vi.waitFor(() => expect(diagramSources(container)).toEqual([source]));
  });

  it("reveals the source when find selects a match inside the diagram", async () => {
    using _pele = freshPele();
    const source = "find A-->B";
    await using screen = await render(
      <MarkdownFindContext value={true}>{block(source)}</MarkdownFindContext>,
      { router: false },
    );
    const { container } = screen;
    await vi.waitFor(() => expect(diagramSources(container)).toEqual([source]));
    const hiddenSource = container.querySelector<HTMLElement>("pre[hidden]");
    expect(hiddenSource?.textContent).toBe(source);

    await act(async () => hiddenSource!.dispatchEvent(new Event("beforematch")));
    expect(diagramSources(container)).toEqual([]);
    expect(container.querySelector("[data-testid=source]")?.textContent).toBe(source);
    expect(button(container, "Show diagram")).not.toBeNull();
  });

  it("expands the rendered diagram as an image", async () => {
    using _pele = freshPele();
    const onExpand = vi.fn<(url: string) => void>();
    await using screen = await render(block("expand A-->B", { onExpand }), { router: false });
    const { container } = screen;
    await vi.waitFor(() => expect(button(container, "Expand diagram")).not.toBeNull());

    await act(async () => button(container, "Expand diagram")!.click());
    expect(onExpand).toHaveBeenCalledOnce();
    expect(onExpand.mock.calls[0]![0]).toMatch(/^blob:/);
  });

  it("keeps a streaming fence as source until it closes", async () => {
    using _pele = freshPele();
    const source = "streaming A-->B";
    await using screen = await render(block(source, { isStreaming: true }), { router: false });
    const { container } = screen;

    expect(container.querySelector("[data-testid=source]")?.textContent).toBe(source);
    expect(container.querySelector("[data-mermaid-visibility]")).toBeNull();
    expect(button(container, "Show code")).toBeNull();
    expect(pele.log).toEqual([]);

    await screen.rerender(block(source));
    await vi.waitFor(() => expect(diagramSources(container)).toEqual([source]));
  });

  it("retries a diagram type whose renderer chunk failed to load", async () => {
    using _pele = freshPele();
    const source = "retry A-->B";
    pele.failingLoads.add("retry");
    await using screen = await render(block(source), { router: false });
    const { container } = screen;

    await vi.waitFor(() =>
      expect(container.textContent).toContain("The diagram renderer failed to load."),
    );
    expect(pele.log).toEqual([]);

    const retry = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent === "Retry",
    );
    await act(async () => retry!.click());
    await vi.waitFor(() => expect(diagramSources(container)).toEqual([source]));
    expect(container.textContent).not.toContain("failed to load");
  });

  it("clears a pele render error when the source changes", async () => {
    using _pele = freshPele();
    await using screen = await render(block("errors invalid"), { router: false });
    const { container } = screen;
    await vi.waitFor(() =>
      expect(container.textContent).toContain("Unable to render diagram: Parse error on line 1"),
    );
    expect(button(container, "Expand diagram")?.hidden).toBe(true);

    await screen.rerender(block("errors A-->B"));
    await vi.waitFor(() => expect(diagramSources(container)).toEqual(["errors A-->B"]));
    expect(container.textContent).not.toContain("Unable to render diagram");
    expect(button(container, "Expand diagram")?.hidden).toBe(false);
  });

  it.each([
    { change: "theme", next: { code: "boundary A-->B", theme: "dark" as const } },
    { change: "source", next: { code: "boundary A-->C", theme: "light" as const } },
  ])("resets a crashed diagram to source and retries it on a $change change", async ({ next }) => {
    using _pele = freshPele();
    const source = "boundary A-->B";
    pele.throwingMounts.add(source);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await using screen = await render(block(source), { router: false });
      const { container } = screen;
      await vi.waitFor(() =>
        expect(container.querySelector("[data-testid=source]")?.textContent).toBe(source),
      );
      expect(diagramSources(container)).toEqual([]);

      await screen.rerender(block(next.code, { theme: next.theme }));
      await vi.waitFor(() => expect(diagramSources(container)).toEqual([next.code]));
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe("MermaidDiagram", () => {
  it("destroys a replaced diagram before its successor mounts", async () => {
    using _pele = freshPele();
    const diagram = (source: string) => (
      <Suspense fallback={null}>
        <MermaidDiagram source={source} onExpand={() => undefined} />
      </Suspense>
    );
    await using screen = await render(diagram("replace A-->B"), { router: false });
    const { container } = screen;
    await vi.waitFor(() => expect(diagramSources(container)).toEqual(["replace A-->B"]));

    await screen.rerender(diagram("replace A-->C"));
    await vi.waitFor(() => expect(diagramSources(container)).toEqual(["replace A-->C"]));
    expect(pele.log).toEqual([
      "mount replace A-->B",
      "destroy replace A-->B",
      "mount replace A-->C",
    ]);

    await screen.unmount();
    expect(pele.log.at(-1)).toBe("destroy replace A-->C");
  });
});
