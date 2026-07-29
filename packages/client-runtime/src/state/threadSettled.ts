import type {
  OrchestrationLatestTurn,
  OrchestrationSession,
  OrchestrationThreadShell,
  ThreadSettledOverride,
} from "@t3tools/contracts";

export const THREAD_QUEUED_GRACE_MS = 2 * 60 * 1000;
export const THREAD_AUTO_SETTLE_MIN_DAYS = 1;
export const THREAD_AUTO_SETTLE_MAX_DAYS = 90;
export type ChangeRequestStateLike = "open" | "closed" | "merged";

export interface ThreadSettlementPolicyInput {
  readonly now: string;
  readonly settledOverride: ThreadSettledOverride | null;
  readonly hasPendingApprovals: boolean;
  readonly hasPendingUserInput: boolean;
  readonly sessionStatus: OrchestrationSession["status"] | null;
  readonly latestUserMessageAt: string | null;
  readonly latestTurn: Pick<
    OrchestrationLatestTurn,
    "requestedAt" | "startedAt" | "completedAt"
  > | null;
  readonly changeRequestState: ChangeRequestStateLike | "other" | null;
  readonly autoSettleAfterDays: number | null;
}

export type ThreadSettlementResolution =
  | { readonly settled: false; readonly reason: "active-blocker" }
  | { readonly settled: false; readonly reason: "explicit-active" }
  | { readonly settled: true; readonly reason: "explicit-settled" }
  | { readonly settled: true; readonly reason: "change-request" }
  | { readonly settled: true; readonly reason: "inactivity" }
  | { readonly settled: false; readonly reason: "invalid-timestamp" }
  | { readonly settled: false; readonly reason: "active" };

function parseIsoTimestamp(value: string | null): number | null | "invalid" {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function collectActivityTimestamps(
  input: Pick<ThreadSettlementPolicyInput, "latestUserMessageAt" | "latestTurn">,
): { readonly timestamps: ReadonlyArray<number>; readonly hasInvalid: boolean } {
  const values = [
    input.latestUserMessageAt,
    input.latestTurn?.requestedAt ?? null,
    input.latestTurn?.startedAt ?? null,
    input.latestTurn?.completedAt ?? null,
  ];
  const timestamps: number[] = [];
  let hasInvalid = false;
  for (const value of values) {
    const timestamp = parseIsoTimestamp(value);
    if (timestamp === "invalid") {
      hasInvalid = true;
    } else if (timestamp !== null) {
      timestamps.push(timestamp);
    }
  }
  return { timestamps, hasInvalid };
}

export function hasQueuedThreadTurn(
  input: Pick<
    ThreadSettlementPolicyInput,
    "now" | "latestUserMessageAt" | "latestTurn" | "sessionStatus"
  >,
): boolean {
  if (input.sessionStatus === "error") {
    return false;
  }
  const now = parseIsoTimestamp(input.now);
  const latestUserMessageAt = parseIsoTimestamp(input.latestUserMessageAt);
  if (
    now === null ||
    now === "invalid" ||
    latestUserMessageAt === null ||
    latestUserMessageAt === "invalid"
  ) {
    return false;
  }

  const turnTimestamps = [
    input.latestTurn?.requestedAt ?? null,
    input.latestTurn?.startedAt ?? null,
    input.latestTurn?.completedAt ?? null,
  ].flatMap((value) => {
    const timestamp = parseIsoTimestamp(value);
    return typeof timestamp === "number" ? [timestamp] : [];
  });
  const latestTurnActivityAt = turnTimestamps.length === 0 ? null : Math.max(...turnTimestamps);

  return (
    latestUserMessageAt > (latestTurnActivityAt ?? Number.NEGATIVE_INFINITY) &&
    Math.abs(now - latestUserMessageAt) <= THREAD_QUEUED_GRACE_MS
  );
}

export function resolveThreadSettlement(
  input: ThreadSettlementPolicyInput,
): ThreadSettlementResolution {
  if (
    input.hasPendingApprovals ||
    input.hasPendingUserInput ||
    input.sessionStatus === "starting" ||
    input.sessionStatus === "running" ||
    hasQueuedThreadTurn(input)
  ) {
    return { settled: false, reason: "active-blocker" };
  }

  if (input.settledOverride === "active") {
    return { settled: false, reason: "explicit-active" };
  }
  if (input.settledOverride === "settled") {
    return { settled: true, reason: "explicit-settled" };
  }
  if (input.changeRequestState === "merged" || input.changeRequestState === "closed") {
    return { settled: true, reason: "change-request" };
  }

  const now = parseIsoTimestamp(input.now);
  const activity = collectActivityTimestamps(input);
  if (now === null || now === "invalid" || activity.hasInvalid) {
    return { settled: false, reason: "invalid-timestamp" };
  }

  if (
    input.autoSettleAfterDays !== null &&
    Number.isInteger(input.autoSettleAfterDays) &&
    input.autoSettleAfterDays >= THREAD_AUTO_SETTLE_MIN_DAYS &&
    input.autoSettleAfterDays <= THREAD_AUTO_SETTLE_MAX_DAYS &&
    activity.timestamps.length > 0
  ) {
    const latestActivityAt = Math.max(...activity.timestamps);
    const thresholdMs = input.autoSettleAfterDays * 24 * 60 * 60 * 1000;
    if (now >= latestActivityAt && now - latestActivityAt > thresholdMs) {
      return { settled: true, reason: "inactivity" };
    }
  }

  return { settled: false, reason: "active" };
}

function toPolicyInput(
  shell: OrchestrationThreadShell,
  options: {
    readonly now: string;
    readonly autoSettleAfterDays: number | null;
    readonly changeRequestState?: ChangeRequestStateLike | null;
  },
): ThreadSettlementPolicyInput {
  return {
    now: options.now,
    settledOverride: shell.settledOverride,
    hasPendingApprovals: shell.hasPendingApprovals,
    hasPendingUserInput: shell.hasPendingUserInput,
    sessionStatus: shell.session?.status ?? null,
    latestUserMessageAt: shell.latestUserMessageAt,
    latestTurn: shell.latestTurn,
    changeRequestState: options.changeRequestState ?? null,
    autoSettleAfterDays: options.autoSettleAfterDays,
  };
}

export function hasQueuedTurnStart(
  shell: Pick<OrchestrationThreadShell, "latestUserMessageAt" | "latestTurn" | "session">,
  options: { readonly now: string },
): boolean {
  return hasQueuedThreadTurn({
    now: options.now,
    latestUserMessageAt: shell.latestUserMessageAt,
    latestTurn: shell.latestTurn,
    sessionStatus: shell.session?.status ?? null,
  });
}

export function canSettle(
  shell: Pick<
    OrchestrationThreadShell,
    "hasPendingApprovals" | "hasPendingUserInput" | "session" | "latestUserMessageAt" | "latestTurn"
  >,
  options: { readonly now: string },
): boolean {
  return !(
    shell.hasPendingApprovals ||
    shell.hasPendingUserInput ||
    shell.session?.status === "starting" ||
    shell.session?.status === "running" ||
    hasQueuedTurnStart(shell, options)
  );
}

export function effectiveSettled(
  shell: OrchestrationThreadShell,
  options: {
    readonly now: string;
    readonly autoSettleAfterDays: number | null;
    readonly changeRequestState?: ChangeRequestStateLike | null;
  },
): boolean {
  return resolveThreadSettlement(toPolicyInput(shell, options)).settled;
}
