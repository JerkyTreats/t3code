import type { EnvironmentId } from "@t3tools/contracts";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";
import { AtomRegistry, type Atom } from "effect/unstable/reactivity";

import { RemoteEnvironmentAuthorization } from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { ManagedRelayDpopSigner } from "../relay/managedRelay.ts";
import {
  executeAuthenticatedEnvironmentHttpRequest,
  type EnvironmentHttpAuthHeaders,
} from "../state/environmentHttpAuth.ts";

export class VoiceOutputError extends Data.TaggedError("VoiceOutputError")<{
  readonly message: string;
}> {}

const endpoint = (base: string, speech: boolean) =>
  new URL(speech ? "/api/voice/speech" : "/api/voice/status", base).toString();

/** The same request-bound authorization and refresh path used by other environment HTTP reads. */
export const fetchEnvironmentVoiceResponse = Effect.fn("voiceOutput.fetchEnvironmentVoiceResponse")(
  function* (input: {
    readonly prepared: PreparedConnection;
    readonly text?: string;
    readonly signer: Option.Option<ManagedRelayDpopSigner["Service"]>;
    readonly remoteAuthorization?: Option.Option<RemoteEnvironmentAuthorization["Service"]>;
  }) {
    const http = yield* HttpClient.HttpClient;
    let url = endpoint(input.prepared.httpBaseUrl, input.text !== undefined);
    const request = ({ headers }: { readonly headers: EnvironmentHttpAuthHeaders }) =>
      Effect.gen(function* () {
        const request =
          input.text === undefined
            ? HttpClientRequest.get(url)
            : HttpClientRequest.post(url).pipe(
                HttpClientRequest.bodyJsonUnsafe({ text: input.text }),
              );
        const response = yield* http.execute(
          request.pipe(HttpClientRequest.setHeaders({ ...headers })),
        );
        if (response.status !== 200)
          return { status: response.status, bytes: new Uint8Array(), contentType: "" };
        const bytes = new Uint8Array(yield* response.arrayBuffer);
        return {
          status: response.status,
          bytes,
          contentType: response.headers["content-type"] ?? "",
        };
      });
    return yield* executeAuthenticatedEnvironmentHttpRequest({
      ...input,
      method: input.text === undefined ? "GET" : "POST",
      timeoutMs: input.text === undefined ? 10_000 : 125_000,
      url: (base) => (url = endpoint(base, input.text !== undefined)),
      isUnauthorizedResponse: (response) => response.status === 401,
      request,
    });
  },
);

function voiceRequest(environmentId: EnvironmentId, text?: string) {
  return Effect.gen(function* () {
    const registry = yield* EnvironmentRegistry;
    const signer = yield* Effect.serviceOption(ManagedRelayDpopSigner);
    const remoteAuthorization = yield* Effect.serviceOption(RemoteEnvironmentAuthorization);
    return yield* registry.run(
      environmentId,
      Effect.gen(function* () {
        const supervisor = yield* EnvironmentSupervisor;
        const prepared = yield* SubscriptionRef.get(supervisor.prepared);
        if (Option.isNone(prepared)) {
          return yield* new VoiceOutputError({
            message: "Connect to the environment before using voice mode.",
          });
        }
        return yield* fetchEnvironmentVoiceResponse({
          prepared: prepared.value,
          signer,
          remoteAuthorization,
          ...(text === undefined ? {} : { text }),
        });
      }),
    );
  });
}

/** Scoped atoms keep the existing connection runtime; abort releases the HTTP fiber and its body. */
export function createVoiceOutputClient<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | HttpClient.HttpClient | R, E>,
  registry: AtomRegistry.AtomRegistry,
) {
  const request = (
    environmentId: EnvironmentId,
    text: string | undefined,
    signal?: AbortSignal,
  ) => {
    const atom = runtime.atom(voiceRequest(environmentId, text));
    return Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* AtomRegistry.mount(registry, atom);
          return yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true });
        }),
      ),
      signal === undefined ? undefined : { signal },
    );
  };
  return {
    async status(
      environmentId: EnvironmentId,
      signal?: AbortSignal,
    ): Promise<{ available: boolean }> {
      const response = await request(environmentId, undefined, signal);
      if (response.status === 404 || response.status === 503) return { available: false };
      if (response.status !== 200)
        throw new VoiceOutputError({
          message: "Could not check voice availability. Reconnect and try again.",
        });
      const status: unknown = JSON.parse(new TextDecoder().decode(response.bytes));
      return {
        available:
          typeof status === "object" &&
          status !== null &&
          "available" in status &&
          status.available === true,
      };
    },
    async speech(
      environmentId: EnvironmentId,
      text: string,
      signal?: AbortSignal,
    ): Promise<Uint8Array> {
      const response = await request(environmentId, text, signal);
      if (response.status !== 200) {
        throw new VoiceOutputError({
          message:
            response.status === 503 || response.status === 404
              ? "Voice is not configured for this environment."
              : response.status === 429
                ? "The voice service is busy. Try replay in a moment."
                : response.status === 413
                  ? "This reply is too long to read aloud."
                  : "Could not generate speech. Try replay or check the voice service.",
        });
      }
      if (!response.contentType.startsWith("audio/wav") || response.bytes.length < 44) {
        throw new VoiceOutputError({ message: "The voice service returned invalid audio." });
      }
      return response.bytes;
    },
  };
}
