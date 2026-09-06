import { PrimaryEnvironmentAuth } from "@t3tools/client-runtime/platform";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  ConnectionBlockedError,
  ConnectionTransientError,
  mapRemoteEnvironmentError,
} from "@t3tools/client-runtime/connection";
import { executeEnvironmentHttpRequest } from "@t3tools/client-runtime/rpc";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { PrimaryEnvironmentHttpClient, layer as primaryClientLayer } from "./httpClient";
import { primaryEnvironmentHttpLayer } from "./httpLayer";
import {
  assertThreadPrimaryTarget,
  readThreadPrimaryTarget,
  type ThreadPrimaryTarget,
} from "./threadTransport";

export function makeThreadPrimaryAuth(): PrimaryEnvironmentAuth["Service"] | null {
  const initial = readThreadPrimaryTarget();
  if (!initial) return null;
  const applicationOrigin = new URL(initial.httpBaseUrl).origin;
  const clientLayer = primaryClientLayer.pipe(Layer.provide(primaryEnvironmentHttpLayer));

  const webSocketTicket = Effect.fn("web.threadAuth.webSocketTicket")(function* (
    target: ThreadPrimaryTarget,
  ) {
    const validateTarget = Effect.try({
      try: () => {
        assertThreadPrimaryTarget({ ...target, applicationOrigin });
        const current = readThreadPrimaryTarget();
        if (!current || current.httpBaseUrl !== initial.httpBaseUrl)
          throw new Error("origin changed");
      },
      catch: () =>
        new ConnectionBlockedError({
          reason: "configuration",
          detail: "The protected Thread connection target changed.",
        }),
    });
    yield* validateTarget;
    const client = yield* PrimaryEnvironmentHttpClient;
    const result = yield* executeEnvironmentHttpRequest(
      new URL("/api/auth/websocket-ticket", applicationOrigin).href,
      10_000,
      client.auth.webSocketTicket({ headers: {} }),
    ).pipe(Effect.mapError(mapRemoteEnvironmentError));
    yield* validateTarget;
    const now = yield* Clock.currentTimeMillis;
    if (DateTime.toEpochMillis(result.expiresAt) <= now) {
      return yield* new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: "The environment returned an expired WebSocket ticket.",
      });
    }
    return result;
  });

  return PrimaryEnvironmentAuth.of({
    bearerToken: Effect.succeed(Option.none()),
    // Providing the client inside the attempt preserves its interruption and abort signal.
    webSocketTicket: (target) => webSocketTicket(target).pipe(Effect.provide(clientLayer)),
  });
}

export async function submitThreadEnrollmentCredential(credential: string) {
  const bridge = typeof window === "undefined" ? undefined : window.t3ThreadBridge;
  if (!bridge) return null;
  return bridge.submitPairingCredential(credential);
}

export async function resumeThreadPrimaryConnection(input: {
  readonly readPrimaryEnvironmentId: () => EnvironmentId | null;
  readonly retry: (environmentId: EnvironmentId) => Promise<unknown>;
}): Promise<void> {
  if (typeof window === "undefined" || window.t3ThreadBridge === undefined) return;
  // Discovery can finish while pairing is in flight. Read its current identity
  // after enrollment, then retry the supervisor blocked by the earlier ticket denial.
  const environmentId = input.readPrimaryEnvironmentId();
  if (environmentId !== null) await input.retry(environmentId);
}
