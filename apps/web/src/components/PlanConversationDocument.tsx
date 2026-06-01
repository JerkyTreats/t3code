import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { CopyIcon, EllipsisIcon, FileWarningIcon, PanelLeftIcon, XIcon } from "lucide-react";
import { useState } from "react";

import {
  buildProposedPlanMarkdownFilename,
  downloadPlanAsTextFile,
  normalizePlanMarkdownForExport,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from "../proposedPlan";
import type { LatestProposedPlanState } from "../session-logic";
import { readEnvironmentApi } from "../environmentApi";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { DocumentMarkdownRenderer } from "./DocumentMarkdownRenderer";
import { DocumentShell } from "./DocumentShell";

function ReturnToChatTab(props: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="absolute left-3 top-2 z-10"
      onClick={props.onClick}
      aria-label="Return to chat"
      title="Return to chat"
    >
      <PanelLeftIcon className="size-4" />
    </Button>
  );
}

function MissingPlanPreview(props: { onCollapse: () => void }) {
  return (
    <DocumentShell
      panelTab={<ReturnToChatTab onClick={props.onCollapse} />}
      header={
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">Plan</Badge>
          <p className="truncate text-sm font-medium text-foreground">Plan preview unavailable</p>
        </div>
      }
    >
      <div className="flex h-full min-h-0 items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-lg border border-border/70 bg-card/55 p-6">
          <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-border/70 bg-background/70 text-muted-foreground">
            <FileWarningIcon className="size-5" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">Plan not found</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This plan is no longer available in the current thread snapshot.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={props.onCollapse}
          >
            <PanelLeftIcon className="size-4" />
            Return to chat
          </Button>
        </div>
      </div>
    </DocumentShell>
  );
}

export function PlanConversationDocument(props: {
  environmentId: EnvironmentId;
  proposedPlan: LatestProposedPlanState | null;
  planThreadId: ThreadId;
  workspaceCwd: string | undefined;
  onCollapse: () => void;
}) {
  const [isSavingToWorkspace, setIsSavingToWorkspace] = useState(false);
  const proposedPlan = props.proposedPlan;

  if (!proposedPlan) {
    return <MissingPlanPreview onCollapse={props.onCollapse} />;
  }

  const title = proposedPlanTitle(proposedPlan.planMarkdown) ?? "Proposed plan";
  const filename = buildProposedPlanMarkdownFilename(proposedPlan.planMarkdown);
  const exportContents = normalizePlanMarkdownForExport(proposedPlan.planMarkdown);
  const displayedMarkdown = stripDisplayedPlanMarkdown(proposedPlan.planMarkdown);

  const handleCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    void navigator.clipboard.writeText(exportContents).then(() => {
      toastManager.add({ type: "success", title: "Plan copied" });
    });
  };

  const handleDownload = () => {
    downloadPlanAsTextFile(filename, exportContents);
  };

  const handleSaveToWorkspace = () => {
    const api = readEnvironmentApi(props.environmentId);
    if (!api || !props.workspaceCwd) {
      return;
    }
    setIsSavingToWorkspace(true);
    void api.projects
      .writeFile({
        cwd: props.workspaceCwd,
        relativePath: filename,
        contents: exportContents,
      })
      .then((result) => {
        toastManager.add({
          type: "success",
          title: "Plan saved",
          description: result.relativePath,
        });
      })
      .catch((error) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not save plan",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      })
      .then(
        () => setIsSavingToWorkspace(false),
        () => setIsSavingToWorkspace(false),
      );
  };

  return (
    <DocumentShell
      panelTab={<ReturnToChatTab onClick={props.onCollapse} />}
      header={
        <>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Badge variant="secondary">Plan</Badge>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{title}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/70">
                {filename}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              onClick={handleCopy}
              aria-label="Copy plan"
              title="Copy plan"
            >
              <CopyIcon className="size-3.5" />
            </Button>
            <Menu>
              <MenuTrigger
                render={<Button aria-label="Plan actions" size="icon-xs" variant="outline" />}
              >
                <EllipsisIcon aria-hidden="true" className="size-4" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={handleDownload}>Download as markdown</MenuItem>
                <MenuItem
                  onClick={handleSaveToWorkspace}
                  disabled={!props.workspaceCwd || isSavingToWorkspace}
                >
                  Save to workspace
                </MenuItem>
              </MenuPopup>
            </Menu>
            <Button
              type="button"
              size="icon-xs"
              variant="outline"
              onClick={props.onCollapse}
              aria-label="Close preview"
              title="Close preview"
            >
              <XIcon className="size-3.5" />
            </Button>
          </div>
        </>
      }
    >
      <DocumentMarkdownRenderer
        filePath={filename}
        markdown={displayedMarkdown}
        workspaceCwd={props.workspaceCwd}
        showSourceFooter={false}
      />
    </DocumentShell>
  );
}
