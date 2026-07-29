import { describe, expect, it } from "vite-plus/test";

import {
  changeRequestStateFromVcsStatus,
  effectiveSettledFromVcsStatus,
  THREAD_QUEUED_GRACE_MS,
  hasQueuedThreadTurn,
  resolveThreadSettlement,
  type ThreadSettlementPolicyInput,
} from "./threadSettled.ts";
import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";

const now = "2026-07-29T12:00:00.000Z";

function input(overrides: Partial<ThreadSettlementPolicyInput> = {}): ThreadSettlementPolicyInput {
  return {
    now,
    settledOverride: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    sessionStatus: "idle",
    latestUserMessageAt: "2026-07-29T11:00:00.000Z",
    latestTurn: {
      requestedAt: "2026-07-29T11:00:01.000Z",
      startedAt: "2026-07-29T11:00:02.000Z",
      completedAt: "2026-07-29T11:10:00.000Z",
    },
    changeRequestState: null,
    autoSettleAfterDays: 3,
    ...overrides,
  };
}

describe("resolveThreadSettlement", () => {
  it.each([
    { hasPendingApprovals: true },
    { hasPendingUserInput: true },
    { sessionStatus: "starting" as const },
    { sessionStatus: "running" as const },
    {
      latestUserMessageAt: "2026-07-29T11:59:00.000Z",
      latestTurn: null,
    },
  ])("keeps active blockers ahead of every settled input", (blocker) => {
    expect(
      resolveThreadSettlement(
        input({
          settledOverride: "settled",
          changeRequestState: "merged",
          autoSettleAfterDays: 1,
          ...blocker,
        }),
      ),
    ).toEqual({ settled: false, reason: "active-blocker" });
  });

  it("keeps explicit active ahead of change request and inactivity settlement", () => {
    expect(
      resolveThreadSettlement(
        input({
          settledOverride: "active",
          changeRequestState: "closed",
          latestUserMessageAt: "2026-07-01T00:00:00.000Z",
          latestTurn: null,
          autoSettleAfterDays: 1,
        }),
      ),
    ).toEqual({ settled: false, reason: "explicit-active" });
  });

  it("keeps explicit settled ahead of change request and inactivity settlement", () => {
    expect(
      resolveThreadSettlement(
        input({
          settledOverride: "settled",
          changeRequestState: "merged",
        }),
      ),
    ).toEqual({ settled: true, reason: "explicit-settled" });
  });

  it.each(["merged", "closed"] as const)("settles a %s change request", (state) => {
    expect(resolveThreadSettlement(input({ changeRequestState: state }))).toEqual({
      settled: true,
      reason: "change-request",
    });
  });

  it("settles only after the inactivity threshold using the latest activity timestamp", () => {
    expect(
      resolveThreadSettlement(
        input({
          now: "2026-07-10T12:00:00.000Z",
          latestUserMessageAt: "2026-07-07T11:59:59.999Z",
          latestTurn: {
            requestedAt: "2026-07-07T11:59:59.999Z",
            startedAt: "2026-07-07T11:59:59.999Z",
            completedAt: "2026-07-07T11:59:59.999Z",
          },
        }),
      ),
    ).toEqual({ settled: true, reason: "inactivity" });
  });

  it("accepts the ninety day upper inactivity threshold", () => {
    expect(
      resolveThreadSettlement(
        input({
          now: "2026-04-02T00:00:00.001Z",
          latestUserMessageAt: "2026-01-01T00:00:00.000Z",
          latestTurn: null,
          autoSettleAfterDays: 90,
        }),
      ),
    ).toEqual({ settled: true, reason: "inactivity" });
  });

  it.each([null, 0, 1.5, 91, Number.NaN])(
    "does not apply inactivity for disabled or invalid threshold %s",
    (autoSettleAfterDays) => {
      expect(
        resolveThreadSettlement(
          input({
            latestUserMessageAt: "2026-01-01T00:00:00.000Z",
            latestTurn: null,
            autoSettleAfterDays,
          }),
        ),
      ).toEqual({ settled: false, reason: "active" });
    },
  );

  it.each([
    { now: "invalid" },
    { latestUserMessageAt: "invalid" },
    {
      latestTurn: {
        requestedAt: "invalid",
        startedAt: null,
        completedAt: null,
      },
    },
  ])("never auto-settles invalid timestamps", (timestamps) => {
    expect(
      resolveThreadSettlement(
        input({
          latestUserMessageAt: "2026-01-01T00:00:00.000Z",
          latestTurn: null,
          autoSettleAfterDays: 1,
          ...timestamps,
        }),
      ),
    ).toEqual({ settled: false, reason: "invalid-timestamp" });
  });
});

describe("hasQueuedThreadTurn", () => {
  it("uses the latest request, start, and completion timestamp", () => {
    expect(
      hasQueuedThreadTurn({
        now,
        latestUserMessageAt: "2026-07-29T11:59:00.000Z",
        sessionStatus: null,
        latestTurn: {
          requestedAt: "2026-07-29T11:58:00.000Z",
          startedAt: "2026-07-29T11:58:01.000Z",
          completedAt: "2026-07-29T11:58:02.000Z",
        },
      }),
    ).toBe(true);
  });

  it("ends queued grace after exactly two minutes", () => {
    expect(THREAD_QUEUED_GRACE_MS).toBe(120_000);
    expect(
      hasQueuedThreadTurn({
        now,
        latestUserMessageAt: "2026-07-29T11:58:00.000Z",
        sessionStatus: null,
        latestTurn: null,
      }),
    ).toBe(true);
    expect(
      hasQueuedThreadTurn({
        now,
        latestUserMessageAt: "2026-07-29T11:57:59.999Z",
        sessionStatus: null,
        latestTurn: null,
      }),
    ).toBe(false);
  });

  it("bounds small future clock skew and clears a failed session start", () => {
    const queued = {
      now,
      latestUserMessageAt: "2026-07-29T12:01:00.000Z",
      latestTurn: null,
    } as const;
    expect(hasQueuedThreadTurn({ ...queued, sessionStatus: null })).toBe(true);
    expect(hasQueuedThreadTurn({ ...queued, sessionStatus: "error" })).toBe(false);
  });
});

describe("VCS settlement adapter", () => {
  const shell: OrchestrationThreadShell = {
    id: ThreadId.make("thread-vcs-settlement"),
    projectId: ProjectId.make("project-vcs-settlement"),
    title: "VCS settlement",
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    branch: "feature",
    worktreePath: "/repo-worktree",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T11:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    latestTurn: null,
    latestUserMessageAt: "2026-07-29T11:00:00.000Z",
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    activePlanProgress: null,
    hasActionableProposedPlan: false,
    latestRuntimeActivityAt: null,
    statusSummaryUpdatedAt: null,
  };

  it.each(["merged", "closed"] as const)(
    "feeds %s change-request state into immediate settlement",
    (state) => {
      const status = { refName: "feature", pr: { state } } as never;
      expect(changeRequestStateFromVcsStatus(shell.branch, status)).toBe(state);
      expect(
        effectiveSettledFromVcsStatus(shell, {
          now,
          autoSettleAfterDays: null,
          status,
        }),
      ).toBe(true);
    },
  );

  it("preserves blockers and explicit active precedence", () => {
    const status = { refName: "feature", pr: { state: "merged" } } as never;
    expect(
      effectiveSettledFromVcsStatus(
        { ...shell, hasPendingApprovals: true },
        { now, autoSettleAfterDays: null, status },
      ),
    ).toBe(false);
    expect(
      effectiveSettledFromVcsStatus(
        { ...shell, settledOverride: "active" },
        { now, autoSettleAfterDays: null, status },
      ),
    ).toBe(false);
  });

  it("ignores a change request for a different checked-out branch", () => {
    const status = { refName: "unrelated", pr: { state: "merged" } } as never;
    expect(changeRequestStateFromVcsStatus(shell.branch, status)).toBeNull();
    expect(
      effectiveSettledFromVcsStatus(shell, {
        now,
        autoSettleAfterDays: null,
        status,
      }),
    ).toBe(false);
  });
});
