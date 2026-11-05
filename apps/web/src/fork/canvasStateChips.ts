import type { Emphasis, Parent, PhrasingContent, Root } from "mdast";
import type { PluggableList } from "unified";

/**
 * A state word in capitals that starts a line, list item or table cell in a canvas card shows as
 * a coloured chip, so a card can encode state without a legend: the word is its own key.
 */
export type CanvasStateTone = "good" | "bad" | "warn" | "news";

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
  [
    "warn",
    [
      "AT RISK",
      "RISK",
      "WAITING",
      "PENDING",
      "UNVERIFIED",
      "PARTIAL",
      "WEAK",
      "DUE",
      "STALE",
      "OPEN",
      "PROPOSED",
      "TODO",
      "CHECK",
      "UNKNOWN",
    ],
  ],
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

function chip(word: string, tone: CanvasStateTone): Emphasis {
  return {
    type: "emphasis",
    children: [{ type: "text", value: word }],
    data: { hName: "span", hProperties: { className: ["canvas-state"], dataState: tone } },
  };
}

/** Turns the state word at `index`, plain or bold, into a chip; returns the index after it. */
function chipAt(children: PhrasingContent[], index: number) {
  const node = children[index];
  if (node?.type === "text") {
    const state = leadingState(node.value);
    if (!state) return;
    const rest = node.value.slice(state.word.length);
    children.splice(
      index,
      1,
      chip(state.word, state.tone),
      ...(rest ? [{ type: "text" as const, value: rest }] : []),
    );
    return;
  }
  if (node?.type === "strong" && node.children.length === 1 && node.children[0]?.type === "text") {
    const value = node.children[0].value.trim();
    const state = leadingState(value);
    if (state && state.word === value) children.splice(index, 1, chip(state.word, state.tone));
  }
}

function visit(node: Root | Parent) {
  if (node.type === "paragraph" || node.type === "tableCell") {
    const children = (node as Parent).children as PhrasingContent[];
    // A line starts the paragraph or follows a hard break.
    for (let index = children.length - 1; index >= 0; index -= 1) {
      if (index === 0 || children[index - 1]?.type === "break") chipAt(children, index);
    }
    return;
  }
  for (const child of node.children) if ("children" in child) visit(child as Parent);
}

export function remarkCanvasStates() {
  return (tree: Root) => visit(tree);
}

/** One list for every card: it keys ChatMarkdown's shared parse cache. */
export const CANVAS_CARD_REMARK_PLUGINS: PluggableList = [remarkCanvasStates];
