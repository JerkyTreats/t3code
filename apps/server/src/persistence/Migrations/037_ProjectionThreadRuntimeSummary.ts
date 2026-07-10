import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface ProjectionThreadBackfillRow {
  readonly threadId: string;
  readonly latestTurnId: string | null;
  readonly updatedAt: string;
  readonly latestUserMessageAt: string | null;
  readonly activePlanProgressJson: string | null;
  readonly latestRuntimeActivityAt: string | null;
  readonly statusSummaryUpdatedAt: string | null;
}

interface ProjectionActivityBackfillRow {
  readonly threadId: string;
  readonly activityId: string;
  readonly turnId: string | null;
  readonly payloadJson: string;
  readonly sequence: number | null;
  readonly createdAt: string;
}

interface ProjectionTimestampBackfillRow {
  readonly threadId: string;
  readonly latestAt: string | null;
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
      latest_user_message_at AS "latestUserMessageAt",
      active_plan_progress_json AS "activePlanProgressJson",
      latest_runtime_activity_at AS "latestRuntimeActivityAt",
      status_summary_updated_at AS "statusSummaryUpdatedAt"
    FROM projection_threads
  `;
  const planActivityRows = yield* sql<ProjectionActivityBackfillRow>`
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
  const latestUserMessageRows = yield* sql<ProjectionTimestampBackfillRow>`
    SELECT thread_id AS "threadId", MAX(created_at) AS "latestAt"
    FROM projection_thread_messages
    WHERE role = 'user'
    GROUP BY thread_id
  `;
  const latestActivityRows = yield* sql<ProjectionTimestampBackfillRow>`
    SELECT thread_id AS "threadId", MAX(created_at) AS "latestAt"
    FROM projection_thread_activities
    GROUP BY thread_id
  `;
  const latestProposedPlanRows = yield* sql<ProjectionTimestampBackfillRow>`
    SELECT
      thread_id AS "threadId",
      MAX(CASE WHEN created_at > updated_at THEN created_at ELSE updated_at END) AS "latestAt"
    FROM projection_thread_proposed_plans
    GROUP BY thread_id
  `;
  const latestApprovalRows = yield* sql<ProjectionTimestampBackfillRow>`
    SELECT
      thread_id AS "threadId",
      MAX(
        CASE
          WHEN resolved_at IS NULL OR created_at > resolved_at THEN created_at
          ELSE resolved_at
        END
      ) AS "latestAt"
    FROM projection_pending_approvals
    GROUP BY thread_id
  `;

  const planActivitiesByThreadId = new Map<string, ProjectionActivityBackfillRow[]>();
  for (const activity of planActivityRows) {
    const activities = planActivitiesByThreadId.get(activity.threadId) ?? [];
    activities.push(activity);
    planActivitiesByThreadId.set(activity.threadId, activities);
  }
  const latestTimestampByThreadId = (rows: ReadonlyArray<ProjectionTimestampBackfillRow>) =>
    new Map(rows.map((row) => [row.threadId, row.latestAt] as const));
  const latestUserMessageByThreadId = latestTimestampByThreadId(latestUserMessageRows);
  const latestActivityByThreadId = latestTimestampByThreadId(latestActivityRows);
  const latestProposedPlanByThreadId = latestTimestampByThreadId(latestProposedPlanRows);
  const latestApprovalByThreadId = latestTimestampByThreadId(latestApprovalRows);

  for (const thread of threadRows) {
    const planProgressJson = derivePlanProgressJson(
      thread,
      planActivitiesByThreadId.get(thread.threadId) ?? [],
    );
    const latestUserMessageAt = maxIso(
      thread.latestUserMessageAt,
      latestUserMessageByThreadId.get(thread.threadId),
    );
    const latestRuntimeActivityAt = maxIso(
      thread.latestRuntimeActivityAt,
      latestActivityByThreadId.get(thread.threadId),
    );
    let statusSummaryUpdatedAt = maxIso(thread.statusSummaryUpdatedAt, thread.updatedAt);
    statusSummaryUpdatedAt = maxIso(statusSummaryUpdatedAt, latestUserMessageAt);
    statusSummaryUpdatedAt = maxIso(statusSummaryUpdatedAt, latestRuntimeActivityAt);
    statusSummaryUpdatedAt = maxIso(
      statusSummaryUpdatedAt,
      latestProposedPlanByThreadId.get(thread.threadId),
    );
    statusSummaryUpdatedAt = maxIso(
      statusSummaryUpdatedAt,
      latestApprovalByThreadId.get(thread.threadId),
    );

    yield* sql`
      UPDATE projection_threads
      SET
        latest_user_message_at = ${latestUserMessageAt},
        active_plan_progress_json = COALESCE(active_plan_progress_json, ${planProgressJson}),
        latest_runtime_activity_at = ${latestRuntimeActivityAt},
        status_summary_updated_at = ${statusSummaryUpdatedAt}
      WHERE thread_id = ${thread.threadId}
    `;
  }
});
