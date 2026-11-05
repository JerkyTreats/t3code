import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, expect, it } from "vite-plus/test";

import { leadingState, remarkCanvasStates } from "./canvasStateChips";

const parse = (markdown: string) => unified().use(remarkParse).use(remarkGfm).parse(markdown);

const chipsIn = (tree: Root) => {
  const found: string[] = [];
  const walk = (node: Nodes) => {
    const state = node.data?.hProperties?.dataState;
    if (
      node.type === "emphasis" &&
      typeof state === "string" &&
      node.children[0]?.type === "text"
    ) {
      found.push(`${state}:${node.children[0].value}`);
    }
    if ("children" in node) for (const child of node.children) walk(child);
  };
  walk(tree);
  return found;
};

describe("leadingState", () => {
  it("reads a state word that starts a line, the longest first", () => {
    expect(leadingState("AT RISK: the 13 Nov date")).toEqual({ word: "AT RISK", tone: "warn" });
    expect(leadingState("BLOCKED on Platform")).toEqual({ word: "BLOCKED", tone: "bad" });
    expect(leadingState("DONE")).toEqual({ word: "DONE", tone: "good" });
  });

  it("leaves words that only begin with a state, and states mid-line", () => {
    expect(leadingState("DONEs")).toBeNull();
    expect(leadingState("OKAY then")).toBeNull();
    expect(leadingState("The run is BLOCKED")).toBeNull();
    expect(leadingState("Done in lower case")).toBeNull();
  });
});

describe("remarkCanvasStates", () => {
  it("chips the state that starts a list item, a bold line, a table cell and a line after a break", () => {
    const tree = parse(
      [
        "- BLOCKED: vault request not filed",
        "- **DONE**",
        "- the walkthrough is NEW", // mid-line: no chip
        "",
        "| State | Item |",
        "| --- | --- |",
        "| OVERDUE | PROD-474 |",
      ].join("\n"),
    );
    // A paragraph whose second line follows a hard break, as remark-breaks leaves it.
    tree.children.push({
      type: "paragraph",
      children: [
        { type: "text", value: "first line" },
        { type: "break" },
        { type: "text", value: "CHANGED was 11 Dec" },
      ],
    });
    remarkCanvasStates()(tree);
    expect(chipsIn(tree)).toEqual(["bad:BLOCKED", "good:DONE", "bad:OVERDUE", "news:CHANGED"]);
  });
});
