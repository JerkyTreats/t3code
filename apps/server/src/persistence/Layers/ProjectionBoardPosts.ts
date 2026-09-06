import {
  BoardAuthor,
  BoardEditor,
  BoardPostId,
  BoardPostSource,
  BoardRevision,
  BoardTargetHint,
  IsoDateTime,
  NonNegativeInt,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";
import {
  GetProjectionBoardPostBySequenceInput,
  GetProjectionBoardPostByIdInput,
  ListProjectionBoardPostHistoryInput,
  ListNewestProjectionBoardPostsInput,
  ListProjectionBoardPostsAfterInput,
  ListProjectionBoardPostsBeforeInput,
  ProjectionBoardPost,
  ProjectionBoardPostRepository,
  type ProjectionBoardPostRepositoryShape,
} from "../Services/ProjectionBoardPosts.ts";

const ProjectionBoardPostDbRow = Schema.Struct({
  id: BoardPostId,
  author: Schema.fromJsonString(BoardAuthor),
  source: Schema.fromJsonString(BoardPostSource),
  targets: Schema.fromJsonString(Schema.Array(BoardTargetHint)),
  body: Schema.String,
  sequence: NonNegativeInt,
  createdAt: IsoDateTime,
  revision: NonNegativeInt,
  updatedSequence: NonNegativeInt,
  updatedAt: IsoDateTime,
  lastEditor: Schema.fromJsonString(BoardEditor),
  lastEditorSource: Schema.NullOr(Schema.fromJsonString(BoardPostSource)),
});
type ProjectionBoardPostDbRow = typeof ProjectionBoardPostDbRow.Type;

const encodeAuthor = Schema.encodeUnknownSync(Schema.fromJsonString(BoardAuthor));
const encodeEditor = Schema.encodeUnknownSync(Schema.fromJsonString(BoardEditor));
const encodeSource = Schema.encodeUnknownSync(Schema.fromJsonString(BoardPostSource));
const encodeTargets = Schema.encodeUnknownSync(
  Schema.fromJsonString(Schema.Array(BoardTargetHint)),
);
const encodeNullableSource = (source: unknown | null) =>
  source === null ? null : encodeSource(source);

const ProjectionBoardRevisionDbRow = Schema.Struct({
  postId: BoardPostId,
  revision: NonNegativeInt,
  body: Schema.String,
  targets: Schema.fromJsonString(Schema.Array(BoardTargetHint)),
  editor: Schema.fromJsonString(BoardEditor),
  editorSource: Schema.NullOr(Schema.fromJsonString(BoardPostSource)),
  editedAt: IsoDateTime,
  eventSequence: NonNegativeInt,
});

const selectColumns = `
  post_id AS id,
  author_json AS author,
  source_json AS source,
  targets_json AS targets,
  body,
  event_sequence AS sequence,
  created_at AS "createdAt",
  revision,
  updated_event_sequence AS "updatedSequence",
  updated_at AS "updatedAt",
  last_editor_json AS "lastEditor",
  last_editor_source_json AS "lastEditorSource"
`;

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeProjectionBoardPostRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const insertPostRow = SqlSchema.void({
    Request: ProjectionBoardPost,
    execute: (post) => sql`
      INSERT INTO projection_board_posts (
        post_id,
        event_sequence,
        author_json,
        source_json,
        targets_json,
        body,
        created_at,
        revision,
        updated_event_sequence,
        updated_at,
        last_editor_json,
        last_editor_source_json
      ) VALUES (
        ${post.id},
        ${post.sequence},
        ${encodeAuthor(post.author)},
        ${encodeSource(post.source)},
        ${encodeTargets(post.targets)},
        ${post.body},
        ${post.createdAt},
        ${post.revision},
        ${post.updatedSequence},
        ${post.updatedAt},
        ${encodeEditor(post.lastEditor)},
        ${encodeNullableSource(post.lastEditorSource)}
      )
      ON CONFLICT (post_id) DO NOTHING
    `,
  });

  const insertInitialRevisionRow = SqlSchema.void({
    Request: ProjectionBoardPost,
    execute: (post) => sql`
      INSERT INTO projection_board_post_revisions (
        post_id,
        revision,
        event_sequence,
        body,
        targets_json,
        editor_json,
        editor_source_json,
        edited_at
      ) VALUES (
        ${post.id},
        ${post.revision},
        ${post.updatedSequence},
        ${post.body},
        ${encodeTargets(post.targets)},
        ${encodeEditor(post.lastEditor)},
        ${encodeNullableSource(post.lastEditorSource)},
        ${post.updatedAt}
      )
      ON CONFLICT (post_id, revision) DO NOTHING
    `,
  });

  const getBySequenceRow = SqlSchema.findOneOption({
    Request: GetProjectionBoardPostBySequenceInput,
    Result: ProjectionBoardPostDbRow,
    execute: ({ sequence }) => sql`
      SELECT ${sql.unsafe(selectColumns)}
      FROM projection_board_posts
      WHERE event_sequence = ${sequence}
      LIMIT 1
    `,
  });

  const getByIdRow = SqlSchema.findOneOption({
    Request: GetProjectionBoardPostByIdInput,
    Result: ProjectionBoardPostDbRow,
    execute: ({ postId }) => sql`
      SELECT ${sql.unsafe(selectColumns)}
      FROM projection_board_posts
      WHERE post_id = ${postId}
      LIMIT 1
    `,
  });

  const listHistoryRows = SqlSchema.findAll({
    Request: ListProjectionBoardPostHistoryInput,
    Result: ProjectionBoardRevisionDbRow,
    execute: ({ postId, beforeRevision, limit }) => sql`
      SELECT
        post_id AS "postId",
        revision,
        body,
        targets_json AS targets,
        editor_json AS editor,
        editor_source_json AS "editorSource",
        edited_at AS "editedAt",
        event_sequence AS "eventSequence"
      FROM projection_board_post_revisions
      WHERE post_id = ${postId}
        AND ${beforeRevision === undefined ? sql`TRUE` : sql`revision < ${beforeRevision}`}
      ORDER BY revision DESC
      LIMIT ${limit}
    `,
  });

  const listNewestRows = SqlSchema.findAll({
    Request: ListNewestProjectionBoardPostsInput,
    Result: ProjectionBoardPostDbRow,
    execute: ({ throughSequence, limit }) => sql`
      SELECT ${sql.unsafe(selectColumns)}
      FROM projection_board_posts
      WHERE event_sequence <= ${throughSequence}
      ORDER BY event_sequence DESC, post_id DESC
      LIMIT ${limit}
    `,
  });

  const listBeforeRows = SqlSchema.findAll({
    Request: ListProjectionBoardPostsBeforeInput,
    Result: ProjectionBoardPostDbRow,
    execute: ({ throughSequence, beforeSequence, beforePostId, limit }) => sql`
      SELECT ${sql.unsafe(selectColumns)}
      FROM projection_board_posts
      WHERE event_sequence <= ${throughSequence}
        AND (
          event_sequence < ${beforeSequence}
          OR (event_sequence = ${beforeSequence} AND post_id < ${beforePostId})
        )
      ORDER BY event_sequence DESC, post_id DESC
      LIMIT ${limit}
    `,
  });

  const listAfterRows = SqlSchema.findAll({
    Request: ListProjectionBoardPostsAfterInput,
    Result: ProjectionBoardPostDbRow,
    execute: ({ afterSequence, throughSequence }) => sql`
      SELECT ${sql.unsafe(selectColumns)}
      FROM projection_board_posts
      WHERE (
          event_sequence > ${afterSequence}
          AND event_sequence <= ${throughSequence}
        ) OR (
          updated_event_sequence > ${afterSequence}
          AND updated_event_sequence <= ${throughSequence}
        )
      ORDER BY updated_event_sequence ASC, post_id ASC
    `,
  });

  const readPageSnapshot: ProjectionBoardPostRepositoryShape["readPageSnapshot"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const state = yield* sql<{ readonly headSequence: number }>`
            SELECT last_applied_sequence AS "headSequence"
            FROM projection_state
            WHERE projector = ${input.projector}
            LIMIT 1
          `;
          const headSequence = state[0]?.headSequence ?? 0;
          const beforeSequence = input.beforeSequence;
          const beforePostId = input.beforePostId;
          const rows =
            beforeSequence !== undefined && beforePostId !== undefined
              ? yield* listBeforeRows({
                  throughSequence: headSequence,
                  beforeSequence,
                  beforePostId,
                  limit: input.limit,
                })
              : yield* listNewestRows({ throughSequence: headSequence, limit: input.limit });
          return {
            posts: rows.toReversed().map((row) => ({ ...row })),
            headSequence,
          };
        }),
      )
      .pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionBoardPostRepository.readPageSnapshot:transaction",
            "ProjectionBoardPostRepository.readPageSnapshot:decode",
          ),
        ),
      );

  const readHistorySnapshot: ProjectionBoardPostRepositoryShape["readHistorySnapshot"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const current = yield* getByIdRow({ postId: input.postId });
          if (Option.isNone(current)) return Option.none();
          const revisions = yield* listHistoryRows(input);
          return Option.some({
            currentRevision: current.value.revision,
            revisions: revisions.map((row) => ({ ...row }) satisfies BoardRevision),
          });
        }),
      )
      .pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionBoardPostRepository.readHistorySnapshot:transaction",
            "ProjectionBoardPostRepository.readHistorySnapshot:decode",
          ),
        ),
      );

  const readAfterSnapshot: ProjectionBoardPostRepositoryShape["readAfterSnapshot"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const state = yield* sql<{ readonly headSequence: number }>`
            SELECT last_applied_sequence AS "headSequence"
            FROM projection_state
            WHERE projector = ${input.projector}
            LIMIT 1
          `;
          const headSequence = state[0]?.headSequence ?? 0;
          const gap = headSequence - input.afterSequence;
          if (gap < 0 || gap > input.maxGap) {
            return { posts: [], headSequence, replayable: false };
          }
          const rows = yield* listAfterRows({
            afterSequence: input.afterSequence,
            throughSequence: headSequence,
          });
          return {
            posts: rows.map((row) => ({ ...row })),
            headSequence,
            replayable: true,
          };
        }),
      )
      .pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionBoardPostRepository.readAfterSnapshot:transaction",
            "ProjectionBoardPostRepository.readAfterSnapshot:decode",
          ),
        ),
      );

  const mapRepositoryError = (operation: string) =>
    Effect.mapError(toPersistenceSqlOrDecodeError(`${operation}:query`, `${operation}:decodeRows`));
  const mapRows = Effect.map((rows: ReadonlyArray<ProjectionBoardPostDbRow>) =>
    rows.map((row) => ({ ...row })),
  );
  const mapNewestRows = Effect.map((rows: ReadonlyArray<ProjectionBoardPostDbRow>) =>
    rows.toReversed().map((row) => ({ ...row })),
  );

  return ProjectionBoardPostRepository.of({
    insert: (post) =>
      Effect.all([insertPostRow(post), insertInitialRevisionRow(post)], {
        discard: true,
      }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionBoardPostRepository.insert:query",
            "ProjectionBoardPostRepository.insert:encodeRequest",
          ),
        ),
      ),
    getById: (input) =>
      getByIdRow(input).pipe(
        mapRepositoryError("ProjectionBoardPostRepository.getById"),
        Effect.map(Option.map((row) => ({ ...row }))),
      ),
    revise: (input) =>
      Effect.gen(function* () {
        const changed = yield* sql<{ readonly revision: number }>`
          UPDATE projection_board_posts
          SET
            body = ${input.body},
            targets_json = ${encodeTargets(input.targets)},
            revision = ${input.revision},
            updated_event_sequence = ${input.eventSequence},
            updated_at = ${input.editedAt},
            last_editor_json = ${encodeEditor(input.editor)},
            last_editor_source_json = ${encodeNullableSource(input.editorSource)}
          WHERE post_id = ${input.postId}
            AND revision = ${input.previousRevision}
            AND ${input.revision} = revision + 1
          RETURNING revision
        `;
        if (changed[0] !== undefined) {
          yield* sql`
            INSERT INTO projection_board_post_revisions (
              post_id,
              revision,
              event_sequence,
              body,
              targets_json,
              editor_json,
              editor_source_json,
              edited_at
            ) VALUES (
              ${input.postId},
              ${input.revision},
              ${input.eventSequence},
              ${input.body},
              ${encodeTargets(input.targets)},
              ${encodeEditor(input.editor)},
              ${encodeNullableSource(input.editorSource)},
              ${input.editedAt}
            )
          `;
          return { _tag: "changed" as const };
        }
        const current = yield* getByIdRow({ postId: input.postId });
        return Option.match(current, {
          onNone: () => ({ _tag: "not-found" as const }),
          onSome: (post) => ({ _tag: "conflict" as const, actualRevision: post.revision }),
        });
      }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "ProjectionBoardPostRepository.revise:query",
            "ProjectionBoardPostRepository.revise:decode",
          ),
        ),
      ),
    listHistory: (input) =>
      listHistoryRows(input).pipe(
        mapRepositoryError("ProjectionBoardPostRepository.listHistory"),
        Effect.map((rows) => rows.map((row) => ({ ...row }) satisfies BoardRevision)),
      ),
    getBySequence: (input) =>
      getBySequenceRow(input).pipe(
        mapRepositoryError("ProjectionBoardPostRepository.getBySequence"),
        Effect.map(Option.map((row) => ({ ...row }))),
      ),
    listNewestPage: (input) =>
      listNewestRows(input).pipe(
        mapRepositoryError("ProjectionBoardPostRepository.listNewestPage"),
        mapNewestRows,
      ),
    listBeforeCursor: (input) =>
      listBeforeRows(input).pipe(
        mapRepositoryError("ProjectionBoardPostRepository.listBeforeCursor"),
        mapNewestRows,
      ),
    listAfterSequenceThroughHead: (input) =>
      listAfterRows(input).pipe(
        mapRepositoryError("ProjectionBoardPostRepository.listAfterSequenceThroughHead"),
        mapRows,
      ),
    readPageSnapshot,
    readAfterSnapshot,
    readHistorySnapshot,
  } satisfies ProjectionBoardPostRepositoryShape);
});

export const ProjectionBoardPostRepositoryLive = Layer.effect(
  ProjectionBoardPostRepository,
  makeProjectionBoardPostRepository,
);
