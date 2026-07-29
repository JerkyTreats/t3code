import type { OrchestrationThreadShell } from "@t3tools/contracts";
import {
  hasQueuedThreadTurn,
  hasThreadSettlementBlocker,
  resolveThreadSettlement,
  type ChangeRequestStateLike,
  type ThreadSettlementPolicyInput,
} from "@t3tools/shared/threadSettlement";

export {
  hasQueuedThreadTurn,
  resolveThreadSettlement,
  THREAD_AUTO_SETTLE_MAX_DAYS,
  THREAD_AUTO_SETTLE_MIN_DAYS,
  THREAD_QUEUED_GRACE_MS,
  type ChangeRequestStateLike,
  type ThreadSettlementPolicyInput,
  type ThreadSettlementResolution,
} from "@t3tools/shared/threadSettlement";

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
  return !hasThreadSettlementBlocker({
    now: options.now,
    hasPendingApprovals: shell.hasPendingApprovals,
    hasPendingUserInput: shell.hasPendingUserInput,
    sessionStatus: shell.session?.status ?? null,
    latestUserMessageAt: shell.latestUserMessageAt,
    latestTurn: shell.latestTurn,
  });
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
