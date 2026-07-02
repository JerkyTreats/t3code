export type RuntimePlanStepStatus = "pending" | "inProgress" | "completed";

export interface RuntimePlanStep {
  readonly step: string;
  readonly status: RuntimePlanStepStatus;
}

export interface PlanProgressPresentation {
  readonly completedAllSteps: boolean;
  readonly currentStepNumber: number;
  readonly totalSteps: number;
  readonly label: `${number}/${number}`;
  readonly pulse: boolean;
}

export interface ThreadPlanProgress<TTurnId extends string = string> {
  readonly completedAllSteps: boolean;
  readonly currentStepNumber: number;
  readonly totalSteps: number;
  readonly turnId: TTurnId | null;
  readonly activityId: string;
  readonly updatedAt: string;
}

export interface PlanActivityLike<TTurnId extends string = string> {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly turnId: TTurnId | null;
  readonly createdAt: string;
  readonly sequence?: number | undefined;
}

export function normalizePlanStepStatus(value: unknown): RuntimePlanStepStatus {
  if (value === "completed" || value === "inProgress" || value === "pending") {
    return value;
  }
  if (value === "in_progress") {
    return "inProgress";
  }
  return "pending";
}

export function parseRuntimePlanSteps(rawPlan: unknown): RuntimePlanStep[] {
  if (!Array.isArray(rawPlan)) {
    return [];
  }
  return rawPlan
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.step !== "string") return null;
      return {
        step: record.step,
        status: normalizePlanStepStatus(record.status),
      };
    })
    .filter((entry): entry is RuntimePlanStep => entry !== null);
}

export function derivePlanProgressPresentation(
  steps: ReadonlyArray<{ readonly status: RuntimePlanStepStatus }>,
): PlanProgressPresentation | null {
  const totalSteps = steps.length;
  if (totalSteps === 0) {
    return null;
  }

  const completedCount = steps.filter((step) => step.status === "completed").length;
  const inProgressIndex = steps.findIndex((step) => step.status === "inProgress");
  const completedAllSteps = completedCount >= totalSteps;
  const currentStepNumber = completedAllSteps
    ? totalSteps
    : inProgressIndex >= 0
      ? inProgressIndex + 1
      : Math.min(completedCount + 1, totalSteps);

  return {
    completedAllSteps,
    currentStepNumber,
    totalSteps,
    label: `${currentStepNumber}/${totalSteps}`,
    pulse: !completedAllSteps,
  };
}

function compareActivitiesByOrder(left: PlanActivityLike, right: PlanActivityLike): number {
  const leftSequence = left.sequence ?? null;
  const rightSequence = right.sequence ?? null;
  if (leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }
  return left.id.localeCompare(right.id);
}

function getPlanPayload(activity: PlanActivityLike | null): Record<string, unknown> | null {
  if (!activity || !activity.payload || typeof activity.payload !== "object") {
    return null;
  }
  return activity.payload as Record<string, unknown>;
}

function findLatestPlanActivity<TTurnId extends string>(
  activities: ReadonlyArray<PlanActivityLike<TTurnId>>,
  latestTurnId: TTurnId | string | null | undefined,
): PlanActivityLike<TTurnId> | null {
  const ordered = [...activities].toSorted(compareActivitiesByOrder);
  const allPlanActivities = ordered.filter((activity) => activity.kind === "turn.plan.updated");
  if (latestTurnId) {
    const currentTurnActivity = allPlanActivities.findLast(
      (activity) => activity.turnId === latestTurnId,
    );
    if (currentTurnActivity) {
      return currentTurnActivity;
    }
  }
  return allPlanActivities.at(-1) ?? null;
}

export function deriveThreadPlanProgressFromActivities<TTurnId extends string = string>(
  activities: ReadonlyArray<PlanActivityLike<TTurnId>>,
  latestTurnId: TTurnId | string | null | undefined,
): ThreadPlanProgress<TTurnId> | null {
  const activity = findLatestPlanActivity(activities, latestTurnId);
  const payload = getPlanPayload(activity);
  const progress = derivePlanProgressPresentation(parseRuntimePlanSteps(payload?.plan));
  if (!activity || !progress) {
    return null;
  }
  return {
    completedAllSteps: progress.completedAllSteps,
    currentStepNumber: progress.currentStepNumber,
    totalSteps: progress.totalSteps,
    turnId: activity.turnId,
    activityId: activity.id,
    updatedAt: activity.createdAt,
  };
}
