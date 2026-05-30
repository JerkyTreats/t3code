import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronLeftIcon } from "lucide-react";
import { useCallback } from "react";

import { openInPreferredEditor } from "~/editorPreferences";
import { readLocalApi } from "~/localApi";
import { resolvePathLinkTarget } from "~/terminal-links";
import { DocumentShell } from "../DocumentShell";
import { ProjectFilePreviewHeader, ProjectFilePreviewSurface } from "../ProjectFilePreviewSurface";

export function FilesConversationDocument(props: {
  environmentId: EnvironmentId;
  cwd: string | null;
  docPath: string;
  onCollapseDocument: () => void;
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

  return (
    <DocumentShell
      panelTab={
        <button
          type="button"
          aria-label="Return to chat"
          className="absolute left-3 top-3 z-10 inline-flex size-7 items-center justify-center rounded-md border border-border/70 bg-background/85 text-muted-foreground transition-colors hover:text-foreground"
          onClick={props.onCollapseDocument}
        >
          <ChevronLeftIcon className="size-4" />
        </button>
      }
      header={
        <ProjectFilePreviewHeader
          environmentId={props.environmentId}
          cwd={props.cwd}
          filePath={props.docPath}
          onOpenFileInEditor={openProjectFileInEditor}
        />
      }
    >
      <ProjectFilePreviewSurface
        environmentId={props.environmentId}
        cwd={props.cwd}
        filePath={props.docPath}
        wordWrap
        showHeader={false}
        onOpenFileInEditor={openProjectFileInEditor}
      />
    </DocumentShell>
  );
}
