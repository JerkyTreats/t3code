import {
  ORCHESTRATION_WS_METHODS,
  type OrchestrationSubscribeThreadInput,
  type OrchestrationThreadStreamItem,
  type OrchestrationThreadStreamV2Item,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { RpcClientError } from "effect/unstable/rpc";

import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";

export class EnvironmentRpcUnavailableError extends Schema.TaggedErrorClass<EnvironmentRpcUnavailableError>()(
  "EnvironmentRpcUnavailableError",
  {
    environmentId: Schema.String,
    message: Schema.String,
  },
) {}

export interface EnvironmentRpcRequestObservation {
  readonly environmentId: string;
  readonly method: string;
}

export class EnvironmentRpcRequestObserver extends Context.Reference<{
  readonly observe: (
    request: EnvironmentRpcRequestObservation,
  ) => Effect.Effect<Effect.Effect<void>>;
}>("@t3tools/client-runtime/rpc/EnvironmentRpcRequestObserver", {
  defaultValue: () => ({
    observe: () => Effect.succeed(Effect.void),
  }),
}) {}

export type EnvironmentRpcTag = keyof WsRpcProtocolClient & string;
type RpcMethod<TTag extends EnvironmentRpcTag> = WsRpcProtocolClient[TTag];

export type EnvironmentSubscriptionRpcTag =
  | typeof ORCHESTRATION_WS_METHODS.subscribeShell
  | typeof ORCHESTRATION_WS_METHODS.subscribeThread
  | typeof ORCHESTRATION_WS_METHODS.subscribeThreadV2
  | typeof WS_METHODS.subscribeAuthAccess
  | typeof WS_METHODS.subscribeServerConfig
  | typeof WS_METHODS.subscribeServerLifecycle
  | typeof WS_METHODS.subscribeTerminalEvents
  | typeof WS_METHODS.subscribeTerminalMetadata
  | typeof WS_METHODS.subscribePreviewEvents
  | typeof WS_METHODS.subscribeDiscoveredLocalServers
  | typeof WS_METHODS.previewAutomationConnect
  | typeof WS_METHODS.subscribeVcsStatus
  | typeof WS_METHODS.terminalAttach;

export type EnvironmentStreamCommandRpcTag =
  | typeof WS_METHODS.cloudInstallRelayClient
  | typeof WS_METHODS.gitRunStackedAction;

export type EnvironmentStreamRpcTag =
  | EnvironmentSubscriptionRpcTag
  | EnvironmentStreamCommandRpcTag;

export type EnvironmentUnaryRpcTag = Exclude<EnvironmentRpcTag, EnvironmentStreamRpcTag>;
const isRpcClientError = Schema.is(RpcClientError.RpcClientError);

export type EnvironmentThreadSyncVersion = "v1" | "v2";

export type EnvironmentThreadSubscriptionItem =
  | {
      readonly version: "v1";
      readonly item: OrchestrationThreadStreamItem;
    }
  | {
      readonly version: "v2";
      readonly item: OrchestrationThreadStreamV2Item;
      readonly hydrateActivityPayloads: EnvironmentThreadPayloadHydrator;
      readonly hydrateThreadContent: EnvironmentThreadContentHydrator;
      readonly historyPager: EnvironmentThreadHistoryPager;
    };

export type EnvironmentRpcInput<TTag extends EnvironmentRpcTag> = Parameters<RpcMethod<TTag>>[0];

export type EnvironmentRpcSuccess<TTag extends EnvironmentUnaryRpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Effect.Effect<infer A, any, any>
    ? A
    : never;

export type EnvironmentRpcFailure<TTag extends EnvironmentUnaryRpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Effect.Effect<any, infer E, any>
    ? E
    : never;

export type EnvironmentThreadPayloadHydrator = (
  input: EnvironmentRpcInput<typeof ORCHESTRATION_WS_METHODS.hydrateThreadActivityPayloads>,
) => Effect.Effect<
  EnvironmentRpcSuccess<typeof ORCHESTRATION_WS_METHODS.hydrateThreadActivityPayloads>,
  EnvironmentRpcFailure<typeof ORCHESTRATION_WS_METHODS.hydrateThreadActivityPayloads>
>;

export type EnvironmentThreadContentHydrator = (
  input: EnvironmentRpcInput<typeof ORCHESTRATION_WS_METHODS.getThreadContentChunk>,
) => Effect.Effect<
  EnvironmentRpcSuccess<typeof ORCHESTRATION_WS_METHODS.getThreadContentChunk>,
  EnvironmentRpcFailure<typeof ORCHESTRATION_WS_METHODS.getThreadContentChunk>
>;

export interface EnvironmentThreadHistoryPager {
  readonly getMessagePage: (
    input: EnvironmentRpcInput<typeof ORCHESTRATION_WS_METHODS.getThreadMessagePage>,
  ) => Effect.Effect<
    EnvironmentRpcSuccess<typeof ORCHESTRATION_WS_METHODS.getThreadMessagePage>,
    EnvironmentRpcFailure<typeof ORCHESTRATION_WS_METHODS.getThreadMessagePage>
  >;
  readonly getProposedPlanPage: (
    input: EnvironmentRpcInput<typeof ORCHESTRATION_WS_METHODS.getThreadProposedPlanPage>,
  ) => Effect.Effect<
    EnvironmentRpcSuccess<typeof ORCHESTRATION_WS_METHODS.getThreadProposedPlanPage>,
    EnvironmentRpcFailure<typeof ORCHESTRATION_WS_METHODS.getThreadProposedPlanPage>
  >;
  readonly getActivityPage: (
    input: EnvironmentRpcInput<typeof ORCHESTRATION_WS_METHODS.getThreadActivityPage>,
  ) => Effect.Effect<
    EnvironmentRpcSuccess<typeof ORCHESTRATION_WS_METHODS.getThreadActivityPage>,
    EnvironmentRpcFailure<typeof ORCHESTRATION_WS_METHODS.getThreadActivityPage>
  >;
  readonly getCheckpointPage: (
    input: EnvironmentRpcInput<typeof ORCHESTRATION_WS_METHODS.getThreadCheckpointPage>,
  ) => Effect.Effect<
    EnvironmentRpcSuccess<typeof ORCHESTRATION_WS_METHODS.getThreadCheckpointPage>,
    EnvironmentRpcFailure<typeof ORCHESTRATION_WS_METHODS.getThreadCheckpointPage>
  >;
}

export type EnvironmentRpcStreamValue<TTag extends EnvironmentStreamRpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Stream.Stream<infer A, any, any>
    ? A
    : never;

export type EnvironmentRpcStreamFailure<TTag extends EnvironmentStreamRpcTag> =
  RpcMethod<TTag> extends (input: any, options?: any) => Stream.Stream<any, infer E, any>
    ? E
    : never;

type ThreadSubscriptionFailure =
  | EnvironmentRpcStreamFailure<typeof ORCHESTRATION_WS_METHODS.subscribeThread>
  | EnvironmentRpcStreamFailure<typeof ORCHESTRATION_WS_METHODS.subscribeThreadV2>
  | Effect.Error<RpcSession["initialConfig"]>;

interface DurableSubscriptionOptions<E> {
  readonly onExpectedFailure?: (cause: Cause.Cause<E>) => Effect.Effect<void, never, never>;
  readonly retryExpectedFailureAfter?: Duration.Input;
}

const currentSession = Effect.fn("EnvironmentRpc.currentSession")(function* () {
  const supervisor = yield* EnvironmentSupervisor;
  return yield* SubscriptionRef.get(supervisor.session).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () =>
          Effect.fail(
            new EnvironmentRpcUnavailableError({
              environmentId: supervisor.target.environmentId,
              message: `${supervisor.target.label} is not connected.`,
            }),
          ),
        onSome: Effect.succeed,
      }),
    ),
  );
});

export const request = Effect.fn("EnvironmentRpc.request")(function* <
  TTag extends EnvironmentUnaryRpcTag,
>(tag: TTag, input: EnvironmentRpcInput<TTag>) {
  const supervisor = yield* EnvironmentSupervisor;
  yield* Effect.annotateCurrentSpan({
    "environment.id": supervisor.target.environmentId,
    "rpc.method": tag,
  });
  const session = yield* currentSession();
  const observer = yield* EnvironmentRpcRequestObserver;
  const method = session.client[tag] as (
    input: EnvironmentRpcInput<TTag>,
  ) => Effect.Effect<EnvironmentRpcSuccess<TTag>, EnvironmentRpcFailure<TTag>>;
  const completeObservation = yield* observer.observe({
    environmentId: supervisor.target.environmentId,
    method: tag,
  });
  return yield* method(input).pipe(Effect.ensuring(completeObservation));
});

export function runStream<TTag extends EnvironmentStreamCommandRpcTag>(
  tag: TTag,
  input: EnvironmentRpcInput<TTag>,
): Stream.Stream<
  EnvironmentRpcStreamValue<TTag>,
  EnvironmentRpcStreamFailure<TTag> | EnvironmentRpcUnavailableError,
  EnvironmentSupervisor
> {
  return Stream.unwrap(
    currentSession().pipe(
      Effect.map((session) => {
        const method = session.client[tag] as (
          input: EnvironmentRpcInput<TTag>,
        ) => Stream.Stream<EnvironmentRpcStreamValue<TTag>, EnvironmentRpcStreamFailure<TTag>>;
        return method(input);
      }),
    ),
  ).pipe(
    Stream.withSpan("EnvironmentRpc.runStream", {
      attributes: { "rpc.method": tag },
    }),
  );
}

function durableSubscription<A, E>(
  methodName: string,
  streamForSession: (session: RpcSession) => Stream.Stream<A, E>,
  options?: DurableSubscriptionOptions<E>,
): Stream.Stream<A, E, EnvironmentSupervisor> {
  return Stream.unwrap(
    EnvironmentSupervisor.pipe(
      Effect.map((supervisor) =>
        SubscriptionRef.changes(supervisor.session).pipe(
          Stream.switchMap(
            Option.match({
              onNone: () => Stream.empty,
              onSome: (session) => {
                const subscribeToSession = (): Stream.Stream<A, E> =>
                  Stream.suspend(() =>
                    streamForSession(session).pipe(
                      Stream.catchCause((cause) => {
                        const hasOnlyExpectedFailures =
                          cause.reasons.length > 0 &&
                          cause.reasons.every((reason) => reason._tag === "Fail");
                        const isTransportFailure =
                          hasOnlyExpectedFailures &&
                          cause.reasons.every(
                            (reason) => reason._tag === "Fail" && isRpcClientError(reason.error),
                          );
                        if (isTransportFailure) {
                          return Stream.fromEffect(
                            Effect.logWarning(
                              "Durable RPC subscription lost its transport; waiting for the next session.",
                              {
                                cause: Cause.pretty(cause),
                                method: methodName,
                                environmentId: supervisor.target.environmentId,
                              },
                            ),
                          ).pipe(Stream.drain);
                        }
                        if (hasOnlyExpectedFailures && options?.onExpectedFailure !== undefined) {
                          const handled = Stream.fromEffect(options.onExpectedFailure(cause)).pipe(
                            Stream.drain,
                          );
                          if (options.retryExpectedFailureAfter === undefined) {
                            return handled;
                          }
                          return handled.pipe(
                            Stream.concat(
                              Stream.fromEffect(
                                Effect.sleep(options.retryExpectedFailureAfter),
                              ).pipe(Stream.drain),
                            ),
                            Stream.concat(subscribeToSession()),
                          );
                        }
                        return Stream.failCause(cause);
                      }),
                    ),
                  );
                return subscribeToSession();
              },
            }),
          ),
        ),
      ),
    ),
  ).pipe(
    Stream.withSpan("EnvironmentRpc.subscribe", {
      attributes: { "rpc.method": methodName },
    }),
  );
}

export function subscribe<TTag extends EnvironmentSubscriptionRpcTag>(
  tag: TTag,
  input: EnvironmentRpcInput<TTag>,
  options?: DurableSubscriptionOptions<EnvironmentRpcStreamFailure<TTag>>,
): Stream.Stream<
  EnvironmentRpcStreamValue<TTag>,
  EnvironmentRpcStreamFailure<TTag>,
  EnvironmentSupervisor
> {
  return durableSubscription(
    tag,
    (session) => {
      const method = session.client[tag] as (
        input: EnvironmentRpcInput<TTag>,
      ) => Stream.Stream<EnvironmentRpcStreamValue<TTag>, EnvironmentRpcStreamFailure<TTag>>;
      return method(input);
    },
    options,
  );
}

export function subscribeThread(
  input: OrchestrationSubscribeThreadInput,
  options?: DurableSubscriptionOptions<ThreadSubscriptionFailure> & {
    readonly onSubscribe?: (
      version: EnvironmentThreadSyncVersion,
    ) => Effect.Effect<void, never, never>;
    readonly useV2?: Effect.Effect<boolean, never, never>;
  },
): Stream.Stream<
  EnvironmentThreadSubscriptionItem,
  ThreadSubscriptionFailure,
  EnvironmentSupervisor
> {
  return durableSubscription(
    ORCHESTRATION_WS_METHODS.subscribeThread,
    (session) =>
      Stream.unwrap(
        session.initialConfig.pipe(
          Effect.flatMap((config) =>
            (options?.useV2 ?? Effect.succeed(true)).pipe(
              Effect.map((useV2) => ({ config, useV2 })),
            ),
          ),
          Effect.map(({ config, useV2 }) => {
            const version: EnvironmentThreadSyncVersion =
              useV2 && config.environment.capabilities.threadSyncV2 === true ? "v2" : "v1";
            const subscribed = Stream.fromEffect(
              options?.onSubscribe?.(version) ?? Effect.void,
            ).pipe(Stream.drain);

            if (version === "v2") {
              const historyPager: EnvironmentThreadHistoryPager = {
                getMessagePage: (pageInput) =>
                  session.client[ORCHESTRATION_WS_METHODS.getThreadMessagePage](pageInput),
                getProposedPlanPage: (pageInput) =>
                  session.client[ORCHESTRATION_WS_METHODS.getThreadProposedPlanPage](pageInput),
                getActivityPage: (pageInput) =>
                  session.client[ORCHESTRATION_WS_METHODS.getThreadActivityPage](pageInput),
                getCheckpointPage: (pageInput) =>
                  session.client[ORCHESTRATION_WS_METHODS.getThreadCheckpointPage](pageInput),
              };
              return subscribed.pipe(
                Stream.concat(
                  session.client[ORCHESTRATION_WS_METHODS.subscribeThreadV2](input).pipe(
                    Stream.map(
                      (item): EnvironmentThreadSubscriptionItem => ({
                        version: "v2",
                        item,
                        hydrateActivityPayloads: (hydrateInput) =>
                          session.client[ORCHESTRATION_WS_METHODS.hydrateThreadActivityPayloads](
                            hydrateInput,
                          ),
                        hydrateThreadContent: (contentInput) =>
                          session.client[ORCHESTRATION_WS_METHODS.getThreadContentChunk](
                            contentInput,
                          ),
                        historyPager,
                      }),
                    ),
                  ),
                ),
              );
            }

            return subscribed.pipe(
              Stream.concat(
                session.client[ORCHESTRATION_WS_METHODS.subscribeThread](input).pipe(
                  Stream.map(
                    (item): EnvironmentThreadSubscriptionItem => ({ version: "v1", item }),
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    options,
  );
}

export const config = Effect.gen(function* () {
  const session = yield* currentSession();
  return yield* session.initialConfig;
}).pipe(Effect.withSpan("EnvironmentRpc.config"));
