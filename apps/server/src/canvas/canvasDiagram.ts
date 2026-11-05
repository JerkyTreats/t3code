import dagre from "@dagrejs/dagre";
import type { ThreadCanvasShape } from "@t3tools/contracts";
import { shapeSize } from "@t3tools/shared/threadCanvasDrawing";

/**
 * Compiles a Mermaid flowchart, which models already write, to laid-out canvas shapes: subgraphs
 * are titled bands, class lead/aside sets weight, other classes are kinds coloured with a legend,
 * and a "`markdown`" label is a card. Positions, sizes and colours are decided here, not by the agent.
 */

export class DiagramError extends Error {}

type Direction = "down" | "right";
type Role = "lead" | "support" | "aside";

interface DiagramNode {
  readonly kind: "node";
  readonly id: string;
  label: string;
  shape: "rectangle" | "ellipse" | "diamond";
  markdown: boolean;
  classes: string[];
}

interface DiagramGroup {
  readonly kind: "group";
  readonly id: string;
  title: string | null;
  direction: Direction;
  readonly children: Array<DiagramNode | DiagramGroup>;
  classes: string[];
}

interface DiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label: string | null;
  readonly line: boolean;
}

const ROLES = new Set(["lead", "support", "aside"]);
const GAP_PX = 40;
const GROUP_PADDING_PX = 24;
const GROUP_TITLE_PX = 44;
// Two cards and a gap: a drawing beside the turn column reads without panning.
const MAX_ROW_WIDTH_PX = 1100;
const BAND_FONT_SIZES = [26, 22, 18, 16];
const BASE_FONT_SIZE = 20;
const LEAD_SCALE = 1.25;
const ASIDE_FONT_SIZE = 14;
const CARD_WIDTH_PX = 480;
const CARD_CHARACTER_PX = 8.25;
const CARD_LINE_PX = 24;
// Outline colours that keep their hue under Excalidraw's dark-mode inversion.
const KIND_COLORS = [
  "#2f9e44",
  "#1971c2",
  "#e8590c",
  "#6741d9",
  "#0c8599",
  "#f08c00",
  "#c2255c",
  "#e03131",
];
const MUTED = "#868e96";

/** Splits on newlines and semicolons that sit outside quotes and brackets. */
function statementsOf(source: string) {
  const statements: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;
  for (const char of source) {
    if (quote !== null) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "`") quote = char;
    if ("[({".includes(char)) depth += 1;
    if ("])}".includes(char)) depth = Math.max(0, depth - 1);
    if ((char === "\n" || char === ";") && depth === 0) {
      statements.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  statements.push(current.trim());
  return statements.filter((statement) => statement !== "" && !statement.startsWith("%%"));
}

const directionOf = (word: string): Direction =>
  word === "LR" || word === "RL" ? "right" : "down";

const ID = /^[A-Za-z0-9_][\w.-]*/;
const SHAPES: ReadonlyArray<readonly [string, string, DiagramNode["shape"]]> = [
  ["((", "))", "ellipse"],
  ["([", "])", "rectangle"],
  ["[[", "]]", "rectangle"],
  ["{{", "}}", "diamond"],
  ["[", "]", "rectangle"],
  ["(", ")", "rectangle"],
  ["{", "}", "diamond"],
];
const EDGE =
  /^\s*(?:(-->|---|-\.->|-\.-|==>|===|--[ox])\s*(?:\|([^|]*)\|)?|--\s+(.+?)\s+-->|==\s+(.+?)\s+==>|-\.\s+(.+?)\s+\.->)\s*/;

function unquote(text: string) {
  const trimmed = text.trim();
  const markdown = trimmed.startsWith('"`') && trimmed.endsWith('`"');
  if (markdown) return { text: trimmed.slice(2, -2).trim(), markdown: true };
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { text: trimmed.slice(1, -1), markdown: false };
  }
  return { text: trimmed, markdown: false };
}

/** Parses the flowchart subset into a tree of groups, the edges, and each node's group. */
export function parseDiagram(source: string) {
  const root: DiagramGroup = {
    kind: "group",
    id: "",
    title: null,
    direction: "down",
    children: [],
    classes: [],
  };
  const nodes = new Map<string, DiagramNode>();
  const groups = new Map<string, DiagramGroup>([["", root]]);
  const edges: DiagramEdge[] = [];
  const stack: DiagramGroup[] = [root];
  const pendingClasses: Array<readonly [string, string]> = [];

  const nodeRef = (text: string, at: number) => {
    const rest = text.slice(at);
    const id = ID.exec(rest)?.[0];
    if (id === undefined) throw new DiagramError(`Expected a node id at "${rest.slice(0, 30)}".`);
    let end = at + id.length;
    let label: { text: string; markdown: boolean } | null = null;
    let shape: DiagramNode["shape"] = "rectangle";
    for (const [open, close, kind] of SHAPES) {
      if (!text.startsWith(open, end)) continue;
      const closeAt = text.indexOf(close, end + open.length);
      if (closeAt < 0) throw new DiagramError(`Unclosed ${open} after ${id}.`);
      label = unquote(text.slice(end + open.length, closeAt));
      shape = kind;
      end = closeAt + close.length;
      break;
    }
    let classes: string[] = [];
    const shorthand = /^:::([\w-]+)/.exec(text.slice(end));
    if (shorthand !== null) {
      classes = [shorthand[1]!];
      end += shorthand[0].length;
    }
    if (!groups.has(id)) {
      let node = nodes.get(id);
      if (node === undefined) {
        node = { kind: "node", id, label: id, shape, markdown: false, classes: [] };
        nodes.set(id, node);
        stack.at(-1)!.children.push(node);
      }
      if (label !== null) {
        node.label = label.text;
        node.markdown = label.markdown;
        node.shape = shape;
      }
      node.classes.push(...classes);
    }
    return { id, end };
  };

  const nodeList = (text: string, at: number) => {
    const ids: string[] = [];
    let end = at;
    for (;;) {
      const ref = nodeRef(text, end);
      ids.push(ref.id);
      const more = /^\s*&\s*/.exec(text.slice(ref.end));
      end = ref.end;
      if (more === null) break;
      end += more[0].length;
    }
    return { ids, end };
  };

  for (const statement of statementsOf(source)) {
    const words = statement.split(/\s+/);
    const head = words[0]!;
    if (head === "flowchart" || head === "graph") {
      root.direction = directionOf(words[1] ?? "TB");
      continue;
    }
    if (head === "direction") {
      stack.at(-1)!.direction = directionOf(words[1] ?? "TB");
      continue;
    }
    if (head === "subgraph") {
      const rest = statement.slice("subgraph".length).trim();
      const match = /^([\w.-]+)\s*(?:\[(.*)\])?\s*$/.exec(rest);
      const id = match?.[1] ?? `group${groups.size}`;
      const title =
        match?.[2] !== undefined
          ? unquote(match[2]).text
          : match === null
            ? unquote(rest).text
            : id;
      const group: DiagramGroup = {
        kind: "group",
        id,
        title,
        direction: "right",
        children: [],
        classes: [],
      };
      if (nodes.has(id)) throw new DiagramError(`${id} is both a node and a subgraph.`);
      groups.set(id, group);
      stack.at(-1)!.children.push(group);
      stack.push(group);
      continue;
    }
    if (head === "end") {
      if (stack.length === 1) throw new DiagramError("An end with no subgraph open.");
      stack.pop();
      continue;
    }
    if (head === "class") {
      const [, ids = "", name] = words;
      if (name === undefined) throw new DiagramError(`class needs ids and a name: "${statement}".`);
      for (const id of ids.split(",")) pendingClasses.push([id.trim(), name]);
      continue;
    }
    if (head === "classDef" || head === "style" || head === "linkStyle" || head === "click") {
      continue;
    }
    let { ids: from, end } = nodeList(statement, 0);
    for (;;) {
      const rest = statement.slice(end);
      if (rest.trim() === "") break;
      const edge = EDGE.exec(rest);
      if (edge === null) throw new DiagramError(`Could not read "${rest.trim().slice(0, 40)}".`);
      const label = edge[2] ?? edge[3] ?? edge[4] ?? edge[5] ?? null;
      const line = edge[1] === "---" || edge[1] === "===" || edge[1] === "-.-";
      const next = nodeList(statement, end + edge[0].length);
      for (const source of from) {
        for (const target of next.ids) {
          edges.push({
            from: source,
            to: target,
            label: label === null || label.trim() === "" ? null : unquote(label).text,
            line,
          });
        }
      }
      from = next.ids;
      end = next.end;
    }
  }
  if (stack.length > 1) throw new DiagramError(`Subgraph ${stack.at(-1)!.id} has no end.`);
  for (const [id, name] of pendingClasses) {
    const target = nodes.get(id) ?? groups.get(id);
    if (target === undefined) throw new DiagramError(`class names ${id}, which is not drawn.`);
    target.classes.push(name);
  }
  for (const edge of edges) {
    for (const id of [edge.from, edge.to]) {
      if (!nodes.has(id) && !groups.has(id))
        throw new DiagramError(`Edge names ${id}, which is not drawn.`);
    }
  }
  return { root, nodes, groups, edges };
}

const roleOf = (item: { readonly classes: ReadonlyArray<string> }): Role =>
  item.classes.includes("lead") ? "lead" : item.classes.includes("aside") ? "aside" : "support";
const kindOf = (item: { readonly classes: ReadonlyArray<string> }) =>
  item.classes.find((name) => !ROLES.has(name));

interface Laid {
  readonly width: number;
  readonly height: number;
  /** Shapes at positions relative to this item's top left. */
  readonly shapes: ThreadCanvasShape[];
}

const moved = (shapes: ReadonlyArray<ThreadCanvasShape>, dx: number, dy: number) =>
  shapes.map((shape) =>
    shape.type === "arrow" || shape.type === "line"
      ? shape
      : { ...shape, x: (shape.x ?? 0) + dx, y: (shape.y ?? 0) + dy },
  );

/** A markdown card's height from its text, near enough for layout; the client fits it exactly. */
function cardHeight(text: string, width: number) {
  const perLine = Math.max(1, Math.floor((width - 48) / CARD_CHARACTER_PX));
  const lines = text
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return Math.min(1200, Math.max(120, lines * CARD_LINE_PX + 56));
}

/**
 * The width a card's widest table row needs, up to two cards and a gap, so a table is not clipped
 * at a single card's width. Zero when the card has no table.
 */
export function tableWidth(text: string) {
  const rows = text.split("\n").filter((line) => line.trim().startsWith("|"));
  if (rows.length === 0) return 0;
  // Each cell pads by about two characters on each side.
  const widest = Math.max(
    ...rows.map((row) => row.trim().length + 4 * (row.split("|").length - 2)),
  );
  return Math.min(2 * CARD_WIDTH_PX + GAP_PX, Math.ceil(widest * CARD_CHARACTER_PX + 48));
}

/** Compiles a flowchart to canvas shapes laid out from (0, 0), legend included. */
export function compileDiagram(source: string): ReadonlyArray<ThreadCanvasShape> {
  const { root, nodes, groups, edges } = parseDiagram(source);
  const colors = new Map<string, string>();
  const colorOf = (item: { readonly classes: ReadonlyArray<string> }) => {
    const kind = kindOf(item);
    if (kind === undefined) return undefined;
    if (!colors.has(kind)) colors.set(kind, KIND_COLORS[colors.size % KIND_COLORS.length]!);
    return colors.get(kind);
  };
  const ownerOf = new Map<string, DiagramGroup>();
  const walk = (group: DiagramGroup) => {
    for (const child of group.children) {
      ownerOf.set(child.id, group);
      if (child.kind === "group") walk(child);
    }
  };
  walk(root);
  /** The child of `group` that holds `id`, or undefined if `id` lies outside it. */
  const childHolding = (group: DiagramGroup, id: string) => {
    let current: string | undefined = id;
    while (current !== undefined) {
      const owner = ownerOf.get(current);
      if (owner === undefined) return undefined;
      if (owner === group) return current;
      current = owner.id === "" ? undefined : owner.id;
    }
    return undefined;
  };

  const layNode = (node: DiagramNode, fontSize: number): Laid => {
    const role = roleOf(node);
    const strokeColor = role === "aside" ? MUTED : colorOf(node);
    const size =
      role === "lead"
        ? Math.round(fontSize * LEAD_SCALE)
        : role === "aside"
          ? ASIDE_FONT_SIZE
          : fontSize;
    if (node.markdown) {
      const width = Math.max(
        role === "lead"
          ? 2 * CARD_WIDTH_PX
          : role === "aside"
            ? 0.75 * CARD_WIDTH_PX
            : CARD_WIDTH_PX,
        tableWidth(node.label),
      );
      const height = cardHeight(node.label, width);
      return {
        width,
        height,
        shapes: [
          {
            id: node.id,
            type: "markdown",
            x: 0,
            y: 0,
            width,
            height,
            text: node.label,
            ...(strokeColor === undefined ? {} : { strokeColor }),
          },
        ],
      };
    }
    const shape: ThreadCanvasShape = {
      id: node.id,
      type: node.shape,
      x: 0,
      y: 0,
      text: node.label,
      fontSize: size,
      ...(strokeColor === undefined ? {} : { strokeColor }),
    };
    const natural = shapeSize(shape);
    const width = role === "lead" ? Math.max(natural.width, 320) : natural.width;
    return {
      width,
      height: natural.height,
      shapes: [{ ...shape, width, height: natural.height }],
    };
  };

  const layGroup = (group: DiagramGroup, fontSize: number): Laid => {
    const bands =
      group.direction === "down" &&
      group.children.length > 1 &&
      group.children.every((child) => child.kind === "group");
    const laid = group.children.map((child, index) => ({
      child,
      role: roleOf(child),
      ...(child.kind === "group"
        ? layGroup(child, bands ? (BAND_FONT_SIZES[index] ?? BASE_FONT_SIZE - 4) : fontSize)
        : layNode(child, fontSize)),
    }));
    const links = edges.flatMap((edge) => {
      const from = childHolding(group, edge.from);
      const to = childHolding(group, edge.to);
      return from !== undefined && to !== undefined && from !== to ? [{ from, to }] : [];
    });
    const positions = new Map<string, { x: number; y: number }>();
    let sizes = new Map(
      laid.map((item) => [item.child.id, { width: item.width, height: item.height }]),
    );
    // Bands stack in the order written, whatever arrows join them; nodes joined by edges are a graph.
    if (links.length > 0 && !laid.every((item) => item.child.kind === "group")) {
      const graph = new dagre.graphlib.Graph();
      graph.setGraph({
        rankdir: group.direction === "right" ? "LR" : "TB",
        nodesep: GAP_PX,
        ranksep: 2 * GAP_PX,
      });
      graph.setDefaultEdgeLabel(() => ({}));
      for (const item of laid)
        graph.setNode(item.child.id, { width: item.width, height: item.height });
      for (const link of links) graph.setEdge(link.from, link.to);
      dagre.layout(graph);
      for (const item of laid) {
        const placed = graph.node(item.child.id);
        positions.set(item.child.id, {
          x: placed.x - item.width / 2,
          y: placed.y - item.height / 2,
        });
      }
    } else {
      // The answer first, on a row of its own; asides last.
      const ordered = [
        ...laid.filter((item) => item.role === "lead"),
        ...laid.filter((item) => item.role === "support"),
        ...laid.filter((item) => item.role === "aside"),
      ];
      // Bands stacked down share one width, and side by side one height.
      if (ordered.every((item) => item.child.kind === "group")) {
        const across = Math.max(
          ...ordered.map((item) => (group.direction === "down" ? item.width : item.height)),
        );
        sizes = new Map(
          ordered.map((item) => [
            item.child.id,
            group.direction === "down"
              ? { width: across, height: item.height }
              : { width: item.width, height: across },
          ]),
        );
      }
      let x = 0;
      let y = 0;
      let rowHeight = 0;
      for (const [index, item] of ordered.entries()) {
        const size = sizes.get(item.child.id)!;
        if (group.direction === "down") {
          positions.set(item.child.id, { x: 0, y });
          y += size.height + GAP_PX;
          continue;
        }
        const afterLead = index > 0 && ordered[index - 1]!.role === "lead" && item.role !== "lead";
        if ((x > 0 && x + size.width > MAX_ROW_WIDTH_PX) || afterLead) {
          x = 0;
          y += rowHeight + GAP_PX;
          rowHeight = 0;
        }
        positions.set(item.child.id, { x, y });
        x += size.width + GAP_PX;
        rowHeight = Math.max(rowHeight, size.height);
      }
    }
    const inner = laid.flatMap((item) => {
      const at = positions.get(item.child.id)!;
      const size = sizes.get(item.child.id)!;
      const shapes = moved(item.shapes, at.x, at.y);
      // A stretched band's frame takes the shared size; its contents stay where they are.
      return shapes.map((shape) =>
        shape.id === item.child.id && item.child.kind === "group"
          ? { ...shape, width: size.width, height: size.height }
          : shape,
      );
    });
    const right = Math.max(
      0,
      ...laid.map((item) => positions.get(item.child.id)!.x + sizes.get(item.child.id)!.width),
    );
    const bottom = Math.max(
      0,
      ...laid.map((item) => positions.get(item.child.id)!.y + sizes.get(item.child.id)!.height),
    );
    // The root, and a subgraph titled with a blank, only arrange what they hold: no frame.
    if (group === root || group.title?.trim() === "") {
      return { width: right, height: bottom, shapes: inner };
    }
    const top = group.title === null ? GROUP_PADDING_PX : GROUP_TITLE_PX + GROUP_PADDING_PX / 2;
    const width = right + 2 * GROUP_PADDING_PX;
    const height = bottom + top + GROUP_PADDING_PX;
    const strokeColor = colorOf(group) ?? MUTED;
    return {
      width,
      height,
      shapes: [
        { id: group.id, type: "rectangle", x: 0, y: 0, width, height, strokeColor },
        ...(group.title === null
          ? []
          : [
              {
                id: `${group.id}-title`,
                type: "text" as const,
                x: GROUP_PADDING_PX,
                y: GROUP_PADDING_PX / 2,
                text: group.title,
                fontSize: Math.max(16, fontSize - 2),
                strokeColor,
              },
            ]),
        ...moved(inner, GROUP_PADDING_PX, top),
      ],
    };
  };

  const body = layGroup(root, BASE_FONT_SIZE);
  const arrows: ThreadCanvasShape[] = edges.map((edge, index) => ({
    id: `e${index + 1}`,
    type: edge.line ? "line" : "arrow",
    start: edge.from,
    end: edge.to,
    ...(edge.label === null ? {} : { text: edge.label }),
  }));
  const legend: ThreadCanvasShape[] = [];
  let x = 0;
  for (const [kind, color] of colors) {
    const words = kind.replace(/[-_]/g, " ");
    legend.push(
      {
        id: `legend-${kind}`,
        type: "rectangle",
        x,
        y: body.height + GAP_PX,
        width: 24,
        height: 16,
        strokeColor: color,
      },
      {
        id: `legend-${kind}-label`,
        type: "text",
        x: x + 32,
        y: body.height + GAP_PX - 2,
        text: words,
        fontSize: 16,
        strokeColor: color,
      },
    );
    x += 32 + Math.ceil(words.length * 16 * 0.6) + GAP_PX;
  }
  if (nodes.size === 0 && groups.size === 1) throw new DiagramError("The diagram draws nothing.");
  return [...body.shapes, ...arrows, ...legend];
}
