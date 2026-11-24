import type { Element, Nodes, Root } from "hast";
import { describe, expect, it } from "vite-plus/test";

import { wordsHast, type WordsHastOptions } from "../markdown/wordsHast";
import { CANVAS_CARD_MARKDOWN_EXTENSIONS, leadingState } from "./canvasStateChips";

const CARD: WordsHastOptions = {
  math: false,
  breaks: true,
  escapeHtml: false,
  insights: false,
  extensions: CANVAS_CARD_MARKDOWN_EXTENSIONS,
};

const card = (markdown: string) => wordsHast(markdown, CARD);

const isChip = (node: Element) =>
  node.tagName === "span" &&
  Array.isArray(node.properties.className) &&
  node.properties.className.includes("canvas-state");

/** Each chip as `tag>tone:WORD`, with the tag of the element it sits in, in document order. */
const chipsIn = (tree: Root) => {
  const found: string[] = [];
  const walk = (node: Nodes, parent: string) => {
    if (node.type === "element") {
      if (isChip(node)) {
        const word = node.children[0]?.type === "text" ? node.children[0].value : "";
        found.push(`${parent}>${String(node.properties.dataState)}:${word}`);
        return;
      }
      for (const child of node.children) walk(child, node.tagName);
    } else if (node.type === "root") {
      for (const child of node.children) walk(child, parent);
    }
  };
  walk(tree, "root");
  return found;
};

const textOf = (node: Nodes): string =>
  node.type === "text" ? node.value : "children" in node ? node.children.map(textOf).join("") : "";

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

describe("canvas card state chips", () => {
  it("chips the state that starts a paragraph and keeps the rest of the line", () => {
    const tree = card("AT RISK: the 13 Nov date");
    expect(chipsIn(tree)).toEqual(["p>warn:AT RISK"]);
    expect(textOf(tree)).toBe("AT RISK: the 13 Nov date");
  });

  it("chips each line after a soft or hard break, but not a state mid-line", () => {
    const soft = card("first line\nCHANGED was 11 Dec\nthe walkthrough is NEW");
    expect(chipsIn(soft)).toEqual(["p>news:CHANGED"]);
    expect(textOf(soft)).toBe("first line\nCHANGED was 11 Dec\nthe walkthrough is NEW");

    const hard = card("first line  \nPENDING review\\\nDONE");
    expect(chipsIn(hard)).toEqual(["p>wait:PENDING", "p>good:DONE"]);
  });

  it("chips tight and loose list items, a bold state and a task item", () => {
    expect(
      chipsIn(
        card(
          [
            "- BLOCKED: vault request not filed",
            "- **DONE**",
            "- the walkthrough is NEW",
            "- [ ] TODO write it up",
          ].join("\n"),
        ),
      ),
    ).toEqual(["li>bad:BLOCKED", "li>good:DONE", "li>wait:TODO"]);

    expect(chipsIn(card("- FAILED first\n\n- PASSED second\n  - OPEN nested"))).toEqual([
      "p>bad:FAILED",
      "p>good:PASSED",
      "li>wait:OPEN",
    ]);
  });

  it("chips the state that starts a table cell, header or body", () => {
    const tree = card(["| DONE | Item |", "| --- | --- |", "| OVERDUE | PROD-474 |"].join("\n"));
    expect(chipsIn(tree)).toEqual(["th>good:DONE", "td>bad:OVERDUE"]);
  });

  it("leaves bold text that is more than a state, other words, and code", () => {
    expect(
      chipsIn(card("**DONE with it**\n\nDONEs\n\nDone in lower case\n\n`BLOCKED`\n\n# BLOCKED")),
    ).toEqual([]);
  });

  it("keeps the chip span through the chat sanitizer, and only on cards", () => {
    const chips: Element[] = [];
    const find = (node: Nodes) => {
      if (node.type === "element" && isChip(node)) chips.push(node);
      else if (node.type === "element" || node.type === "root") node.children.forEach(find);
    };
    find(card("- BLOCKED on review"));
    const [chip] = chips;
    expect(chip?.properties).toEqual({ className: ["canvas-state"], dataState: "bad" });

    expect(chipsIn(wordsHast("- BLOCKED on review", { ...CARD, extensions: {} }))).toEqual([]);
  });
});
