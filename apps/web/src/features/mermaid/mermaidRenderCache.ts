import type { RenderResult } from "mermaid";

import { LRUCache } from "~/lib/lruCache";

export const MAX_MERMAID_CACHE_ENTRIES = 64;
const MAX_MERMAID_CACHE_MEMORY_BYTES = 8 * 1024 * 1024;
export const MAX_PENDING_MERMAID_RENDERS = 32;

const completedMermaidRenders = new LRUCache<RenderResult>(
  MAX_MERMAID_CACHE_ENTRIES,
  MAX_MERMAID_CACHE_MEMORY_BYTES,
);
const pendingMermaidRenders = new Map<string, Promise<RenderResult>>();

export interface MermaidRenderIdentity {
  readonly surfaceId: string;
  readonly sourceStart: number | "unknown";
  readonly sourceEnd: number | "unknown";
  readonly code: string;
  readonly theme: "light" | "dark";
  readonly paletteKey: string;
  readonly configRevision: number;
}

export function mermaidRenderCacheKey(identity: MermaidRenderIdentity): string {
  // Source position isolates independent streaming blocks while code, effective
  // palette, and revision preserve semantic reuse across component remounts.
  return JSON.stringify([
    identity.surfaceId,
    identity.sourceStart,
    identity.sourceEnd,
    identity.code,
    identity.theme,
    identity.paletteKey,
    identity.configRevision,
  ]);
}

export function getCachedMermaidRender(key: string): RenderResult | null {
  return completedMermaidRenders.get(key);
}

export function getOrCreateMermaidRender(
  key: string,
  render: () => Promise<RenderResult>,
): Promise<RenderResult> {
  const completed = completedMermaidRenders.get(key);
  if (completed) return Promise.resolve(completed);

  const pending = pendingMermaidRenders.get(key);
  if (pending) return pending;

  if (pendingMermaidRenders.size >= MAX_PENDING_MERMAID_RENDERS) {
    return Promise.reject(new Error("Mermaid render admission limit reached."));
  }

  const renderPromise = render().then(
    (result) => {
      pendingMermaidRenders.delete(key);
      completedMermaidRenders.set(key, result, key.length * 2 + result.svg.length * 2 + 256);
      return result;
    },
    (error: unknown) => {
      pendingMermaidRenders.delete(key);
      throw error;
    },
  );
  pendingMermaidRenders.set(key, renderPromise);
  return renderPromise;
}

export function clearMermaidRenderCache(): void {
  completedMermaidRenders.clear();
  pendingMermaidRenders.clear();
}
