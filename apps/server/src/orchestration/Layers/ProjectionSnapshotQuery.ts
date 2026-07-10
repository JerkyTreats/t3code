import {
  ChatAttachment,
  CheckpointRef,
  EventId,
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  ORCHESTRATION_HYDRATE_THREAD_ACTIVITY_PAYLOADS_MAX_IDS,
  ORCHESTRATION_THREAD_SYNC_V2_MAX_CONTENT_CHUNK_BYTES,
  OrchestrationCheckpointFile,
  OrchestrationThreadActivityTone,
  OrchestrationProposedPlanId,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  OrchestrationThreadPlanProgress,
  ProjectScript,
  TurnId,
  type OrchestrationCheckpointSummary,
  type OrchestrationActivityCursor,
  type OrchestrationHydrateThreadActivityPayloadsResult,
  type OrchestrationThreadContentChunkResult,
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type OrchestrationThreadActivityPageResult,
  type OrchestrationThreadDetailV2Snapshot,
  type OrchestrationThreadSyncV2Limits,
  OrchestrationThreadV2,
  type OrchestrationProjectShell,
  type OrchestrationProposedPlan,
  type OrchestrationProject,
  type OrchestrationSession,
  type OrchestrationThreadActivity,
  type OrchestrationThreadShell,
  ModelSelection,
  ProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  isPersistenceError,
  PersistenceDecodeError,
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type ProjectionRepositoryError,
} from "../../persistence/Errors.ts";
import { ProjectionCheckpoint } from "../../persistence/Services/ProjectionCheckpoints.ts";
import { ProjectionProject } from "../../persistence/Services/ProjectionProjects.ts";
import { ProjectionState } from "../../persistence/Services/ProjectionState.ts";
import { ProjectionThreadActivity } from "../../persistence/Services/ProjectionThreadActivities.ts";
import { ProjectionThreadMessage } from "../../persistence/Services/ProjectionThreadMessages.ts";
import { ProjectionThreadProposedPlan } from "../../persistence/Services/ProjectionThreadProposedPlans.ts";
import { ProjectionThreadSession } from "../../persistence/Services/ProjectionThreadSessions.ts";
import { ProjectionThread } from "../../persistence/Services/ProjectionThreads.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ORCHESTRATION_PROJECTOR_NAMES } from "./ProjectionPipeline.ts";
import {
  ProjectionSnapshotQuery,
  type ProjectionFullThreadDiffContext,
  type ProjectionSnapshotCounts,
  type ProjectionThreadCheckpointContext,
  type ProjectionSnapshotQueryShape,
} from "../Services/ProjectionSnapshotQuery.ts";

const decodeReadModel = Schema.decodeUnknownEffect(OrchestrationReadModel);
const decodeShellSnapshot = Schema.decodeUnknownEffect(OrchestrationShellSnapshot);
const decodeThread = Schema.decodeUnknownEffect(OrchestrationThread);
const decodeThreadV2 = Schema.decodeUnknownEffect(OrchestrationThreadV2);
const ProjectionProjectDbRowSchema = ProjectionProject.mapFields(
  Struct.assign({
    defaultModelSelection: Schema.NullOr(Schema.fromJsonString(ModelSelection)),
    scripts: Schema.fromJsonString(Schema.Array(ProjectScript)),
  }),
);
const ProjectionThreadMessageDbRowSchema = ProjectionThreadMessage.mapFields(
  Struct.assign({
    isStreaming: Schema.Number,
    attachments: Schema.NullOr(Schema.fromJsonString(Schema.Array(ChatAttachment))),
  }),
);
const ProjectionThreadProposedPlanDbRowSchema = ProjectionThreadProposedPlan;
const ProjectionThreadDbRowSchema = ProjectionThread.mapFields(
  Struct.assign({
    modelSelection: Schema.fromJsonString(ModelSelection),
    activePlanProgress: Schema.NullOr(Schema.fromJsonString(OrchestrationThreadPlanProgress)),
  }),
);
const ProjectionThreadActivityDbRowSchema = ProjectionThreadActivity.mapFields(
  Struct.assign({
    payload: Schema.fromJsonString(Schema.Unknown),
    sequence: Schema.NullOr(NonNegativeInt),
  }),
);
const ProjectionThreadActivityRawDbRowSchema = Schema.Struct({
  activityId: EventId,
  threadId: ThreadId,
  turnId: Schema.NullOr(TurnId),
  tone: OrchestrationThreadActivityTone,
  kind: Schema.String,
  summary: Schema.String,
  payloadJson: Schema.NullOr(Schema.String),
  payloadByteLength: NonNegativeInt,
  sequence: Schema.NullOr(NonNegativeInt),
  createdAt: IsoDateTime,
});
const ProjectionThreadActivityPayloadMetadataDbRowSchema = Schema.Struct({
  activityId: EventId,
  payloadByteLength: NonNegativeInt,
});
const ProjectionThreadActivityPayloadJsonDbRowSchema = Schema.Struct({
  activityId: EventId,
  payloadJson: Schema.String,
});
const ProjectionThreadContentDbRowSchema = Schema.Struct({
  content: Schema.String,
  contentVersion: IsoDateTime,
});
const ProjectionThreadSessionDbRowSchema = ProjectionThreadSession;
const ProjectionCheckpointDbRowSchema = ProjectionCheckpoint.mapFields(
  Struct.assign({
    files: Schema.fromJsonString(Schema.Array(OrchestrationCheckpointFile)),
  }),
);
const ProjectionLatestTurnDbRowSchema = Schema.Struct({
  threadId: ProjectionThread.fields.threadId,
  turnId: TurnId,
  state: Schema.String,
  requestedAt: IsoDateTime,
  startedAt: Schema.NullOr(IsoDateTime),
  completedAt: Schema.NullOr(IsoDateTime),
  assistantMessageId: Schema.NullOr(MessageId),
  sourceProposedPlanThreadId: Schema.NullOr(ThreadId),
  sourceProposedPlanId: Schema.NullOr(OrchestrationProposedPlanId),
});
const ProjectionStateDbRowSchema = ProjectionState;
const ProjectionCountsRowSchema = Schema.Struct({
  projectCount: Schema.Number,
  threadCount: Schema.Number,
});
const WorkspaceRootLookupInput = Schema.Struct({
  workspaceRoot: Schema.String,
});
const ProjectIdLookupInput = Schema.Struct({
  projectId: ProjectId,
});
const ThreadIdLookupInput = Schema.Struct({
  threadId: ThreadId,
});
const ThreadLimitLookupInput = Schema.Struct({
  threadId: ThreadId,
  limit: NonNegativeInt,
});
const ThreadMessageCursorLookupInput = Schema.Struct({
  threadId: ThreadId,
  limit: NonNegativeInt,
  cursorCreatedAt: IsoDateTime,
  cursorMessageId: MessageId,
});
const ThreadProposedPlanCursorLookupInput = Schema.Struct({
  threadId: ThreadId,
  limit: NonNegativeInt,
  cursorCreatedAt: IsoDateTime,
  cursorPlanId: OrchestrationProposedPlanId,
});
const ThreadCheckpointCursorLookupInput = Schema.Struct({
  threadId: ThreadId,
  limit: NonNegativeInt,
  cursorCheckpointTurnCount: NonNegativeInt,
});
const ThreadActivityCursorLookupInput = Schema.Struct({
  threadId: ThreadId,
  limit: NonNegativeInt,
  cursorSequence: Schema.NullOr(NonNegativeInt),
  cursorCreatedAt: IsoDateTime,
  cursorActivityId: EventId,
});
const ThreadActivityIdLookupInput = Schema.Struct({
  threadId: ThreadId,
  activityId: EventId,
});
const ThreadMessageContentLookupInput = Schema.Struct({
  threadId: ThreadId,
  messageId: MessageId,
});
const ThreadProposedPlanContentLookupInput = Schema.Struct({
  threadId: ThreadId,
  planId: OrchestrationProposedPlanId,
});
const ProjectionProjectLookupRowSchema = ProjectionProjectDbRowSchema;
const ProjectionThreadIdLookupRowSchema = Schema.Struct({
  threadId: ThreadId,
});
const ProjectionThreadCheckpointContextThreadRowSchema = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  workspaceRoot: Schema.String,
  worktreePath: Schema.NullOr(Schema.String),
});
const FullThreadDiffContextLookupInput = Schema.Struct({
  threadId: ThreadId,
  checkpointTurnCount: NonNegativeInt,
});
const ProjectionFullThreadDiffContextRowSchema = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  workspaceRoot: Schema.String,
  worktreePath: Schema.NullOr(Schema.String),
  latestCheckpointTurnCount: Schema.NullOr(NonNegativeInt),
  toCheckpointRef: Schema.NullOr(CheckpointRef),
});

const REQUIRED_SNAPSHOT_PROJECTORS = [
  ORCHESTRATION_PROJECTOR_NAMES.projects,
  ORCHESTRATION_PROJECTOR_NAMES.threads,
  ORCHESTRATION_PROJECTOR_NAMES.threadMessages,
  ORCHESTRATION_PROJECTOR_NAMES.threadProposedPlans,
  ORCHESTRATION_PROJECTOR_NAMES.threadActivities,
  ORCHESTRATION_PROJECTOR_NAMES.threadSessions,
  ORCHESTRATION_PROJECTOR_NAMES.checkpoints,
] as const;

const THREAD_SYNC_V2_DEFAULT_LIMITS = {
  messages: 80,
  proposedPlans: 20,
  activities: 80,
  checkpoints: 50,
} as const;
const THREAD_SYNC_V2_MAX_LIMITS = {
  messages: 200,
  proposedPlans: 100,
  activities: 300,
  checkpoints: 200,
} as const;
const THREAD_SYNC_V2_INLINE_ACTIVITY_PAYLOAD_BYTES = 4 * 1024;
const THREAD_SYNC_V2_MAX_HYDRATE_ACTIVITY_IDS =
  ORCHESTRATION_HYDRATE_THREAD_ACTIVITY_PAYLOADS_MAX_IDS;
const THREAD_SYNC_V2_MAX_HYDRATED_ACTIVITY_PAYLOAD_BYTES = 2 * 1024 * 1024;
const THREAD_SYNC_V2_MAX_HYDRATED_RESPONSE_BYTES = 8 * 1024 * 1024;
const THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES = 8 * 1024 * 1024;
const THREAD_SYNC_V2_MAX_INLINE_CONTENT_ITEM_BYTES =
  THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES - 64 * 1024;
const THREAD_SYNC_V2_MAX_HYDRATE_OVERFLOW_OMISSIONS = 25;
const threadSyncV2TextEncoder = new TextEncoder();
const decodeRawActivityPayloadJson = Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown));

interface NormalizedThreadSyncV2Limits {
  readonly messages: number;
  readonly proposedPlans: number;
  readonly activities: number;
  readonly checkpoints: number;
}

function utf8ByteLength(input: string): number {
  return threadSyncV2TextEncoder.encode(input).byteLength;
}

function normalizeThreadSyncV2Limit(
  value: number | undefined,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.min(maximum, Math.trunc(value)));
}

function normalizeThreadSyncV2Limits(
  limits: OrchestrationThreadSyncV2Limits | undefined,
): NormalizedThreadSyncV2Limits {
  return {
    messages: normalizeThreadSyncV2Limit(
      limits?.messages,
      THREAD_SYNC_V2_DEFAULT_LIMITS.messages,
      THREAD_SYNC_V2_MAX_LIMITS.messages,
    ),
    proposedPlans: normalizeThreadSyncV2Limit(
      limits?.proposedPlans,
      THREAD_SYNC_V2_DEFAULT_LIMITS.proposedPlans,
      THREAD_SYNC_V2_MAX_LIMITS.proposedPlans,
    ),
    activities: normalizeThreadSyncV2Limit(
      limits?.activities,
      THREAD_SYNC_V2_DEFAULT_LIMITS.activities,
      THREAD_SYNC_V2_MAX_LIMITS.activities,
    ),
    checkpoints: normalizeThreadSyncV2Limit(
      limits?.checkpoints,
      THREAD_SYNC_V2_DEFAULT_LIMITS.checkpoints,
      THREAD_SYNC_V2_MAX_LIMITS.checkpoints,
    ),
  };
}

function activityCursorFromRawRow(
  row: Schema.Schema.Type<typeof ProjectionThreadActivityRawDbRowSchema>,
): OrchestrationActivityCursor {
  return {
    activityId: row.activityId,
    createdAt: row.createdAt,
    sequence: row.sequence,
  };
}

function mapMessageRow(
  row: Schema.Schema.Type<typeof ProjectionThreadMessageDbRowSchema>,
): OrchestrationMessage {
  const message = {
    id: row.messageId,
    role: row.role,
    text: row.text,
    turnId: row.turnId,
    streaming: row.isStreaming === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.attachments !== null) {
    return Object.assign(message, { attachments: row.attachments });
  }
  return message;
}

function mapCheckpointRow(
  row: Schema.Schema.Type<typeof ProjectionCheckpointDbRowSchema>,
): OrchestrationCheckpointSummary {
  return {
    turnId: row.turnId,
    checkpointTurnCount: row.checkpointTurnCount,
    checkpointRef: row.checkpointRef,
    status: row.status,
    files: row.files,
    assistantMessageId: row.assistantMessageId,
    completedAt: row.completedAt,
  };
}

function mapActivityRow(
  row:
    | Schema.Schema.Type<typeof ProjectionThreadActivityDbRowSchema>
    | Schema.Schema.Type<typeof ProjectionThreadActivityRawDbRowSchema>,
  payload: unknown,
): OrchestrationThreadActivity {
  const activity = {
    id: row.activityId,
    tone: row.tone,
    kind: row.kind,
    summary: row.summary,
    payload,
    turnId: row.turnId,
    createdAt: row.createdAt,
  };
  if (row.sequence !== null) {
    return Object.assign(activity, { sequence: row.sequence });
  }
  return activity;
}

interface ThreadSyncV2ActivityMapping {
  readonly activity: OrchestrationThreadActivity;
  readonly cursor: OrchestrationActivityCursor;
  readonly deferredActivityPayloads: number;
  readonly payloadBytes: number;
}

function estimatedSerializedBytes(value: unknown): number {
  return utf8ByteLength(JSON.stringify(value) ?? "null");
}

function estimatedSerializedBytesWithEstimate(value: object): number {
  let estimate = 0;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    estimate = estimatedSerializedBytes({ ...value, estimatedSerializedBytes: estimate });
  }
  return estimate;
}

function makeBoundedChronologicalPage<T, C>(input: {
  readonly items: ReadonlyArray<T>;
  readonly hasMoreBefore: boolean;
  readonly cursor: (item: T) => C;
  readonly operation: string;
  readonly threadId: ThreadId;
}): Effect.Effect<
  {
    readonly items: ReadonlyArray<T>;
    readonly startCursor: C | null;
    readonly hasMoreBefore: boolean;
    readonly estimatedSerializedBytes: number;
  },
  ProjectionRepositoryError
> {
  let items = input.items;
  let hasMoreBefore = input.hasMoreBefore;

  while (true) {
    const resultWithoutBytes = {
      items,
      startCursor: items[0] === undefined ? null : input.cursor(items[0]),
      hasMoreBefore,
    };
    const responseBytes = estimatedSerializedBytesWithEstimate(resultWithoutBytes);
    if (responseBytes <= THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES) {
      return Effect.succeed({
        ...resultWithoutBytes,
        estimatedSerializedBytes: responseBytes,
      });
    }
    if (items.length <= 1) {
      return Effect.fail(
        new PersistenceDecodeError({
          operation: input.operation,
          issue: `Single page item exceeds ${THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES} bytes`,
          correlation: { threadId: input.threadId },
        }),
      );
    }
    items = items.slice(1);
    hasMoreBefore = true;
  }
}

function takeLimitedRows<T>(
  rows: ReadonlyArray<T>,
  limit: number,
  options?: { readonly reverse?: boolean },
): {
  readonly rows: ReadonlyArray<T>;
  readonly hasMore: boolean;
} {
  const hasMore = rows.length > limit;
  const limitedRows = rows.slice(0, limit);
  return {
    rows: options?.reverse === true ? limitedRows.toReversed() : limitedRows,
    hasMore,
  };
}

function decodeThreadSyncV2ActivityRow(
  row: Schema.Schema.Type<typeof ProjectionThreadActivityRawDbRowSchema>,
): Effect.Effect<ThreadSyncV2ActivityMapping, ProjectionRepositoryError> {
  const payloadBytes = row.payloadByteLength;
  const cursor = activityCursorFromRawRow(row);
  if (row.payloadJson === null || payloadBytes > THREAD_SYNC_V2_INLINE_ACTIVITY_PAYLOAD_BYTES) {
    return Effect.succeed({
      activity: mapActivityRow(row, {
        __t3Deferred: "thread-activity-payload",
        byteLength: payloadBytes,
      }),
      cursor,
      deferredActivityPayloads: 1,
      payloadBytes,
    });
  }

  return decodeRawActivityPayloadJson(row.payloadJson).pipe(
    Effect.map((payload) => ({
      activity: mapActivityRow(row, payload),
      cursor,
      deferredActivityPayloads: 0,
      payloadBytes,
    })),
    Effect.mapError(
      toPersistenceDecodeError("ProjectionSnapshotQuery.threadSyncV2:decodeActivityPayload"),
    ),
  );
}

function takeBoundedHydrateActivityIds(activityIds: ReadonlyArray<EventId>): {
  readonly requestedActivityIds: ReadonlyArray<EventId>;
  readonly overflowActivityIds: ReadonlyArray<EventId>;
} {
  const seen = new Set<EventId>();
  const requestedActivityIds: EventId[] = [];
  const overflowActivityIds: EventId[] = [];
  const maxSeen =
    THREAD_SYNC_V2_MAX_HYDRATE_ACTIVITY_IDS + THREAD_SYNC_V2_MAX_HYDRATE_OVERFLOW_OMISSIONS;

  for (const activityId of activityIds) {
    if (seen.has(activityId)) {
      continue;
    }
    seen.add(activityId);
    if (requestedActivityIds.length < THREAD_SYNC_V2_MAX_HYDRATE_ACTIVITY_IDS) {
      requestedActivityIds.push(activityId);
    } else if (overflowActivityIds.length < THREAD_SYNC_V2_MAX_HYDRATE_OVERFLOW_OMISSIONS) {
      overflowActivityIds.push(activityId);
    }
    if (seen.size >= maxSeen) {
      break;
    }
  }

  return {
    requestedActivityIds,
    overflowActivityIds,
  };
}

function maxIso(left: string | null, right: string): string {
  if (left === null) {
    return right;
  }
  return left > right ? left : right;
}

function computeSnapshotSequence(
  stateRows: ReadonlyArray<Schema.Schema.Type<typeof ProjectionStateDbRowSchema>>,
): number {
  if (stateRows.length === 0) {
    return 0;
  }
  const sequenceByProjector = new Map(
    stateRows.map((row) => [row.projector, row.lastAppliedSequence] as const),
  );

  let minSequence = Number.POSITIVE_INFINITY;
  for (const projector of REQUIRED_SNAPSHOT_PROJECTORS) {
    const sequence = sequenceByProjector.get(projector);
    if (sequence === undefined) {
      return 0;
    }
    if (sequence < minSequence) {
      minSequence = sequence;
    }
  }

  return Number.isFinite(minSequence) ? minSequence : 0;
}

function mapLatestTurn(
  row: Schema.Schema.Type<typeof ProjectionLatestTurnDbRowSchema>,
): OrchestrationLatestTurn {
  return {
    turnId: row.turnId,
    state:
      row.state === "error"
        ? "error"
        : row.state === "interrupted"
          ? "interrupted"
          : row.state === "completed"
            ? "completed"
            : "running",
    requestedAt: row.requestedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    assistantMessageId: row.assistantMessageId,
    ...(row.sourceProposedPlanThreadId !== null && row.sourceProposedPlanId !== null
      ? {
          sourceProposedPlan: {
            threadId: row.sourceProposedPlanThreadId,
            planId: row.sourceProposedPlanId,
          },
        }
      : {}),
  };
}

function mapSessionRow(
  row: Schema.Schema.Type<typeof ProjectionThreadSessionDbRowSchema>,
): OrchestrationSession {
  return {
    threadId: row.threadId,
    status: row.status,
    providerName: row.providerName,
    ...(row.providerInstanceId !== null ? { providerInstanceId: row.providerInstanceId } : {}),
    runtimeMode: row.runtimeMode,
    activeTurnId: row.activeTurnId,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}

function mapProjectShellRow(
  row: Schema.Schema.Type<typeof ProjectionProjectDbRowSchema>,
  repositoryIdentity: OrchestrationProject["repositoryIdentity"],
): OrchestrationProjectShell {
  return {
    id: row.projectId,
    title: row.title,
    workspaceRoot: row.workspaceRoot,
    repositoryIdentity,
    defaultModelSelection: row.defaultModelSelection,
    scripts: row.scripts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapProposedPlanRow(
  row: Schema.Schema.Type<typeof ProjectionThreadProposedPlanDbRowSchema>,
): OrchestrationProposedPlan {
  return {
    id: row.planId,
    turnId: row.turnId,
    planMarkdown: row.planMarkdown,
    implementedAt: row.implementedAt,
    implementationThreadId: row.implementationThreadId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function makeDeferredThreadContent(
  kind: "message-text" | "proposed-plan-markdown",
  content: string,
) {
  return {
    __t3Deferred: "thread-content" as const,
    kind,
    byteLength: utf8ByteLength(content),
    characterLength: content.length,
  };
}

function mapThreadSyncV2MessageRow(
  row: Schema.Schema.Type<typeof ProjectionThreadMessageDbRowSchema>,
) {
  const message = mapMessageRow(row);
  return estimatedSerializedBytes(message) > THREAD_SYNC_V2_MAX_INLINE_CONTENT_ITEM_BYTES
    ? { ...message, text: makeDeferredThreadContent("message-text", message.text) }
    : message;
}

function mapThreadSyncV2ProposedPlanRow(
  row: Schema.Schema.Type<typeof ProjectionThreadProposedPlanDbRowSchema>,
) {
  const proposedPlan = mapProposedPlanRow(row);
  return estimatedSerializedBytes(proposedPlan) > THREAD_SYNC_V2_MAX_INLINE_CONTENT_ITEM_BYTES
    ? {
        ...proposedPlan,
        planMarkdown: makeDeferredThreadContent(
          "proposed-plan-markdown",
          proposedPlan.planMarkdown,
        ),
      }
    : proposedPlan;
}

function deferredThreadContentCount(input: {
  readonly messages: ReadonlyArray<{ readonly text: unknown }>;
  readonly proposedPlans: ReadonlyArray<{ readonly planMarkdown: unknown }>;
}): number {
  return (
    input.messages.filter((message) => {
      const content = message.text;
      return (
        typeof content === "object" &&
        content !== null &&
        (content as { readonly __t3Deferred?: unknown }).__t3Deferred === "thread-content"
      );
    }).length +
    input.proposedPlans.filter((proposedPlan) => {
      const content = proposedPlan.planMarkdown;
      return (
        typeof content === "object" &&
        content !== null &&
        (content as { readonly __t3Deferred?: unknown }).__t3Deferred === "thread-content"
      );
    }).length
  );
}

function isUnsafeUtf16Boundary(content: string, offset: number): boolean {
  if (offset <= 0 || offset >= content.length) {
    return false;
  }
  const previous = content.charCodeAt(offset - 1);
  const current = content.charCodeAt(offset);
  return previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff;
}

function safeUtf16Boundary(content: string, offset: number): number {
  return isUnsafeUtf16Boundary(content, offset) ? offset - 1 : offset;
}

function findBoundedThreadContentChunkEnd(content: string, offset: number): number {
  let lower = offset;
  let upper = Math.min(
    content.length,
    offset + ORCHESTRATION_THREAD_SYNC_V2_MAX_CONTENT_CHUNK_BYTES,
  );
  upper = safeUtf16Boundary(content, upper);
  while (lower < upper) {
    const midpoint = safeUtf16Boundary(content, Math.ceil((lower + upper) / 2));
    if (midpoint <= lower) {
      break;
    }
    if (
      utf8ByteLength(content.slice(offset, midpoint)) <=
      ORCHESTRATION_THREAD_SYNC_V2_MAX_CONTENT_CHUNK_BYTES
    ) {
      lower = midpoint;
    } else {
      upper = midpoint - 1;
    }
  }
  return lower;
}

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown): ProjectionRepositoryError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeProjectionSnapshotQuery = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const repositoryIdentityResolver = yield* RepositoryIdentityResolver.RepositoryIdentityResolver;
  const repositoryIdentityResolutionConcurrency = 4;
  const resolveRepositoryIdentitiesForProjects = Effect.fn(
    "ProjectionSnapshotQuery.resolveRepositoryIdentitiesForProjects",
  )(function* (
    projectRows: ReadonlyArray<Schema.Schema.Type<typeof ProjectionProjectDbRowSchema>>,
    options?: {
      readonly includeDeleted?: boolean;
    },
  ) {
    const filteredProjectRows =
      options?.includeDeleted === true
        ? projectRows
        : projectRows.filter((row) => row.deletedAt === null);
    const uniqueWorkspaceRoots = [...new Set(filteredProjectRows.map((row) => row.workspaceRoot))];
    const repositoryIdentityByWorkspaceRoot = new Map(
      yield* Effect.forEach(
        uniqueWorkspaceRoots,
        (workspaceRoot) =>
          repositoryIdentityResolver
            .resolve(workspaceRoot)
            .pipe(Effect.map((identity) => [workspaceRoot, identity] as const)),
        { concurrency: repositoryIdentityResolutionConcurrency },
      ),
    );

    return new Map(
      filteredProjectRows.map((row) => [
        row.projectId,
        repositoryIdentityByWorkspaceRoot.get(row.workspaceRoot) ?? null,
      ]),
    );
  });

  const listProjectRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionProjectDbRowSchema,
    execute: () =>
      sql`
        SELECT
          project_id AS "projectId",
          title,
          workspace_root AS "workspaceRoot",
          default_model_selection_json AS "defaultModelSelection",
          scripts_json AS "scripts",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_projects
        ORDER BY created_at ASC, project_id ASC
      `,
  });

  const listThreadRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadDbRowSchema,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt",
          latest_user_message_at AS "latestUserMessageAt",
          pending_approval_count AS "pendingApprovalCount",
          pending_user_input_count AS "pendingUserInputCount",
          has_actionable_proposed_plan AS "hasActionableProposedPlan",
          active_plan_progress_json AS "activePlanProgress",
          latest_runtime_activity_at AS "latestRuntimeActivityAt",
          status_summary_updated_at AS "statusSummaryUpdatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        ORDER BY created_at ASC, thread_id ASC
      `,
  });

  const listActiveThreadRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadDbRowSchema,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt",
          latest_user_message_at AS "latestUserMessageAt",
          pending_approval_count AS "pendingApprovalCount",
          pending_user_input_count AS "pendingUserInputCount",
          has_actionable_proposed_plan AS "hasActionableProposedPlan",
          active_plan_progress_json AS "activePlanProgress",
          latest_runtime_activity_at AS "latestRuntimeActivityAt",
          status_summary_updated_at AS "statusSummaryUpdatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE deleted_at IS NULL
          AND archived_at IS NULL
        ORDER BY project_id ASC, created_at ASC, thread_id ASC
      `,
  });

  const listArchivedThreadRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadDbRowSchema,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt",
          latest_user_message_at AS "latestUserMessageAt",
          pending_approval_count AS "pendingApprovalCount",
          pending_user_input_count AS "pendingUserInputCount",
          has_actionable_proposed_plan AS "hasActionableProposedPlan",
          active_plan_progress_json AS "activePlanProgress",
          latest_runtime_activity_at AS "latestRuntimeActivityAt",
          status_summary_updated_at AS "statusSummaryUpdatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE deleted_at IS NULL
          AND archived_at IS NOT NULL
        ORDER BY project_id ASC, archived_at DESC, thread_id DESC
      `,
  });

  const listThreadMessageRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadMessageDbRowSchema,
    execute: () =>
      sql`
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          role,
          text,
          attachments_json AS "attachments",
          is_streaming AS "isStreaming",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_messages
        ORDER BY thread_id ASC, created_at ASC, message_id ASC
      `,
  });

  const listThreadProposedPlanRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadProposedPlanDbRowSchema,
    execute: () =>
      sql`
        SELECT
          plan_id AS "planId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          plan_markdown AS "planMarkdown",
          implemented_at AS "implementedAt",
          implementation_thread_id AS "implementationThreadId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_proposed_plans
        ORDER BY thread_id ASC, created_at ASC, plan_id ASC
      `,
  });

  const listThreadActivityRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadActivityDbRowSchema,
    execute: () =>
      sql`
        SELECT
          activity_id AS "activityId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          tone,
          kind,
          summary,
          payload_json AS "payload",
          sequence,
          created_at AS "createdAt"
        FROM projection_thread_activities
        ORDER BY
          thread_id ASC,
          sequence ASC,
          created_at ASC,
          activity_id ASC
      `,
  });

  const listThreadSessionRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadSessionDbRowSchema,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          status,
          provider_name AS "providerName",
          provider_instance_id AS "providerInstanceId",
          provider_session_id AS "providerSessionId",
          provider_thread_id AS "providerThreadId",
          runtime_mode AS "runtimeMode",
          active_turn_id AS "activeTurnId",
          last_error AS "lastError",
          updated_at AS "updatedAt"
        FROM projection_thread_sessions
        ORDER BY thread_id ASC
      `,
  });

  const listActiveThreadSessionRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadSessionDbRowSchema,
    execute: () =>
      sql`
        SELECT
          sessions.thread_id AS "threadId",
          sessions.status,
          sessions.provider_name AS "providerName",
          sessions.provider_instance_id AS "providerInstanceId",
          sessions.provider_session_id AS "providerSessionId",
          sessions.provider_thread_id AS "providerThreadId",
          sessions.runtime_mode AS "runtimeMode",
          sessions.active_turn_id AS "activeTurnId",
          sessions.last_error AS "lastError",
          sessions.updated_at AS "updatedAt"
        FROM projection_thread_sessions sessions
        INNER JOIN projection_threads threads
          ON threads.thread_id = sessions.thread_id
        WHERE threads.deleted_at IS NULL
          AND threads.archived_at IS NULL
        ORDER BY sessions.thread_id ASC
      `,
  });

  const listArchivedThreadSessionRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionThreadSessionDbRowSchema,
    execute: () =>
      sql`
        SELECT
          sessions.thread_id AS "threadId",
          sessions.status,
          sessions.provider_name AS "providerName",
          sessions.provider_instance_id AS "providerInstanceId",
          sessions.provider_session_id AS "providerSessionId",
          sessions.provider_thread_id AS "providerThreadId",
          sessions.runtime_mode AS "runtimeMode",
          sessions.active_turn_id AS "activeTurnId",
          sessions.last_error AS "lastError",
          sessions.updated_at AS "updatedAt"
        FROM projection_thread_sessions sessions
        INNER JOIN projection_threads threads
          ON threads.thread_id = sessions.thread_id
        WHERE threads.deleted_at IS NULL
          AND threads.archived_at IS NOT NULL
        ORDER BY sessions.thread_id ASC
      `,
  });

  const listCheckpointRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionCheckpointDbRowSchema,
    execute: () =>
      sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          checkpoint_turn_count AS "checkpointTurnCount",
          checkpoint_ref AS "checkpointRef",
          checkpoint_status AS "status",
          checkpoint_files_json AS "files",
          assistant_message_id AS "assistantMessageId",
          completed_at AS "completedAt"
        FROM projection_turns
        WHERE checkpoint_turn_count IS NOT NULL
        ORDER BY thread_id ASC, checkpoint_turn_count ASC
      `,
  });

  const listLatestTurnRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionLatestTurnDbRowSchema,
    execute: () =>
      sql`
        SELECT
          turns.thread_id AS "threadId",
          turns.turn_id AS "turnId",
          turns.state,
          turns.requested_at AS "requestedAt",
          turns.started_at AS "startedAt",
          turns.completed_at AS "completedAt",
          turns.assistant_message_id AS "assistantMessageId",
          turns.source_proposed_plan_thread_id AS "sourceProposedPlanThreadId",
          turns.source_proposed_plan_id AS "sourceProposedPlanId"
        FROM projection_threads threads
        JOIN projection_turns turns
          ON turns.thread_id = threads.thread_id
          AND turns.turn_id = threads.latest_turn_id
        WHERE threads.latest_turn_id IS NOT NULL
        ORDER BY turns.thread_id ASC
      `,
  });

  const listActiveLatestTurnRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionLatestTurnDbRowSchema,
    execute: () =>
      sql`
        SELECT
          turns.thread_id AS "threadId",
          turns.turn_id AS "turnId",
          turns.state,
          turns.requested_at AS "requestedAt",
          turns.started_at AS "startedAt",
          turns.completed_at AS "completedAt",
          turns.assistant_message_id AS "assistantMessageId",
          turns.source_proposed_plan_thread_id AS "sourceProposedPlanThreadId",
          turns.source_proposed_plan_id AS "sourceProposedPlanId"
        FROM projection_threads threads
        JOIN projection_turns turns
          ON turns.thread_id = threads.thread_id
          AND turns.turn_id = threads.latest_turn_id
        WHERE threads.deleted_at IS NULL
          AND threads.archived_at IS NULL
          AND threads.latest_turn_id IS NOT NULL
        ORDER BY turns.thread_id ASC
      `,
  });

  const listArchivedLatestTurnRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionLatestTurnDbRowSchema,
    execute: () =>
      sql`
        SELECT
          turns.thread_id AS "threadId",
          turns.turn_id AS "turnId",
          turns.state,
          turns.requested_at AS "requestedAt",
          turns.started_at AS "startedAt",
          turns.completed_at AS "completedAt",
          turns.assistant_message_id AS "assistantMessageId",
          turns.source_proposed_plan_thread_id AS "sourceProposedPlanThreadId",
          turns.source_proposed_plan_id AS "sourceProposedPlanId"
        FROM projection_threads threads
        JOIN projection_turns turns
          ON turns.thread_id = threads.thread_id
          AND turns.turn_id = threads.latest_turn_id
        WHERE threads.deleted_at IS NULL
          AND threads.archived_at IS NOT NULL
          AND threads.latest_turn_id IS NOT NULL
        ORDER BY turns.thread_id ASC
      `,
  });

  const listProjectionStateRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: ProjectionStateDbRowSchema,
    execute: () =>
      sql`
        SELECT
          projector,
          last_applied_sequence AS "lastAppliedSequence",
          updated_at AS "updatedAt"
        FROM projection_state
      `,
  });

  const readProjectionCounts = SqlSchema.findOne({
    Request: Schema.Void,
    Result: ProjectionCountsRowSchema,
    execute: () =>
      sql`
        SELECT
          (SELECT COUNT(*) FROM projection_projects) AS "projectCount",
          (SELECT COUNT(*) FROM projection_threads) AS "threadCount"
      `,
  });

  const getActiveProjectRowByWorkspaceRoot = SqlSchema.findOneOption({
    Request: WorkspaceRootLookupInput,
    Result: ProjectionProjectLookupRowSchema,
    execute: ({ workspaceRoot }) =>
      sql`
        SELECT
          project_id AS "projectId",
          title,
          workspace_root AS "workspaceRoot",
          default_model_selection_json AS "defaultModelSelection",
          scripts_json AS "scripts",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_projects
        WHERE workspace_root = ${workspaceRoot}
          AND deleted_at IS NULL
        ORDER BY created_at ASC, project_id ASC
        LIMIT 1
      `,
  });

  const getActiveProjectRowById = SqlSchema.findOneOption({
    Request: ProjectIdLookupInput,
    Result: ProjectionProjectLookupRowSchema,
    execute: ({ projectId }) =>
      sql`
        SELECT
          project_id AS "projectId",
          title,
          workspace_root AS "workspaceRoot",
          default_model_selection_json AS "defaultModelSelection",
          scripts_json AS "scripts",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          deleted_at AS "deletedAt"
        FROM projection_projects
        WHERE project_id = ${projectId}
          AND deleted_at IS NULL
        LIMIT 1
      `,
  });

  const getFirstActiveThreadIdByProject = SqlSchema.findOneOption({
    Request: ProjectIdLookupInput,
    Result: ProjectionThreadIdLookupRowSchema,
    execute: ({ projectId }) =>
      sql`
        SELECT
          thread_id AS "threadId"
        FROM projection_threads
        WHERE project_id = ${projectId}
          AND deleted_at IS NULL
          AND archived_at IS NULL
        ORDER BY created_at ASC, thread_id ASC
        LIMIT 1
      `,
  });

  const getThreadCheckpointContextThreadRow = SqlSchema.findOneOption({
    Request: ThreadIdLookupInput,
    Result: ProjectionThreadCheckpointContextThreadRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          threads.thread_id AS "threadId",
          threads.project_id AS "projectId",
          projects.workspace_root AS "workspaceRoot",
          threads.worktree_path AS "worktreePath"
        FROM projection_threads AS threads
        INNER JOIN projection_projects AS projects
          ON projects.project_id = threads.project_id
        WHERE threads.thread_id = ${threadId}
          AND threads.deleted_at IS NULL
        LIMIT 1
      `,
  });

  const getActiveThreadRowById = SqlSchema.findOneOption({
    Request: ThreadIdLookupInput,
    Result: ProjectionThreadDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt",
          latest_user_message_at AS "latestUserMessageAt",
          pending_approval_count AS "pendingApprovalCount",
          pending_user_input_count AS "pendingUserInputCount",
          has_actionable_proposed_plan AS "hasActionableProposedPlan",
          active_plan_progress_json AS "activePlanProgress",
          latest_runtime_activity_at AS "latestRuntimeActivityAt",
          status_summary_updated_at AS "statusSummaryUpdatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE thread_id = ${threadId}
          AND deleted_at IS NULL
          AND archived_at IS NULL
        LIMIT 1
      `,
  });

  const getNonDeletedThreadRowById = SqlSchema.findOneOption({
    Request: ThreadIdLookupInput,
    Result: ProjectionThreadDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          project_id AS "projectId",
          title,
          model_selection_json AS "modelSelection",
          runtime_mode AS "runtimeMode",
          interaction_mode AS "interactionMode",
          branch,
          worktree_path AS "worktreePath",
          latest_turn_id AS "latestTurnId",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          archived_at AS "archivedAt",
          latest_user_message_at AS "latestUserMessageAt",
          pending_approval_count AS "pendingApprovalCount",
          pending_user_input_count AS "pendingUserInputCount",
          has_actionable_proposed_plan AS "hasActionableProposedPlan",
          active_plan_progress_json AS "activePlanProgress",
          latest_runtime_activity_at AS "latestRuntimeActivityAt",
          status_summary_updated_at AS "statusSummaryUpdatedAt",
          deleted_at AS "deletedAt"
        FROM projection_threads
        WHERE thread_id = ${threadId}
          AND deleted_at IS NULL
        LIMIT 1
      `,
  });

  const listThreadMessageRowsByThread = SqlSchema.findAll({
    Request: ThreadIdLookupInput,
    Result: ProjectionThreadMessageDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          role,
          text,
          attachments_json AS "attachments",
          is_streaming AS "isStreaming",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_messages
        WHERE thread_id = ${threadId}
        ORDER BY created_at ASC, message_id ASC
      `,
  });

  const listTailThreadMessageRowsByThread = SqlSchema.findAll({
    Request: ThreadLimitLookupInput,
    Result: ProjectionThreadMessageDbRowSchema,
    execute: ({ threadId, limit }) =>
      sql`
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          role,
          text,
          attachments_json AS "attachments",
          is_streaming AS "isStreaming",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_messages
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_messages.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        ORDER BY created_at DESC, message_id DESC
        LIMIT ${limit}
      `,
  });

  const listThreadMessageRowsBeforeCursor = SqlSchema.findAll({
    Request: ThreadMessageCursorLookupInput,
    Result: ProjectionThreadMessageDbRowSchema,
    execute: ({ threadId, limit, cursorCreatedAt, cursorMessageId }) =>
      sql`
        SELECT
          message_id AS "messageId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          role,
          text,
          attachments_json AS "attachments",
          is_streaming AS "isStreaming",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_messages
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_messages.thread_id
              AND projection_threads.deleted_at IS NULL
          )
          AND (
            created_at < ${cursorCreatedAt}
            OR (created_at = ${cursorCreatedAt} AND message_id < ${cursorMessageId})
          )
        ORDER BY created_at DESC, message_id DESC
        LIMIT ${limit}
      `,
  });

  const getThreadMessageContentRowById = SqlSchema.findOneOption({
    Request: ThreadMessageContentLookupInput,
    Result: ProjectionThreadContentDbRowSchema,
    execute: ({ threadId, messageId }) =>
      sql`
        SELECT
          text AS "content",
          updated_at AS "contentVersion"
        FROM projection_thread_messages
        WHERE thread_id = ${threadId}
          AND message_id = ${messageId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_messages.thread_id
              AND projection_threads.deleted_at IS NULL
          )
      `,
  });

  const listThreadProposedPlanRowsByThread = SqlSchema.findAll({
    Request: ThreadIdLookupInput,
    Result: ProjectionThreadProposedPlanDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          plan_id AS "planId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          plan_markdown AS "planMarkdown",
          implemented_at AS "implementedAt",
          implementation_thread_id AS "implementationThreadId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_proposed_plans
        WHERE thread_id = ${threadId}
        ORDER BY created_at ASC, plan_id ASC
      `,
  });

  const listTailThreadProposedPlanRowsByThread = SqlSchema.findAll({
    Request: ThreadLimitLookupInput,
    Result: ProjectionThreadProposedPlanDbRowSchema,
    execute: ({ threadId, limit }) =>
      sql`
        SELECT
          plan_id AS "planId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          plan_markdown AS "planMarkdown",
          implemented_at AS "implementedAt",
          implementation_thread_id AS "implementationThreadId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_proposed_plans
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_proposed_plans.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        ORDER BY created_at DESC, plan_id DESC
        LIMIT ${limit}
      `,
  });

  const listThreadProposedPlanRowsBeforeCursor = SqlSchema.findAll({
    Request: ThreadProposedPlanCursorLookupInput,
    Result: ProjectionThreadProposedPlanDbRowSchema,
    execute: ({ threadId, limit, cursorCreatedAt, cursorPlanId }) =>
      sql`
        SELECT
          plan_id AS "planId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          plan_markdown AS "planMarkdown",
          implemented_at AS "implementedAt",
          implementation_thread_id AS "implementationThreadId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM projection_thread_proposed_plans
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_proposed_plans.thread_id
              AND projection_threads.deleted_at IS NULL
          )
          AND (
            created_at < ${cursorCreatedAt}
            OR (created_at = ${cursorCreatedAt} AND plan_id < ${cursorPlanId})
          )
        ORDER BY created_at DESC, plan_id DESC
        LIMIT ${limit}
      `,
  });

  const getThreadProposedPlanContentRowById = SqlSchema.findOneOption({
    Request: ThreadProposedPlanContentLookupInput,
    Result: ProjectionThreadContentDbRowSchema,
    execute: ({ threadId, planId }) =>
      sql`
        SELECT
          plan_markdown AS "content",
          updated_at AS "contentVersion"
        FROM projection_thread_proposed_plans
        WHERE thread_id = ${threadId}
          AND plan_id = ${planId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_proposed_plans.thread_id
              AND projection_threads.deleted_at IS NULL
          )
      `,
  });

  const listThreadActivityRowsByThread = SqlSchema.findAll({
    Request: ThreadIdLookupInput,
    Result: ProjectionThreadActivityDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          activity_id AS "activityId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          tone,
          kind,
          summary,
          payload_json AS "payload",
          sequence,
          created_at AS "createdAt"
        FROM projection_thread_activities
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_activities.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        ORDER BY
          sequence ASC,
          created_at ASC,
          activity_id ASC
      `,
  });

  const listTailThreadActivityRawRowsByThread = SqlSchema.findAll({
    Request: ThreadLimitLookupInput,
    Result: ProjectionThreadActivityRawDbRowSchema,
    execute: ({ threadId, limit }) =>
      sql`
        SELECT
          activity_id AS "activityId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          tone,
          kind,
          summary,
          CASE
            WHEN length(CAST(payload_json AS BLOB)) <= ${THREAD_SYNC_V2_INLINE_ACTIVITY_PAYLOAD_BYTES}
              THEN payload_json
            ELSE NULL
          END AS "payloadJson",
          length(CAST(payload_json AS BLOB)) AS "payloadByteLength",
          sequence,
          created_at AS "createdAt"
        FROM projection_thread_activities
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_activities.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        ORDER BY
          sequence DESC,
          created_at DESC,
          activity_id DESC
        LIMIT ${limit}
      `,
  });

  const listThreadActivityRawRowsBeforeCursor = SqlSchema.findAll({
    Request: ThreadActivityCursorLookupInput,
    Result: ProjectionThreadActivityRawDbRowSchema,
    execute: ({ threadId, limit, cursorSequence, cursorCreatedAt, cursorActivityId }) =>
      sql`
        SELECT
          activity_id AS "activityId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          tone,
          kind,
          summary,
          CASE
            WHEN length(CAST(payload_json AS BLOB)) <= ${THREAD_SYNC_V2_INLINE_ACTIVITY_PAYLOAD_BYTES}
              THEN payload_json
            ELSE NULL
          END AS "payloadJson",
          length(CAST(payload_json AS BLOB)) AS "payloadByteLength",
          sequence,
          created_at AS "createdAt"
        FROM projection_thread_activities
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_activities.thread_id
              AND projection_threads.deleted_at IS NULL
          )
          AND (
            (
              ${cursorSequence} IS NULL
              AND sequence IS NULL
              AND (
                created_at < ${cursorCreatedAt}
                OR (created_at = ${cursorCreatedAt} AND activity_id < ${cursorActivityId})
              )
            )
            OR (
              ${cursorSequence} IS NOT NULL
              AND (
                sequence IS NULL
                OR sequence < ${cursorSequence}
                OR (
                  sequence = ${cursorSequence}
                  AND created_at < ${cursorCreatedAt}
                )
                OR (
                  sequence = ${cursorSequence}
                  AND created_at = ${cursorCreatedAt}
                  AND activity_id < ${cursorActivityId}
                )
              )
            )
          )
        ORDER BY
          sequence DESC,
          created_at DESC,
          activity_id DESC
        LIMIT ${limit}
      `,
  });

  const listThreadActivityRawRowsAfterCursor = SqlSchema.findAll({
    Request: ThreadActivityCursorLookupInput,
    Result: ProjectionThreadActivityRawDbRowSchema,
    execute: ({ threadId, limit, cursorSequence, cursorCreatedAt, cursorActivityId }) =>
      sql`
        SELECT
          activity_id AS "activityId",
          thread_id AS "threadId",
          turn_id AS "turnId",
          tone,
          kind,
          summary,
          CASE
            WHEN length(CAST(payload_json AS BLOB)) <= ${THREAD_SYNC_V2_INLINE_ACTIVITY_PAYLOAD_BYTES}
              THEN payload_json
            ELSE NULL
          END AS "payloadJson",
          length(CAST(payload_json AS BLOB)) AS "payloadByteLength",
          sequence,
          created_at AS "createdAt"
        FROM projection_thread_activities
        WHERE thread_id = ${threadId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_activities.thread_id
              AND projection_threads.deleted_at IS NULL
          )
          AND (
            (
              ${cursorSequence} IS NULL
              AND (
                sequence IS NOT NULL
                OR (
                  sequence IS NULL
                  AND (
                    created_at > ${cursorCreatedAt}
                    OR (created_at = ${cursorCreatedAt} AND activity_id > ${cursorActivityId})
                  )
                )
              )
            )
            OR (
              ${cursorSequence} IS NOT NULL
              AND (
                sequence > ${cursorSequence}
                OR (
                  sequence = ${cursorSequence}
                  AND created_at > ${cursorCreatedAt}
                )
                OR (
                  sequence = ${cursorSequence}
                  AND created_at = ${cursorCreatedAt}
                  AND activity_id > ${cursorActivityId}
                )
              )
            )
          )
        ORDER BY
          sequence ASC,
          created_at ASC,
          activity_id ASC
        LIMIT ${limit}
      `,
  });

  const getThreadActivityPayloadMetadataRowById = SqlSchema.findOneOption({
    Request: ThreadActivityIdLookupInput,
    Result: ProjectionThreadActivityPayloadMetadataDbRowSchema,
    execute: ({ threadId, activityId }) =>
      sql`
        SELECT
          activity_id AS "activityId",
          length(CAST(payload_json AS BLOB)) AS "payloadByteLength"
        FROM projection_thread_activities
        WHERE thread_id = ${threadId}
          AND activity_id = ${activityId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_activities.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        LIMIT 1
      `,
  });

  const getThreadActivityPayloadJsonRowById = SqlSchema.findOneOption({
    Request: ThreadActivityIdLookupInput,
    Result: ProjectionThreadActivityPayloadJsonDbRowSchema,
    execute: ({ threadId, activityId }) =>
      sql`
        SELECT
          activity_id AS "activityId",
          payload_json AS "payloadJson"
        FROM projection_thread_activities
        WHERE thread_id = ${threadId}
          AND activity_id = ${activityId}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_thread_activities.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        LIMIT 1
      `,
  });

  const getThreadSessionRowByThread = SqlSchema.findOneOption({
    Request: ThreadIdLookupInput,
    Result: ProjectionThreadSessionDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          status,
          provider_name AS "providerName",
          provider_instance_id AS "providerInstanceId",
          runtime_mode AS "runtimeMode",
          active_turn_id AS "activeTurnId",
          last_error AS "lastError",
          updated_at AS "updatedAt"
        FROM projection_thread_sessions
        WHERE thread_id = ${threadId}
        LIMIT 1
      `,
  });

  const getLatestTurnRowByThread = SqlSchema.findOneOption({
    Request: ThreadIdLookupInput,
    Result: ProjectionLatestTurnDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          turns.thread_id AS "threadId",
          turns.turn_id AS "turnId",
          turns.state,
          turns.requested_at AS "requestedAt",
          turns.started_at AS "startedAt",
          turns.completed_at AS "completedAt",
          turns.assistant_message_id AS "assistantMessageId",
          turns.source_proposed_plan_thread_id AS "sourceProposedPlanThreadId",
          turns.source_proposed_plan_id AS "sourceProposedPlanId"
        FROM projection_threads threads
        JOIN projection_turns turns
          ON turns.thread_id = threads.thread_id
          AND turns.turn_id = threads.latest_turn_id
        WHERE threads.thread_id = ${threadId}
          AND threads.deleted_at IS NULL
          AND threads.archived_at IS NULL
        LIMIT 1
      `,
  });

  const getLatestTurnRowByNonDeletedThread = SqlSchema.findOneOption({
    Request: ThreadIdLookupInput,
    Result: ProjectionLatestTurnDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          turns.thread_id AS "threadId",
          turns.turn_id AS "turnId",
          turns.state,
          turns.requested_at AS "requestedAt",
          turns.started_at AS "startedAt",
          turns.completed_at AS "completedAt",
          turns.assistant_message_id AS "assistantMessageId",
          turns.source_proposed_plan_thread_id AS "sourceProposedPlanThreadId",
          turns.source_proposed_plan_id AS "sourceProposedPlanId"
        FROM projection_threads threads
        JOIN projection_turns turns
          ON turns.thread_id = threads.thread_id
          AND turns.turn_id = threads.latest_turn_id
        WHERE threads.thread_id = ${threadId}
          AND threads.deleted_at IS NULL
        LIMIT 1
      `,
  });

  const listCheckpointRowsByThread = SqlSchema.findAll({
    Request: ThreadIdLookupInput,
    Result: ProjectionCheckpointDbRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          checkpoint_turn_count AS "checkpointTurnCount",
          checkpoint_ref AS "checkpointRef",
          checkpoint_status AS "status",
          checkpoint_files_json AS "files",
          assistant_message_id AS "assistantMessageId",
          completed_at AS "completedAt"
        FROM projection_turns
        WHERE thread_id = ${threadId}
          AND checkpoint_turn_count IS NOT NULL
        ORDER BY checkpoint_turn_count ASC
      `,
  });

  const listTailCheckpointRowsByThread = SqlSchema.findAll({
    Request: ThreadLimitLookupInput,
    Result: ProjectionCheckpointDbRowSchema,
    execute: ({ threadId, limit }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          checkpoint_turn_count AS "checkpointTurnCount",
          checkpoint_ref AS "checkpointRef",
          checkpoint_status AS "status",
          checkpoint_files_json AS "files",
          assistant_message_id AS "assistantMessageId",
          completed_at AS "completedAt"
        FROM projection_turns
        WHERE thread_id = ${threadId}
          AND checkpoint_turn_count IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_turns.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        ORDER BY checkpoint_turn_count DESC
        LIMIT ${limit}
      `,
  });

  const listCheckpointRowsBeforeCursor = SqlSchema.findAll({
    Request: ThreadCheckpointCursorLookupInput,
    Result: ProjectionCheckpointDbRowSchema,
    execute: ({ threadId, limit, cursorCheckpointTurnCount }) =>
      sql`
        SELECT
          thread_id AS "threadId",
          turn_id AS "turnId",
          checkpoint_turn_count AS "checkpointTurnCount",
          checkpoint_ref AS "checkpointRef",
          checkpoint_status AS "status",
          checkpoint_files_json AS "files",
          assistant_message_id AS "assistantMessageId",
          completed_at AS "completedAt"
        FROM projection_turns
        WHERE thread_id = ${threadId}
          AND checkpoint_turn_count IS NOT NULL
          AND checkpoint_turn_count < ${cursorCheckpointTurnCount}
          AND EXISTS (
            SELECT 1
            FROM projection_threads
            WHERE projection_threads.thread_id = projection_turns.thread_id
              AND projection_threads.deleted_at IS NULL
          )
        ORDER BY checkpoint_turn_count DESC
        LIMIT ${limit}
      `,
  });

  const getFullThreadDiffContextRow = SqlSchema.findOneOption({
    Request: FullThreadDiffContextLookupInput,
    Result: ProjectionFullThreadDiffContextRowSchema,
    execute: ({ threadId, checkpointTurnCount }) =>
      sql`
        SELECT
          threads.thread_id AS "threadId",
          threads.project_id AS "projectId",
          projects.workspace_root AS "workspaceRoot",
          threads.worktree_path AS "worktreePath",
          (
            SELECT MAX(turns.checkpoint_turn_count)
            FROM projection_turns AS turns
            WHERE turns.thread_id = threads.thread_id
              AND turns.checkpoint_turn_count IS NOT NULL
          ) AS "latestCheckpointTurnCount",
          (
            SELECT turns.checkpoint_ref
            FROM projection_turns AS turns
            WHERE turns.thread_id = threads.thread_id
              AND turns.checkpoint_turn_count = ${checkpointTurnCount}
            LIMIT 1
          ) AS "toCheckpointRef"
        FROM projection_threads AS threads
        INNER JOIN projection_projects AS projects
          ON projects.project_id = threads.project_id
        WHERE threads.thread_id = ${threadId}
          AND threads.deleted_at IS NULL
        LIMIT 1
      `,
  });

  const getSnapshot: ProjectionSnapshotQueryShape["getSnapshot"] = () =>
    sql
      .withTransaction(
        Effect.all([
          listProjectRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listProjects:query",
                "ProjectionSnapshotQuery.getSnapshot:listProjects:decodeRows",
              ),
            ),
          ),
          listThreadRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listThreads:query",
                "ProjectionSnapshotQuery.getSnapshot:listThreads:decodeRows",
              ),
            ),
          ),
          listThreadMessageRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listThreadMessages:query",
                "ProjectionSnapshotQuery.getSnapshot:listThreadMessages:decodeRows",
              ),
            ),
          ),
          listThreadProposedPlanRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listThreadProposedPlans:query",
                "ProjectionSnapshotQuery.getSnapshot:listThreadProposedPlans:decodeRows",
              ),
            ),
          ),
          listThreadActivityRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listThreadActivities:query",
                "ProjectionSnapshotQuery.getSnapshot:listThreadActivities:decodeRows",
              ),
            ),
          ),
          listThreadSessionRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listThreadSessions:query",
                "ProjectionSnapshotQuery.getSnapshot:listThreadSessions:decodeRows",
              ),
            ),
          ),
          listCheckpointRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listCheckpoints:query",
                "ProjectionSnapshotQuery.getSnapshot:listCheckpoints:decodeRows",
              ),
            ),
          ),
          listLatestTurnRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listLatestTurns:query",
                "ProjectionSnapshotQuery.getSnapshot:listLatestTurns:decodeRows",
              ),
            ),
          ),
          listProjectionStateRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getSnapshot:listProjectionState:query",
                "ProjectionSnapshotQuery.getSnapshot:listProjectionState:decodeRows",
              ),
            ),
          ),
        ]),
      )
      .pipe(
        Effect.flatMap(
          ([
            projectRows,
            threadRows,
            messageRows,
            proposedPlanRows,
            activityRows,
            sessionRows,
            checkpointRows,
            latestTurnRows,
            stateRows,
          ]) =>
            Effect.gen(function* () {
              const messagesByThread = new Map<string, Array<OrchestrationMessage>>();
              const proposedPlansByThread = new Map<string, Array<OrchestrationProposedPlan>>();
              const activitiesByThread = new Map<string, Array<OrchestrationThreadActivity>>();
              const checkpointsByThread = new Map<string, Array<OrchestrationCheckpointSummary>>();
              const sessionsByThread = new Map<string, OrchestrationSession>();
              const latestTurnByThread = new Map<string, OrchestrationLatestTurn>();

              let updatedAt: string | null = null;

              for (const row of projectRows) {
                updatedAt = maxIso(updatedAt, row.updatedAt);
              }
              for (const row of threadRows) {
                updatedAt = maxIso(updatedAt, row.updatedAt);
              }
              for (const row of stateRows) {
                updatedAt = maxIso(updatedAt, row.updatedAt);
              }

              for (const row of messageRows) {
                updatedAt = maxIso(updatedAt, row.updatedAt);
                const threadMessages = messagesByThread.get(row.threadId) ?? [];
                threadMessages.push({
                  id: row.messageId,
                  role: row.role,
                  text: row.text,
                  ...(row.attachments !== null ? { attachments: row.attachments } : {}),
                  turnId: row.turnId,
                  streaming: row.isStreaming === 1,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt,
                });
                messagesByThread.set(row.threadId, threadMessages);
              }

              for (const row of proposedPlanRows) {
                updatedAt = maxIso(updatedAt, row.updatedAt);
                const threadProposedPlans = proposedPlansByThread.get(row.threadId) ?? [];
                threadProposedPlans.push({
                  id: row.planId,
                  turnId: row.turnId,
                  planMarkdown: row.planMarkdown,
                  implementedAt: row.implementedAt,
                  implementationThreadId: row.implementationThreadId,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt,
                });
                proposedPlansByThread.set(row.threadId, threadProposedPlans);
              }

              for (const row of activityRows) {
                updatedAt = maxIso(updatedAt, row.createdAt);
                const threadActivities = activitiesByThread.get(row.threadId) ?? [];
                threadActivities.push({
                  id: row.activityId,
                  tone: row.tone,
                  kind: row.kind,
                  summary: row.summary,
                  payload: row.payload,
                  turnId: row.turnId,
                  ...(row.sequence !== null ? { sequence: row.sequence } : {}),
                  createdAt: row.createdAt,
                });
                activitiesByThread.set(row.threadId, threadActivities);
              }

              for (const row of checkpointRows) {
                updatedAt = maxIso(updatedAt, row.completedAt);
                const threadCheckpoints = checkpointsByThread.get(row.threadId) ?? [];
                threadCheckpoints.push({
                  turnId: row.turnId,
                  checkpointTurnCount: row.checkpointTurnCount,
                  checkpointRef: row.checkpointRef,
                  status: row.status,
                  files: row.files,
                  assistantMessageId: row.assistantMessageId,
                  completedAt: row.completedAt,
                });
                checkpointsByThread.set(row.threadId, threadCheckpoints);
              }

              for (const row of latestTurnRows) {
                updatedAt = maxIso(updatedAt, row.requestedAt);
                if (row.startedAt !== null) {
                  updatedAt = maxIso(updatedAt, row.startedAt);
                }
                if (row.completedAt !== null) {
                  updatedAt = maxIso(updatedAt, row.completedAt);
                }
                if (latestTurnByThread.has(row.threadId)) {
                  continue;
                }
                latestTurnByThread.set(row.threadId, {
                  turnId: row.turnId,
                  state:
                    row.state === "error"
                      ? "error"
                      : row.state === "interrupted"
                        ? "interrupted"
                        : row.state === "completed"
                          ? "completed"
                          : "running",
                  requestedAt: row.requestedAt,
                  startedAt: row.startedAt,
                  completedAt: row.completedAt,
                  assistantMessageId: row.assistantMessageId,
                  ...(row.sourceProposedPlanThreadId !== null && row.sourceProposedPlanId !== null
                    ? {
                        sourceProposedPlan: {
                          threadId: row.sourceProposedPlanThreadId,
                          planId: row.sourceProposedPlanId,
                        },
                      }
                    : {}),
                });
              }

              for (const row of sessionRows) {
                updatedAt = maxIso(updatedAt, row.updatedAt);
                sessionsByThread.set(row.threadId, {
                  threadId: row.threadId,
                  status: row.status,
                  providerName: row.providerName,
                  ...(row.providerInstanceId !== null
                    ? { providerInstanceId: row.providerInstanceId }
                    : {}),
                  runtimeMode: row.runtimeMode,
                  activeTurnId: row.activeTurnId,
                  lastError: row.lastError,
                  updatedAt: row.updatedAt,
                });
              }

              const repositoryIdentities = yield* resolveRepositoryIdentitiesForProjects(
                projectRows,
                { includeDeleted: true },
              );

              const projects: ReadonlyArray<OrchestrationProject> = projectRows.map((row) => ({
                id: row.projectId,
                title: row.title,
                workspaceRoot: row.workspaceRoot,
                repositoryIdentity: repositoryIdentities.get(row.projectId) ?? null,
                defaultModelSelection: row.defaultModelSelection,
                scripts: row.scripts,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                deletedAt: row.deletedAt,
              }));

              const threads: ReadonlyArray<OrchestrationThread> = threadRows.map((row) => ({
                id: row.threadId,
                projectId: row.projectId,
                title: row.title,
                modelSelection: row.modelSelection,
                runtimeMode: row.runtimeMode,
                interactionMode: row.interactionMode,
                branch: row.branch,
                worktreePath: row.worktreePath,
                latestTurn: latestTurnByThread.get(row.threadId) ?? null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                archivedAt: row.archivedAt,
                deletedAt: row.deletedAt,
                messages: messagesByThread.get(row.threadId) ?? [],
                proposedPlans: proposedPlansByThread.get(row.threadId) ?? [],
                activities: activitiesByThread.get(row.threadId) ?? [],
                checkpoints: checkpointsByThread.get(row.threadId) ?? [],
                session: sessionsByThread.get(row.threadId) ?? null,
              }));

              const snapshot = {
                snapshotSequence: computeSnapshotSequence(stateRows),
                projects,
                threads,
                updatedAt: updatedAt ?? "1970-01-01T00:00:00.000Z",
              };

              return yield* decodeReadModel(snapshot).pipe(
                Effect.mapError(
                  toPersistenceDecodeError("ProjectionSnapshotQuery.getSnapshot:decodeReadModel"),
                ),
              );
            }),
        ),
        Effect.mapError((error) => {
          if (isPersistenceError(error)) {
            return error;
          }
          return toPersistenceSqlError("ProjectionSnapshotQuery.getSnapshot:query")(error);
        }),
      );

  const getCommandReadModel: ProjectionSnapshotQueryShape["getCommandReadModel"] = () =>
    sql
      .withTransaction(
        Effect.all([
          listProjectRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getCommandReadModel:listProjects:query",
                "ProjectionSnapshotQuery.getCommandReadModel:listProjects:decodeRows",
              ),
            ),
          ),
          listThreadRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getCommandReadModel:listThreads:query",
                "ProjectionSnapshotQuery.getCommandReadModel:listThreads:decodeRows",
              ),
            ),
          ),
          listThreadProposedPlanRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getCommandReadModel:listThreadProposedPlans:query",
                "ProjectionSnapshotQuery.getCommandReadModel:listThreadProposedPlans:decodeRows",
              ),
            ),
          ),
          listThreadSessionRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getCommandReadModel:listThreadSessions:query",
                "ProjectionSnapshotQuery.getCommandReadModel:listThreadSessions:decodeRows",
              ),
            ),
          ),
          listLatestTurnRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getCommandReadModel:listLatestTurns:query",
                "ProjectionSnapshotQuery.getCommandReadModel:listLatestTurns:decodeRows",
              ),
            ),
          ),
          listProjectionStateRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getCommandReadModel:listProjectionState:query",
                "ProjectionSnapshotQuery.getCommandReadModel:listProjectionState:decodeRows",
              ),
            ),
          ),
        ]),
      )
      .pipe(
        Effect.flatMap(
          ([projectRows, threadRows, proposedPlanRows, sessionRows, latestTurnRows, stateRows]) =>
            Effect.sync(() => {
              let updatedAt: string | null = null;
              const projects: OrchestrationProject[] = [];
              const threads: OrchestrationThread[] = [];

              for (let index = 0; index < projectRows.length; index += 1) {
                const row = projectRows[index];
                if (!row) {
                  continue;
                }
                updatedAt = maxIso(updatedAt, row.updatedAt);
                projects.push({
                  id: row.projectId,
                  title: row.title,
                  workspaceRoot: row.workspaceRoot,
                  defaultModelSelection: row.defaultModelSelection,
                  scripts: row.scripts,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt,
                  deletedAt: row.deletedAt,
                });
              }
              for (let index = 0; index < threadRows.length; index += 1) {
                const row = threadRows[index];
                if (!row) {
                  continue;
                }
                updatedAt = maxIso(updatedAt, row.updatedAt);
              }
              for (let index = 0; index < proposedPlanRows.length; index += 1) {
                const row = proposedPlanRows[index];
                if (!row) {
                  continue;
                }
                updatedAt = maxIso(updatedAt, row.updatedAt);
              }
              for (let index = 0; index < sessionRows.length; index += 1) {
                const row = sessionRows[index];
                if (!row) {
                  continue;
                }
                updatedAt = maxIso(updatedAt, row.updatedAt);
              }
              for (let index = 0; index < latestTurnRows.length; index += 1) {
                const row = latestTurnRows[index];
                if (!row) {
                  continue;
                }
                updatedAt = maxIso(updatedAt, row.requestedAt);
                if (row.startedAt !== null) {
                  updatedAt = maxIso(updatedAt, row.startedAt);
                }
                if (row.completedAt !== null) {
                  updatedAt = maxIso(updatedAt, row.completedAt);
                }
              }
              for (let index = 0; index < stateRows.length; index += 1) {
                const row = stateRows[index];
                if (!row) {
                  continue;
                }
                updatedAt = maxIso(updatedAt, row.updatedAt);
              }

              const latestTurnByThread = new Map<string, OrchestrationLatestTurn>();
              for (let index = 0; index < latestTurnRows.length; index += 1) {
                const row = latestTurnRows[index];
                if (!row) {
                  continue;
                }
                latestTurnByThread.set(row.threadId, mapLatestTurn(row));
              }
              const proposedPlansByThread = new Map<string, Array<OrchestrationProposedPlan>>();
              const sessionByThread = new Map<string, OrchestrationSession>();

              for (let index = 0; index < sessionRows.length; index += 1) {
                const row = sessionRows[index];
                if (!row) {
                  continue;
                }
                sessionByThread.set(row.threadId, mapSessionRow(row));
              }

              for (let index = 0; index < proposedPlanRows.length; index += 1) {
                const row = proposedPlanRows[index];
                if (!row) {
                  continue;
                }
                const threadProposedPlans = proposedPlansByThread.get(row.threadId) ?? [];
                threadProposedPlans.push(mapProposedPlanRow(row));
                proposedPlansByThread.set(row.threadId, threadProposedPlans);
              }

              for (let index = 0; index < threadRows.length; index += 1) {
                const row = threadRows[index];
                if (!row) {
                  continue;
                }
                threads.push({
                  id: row.threadId,
                  projectId: row.projectId,
                  title: row.title,
                  modelSelection: row.modelSelection,
                  runtimeMode: row.runtimeMode,
                  interactionMode: row.interactionMode,
                  branch: row.branch,
                  worktreePath: row.worktreePath,
                  latestTurn: latestTurnByThread.get(row.threadId) ?? null,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt,
                  archivedAt: row.archivedAt,
                  deletedAt: row.deletedAt,
                  messages: [],
                  proposedPlans: proposedPlansByThread.get(row.threadId) ?? [],
                  activities: [],
                  checkpoints: [],
                  session: sessionByThread.get(row.threadId) ?? null,
                });
              }

              return {
                snapshotSequence: computeSnapshotSequence(stateRows),
                projects,
                threads,
                updatedAt: updatedAt ?? "1970-01-01T00:00:00.000Z",
              } satisfies OrchestrationReadModel;
            }),
        ),
        Effect.mapError((error) => {
          if (isPersistenceError(error)) {
            return error;
          }
          return toPersistenceSqlError("ProjectionSnapshotQuery.getCommandReadModel:query")(error);
        }),
      );

  const getShellSnapshot: ProjectionSnapshotQueryShape["getShellSnapshot"] = () =>
    sql
      .withTransaction(
        Effect.all([
          listProjectRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getShellSnapshot:listProjects:query",
                "ProjectionSnapshotQuery.getShellSnapshot:listProjects:decodeRows",
              ),
            ),
          ),
          listActiveThreadRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getShellSnapshot:listThreads:query",
                "ProjectionSnapshotQuery.getShellSnapshot:listThreads:decodeRows",
              ),
            ),
          ),
          listActiveThreadSessionRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getShellSnapshot:listThreadSessions:query",
                "ProjectionSnapshotQuery.getShellSnapshot:listThreadSessions:decodeRows",
              ),
            ),
          ),
          listActiveLatestTurnRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getShellSnapshot:listLatestTurns:query",
                "ProjectionSnapshotQuery.getShellSnapshot:listLatestTurns:decodeRows",
              ),
            ),
          ),
          listProjectionStateRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getShellSnapshot:listProjectionState:query",
                "ProjectionSnapshotQuery.getShellSnapshot:listProjectionState:decodeRows",
              ),
            ),
          ),
        ]),
      )
      .pipe(
        Effect.flatMap(([projectRows, threadRows, sessionRows, latestTurnRows, stateRows]) =>
          Effect.gen(function* () {
            let updatedAt: string | null = null;
            for (const row of projectRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }
            for (const row of threadRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }
            for (const row of sessionRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }
            for (const row of latestTurnRows) {
              updatedAt = maxIso(updatedAt, row.requestedAt);
              if (row.startedAt !== null) {
                updatedAt = maxIso(updatedAt, row.startedAt);
              }
              if (row.completedAt !== null) {
                updatedAt = maxIso(updatedAt, row.completedAt);
              }
            }
            for (const row of stateRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }

            const repositoryIdentities = yield* resolveRepositoryIdentitiesForProjects(projectRows);
            const latestTurnByThread = new Map(
              latestTurnRows.map((row) => [row.threadId, mapLatestTurn(row)] as const),
            );
            const sessionByThread = new Map(
              sessionRows.map((row) => [row.threadId, mapSessionRow(row)] as const),
            );

            const snapshot = {
              snapshotSequence: computeSnapshotSequence(stateRows),
              projects: Arr.filterMap(projectRows, (row) =>
                row.deletedAt === null
                  ? Result.succeed(
                      mapProjectShellRow(row, repositoryIdentities.get(row.projectId) ?? null),
                    )
                  : Result.failVoid,
              ),
              threads: Arr.filterMap(threadRows, (row) =>
                row.deletedAt === null
                  ? Result.succeed({
                      id: row.threadId,
                      projectId: row.projectId,
                      title: row.title,
                      modelSelection: row.modelSelection,
                      runtimeMode: row.runtimeMode,
                      interactionMode: row.interactionMode,
                      branch: row.branch,
                      worktreePath: row.worktreePath,
                      latestTurn: latestTurnByThread.get(row.threadId) ?? null,
                      createdAt: row.createdAt,
                      updatedAt: row.updatedAt,
                      archivedAt: row.archivedAt,
                      session: sessionByThread.get(row.threadId) ?? null,
                      latestUserMessageAt: row.latestUserMessageAt,
                      hasPendingApprovals: row.pendingApprovalCount > 0,
                      hasPendingUserInput: row.pendingUserInputCount > 0,
                      hasActionableProposedPlan: row.hasActionableProposedPlan > 0,
                      activePlanProgress: row.activePlanProgress,
                      latestRuntimeActivityAt: row.latestRuntimeActivityAt,
                      statusSummaryUpdatedAt: row.statusSummaryUpdatedAt,
                    } satisfies OrchestrationThreadShell)
                  : Result.failVoid,
              ),
              updatedAt: updatedAt ?? "1970-01-01T00:00:00.000Z",
            };

            return yield* decodeShellSnapshot(snapshot).pipe(
              Effect.mapError(
                toPersistenceDecodeError(
                  "ProjectionSnapshotQuery.getShellSnapshot:decodeShellSnapshot",
                ),
              ),
            );
          }),
        ),
        Effect.mapError((error) => {
          if (isPersistenceError(error)) {
            return error;
          }
          return toPersistenceSqlError("ProjectionSnapshotQuery.getShellSnapshot:query")(error);
        }),
      );

  const getArchivedShellSnapshot: ProjectionSnapshotQueryShape["getArchivedShellSnapshot"] = () =>
    sql
      .withTransaction(
        Effect.all([
          listProjectRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listProjects:query",
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listProjects:decodeRows",
              ),
            ),
          ),
          listArchivedThreadRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listThreads:query",
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listThreads:decodeRows",
              ),
            ),
          ),
          listArchivedThreadSessionRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listThreadSessions:query",
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listThreadSessions:decodeRows",
              ),
            ),
          ),
          listArchivedLatestTurnRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listLatestTurns:query",
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listLatestTurns:decodeRows",
              ),
            ),
          ),
          listProjectionStateRows(undefined).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listProjectionState:query",
                "ProjectionSnapshotQuery.getArchivedShellSnapshot:listProjectionState:decodeRows",
              ),
            ),
          ),
        ]),
      )
      .pipe(
        Effect.flatMap(([projectRows, threadRows, sessionRows, latestTurnRows, stateRows]) =>
          Effect.gen(function* () {
            let updatedAt: string | null = null;
            for (const row of projectRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }
            for (const row of threadRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }
            for (const row of sessionRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }
            for (const row of latestTurnRows) {
              updatedAt = maxIso(updatedAt, row.requestedAt);
              if (row.startedAt !== null) {
                updatedAt = maxIso(updatedAt, row.startedAt);
              }
              if (row.completedAt !== null) {
                updatedAt = maxIso(updatedAt, row.completedAt);
              }
            }
            for (const row of stateRows) {
              updatedAt = maxIso(updatedAt, row.updatedAt);
            }

            const activeProjectIds = new Set(threadRows.map((row) => row.projectId));
            const repositoryIdentities = yield* resolveRepositoryIdentitiesForProjects(
              projectRows.filter((row) => activeProjectIds.has(row.projectId)),
            );
            const latestTurnByThread = new Map(
              latestTurnRows.map((row) => [row.threadId, mapLatestTurn(row)] as const),
            );
            const sessionByThread = new Map(
              sessionRows.map((row) => [row.threadId, mapSessionRow(row)] as const),
            );

            const snapshot = {
              snapshotSequence: computeSnapshotSequence(stateRows),
              projects: Arr.filterMap(projectRows, (row) =>
                row.deletedAt === null && activeProjectIds.has(row.projectId)
                  ? Result.succeed(
                      mapProjectShellRow(row, repositoryIdentities.get(row.projectId) ?? null),
                    )
                  : Result.failVoid,
              ),
              threads: threadRows.map(
                (row): OrchestrationThreadShell => ({
                  id: row.threadId,
                  projectId: row.projectId,
                  title: row.title,
                  modelSelection: row.modelSelection,
                  runtimeMode: row.runtimeMode,
                  interactionMode: row.interactionMode,
                  branch: row.branch,
                  worktreePath: row.worktreePath,
                  latestTurn: latestTurnByThread.get(row.threadId) ?? null,
                  createdAt: row.createdAt,
                  updatedAt: row.updatedAt,
                  archivedAt: row.archivedAt,
                  session: sessionByThread.get(row.threadId) ?? null,
                  latestUserMessageAt: row.latestUserMessageAt,
                  hasPendingApprovals: row.pendingApprovalCount > 0,
                  hasPendingUserInput: row.pendingUserInputCount > 0,
                  hasActionableProposedPlan: row.hasActionableProposedPlan > 0,
                  activePlanProgress: row.activePlanProgress,
                  latestRuntimeActivityAt: row.latestRuntimeActivityAt,
                  statusSummaryUpdatedAt: row.statusSummaryUpdatedAt,
                }),
              ),
              updatedAt: updatedAt ?? "1970-01-01T00:00:00.000Z",
            };

            return yield* decodeShellSnapshot(snapshot).pipe(
              Effect.mapError(
                toPersistenceDecodeError(
                  "ProjectionSnapshotQuery.getArchivedShellSnapshot:decodeShellSnapshot",
                ),
              ),
            );
          }),
        ),
        Effect.mapError((error) => {
          if (isPersistenceError(error)) {
            return error;
          }
          return toPersistenceSqlError("ProjectionSnapshotQuery.getArchivedShellSnapshot:query")(
            error,
          );
        }),
      );

  const getSnapshotSequence: ProjectionSnapshotQueryShape["getSnapshotSequence"] = () =>
    listProjectionStateRows(undefined).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionSnapshotQuery.getSnapshotSequence:query",
          "ProjectionSnapshotQuery.getSnapshotSequence:decodeRows",
        ),
      ),
      Effect.map((stateRows) => ({
        snapshotSequence: computeSnapshotSequence(stateRows),
      })),
    );

  const getCounts: ProjectionSnapshotQueryShape["getCounts"] = () =>
    readProjectionCounts(undefined).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionSnapshotQuery.getCounts:query",
          "ProjectionSnapshotQuery.getCounts:decodeRow",
        ),
      ),
      Effect.map(
        (row): ProjectionSnapshotCounts => ({
          projectCount: row.projectCount,
          threadCount: row.threadCount,
        }),
      ),
    );

  const getActiveProjectByWorkspaceRoot: ProjectionSnapshotQueryShape["getActiveProjectByWorkspaceRoot"] =
    (workspaceRoot) =>
      getActiveProjectRowByWorkspaceRoot({ workspaceRoot }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getActiveProjectByWorkspaceRoot:query",
            "ProjectionSnapshotQuery.getActiveProjectByWorkspaceRoot:decodeRow",
          ),
        ),
        Effect.flatMap((option) =>
          Option.isNone(option)
            ? Effect.succeed(Option.none<OrchestrationProject>())
            : repositoryIdentityResolver.resolve(option.value.workspaceRoot).pipe(
                Effect.map((repositoryIdentity) =>
                  Option.some({
                    id: option.value.projectId,
                    title: option.value.title,
                    workspaceRoot: option.value.workspaceRoot,
                    repositoryIdentity,
                    defaultModelSelection: option.value.defaultModelSelection,
                    scripts: option.value.scripts,
                    createdAt: option.value.createdAt,
                    updatedAt: option.value.updatedAt,
                    deletedAt: option.value.deletedAt,
                  } satisfies OrchestrationProject),
                ),
              ),
        ),
      );

  const getProjectShellById: ProjectionSnapshotQueryShape["getProjectShellById"] = (projectId) =>
    getActiveProjectRowById({ projectId }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProjectionSnapshotQuery.getProjectShellById:query",
          "ProjectionSnapshotQuery.getProjectShellById:decodeRow",
        ),
      ),
      Effect.flatMap((option) =>
        Option.isNone(option)
          ? Effect.succeed(Option.none<OrchestrationProjectShell>())
          : repositoryIdentityResolver
              .resolve(option.value.workspaceRoot)
              .pipe(
                Effect.map((repositoryIdentity) =>
                  Option.some(mapProjectShellRow(option.value, repositoryIdentity)),
                ),
              ),
      ),
    );

  const getFirstActiveThreadIdByProjectId: ProjectionSnapshotQueryShape["getFirstActiveThreadIdByProjectId"] =
    (projectId) =>
      getFirstActiveThreadIdByProject({ projectId }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getFirstActiveThreadIdByProjectId:query",
            "ProjectionSnapshotQuery.getFirstActiveThreadIdByProjectId:decodeRow",
          ),
        ),
        Effect.map(Option.map((row) => row.threadId)),
      );

  const getThreadCheckpointContext: ProjectionSnapshotQueryShape["getThreadCheckpointContext"] = (
    threadId,
  ) =>
    Effect.gen(function* () {
      const threadRow = yield* getThreadCheckpointContextThreadRow({ threadId }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getThreadCheckpointContext:getThread:query",
            "ProjectionSnapshotQuery.getThreadCheckpointContext:getThread:decodeRow",
          ),
        ),
      );
      if (Option.isNone(threadRow)) {
        return Option.none<ProjectionThreadCheckpointContext>();
      }

      const checkpointRows = yield* listCheckpointRowsByThread({ threadId }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getThreadCheckpointContext:listCheckpoints:query",
            "ProjectionSnapshotQuery.getThreadCheckpointContext:listCheckpoints:decodeRows",
          ),
        ),
      );

      return Option.some({
        threadId: threadRow.value.threadId,
        projectId: threadRow.value.projectId,
        workspaceRoot: threadRow.value.workspaceRoot,
        worktreePath: threadRow.value.worktreePath,
        checkpoints: checkpointRows.map(
          (row): OrchestrationCheckpointSummary => ({
            turnId: row.turnId,
            checkpointTurnCount: row.checkpointTurnCount,
            checkpointRef: row.checkpointRef,
            status: row.status,
            files: row.files,
            assistantMessageId: row.assistantMessageId,
            completedAt: row.completedAt,
          }),
        ),
      });
    });

  const getFullThreadDiffContext: NonNullable<
    ProjectionSnapshotQueryShape["getFullThreadDiffContext"]
  > = (threadId, toTurnCount) =>
    Effect.gen(function* () {
      const row = yield* getFullThreadDiffContextRow({
        threadId,
        checkpointTurnCount: toTurnCount,
      }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getFullThreadDiffContext:query",
            "ProjectionSnapshotQuery.getFullThreadDiffContext:decodeRow",
          ),
        ),
      );
      if (Option.isNone(row)) {
        return Option.none<ProjectionFullThreadDiffContext>();
      }

      return Option.some({
        threadId: row.value.threadId,
        projectId: row.value.projectId,
        workspaceRoot: row.value.workspaceRoot,
        worktreePath: row.value.worktreePath,
        latestCheckpointTurnCount: row.value.latestCheckpointTurnCount ?? 0,
        toCheckpointRef: row.value.toCheckpointRef,
      });
    });

  const getThreadShellById: ProjectionSnapshotQueryShape["getThreadShellById"] = (threadId) =>
    Effect.gen(function* () {
      const [threadRow, latestTurnRow, sessionRow] = yield* Effect.all([
        getActiveThreadRowById({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadShellById:getThread:query",
              "ProjectionSnapshotQuery.getThreadShellById:getThread:decodeRow",
            ),
          ),
        ),
        getLatestTurnRowByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadShellById:getLatestTurn:query",
              "ProjectionSnapshotQuery.getThreadShellById:getLatestTurn:decodeRow",
            ),
          ),
        ),
        getThreadSessionRowByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadShellById:getSession:query",
              "ProjectionSnapshotQuery.getThreadShellById:getSession:decodeRow",
            ),
          ),
        ),
      ]);

      if (Option.isNone(threadRow)) {
        return Option.none<OrchestrationThreadShell>();
      }

      return Option.some({
        id: threadRow.value.threadId,
        projectId: threadRow.value.projectId,
        title: threadRow.value.title,
        modelSelection: threadRow.value.modelSelection,
        runtimeMode: threadRow.value.runtimeMode,
        interactionMode: threadRow.value.interactionMode,
        branch: threadRow.value.branch,
        worktreePath: threadRow.value.worktreePath,
        latestTurn: Option.isSome(latestTurnRow) ? mapLatestTurn(latestTurnRow.value) : null,
        createdAt: threadRow.value.createdAt,
        updatedAt: threadRow.value.updatedAt,
        archivedAt: threadRow.value.archivedAt,
        session: Option.isSome(sessionRow) ? mapSessionRow(sessionRow.value) : null,
        latestUserMessageAt: threadRow.value.latestUserMessageAt,
        hasPendingApprovals: threadRow.value.pendingApprovalCount > 0,
        hasPendingUserInput: threadRow.value.pendingUserInputCount > 0,
        hasActionableProposedPlan: threadRow.value.hasActionableProposedPlan > 0,
        activePlanProgress: threadRow.value.activePlanProgress,
        latestRuntimeActivityAt: threadRow.value.latestRuntimeActivityAt,
        statusSummaryUpdatedAt: threadRow.value.statusSummaryUpdatedAt,
      } satisfies OrchestrationThreadShell);
    });

  const getThreadDetailById: ProjectionSnapshotQueryShape["getThreadDetailById"] = (threadId) =>
    Effect.gen(function* () {
      const [
        threadRow,
        messageRows,
        proposedPlanRows,
        activityRows,
        checkpointRows,
        latestTurnRow,
        sessionRow,
      ] = yield* Effect.all([
        getActiveThreadRowById({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailById:getThread:query",
              "ProjectionSnapshotQuery.getThreadDetailById:getThread:decodeRow",
            ),
          ),
        ),
        listThreadMessageRowsByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailById:listMessages:query",
              "ProjectionSnapshotQuery.getThreadDetailById:listMessages:decodeRows",
            ),
          ),
        ),
        listThreadProposedPlanRowsByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailById:listPlans:query",
              "ProjectionSnapshotQuery.getThreadDetailById:listPlans:decodeRows",
            ),
          ),
        ),
        listThreadActivityRowsByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailById:listActivities:query",
              "ProjectionSnapshotQuery.getThreadDetailById:listActivities:decodeRows",
            ),
          ),
        ),
        listCheckpointRowsByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailById:listCheckpoints:query",
              "ProjectionSnapshotQuery.getThreadDetailById:listCheckpoints:decodeRows",
            ),
          ),
        ),
        getLatestTurnRowByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailById:getLatestTurn:query",
              "ProjectionSnapshotQuery.getThreadDetailById:getLatestTurn:decodeRow",
            ),
          ),
        ),
        getThreadSessionRowByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailById:getSession:query",
              "ProjectionSnapshotQuery.getThreadDetailById:getSession:decodeRow",
            ),
          ),
        ),
      ]);

      if (Option.isNone(threadRow)) {
        return Option.none<OrchestrationThread>();
      }

      const thread = {
        id: threadRow.value.threadId,
        projectId: threadRow.value.projectId,
        title: threadRow.value.title,
        modelSelection: threadRow.value.modelSelection,
        runtimeMode: threadRow.value.runtimeMode,
        interactionMode: threadRow.value.interactionMode,
        branch: threadRow.value.branch,
        worktreePath: threadRow.value.worktreePath,
        latestTurn: Option.isSome(latestTurnRow) ? mapLatestTurn(latestTurnRow.value) : null,
        createdAt: threadRow.value.createdAt,
        updatedAt: threadRow.value.updatedAt,
        archivedAt: threadRow.value.archivedAt,
        deletedAt: null,
        messages: messageRows.map((row) => {
          const message = {
            id: row.messageId,
            role: row.role,
            text: row.text,
            turnId: row.turnId,
            streaming: row.isStreaming === 1,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          };
          if (row.attachments !== null) {
            return Object.assign(message, { attachments: row.attachments });
          }
          return message;
        }),
        proposedPlans: proposedPlanRows.map(mapProposedPlanRow),
        activities: activityRows.map((row) => {
          const activity = {
            id: row.activityId,
            tone: row.tone,
            kind: row.kind,
            summary: row.summary,
            payload: row.payload,
            turnId: row.turnId,
            createdAt: row.createdAt,
          };
          if (row.sequence !== null) {
            return Object.assign(activity, { sequence: row.sequence });
          }
          return activity;
        }),
        checkpoints: checkpointRows.map((row) => ({
          turnId: row.turnId,
          checkpointTurnCount: row.checkpointTurnCount,
          checkpointRef: row.checkpointRef,
          status: row.status,
          files: row.files,
          assistantMessageId: row.assistantMessageId,
          completedAt: row.completedAt,
        })),
        session: Option.isSome(sessionRow) ? mapSessionRow(sessionRow.value) : null,
      };

      return Option.some(
        yield* decodeThread(thread).pipe(
          Effect.mapError(
            toPersistenceDecodeError("ProjectionSnapshotQuery.getThreadDetailById:decodeThread"),
          ),
        ),
      );
    });

  const getThreadDetailV2ById: ProjectionSnapshotQueryShape["getThreadDetailV2ById"] = (
    threadId,
    requestedLimits,
  ) =>
    Effect.gen(function* () {
      const limits = normalizeThreadSyncV2Limits(requestedLimits);
      const [
        snapshotSequence,
        threadRow,
        messageRows,
        proposedPlanRows,
        activityRows,
        checkpointRows,
        latestTurnRow,
        sessionRow,
      ] = yield* Effect.all([
        getSnapshotSequence(),
        getNonDeletedThreadRowById({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailV2ById:getThread:query",
              "ProjectionSnapshotQuery.getThreadDetailV2ById:getThread:decodeRow",
            ),
          ),
        ),
        listTailThreadMessageRowsByThread({
          threadId,
          limit: limits.messages + 1,
        }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listMessages:query",
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listMessages:decodeRows",
            ),
          ),
        ),
        listTailThreadProposedPlanRowsByThread({
          threadId,
          limit: limits.proposedPlans + 1,
        }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listPlans:query",
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listPlans:decodeRows",
            ),
          ),
        ),
        listTailThreadActivityRawRowsByThread({
          threadId,
          limit: limits.activities + 1,
        }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listActivities:query",
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listActivities:decodeRows",
            ),
          ),
        ),
        listTailCheckpointRowsByThread({
          threadId,
          limit: limits.checkpoints + 1,
        }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listCheckpoints:query",
              "ProjectionSnapshotQuery.getThreadDetailV2ById:listCheckpoints:decodeRows",
            ),
          ),
        ),
        getLatestTurnRowByNonDeletedThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailV2ById:getLatestTurn:query",
              "ProjectionSnapshotQuery.getThreadDetailV2ById:getLatestTurn:decodeRow",
            ),
          ),
        ),
        getThreadSessionRowByThread({ threadId }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "ProjectionSnapshotQuery.getThreadDetailV2ById:getSession:query",
              "ProjectionSnapshotQuery.getThreadDetailV2ById:getSession:decodeRow",
            ),
          ),
        ),
      ]);

      if (Option.isNone(threadRow)) {
        return Option.none<OrchestrationThreadDetailV2Snapshot>();
      }

      const messageWindow = takeLimitedRows(messageRows, limits.messages, { reverse: true });
      const proposedPlanWindow = takeLimitedRows(proposedPlanRows, limits.proposedPlans, {
        reverse: true,
      });
      const activityWindow = takeLimitedRows(activityRows, limits.activities, { reverse: true });
      const checkpointWindow = takeLimitedRows(checkpointRows, limits.checkpoints, {
        reverse: true,
      });
      let activityMappings = yield* Effect.forEach(
        activityWindow.rows,
        decodeThreadSyncV2ActivityRow,
      );
      let messages = messageWindow.rows.map(mapThreadSyncV2MessageRow);
      let proposedPlans = proposedPlanWindow.rows.map(mapThreadSyncV2ProposedPlanRow);
      let checkpoints = checkpointWindow.rows.map(mapCheckpointRow);
      let messagesHaveMoreBefore = messageWindow.hasMore;
      let proposedPlansHaveMoreBefore = proposedPlanWindow.hasMore;
      let activitiesHaveMoreBefore = activityWindow.hasMore;
      let checkpointsHaveMoreBefore = checkpointWindow.hasMore;

      while (true) {
        const windows = {
          messages: {
            returned: messages.length,
            limit: limits.messages,
            hasMoreBefore: messagesHaveMoreBefore,
            hasMoreAfter: false,
          },
          proposedPlans: {
            returned: proposedPlans.length,
            limit: limits.proposedPlans,
            hasMoreBefore: proposedPlansHaveMoreBefore,
            hasMoreAfter: false,
          },
          activities: {
            returned: activityMappings.length,
            limit: limits.activities,
            hasMoreBefore: activitiesHaveMoreBefore,
            hasMoreAfter: false,
          },
          checkpoints: {
            returned: checkpoints.length,
            limit: limits.checkpoints,
            hasMoreBefore: checkpointsHaveMoreBefore,
            hasMoreAfter: false,
          },
        };
        const threadInput = {
          id: threadRow.value.threadId,
          projectId: threadRow.value.projectId,
          title: threadRow.value.title,
          modelSelection: threadRow.value.modelSelection,
          runtimeMode: threadRow.value.runtimeMode,
          interactionMode: threadRow.value.interactionMode,
          branch: threadRow.value.branch,
          worktreePath: threadRow.value.worktreePath,
          latestTurn: Option.isSome(latestTurnRow) ? mapLatestTurn(latestTurnRow.value) : null,
          createdAt: threadRow.value.createdAt,
          updatedAt: threadRow.value.updatedAt,
          archivedAt: threadRow.value.archivedAt,
          deletedAt: null,
          messages,
          proposedPlans,
          activities: activityMappings.map((item) => item.activity),
          checkpoints,
          session: Option.isSome(sessionRow) ? mapSessionRow(sessionRow.value) : null,
        };
        const snapshotWithoutBytes = {
          snapshotSequence: snapshotSequence.snapshotSequence,
          thread: threadInput,
          windows,
          deferredActivityPayloads: activityMappings.reduce(
            (sum, item) => sum + item.deferredActivityPayloads,
            0,
          ),
          deferredThreadContents: deferredThreadContentCount({ messages, proposedPlans }),
        };
        const responseBytes = estimatedSerializedBytesWithEstimate(snapshotWithoutBytes);
        if (responseBytes <= THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES) {
          const thread = yield* decodeThreadV2(threadInput).pipe(
            Effect.mapError(
              toPersistenceDecodeError(
                "ProjectionSnapshotQuery.getThreadDetailV2ById:decodeThreadV2",
              ),
            ),
          );
          return Option.some({
            ...snapshotWithoutBytes,
            thread,
            estimatedSerializedBytes: responseBytes,
          });
        }

        const candidates = [
          messages[0] === undefined
            ? null
            : { kind: "messages" as const, bytes: estimatedSerializedBytes(messages[0]) },
          proposedPlans[0] === undefined
            ? null
            : { kind: "plans" as const, bytes: estimatedSerializedBytes(proposedPlans[0]) },
          activityMappings[0] === undefined
            ? null
            : {
                kind: "activities" as const,
                bytes: estimatedSerializedBytes(activityMappings[0].activity),
              },
          checkpoints[0] === undefined
            ? null
            : { kind: "checkpoints" as const, bytes: estimatedSerializedBytes(checkpoints[0]) },
        ].filter((candidate) => candidate !== null);
        const largest = candidates.toSorted((left, right) => right.bytes - left.bytes)[0];
        if (largest === undefined) {
          return yield* new PersistenceDecodeError({
            operation: "ProjectionSnapshotQuery.getThreadDetailV2ById:responseBound",
            issue: `Snapshot metadata exceeds ${THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES} bytes`,
            correlation: { threadId },
          });
        }
        switch (largest.kind) {
          case "messages":
            messages = messages.slice(1);
            messagesHaveMoreBefore = true;
            break;
          case "plans":
            proposedPlans = proposedPlans.slice(1);
            proposedPlansHaveMoreBefore = true;
            break;
          case "activities":
            activityMappings = activityMappings.slice(1);
            activitiesHaveMoreBefore = true;
            break;
          case "checkpoints":
            checkpoints = checkpoints.slice(1);
            checkpointsHaveMoreBefore = true;
            break;
        }
      }
    });

  const getThreadMessagePage: ProjectionSnapshotQueryShape["getThreadMessagePage"] = (input) =>
    Effect.gen(function* () {
      const limit = normalizeThreadSyncV2Limit(
        input.limit,
        THREAD_SYNC_V2_DEFAULT_LIMITS.messages,
        THREAD_SYNC_V2_MAX_LIMITS.messages,
      );
      const rows = yield* (
        input.before === undefined
          ? listTailThreadMessageRowsByThread({ threadId: input.threadId, limit: limit + 1 })
          : listThreadMessageRowsBeforeCursor({
              threadId: input.threadId,
              limit: limit + 1,
              cursorCreatedAt: input.before.createdAt,
              cursorMessageId: input.before.messageId,
            })
      ).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getThreadMessagePage:query",
            "ProjectionSnapshotQuery.getThreadMessagePage:decodeRows",
          ),
        ),
      );
      const limited = takeLimitedRows(rows, limit, { reverse: true });
      return yield* makeBoundedChronologicalPage({
        items: limited.rows.map(mapThreadSyncV2MessageRow),
        hasMoreBefore: limited.hasMore,
        cursor: (message) => ({ messageId: message.id, createdAt: message.createdAt }),
        operation: "ProjectionSnapshotQuery.getThreadMessagePage:responseBound",
        threadId: input.threadId,
      });
    });

  const getThreadProposedPlanPage: ProjectionSnapshotQueryShape["getThreadProposedPlanPage"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const limit = normalizeThreadSyncV2Limit(
        input.limit,
        THREAD_SYNC_V2_DEFAULT_LIMITS.proposedPlans,
        THREAD_SYNC_V2_MAX_LIMITS.proposedPlans,
      );
      const rows = yield* (
        input.before === undefined
          ? listTailThreadProposedPlanRowsByThread({ threadId: input.threadId, limit: limit + 1 })
          : listThreadProposedPlanRowsBeforeCursor({
              threadId: input.threadId,
              limit: limit + 1,
              cursorCreatedAt: input.before.createdAt,
              cursorPlanId: input.before.planId,
            })
      ).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getThreadProposedPlanPage:query",
            "ProjectionSnapshotQuery.getThreadProposedPlanPage:decodeRows",
          ),
        ),
      );
      const limited = takeLimitedRows(rows, limit, { reverse: true });
      return yield* makeBoundedChronologicalPage({
        items: limited.rows.map(mapThreadSyncV2ProposedPlanRow),
        hasMoreBefore: limited.hasMore,
        cursor: (plan) => ({ planId: plan.id, createdAt: plan.createdAt }),
        operation: "ProjectionSnapshotQuery.getThreadProposedPlanPage:responseBound",
        threadId: input.threadId,
      });
    });

  const getThreadContentChunk: ProjectionSnapshotQueryShape["getThreadContentChunk"] = (input) =>
    Effect.gen(function* () {
      const contentRow = yield* (
        input.content.kind === "message-text"
          ? getThreadMessageContentRowById({
              threadId: input.threadId,
              messageId: input.content.messageId,
            })
          : getThreadProposedPlanContentRowById({
              threadId: input.threadId,
              planId: input.content.planId,
            })
      ).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getThreadContentChunk:query",
            "ProjectionSnapshotQuery.getThreadContentChunk:decodeRow",
          ),
        ),
      );
      if (Option.isNone(contentRow)) {
        return yield* new PersistenceDecodeError({
          operation: "ProjectionSnapshotQuery.getThreadContentChunk",
          issue: "Thread content is not available.",
          correlation: { threadId: input.threadId },
        });
      }

      const { content, contentVersion } = contentRow.value;
      if (input.offset > content.length || isUnsafeUtf16Boundary(content, input.offset)) {
        return yield* new PersistenceDecodeError({
          operation: "ProjectionSnapshotQuery.getThreadContentChunk",
          issue: "Thread content offset is not a valid UTF-16 boundary.",
          correlation: { threadId: input.threadId },
        });
      }
      const end = findBoundedThreadContentChunkEnd(content, input.offset);
      if (end <= input.offset && input.offset < content.length) {
        return yield* new PersistenceDecodeError({
          operation: "ProjectionSnapshotQuery.getThreadContentChunk",
          issue: "Thread content could not produce a bounded chunk.",
          correlation: { threadId: input.threadId },
        });
      }
      const chunk = content.slice(input.offset, end);
      const resultWithoutBytes = {
        threadId: input.threadId,
        content: input.content,
        contentVersion,
        offset: input.offset,
        chunk,
        chunkByteLength: utf8ByteLength(chunk),
        nextOffset: end === content.length ? null : end,
        totalByteLength: utf8ByteLength(content),
        totalCharacterLength: content.length,
      };
      const estimatedSerializedBytes = estimatedSerializedBytesWithEstimate(resultWithoutBytes);
      if (estimatedSerializedBytes > THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES) {
        return yield* new PersistenceDecodeError({
          operation: "ProjectionSnapshotQuery.getThreadContentChunk",
          issue: `Thread content chunk exceeds ${THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES} bytes`,
          correlation: { threadId: input.threadId },
        });
      }
      return {
        ...resultWithoutBytes,
        estimatedSerializedBytes,
      } satisfies OrchestrationThreadContentChunkResult;
    });

  const getThreadActivityPage: ProjectionSnapshotQueryShape["getThreadActivityPage"] = (input) =>
    Effect.gen(function* () {
      const limit = normalizeThreadSyncV2Limit(
        input.limit,
        THREAD_SYNC_V2_DEFAULT_LIMITS.activities,
        THREAD_SYNC_V2_MAX_LIMITS.activities,
      );
      const limitWithLookahead = limit + 1;
      const page =
        input.cursor === undefined
          ? yield* listTailThreadActivityRawRowsByThread({
              threadId: input.threadId,
              limit: limitWithLookahead,
            }).pipe(
              Effect.mapError(
                toPersistenceSqlOrDecodeError(
                  "ProjectionSnapshotQuery.getThreadActivityPage:listTail:query",
                  "ProjectionSnapshotQuery.getThreadActivityPage:listTail:decodeRows",
                ),
              ),
              Effect.map((rows) => {
                const limited = takeLimitedRows(rows, limit, { reverse: true });
                return {
                  rows: limited.rows,
                  hasMoreBefore: limited.hasMore,
                  hasMoreAfter: false,
                };
              }),
            )
          : input.cursor.direction === "before"
            ? yield* listThreadActivityRawRowsBeforeCursor({
                threadId: input.threadId,
                limit: limitWithLookahead,
                cursorSequence: input.cursor.position.sequence,
                cursorCreatedAt: input.cursor.position.createdAt,
                cursorActivityId: input.cursor.position.activityId,
              }).pipe(
                Effect.mapError(
                  toPersistenceSqlOrDecodeError(
                    "ProjectionSnapshotQuery.getThreadActivityPage:listBefore:query",
                    "ProjectionSnapshotQuery.getThreadActivityPage:listBefore:decodeRows",
                  ),
                ),
                Effect.map((rows) => {
                  const limited = takeLimitedRows(rows, limit, { reverse: true });
                  return {
                    rows: limited.rows,
                    hasMoreBefore: limited.hasMore,
                    hasMoreAfter: true,
                  };
                }),
              )
            : yield* listThreadActivityRawRowsAfterCursor({
                threadId: input.threadId,
                limit: limitWithLookahead,
                cursorSequence: input.cursor.position.sequence,
                cursorCreatedAt: input.cursor.position.createdAt,
                cursorActivityId: input.cursor.position.activityId,
              }).pipe(
                Effect.mapError(
                  toPersistenceSqlOrDecodeError(
                    "ProjectionSnapshotQuery.getThreadActivityPage:listAfter:query",
                    "ProjectionSnapshotQuery.getThreadActivityPage:listAfter:decodeRows",
                  ),
                ),
                Effect.map((rows) => {
                  const limited = takeLimitedRows(rows, limit);
                  return {
                    rows: limited.rows,
                    hasMoreBefore: true,
                    hasMoreAfter: limited.hasMore,
                  };
                }),
              );

      let activityMappings = yield* Effect.forEach(page.rows, decodeThreadSyncV2ActivityRow);
      let hasMoreBefore = page.hasMoreBefore;
      while (true) {
        const resultWithoutBytes = {
          items: activityMappings.map((item) => item.activity),
          startCursor: activityMappings[0]?.cursor ?? null,
          endCursor: activityMappings[activityMappings.length - 1]?.cursor ?? null,
          hasMoreBefore,
          hasMoreAfter: page.hasMoreAfter,
          deferredActivityPayloads: activityMappings.reduce(
            (sum, item) => sum + item.deferredActivityPayloads,
            0,
          ),
        };
        const responseBytes = estimatedSerializedBytesWithEstimate(resultWithoutBytes);
        if (responseBytes <= THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES) {
          return {
            ...resultWithoutBytes,
            estimatedSerializedBytes: responseBytes,
          } satisfies OrchestrationThreadActivityPageResult;
        }
        if (activityMappings.length <= 1) {
          return yield* new PersistenceDecodeError({
            operation: "ProjectionSnapshotQuery.getThreadActivityPage:responseBound",
            issue: `Single page item exceeds ${THREAD_SYNC_V2_MAX_PAGE_RESPONSE_BYTES} bytes`,
            correlation: { threadId: input.threadId },
          });
        }
        activityMappings = activityMappings.slice(1);
        hasMoreBefore = true;
      }
    });

  const getThreadCheckpointPage: ProjectionSnapshotQueryShape["getThreadCheckpointPage"] = (
    input,
  ) =>
    Effect.gen(function* () {
      const limit = normalizeThreadSyncV2Limit(
        input.limit,
        THREAD_SYNC_V2_DEFAULT_LIMITS.checkpoints,
        THREAD_SYNC_V2_MAX_LIMITS.checkpoints,
      );
      const rows = yield* (
        input.before === undefined
          ? listTailCheckpointRowsByThread({ threadId: input.threadId, limit: limit + 1 })
          : listCheckpointRowsBeforeCursor({
              threadId: input.threadId,
              limit: limit + 1,
              cursorCheckpointTurnCount: input.before.checkpointTurnCount,
            })
      ).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionSnapshotQuery.getThreadCheckpointPage:query",
            "ProjectionSnapshotQuery.getThreadCheckpointPage:decodeRows",
          ),
        ),
      );
      const limited = takeLimitedRows(rows, limit, { reverse: true });
      return yield* makeBoundedChronologicalPage({
        items: limited.rows.map(mapCheckpointRow),
        hasMoreBefore: limited.hasMore,
        cursor: (checkpoint) => ({
          checkpointTurnCount: checkpoint.checkpointTurnCount,
        }),
        operation: "ProjectionSnapshotQuery.getThreadCheckpointPage:responseBound",
        threadId: input.threadId,
      });
    });

  const hydrateThreadActivityPayloads: ProjectionSnapshotQueryShape["hydrateThreadActivityPayloads"] =
    (threadId, activityIds) =>
      Effect.gen(function* () {
        const { requestedActivityIds, overflowActivityIds } =
          takeBoundedHydrateActivityIds(activityIds);
        const metadataRows = yield* Effect.forEach(requestedActivityIds, (activityId) =>
          getThreadActivityPayloadMetadataRowById({ threadId, activityId }).pipe(
            Effect.mapError(
              toPersistenceSqlOrDecodeError(
                "ProjectionSnapshotQuery.hydrateThreadActivityPayloads:getActivityMetadata:query",
                "ProjectionSnapshotQuery.hydrateThreadActivityPayloads:getActivityMetadata:decodeRow",
              ),
            ),
            Effect.map((row) => [activityId, row] as const),
          ),
        );
        const metadataByActivityId = new Map(metadataRows);
        let hydratedResponseBytes = 0;
        const hydratedOrOmitted = yield* Effect.forEach(requestedActivityIds, (activityId) =>
          Effect.gen(function* () {
            const metadata = metadataByActivityId.get(activityId);
            if (metadata === undefined || Option.isNone(metadata)) {
              return {
                kind: "omitted" as const,
                value: {
                  activityId,
                  reason: "missing" as const,
                  byteLength: null,
                },
              };
            }

            const byteLength = metadata.value.payloadByteLength;
            if (
              byteLength > THREAD_SYNC_V2_MAX_HYDRATED_ACTIVITY_PAYLOAD_BYTES ||
              hydratedResponseBytes + byteLength > THREAD_SYNC_V2_MAX_HYDRATED_RESPONSE_BYTES
            ) {
              return {
                kind: "omitted" as const,
                value: {
                  activityId,
                  reason: "too-large" as const,
                  byteLength,
                },
              };
            }
            hydratedResponseBytes += byteLength;

            const payloadRow = yield* getThreadActivityPayloadJsonRowById({
              threadId,
              activityId,
            }).pipe(
              Effect.mapError(
                toPersistenceSqlOrDecodeError(
                  "ProjectionSnapshotQuery.hydrateThreadActivityPayloads:getActivityPayload:query",
                  "ProjectionSnapshotQuery.hydrateThreadActivityPayloads:getActivityPayload:decodeRow",
                ),
              ),
            );
            if (Option.isNone(payloadRow)) {
              hydratedResponseBytes -= byteLength;
              return {
                kind: "omitted" as const,
                value: {
                  activityId,
                  reason: "missing" as const,
                  byteLength: null,
                },
              };
            }

            const payload = yield* decodeRawActivityPayloadJson(payloadRow.value.payloadJson).pipe(
              Effect.mapError(
                toPersistenceDecodeError(
                  "ProjectionSnapshotQuery.hydrateThreadActivityPayloads:decodeActivityPayload",
                ),
              ),
            );
            return {
              kind: "payload" as const,
              value: {
                activityId,
                payload,
                byteLength,
              },
            };
          }),
        );

        const overflowOmissions = overflowActivityIds
          .slice(0, THREAD_SYNC_V2_MAX_HYDRATE_OVERFLOW_OMISSIONS)
          .map((activityId) => ({
            activityId,
            reason: "too-many" as const,
            byteLength: null,
          }));

        return {
          payloads: hydratedOrOmitted
            .filter((item) => item.kind === "payload")
            .map((item) => item.value),
          omitted: [
            ...hydratedOrOmitted
              .filter((item) => item.kind === "omitted")
              .map((item) => item.value),
            ...overflowOmissions,
          ],
        } satisfies OrchestrationHydrateThreadActivityPayloadsResult;
      });

  return {
    getCommandReadModel,
    getSnapshot,
    getShellSnapshot,
    getArchivedShellSnapshot,
    getSnapshotSequence,
    getCounts,
    getActiveProjectByWorkspaceRoot,
    getProjectShellById,
    getFirstActiveThreadIdByProjectId,
    getThreadCheckpointContext,
    getFullThreadDiffContext,
    getThreadShellById,
    getThreadDetailById,
    getThreadDetailV2ById,
    getThreadMessagePage,
    getThreadProposedPlanPage,
    getThreadContentChunk,
    getThreadActivityPage,
    getThreadCheckpointPage,
    hydrateThreadActivityPayloads,
  } satisfies ProjectionSnapshotQueryShape;
});

export const OrchestrationProjectionSnapshotQueryLive = Layer.effect(
  ProjectionSnapshotQuery,
  makeProjectionSnapshotQuery,
);
