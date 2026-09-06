import type { RenderResult } from "mermaid";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  clearMermaidRenderCache,
  getCachedMermaidRender,
  getOrCreateMermaidRender,
  MAX_MERMAID_CACHE_ENTRIES,
  MAX_PENDING_MERMAID_RENDERS,
  mermaidRenderCacheKey,
  type MermaidRenderIdentity,
} from "./mermaidRenderCache";

const RESULT: RenderResult = {
  svg: '<svg id="diagram" />',
  diagramType: "flowchart",
};
const IDENTITY: MermaidRenderIdentity = {
  surfaceId: "message:assistant-1",
  sourceStart: 12,
  sourceEnd: 45,
  code: "graph TD; A --> B",
  theme: "dark",
  paletteKey: "dark-palette-a",
  configRevision: 2,
};

describe("Mermaid render cache", () => {
  beforeEach(() => {
    clearMermaidRenderCache();
  });

  it("reuses completed work for the same semantic diagram", async () => {
    const key = mermaidRenderCacheKey(IDENTITY);
    const render = vi.fn(async () => RESULT);

    await expect(getOrCreateMermaidRender(key, render)).resolves.toBe(RESULT);
    await expect(getOrCreateMermaidRender(key, render)).resolves.toBe(RESULT);

    expect(render).toHaveBeenCalledTimes(1);
    expect(getCachedMermaidRender(key)).toBe(RESULT);
  });

  it("shares in-flight work across a component remount", async () => {
    const key = mermaidRenderCacheKey(IDENTITY);
    let resolveRender = (_result: RenderResult): void => {
      throw new Error("Render promise was not initialized.");
    };
    const render = vi.fn(
      () =>
        new Promise<RenderResult>((resolve) => {
          resolveRender = resolve;
        }),
    );

    const first = getOrCreateMermaidRender(key, render);
    const remounted = getOrCreateMermaidRender(key, render);
    expect(render).toHaveBeenCalledTimes(1);

    resolveRender(RESULT);
    await expect(first).resolves.toBe(RESULT);
    await expect(remounted).resolves.toBe(RESULT);
  });

  it.each([
    ["surface", { surfaceId: "message:assistant-2" }],
    ["source start", { sourceStart: 13 }],
    ["source end", { sourceEnd: 46 }],
    ["code", { code: "graph TD; B --> C" }],
    ["theme", { theme: "light" as const }],
    ["effective palette", { paletteKey: "dark-palette-b" }],
    ["configuration revision", { configRevision: 3 }],
  ])("separates work when %s changes", async (_label, change) => {
    const firstKey = mermaidRenderCacheKey(IDENTITY);
    const secondKey = mermaidRenderCacheKey({ ...IDENTITY, ...change });
    const render = vi.fn(async () => RESULT);

    await getOrCreateMermaidRender(firstKey, render);
    await getOrCreateMermaidRender(secondKey, render);

    expect(secondKey).not.toBe(firstKey);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("allows a failed render to be retried", async () => {
    const key = mermaidRenderCacheKey(IDENTITY);
    const render = vi
      .fn<() => Promise<RenderResult>>()
      .mockRejectedValueOnce(new Error("invalid diagram"))
      .mockResolvedValueOnce(RESULT);

    await expect(getOrCreateMermaidRender(key, render)).rejects.toThrow("invalid diagram");
    await expect(getOrCreateMermaidRender(key, render)).resolves.toBe(RESULT);

    expect(render).toHaveBeenCalledTimes(2);
  });

  it("bounds distinct pending render admission", async () => {
    const never = () => new Promise<RenderResult>(() => undefined);
    for (let index = 0; index < MAX_PENDING_MERMAID_RENDERS; index += 1) {
      void getOrCreateMermaidRender(`pending:${index}`, never);
    }

    await expect(getOrCreateMermaidRender("pending:overflow", never)).rejects.toThrow(
      "admission limit",
    );
  });

  it("bounds completed render retention", async () => {
    for (let index = 0; index <= MAX_MERMAID_CACHE_ENTRIES; index += 1) {
      await getOrCreateMermaidRender(`completed:${index}`, async () => RESULT);
    }

    expect(getCachedMermaidRender("completed:0")).toBeNull();
    expect(getCachedMermaidRender(`completed:${MAX_MERMAID_CACHE_ENTRIES}`)).toBe(RESULT);
  });
});
