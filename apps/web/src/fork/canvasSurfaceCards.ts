import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { PreviewSessionSnapshot, ScopedThreadRef } from "@t3tools/contracts";
import {
  type CanvasSurfaceCard,
  type CanvasSurfaceRef,
  canvasSurfaceCardOf,
  isWorkspaceRelativePath,
} from "@t3tools/shared/canvasSurfaceCard";

import { useRightPanelStore, type RightPanelSurface } from "../rightPanelStore";

/**
 * Right panel surfaces placed on the thread canvas as cards. This module stays free of Excalidraw
 * so the panel can offer "Place on canvas" without loading the board; the board registers a placer
 * while it is mounted, and renders the cards with CanvasSurfaceCardView.
 */

/**
 * The card a panel tab would place, or null when the tab cannot be placed: attachments and host
 * files resolve only on this client, a preview needs a tab with a page, and diff, device, explorer,
 * side chat and the pull request list have no card yet.
 */
export function canvasSurfaceCardFor(
  surface: RightPanelSurface,
  context: {
    readonly previewSessions: Readonly<Record<string, PreviewSessionSnapshot>>;
    readonly title: string;
  },
): CanvasSurfaceCard | null {
  const ref = ((): CanvasSurfaceRef | null => {
    switch (surface.kind) {
      case "file":
        return surface.attachment === undefined && isWorkspaceRelativePath(surface.relativePath)
          ? {
              kind: "file",
              relativePath: surface.relativePath,
              ...(surface.revealLine === null ? {} : { revealLine: surface.revealLine }),
            }
          : null;
      case "preview": {
        const session = surface.resourceId ? context.previewSessions[surface.resourceId] : null;
        return surface.resourceId && session && session.navStatus._tag !== "Idle"
          ? { kind: "preview", tabId: surface.resourceId, url: session.navStatus.url }
          : null;
      }
      case "terminal":
        return { kind: "terminal", resourceId: surface.resourceId };
      case "pull-request":
        return {
          kind: "pull-request",
          projectId: surface.projectId,
          repository: surface.repository,
          number: surface.number,
          ...(surface.host === undefined ? {} : { host: surface.host }),
        };
      default:
        return null;
    }
  })();
  // Parsed back, so a card is never placed that the board or the server would not read.
  return ref === null
    ? null
    : canvasSurfaceCardOf({
        kind: "surface",
        surface: ref,
        // A pull request tab is titled by its number alone, which names nothing on a shared board.
        title: ref.kind === "pull-request" ? `${ref.repository}#${ref.number}` : context.title,
      });
}

type PlaceCard = (card: CanvasSurfaceCard) => void;
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
 * Places a surface card beside the thread's latest turn. The one action every entry point uses;
 * returns false when no board is mounted for the thread.
 */
export function placeSurfaceOnCanvas(threadRef: ScopedThreadRef, card: CanvasSurfaceCard) {
  const place = mountedBoards.get(scopedThreadKey(threadRef));
  if (place === undefined) return false;
  place(card);
  return true;
}

/** Opens the card's surface in the thread's right panel, through the panel's own open actions. */
export function openSurfaceInPanel(threadRef: ScopedThreadRef, ref: CanvasSurfaceRef) {
  const panel = useRightPanelStore.getState();
  switch (ref.kind) {
    case "file":
      panel.openFile(threadRef, ref.relativePath, ref.revealLine);
      return;
    case "preview":
      panel.openBrowser(threadRef, ref.tabId);
      return;
    case "terminal":
      panel.openTerminal(threadRef, ref.resourceId);
      return;
    case "pull-request":
      panel.openPullRequest(threadRef, {
        projectId: ref.projectId,
        repository: ref.repository,
        number: ref.number,
        ...(ref.host === undefined ? {} : { host: ref.host }),
      });
      return;
  }
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

// Below this zoom a card's text is too small to read, so it shows its face.
const SURFACE_LIVE_ZOOM = 0.5;
// A live card holds on a little past the threshold, so a zoom hovering at it does not thrash.
const SURFACE_LEAVE_ZOOM = 0.45;
// A live card holds until it is this share of a viewport outside it.
const SURFACE_LEAVE_MARGIN = 0.25;
// Each live file card highlights its source; past this many, the rest show their face.
const MAX_LIVE_FILE_CARDS = 4;

const intersects = (left: Box, right: Box) =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

/**
 * Which surface cards mount their live view. A card goes live when it is in the viewport at zoom
 * 0.5 or more, and leaves only when it is more than a quarter viewport outside or below zoom 0.45.
 * At most four file cards are live: cards already live keep their place, then element id breaks
 * ties. The card the user is interacting with stays live past the cap.
 */
export function liveSurfaceCards(input: {
  readonly cards: ReadonlyArray<SurfaceCardBox>;
  /** The visible part of the canvas, in scene coordinates. */
  readonly viewport: Box;
  readonly zoom: number;
  readonly live: ReadonlySet<string>;
  readonly interacting: string | null;
}): ReadonlySet<string> {
  const { viewport, zoom, live, interacting } = input;
  const marginX = viewport.width * SURFACE_LEAVE_MARGIN;
  const marginY = viewport.height * SURFACE_LEAVE_MARGIN;
  const held = {
    x: viewport.x - marginX,
    y: viewport.y - marginY,
    width: viewport.width + 2 * marginX,
    height: viewport.height + 2 * marginY,
  };
  const eligible = input.cards.filter((card) =>
    live.has(card.id)
      ? zoom >= SURFACE_LEAVE_ZOOM && intersects(card, held)
      : zoom >= SURFACE_LIVE_ZOOM && intersects(card, viewport),
  );
  const rank = (card: SurfaceCardBox) => (live.has(card.id) ? 0 : 1);
  const files = eligible
    .filter((card) => card.kind === "file" && card.id !== interacting)
    .toSorted((left, right) => rank(left) - rank(right) || (left.id < right.id ? -1 : 1));
  const interactingCard = input.cards.find((card) => card.id === interacting);
  const fileCap = MAX_LIVE_FILE_CARDS - (interactingCard?.kind === "file" ? 1 : 0);
  return new Set([
    ...(interactingCard === undefined ? [] : [interactingCard.id]),
    ...eligible.filter((card) => card.kind !== "file").map((card) => card.id),
    ...files.slice(0, Math.max(0, fileCap)).map((card) => card.id),
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
  let last: { cards: ReadonlyArray<SurfaceCardBox>; viewport: Box; zoom: number } | null = null;
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
        zoom,
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
  };
}
