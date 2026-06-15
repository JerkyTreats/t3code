import { useQuery } from "@tanstack/react-query";
import type { EnvironmentId, ProjectTreeEntry } from "@t3tools/contracts";
import { ChevronRightIcon, FolderClosedIcon, FolderIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useTheme } from "~/hooks/useTheme";
import { projectListDirectoryQueryOptions } from "~/lib/projectReactQuery";
import { cn } from "~/lib/utils";
import { VscodeEntryIcon } from "../chat/VscodeEntryIcon";

interface ProjectExplorerTreeProps {
  environmentId: EnvironmentId;
  cwd: string;
  entries: ReadonlyArray<ProjectTreeEntry>;
  expandedDirectories: ReadonlySet<string>;
  selectedPath: string | null;
  revealPath: string | null;
  revealKey: number;
  onSelectFile: (pathValue: string) => void;
  onToggleDirectory: (pathValue: string) => void;
}

function focusSiblingRow(target: HTMLElement, offset: number) {
  const rows = Array.from(
    target
      .closest("[data-explorer-root='true']")
      ?.querySelectorAll<HTMLElement>("[data-explorer-row='true']") ?? [],
  );
  const currentIndex = rows.findIndex((row) => row === target);
  const nextRow = rows[currentIndex + offset];
  nextRow?.focus();
}

function DirectoryNode(props: {
  environmentId: EnvironmentId;
  cwd: string;
  entry: ProjectTreeEntry;
  depth: number;
  expandedDirectories: ReadonlySet<string>;
  selectedPath: string | null;
  revealPath: string | null;
  revealKey: number;
  onSelectFile: (pathValue: string) => void;
  onToggleDirectory: (pathValue: string) => void;
}) {
  const isExpanded = props.expandedDirectories.has(props.entry.path);
  const childrenQuery = useQuery(
    projectListDirectoryQueryOptions({
      environmentId: props.environmentId,
      cwd: props.cwd,
      directoryPath: props.entry.path,
      enabled: isExpanded,
    }),
  );
  const leftPadding = 8 + props.depth * 14;

  return (
    <div>
      <button
        type="button"
        data-explorer-row="true"
        className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80"
        style={{ paddingLeft: `${leftPadding}px` }}
        onClick={() => props.onToggleDirectory(props.entry.path)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !isExpanded) {
            event.preventDefault();
            props.onToggleDirectory(props.entry.path);
            return;
          }
          if (event.key === "ArrowLeft" && isExpanded) {
            event.preventDefault();
            props.onToggleDirectory(props.entry.path);
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focusSiblingRow(event.currentTarget, 1);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            focusSiblingRow(event.currentTarget, -1);
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onToggleDirectory(props.entry.path);
          }
        }}
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
            isExpanded && "rotate-90",
          )}
        />
        {isExpanded ? (
          <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        ) : (
          <FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
        )}
        <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
          {props.entry.name}
        </span>
      </button>
      {isExpanded ? (
        <div className="space-y-0.5">
          {childrenQuery.isLoading ? (
            <div
              className="py-1 pr-2 text-[11px] text-muted-foreground/60"
              style={{ paddingLeft: `${leftPadding + 18}px` }}
            >
              Loading...
            </div>
          ) : childrenQuery.data ? (
            <ProjectExplorerTree
              environmentId={props.environmentId}
              cwd={props.cwd}
              entries={childrenQuery.data.entries}
              expandedDirectories={props.expandedDirectories}
              selectedPath={props.selectedPath}
              revealPath={props.revealPath}
              revealKey={props.revealKey}
              onSelectFile={props.onSelectFile}
              onToggleDirectory={props.onToggleDirectory}
              depth={props.depth + 1}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectExplorerTree(
  props: ProjectExplorerTreeProps & {
    depth?: number;
  },
) {
  const depth = props.depth ?? 0;
  const { resolvedTheme } = useTheme();
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const revealRowRef = useRef<HTMLButtonElement | null>(null);
  const entries = useMemo(
    () => props.entries.filter((entry) => entry.kind === "directory" || entry.kind === "file"),
    [props.entries],
  );
  const onSelectFile = useCallback(
    (pathValue: string) => {
      props.onSelectFile(pathValue);
    },
    [props],
  );

  useEffect(() => {
    const row = revealRowRef.current;
    if (!row || !props.revealPath) {
      return;
    }
    row.scrollIntoView({ block: "nearest" });
  }, [entries, props.expandedDirectories, props.revealKey, props.revealPath]);

  return (
    <div
      ref={rowsRef}
      data-explorer-root={depth === 0 ? "true" : undefined}
      className="space-y-0.5"
    >
      {entries.map((entry) => {
        const leftPadding = 8 + depth * 14;
        if (entry.kind === "directory") {
          return (
            <DirectoryNode
              key={`dir:${entry.path}`}
              environmentId={props.environmentId}
              cwd={props.cwd}
              entry={entry}
              depth={depth}
              expandedDirectories={props.expandedDirectories}
              selectedPath={props.selectedPath}
              revealPath={props.revealPath}
              revealKey={props.revealKey}
              onSelectFile={props.onSelectFile}
              onToggleDirectory={props.onToggleDirectory}
            />
          );
        }

        const isSelected = props.selectedPath === entry.path;
        return (
          <button
            key={`file:${entry.path}`}
            type="button"
            ref={props.revealPath === entry.path ? revealRowRef : undefined}
            data-explorer-row="true"
            className={cn(
              "group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80",
              isSelected && "bg-background/60 text-foreground",
            )}
            style={{ paddingLeft: `${leftPadding}px` }}
            onClick={() => onSelectFile(entry.path)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusSiblingRow(event.currentTarget, 1);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                focusSiblingRow(event.currentTarget, -1);
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectFile(entry.path);
              }
            }}
          >
            <span aria-hidden="true" className="size-3.5 shrink-0" />
            <VscodeEntryIcon
              pathValue={entry.path}
              kind="file"
              theme={resolvedTheme}
              className="size-3.5"
            />
            <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
              {entry.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
