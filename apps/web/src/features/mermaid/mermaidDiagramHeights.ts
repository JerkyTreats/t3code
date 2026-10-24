import { LRUCache } from "~/lib/lruCache";

const MAX_DIAGRAM_HEIGHT_ENTRIES = 256;
const MAX_DIAGRAM_HEIGHT_MEMORY_BYTES = 2 * 1024 * 1024;

// Pele colors diagrams through CSS variables, so a rendered height depends only
// on the exact source. Remounted rows reserve it before the diagram renders again.
const renderedHeights = new LRUCache<number>(
  MAX_DIAGRAM_HEIGHT_ENTRIES,
  MAX_DIAGRAM_HEIGHT_MEMORY_BYTES,
);

export function readMermaidDiagramHeight(source: string): number | null {
  return renderedHeights.get(source);
}

export function rememberMermaidDiagramHeight(source: string, height: number): void {
  if (!Number.isFinite(height) || height <= 0) return;
  renderedHeights.set(source, height, source.length * 2 + 64);
}

export function clearMermaidDiagramHeights(): void {
  renderedHeights.clear();
}
