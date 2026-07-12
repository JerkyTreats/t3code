import type { OrchestrationThreadActivity } from "@t3tools/contracts";

import { formatDuration } from "../session-logic";
import type { ProjectManagementThread } from "./projectManagementTypes";

export interface ProjectInferenceRollup {
  readonly totalDurationMs: number;
  readonly recentDurationMs: number;
  readonly totalTurns: number;
  readonly recentTurns: number;
  readonly totalLabel: string;
  readonly recentLabel: string;
}

export interface ProjectInferenceLeaderboardEntry {
  readonly threadId: ProjectManagementThread["id"];
  readonly environmentId: ProjectManagementThread["environmentId"];
  readonly title: string;
  readonly archivedAt: string | null;
  readonly latestActivityAt: string;
  readonly totalProcessedTokens: number;
  readonly totalInputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly totalDurationMs: number;
  readonly trackedTurns: number;
  readonly averageProcessedTokensPerTurn: number;
}

export interface ProjectInferenceDashboardSnapshot {
  readonly lifetimeTotalBurnTokens: number;
  readonly lifetimeInputTokens: number;
  readonly lifetimeCachedInputTokens: number;
  readonly lifetimeOutputTokens: number;
  readonly recentTotalBurnTokens: number;
  readonly recentInputTokens: number;
  readonly recentCachedInputTokens: number;
  readonly recentOutputTokens: number;
  readonly projectedMonthlyBurnTokens: number;
  readonly averageBurnPerTrackedTurn: number;
  readonly trackedTurns: number;
  readonly recentTrackedTurns: number;
  readonly leaderboard: ReadonlyArray<ProjectInferenceLeaderboardEntry>;
}

interface LatestTurnUsageSnapshot {
  readonly createdAt: string;
  readonly durationMs: number;
  readonly totalInputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly totalProcessedTokens: number;
}

interface TokenComponentTotals {
  readonly totalInputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
  readonly componentTotal: number;
}

function activityOrder(
  left: OrchestrationThreadActivity,
  right: OrchestrationThreadActivity,
): number {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    leftSequence - rightSequence ||
    left.id.localeCompare(right.id)
  );
}

export function latestProjectThreadActivityAt(thread: ProjectManagementThread): string {
  return (
    thread.latestTurn?.completedAt ??
    thread.latestTurn?.startedAt ??
    thread.updatedAt ??
    thread.createdAt
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveTokenComponentTotals(
  payload: Record<string, unknown>,
  comparisonTotal: number,
): TokenComponentTotals {
  const inputTokens = asFiniteNumber(payload.inputTokens) ?? 0;
  const cachedInputTokens = asFiniteNumber(payload.cachedInputTokens) ?? 0;
  const outputTokens = asFiniteNumber(payload.outputTokens) ?? 0;
  const reasoningOutputTokens = asFiniteNumber(payload.reasoningOutputTokens) ?? 0;
  const rawComponentTotal = inputTokens + cachedInputTokens + outputTokens + reasoningOutputTokens;
  const inputAsTotalComponentTotal = inputTokens + outputTokens + reasoningOutputTokens;
  const cachedInputIsInputSubset =
    cachedInputTokens > 0 &&
    comparisonTotal > 0 &&
    rawComponentTotal > comparisonTotal &&
    inputAsTotalComponentTotal <= comparisonTotal;
  const totalInputTokens = cachedInputIsInputSubset ? inputTokens : inputTokens + cachedInputTokens;
  const componentTotal = totalInputTokens + outputTokens + reasoningOutputTokens;

  return {
    totalInputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    componentTotal,
  };
}

function resolveProcessedTokens(payload: Record<string, unknown>): number {
  const totalProcessedTokens = asFiniteNumber(payload.totalProcessedTokens);
  if (totalProcessedTokens !== null && totalProcessedTokens > 0) {
    return totalProcessedTokens;
  }

  const usedTokens = asFiniteNumber(payload.usedTokens) ?? 0;
  const { componentTotal } = resolveTokenComponentTotals(payload, usedTokens);

  return componentTotal > 0 ? Math.max(componentTotal, usedTokens) : usedTokens;
}

function collectLatestTurnUsageSnapshots(
  threads: ReadonlyArray<ProjectManagementThread>,
): Map<ProjectManagementThread["id"], Map<string, LatestTurnUsageSnapshot>> {
  const snapshotsByThreadId = new Map<
    ProjectManagementThread["id"],
    Map<string, LatestTurnUsageSnapshot>
  >();

  for (const thread of threads) {
    const latestUsageByTurnKey = new Map<string, LatestTurnUsageSnapshot>();
    for (const activity of [...thread.activities].toSorted(activityOrder)) {
      if (activity.kind !== "context-window.updated") {
        continue;
      }
      const payload = asRecord(activity.payload);
      if (!payload) {
        continue;
      }
      const processedTokens = resolveProcessedTokens(payload);
      const durationMs = asFiniteNumber(payload.durationMs) ?? 0;
      if (processedTokens <= 0 && durationMs <= 0) {
        continue;
      }
      const componentTotals = resolveTokenComponentTotals(payload, processedTokens);

      latestUsageByTurnKey.set(activity.turnId ?? activity.id, {
        createdAt: activity.createdAt,
        durationMs,
        totalInputTokens: componentTotals.totalInputTokens,
        cachedInputTokens: componentTotals.cachedInputTokens,
        outputTokens: componentTotals.outputTokens,
        totalProcessedTokens: processedTokens,
      });
    }
    snapshotsByThreadId.set(thread.id, latestUsageByTurnKey);
  }

  return snapshotsByThreadId;
}

export function deriveProjectInferenceRollup(
  threads: ReadonlyArray<ProjectManagementThread>,
  nowIso: string,
): ProjectInferenceRollup {
  const cutoffMs = new Date(nowIso).getTime() - 7 * 24 * 60 * 60 * 1000;
  const latestUsageByThreadId = collectLatestTurnUsageSnapshots(threads);

  let totalDurationMs = 0;
  let recentDurationMs = 0;
  let totalTurns = 0;
  let recentTurns = 0;

  for (const latestUsageByTurnKey of latestUsageByThreadId.values()) {
    for (const usage of latestUsageByTurnKey.values()) {
      totalDurationMs += usage.durationMs;
      totalTurns += 1;
      if (new Date(usage.createdAt).getTime() >= cutoffMs) {
        recentDurationMs += usage.durationMs;
        recentTurns += 1;
      }
    }
  }

  return {
    totalDurationMs,
    recentDurationMs,
    totalTurns,
    recentTurns,
    totalLabel: formatDuration(totalDurationMs),
    recentLabel: formatDuration(recentDurationMs),
  };
}

export function buildProjectInferenceDashboardSnapshot(input: {
  readonly nowIso?: string;
  readonly threads: ReadonlyArray<ProjectManagementThread>;
}): ProjectInferenceDashboardSnapshot {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const cutoffMs = new Date(nowIso).getTime() - 7 * 24 * 60 * 60 * 1000;
  const latestUsageByThreadId = collectLatestTurnUsageSnapshots(input.threads);
  const leaderboard: ProjectInferenceLeaderboardEntry[] = [];
  let lifetimeTotalBurnTokens = 0;
  let lifetimeInputTokens = 0;
  let lifetimeCachedInputTokens = 0;
  let lifetimeOutputTokens = 0;
  let recentTotalBurnTokens = 0;
  let recentInputTokens = 0;
  let recentCachedInputTokens = 0;
  let recentOutputTokens = 0;
  let trackedTurns = 0;
  let recentTrackedTurns = 0;

  for (const thread of input.threads) {
    const usageByTurnKey = latestUsageByThreadId.get(thread.id) ?? new Map();
    let totalProcessedTokens = 0;
    let totalInputTokens = 0;
    let cachedInputTokens = 0;
    let outputTokens = 0;
    let totalDurationMs = 0;

    for (const usage of usageByTurnKey.values()) {
      totalProcessedTokens += usage.totalProcessedTokens;
      totalInputTokens += usage.totalInputTokens;
      cachedInputTokens += usage.cachedInputTokens;
      outputTokens += usage.outputTokens;
      totalDurationMs += usage.durationMs;
      trackedTurns += 1;
      lifetimeTotalBurnTokens += usage.totalProcessedTokens;
      lifetimeInputTokens += usage.totalInputTokens;
      lifetimeCachedInputTokens += usage.cachedInputTokens;
      lifetimeOutputTokens += usage.outputTokens;

      if (new Date(usage.createdAt).getTime() >= cutoffMs) {
        recentTrackedTurns += 1;
        recentTotalBurnTokens += usage.totalProcessedTokens;
        recentInputTokens += usage.totalInputTokens;
        recentCachedInputTokens += usage.cachedInputTokens;
        recentOutputTokens += usage.outputTokens;
      }
    }

    leaderboard.push({
      threadId: thread.id,
      environmentId: thread.environmentId,
      title: thread.title,
      archivedAt: thread.archivedAt ?? null,
      latestActivityAt: latestProjectThreadActivityAt(thread),
      totalProcessedTokens,
      totalInputTokens,
      cachedInputTokens,
      outputTokens,
      totalDurationMs,
      trackedTurns: usageByTurnKey.size,
      averageProcessedTokensPerTurn:
        usageByTurnKey.size > 0 ? Math.round(totalProcessedTokens / usageByTurnKey.size) : 0,
    });
  }

  leaderboard.sort(
    (left, right) =>
      right.totalProcessedTokens - left.totalProcessedTokens ||
      right.latestActivityAt.localeCompare(left.latestActivityAt) ||
      left.title.localeCompare(right.title),
  );

  return {
    lifetimeTotalBurnTokens,
    lifetimeInputTokens,
    lifetimeCachedInputTokens,
    lifetimeOutputTokens,
    recentTotalBurnTokens,
    recentInputTokens,
    recentCachedInputTokens,
    recentOutputTokens,
    projectedMonthlyBurnTokens:
      recentTotalBurnTokens > 0 ? Math.round((recentTotalBurnTokens / 7) * 30) : 0,
    averageBurnPerTrackedTurn:
      trackedTurns > 0 ? Math.round(lifetimeTotalBurnTokens / trackedTurns) : 0,
    trackedTurns,
    recentTrackedTurns,
    leaderboard,
  };
}
