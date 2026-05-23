import type { ProjectId, ThreadId } from "@t3tools/contracts";

import { findLatestProposedPlan } from "./session-logic";
import type { Project, Thread } from "./types";

export type CommandPaletteCommandId =
  | "project.addLocal"
  | "project.cloneRemote"
  | "project.pickFolder"
  | "thread.new"
  | "thread.newLocal"
  | `thread.switch.${string}`
  | `project.open.${string}`
  | "panel.files"
  | "panel.git"
  | "panel.plan"
  | "settings.open"
  | "settings.keybindings";

export type CommandPaletteCommandKind =
  | "addLocalProject"
  | "cloneRemoteProject"
  | "pickFolder"
  | "newThread"
  | "newLocalThread"
  | "switchThread"
  | "openProject"
  | "openFilesPanel"
  | "openGitPanel"
  | "openPlan"
  | "openSettings"
  | "openKeybindings";

export interface CommandPaletteCommand {
  id: CommandPaletteCommandId;
  kind: CommandPaletteCommandKind;
  label: string;
  meta?: string | undefined;
  group: CommandPaletteGroupId;
  disabledReason?: string | undefined;
  projectId?: ProjectId | undefined;
  threadId?: ThreadId | undefined;
  planThreadId?: ThreadId | undefined;
  planId?: string | undefined;
  order: number;
}

export type CommandPaletteGroupId = "workspace" | "threads" | "projects" | "panels" | "settings";

export interface CommandPaletteCommandGroup {
  id: CommandPaletteGroupId;
  label: string;
  commands: CommandPaletteCommand[];
}

export interface CommandPaletteSnapshot {
  projects: readonly Project[];
  threads: readonly Thread[];
  projectOrder: readonly ProjectId[];
  activeThreadId: ThreadId | null;
  activeProjectId: ProjectId | null;
  keybindingsConfigPath: string | null;
  folderPickerAvailable: boolean;
}

const THREAD_COMMAND_LIMIT = 50;
const GROUP_LABELS: Record<CommandPaletteGroupId, string> = {
  workspace: "Workspace",
  threads: "Threads",
  projects: "Projects",
  panels: "Panels",
  settings: "Settings",
};
const GROUP_ORDER: readonly CommandPaletteGroupId[] = [
  "workspace",
  "threads",
  "projects",
  "panels",
  "settings",
];

function compact(parts: Array<string | null | undefined>): string | undefined {
  const value = parts.filter((part): part is string => Boolean(part)).join(" · ");
  return value.length > 0 ? value : undefined;
}

function compareNullableIsoDescending(left?: string | null, right?: string | null): number {
  const leftMs = left ? Date.parse(left) : 0;
  const rightMs = right ? Date.parse(right) : 0;
  return rightMs - leftMs;
}

function sortThreads(threads: readonly Thread[]): Thread[] {
  return [...threads]
    .filter((thread) => thread.archivedAt == null)
    .sort((left, right) => {
      const latestUserMessageDiff = compareNullableIsoDescending(
        latestUserMessageAt(left),
        latestUserMessageAt(right),
      );
      if (latestUserMessageDiff !== 0) return latestUserMessageDiff;

      const updatedDiff = compareNullableIsoDescending(left.updatedAt, right.updatedAt);
      if (updatedDiff !== 0) return updatedDiff;

      return compareNullableIsoDescending(left.createdAt, right.createdAt);
    })
    .slice(0, THREAD_COMMAND_LIMIT);
}

function latestUserMessageAt(thread: Thread): string | null {
  let latest: string | null = null;
  for (const message of thread.messages) {
    if (message.role !== "user") continue;
    if (!latest || message.createdAt > latest) {
      latest = message.createdAt;
    }
  }
  return latest;
}

function sortProjects(projects: readonly Project[], projectOrder: readonly ProjectId[]): Project[] {
  const orderById = new Map(projectOrder.map((projectId, index) => [projectId, index] as const));
  return [...projects].sort((left, right) => {
    const leftOrder = orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return projects.indexOf(left) - projects.indexOf(right);
  });
}

function createCommand(
  command: Omit<CommandPaletteCommand, "order">,
  order: number,
): CommandPaletteCommand {
  return { ...command, order };
}

export function deriveCommandPaletteGroups(
  snapshot: CommandPaletteSnapshot,
): CommandPaletteCommandGroup[] {
  const projectById = new Map(snapshot.projects.map((project) => [project.id, project] as const));
  const activeThread =
    snapshot.activeThreadId === null
      ? null
      : (snapshot.threads.find((thread) => thread.id === snapshot.activeThreadId) ?? null);
  const activeProjectId = activeThread?.projectId ?? snapshot.activeProjectId;
  const activeProject = activeProjectId ? (projectById.get(activeProjectId) ?? null) : null;
  const activeProposedPlan = activeThread
    ? findLatestProposedPlan(activeThread.proposedPlans, activeThread.latestTurn?.turnId ?? null)
    : null;
  const sourceProposedPlan = activeThread?.latestTurn?.sourceProposedPlan;
  const planThreadId =
    sourceProposedPlan && sourceProposedPlan.planId === activeProposedPlan?.id
      ? sourceProposedPlan.threadId
      : activeThread?.id;
  let order = 0;

  const groups: CommandPaletteCommandGroup[] = [
    {
      id: "workspace",
      label: GROUP_LABELS.workspace,
      commands: [
        createCommand(
          {
            id: "project.addLocal",
            kind: "addLocalProject",
            label: "Add local project",
            group: "workspace",
          },
          order++,
        ),
        createCommand(
          {
            id: "project.cloneRemote",
            kind: "cloneRemoteProject",
            label: "Clone remote project",
            group: "workspace",
          },
          order++,
        ),
        createCommand(
          {
            id: "project.pickFolder",
            kind: "pickFolder",
            label: "Browse for folder",
            group: "workspace",
            disabledReason: snapshot.folderPickerAvailable
              ? undefined
              : "Folder picker is only available in the desktop app",
          },
          order++,
        ),
      ],
    },
    {
      id: "threads",
      label: GROUP_LABELS.threads,
      commands: [
        createCommand(
          {
            id: "thread.new",
            kind: "newThread",
            label: "New thread",
            group: "threads",
            projectId: activeProjectId ?? snapshot.projects[0]?.id,
            meta: activeProject?.name,
            disabledReason:
              (activeProjectId ?? snapshot.projects[0]?.id)
                ? undefined
                : "Add a project before creating a thread",
          },
          order++,
        ),
        createCommand(
          {
            id: "thread.newLocal",
            kind: "newLocalThread",
            label: "New local thread",
            group: "threads",
            projectId: activeProjectId ?? snapshot.projects[0]?.id,
            meta: activeProject?.name,
            disabledReason:
              (activeProjectId ?? snapshot.projects[0]?.id)
                ? undefined
                : "Add a project before creating a thread",
          },
          order++,
        ),
        ...sortThreads(snapshot.threads).map((thread) => {
          const project = projectById.get(thread.projectId);
          return createCommand(
            {
              id: `thread.switch.${thread.id}`,
              kind: "switchThread",
              label: thread.title || "Untitled thread",
              group: "threads",
              threadId: thread.id,
              projectId: thread.projectId,
              meta: compact([project?.name, thread.branch]),
            },
            order++,
          );
        }),
      ],
    },
    {
      id: "projects",
      label: GROUP_LABELS.projects,
      commands: sortProjects(snapshot.projects, snapshot.projectOrder).map((project) =>
        createCommand(
          {
            id: `project.open.${project.id}`,
            kind: "openProject",
            label: project.name,
            group: "projects",
            projectId: project.id,
            meta: project.cwd,
          },
          order++,
        ),
      ),
    },
    {
      id: "panels",
      label: GROUP_LABELS.panels,
      commands: [
        createCommand(
          {
            id: "panel.files",
            kind: "openFilesPanel",
            label: "Open files panel",
            group: "panels",
            threadId: activeThread?.id,
            disabledReason: activeThread ? undefined : "Open a thread before using the files panel",
          },
          order++,
        ),
        createCommand(
          {
            id: "panel.git",
            kind: "openGitPanel",
            label: "Open Git panel",
            group: "panels",
            threadId: activeThread?.id,
            disabledReason: activeThread ? undefined : "Open a thread before using the Git panel",
          },
          order++,
        ),
        createCommand(
          {
            id: "panel.plan",
            kind: "openPlan",
            label: "Open latest plan",
            group: "panels",
            threadId: activeThread?.id,
            planThreadId,
            planId: activeProposedPlan?.id,
            disabledReason:
              activeThread && activeProposedPlan && planThreadId
                ? undefined
                : "No plan is available for the active thread",
          },
          order++,
        ),
      ],
    },
    {
      id: "settings",
      label: GROUP_LABELS.settings,
      commands: [
        createCommand(
          {
            id: "settings.open",
            kind: "openSettings",
            label: "Open settings",
            group: "settings",
          },
          order++,
        ),
        createCommand(
          {
            id: "settings.keybindings",
            kind: "openKeybindings",
            label: "Open keybindings file",
            group: "settings",
            meta: snapshot.keybindingsConfigPath ?? undefined,
            disabledReason: snapshot.keybindingsConfigPath
              ? undefined
              : "Keybindings path is not ready",
          },
          order++,
        ),
      ],
    },
  ];

  return groups;
}

export function normalizeCommandPaletteQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function commandText(command: CommandPaletteCommand): string {
  return [command.label, command.meta, GROUP_LABELS[command.group]].filter(Boolean).join(" ");
}

function rankCommand(command: CommandPaletteCommand, query: string): number {
  const label = command.label.toLowerCase();
  const meta = command.meta?.toLowerCase() ?? "";
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  if (label.includes(query)) return 2;
  if (meta.includes(query)) return 3;
  return 4;
}

export function filterCommandPaletteGroups(
  groups: readonly CommandPaletteCommandGroup[],
  query: string,
): CommandPaletteCommandGroup[] {
  const tokens = normalizeCommandPaletteQuery(query);
  if (tokens.length === 0) {
    return groups.map((group) => ({ ...group, commands: [...group.commands] }));
  }

  const queryValue = tokens.join(" ");
  const groupIndex = new Map(GROUP_ORDER.map((group, index) => [group, index] as const));

  return groups
    .map((group) => {
      const commands = group.commands
        .filter((command) => {
          const text = commandText(command).toLowerCase();
          return tokens.every((token) => text.includes(token));
        })
        .toSorted((left, right) => {
          const rankDiff = rankCommand(left, queryValue) - rankCommand(right, queryValue);
          if (rankDiff !== 0) return rankDiff;
          const groupDiff = (groupIndex.get(left.group) ?? 0) - (groupIndex.get(right.group) ?? 0);
          if (groupDiff !== 0) return groupDiff;
          return left.order - right.order;
        });

      return { ...group, commands };
    })
    .filter((group) => group.commands.length > 0);
}
