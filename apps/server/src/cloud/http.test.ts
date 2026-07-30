import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import * as Tracer from "effect/Tracer";
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpServerRequest,
} from "effect/unstable/http";

import { EnvironmentId } from "@t3tools/contracts";
import { RelayClientTracer } from "@t3tools/shared/relayTracing";
import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import type { RelayLinkProofRequest } from "@t3tools/contracts/relay";
import {
  consumeCloudReplayGuards,
  isSupportedLinkProviderKind,
  linkProofScopes,
  reconcileDesiredCloudLink,
  releaseManagedTunnelOnShutdown,
} from "./http.ts";
import { CLOUD_ENDPOINT_RUNTIME_CONFIG, RELAY_URL_SECRET } from "./config.ts";
import { CLOUD_CLI_DESIRED_LINK_SECRET } from "./CliState.ts";
import * as ManagedEndpointRuntime from "./ManagedEndpointRuntime.ts";
import { traceAuthenticatedRelayRequest, traceRelayRequest } from "./traceRelayRequest.ts";

const storeFailure = (tag: "AlreadyExists" | "PermissionDenied") =>
  new ServerSecretStore.SecretStorePersistError({
    resource: "cloud replay guard",
    cause: PlatformError.systemError({
      _tag: tag,
      module: "FileSystem",
      method: "open",
      pathOrDescriptor: "cloud-replay-guard.bin",
    }),
  });

const unusedSecretStoreOperation = () => Effect.die("unused secret-store operation");

function makeSecretStore(
  create: ServerSecretStore.ServerSecretStore["Service"]["create"],
): ServerSecretStore.ServerSecretStore["Service"] {
  return {
    get: unusedSecretStoreOperation,
    set: unusedSecretStoreOperation,
    create,
    getOrCreateRandom: unusedSecretStoreOperation,
    remove: unusedSecretStoreOperation,
  };
}

it("preserves messages surfaced by cloud 500 responses", () => {
  const cause = new Error("cloud operation failed");

  expect([
    new EnvironmentAuth.ServerAuthLinkedCloudAccountVerificationError({ cause }).message,
    new EnvironmentAuth.ServerAuthLinkedCloudAccountReadError({ cause }).message,
    new EnvironmentAuth.ServerAuthLinkedCloudAccountMissingError({}).message,
    new EnvironmentAuth.ServerAuthCloudLinkJwtSigningError({ cause }).message,
    new EnvironmentAuth.ServerAuthCloudMintPublicKeyMissingError({}).message,
    new EnvironmentAuth.ServerAuthCloudRelayIssuerMissingError({}).message,
    new EnvironmentAuth.ServerAuthCloudHealthJwtSigningError({ cause }).message,
    new EnvironmentAuth.ServerAuthCloudMintJwtSigningError({ cause }).message,
  ]).toEqual([
    "Could not verify the linked cloud account.",
    "Could not read the linked cloud account.",
    "Cloud linked user is not installed for this environment.",
    "Failed to sign cloud link JWT.",
    "Cloud mint public key is not installed for this environment.",
    "Cloud relay issuer is not installed for this environment.",
    "Failed to sign cloud health JWT.",
    "Failed to sign cloud mint JWT.",
  ]);
});

describe("consumeCloudReplayGuards", () => {
  it.effect("reports already-created guards as replay conflicts", () =>
    Effect.gen(function* () {
      const consumed = yield* consumeCloudReplayGuards({
        secrets: makeSecretStore(() => Effect.fail(storeFailure("AlreadyExists"))),
        names: ["cloud-jti", "cloud-nonce"],
        value: new Uint8Array(),
      });

      expect(consumed).toBe(false);
    }),
  );

  it.effect("preserves replay-store availability failures", () =>
    Effect.gen(function* () {
      const failure = storeFailure("PermissionDenied");
      const error = yield* Effect.flip(
        consumeCloudReplayGuards({
          secrets: makeSecretStore(() => Effect.fail(failure)),
          names: ["cloud-jti", "cloud-nonce"],
          value: new Uint8Array(),
        }),
      );

      expect(error).toBe(failure);
    }),
  );
});

describe("relay request tracing", () => {
  it.effect("does not accept an unauthenticated request trace parent", () =>
    Effect.gen(function* () {
      const spans: Array<Tracer.Span> = [];
      const productTracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const request = HttpServerRequest.fromWeb(
        new Request("https://environment.example.test/api/t3-cloud/mint-credential", {
          headers: {
            traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
          },
        }),
      );

      yield* traceRelayRequest(Effect.void.pipe(Effect.withSpan("relay.mint.handler"))).pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provideService(RelayClientTracer, Option.some(productTracer)),
      );

      expect(spans).toHaveLength(1);
      const span = spans[0]!;
      expect(span.traceId).not.toBe("0123456789abcdef0123456789abcdef");
      expect(Option.isNone(span.parent)).toBe(true);
    }),
  );

  it.effect("continues an authenticated relay trace with the product tracer", () =>
    Effect.gen(function* () {
      const spans: Array<Tracer.Span> = [];
      const productTracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const request = HttpServerRequest.fromWeb(
        new Request("https://environment.example.test/api/t3-cloud/mint-credential", {
          headers: {
            traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
          },
        }),
      );

      yield* traceAuthenticatedRelayRequest(
        Effect.void.pipe(Effect.withSpan("relay.mint.handler")),
      ).pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        Effect.provideService(RelayClientTracer, Option.some(productTracer)),
      );

      expect(spans).toHaveLength(1);
      const span = spans[0]!;
      expect(span.traceId).toBe("0123456789abcdef0123456789abcdef");
      expect(Option.getOrUndefined(span.parent)?.spanId).toBe("0123456789abcdef");
    }),
  );
});

describe("reconcileDesiredCloudLink", () => {
  it.effect("requires stored CLI authorization without exposing an HTTP endpoint", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(reconcileDesiredCloudLink("http://127.0.0.1:3774"));

      expect(error).toMatchObject({
        _tag: "EnvironmentHttpUnauthorizedError",
        message: "Run `t3 connect link` to authorize this environment.",
      });
    }).pipe(
      Effect.provideService(
        ServerSecretStore.ServerSecretStore,
        makeSecretStore(unusedSecretStoreOperation),
      ),
      Effect.provideService(
        ServerEnvironment.ServerEnvironment,
        ServerEnvironment.ServerEnvironment.of({
          getEnvironmentId: unusedSecretStoreOperation(),
          getDescriptor: unusedSecretStoreOperation(),
        }),
      ),
      Effect.provideService(
        ManagedEndpointRuntime.CloudManagedEndpointRuntime,
        ManagedEndpointRuntime.CloudManagedEndpointRuntime.of({
          applyConfig: unusedSecretStoreOperation,
        } satisfies ManagedEndpointRuntime.CloudManagedEndpointRuntime["Service"]),
      ),
      Effect.provideService(
        EnvironmentAuth.EnvironmentAuth,
        EnvironmentAuth.EnvironmentAuth.of({} as EnvironmentAuth.EnvironmentAuth["Service"]),
      ),
      Effect.provideService(
        CliTokenManager.CloudCliTokenManager,
        CliTokenManager.CloudCliTokenManager.of({
          get: unusedSecretStoreOperation(),
          getExisting: Effect.succeed(Option.none()),
          hasCredential: unusedSecretStoreOperation(),
          clear: unusedSecretStoreOperation(),
        }),
      ),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make(() => unusedSecretStoreOperation()),
      ),
      Effect.provide(NodeServices.layer),
    ),
  );
});

describe("releaseManagedTunnelOnShutdown", () => {
  const encoder = new TextEncoder();

  function makeReleaseProgram(input?: {
    readonly cliDesired?: boolean;
    readonly cliDesiredMode?: "managed" | "publish_only";
    readonly replaceRuntimeConfigDuringRequest?: boolean;
    readonly responseOk?: boolean;
  }) {
    const secrets = new Map<string, Uint8Array>([
      [CLOUD_ENDPOINT_RUNTIME_CONFIG, encoder.encode('{"generation":"old"}')],
      [RELAY_URL_SECRET, encoder.encode("https://relay.example.test")],
    ]);
    if (input?.cliDesired !== false) {
      secrets.set(
        CLOUD_CLI_DESIRED_LINK_SECRET,
        encoder.encode(input?.cliDesiredMode ?? "managed"),
      );
    }
    const requests: HttpClientRequest.HttpClientRequest[] = [];
    const appliedConfigs: unknown[] = [];
    const secretStore = ServerSecretStore.ServerSecretStore.of({
      get: (name) => Effect.succeed(Option.fromNullishOr(secrets.get(name))),
      set: (name, value) =>
        Effect.sync(() => {
          secrets.set(name, value);
        }),
      create: unusedSecretStoreOperation,
      getOrCreateRandom: unusedSecretStoreOperation,
      remove: (name) =>
        Effect.sync(() => {
          secrets.delete(name);
        }),
    });
    const program = releaseManagedTunnelOnShutdown().pipe(
      Effect.provideService(ServerSecretStore.ServerSecretStore, secretStore),
      Effect.provideService(
        ServerEnvironment.ServerEnvironment,
        ServerEnvironment.ServerEnvironment.of({
          getEnvironmentId: Effect.succeed(EnvironmentId.make("environment-1")),
          getDescriptor: unusedSecretStoreOperation(),
        }),
      ),
      Effect.provideService(
        ManagedEndpointRuntime.CloudManagedEndpointRuntime,
        ManagedEndpointRuntime.CloudManagedEndpointRuntime.of({
          applyConfig: (config) =>
            Effect.sync(() => {
              appliedConfigs.push(config);
              return { status: "disabled" } as const;
            }),
        }),
      ),
      Effect.provideService(
        EnvironmentAuth.EnvironmentAuth,
        EnvironmentAuth.EnvironmentAuth.of({} as EnvironmentAuth.EnvironmentAuth["Service"]),
      ),
      Effect.provideService(
        CliTokenManager.CloudCliTokenManager,
        CliTokenManager.CloudCliTokenManager.of({
          get: unusedSecretStoreOperation(),
          getExisting: Effect.succeed(
            Option.some({
              accessToken: "access-token",
              refreshToken: "refresh-token",
              expiresAtEpochMs: Number.MAX_SAFE_INTEGER,
            }),
          ),
          hasCredential: unusedSecretStoreOperation(),
          clear: unusedSecretStoreOperation(),
        }),
      ),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            requests.push(request);
            if (input?.replaceRuntimeConfigDuringRequest === true) {
              secrets.set(CLOUD_ENDPOINT_RUNTIME_CONFIG, encoder.encode('{"generation":"new"}'));
            }
            return HttpClientResponse.fromWeb(
              request,
              Response.json({ ok: input?.responseOk ?? true }),
            );
          }),
        ),
      ),
      Effect.provide(NodeServices.layer),
    );
    return { appliedConfigs, program, requests, secrets };
  }

  it.effect("releases a managed tunnel and clears the matching runtime generation", () =>
    Effect.gen(function* () {
      const harness = makeReleaseProgram();

      expect(yield* harness.program).toBe(true);
      expect(harness.requests).toHaveLength(1);
      expect(harness.requests[0]?.method).toBe("DELETE");
      expect(harness.requests[0]?.url).toBe(
        "https://relay.example.test/v1/client/environment-links/environment-1/tunnel",
      );
      expect(harness.requests[0]?.headers.authorization).toBe("Bearer access-token");
      expect(harness.appliedConfigs).toEqual([null]);
      expect(harness.secrets.has(CLOUD_ENDPOINT_RUNTIME_CONFIG)).toBe(false);
    }),
  );

  it.effect("preserves a newer runtime generation installed while release is in flight", () =>
    Effect.gen(function* () {
      const harness = makeReleaseProgram({ replaceRuntimeConfigDuringRequest: true });

      expect(yield* harness.program).toBe(true);
      expect(new TextDecoder().decode(harness.secrets.get(CLOUD_ENDPOINT_RUNTIME_CONFIG))).toBe(
        '{"generation":"new"}',
      );
    }),
  );

  it.effect("preserves runtime state when the relay declines the release", () =>
    Effect.gen(function* () {
      const harness = makeReleaseProgram({ responseOk: false });

      expect(yield* harness.program).toBe(false);
      expect(harness.secrets.has(CLOUD_ENDPOINT_RUNTIME_CONFIG)).toBe(true);
    }),
  );

  it.effect("keeps paired-client managed tunnels live without restart authority", () =>
    Effect.gen(function* () {
      const harness = makeReleaseProgram({ cliDesired: false });

      expect(yield* harness.program).toBe(false);
      expect(harness.requests).toHaveLength(0);
      expect(harness.appliedConfigs).toEqual([]);
      expect(harness.secrets.has(CLOUD_ENDPOINT_RUNTIME_CONFIG)).toBe(true);
    }),
  );

  it.effect("keeps stale tunnel state live after CLI switches to publish-only mode", () =>
    Effect.gen(function* () {
      const harness = makeReleaseProgram({ cliDesiredMode: "publish_only" });

      expect(yield* harness.program).toBe(false);
      expect(harness.requests).toHaveLength(0);
      expect(harness.appliedConfigs).toEqual([]);
      expect(harness.secrets.has(CLOUD_ENDPOINT_RUNTIME_CONFIG)).toBe(true);
    }),
  );
});

describe("link proof provider kinds", () => {
  const proofRequest = (
    providerKind: RelayLinkProofRequest["endpoint"]["providerKind"],
  ): RelayLinkProofRequest => ({
    challenge: "challenge",
    relayIssuer: "https://relay.example.test",
    endpoint: {
      httpBaseUrl: "http://127.0.0.1:7331",
      wsBaseUrl: "ws://127.0.0.1:7331",
      providerKind,
    },
    origin: { localHttpHost: "127.0.0.1", localHttpPort: 7331 },
  });

  it("accepts managed and manual endpoints but not t3_relay", () => {
    expect(isSupportedLinkProviderKind(proofRequest("cloudflare_tunnel"))).toBe(true);
    expect(isSupportedLinkProviderKind(proofRequest("manual"))).toBe(true);
    expect(isSupportedLinkProviderKind(proofRequest("t3_relay"))).toBe(false);
  });

  it("only claims the managed-tunnel scope for tunnel links", () => {
    expect(linkProofScopes(proofRequest("cloudflare_tunnel"))).toEqual([
      "agent_activity_notifications",
      "managed_tunnels",
    ]);
    expect(linkProofScopes(proofRequest("manual"))).toEqual(["agent_activity_notifications"]);
  });
});
