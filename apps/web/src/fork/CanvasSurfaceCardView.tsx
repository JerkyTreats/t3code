import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import {
  type CanvasSurfaceCard,
  type CanvasSurfaceRef,
  canvasSurfaceCardOf,
  canvasSurfaceTitle,
} from "@t3tools/shared/canvasSurfaceCard";
import {
  anchorTo,
  besideSpine,
  slideOut,
  TURN_ANCHOR_KEY,
  turnCorridorOf,
  turnSpineOf,
} from "@t3tools/shared/threadCanvasDrawing";
import {
  FileDiff,
  Files,
  FileText,
  Globe2,
  MessagesSquare,
  Smartphone,
  TerminalSquare,
} from "lucide-react";
import { memo, type ReactNode } from "react";

import { PullRequestGlyph } from "../components/pullRequest/pullRequestIcons";
import { Button } from "../components/ui/button";
import {
  selectThreadPreviewMiniPlayer,
  usePreviewMiniPlayerStore,
} from "../previewMiniPlayerStore";
import { useThreadPreviewState } from "../previewStateStore";
import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import { useProjects, useQuietThreadShell } from "../state/entities";
import { useKnownTerminalSessions } from "../state/terminalSessions";
import {
  type PanelSurfaceCard,
  type RenderPanelSurface,
  type SurfacePlacement,
  panelSurfaceOf,
  surfaceShownElsewhere,
} from "./canvasSurfaceCards";
import { TURN_INSET_PX } from "./turnBoard";

const CARD_STROKE_COLOR = "#868e96";
const CARD_GAP_PX = 32;
// A card opens at the size its panel reads well at; Excalidraw resizes it from there.
const CARD_SIZES: Record<CanvasSurfaceRef["kind"], { width: number; height: number }> = {
  file: { width: 640, height: 520 },
  files: { width: 760, height: 520 },
  preview: { width: 800, height: 600 },
  terminal: { width: 640, height: 380 },
  diff: { width: 780, height: 560 },
  "pull-request": { width: 640, height: 560 },
  "pull-requests": { width: 480, height: 480 },
  "side-chat": { width: 460, height: 600 },
  device: { width: 420, height: 780 },
};

type Element = ReturnType<ExcalidrawImperativeAPI["getSceneElements"]>[number];

/**
 * Adds a surface card as one undoable step: at a scene point, beside a turn or another card, or by
 * default beside the latest turn, where an agent's besideLatestTurn drawing lands. A card beside a
 * turn is anchored to that turn's top edge so it stays level as turns grow.
 */
export function placeSurfaceCard(
  api: ExcalidrawImperativeAPI,
  card: CanvasSurfaceCard,
  where?: SurfacePlacement,
) {
  const scene = api.getSceneElements();
  const inner = CARD_SIZES[card.surface.kind];
  const size = { width: inner.width + 2 * TURN_INSET_PX, height: inner.height + 2 * TURN_INSET_PX };
  const solid = scene.filter((element) => element.type !== "arrow" && element.type !== "line");
  const turns = scene.filter((element) => typeof element.customData?.t3Turn === "string");
  const spot = ((): { x: number; y: number; turn: Element | null } => {
    if (where !== undefined && "at" in where) return { ...where.at, turn: null };
    if (where !== undefined && "besideElement" in where) {
      const beside = scene.find((element) => element.id === where.besideElement);
      if (beside !== undefined) {
        const x = beside.x + beside.width + CARD_GAP_PX;
        return { ...slideOut(solid, { ...size, x, y: beside.y }, 1), turn: null };
      }
    }
    const besideTurn =
      where !== undefined && "besideTurn" in where
        ? turns.find((turn) => turn.customData?.t3Turn === where.besideTurn)
        : undefined;
    const spine = turnSpineOf(turns);
    const turnSpine =
      spine === null || besideTurn === undefined ? spine : { ...spine, latestTurn: besideTurn };
    const latestTurn = turns.find((turn) => turn === turnSpine?.latestTurn) ?? null;
    return {
      ...besideSpine([...solid, ...turnCorridorOf(spine)], turnSpine, size),
      turn: latestTurn,
    };
  })();
  const turnId = spot.turn?.customData?.t3Turn;
  const anchor =
    spot.turn === null || typeof turnId !== "string"
      ? null
      : anchorTo(spot, turnId, "top", spot.turn.y);
  const [element] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: spot.x,
      y: spot.y,
      ...size,
      strokeColor: CARD_STROKE_COLOR,
      strokeWidth: 1,
      roundness: { type: 3 },
      customData: {
        t3Card: card,
        ...(anchor === null ? {} : { [TURN_ANCHOR_KEY]: anchor }),
      },
    },
  ]);
  if (element === undefined) return;
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

/**
 * The card's own actions for the panel component it runs. Showing another surface is navigation,
 * not a drawing edit, so it stays out of undo; closing is a deletion, which undo brings back.
 */
function surfaceCardActions(api: ExcalidrawImperativeAPI, elementId: string): PanelSurfaceCard {
  const update = (change: (element: Element) => Partial<Element>, capture: boolean) => {
    const elements = api.getSceneElementsIncludingDeleted();
    if (!elements.some((element) => element.id === elementId && !element.isDeleted)) return;
    api.updateScene({
      elements: elements.map((element) =>
        element.id === elementId ? newElementWith(element, change(element)) : element,
      ),
      captureUpdate: capture ? CaptureUpdateAction.IMMEDIATELY : CaptureUpdateAction.NEVER,
    });
  };
  return {
    show: (ref) =>
      update((element) => {
        const current = canvasSurfaceCardOf(element.customData?.t3Card);
        // A terminal group keeps the name it was placed with as its terminals come and go.
        const title =
          current !== null && current.surface.kind === "terminal" && ref.kind === "terminal"
            ? current.title
            : canvasSurfaceTitle(ref);
        return {
          customData: { ...element.customData, t3Card: { kind: "surface", surface: ref, title } },
        };
      }, false),
    place: (ref) =>
      placeSurfaceCard(
        api,
        { kind: "surface", surface: ref, title: canvasSurfaceTitle(ref) },
        { besideElement: elementId },
      ),
    close: () => update(() => ({ isDeleted: true }), true),
  };
}

type Availability =
  | { readonly state: "ready" }
  | { readonly state: "loading" }
  | { readonly state: "unavailable"; readonly reason: string };

const READY: Availability = { state: "ready" };
const LOADING: Availability = { state: "loading" };

function useTerminalAvailability(
  threadRef: ScopedThreadRef,
  surface: Extract<CanvasSurfaceRef, { kind: "terminal" }>,
): Availability {
  const sessions = useKnownTerminalSessions(threadRef);
  const ids = surface.terminalIds ?? [surface.resourceId];
  if (sessions === null) return LOADING;
  return sessions.some((session) => ids.includes(session.target.terminalId))
    ? READY
    : { state: "unavailable", reason: "The terminal was closed." };
}

function usePreviewAvailability(
  threadRef: ScopedThreadRef,
  surface: Extract<CanvasSurfaceRef, { kind: "preview" }>,
): Availability {
  const preview = useThreadPreviewState(threadRef);
  if (preview.sessions[surface.tabId] !== undefined) return READY;
  return preview.listLoaded
    ? { state: "unavailable", reason: "The browser tab was closed." }
    : LOADING;
}

function usePullRequestAvailability(
  threadRef: ScopedThreadRef,
  surface: Extract<CanvasSurfaceRef, { kind: "pull-request" }>,
): Availability {
  // The board's own thread arrives in the same snapshot as the projects, so until it does the
  // project list is not yet known; after it, a missing project is gone, not loading.
  const known = useQuietThreadShell(threadRef) !== null;
  const projects = useProjects();
  if (!known) return LOADING;
  return projects.some(
    (project) =>
      project.environmentId === threadRef.environmentId && project.id === surface.projectId,
  )
    ? READY
    : { state: "unavailable", reason: "Its project was removed." };
}

type GateProps<Ref> = {
  readonly threadRef: ScopedThreadRef;
  readonly surface: Ref;
  readonly card: CanvasSurfaceCard;
  readonly children: ReactNode;
};

function gated(availability: Availability, props: GateProps<unknown>) {
  if (availability.state === "ready") return props.children;
  return (
    <CardFace card={props.card}>
      <p className="text-muted-foreground text-xs" data-surface-availability={availability.state}>
        {availability.state === "loading"
          ? "Connecting…"
          : `No longer available. ${availability.reason}`}
      </p>
    </CardFace>
  );
}

function TerminalGate(props: GateProps<Extract<CanvasSurfaceRef, { kind: "terminal" }>>) {
  return gated(useTerminalAvailability(props.threadRef, props.surface), props);
}

function PreviewGate(props: GateProps<Extract<CanvasSurfaceRef, { kind: "preview" }>>) {
  return gated(usePreviewAvailability(props.threadRef, props.surface), props);
}

function PullRequestGate(props: GateProps<Extract<CanvasSurfaceRef, { kind: "pull-request" }>>) {
  return gated(usePullRequestAvailability(props.threadRef, props.surface), props);
}

/**
 * Holds a card on its face while the resource it names is gone or not yet known, so a card never
 * reopens a closed terminal or browser tab. The other panels report a missing resource themselves.
 */
function AvailabilityGate(props: GateProps<CanvasSurfaceRef>) {
  const { surface } = props;
  switch (surface.kind) {
    case "terminal":
      return <TerminalGate {...props} surface={surface} />;
    case "preview":
      return <PreviewGate {...props} surface={surface} />;
    case "pull-request":
      return <PullRequestGate {...props} surface={surface} />;
    default:
      return props.children;
  }
}

const KIND_ICONS: Record<CanvasSurfaceRef["kind"], ReactNode> = {
  file: <FileText className="size-4 shrink-0" />,
  files: <Files className="size-4 shrink-0" />,
  preview: <Globe2 className="size-4 shrink-0" />,
  terminal: <TerminalSquare className="size-4 shrink-0" />,
  diff: <FileDiff className="size-4 shrink-0" />,
  "pull-request": <PullRequestGlyph.pullRequest className="size-4 shrink-0" />,
  "pull-requests": <PullRequestGlyph.link className="size-4 shrink-0" />,
  "side-chat": <MessagesSquare className="size-4 shrink-0" />,
  device: <Smartphone className="size-4 shrink-0" />,
};

/** What a card shows while its panel is not mounted: its kind, its title and why. */
function CardFace(props: { readonly card: CanvasSurfaceCard; readonly children?: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 px-3 py-2" data-surface-face>
      <div className="flex items-center gap-2">
        {KIND_ICONS[props.card.surface.kind]}
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{props.card.title}</div>
      </div>
      {props.children}
    </div>
  );
}

/** Mounts the card's panel unless the panel or the mini player in this client already shows it. */
function LiveSurface(props: {
  readonly threadRef: ScopedThreadRef;
  readonly card: CanvasSurfaceCard;
  readonly actions: PanelSurfaceCard;
  readonly renderPanelSurface: RenderPanelSurface;
  /** Another live card on this board shows the same browser, terminal, side chat or device. */
  readonly inAnotherCard: boolean;
  readonly onShowHere: () => void;
}) {
  const { threadRef, card } = props;
  const panel = useRightPanelStore((state) => {
    const thread = selectThreadRightPanelState(state.byThreadKey, threadRef);
    return thread.isOpen
      ? (thread.surfaces.find((surface) => surface.id === thread.activeSurfaceId) ?? null)
      : null;
  });
  const miniPlayer = usePreviewMiniPlayerStore(
    (state) => selectThreadPreviewMiniPlayer(state.byThreadKey, threadRef)?.source ?? null,
  );
  const elsewhere =
    surfaceShownElsewhere(card.surface, { panel, miniPlayer }) ??
    (props.inAnotherCard ? "card" : null);
  if (elsewhere !== null) {
    return (
      <CardFace card={card}>
        <p className="text-muted-foreground text-xs">
          {elsewhere === "panel"
            ? "Showing in the right panel."
            : elsewhere === "card"
              ? "Showing in another card."
              : "Showing in the floating player."}
        </p>
        <div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              if (elsewhere === "panel") useRightPanelStore.getState().close(threadRef);
              else if (elsewhere === "mini-player") {
                usePreviewMiniPlayerStore.getState().close(threadRef);
              } else props.onShowHere();
            }}
          >
            Show here
          </Button>
        </div>
      </CardFace>
    );
  }
  const covered = card.surface.kind === "preview" || card.surface.kind === "device";
  return (
    <div className="relative flex h-full min-h-0 flex-col" data-surface-live-view>
      {props.renderPanelSurface(panelSurfaceOf(card.surface), props.actions)}
      {/* A browser or device stream keeps every pointer and wheel event, so the board would
          never pan over it. The cover passes those on; a click lifts it to use the page until
          the pointer leaves the card. */}
      {covered ? (
        <div
          className="canvas-card-cover"
          onPointerDown={(event) => {
            if (event.button === 0) event.currentTarget.hidden = true;
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A right panel tab on the board, running the same component the panel shows for it. A card off
 * screen, or past the live cap, shows only its face. Memoized on the stored card, so dragging or
 * resizing the box re-renders nothing inside it.
 */
export const CanvasSurfaceCardView = memo(function CanvasSurfaceCardView(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly elementId: string;
  /** The stored `t3Card`, serialized so a geometry-only scene change compares equal. */
  readonly cardJson: string;
  readonly live: boolean;
  readonly api: ExcalidrawImperativeAPI;
  readonly renderPanelSurface: RenderPanelSurface;
  /** Set while another live card shows this card's browser, terminal, side chat or device. */
  readonly inAnotherCard: boolean;
  /** Makes this card the one that shows its resource. */
  readonly onShowHere: (elementId: string) => void;
}) {
  const card = canvasSurfaceCardOf(JSON.parse(props.cardJson));
  if (card === null) return null;
  const threadRef = { environmentId: props.environmentId, threadId: props.threadId };
  if (!props.live) return <CardFace card={card} />;
  return (
    <AvailabilityGate threadRef={threadRef} surface={card.surface} card={card}>
      <LiveSurface
        threadRef={threadRef}
        card={card}
        actions={surfaceCardActions(props.api, props.elementId)}
        renderPanelSurface={props.renderPanelSurface}
        inAnotherCard={props.inAnotherCard}
        onShowHere={() => props.onShowHere(props.elementId)}
      />
    </AvailabilityGate>
  );
});
