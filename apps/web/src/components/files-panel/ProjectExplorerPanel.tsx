import { useQuery } from "@tanstack/react-query";
import type { EnvironmentId } from "@t3tools/contracts";
import { RefreshCcwIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { projectListDirectoryQueryOptions } from "~/lib/projectReactQuery";
import { ProjectExplorerTree } from "./ProjectExplorerTree";
import { ancestorDirectoryPaths } from "./ProjectExplorerTree.logic";

export function ProjectExplorerPanel(props: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  selectedPath: string | null;
  onSelectFile: (pathValue: string) => void;
}) {
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const rootQuery = useQuery(
    projectListDirectoryQueryOptions({
      environmentId: props.environmentId,
      cwd: props.cwd,
      directoryPath: null,
      enabled: props.environmentId !== null && props.cwd !== null,
    }),
  );

  useEffect(() => {
    if (!props.selectedPath) {
      return;
    }
    const selectedPath = props.selectedPath;
    setExpandedDirectories((current) => {
      const next = new Set(current);
      for (const pathValue of ancestorDirectoryPaths(selectedPath)) {
        next.add(pathValue);
      }
      return next;
    });
  }, [props.selectedPath]);

  if (!props.cwd || !props.environmentId) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
        Project explorer is unavailable until this thread has an active project.
      </div>
    );
  }

  if (rootQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
        Loading project explorer...
      </div>
    );
  }

  if (rootQuery.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-5 text-center">
        <p className="text-xs text-muted-foreground/70">
          {rootQuery.error instanceof Error
            ? rootQuery.error.message
            : "Failed to load project explorer."}
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-xs text-foreground transition-colors hover:bg-background"
          onClick={() => void rootQuery.refetch()}
        >
          <RefreshCcwIcon className="size-3.5" />
          Retry
        </button>
      </div>
    );
  }

  if (!rootQuery.data || rootQuery.data.entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
        No visible files in this project.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
      <ProjectExplorerTree
        environmentId={props.environmentId}
        cwd={props.cwd}
        entries={rootQuery.data.entries}
        expandedDirectories={expandedDirectories}
        selectedPath={props.selectedPath}
        onSelectFile={props.onSelectFile}
        onToggleDirectory={(pathValue) => {
          setExpandedDirectories((current) => {
            const next = new Set(current);
            if (next.has(pathValue)) {
              next.delete(pathValue);
            } else {
              next.add(pathValue);
            }
            return next;
          });
        }}
      />
    </div>
  );
}
