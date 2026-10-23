import {
  ServerSelfUpdateError,
  type ServerSelfUpdateInput,
  type ServerSelfUpdateProgressEvent,
  type ServerSelfUpdateProgressStage,
  type ServerSelfUpdateResult,
  type ThreadId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as HashSet from "effect/HashSet";
import * as Ref from "effect/Ref";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as DesktopAppUpdate from "../desktopUpdate/DesktopAppUpdate.ts";
import {
  officialRuntimeUpdateAdmission,
  officialRuntimeUpdateCapability,
} from "../fork/officialRuntimeUpdatePolicy.ts";

export const resolveServerSelfUpdateCapability = officialRuntimeUpdateCapability;

export class ServerSelfUpdate extends Context.Service<
  ServerSelfUpdate,
  {
    readonly update: (
      input: ServerSelfUpdateInput,
      reportProgress?: (
        stage: ServerSelfUpdateProgressStage,
      ) => Effect.Effect<void, ServerSelfUpdateError>,
      onHandoffAccepted?: () => Effect.Effect<void>,
    ) => Effect.Effect<ServerSelfUpdateResult, ServerSelfUpdateError>;
    readonly commitDesktopUpdate: (
      requestId: string,
      onHandoffAccepted?: () => Effect.Effect<void>,
    ) => Effect.Effect<never, ServerSelfUpdateError>;
  }
>()("t3/cloud/selfUpdate/ServerSelfUpdate") {}

export const withRunningThreadContinuation = Effect.fn(
  "cloud.server_self_update.withRunningThreadContinuation",
)(function* (input: {
  readonly mode: ServerConfig.RuntimeMode;
  readonly selfUpdate: ServerSelfUpdate["Service"];
  readonly prepare: Effect.Effect<ReadonlyArray<ThreadId>, ServerSelfUpdateError>;
  readonly clear: (
    threadIds: ReadonlyArray<ThreadId>,
  ) => Effect.Effect<void, ServerSelfUpdateError>;
}) {
  const desktopContinuationTokens = yield* Ref.make(HashSet.empty<string>());
  const clearOnError = <A>(
    effect: Effect.Effect<A, ServerSelfUpdateError>,
    threadIds: () => ReadonlyArray<ThreadId>,
    handoffAccepted: () => boolean,
  ): Effect.Effect<A, ServerSelfUpdateError> =>
    effect.pipe(
      Effect.catchCause((cause) =>
        (handoffAccepted() && Cause.hasInterruptsOnly(cause)
          ? Effect.void
          : input.clear(threadIds())
        ).pipe(Effect.andThen(Effect.failCause(cause))),
      ),
    );

  const update: ServerSelfUpdate["Service"]["update"] = (
    request,
    reportProgress = () => Effect.void,
  ) => {
    let prepared = false;
    let handoffAccepted = false;
    let continuationThreadIds: ReadonlyArray<ThreadId> = [];
    return clearOnError(
      input.selfUpdate
        .update(
          request,
          (stage) =>
            (request.continueRunningThreads === true &&
            input.mode !== "desktop" &&
            stage === "installing" &&
            !prepared
              ? input.prepare.pipe(
                  Effect.tap((threadIds) =>
                    Effect.sync(() => {
                      prepared = true;
                      continuationThreadIds = threadIds;
                    }),
                  ),
                  Effect.asVoid,
                )
              : Effect.void
            ).pipe(Effect.andThen(reportProgress(stage))),
          () =>
            Effect.sync(() => {
              handoffAccepted = true;
            }),
        )
        .pipe(
          Effect.tap((result) => {
            if (
              result.method === "desktop-app" &&
              result.desktopUpdateToken !== undefined &&
              request.continueRunningThreads === true
            ) {
              return Ref.update(desktopContinuationTokens, HashSet.add(result.desktopUpdateToken));
            }
            return Effect.void;
          }),
        ),
      () => continuationThreadIds,
      () => handoffAccepted,
    );
  };

  return ServerSelfUpdate.of({
    update,
    commitDesktopUpdate: Effect.fn("selfUpdate.commitDesktopUpdate")(function* (requestId) {
      const shouldContinue = yield* Ref.modify(desktopContinuationTokens, (tokens) => [
        HashSet.has(tokens, requestId),
        HashSet.remove(tokens, requestId),
      ]);
      let handoffAccepted = false;
      let continuationThreadIds: ReadonlyArray<ThreadId> = [];
      return yield* clearOnError(
        Effect.gen(function* () {
          continuationThreadIds = shouldContinue ? yield* input.prepare : [];
          return yield* input.selfUpdate.commitDesktopUpdate(requestId, () =>
            Effect.sync(() => {
              handoffAccepted = true;
            }),
          );
        }),
        () => continuationThreadIds,
        () => handoffAccepted,
      ).pipe(
        Effect.catchCause((cause) =>
          (shouldContinue && !handoffAccepted
            ? Ref.update(desktopContinuationTokens, HashSet.add(requestId))
            : Effect.void
          ).pipe(Effect.andThen(Effect.failCause(cause))),
        ),
      );
    }),
  });
});

export const make = Effect.fn("cloud.server_self_update.make")(function* () {
  const serverConfig = yield* ServerConfig.ServerConfig;
  const desktopAppUpdate = yield* DesktopAppUpdate.DesktopAppUpdate;
  const admission = officialRuntimeUpdateAdmission({
    desktopManaged: serverConfig.mode === "desktop",
    desktopAdapterAvailable: desktopAppUpdate.available,
  });

  return ServerSelfUpdate.of({
    update: (_input, reportProgress = () => Effect.void) => {
      if (admission.kind === "desktop") {
        return desktopAppUpdate.run(reportProgress);
      }
      return Effect.fail(
        new ServerSelfUpdateError({
          reason: admission.updateReason,
        }),
      );
    },
    commitDesktopUpdate: (requestId, onHandoffAccepted) =>
      admission.kind === "desktop"
        ? desktopAppUpdate.commit(requestId, onHandoffAccepted)
        : Effect.fail(
            new ServerSelfUpdateError({
              reason: admission.commitReason,
            }),
          ),
  });
});

export const layer = Layer.effect(ServerSelfUpdate, make());

// The RPC stream used to own this fiber, so a dropped client socket interrupted
// the download. Offers after the queue shuts down are ignored; the update
// still finishes, and the in-flight guard stays as it was.
export const updateProgressStream = (
  selfUpdate: ServerSelfUpdate["Service"],
  input: ServerSelfUpdateInput,
) =>
  Stream.callback<ServerSelfUpdateProgressEvent, ServerSelfUpdateError>((queue) => {
    const offer = (event: ServerSelfUpdateProgressEvent) =>
      Queue.offer(queue, event).pipe(Effect.ignore);

    return selfUpdate
      .update(input, (stage) => offer({ type: "progress", stage }))
      .pipe(
        Effect.flatMap((result) => offer({ type: "complete", result })),
        Effect.catchTags({
          ServerSelfUpdateError: (error) => Queue.fail(queue, error).pipe(Effect.ignore),
        }),
        Effect.andThen(Queue.end(queue).pipe(Effect.ignore)),
        Effect.forkDetach,
      );
  });
