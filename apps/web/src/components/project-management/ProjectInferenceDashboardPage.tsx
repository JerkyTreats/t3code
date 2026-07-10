import type { ProjectId } from "@t3tools/contracts";
import { ArrowRightIcon, BarChart3Icon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { formatContextWindowTokens } from "~/lib/contextWindow";
import { buildProjectInferenceDashboardSnapshot } from "~/project-management/projectManagementInference";
import type { ProjectManagementThread } from "~/project-management/projectManagementTypes";
import { formatDuration } from "~/session-logic";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { ProjectMetricCard } from "./ProjectMetricCard";

interface ProjectInferenceDashboardPageProps {
  readonly projectId: ProjectId;
  readonly threads: ReadonlyArray<ProjectManagementThread>;
  readonly onOpenThread: (thread: ProjectManagementThread) => void;
}

function formatExactTokens(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatInputDetail(
  inputTokens: number,
  cachedInputTokens: number,
  recentInputTokens: number,
): string {
  const cachedDetail =
    cachedInputTokens > 0
      ? `${formatExactTokens(cachedInputTokens)} cached`
      : "No separate cache total";
  return `${formatExactTokens(inputTokens)} input, ${formatExactTokens(recentInputTokens)} recent, ${cachedDetail}`;
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
  threads,
  onOpenThread,
}: ProjectInferenceDashboardPageProps) {
  const dashboard = buildProjectInferenceDashboardSnapshot({ threads });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BarChart3Icon className="size-4" />
            <span>Inference dashboard</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Processed token usage by thread</p>
        </div>
        <Badge variant="outline" className="bg-muted/40 font-normal">
          {formatContextWindowTokens(dashboard.recentTotalBurnTokens)} in 7 days
        </Badge>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
        <section className="grid grid-cols-2 gap-2">
          <ProjectMetricCard
            label="Lifetime burn"
            value={formatContextWindowTokens(dashboard.lifetimeTotalBurnTokens)}
            detail={`${formatExactTokens(dashboard.lifetimeTotalBurnTokens)} processed`}
          />
          <ProjectMetricCard
            label="7 day burn"
            value={formatContextWindowTokens(dashboard.recentTotalBurnTokens)}
            detail={`${dashboard.recentTrackedTurns} recent turns`}
          />
          <ProjectMetricCard
            label="30 day projection"
            value={formatContextWindowTokens(dashboard.projectedMonthlyBurnTokens)}
            detail="Based on the last 7 days"
          />
          <ProjectMetricCard
            label="Input tokens"
            value={formatContextWindowTokens(dashboard.lifetimeInputTokens)}
            detail={formatInputDetail(
              dashboard.lifetimeInputTokens,
              dashboard.lifetimeCachedInputTokens,
              dashboard.recentInputTokens,
            )}
          />
          <ProjectMetricCard
            label="Output tokens"
            value={formatContextWindowTokens(dashboard.lifetimeOutputTokens)}
            detail={`${formatExactTokens(dashboard.recentOutputTokens)} recent`}
          />
          <ProjectMetricCard
            label="Tracked turns"
            value={dashboard.trackedTurns}
            detail={`${formatContextWindowTokens(dashboard.averageBurnPerTrackedTurn)} average burn`}
          />
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Thread burn</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Ranked by processed tokens</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {dashboard.leaderboard.length} threads
            </span>
          </div>

          {dashboard.leaderboard.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No token usage snapshots yet.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {dashboard.leaderboard.map((entry, index) => {
                const thread = findThread(threads, entry.threadId, entry.environmentId);
                const share =
                  dashboard.lifetimeTotalBurnTokens > 0
                    ? Math.max(
                        4,
                        Math.round(
                          (entry.totalProcessedTokens / dashboard.lifetimeTotalBurnTokens) * 100,
                        ),
                      )
                    : 0;

                return (
                  <button
                    type="button"
                    key={`${entry.environmentId}:${entry.threadId}`}
                    className="group block w-full px-3 py-3 text-left transition-colors hover:bg-accent disabled:pointer-events-none"
                    disabled={thread === null}
                    onClick={() => {
                      if (thread) onOpenThread(thread);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-xs font-semibold">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground">
                                {entry.title}
                              </span>
                              {entry.archivedAt ? (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 bg-muted/40 font-normal"
                                >
                                  Archived
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Updated {formatRelativeTimeLabel(entry.latestActivityAt)}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold text-foreground">
                              {formatContextWindowTokens(entry.totalProcessedTokens)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">burn</div>
                          </div>
                        </div>

                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(100, Math.max(share, 0))}%` }}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{entry.trackedTurns} turns</span>
                          <span>{formatDuration(entry.totalDurationMs)}</span>
                          <span>{formatContextWindowTokens(entry.totalInputTokens)} input</span>
                          {entry.cachedInputTokens > 0 ? (
                            <span>{formatContextWindowTokens(entry.cachedInputTokens)} cached</span>
                          ) : null}
                          <span>{formatContextWindowTokens(entry.outputTokens)} output</span>
                          <ArrowRightIcon className="ml-auto size-3.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
