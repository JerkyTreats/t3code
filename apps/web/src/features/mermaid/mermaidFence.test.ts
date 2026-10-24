import { afterEach, describe, expect, it } from "vite-plus/test";

import mermaidDiagramSource from "../../components/chat/MermaidDiagram.tsx?raw";
import {
  clearMermaidDiagramHeights,
  readMermaidDiagramHeight,
  rememberMermaidDiagramHeight,
} from "./mermaidDiagramHeights";
import { isMermaidFenceLanguage } from "./mermaidFence";

afterEach(() => clearMermaidDiagramHeights());

describe("Mermaid fence owner", () => {
  it("accepts exactly the mermaid and mmd fence languages", () => {
    expect(isMermaidFenceLanguage("mermaid")).toBe(true);
    expect(isMermaidFenceLanguage("MMD")).toBe(true);
    expect(isMermaidFenceLanguage("mermaidjs")).toBe(false);
    expect(isMermaidFenceLanguage("ts")).toBe(false);
  });

  it("remembers rendered heights by exact source and ignores unusable sizes", () => {
    rememberMermaidDiagramHeight("graph TD; A-->B", 180);
    rememberMermaidDiagramHeight("graph TD; A-->C", 0);
    rememberMermaidDiagramHeight("graph TD; A-->D", Number.NaN);
    expect(readMermaidDiagramHeight("graph TD; A-->B")).toBe(180);
    expect(readMermaidDiagramHeight("graph TD; A-->B ")).toBeNull();
    expect(readMermaidDiagramHeight("graph TD; A-->C")).toBeNull();
    expect(readMermaidDiagramHeight("graph TD; A-->D")).toBeNull();
  });

  it("bounds retained heights and evicts the least recently used source", () => {
    for (let index = 0; index < 257; index += 1) {
      rememberMermaidDiagramHeight(`graph TD; N${index}`, index + 1);
    }
    expect(readMermaidDiagramHeight("graph TD; N0")).toBeNull();
    expect(readMermaidDiagramHeight("graph TD; N1")).toBe(2);
    expect(readMermaidDiagramHeight("graph TD; N256")).toBe(257);
  });

  it("keeps pele and KaTeX out of the initial bundle", () => {
    expect(mermaidDiagramSource).toMatch(/import\("pele\/lazy"\)/);
    expect(mermaidDiagramSource).toMatch(/import\("katex"\)/);
    expect(mermaidDiagramSource).not.toMatch(/^import (?!type)[^;]*from "pele/m);
  });
});
