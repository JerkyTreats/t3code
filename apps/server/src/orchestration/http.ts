import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  EnvironmentHttpApi,
  type InteractionId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as DateTime from "effect/DateTime";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";

import { projectThreadDetailSnapshot } from "./ActivityPayloadProjection.ts";
import { cleanupFailedUploadedAttachments, normalizeDispatchCommand } from "./Normalizer.ts";
import {
  annotateEnvironmentRequest,
  failEnvironmentInternal,
  failEnvironmentConflict,
  failEnvironmentInvalidRequest,
  failEnvironmentNotFound,
  requireEnvironmentScope,
} from "../auth/http.ts";
import { OrchestrationEngineService } from "./Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./Services/ProjectionSnapshotQuery.ts";

export const orchestrationHttpApiLayer = HttpApiBuilder.group(
  EnvironmentHttpApi,
  "orchestration",
  Effect.fnUntraced(function* (handlers) {
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const orchestrationEngine = yield* OrchestrationEngineService;

    const getInteraction = Effect.fn("environment.interaction.getResource")(function* (
      threadId: ThreadId,
      interactionId: InteractionId,
    ) {
      const snapshot = yield* projectionSnapshotQuery
        .getThreadDetailSnapshot(threadId)
        .pipe(
          Effect.catch((cause) =>
            failEnvironmentInternal("orchestration_thread_snapshot_failed", cause),
          ),
        );
      if (Option.isNone(snapshot)) {
        return yield* failEnvironmentNotFound("thread_not_found");
      }
      const resource = snapshot.value.thread.interactions?.find(
        (entry) => entry.id === interactionId,
      );
      if (!resource) {
        return yield* failEnvironmentNotFound("interaction_not_found");
      }
      return { snapshotSequence: snapshot.value.snapshotSequence, resource };
    });

    return handlers
      .handle(
        "createInteraction",
        Effect.fn("environment.interaction.create")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          const principal = yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const createdAt = DateTime.formatIso(yield* DateTime.now);
          const result = yield* orchestrationEngine
            .dispatch({
              ...args.payload,
              type: "interaction.create",
              commandId: args.payload.operationId,
              actorClientId: principal.clientId,
              createdAt,
            })
            .pipe(
              Effect.catchTags({
                OrchestrationCommandInvariantError: (cause) =>
                  failEnvironmentConflict(cause.detail),
                OrchestrationCommandPreviouslyRejectedError: (cause) =>
                  failEnvironmentConflict(cause.detail),
                OrchestrationCommandIdConflictError: (cause) =>
                  failEnvironmentConflict(cause.message),
                OrchestrationThreadSettleBlockedError: (cause) =>
                  failEnvironmentConflict(cause.message),
                PersistenceSqlError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
                PersistenceDecodeError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
                OrchestrationProjectorDecodeError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
                OrchestrationListenerCallbackError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
              }),
            );
          const current = yield* getInteraction(args.payload.threadId, args.payload.interactionId);
          return { sequence: result.sequence, resource: current.resource };
        }),
      )
      .handle(
        "getInteraction",
        Effect.fn("environment.interaction.get")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* getInteraction(args.payload.threadId, args.params.interactionId);
        }),
      )
      .handle(
        "resolveInteraction",
        Effect.fn("environment.interaction.resolve")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          const principal = yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const createdAt = DateTime.formatIso(yield* DateTime.now);
          const result = yield* orchestrationEngine
            .dispatch({
              ...args.payload,
              type: "interaction.resolve",
              commandId: args.payload.operationId,
              interactionId: args.params.interactionId,
              actorClientId: principal.clientId,
              createdAt,
            })
            .pipe(
              Effect.catchTags({
                OrchestrationCommandInvariantError: (cause) =>
                  failEnvironmentConflict(cause.detail),
                OrchestrationCommandPreviouslyRejectedError: (cause) =>
                  failEnvironmentConflict(cause.detail),
                OrchestrationCommandIdConflictError: (cause) =>
                  failEnvironmentConflict(cause.message),
                OrchestrationThreadSettleBlockedError: (cause) =>
                  failEnvironmentConflict(cause.message),
                PersistenceSqlError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
                PersistenceDecodeError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
                OrchestrationProjectorDecodeError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
                OrchestrationListenerCallbackError: (cause) =>
                  failEnvironmentInternal("orchestration_dispatch_failed", cause),
              }),
            );
          const current = yield* getInteraction(args.payload.threadId, args.params.interactionId);
          return { sequence: result.sequence, resource: current.resource };
        }),
      )
      .handle(
        "snapshot",
        Effect.fn("environment.orchestration.snapshot")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          // Serve the lightweight command read model (thread bodies empty)
          // instead of the fully hydrated snapshot. Hydrating every message
          // and activity payload in the database has OOM-killed servers, and
          // the route's only consumer (the project CLI) reads projects alone —
          // UI clients load the shell and per-thread snapshots instead.
          return yield* projectionSnapshotQuery
            .getCommandReadModel()
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_snapshot_failed", cause),
              ),
            );
        }),
      )
      .handle(
        "shellSnapshot",
        Effect.fn("environment.orchestration.shellSnapshot")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          return yield* projectionSnapshotQuery
            .getShellSnapshot()
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_snapshot_failed", cause),
              ),
            );
        }),
      )
      .handle(
        "threadSnapshot",
        Effect.fn("environment.orchestration.threadSnapshot")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationReadScope);
          const snapshot = yield* projectionSnapshotQuery
            .getThreadDetailSnapshot(
              args.params.threadId,
              args.payload.turnLimit === undefined
                ? undefined
                : {
                    turnLimit: args.payload.turnLimit,
                    ...(args.payload.beforeCursor !== undefined
                      ? { beforeCursor: args.payload.beforeCursor }
                      : {}),
                  },
            )
            .pipe(
              Effect.catch((cause) =>
                failEnvironmentInternal("orchestration_thread_snapshot_failed", cause),
              ),
            );
          if (Option.isNone(snapshot)) {
            return yield* failEnvironmentNotFound("thread_not_found");
          }
          return projectThreadDetailSnapshot(snapshot.value);
        }),
      )
      .handle(
        "dispatch",
        Effect.fn("environment.orchestration.dispatch")(function* (args) {
          yield* annotateEnvironmentRequest(args.endpoint.name);
          yield* requireEnvironmentScope(AuthOrchestrationOperateScope);
          const normalizedCommand = yield* normalizeDispatchCommand(args.payload).pipe(
            Effect.catch(() => failEnvironmentInvalidRequest("invalid_command")),
          );
          return yield* orchestrationEngine.dispatch(normalizedCommand).pipe(
            Effect.tapError(() =>
              cleanupFailedUploadedAttachments(args.payload, normalizedCommand),
            ),
            Effect.catch((cause) =>
              failEnvironmentInternal("orchestration_dispatch_failed", cause),
            ),
          );
        }),
      );
  }),
);
