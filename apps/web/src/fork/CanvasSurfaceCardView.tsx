import { CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import type { CanvasSurfaceCard, CanvasSurfaceRef } from "@t3tools/shared/canvasSurfaceCard";
import { resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import {
  anchorTo,
  besideSpine,
  TURN_ANCHOR_KEY,
  turnCorridorOf,
  turnSpineOf,
} from "@t3tools/shared/threadCanvasDrawing";
import { FileText, Globe2, TerminalSquare } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, type ReactNode } from "react";

import { projectFileCacheKey } from "../components/files/fileContentRevision";
import { useProjectFileQuery } from "../components/files/projectFilesQueryState";
import { PullRequestGlyph } from "../components/pullRequest/pullRequestIcons";
import { Button } from "../components/ui/button";
import { useThreadPreviewState } from "../previewStateStore";
import { useProject, useProjects, useQuietThreadShell } from "../state/entities";
import { pullRequestEnvironment, useSharedPullRequestSummary } from "../state/pullRequests";
import { useEnvironmentQuery } from "../state/query";
import { useKnownTerminalSessions } from "../state/terminalSessions";
import { openSurfaceInPanel } from "./canvasSurfaceCards";
import { TURN_INSET_PX } from "./turnBoard";

// The highlighted source view the file panel uses, without its editor, shortcuts or save paths.
const ReadOnlySourcePreview = lazy(() => import("../components/files/ReadOnlySourcePreview"));

const CARD_STROKE_COLOR = "#868e96";
// A file card shows a screenful of source; the others show only their face.
const FILE_CARD_SIZE = { width: 640, height: 480 };
const FACE_CARD_SIZE = { width: 380, height: 150 };

/**
 * Adds a surface card beside the latest turn, where an agent's besideLatestTurn drawing lands, and
 * anchors it to that turn's top edge so it stays level as turns grow. Placing is one undoable step.
 */
export function placeSurfaceCard(api: ExcalidrawImperativeAPI, card: CanvasSurfaceCard) {
  const scene = api.getSceneElements();
  const turns = scene.filter((element) => typeof element.customData?.t3Turn === "string");
  const spine = turnSpineOf(turns);
  const inner = card.surface.kind === "file" ? FILE_CARD_SIZE : FACE_CARD_SIZE;
  const size = { width: inner.width + 2 * TURN_INSET_PX, height: inner.height + 2 * TURN_INSET_PX };
  const solid = scene.filter((element) => element.type !== "arrow" && element.type !== "line");
  const spot = besideSpine([...solid, ...turnCorridorOf(spine)], spine, size);
  const latestTurn = turns.find((turn) => turn === spine?.latestTurn);
  const turnId = latestTurn?.customData?.t3Turn;
  const anchor =
    latestTurn === undefined || typeof turnId !== "string"
      ? null
      : anchorTo(spot, turnId, "top", latestTurn.y);
  const [element] = convertToExcalidrawElements([
    {
      type: "rectangle",
      ...spot,
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

type Availability =
  | { readonly state: "ready" }
  | { readonly state: "loading" }
  | { readonly state: "unavailable"; readonly reason: string }
  | { readonly state: "error"; readonly reason: string };

const READY: Availability = { state: "ready" };
const LOADING: Availability = { state: "loading" };

function availabilityText(availability: Availability) {
  switch (availability.state) {
    case "ready":
      return null;
    case "loading":
      return "Connecting…";
    case "unavailable":
      return `No longer available. ${availability.reason}`;
    case "error":
      return `Can't reach it right now. ${availability.reason}`;
  }
}

/** The workspace a file ref resolves in: the board's thread worktree, else its project root. */
function useThreadWorkspaceRoot(threadRef: ScopedThreadRef) {
  const shell = useQuietThreadShell(threadRef);
  const project = useProject(
    shell === null ? null : scopeProjectRef(threadRef.environmentId, shell.projectId),
  );
  return {
    cwd: shell?.worktreePath ?? project?.workspaceRoot ?? null,
    // A run that finished may have changed files, so a live card reads them again.
    revision: `${shell?.latestRun?.runId ?? ""}:${shell?.latestRun?.completedAt ?? ""}`,
    known: shell !== null,
  };
}

function FileCardBody(props: {
  readonly threadRef: ScopedThreadRef;
  readonly surface: Extract<CanvasSurfaceRef, { kind: "file" }>;
  readonly live: boolean;
  readonly onInteract: (interacting: boolean) => void;
}) {
  const workspace = useThreadWorkspaceRoot(props.threadRef);
  const file = useProjectFileQuery(
    props.threadRef.environmentId,
    workspace.cwd ?? "",
    props.surface.relativePath,
    props.live && workspace.cwd !== null,
  );
  const readRevision = useRef(workspace.revision);
  const { live } = props;
  const { refresh } = file;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a finished run may have changed the file, and the panel's own refetch only runs while the panel shows it
  useEffect(() => {
    if (!live || readRevision.current === workspace.revision) return;
    readRevision.current = workspace.revision;
    refresh();
  }, [live, refresh, workspace.revision]);
  const availability: Availability = !workspace.known
    ? LOADING
    : workspace.cwd === null
      ? { state: "unavailable", reason: "This thread has no workspace." }
      : file.readError !== null
        ? { state: "unavailable", reason: file.readError.message }
        : file.error !== null
          ? { state: "error", reason: file.error }
          : file.data === null && props.live
            ? LOADING
            : READY;
  if (availability.state !== "ready") return <CardNotice availability={availability} />;
  if (!props.live || file.data === null) {
    return <p className="text-muted-foreground px-3 py-2 text-xs">Zoom in or scroll to read.</p>;
  }
  if (file.data.truncated) {
    return (
      <p className="text-muted-foreground px-3 py-2 text-xs">
        Too large to show here. Open it in the panel.
      </p>
    );
  }
  return (
    <div className="relative flex min-h-0 flex-1 flex-col" data-surface-live-view>
      <Suspense fallback={null}>
        <ReadOnlySourcePreview
          name={props.surface.relativePath}
          text={file.data.contents}
          cacheKey={`canvas:${props.threadRef.environmentId}:${projectFileCacheKey(workspace.cwd ?? "", props.surface.relativePath, file.data.contents)}`}
        />
      </Suspense>
      {/* Wheel and drag over the source pan the board until a click lifts this cover to scroll
          and select the source; the board puts it back when the pointer leaves the card. */}
      <div
        className="canvas-card-cover"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.hidden = true;
          props.onInteract(true);
        }}
      />
    </div>
  );
}

function usePullRequestAvailability(
  threadRef: ScopedThreadRef,
  surface: Extract<CanvasSurfaceRef, { kind: "pull-request" }>,
  live: boolean,
) {
  // The board's own thread arrives in the same snapshot as the projects, so until it does the
  // project list is not yet known; after it, a missing project is gone, not loading.
  const known = useQuietThreadShell(threadRef) !== null;
  const projects = useProjects();
  const member = projects.some(
    (project) =>
      project.environmentId === threadRef.environmentId && project.id === surface.projectId,
  );
  const reference = {
    projectId: surface.projectId as ProjectId,
    repository: surface.repository,
    number: surface.number,
  };
  // Fetched only while the card is in view and its project exists; the summary cache answers
  // otherwise.
  const detail = useEnvironmentQuery(
    live && member
      ? pullRequestEnvironment.detail({
          environmentId: threadRef.environmentId,
          input: {
            ...reference,
            ...(surface.host === undefined ? {} : { host: surface.host }),
            allowStale: true,
          },
        })
      : null,
  );
  const summary = useSharedPullRequestSummary(threadRef.environmentId, reference);
  const availability: Availability = !known
    ? LOADING
    : !member
      ? { state: "unavailable", reason: "Its project was removed." }
      : detail.error !== null
        ? { state: "error", reason: detail.error }
        : READY;
  return { availability, title: summary?.title ?? detail.data?.title ?? null };
}

function useTerminalAvailability(
  threadRef: ScopedThreadRef,
  surface: Extract<CanvasSurfaceRef, { kind: "terminal" }>,
) {
  const sessions = useKnownTerminalSessions(threadRef);
  const session = sessions?.find((entry) => entry.target.terminalId === surface.resourceId);
  const availability: Availability =
    sessions === null
      ? LOADING
      : session === undefined
        ? { state: "unavailable", reason: "The terminal was closed." }
        : READY;
  return {
    availability,
    label: resolveTerminalSessionLabel(surface.resourceId, session?.state.summary),
  };
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

function CardNotice(props: { readonly availability: Availability }) {
  return (
    <p
      className="text-muted-foreground px-3 py-2 text-xs"
      data-surface-availability={props.availability.state}
    >
      {availabilityText(props.availability)}
    </p>
  );
}

function CardFrame(props: {
  readonly threadRef: ScopedThreadRef;
  readonly card: CanvasSurfaceCard;
  readonly icon: ReactNode;
  readonly title: string;
  readonly detail: string;
  readonly openable: boolean;
  readonly onPointerLeave?: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col" onPointerLeave={props.onPointerLeave}>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        {props.icon}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{props.title}</div>
          <div className="text-muted-foreground truncate text-xs">{props.detail}</div>
        </div>
        <Button
          size="xs"
          variant="outline"
          disabled={!props.openable}
          onClick={() => openSurfaceInPanel(props.threadRef, props.card.surface)}
        >
          Open in panel
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{props.children}</div>
    </div>
  );
}

function FileCard(props: {
  readonly threadRef: ScopedThreadRef;
  readonly card: CanvasSurfaceCard;
  readonly surface: Extract<CanvasSurfaceRef, { kind: "file" }>;
  readonly live: boolean;
  readonly onInteract: (interacting: boolean) => void;
}) {
  const { surface } = props;
  return (
    <CardFrame
      threadRef={props.threadRef}
      card={props.card}
      icon={<FileText className="size-4 shrink-0" />}
      title={props.card.title}
      detail={
        surface.revealLine === undefined
          ? surface.relativePath
          : `${surface.relativePath}:${surface.revealLine}`
      }
      openable
      onPointerLeave={() => props.onInteract(false)}
    >
      <FileCardBody
        threadRef={props.threadRef}
        surface={surface}
        live={props.live}
        onInteract={props.onInteract}
      />
    </CardFrame>
  );
}

function PullRequestCard(props: {
  readonly threadRef: ScopedThreadRef;
  readonly card: CanvasSurfaceCard;
  readonly surface: Extract<CanvasSurfaceRef, { kind: "pull-request" }>;
  readonly live: boolean;
}) {
  const { availability, title } = usePullRequestAvailability(
    props.threadRef,
    props.surface,
    props.live,
  );
  return (
    <CardFrame
      threadRef={props.threadRef}
      card={props.card}
      icon={<PullRequestGlyph.pullRequest className="size-4 shrink-0" />}
      title={title ?? props.card.title}
      detail={`${props.surface.repository} #${props.surface.number}`}
      openable={availability.state !== "unavailable"}
    >
      {availability.state === "ready" ? null : <CardNotice availability={availability} />}
    </CardFrame>
  );
}

function TerminalCard(props: {
  readonly threadRef: ScopedThreadRef;
  readonly card: CanvasSurfaceCard;
  readonly surface: Extract<CanvasSurfaceRef, { kind: "terminal" }>;
}) {
  const { availability, label } = useTerminalAvailability(props.threadRef, props.surface);
  return (
    <CardFrame
      threadRef={props.threadRef}
      card={props.card}
      icon={<TerminalSquare className="size-4 shrink-0" />}
      title={props.card.title}
      detail={label}
      openable={availability.state !== "unavailable"}
    >
      {availability.state === "ready" ? null : <CardNotice availability={availability} />}
    </CardFrame>
  );
}

function PreviewCard(props: {
  readonly threadRef: ScopedThreadRef;
  readonly card: CanvasSurfaceCard;
  readonly surface: Extract<CanvasSurfaceRef, { kind: "preview" }>;
}) {
  const availability = usePreviewAvailability(props.threadRef, props.surface);
  return (
    <CardFrame
      threadRef={props.threadRef}
      card={props.card}
      icon={<Globe2 className="size-4 shrink-0" />}
      title={props.card.title}
      detail={props.surface.url}
      openable={availability.state !== "unavailable"}
    >
      {availability.state === "ready" ? null : <CardNotice availability={availability} />}
    </CardFrame>
  );
}

/**
 * A panel surface on the board. A file card mounts its read-only source while `live`; every other
 * card is a face that reopens its surface in the panel. Nothing here edits, saves or owns the
 * resource, so the panel copy of the same surface stays the one that does.
 */
export function CanvasSurfaceCardView(props: {
  readonly threadRef: ScopedThreadRef;
  readonly card: CanvasSurfaceCard;
  readonly live: boolean;
  /** Reports a click into the live view and the pointer leaving the card. */
  readonly onInteract: (interacting: boolean) => void;
}) {
  const { surface } = props.card;
  switch (surface.kind) {
    case "file":
      return <FileCard {...props} surface={surface} />;
    case "pull-request":
      return (
        <PullRequestCard
          threadRef={props.threadRef}
          card={props.card}
          surface={surface}
          live={props.live}
        />
      );
    case "terminal":
      return <TerminalCard threadRef={props.threadRef} card={props.card} surface={surface} />;
    case "preview":
      return <PreviewCard threadRef={props.threadRef} card={props.card} surface={surface} />;
  }
}
