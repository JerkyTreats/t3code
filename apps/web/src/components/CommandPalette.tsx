import { type OrchestrationProposedPlanId, ProjectId, ThreadId } from "@t3tools/contracts";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  FolderGit2Icon,
  FolderOpenIcon,
  FolderPlusIcon,
  GitBranchIcon,
  PanelRightIcon,
  ScrollTextIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  type CommandPaletteCommand,
  deriveCommandPaletteGroups,
  filterCommandPaletteGroups,
} from "../commandPalette.logic";
import { useCommandPaletteStore } from "../commandPaletteStore";
import { isElectron } from "../env";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { useSettings } from "../hooks/useSettings";
import { shortcutLabelForCommand } from "../keybindings";
import { readNativeApi } from "../nativeApi";
import { openPathInPreferredEditor } from "../openPreferredEditor";
import { useProjectCreationIntentStore } from "../projectCreationIntentStore";
import {
  useServerAvailableEditors,
  useServerKeybindings,
  useServerKeybindingsConfigPath,
} from "../rpc/serverState";
import { stripChatPanelSearchParams } from "../chatPanelRouteSearch";
import { useStore } from "../store";
import { useUiStateStore } from "../uiStateStore";
import { toastManager } from "./ui/toast";
import { cn } from "~/lib/utils";
import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from "./ui/command";

function iconForCommand(command: CommandPaletteCommand) {
  switch (command.kind) {
    case "addLocalProject":
      return <FolderPlusIcon className="size-4" />;
    case "cloneRemoteProject":
      return <FolderGit2Icon className="size-4" />;
    case "pickFolder":
      return <FolderOpenIcon className="size-4" />;
    case "newThread":
    case "newLocalThread":
    case "switchThread":
      return <SquarePenIcon className="size-4" />;
    case "openProject":
      return <FolderOpenIcon className="size-4" />;
    case "openGitPanel":
      return <GitBranchIcon className="size-4" />;
    case "openFilesPanel":
      return <PanelRightIcon className="size-4" />;
    case "openPlan":
      return <ScrollTextIcon className="size-4" />;
    case "openSettings":
    case "openKeybindings":
      return <SettingsIcon className="size-4" />;
  }
}

export function CommandPalette() {
  const navigate = useNavigate();
  const open = useCommandPaletteStore((state) => state.open);
  const query = useCommandPaletteStore((state) => state.query);
  const closePalette = useCommandPaletteStore((state) => state.closePalette);
  const setQuery = useCommandPaletteStore((state) => state.setQuery);
  const keybindings = useServerKeybindings();
  const shortcutLabel = shortcutLabelForCommand(keybindings, "commandPalette.toggle");
  const keybindingsConfigPath = useServerKeybindingsConfigPath();
  const availableEditors = useServerAvailableEditors();
  const projectOrder = useUiStateStore((state) => state.projectOrder);
  const projects = useStore((state) => state.projects);
  const threads = useStore((state) => state.threads);
  const { activeDraftThread, activeThread, defaultProjectId, handleNewThread } =
    useHandleNewThread();
  const settings = useSettings();
  const routeThreadId = useParams({
    strict: false,
    select: (params) => (params.threadId ? ThreadId.makeUnsafe(params.threadId) : null),
  });
  const routeProjectId = useParams({
    strict: false,
    select: (params) => (params.projectId ? ProjectId.makeUnsafe(params.projectId) : null),
  });
  const projectCreationActions = useProjectCreationIntentStore(
    useShallow((state) => ({
      requestAddLocalProject: state.requestAddLocalProject,
      requestCloneRemoteProject: state.requestCloneRemoteProject,
      requestPickFolder: state.requestPickFolder,
    })),
  );
  const folderPickerAvailable =
    isElectron && typeof readNativeApi()?.dialogs.pickFolder === "function";

  const groups = useMemo(
    () =>
      deriveCommandPaletteGroups({
        projects,
        threads,
        projectOrder,
        activeThreadId: routeThreadId,
        activeProjectId:
          activeThread?.projectId ?? activeDraftThread?.projectId ?? routeProjectId ?? null,
        keybindingsConfigPath,
        folderPickerAvailable,
      }),
    [
      activeDraftThread?.projectId,
      activeThread?.projectId,
      folderPickerAvailable,
      keybindingsConfigPath,
      projectOrder,
      projects,
      routeProjectId,
      routeThreadId,
      threads,
    ],
  );
  const filteredGroups = useMemo(() => filterCommandPaletteGroups(groups, query), [groups, query]);

  const runCommand = async (command: CommandPaletteCommand) => {
    if (command.disabledReason) {
      return;
    }

    closePalette();

    switch (command.kind) {
      case "addLocalProject":
        projectCreationActions.requestAddLocalProject();
        return;
      case "cloneRemoteProject":
        projectCreationActions.requestCloneRemoteProject();
        return;
      case "pickFolder":
        projectCreationActions.requestPickFolder();
        return;
      case "newThread": {
        const projectId = command.projectId ?? activeThread?.projectId ?? defaultProjectId;
        if (!projectId) return;
        await handleNewThread(projectId, {
          branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
          worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
          envMode:
            activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
        });
        return;
      }
      case "newLocalThread": {
        const projectId = command.projectId ?? activeThread?.projectId ?? defaultProjectId;
        if (!projectId) return;
        await handleNewThread(projectId, {
          envMode: settings.defaultThreadEnvMode,
        });
        return;
      }
      case "switchThread":
        if (!command.threadId) return;
        await navigate({ to: "/$threadId", params: { threadId: command.threadId } });
        return;
      case "openProject":
        if (!command.projectId) return;
        await navigate({
          to: "/projects/$projectId",
          params: { projectId: command.projectId },
          search: { view: "management" },
        });
        return;
      case "openFilesPanel":
        if (!command.threadId) return;
        await navigate({
          to: "/$threadId",
          params: { threadId: command.threadId },
          search: (previous) => ({
            ...stripChatPanelSearchParams(previous),
            panel: "files" as const,
          }),
        });
        return;
      case "openGitPanel":
        if (!command.threadId) return;
        await navigate({
          to: "/$threadId",
          params: { threadId: command.threadId },
          search: (previous) => ({
            ...stripChatPanelSearchParams(previous),
            panel: "git" as const,
          }),
        });
        return;
      case "openPlan":
        if (!command.threadId || !command.planThreadId || !command.planId) return;
        await navigate({
          to: "/$threadId",
          params: { threadId: command.threadId },
          search: (previous) => ({
            ...stripChatPanelSearchParams(previous),
            planPreview: "1" as const,
            planThreadId: command.planThreadId,
            planId: command.planId as OrchestrationProposedPlanId,
          }),
        });
        return;
      case "openSettings":
        await navigate({ to: "/settings/general" });
        return;
      case "openKeybindings":
        if (!keybindingsConfigPath) return;
        await openPathInPreferredEditor({
          path: keybindingsConfigPath,
          availableEditors: availableEditors ?? [],
          failureTitle: "Unable to open keybindings file",
        });
        return;
    }
  };

  const onSelectCommand = (command: CommandPaletteCommand) => {
    void runCommand(command).catch((error) => {
      toastManager.add({
        type: "error",
        title: "Command failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      });
    });
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closePalette();
        }
      }}
    >
      <CommandDialogPopup>
        <CommandPanel>
          <Command>
            <CommandInput
              placeholder="Search commands"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <CommandList>
              {filteredGroups.map((group) => (
                <CommandGroup key={group.id}>
                  <CommandGroupLabel>{group.label}</CommandGroupLabel>
                  {group.commands.map((command) => (
                    <CommandItem
                      key={command.id}
                      value={command.id}
                      disabled={Boolean(command.disabledReason)}
                      className={cn(
                        "gap-2",
                        command.disabledReason && "cursor-not-allowed opacity-55",
                      )}
                      onClick={() => onSelectCommand(command)}
                    >
                      <span className="text-muted-foreground">{iconForCommand(command)}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{command.label}</span>
                        <span className="truncate text-muted-foreground text-xs">
                          {command.disabledReason ?? command.meta ?? ""}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              <CommandEmpty>No matching commands</CommandEmpty>
            </CommandList>
          </Command>
        </CommandPanel>
        <CommandFooter>
          <span>Command palette</span>
          {shortcutLabel ? <CommandShortcut>{shortcutLabel}</CommandShortcut> : null}
        </CommandFooter>
      </CommandDialogPopup>
    </CommandDialog>
  );
}
