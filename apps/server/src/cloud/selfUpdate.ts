import {
  ServerSelfUpdateError,
  type ServerSelfUpdateInput,
  type ServerSelfUpdateProgressEvent,
  type ServerSelfUpdateProgressStage,
  type ServerSelfUpdateResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import * as ServerConfig from "../config.ts";
import * as DesktopAppUpdate from "../desktopUpdate/DesktopAppUpdate.ts";
import {
  officialRuntimeUpdateAdmission,
  officialRuntimeUpdateCapability,
} from "../fork/officialRuntimeUpdatePolicy.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import { managedUpdateRefusal } from "../policy/managedUpdates.ts";

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

export const make = Effect.fn("cloud.server_self_update.make")(function* () {
  const serverConfig = yield* ServerConfig.ServerConfig;
  const desktopAppUpdate = yield* DesktopAppUpdate.DesktopAppUpdate;
  const policy = yield* ManagedPolicy.ManagedPolicy;
  const admission = officialRuntimeUpdateAdmission({
    desktopManaged: serverConfig.mode === "desktop",
    desktopAdapterAvailable: desktopAppUpdate.available,
  });

  return ServerSelfUpdate.of({
    update: Effect.fn("ServerSelfUpdate.update")(function (
      input,
      reportProgress = () => Effect.void,
    ) {
      // The desktop app gates its own channel, so the policy check names no target channel.
      const policyRefusal = managedUpdateRefusal(policy.document);
      if (policyRefusal !== undefined) {
        return Effect.fail(new ServerSelfUpdateError({ reason: policyRefusal }));
      }
      // Fork releases have one source-commit track; upstream track switching is not offered.
      if (input.channel !== undefined) {
        return Effect.fail(
          new ServerSelfUpdateError({
            reason:
              "This runtime has a single release track; switching update tracks is unavailable.",
          }),
        );
      }
      return admission.kind === "desktop"
        ? desktopAppUpdate.run(reportProgress)
        : Effect.fail(
            new ServerSelfUpdateError({
              reason: admission.updateReason,
            }),
          );
    }),
    commitDesktopUpdate: Effect.fn("ServerSelfUpdate.commitDesktopUpdate")(
      function (requestId, onHandoffAccepted) {
        return admission.kind === "desktop"
          ? desktopAppUpdate.commit(requestId, onHandoffAccepted)
          : Effect.fail(
              new ServerSelfUpdateError({
                reason: admission.commitReason,
              }),
            );
      },
    ),
  });
});

export const layer = Layer.effect(ServerSelfUpdate, make());

// The update outlives client sockets; progress offers to a closed queue are ignored.
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
