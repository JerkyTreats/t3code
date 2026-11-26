import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ProjectId,
  WORKSPACE_CANVAS_TITLE_MAX_CHARS,
  type WorkspaceCanvasId,
  type WorkspaceCanvasRecord,
  workspaceCanvasThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { EllipsisIcon, FrameIcon, LayoutDashboardIcon, PlusIcon } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { T, useGT } from "gt-react";
import { m } from "~/i18n/messages";

import { toastManager } from "../components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { useStableCallback } from "../hooks/useStableCallback";
import { cn } from "../lib/utils";
import { readLocalApi } from "../localApi";
import { useQuietThreadShell } from "../state/entities";
import { readEnvironmentScope, useEnvironmentScope } from "../state/session";
import { useAtomCommand } from "../state/use-atom-command";
import {
  useEnvironmentWorkspaceCanvases,
  workspaceCanvasCreate,
  workspaceCanvasDelete,
  workspaceCanvasRename,
} from "../state/workspaceCanvas";
import { type CanvasChatAnchor, focusedChatOf, useCanvasAnchorsStore } from "./canvasAnchors";
import { chatColorOf } from "./canvasChatPresence";
import { chatActivityLabel, chatActivityOf } from "./canvasChatStatus";
import { forgetDeletedBoard } from "./workspaceCanvasBoards";

export interface SidebarCanvasProject {
  readonly id: ProjectId;
  readonly environmentId: EnvironmentId;
  readonly title: string;
}

const CANVAS_TITLE_SUFFIX = " canvas";

/** "<project> canvas", the project's name shortened so the whole title fits a canvas title. */
function defaultCanvasTitle(projectTitle: string): string {
  const room = WORKSPACE_CANVAS_TITLE_MAX_CHARS - CANVAS_TITLE_SUFFIX.length;
  const name = projectTitle.trim();
  const fitted = name.length <= room ? name : `${name.slice(0, room - 1).trimEnd()}…`;
  return `${fitted}${CANVAS_TITLE_SUFFIX}`;
}

export function useCreateWorkspaceCanvas(onNavigate?: () => void) {
  const gt = useGT();
  const navigate = useNavigate();
  const createCanvas = useAtomCommand(workspaceCanvasCreate, { reportFailure: false });
  return useStableCallback(async (project: SidebarCanvasProject, title?: string) => {
    const result = await createCanvas({
      environmentId: project.environmentId,
      input: {
        projectId: project.id,
        title:
          title === undefined
            ? defaultCanvasTitle(project.title)
            : title.trim().slice(0, WORKSPACE_CANVAS_TITLE_MAX_CHARS),
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: gt("Could not create workspace canvas"),
          description: thrownErrorMessage(error, m) ?? gt("An error occurred."),
        });
      }
      return null;
    }
    onNavigate?.();
    await navigate({
      to: "/canvas/$environmentId/$canvasId",
      params: {
        environmentId: project.environmentId,
        canvasId: result.value.id,
      },
    });
    return result.value;
  });
}

const projectKeyOf = (project: SidebarCanvasProject) => `${project.environmentId}:${project.id}`;

export function SidebarCanvasSection(props: {
  readonly projects: ReadonlyArray<SidebarCanvasProject>;
  readonly scopedProjectKeys: ReadonlySet<string> | null;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const { projects, scopedProjectKeys, onNavigate } = props;
  const gt = useGT();
  const createWorkspaceCanvas = useCreateWorkspaceCanvas(onNavigate);

  const visibleProjects =
    scopedProjectKeys === null || scopedProjectKeys.size === 0
      ? projects
      : projects.filter((project) => scopedProjectKeys.has(projectKeyOf(project)));

  const environmentIds = [...new Set(visibleProjects.map((project) => project.environmentId))];

  const projectByKey = new Map(projects.map((project) => [projectKeyOf(project), project]));

  const allowedProjectIdsByEnv = new Map<EnvironmentId, Set<ProjectId>>();
  for (const project of visibleProjects) {
    const existing = allowedProjectIdsByEnv.get(project.environmentId);
    if (existing) {
      existing.add(project.id);
    } else {
      allowedProjectIdsByEnv.set(project.environmentId, new Set([project.id]));
    }
  }

  const firstProject = visibleProjects[0] ?? null;
  const canCreate = useEnvironmentScope(
    firstProject?.environmentId ?? null,
    AuthOrchestrationOperateScope,
  );

  // One project creates there; several ask which, since a canvas belongs to one project.
  const createCanvas = async (event: MouseEvent<HTMLButtonElement>) => {
    const candidates = visibleProjects.filter((project) =>
      readEnvironmentScope(project.environmentId, AuthOrchestrationOperateScope),
    );
    const [only] = candidates;
    if (only === undefined) return;
    const api = candidates.length > 1 ? readLocalApi() : undefined;
    if (!api) {
      await createWorkspaceCanvas(only);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const picked = await settlePromise(() =>
      api.contextMenu.show(
        candidates.map((project) => ({ id: projectKeyOf(project), label: project.title })),
        { x: rect.left, y: rect.bottom },
      ),
    );
    if (picked._tag === "Failure" || picked.value === null) return;
    const project = projectByKey.get(picked.value);
    if (project) await createWorkspaceCanvas(project);
  };

  if (projects.length === 0) return null;

  return (
    <div className="mb-2 flex flex-col gap-0.5" data-sidebar-canvases>
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-2xs font-medium tracking-wide text-sidebar-muted-foreground uppercase">
          <T>Canvases</T>
        </span>
        {firstProject && canCreate ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={gt("New workspace canvas")}
                  onClick={(event) => void createCanvas(event)}
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                >
                  <PlusIcon className="size-3.5" />
                </button>
              }
            />
            <TooltipPopup side="right">
              <T>New workspace canvas</T>
            </TooltipPopup>
          </Tooltip>
        ) : null}
      </div>

      {environmentIds.map((environmentId) => (
        <EnvironmentCanvasList
          key={environmentId}
          environmentId={environmentId}
          allowedProjectIds={allowedProjectIdsByEnv.get(environmentId) ?? null}
          showProjectBadge={visibleProjects.length > 1}
          projectByKey={projectByKey}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}

function EnvironmentCanvasList(props: {
  readonly environmentId: EnvironmentId;
  readonly allowedProjectIds: ReadonlySet<ProjectId> | null;
  readonly showProjectBadge: boolean;
  readonly projectByKey: ReadonlyMap<string, SidebarCanvasProject>;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const { environmentId, allowedProjectIds, showProjectBadge, projectByKey, onNavigate } = props;
  // A server that cannot list canvases, such as an older linked one, shows none.
  const { canvases } = useEnvironmentWorkspaceCanvases(environmentId);
  const filtered =
    allowedProjectIds === null
      ? canvases
      : canvases.filter((canvas) => allowedProjectIds.has(canvas.projectId));

  if (filtered.length === 0) return null;

  return (
    <ul className="flex flex-col gap-0.5" role="list">
      {filtered.map((canvas) => (
        <WorkspaceCanvasRow
          key={canvas.id}
          environmentId={environmentId}
          canvas={canvas}
          projectName={
            showProjectBadge
              ? (projectByKey.get(`${environmentId}:${canvas.projectId}`)?.title ?? null)
              : null
          }
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function WorkspaceCanvasRow(props: {
  readonly environmentId: EnvironmentId;
  readonly canvas: WorkspaceCanvasRecord;
  readonly projectName: string | null;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const { environmentId, canvas, projectName, onNavigate } = props;
  const gt = useGT();
  const navigate = useNavigate();
  const location = useLocation();
  const canOperate = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const renameCanvas = useAtomCommand(workspaceCanvasRename, { reportFailure: false });
  const deleteCanvas = useAtomCommand(workspaceCanvasDelete, { reportFailure: false });

  const canvasPathname = `/canvas/${encodeURIComponent(environmentId)}/${encodeURIComponent(canvas.id)}`;
  const rawCanvasPathname = `/canvas/${environmentId}/${canvas.id}`;
  const isActive = location.pathname === canvasPathname || location.pathname === rawCanvasPathname;

  const boardKey = `${environmentId}:${workspaceCanvasThreadId(canvas.id)}`;
  const boardMounted = useCanvasAnchorsStore((state) => state.activeBoard?.boardKey === boardKey);

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(canvas.title);

  const openCanvas = () => {
    onNavigate?.();
    void navigate({
      to: "/canvas/$environmentId/$canvasId",
      params: { environmentId, canvasId: canvas.id },
    });
  };

  const commitRename = async () => {
    setRenaming(false);
    const trimmed = titleDraft.trim().slice(0, WORKSPACE_CANVAS_TITLE_MAX_CHARS);
    if (trimmed.length === 0 || trimmed === canvas.title) return;
    const result = await renameCanvas({
      environmentId,
      input: { canvasId: canvas.id, title: trimmed },
    });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not rename canvas"),
        description: thrownErrorMessage(error, m) ?? gt("An error occurred."),
      });
    }
  };

  const confirmAndDelete = async (canvasId: WorkspaceCanvasId) => {
    const api = readLocalApi();
    if (api) {
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(
          [
            gt('Delete canvas "{title}"?', { title: canvas.title }),
            gt("The spatial board will be removed, but all pinned chat threads are kept."),
          ].join("\n"),
          { variant: "destructive" },
        ),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;
    }
    const result = await deleteCanvas({ environmentId, input: { canvasId } });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not delete canvas"),
        description: thrownErrorMessage(error, m) ?? gt("An error occurred."),
      });
      return;
    }
    forgetDeletedBoard(boardKey);
    if (isActive) {
      void navigate({ to: "/" });
    }
  };

  // Right-click and the row's "…" button open the same menu, so touch can rename and delete too.
  const openRowMenu = async (position: { readonly x: number; readonly y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const clicked = await settlePromise(() =>
      api.contextMenu.show(
        [
          { id: "rename", label: gt("Rename canvas") },
          { id: "delete", label: gt("Delete canvas"), destructive: true },
        ],
        position,
      ),
    );
    if (clicked._tag === "Failure") return;
    if (clicked.value === "rename") {
      setTitleDraft(canvas.title);
      setRenaming(true);
    } else if (clicked.value === "delete") {
      await confirmAndDelete(canvas.id);
    }
  };

  const handleContextMenu = (event: MouseEvent<HTMLButtonElement>) => {
    if (!canOperate || !readLocalApi()) return;
    event.preventDefault();
    event.stopPropagation();
    void openRowMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <li className="group/canvas-row flex flex-col" data-sidebar-canvas-row={canvas.id}>
      {renaming ? (
        <div className="px-2 py-0.5">
          <input
            type="text"
            autoFocus
            value={titleDraft}
            maxLength={WORKSPACE_CANVAS_TITLE_MAX_CHARS}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
              }
            }}
            aria-label={gt("Rename canvas")}
            className="h-6 w-full rounded-sm border border-sidebar-border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-inset focus:ring-ring"
          />
        </div>
      ) : (
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={openCanvas}
            onContextMenu={handleContextMenu}
            className={cn(
              "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
              canOperate && "pr-7",
              isActive
                ? "bg-sidebar-row-active font-medium text-sidebar-foreground"
                : "text-sidebar-foreground/85 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
            )}
          >
            <LayoutDashboardIcon className="size-3.5 shrink-0 text-sidebar-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{canvas.title}</span>
            {projectName ? (
              <span className="max-w-20 shrink-0 truncate text-2xs text-sidebar-muted-foreground">
                {projectName}
              </span>
            ) : null}
          </button>
          {canOperate ? (
            <button
              type="button"
              aria-label={gt("Canvas actions")}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                void openRowMenu({ x: rect.left, y: rect.bottom });
              }}
              className="absolute right-1 inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-sidebar-muted-foreground opacity-0 transition-opacity hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:opacity-100 group-hover/canvas-row:opacity-100 pointer-coarse:opacity-100"
              data-sidebar-canvas-actions={canvas.id}
            >
              <EllipsisIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      )}

      {isActive && boardMounted ? (
        <ActiveCanvasWaypoints boardKey={boardKey} onNavigate={onNavigate} />
      ) : null}
    </li>
  );
}

function ActiveCanvasWaypoints(props: {
  readonly boardKey: string;
  readonly onNavigate?: (() => void) | undefined;
}) {
  const { boardKey, onNavigate } = props;
  const gt = useGT();
  const board = useCanvasAnchorsStore((state) =>
    state.activeBoard?.boardKey === boardKey ? state.activeBoard : null,
  );
  const focusedChat = useCanvasAnchorsStore((state) =>
    focusedChatOf(
      state.activeBoard?.boardKey === boardKey ? state.activeBoard.chats : [],
      state.focusedChat[boardKey],
    ),
  );
  const createChatPin = useCanvasAnchorsStore((state) => state.chatPinCreators[boardKey] ?? null);
  if (board === null) return null;

  return (
    <div
      className="mt-0.5 ml-3.5 flex flex-col gap-1 border-l border-sidebar-border/80 pl-2.5 pb-1"
      data-sidebar-canvas-waypoints={board.boardId}
    >
      <div className="flex items-center justify-between pt-0.5 pr-1">
        <span className="text-3xs font-medium tracking-wide text-sidebar-muted-foreground uppercase">
          <T>Pinned Chats</T>
        </span>
        {createChatPin ? (
          <button
            type="button"
            aria-label={gt("Add peer chat pin")}
            onClick={createChatPin}
            className="inline-flex size-4 cursor-pointer items-center justify-center rounded-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
          >
            <PlusIcon className="size-3" />
          </button>
        ) : null}
      </div>

      {board.chats.length === 0 ? (
        <p className="px-1 text-2xs text-sidebar-muted-foreground/80">
          <T>No chats pinned yet</T>
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5" role="list">
          {board.chats.map((chat) => (
            <PinnedChatWaypointRow
              key={chat.elementId}
              environmentId={board.environmentId}
              chat={chat}
              focused={focusedChat === chat.threadId}
              onJump={() => {
                onNavigate?.();
                board.actions.jumpToElement(chat.elementId);
                useCanvasAnchorsStore.getState().focusChat(boardKey, chat.threadId);
              }}
            />
          ))}
        </ul>
      )}

      <div className="mt-1 flex items-center justify-between pr-1">
        <span className="text-3xs font-medium tracking-wide text-sidebar-muted-foreground uppercase">
          <T>Frames</T>
        </span>
        <button
          type="button"
          aria-label={gt("Add spatial frame")}
          onClick={() => {
            onNavigate?.();
            board.actions.addFrame();
          }}
          className="inline-flex size-4 cursor-pointer items-center justify-center rounded-sm text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
        >
          <PlusIcon className="size-3" />
        </button>
      </div>

      {board.frames.length === 0 ? (
        <p className="px-1 text-2xs text-sidebar-muted-foreground/80">
          <T>No frames yet</T>
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5" role="list">
          {board.frames.map((frame) => (
            <li key={frame.elementId}>
              <button
                type="button"
                onClick={() => {
                  onNavigate?.();
                  board.actions.jumpToElement(frame.elementId, { fit: true });
                }}
                className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                data-sidebar-frame-waypoint={frame.elementId}
              >
                <FrameIcon className="size-3 shrink-0 text-sidebar-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{frame.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PinnedChatWaypointRow(props: {
  readonly environmentId: EnvironmentId;
  readonly chat: CanvasChatAnchor;
  readonly focused: boolean;
  readonly onJump: () => void;
}) {
  const { environmentId, chat, focused, onJump } = props;
  const shell = useQuietThreadShell(scopeThreadRef(environmentId, chat.threadId));
  const activity = shell ? chatActivityOf(shell) : { state: "idle" as const };
  const color = chatColorOf(chat.threadId);
  const label = shell?.title ?? chat.title;

  return (
    <li>
      <button
        type="button"
        onClick={onJump}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs transition-colors",
          focused
            ? "bg-sidebar-row-hover font-medium text-sidebar-foreground"
            : "text-sidebar-foreground/85 hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        )}
        data-sidebar-chat-waypoint={chat.threadId}
        data-focused={focused ? "true" : undefined}
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full border-2"
          style={{
            borderColor: color,
            background: activity.state === "waiting" ? "transparent" : color,
          }}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {activity.state !== "idle" ? (
          <span className="shrink-0 text-3xs text-sidebar-muted-foreground">
            {chatActivityLabel(activity)}
          </span>
        ) : null}
      </button>
    </li>
  );
}
