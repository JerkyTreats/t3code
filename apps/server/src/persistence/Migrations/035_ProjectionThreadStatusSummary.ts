import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface ProjectionThreadBackfillRow {
  readonly threadId: string;
  readonly latestTurnId: string | null;
  readonly updatedAt: string;
  readonly latestUserMessageAt: string | null;
}

interface ProjectionActivityBackfillRow {
  readonly threadId: string;
  readonly activityId: string;
  readonly turnId: string | null;
  readonly payloadJson: string;
  readonly sequence: number | null;
  readonly createdAt: string;
}

type PlanStepStatus = "pending" | "inProgress" | "completed";

function normalizePlanStepStatus(value: unknown): PlanStepStatus {
  if (value === "completed" || value === "inProgress" || value === "pending") {
    return value;
  }
  if (value === "in_progress") {
    return "inProgress";
  }
  return "pending";
}

function parsePlanSteps(payloadJson: string): ReadonlyArray<{ readonly status: PlanStepStatus }> {
  try {
    const payload = JSON.parse(payloadJson) as unknown;
    if (!payload || typeof payload !== "object") {
      return [];
    }
    const plan = (payload as { readonly plan?: unknown }).plan;
    if (!Array.isArray(plan)) {
      return [];
    }
    return plan.flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.step !== "string") {
        return [];
      }
      return [{ status: normalizePlanStepStatus(record.status) }];
    });
  } catch {
    return [];
  }
}

function maxIso(left: string | null, right: string | null | undefined): string | null {
  if (right === null || right === undefined) {
    return left;
  }
  if (left === null) {
    return right;
  }
  return left > right ? left : right;
}

function compareActivityOrder(
  left: ProjectionActivityBackfillRow,
  right: ProjectionActivityBackfillRow,
): number {
  if (left.sequence !== null && right.sequence !== null && left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }
  return left.activityId.localeCompare(right.activityId);
}

function derivePlanProgressJson(
  thread: ProjectionThreadBackfillRow,
  activities: ReadonlyArray<ProjectionActivityBackfillRow>,
): string | null {
  const ordered = [...activities].toSorted(compareActivityOrder);
  const currentTurnActivity =
    thread.latestTurnId === null
      ? null
      : (ordered.findLast((activity) => activity.turnId === thread.latestTurnId) ?? null);
  const activity = currentTurnActivity ?? ordered.at(-1) ?? null;
  if (activity === null) {
    return null;
  }
  const steps = parsePlanSteps(activity.payloadJson);
  if (steps.length === 0) {
    return null;
  }
  const totalSteps = steps.length;
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const inProgressIndex = steps.findIndex((step) => step.status === "inProgress");
  const completedAllSteps = completedCount >= totalSteps;
  const currentStepNumber = completedAllSteps
    ? totalSteps
    : inProgressIndex >= 0
      ? inProgressIndex + 1
      : Math.min(completedCount + 1, totalSteps);

  return JSON.stringify({
    completedAllSteps,
    currentStepNumber,
    totalSteps,
    turnId: activity.turnId,
    activityId: activity.activityId,
    updatedAt: activity.createdAt,
  });
}

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("active_plan_progress_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN active_plan_progress_json TEXT
    `;
  }

  if (!columnNames.has("latest_runtime_activity_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN latest_runtime_activity_at TEXT
    `;
  }

  if (!columnNames.has("status_summary_updated_at")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN status_summary_updated_at TEXT
    `;
  }

  const threadRows = yield* sql<ProjectionThreadBackfillRow>`
    SELECT
      thread_id AS "threadId",
      latest_turn_id AS "latestTurnId",
      updated_at AS "updatedAt",
      latest_user_message_at AS "latestUserMessageAt"
    FROM projection_threads
  `;
  const activityRows = yield* sql<ProjectionActivityBackfillRow>`
    SELECT
      thread_id AS "threadId",
      activity_id AS "activityId",
      turn_id AS "turnId",
      payload_json AS "payloadJson",
      sequence,
      created_at AS "createdAt"
    FROM projection_thread_activities
    WHERE kind = 'turn.plan.updated'
  `;
  const activitiesByThreadId = new Map<string, ProjectionActivityBackfillRow[]>();
  for (const activity of activityRows) {
    const activities = activitiesByThreadId.get(activity.threadId) ?? [];
    activities.push(activity);
    activitiesByThreadId.set(activity.threadId, activities);
  }

  for (const thread of threadRows) {
    const activities = activitiesByThreadId.get(thread.threadId) ?? [];
    const planProgressJson = derivePlanProgressJson(thread, activities);
    const latestRuntimeActivityAt = activities.reduce<string | null>(
      (latest, activity) => maxIso(latest, activity.createdAt),
      null,
    );
    const statusSummaryUpdatedAt = maxIso(
      maxIso(thread.updatedAt, thread.latestUserMessageAt),
      latestRuntimeActivityAt,
    );

    yield* sql`
      UPDATE projection_threads
      SET
        active_plan_progress_json = COALESCE(active_plan_progress_json, ${planProgressJson}),
        latest_runtime_activity_at = COALESCE(latest_runtime_activity_at, ${latestRuntimeActivityAt}),
        status_summary_updated_at = COALESCE(status_summary_updated_at, ${statusSummaryUpdatedAt})
      WHERE thread_id = ${thread.threadId}
    `;
  }
});
