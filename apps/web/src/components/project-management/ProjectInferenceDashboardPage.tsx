import type { ProjectId } from "@t3tools/contracts";
import { ArrowRightIcon } from "lucide-react";

import { buildProjectInferenceDashboardSnapshot } from "~/project-management/projectManagementInference";
import type { ProjectManagementThread } from "~/project-management/projectManagementTypes";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { ProjectMetricCard } from "./ProjectMetricCard";

interface ProjectInferenceDashboardPageProps {
  readonly projectId: ProjectId;
  readonly threads: ReadonlyArray<ProjectManagementThread>;
  readonly onOpenThread: (thread: ProjectManagementThread) => void;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function findThread(
  threads: ReadonlyArray<ProjectManagementThread>,
  threadId: ProjectManagementThread["id"],
  environmentId: ProjectManagementThread["environmentId"],
): ProjectManagementThread | null {
  return (
    threads.find((thread) => thread.id === threadId && thread.environmentId === environmentId) ??
    null
  );
}

export function ProjectInferenceDashboardPage({
  projectId,
  threads,
  onOpenThread,
}: ProjectInferenceDashboardPageProps) {
  const snapshot = buildProjectInferenceDashboardSnapshot({ threads });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ProjectMetricCard
          label="Lifetime burn"
          value={formatNumber(snapshot.lifetimeTotalBurnTokens)}
          detail={`${formatNumber(snapshot.trackedTurns)} tracked turns`}
        />
        <ProjectMetricCard
          label="Recent burn"
          value={formatNumber(snapshot.recentTotalBurnTokens)}
          detail={`${formatNumber(snapshot.recentTrackedTurns)} turns in 7 days`}
        />
        <ProjectMetricCard
          label="30 day projection"
          value={formatNumber(snapshot.projectedMonthlyBurnTokens)}
          detail="Based on recent burn"
        />
        <ProjectMetricCard
          label="Average burn"
          value={formatNumber(snapshot.averageBurnPerTrackedTurn)}
          detail="Per tracked turn"
        />
      </section>

      <section className="grid gap-2 sm:grid-cols-3">
        <ProjectMetricCard
          label="Input tokens"
          value={formatNumber(snapshot.lifetimeInputTokens)}
        />
        <ProjectMetricCard
          label="Cached input"
          value={formatNumber(snapshot.lifetimeCachedInputTokens)}
        />
        <ProjectMetricCard
          label="Output tokens"
          value={formatNumber(snapshot.lifetimeOutputTokens)}
        />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold tracking-normal text-foreground">
            Thread leaderboard
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ranked by latest project scoped usage snapshots for {projectId}.
          </p>
        </div>
        <div className="divide-y divide-border">
          {snapshot.leaderboard.length > 0 ? (
            snapshot.leaderboard.map((entry) => {
              const thread = findThread(threads, entry.threadId, entry.environmentId);
              return (
                <button
                  type="button"
                  key={`${entry.environmentId}:${entry.threadId}`}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-4 px-4 py-3 text-left hover:bg-accent"
                  disabled={thread === null}
                  onClick={() => {
                    if (thread) {
                      onOpenThread(thread);
                    }
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {entry.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatNumber(entry.trackedTurns)} turns -{" "}
                      {formatRelativeTimeLabel(entry.latestActivityAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-4 text-right">
                    <span>
                      <span className="block text-sm font-semibold text-foreground">
                        {formatNumber(entry.totalProcessedTokens)}
                      </span>
                      <span className="block text-xs text-muted-foreground">burn</span>
                    </span>
                    <ArrowRightIcon className="size-4 text-muted-foreground" />
                  </span>
                </button>
              );
            })
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No inference usage snapshots have been recorded for this project.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
