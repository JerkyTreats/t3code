import type {
  AuthClientId,
  BoardAuthorId,
  BoardPost,
  BoardPublishInput,
  BoardReviseInput,
  OrchestrationBoardRevisionError,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export interface TrustedBoardPublisher {
  readonly authorId: BoardAuthorId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly threadId: ThreadId;
}

export class BoardPublicationError extends Schema.TaggedErrorClass<BoardPublicationError>()(
  "BoardPublicationError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

export interface BoardShape {
  /** Publishes as a server-authenticated agent. Caller data never supplies authorship. */
  readonly publish: (
    publisher: TrustedBoardPublisher,
    input: BoardPublishInput,
  ) => Effect.Effect<BoardPost, BoardPublicationError>;
  /** Revises through server-authenticated thread and provider identity. */
  readonly reviseAsAgent: (
    publisher: TrustedBoardPublisher,
    input: BoardReviseInput,
  ) => Effect.Effect<BoardPost, OrchestrationBoardRevisionError>;
  /** Revises through an authenticated environment owner connection. */
  readonly reviseAsOwner: (
    clientId: AuthClientId,
    input: BoardReviseInput,
  ) => Effect.Effect<BoardPost, OrchestrationBoardRevisionError>;
}

export class Board extends Context.Service<Board, BoardShape>()(
  "t3/orchestration/Services/Board",
) {}
