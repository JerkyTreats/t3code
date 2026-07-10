import type { EnvironmentId, ScopedThreadRef, VcsStatusResult } from "@t3tools/contracts";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckCircle2Icon,
  FileDiffIcon,
  FolderGit2Icon,
  GitBranchIcon,
} from "lucide-react";

import GitActionsControl from "~/components/GitActionsControl";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type { DraftId } from "~/composerDraftStore";
import { getSourceControlPresentation } from "~/sourceControlPresentation";

interface GitPanelSurfaceProps {
  environmentId: EnvironmentId;
  gitCwd: string;
  activeThreadRef: ScopedThreadRef | null;
  draftId?: DraftId;
  status: VcsStatusResult | null;
  statusPending: boolean;
  statusError: string | null;
  onOpenDiff: () => void;
}

export function GitPanelSurface(props: GitPanelSurfaceProps) {
  const files = props.status?.workingTree.files ?? [];
  const provider = getSourceControlPresentation(props.status?.sourceControlProvider);
  const ProviderIcon = provider.Icon;
  const syncSummary = props.status?.hasUpstream
    ? `${props.status.aheadCount} ahead, ${props.status.behindCount} behind`
    : "No upstream branch";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderGit2Icon className="size-4" />
            <span>Git</span>
            {props.status?.sourceControlProvider ? (
              <Badge variant="outline" className="gap-1 bg-muted/40 font-normal">
                <ProviderIcon className="size-3" />
                {provider.providerName}
              </Badge>
            ) : null}
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {props.statusError ?? (props.statusPending ? "Refreshing" : props.gitCwd)}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <section className="border-b border-border p-4">
          <GitActionsControl
            environmentId={props.environmentId}
            gitCwd={props.gitCwd}
            activeThreadRef={props.activeThreadRef}
            variant="panel"
            {...(props.draftId ? { draftId: props.draftId } : {})}
          />
        </section>

        {props.status?.isRepo === false ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">Not a Git repository</div>
        ) : (
          <>
            <section className="border-b border-border px-4 py-3">
              <h2 className="text-xs font-semibold text-foreground">Workspace</h2>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <GitBranchIcon className="size-3.5" />
                  Branch
                </dt>
                <dd className="truncate text-right font-mono text-foreground">
                  {props.status?.refName ?? "Detached HEAD"}
                </dd>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2Icon className="size-3.5" />
                  Working tree
                </dt>
                <dd className="text-right text-foreground">
                  {files.length > 0
                    ? `${files.length} changed file${files.length === 1 ? "" : "s"}`
                    : "Clean"}
                </dd>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowUpIcon className="size-3.5" />
                  Ahead
                </dt>
                <dd className="text-right tabular-nums text-foreground">
                  {props.status?.aheadCount ?? 0}
                </dd>
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <ArrowDownIcon className="size-3.5" />
                  Behind
                </dt>
                <dd className="text-right tabular-nums text-foreground">
                  {props.status?.behindCount ?? 0}
                </dd>
              </dl>
              <p className="mt-3 text-[11px] text-muted-foreground">{syncSummary}</p>
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                <div>
                  <h2 className="text-xs font-semibold text-foreground">Changed files</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {props.statusPending ? "Refreshing" : `${files.length} total`}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!props.status?.isRepo}
                  onClick={props.onOpenDiff}
                >
                  <FileDiffIcon className="size-4" />
                  Diff
                </Button>
              </div>

              {files.length > 0 ? (
                <div className="divide-y divide-border">
                  {files.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-accent/55"
                      onClick={props.onOpenDiff}
                    >
                      <span className="truncate font-mono text-xs text-foreground/90">
                        {file.path}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        <span className="text-emerald-600">+{file.insertions}</span>{" "}
                        <span className="text-red-500">-{file.deletions}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-28 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                  {props.statusPending ? "Loading repository status" : "No changed files"}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
