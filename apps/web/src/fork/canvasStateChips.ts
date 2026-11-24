import type { Element, ElementContent, Root } from "hast";

import type { MarkdownExtensions } from "../markdown/wordsHast";

/**
 * A state word in capitals that starts a line, list item or table cell in a canvas card shows as
 * a coloured chip, so a card can encode state without a legend: the word is its own key.
 */
export type CanvasStateTone = "good" | "bad" | "warn" | "wait" | "news";

const TONES: ReadonlyArray<readonly [CanvasStateTone, ReadonlyArray<string>]> = [
  [
    "good",
    ["DONE", "OK", "PASS", "PASSED", "FIXED", "MERGED", "LIVE", "RESOLVED", "CLOSED", "VERIFIED"],
  ],
  [
    "bad",
    [
      "BLOCKED",
      "FAIL",
      "FAILED",
      "OVERDUE",
      "LOST",
      "BROKEN",
      "DOWN",
      "WRONG",
      "REFUTED",
      "MISSING",
    ],
  ],
  ["warn", ["AT RISK", "RISK", "UNVERIFIED", "PARTIAL", "WEAK", "STALE", "CHECK", "UNKNOWN"]],
  // Waiting on someone is not the same as being at risk, so it gets its own colour.
  ["wait", ["WAITING", "PENDING", "OPEN", "TODO", "PROPOSED", "DUE"]],
  ["news", ["NEW", "CHANGED", "MOVED", "UPDATED", "RUNNING", "IN PROGRESS"]],
];

const TONE_OF = new Map(
  TONES.flatMap(([tone, words]) => words.map((word) => [word, tone] as const)),
);

// Longest first, so AT RISK wins over RISK; a state word ends at a space, punctuation or the end.
const STATE = new RegExp(
  `^(${[...TONE_OF.keys()].toSorted((a, b) => b.length - a.length).join("|")})(?=$|[\\s:;,.)\\]\\u2014\\u2013-])`,
);

/** The state a line starts with, if it starts with one. */
export function leadingState(text: string): { word: string; tone: CanvasStateTone } | null {
  const match = STATE.exec(text);
  if (!match) return null;
  const word = match[1]!;
  return { word, tone: TONE_OF.get(word)! };
}

function chip(word: string, tone: CanvasStateTone): Element {
  return {
    type: "element",
    tagName: "span",
    properties: { className: ["canvas-state"], dataState: tone },
    children: [{ type: "text", value: word }],
  };
}

/** Turns the state word at `index`, plain or bold, into a chip. */
function chipAt(children: ElementContent[], index: number) {
  const node = children[index];
  if (node?.type === "text") {
    // A line after a `<br>` keeps its line ending at the front.
    const lead = /^\s*/.exec(node.value)![0];
    const state = leadingState(node.value.slice(lead.length));
    if (!state) return;
    const rest = node.value.slice(lead.length + state.word.length);
    children.splice(
      index,
      1,
      ...(lead ? [{ type: "text" as const, value: lead }] : []),
      chip(state.word, state.tone),
      ...(rest ? [{ type: "text" as const, value: rest }] : []),
    );
    return;
  }
  if (
    node?.type === "element" &&
    node.tagName === "strong" &&
    node.children.length === 1 &&
    node.children[0]?.type === "text"
  ) {
    const value = node.children[0].value.trim();
    const state = leadingState(value);
    if (state && state.word === value) children.splice(index, 1, chip(state.word, state.tone));
  }
}

const isTag = (node: ElementContent | undefined, tagName: string) =>
  node?.type === "element" && node.tagName === tagName;

// Elements whose direct phrasing starts lines: a tight list item has no `<p>` around its text.
const LINE_HOSTS = new Set(["p", "td", "th", "li"]);

function visit(node: Root | Element) {
  const children = node.children as ElementContent[];
  if (node.type === "element" && LINE_HOSTS.has(node.tagName)) {
    // A line starts the run, follows a hard or soft break, or follows a task item's checkbox.
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const previous = children[index - 1];
      if (
        index === 0 ||
        isTag(previous, "br") ||
        (index === 1 && node.tagName === "li" && isTag(previous, "input"))
      ) {
        chipAt(children, index);
      }
    }
  }
  // Nested blocks (a loose item's paragraphs, sublists, tables) host their own lines.
  for (const child of children) {
    if (child.type === "element" && child.tagName !== "strong" && child.tagName !== "span") {
      visit(child);
    }
  }
}

/** Chips the state words in Words' hast for a canvas card; runs before the shared sanitizer. */
export function applyCanvasStateChips(tree: Root) {
  visit(tree);
}

/** One extensions object for every card: it keys ChatMarkdown's shared parse cache. */
export const CANVAS_CARD_MARKDOWN_EXTENSIONS: MarkdownExtensions = { canvasStateChips: true };
