import type { RenderResult } from "mermaid";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createMermaidConfig,
  createRetryableMermaidLibraryLoader,
  createSerializedMermaidRenderer,
  MAX_SERIALIZED_MERMAID_WORK,
} from "./mermaidRenderer";
import { getDefaultMermaidThemeSnapshot } from "./mermaidTheme";

function result(id: string): RenderResult {
  return { svg: `<svg id="${id}" />`, diagramType: "flowchart" };
}

function request(id: string, theme: "light" | "dark" = "dark") {
  return {
    id,
    code: "graph TD; A --> B",
    theme,
    palette: getDefaultMermaidThemeSnapshot(theme).palette,
  };
}

describe("serialized Mermaid renderer", () => {
  it("keeps strict security while applying Mermaid-compatible semantic colors", () => {
    const palette = {
      ...getDefaultMermaidThemeSnapshot("dark").palette,
      background: "oklch(14.5% 0 none)",
      surface: "invalid",
      accent: "oklch(14.5% 0 none / 50%)",
    };
    const config = createMermaidConfig("dark", palette);

    expect(config.securityLevel).toBe("strict");
    expect(config.htmlLabels).toBe(false);
    expect(config.themeVariables).toMatchObject({
      background: "#0a0a0a",
      mainBkg: "#151922",
      secondaryBorderColor: "#0a0a0a80",
    });
    for (const color of Object.values(config.themeVariables ?? {})) {
      expect(color).toMatch(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/);
    }
  });

  it("retries the dynamic import after a rejected load", async () => {
    const library = { initialize: vi.fn(), render: vi.fn() };
    const importLibrary = vi
      .fn<() => Promise<{ default: typeof library }>>()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce({ default: library });
    const loadLibrary = createRetryableMermaidLibraryLoader(importLibrary);

    await expect(loadLibrary()).rejects.toThrow("chunk unavailable");
    await expect(loadLibrary()).resolves.toBe(library);
    expect(importLibrary).toHaveBeenCalledTimes(2);
  });

  it("serializes global initialization and rendering", async () => {
    const events: string[] = [];
    let finishFirst = (): void => {
      throw new Error("First render was not initialized.");
    };
    const library = {
      initialize: vi.fn(() => {
        events.push("initialize");
      }),
      render: vi.fn((id: string) => {
        events.push(`render:${id}`);
        if (id === "first") {
          return new Promise<RenderResult>((resolve) => {
            finishFirst = () => resolve(result(id));
          });
        }
        return Promise.resolve(result(id));
      }),
    };
    const render = createSerializedMermaidRenderer(async () => library);

    const first = render(request("first"));
    const second = render(request("second", "light"));
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["initialize", "render:first"]);
    finishFirst();
    await expect(first).resolves.toEqual(result("first"));
    await expect(second).resolves.toEqual(result("second"));
    expect(events).toEqual(["initialize", "render:first", "initialize", "render:second"]);
  });

  it("captures palette values when work is admitted", async () => {
    let finishFirst = (): void => undefined;
    const initializedBackgrounds: unknown[] = [];
    const library = {
      initialize: vi.fn((config: { themeVariables?: { background?: string } }) => {
        initializedBackgrounds.push(config.themeVariables?.background);
      }),
      render: vi.fn((id: string) => {
        if (id === "first") {
          return new Promise<RenderResult>((resolve) => {
            finishFirst = () => resolve(result(id));
          });
        }
        return Promise.resolve(result(id));
      }),
    };
    const render = createSerializedMermaidRenderer(async () => library);
    const first = render(request("first"));
    const palette = { ...getDefaultMermaidThemeSnapshot("light").palette };
    const second = render({ ...request("second", "light"), palette });
    palette.background = "#changed-after-admission";

    await Promise.resolve();
    await Promise.resolve();
    finishFirst();
    await first;
    await second;

    expect(initializedBackgrounds).toEqual(["#111318", "#ffffff"]);
  });

  it("continues with the next render after a failure", async () => {
    const library = {
      initialize: vi.fn(),
      render: vi
        .fn<(id: string, code: string) => Promise<RenderResult>>()
        .mockRejectedValueOnce(new Error("invalid diagram"))
        .mockResolvedValueOnce(result("second")),
    };
    const render = createSerializedMermaidRenderer(async () => library);

    await expect(render({ ...request("first"), code: "invalid" })).rejects.toThrow(
      "invalid diagram",
    );
    await expect(render(request("second", "light"))).resolves.toEqual(result("second"));

    expect(library.initialize).toHaveBeenCalledTimes(2);
    expect(library.render).toHaveBeenCalledTimes(2);
  });

  it("bounds admitted serialized work", async () => {
    const library = {
      initialize: vi.fn(),
      render: vi.fn((id: string) => Promise.resolve(result(id))),
    };
    const render = createSerializedMermaidRenderer(async () => library);
    const admitted = Array.from({ length: MAX_SERIALIZED_MERMAID_WORK }, (_, index) =>
      render(request(`admitted-${index}`)),
    );

    await expect(render(request("overflow", "light"))).rejects.toThrow("work limit");
    await expect(Promise.all(admitted)).resolves.toHaveLength(MAX_SERIALIZED_MERMAID_WORK);
  });
});
