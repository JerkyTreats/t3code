import type { ReactNode } from "react";
import { BarChart3Icon, FolderGit2Icon } from "lucide-react";

import type { ProjectManagementRouteTarget } from "~/project-management/projectManagementTypes";
import { buildProjectManagementRouteTarget } from "~/project-management/projectManagementRoute";
import { Button } from "../ui/button";

interface ProjectManagementShellProps {
  readonly target: ProjectManagementRouteTarget;
  readonly title: string;
  readonly workspaceRoot: string | null;
  readonly onNavigate: (target: ProjectManagementRouteTarget) => void;
  readonly children: ReactNode;
}

export function ProjectManagementShell({
  target,
  title,
  workspaceRoot,
  onNavigate,
  children,
}: ProjectManagementShellProps) {
  const managementTarget = buildProjectManagementRouteTarget({
    environmentId: target.environmentId,
    projectId: target.projectId,
    view: "management",
  });
  const inferenceTarget = buildProjectManagementRouteTarget({
    environmentId: target.environmentId,
    projectId: target.projectId,
    view: "inference",
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="shrink-0 border-b border-border bg-card/65 px-5 py-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-normal">{title}</h1>
            {workspaceRoot ? (
              <p className="text-muted-foreground mt-1 truncate text-sm">{workspaceRoot}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background p-1">
            <Button
              type="button"
              variant={target.view === "management" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onNavigate(managementTarget)}
            >
              <FolderGit2Icon className="size-4" />
              Manage
            </Button>
            <Button
              type="button"
              variant={target.view === "inference" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onNavigate(inferenceTarget)}
            >
              <BarChart3Icon className="size-4" />
              Inference
            </Button>
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</main>
    </div>
  );
}
