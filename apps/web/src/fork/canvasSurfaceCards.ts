import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { PreviewSessionSnapshot, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import {
  type CanvasSurfaceCard,
  type CanvasSurfaceRef,
  canvasSurfaceCardOf,
  canvasSurfaceRefOf,
  canvasSurfaceTitle,
} from "@t3tools/shared/canvasSurfaceCard";
import type { ReactNode } from "react";
import { create } from "zustand";

import type { PreviewMiniPlayerSource } from "../previewMiniPlayerStore";
import { pullRequestSurface, type RightPanelSurface } from "../rightPanelStore";

/**
 * Right panel tabs placed on the thread canvas as cards. A card renders the panel's own component
 * for its surface, so this module maps between the card's stored ref and the panel's surface. It
 * stays free of Excalidraw so the panel and chat can place cards without loading the board; the
 * board registers a placer while it is mounted.
 */

/**
 * What a panel component does instead of writing the panel's own tab when it runs in a card. The
 * panel keys its tab state by surface id, and a card shares that id, so a card writes its own.
 */
export interface PanelSurfaceCard {
  /** Shows another surface in this card, where the panel would move its tab in place. */
  readonly show: (ref: CanvasSurfaceRef) => void;
  /** Places another surface as its own card beside this one, where the panel would open a tab. */
  readonly place: (ref: CanvasSurfaceRef) => void;
  /** Removes the card from the canvas, where the panel would close its tab. */
  readonly close: () => void;
}

/** Renders a panel surface the way the right panel does, with the card's own actions. */
export type RenderPanelSurface = (surface: RightPanelSurface, card: PanelSurfaceCard) => ReactNode;

/**
 * The ref a panel tab places, or null when the tab cannot be placed: attachments and host files
 * resolve only on this client, and a browser tab that has not opened has nothing to show.
 */
export function canvasSurfaceRefFor(
  surface: RightPanelSurface,
  previewSessions: Readonly<Record<string, PreviewSessionSnapshot>> = {},
): CanvasSurfaceRef | null {
  const ref = ((): Record<string, unknown> | null => {
    switch (surface.kind) {
      case "file":
        return surface.attachment === undefined
          ? {
              kind: "file",
              relativePath: surface.relativePath,
              revealLine: surface.revealLine ?? undefined,
              folderTrail: surface.folderTrail,
            }
          : null;
      case "files":
        return { kind: "files", folderTrail: surface.folderTrail };
      case "preview": {
        if (surface.resourceId === null) return null;
        const navStatus = previewSessions[surface.resourceId]?.navStatus;
        return {
          kind: "preview",
          tabId: surface.resourceId,
          url: navStatus === undefined || navStatus._tag === "Idle" ? undefined : navStatus.url,
        };
      }
      case "terminal":
        return { ...surface, kind: "terminal" };
      case "pull-request":
        return { ...surface, kind: "pull-request" };
      case "side-chat":
        return { kind: "side-chat", threadId: surface.threadId };
      case "device":
        return { kind: "device", target: surface.target };
      case "diff":
      case "pull-requests":
        return { kind: surface.kind };
    }
  })();
  // Parsed back, so a card is never placed that the board or the server would not read.
  return ref === null ? null : canvasSurfaceRefOf(ref);
}

/** The panel surface a card's ref shows. Its id is the one the panel's tab for it would have. */
export function panelSurfaceOf(ref: CanvasSurfaceRef): RightPanelSurface {
  switch (ref.kind) {
    case "file":
      return {
        id: `file:${ref.relativePath}`,
        kind: "file",
        relativePath: ref.relativePath,
        revealLine: ref.revealLine ?? null,
        revealRequestId: ref.revealLine === undefined ? 0 : 1,
        ...(ref.folderTrail === undefined ? {} : { folderTrail: ref.folderTrail }),
      };
    case "files":
      return {
        id: "files",
        kind: "files",
        ...(ref.folderTrail === undefined ? {} : { folderTrail: ref.folderTrail }),
      };
    case "preview":
      return { id: `browser:${ref.tabId}`, kind: "preview", resourceId: ref.tabId };
    case "terminal": {
      const terminalIds = [...(ref.terminalIds ?? [ref.resourceId])];
      return {
        id: `terminal:${ref.resourceId}`,
        kind: "terminal",
        resourceId: ref.resourceId,
        terminalIds,
        activeTerminalId: ref.activeTerminalId ?? terminalIds[0]!,
        ...(ref.splitDirection === undefined ? {} : { splitDirection: ref.splitDirection }),
      };
    }
    case "pull-request":
      return pullRequestSurface({
        projectId: ref.projectId,
        repository: ref.repository,
        number: ref.number,
        ...(ref.host === undefined ? {} : { host: ref.host }),
      });
    case "side-chat":
      return {
        id: `side-chat:${ref.threadId}`,
        kind: "side-chat",
        threadId: ref.threadId as ThreadId,
      };
    case "device":
      return ref.target === undefined
        ? { id: "device", kind: "device" }
        : {
            id: `device:${encodeURIComponent(ref.target.hostId)}:${encodeURIComponent(ref.target.deviceId)}`,
            kind: "device",
            target: { ...ref.target },
          };
    case "diff":
      return { id: "diff", kind: "diff" };
    case "pull-requests":
      return { id: "pull-requests", kind: "pull-requests" };
  }
}

/** The card a panel tab places, titled as its tab, or null when the tab cannot be placed. */
export function canvasSurfaceCardFor(
  surface: RightPanelSurface,
  context: {
    readonly previewSessions: Readonly<Record<string, PreviewSessionSnapshot>>;
    readonly title: string;
  },
): CanvasSurfaceCard | null {
  const ref = canvasSurfaceRefFor(surface, context.previewSessions);
  return ref === null
    ? null
    : canvasSurfaceCardOf({
        kind: "surface",
        surface: ref,
        // A pull request tab is titled by its number alone, which names nothing on a shared board.
        title: ref.kind === "pull-request" ? canvasSurfaceTitle(ref) : context.title,
      });
}

/** A new card for a ref, titled as its tab would be. */
export function canvasSurfaceCardOfRef(ref: CanvasSurfaceRef): CanvasSurfaceCard {
  return { kind: "surface", surface: ref, title: canvasSurfaceTitle(ref) };
}

/**
 * Where the panel or the mini player already shows the card's resource in this client, or null.
 * A browser tab, terminal, side chat or device has one live view per client; files, the diff and
 * pull requests may show twice. Like `shouldRenderPreviewMiniPlayer`, the panel wins.
 */
export function surfaceShownElsewhere(
  ref: CanvasSurfaceRef,
  shown: {
    /** The surface the open panel renders, or null when the panel is closed. */
    readonly panel: RightPanelSurface | null;
    readonly miniPlayer: PreviewMiniPlayerSource | null;
  },
): "panel" | "mini-player" | null {
  const { panel, miniPlayer } = shown;
  switch (ref.kind) {
    case "preview":
      if (panel?.kind === "preview" && panel.resourceId === ref.tabId) return "panel";
      return miniPlayer?.kind === "browser" && miniPlayer.tabId === ref.tabId
        ? "mini-player"
        : null;
    case "terminal": {
      const ids = ref.terminalIds ?? [ref.resourceId];
      return panel?.kind === "terminal" && panel.terminalIds.some((id) => ids.includes(id))
        ? "panel"
        : null;
    }
    case "side-chat":
      return panel?.kind === "side-chat" && panel.threadId === ref.threadId ? "panel" : null;
    case "device": {
      const { target } = ref;
      if (target === undefined) return null;
      if (
        panel?.kind === "device" &&
        panel.target?.hostId === target.hostId &&
        panel.target.deviceId === target.deviceId
      ) {
        return "panel";
      }
      return miniPlayer?.kind === "device" &&
        miniPlayer.hostId === target.hostId &&
        miniPlayer.deviceId === target.deviceId
        ? "mini-player"
        : null;
    }
    default:
      return null;
  }
}

/** The resources a ref mounts that allow one live view per client, by stable key. */
function singleViewKeys(ref: CanvasSurfaceRef): ReadonlyArray<string> {
  switch (ref.kind) {
    case "preview":
      return [`preview:${ref.tabId}`];
    case "terminal":
      return (ref.terminalIds ?? [ref.resourceId]).map((id) => `terminal:${id}`);
    case "side-chat":
      return [`side-chat:${ref.threadId}`];
    case "device":
      return ref.target === undefined
        ? []
        : [`device:${ref.target.hostId}\u0000${ref.target.deviceId}`];
    default:
      return [];
  }
}

/**
 * Which live cards yield a browser tab, terminal, side chat or device to another card showing
 * it, by card id to the card that shows it. The card the user asked to show it wins, then the
 * lowest element id, so every client picks the same card.
 */
export function cardsShowingElsewhere(
  cards: ReadonlyArray<{ readonly id: string; readonly ref: CanvasSurfaceRef }>,
  preferred: string | null,
): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  const yielded = new Map<string, string>();
  const order = cards.toSorted(
    (left, right) =>
      Number(right.id === preferred) - Number(left.id === preferred) ||
      (left.id < right.id ? -1 : 1),
  );
  for (const card of order) {
    const keys = singleViewKeys(card.ref);
    const owner = keys.map((key) => owners.get(key)).find((id) => id !== undefined);
    if (owner !== undefined) {
      yielded.set(card.id, owner);
      continue;
    }
    for (const key of keys) owners.set(key, card.id);
  }
  return yielded;
}

/** Where a new card goes: beside the latest turn by default. */
export type SurfacePlacement =
  | { readonly at: { readonly x: number; readonly y: number } }
  | { readonly besideTurn: string }
  | { readonly besideElement: string };

type PlaceCard = (card: CanvasSurfaceCard, where?: SurfacePlacement) => void;
const mountedBoards = new Map<string, PlaceCard>();

/** Called by a mounted board for its thread; the returned function unregisters it. */
export function registerCanvasBoard(threadRef: ScopedThreadRef, place: PlaceCard) {
  const key = scopedThreadKey(threadRef);
  mountedBoards.set(key, place);
  return () => {
    if (mountedBoards.get(key) === place) mountedBoards.delete(key);
  };
}

export function canvasBoardMounted(threadRef: ScopedThreadRef) {
  return mountedBoards.has(scopedThreadKey(threadRef));
}

/**
 * Places a surface card on the thread's canvas, beside the latest turn unless told otherwise. The
 * one action every entry point uses; returns false when no board is mounted for the thread.
 */
export function placeSurfaceOnCanvas(
  threadRef: ScopedThreadRef,
  card: CanvasSurfaceCard,
  where?: SurfacePlacement,
) {
  const place = mountedBoards.get(scopedThreadKey(threadRef));
  if (place === undefined) return false;
  place(card, where);
  return true;
}

type Place<Id> = (place: (id: Id) => void) => void;

/**
 * What the empty-canvas menu runs for each new tab kind: it starts the resource where the kind
 * needs one, then places its card with its top-left corner at the scene point.
 */
export function canvasSurfaceAdders(
  threadRef: ScopedThreadRef,
  start: {
    readonly browser: Place<string>;
    readonly terminal: Place<string>;
    readonly sideChat: Place<ThreadId>;
    /** The thread's own pull request, as the panel's "Pull request" item opens. */
    readonly pullRequest: CanvasSurfaceRef | null;
  },
) {
  type At = { readonly x: number; readonly y: number };
  const place = (ref: CanvasSurfaceRef, at: At) =>
    void placeSurfaceOnCanvas(threadRef, canvasSurfaceCardOfRef(ref), { at });
  return {
    onAddBrowser: (at: At) => start.browser((tabId) => place({ kind: "preview", tabId }, at)),
    onAddTerminal: (at: At) =>
      start.terminal((resourceId) => place({ kind: "terminal", resourceId }, at)),
    onAddFiles: (at: At) => place({ kind: "files" }, at),
    onAddDiff: (at: At) => place({ kind: "diff" }, at),
    onAddPullRequest: (at: At) => {
      if (start.pullRequest !== null) place(start.pullRequest, at);
    },
    onAddPullRequests: (at: At) => place({ kind: "pull-requests" }, at),
    // No device yet, so the card opens on the panel's device picker.
    onAddDevice: (at: At) => place({ kind: "device" }, at),
    onAddSideChat: (at: At) =>
      start.sideChat((threadId) => place({ kind: "side-chat", threadId }, at)),
  };
}

/**
 * Terminals that cards on a mounted board show. The drawer lists every session the panel does
 * not hold, so without this it would mount a card's terminal a second time.
 */
const useCanvasTerminalStore = create<{
  readonly byThreadKey: Readonly<Record<string, ReadonlyArray<string>>>;
}>()(() => ({ byThreadKey: {} }));

const NO_TERMINALS: ReadonlyArray<string> = [];

export function publishCanvasTerminals(threadRef: ScopedThreadRef, ids: ReadonlyArray<string>) {
  const key = scopedThreadKey(threadRef);
  const current = useCanvasTerminalStore.getState().byThreadKey[key] ?? NO_TERMINALS;
  if (current.length === ids.length && current.every((id, index) => ids[index] === id)) return;
  useCanvasTerminalStore.setState((state) => ({
    byThreadKey: { ...state.byThreadKey, [key]: ids },
  }));
}

export function useCanvasTerminalIds(threadRef: ScopedThreadRef) {
  return useCanvasTerminalStore(
    (state) => state.byThreadKey[scopedThreadKey(threadRef)] ?? NO_TERMINALS,
  );
}

/** Every terminal a set of surface cards shows. */
export function canvasTerminalIdsOf(cards: ReadonlyArray<{ readonly card: unknown }>) {
  return cards.flatMap(({ card }) => {
    const surface = canvasSurfaceCardOf(card)?.surface;
    return surface?.kind === "terminal" ? (surface.terminalIds ?? [surface.resourceId]) : [];
  });
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SurfaceCardBox extends Box {
  readonly id: string;
  readonly kind: CanvasSurfaceRef["kind"];
}

// A live card holds until it is this share of a viewport outside it.
const SURFACE_LEAVE_MARGIN = 0.25;
// Each live card runs a whole panel; past this many, the rest show their face.
const MAX_LIVE_CARDS = 6;

const intersects = (left: Box, right: Box) =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

/**
 * Which surface cards mount their panel, at any zoom. A card goes live when it is in the viewport,
 * and leaves only when it is more than a quarter viewport outside. At most six are live: cards
 * already live keep their place, then element id breaks ties. The card the user is interacting
 * with stays live past the cap.
 */
export function liveSurfaceCards(input: {
  readonly cards: ReadonlyArray<SurfaceCardBox>;
  /** The visible part of the canvas, in scene coordinates. */
  readonly viewport: Box;
  readonly live: ReadonlySet<string>;
  readonly interacting: string | null;
}): ReadonlySet<string> {
  const { viewport, live, interacting } = input;
  const marginX = viewport.width * SURFACE_LEAVE_MARGIN;
  const marginY = viewport.height * SURFACE_LEAVE_MARGIN;
  const held = {
    x: viewport.x - marginX,
    y: viewport.y - marginY,
    width: viewport.width + 2 * marginX,
    height: viewport.height + 2 * marginY,
  };
  const rank = (card: SurfaceCardBox) => (live.has(card.id) ? 0 : 1);
  const eligible = input.cards
    .filter(
      (card) => card.id !== interacting && intersects(card, live.has(card.id) ? held : viewport),
    )
    .toSorted((left, right) => rank(left) - rank(right) || (left.id < right.id ? -1 : 1));
  const interactingCard = input.cards.find((card) => card.id === interacting);
  const cap = MAX_LIVE_CARDS - (interactingCard === undefined ? 0 : 1);
  return new Set([
    ...(interactingCard === undefined ? [] : [interactingCard.id]),
    ...eligible.slice(0, cap).map((card) => card.id),
  ]);
}

const sameMembers = (left: ReadonlySet<string>, right: ReadonlySet<string>) =>
  left.size === right.size && [...left].every((id) => right.has(id));

/**
 * Runs liveSurfaceCards on every camera move from boxes worked out once per scene, and publishes
 * only a change in membership, so panning re-renders nothing until a card goes live or leaves.
 */
export function createSurfaceActivation(publish: (live: ReadonlySet<string>) => void) {
  const boxesByScene = new WeakMap<object, ReadonlyArray<SurfaceCardBox>>();
  let live: ReadonlySet<string> = new Set();
  let interacting: string | null = null;
  let last: { cards: ReadonlyArray<SurfaceCardBox>; viewport: Box } | null = null;
  const run = () => {
    if (last === null) return;
    const next = liveSurfaceCards({ ...last, live, interacting });
    if (sameMembers(next, live)) return;
    live = next;
    publish(next);
  };
  return {
    update(
      elements: ReadonlyArray<{
        readonly id: string;
        readonly isDeleted?: boolean;
        readonly customData?: Record<string, unknown>;
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
      }>,
      view: {
        readonly scrollX: number;
        readonly scrollY: number;
        readonly zoom: { readonly value: number };
      },
      size: { readonly width: number; readonly height: number },
    ) {
      let cards = boxesByScene.get(elements);
      if (cards === undefined) {
        cards = elements.flatMap((element) => {
          const card = element.isDeleted ? null : canvasSurfaceCardOf(element.customData?.t3Card);
          return card === null
            ? []
            : [
                {
                  id: element.id,
                  kind: card.surface.kind,
                  x: element.x,
                  y: element.y,
                  width: element.width,
                  height: element.height,
                },
              ];
        });
        boxesByScene.set(elements, cards);
      }
      const zoom = view.zoom.value;
      last = {
        cards,
        viewport: {
          x: -view.scrollX,
          y: -view.scrollY,
          width: size.width / zoom,
          height: size.height / zoom,
        },
      };
      run();
    },
    setInteracting(id: string | null) {
      if (interacting === id) return;
      interacting = id;
      run();
    },
    /** Whether a live card shows this kind, read on every camera move. */
    showsLive(kind: CanvasSurfaceRef["kind"]) {
      return last?.cards.some((card) => card.kind === kind && live.has(card.id)) ?? false;
    },
  };
}
