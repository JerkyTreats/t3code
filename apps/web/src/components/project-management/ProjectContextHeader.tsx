import type {
  EditorId,
  EnvironmentId,
  ProjectScript,
  ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { CircleDot, GitBranch, MessageSquare, SquarePen } from "lucide-react";
import type { ReactNode } from "react";

import type {
  NewProjectScriptInput,
  ProjectScriptActionResult,
} from "~/components/ProjectScriptsControl";
import ProjectScriptsControl from "~/components/ProjectScriptsControl";
import { OpenInPicker } from "~/components/chat/OpenInPicker";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

interface ProjectContextHeaderProps {
  projectName: string;
  workspaceRoot: string;
  environmentLabel: string;
  environmentId: EnvironmentId;
  branch: string | null;
  changedFileCount: number;
  availableEditors: ReadonlyArray<EditorId>;
  keybindings: ResolvedKeybindingsConfig;
  scripts: ReadonlyArray<ProjectScript>;
  preferredScriptId: string | null;
  latestThreadAvailable: boolean;
  onNewThread: () => void;
  onOpenLatestThread: () => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}

function HeaderAction(props: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            disabled={props.disabled}
            aria-label={props.label}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="bottom">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

export function ProjectContextHeader(props: ProjectContextHeaderProps) {
  return (
    <div className="grid gap-2 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{props.projectName}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {props.workspaceRoot}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <HeaderAction label="New thread" onClick={props.onNewThread}>
            <SquarePen className="size-4" />
          </HeaderAction>
          <HeaderAction
            label="Open latest thread"
            disabled={!props.latestThreadAvailable}
            onClick={props.onOpenLatestThread}
          >
            <MessageSquare className="size-4" />
          </HeaderAction>
          <OpenInPicker
            environmentId={props.environmentId}
            keybindings={props.keybindings}
            availableEditors={props.availableEditors}
            openInCwd={props.workspaceRoot}
            enableShortcut={false}
          />
          <ProjectScriptsControl
            scripts={props.scripts}
            keybindings={props.keybindings}
            preferredScriptId={props.preferredScriptId}
            onRunScript={props.onRunProjectScript}
            onAddScript={props.onAddProjectScript}
            onUpdateScript={props.onUpdateProjectScript}
            onDeleteScript={props.onDeleteProjectScript}
          />
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3 overflow-hidden text-[11px] text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <CircleDot className="size-3 shrink-0" />
          <span className="truncate">{props.environmentLabel}</span>
        </span>
        <span className="inline-flex min-w-0 items-center gap-1">
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate">{props.branch ?? "No branch"}</span>
        </span>
        {props.changedFileCount > 0 ? (
          <span className="shrink-0 tabular-nums">{props.changedFileCount} changed</span>
        ) : (
          <span className="shrink-0">Clean</span>
        )}
      </div>
    </div>
  );
}
