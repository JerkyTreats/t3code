import type { EnvironmentId } from "@t3tools/contracts";
import { ArrowLeftIcon } from "lucide-react";
import { Suspense, lazy, useCallback, type CSSProperties } from "react";

import { openInPreferredEditor } from "~/editorPreferences";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import { readLocalApi } from "~/localApi";
import { resolvePathLinkTarget } from "~/terminal-links";
import { DocumentShell } from "../DocumentShell";
import { DiffPanelLoadingState, PanelTab } from "../DiffPanelShell";
import { ProjectFilePreviewHeader, ProjectFilePreviewSurface } from "../ProjectFilePreviewSurface";
import { RightPanelSheet } from "../RightPanelSheet";
import { Button } from "../ui/button";
import { Sidebar, SidebarProvider, SidebarRail } from "../ui/sidebar";

const FILES_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1280px)";
const FILES_PANEL_INLINE_DEFAULT_WIDTH = "clamp(22rem,32vw,30rem)";
const FILES_PANEL_INLINE_SIDEBAR_MIN_WIDTH = 20 * 16;
const FILES_PANEL_SIDEBAR_WIDTH_STORAGE_KEY = "chat_files_panel_sidebar_width";

const ProjectExplorerPanel = lazy(() =>
  import("./ProjectExplorerPanel").then((module) => ({
    default: module.ProjectExplorerPanel,
  })),
);

function FilesPanelContent(props: {
  environmentId: EnvironmentId;
  cwd: string | null;
  threadKey: string | null;
  docPath: string | null;
  selectedPath: string | null;
  revealPath: string | null;
  revealKey: number;
  expandedDocument: boolean;
  onSelectFile: (pathValue: string) => void;
  onClearDocument: () => void;
  onExpandDocument: () => void;
}) {
  const openProjectFileInEditor = useCallback(
    (relativePath: string) => {
      const api = readLocalApi();
      if (!api || !props.cwd) {
        return;
      }
      const targetPath = resolvePathLinkTarget(relativePath, props.cwd);
      void openInPreferredEditor(api, targetPath).catch((error) => {
        console.warn("Failed to open project file in editor.", error);
      });
    },
    [props.cwd],
  );

  if (props.docPath && !props.expandedDocument) {
    return (
      <div className="h-full min-h-0">
        <DocumentShell
          panelTab={
            <PanelTab
              onClick={props.onExpandDocument}
              ariaLabel="Show preview in conversation view"
              title="Show in conversation view"
              placement="outside-left"
            />
          }
          header={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={props.onClearDocument}
                aria-label="Back to file tree"
                title="Back to file tree"
                className="shrink-0 text-muted-foreground/70 hover:text-foreground"
              >
                <ArrowLeftIcon className="size-3.5" />
              </Button>
              <ProjectFilePreviewHeader
                environmentId={props.environmentId}
                cwd={props.cwd}
                filePath={props.docPath}
                onOpenFileInEditor={openProjectFileInEditor}
              />
            </>
          }
        >
          <ProjectFilePreviewSurface
            environmentId={props.environmentId}
            cwd={props.cwd}
            filePath={props.docPath}
            wordWrap={false}
            showHeader={false}
            onOpenFileInEditor={openProjectFileInEditor}
          />
        </DocumentShell>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <DocumentShell
        header={
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/70">
              Project files
            </p>
          </div>
        }
      >
        <Suspense fallback={<DiffPanelLoadingState label="Loading files panel..." />}>
          <ProjectExplorerPanel
            environmentId={props.environmentId}
            cwd={props.cwd}
            threadKey={props.threadKey}
            selectedPath={props.selectedPath}
            revealPath={props.revealPath}
            revealKey={props.revealKey}
            onSelectFile={props.onSelectFile}
          />
        </Suspense>
      </DocumentShell>
    </div>
  );
}

interface FilesPanelRouteAdapterProps {
  environmentId: EnvironmentId;
  cwd: string | null;
  threadKey: string | null;
  open: boolean;
  onCloseFiles: () => void;
  onOpenFiles: () => void;
  renderContent: boolean;
  docPath: string | null;
  selectedPath: string | null;
  revealPath: string | null;
  revealKey: number;
  expandedDocument: boolean;
  onSelectFile: (pathValue: string) => void;
  onClearDocument: () => void;
  onExpandDocument: () => void;
}

export function FilesPanelRouteAdapter(props: FilesPanelRouteAdapterProps) {
  const shouldUseSheet = useMediaQuery(FILES_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        props.onOpenFiles();
        return;
      }
      props.onCloseFiles();
    },
    [props],
  );

  const panelContent = props.renderContent ? (
    <FilesPanelContent
      environmentId={props.environmentId}
      cwd={props.cwd}
      threadKey={props.threadKey}
      docPath={shouldUseSheet && props.expandedDocument ? null : props.docPath}
      selectedPath={props.selectedPath}
      revealPath={props.revealPath}
      revealKey={props.revealKey}
      expandedDocument={props.expandedDocument}
      onSelectFile={props.onSelectFile}
      onClearDocument={props.onClearDocument}
      onExpandDocument={props.onExpandDocument}
    />
  ) : null;

  if (shouldUseSheet) {
    return (
      <RightPanelSheet open={props.open} onClose={props.onCloseFiles}>
        {panelContent}
      </RightPanelSheet>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      open={props.open}
      onOpenChange={onOpenChange}
      className="w-auto min-h-0 flex-none bg-transparent"
      style={{ "--sidebar-width": FILES_PANEL_INLINE_DEFAULT_WIDTH } as CSSProperties}
    >
      <Sidebar
        side="right"
        collapsible="offcanvas"
        className="border-l border-border bg-background text-foreground"
        resizable={{
          minWidth: FILES_PANEL_INLINE_SIDEBAR_MIN_WIDTH,
          storageKey: FILES_PANEL_SIDEBAR_WIDTH_STORAGE_KEY,
        }}
      >
        {panelContent}
        <SidebarRail />
      </Sidebar>
    </SidebarProvider>
  );
}
