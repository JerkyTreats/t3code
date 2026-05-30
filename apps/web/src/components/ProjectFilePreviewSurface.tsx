import { useQuery } from "@tanstack/react-query";
import type { EnvironmentId } from "@t3tools/contracts";

import { projectReadFileQueryOptions } from "~/lib/projectReactQuery";
import { DiffPanelLoadingState } from "./DiffPanelShell";
import { FilePreviewHeaderContent, FilePreviewSurface } from "./FilePreviewSurface";

export function ProjectFilePreviewSurface(props: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  filePath: string | null;
  wordWrap: boolean;
  onOpenFileInEditor: (relativePath: string) => void;
  showHeader?: boolean;
}) {
  const fileQuery = useQuery(
    projectReadFileQueryOptions({
      environmentId: props.environmentId,
      cwd: props.cwd,
      relativePath: props.filePath,
      enabled: props.environmentId !== null && props.cwd !== null && props.filePath !== null,
    }),
  );

  if (fileQuery.isLoading) {
    return <DiffPanelLoadingState label="Loading workspace file preview..." />;
  }

  if (fileQuery.error) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
        {fileQuery.error instanceof Error ? fileQuery.error.message : "Failed to load preview."}
      </div>
    );
  }

  if (!fileQuery.data) {
    return null;
  }

  return (
    <FilePreviewSurface
      file={fileQuery.data}
      workspaceCwd={props.cwd ?? undefined}
      wordWrap={props.wordWrap}
      onOpenFileInEditor={props.onOpenFileInEditor}
      {...(props.showHeader !== undefined ? { showHeader: props.showHeader } : {})}
    />
  );
}

export function ProjectFilePreviewHeader(props: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  filePath: string | null;
  onOpenFileInEditor: (relativePath: string) => void;
}) {
  const fileQuery = useQuery(
    projectReadFileQueryOptions({
      environmentId: props.environmentId,
      cwd: props.cwd,
      relativePath: props.filePath,
      enabled: props.environmentId !== null && props.cwd !== null && props.filePath !== null,
    }),
  );

  if (!fileQuery.data) {
    return <span className="text-xs text-muted-foreground">Loading preview...</span>;
  }

  return (
    <FilePreviewHeaderContent file={fileQuery.data} onOpenFileInEditor={props.onOpenFileInEditor} />
  );
}
