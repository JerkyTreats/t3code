import { createClerkClient, verifyToken } from "@clerk/backend";
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import * as Redacted from "effect/Redacted";
import * as Semaphore from "effect/Semaphore";
import * as TestClock from "effect/testing/TestClock";
import * as Tracer from "effect/Tracer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { RelayEnvironmentAuth } from "@t3tools/contracts/relay";

import {
  RELAY_REQUEST_DEADLINE_MS,
  relayCors,
  relayDocsRedirectRoute,
  relayEnvironmentAuthLayer,
  relayNotFoundRoute,
  releaseEnvironmentTunnelRecord,
  traceRelayHttpRequestWith,
  unlinkEnvironmentRecord,
  verifyRelayClientBearerToken,
  withoutCapturedParentSpan,
} from "./Api.ts";
import * as RelayConfiguration from "../Config.ts";
import * as EnvironmentCredentials from "../environments/EnvironmentCredentials.ts";
import * as EnvironmentLinks from "../environments/EnvironmentLinks.ts";
import * as ManagedEndpointProvider from "../environments/ManagedEndpointProvider.ts";
import * as RelayDb from "../db.ts";

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(),
  verifyToken: vi.fn(),
}));

const relaySettings: RelayConfiguration.RelayConfiguration["Service"] = {
  relayIssuer: "https://relay.example.test",
  apns: {
    teamId: "apns-team",
    keyId: "apns-key",
    privateKey: Redacted.make("apns-private-key"),
    bundleId: "com.example.t3",
    environment: "sandbox",
  },
  clerkSecretKey: Redacted.make("clerk-secret-key"),
  clerkPublishableKey: "pk_test_test",
  clerkJwtAudience: "t3-code-relay",
  apnsDeliveryJobSigningSecret: Redacted.make("apns-delivery-secret"),
  cloudMintPrivateKey: Redacted.make("cloud-mint-private-key"),
  cloudMintPublicKey: "cloud-mint-public-key",
  managedEndpointBaseDomain: undefined,
  managedEndpointNamespace: undefined,
};

describe("relay client authentication", () => {
  it.effect("preserves the existing Clerk session JWT path", () =>
    Effect.gen(function* () {
      vi.mocked(verifyToken).mockResolvedValue({
        sub: "user_session",
        aud: relaySettings.clerkJwtAudience,
      } as never);

      expect(yield* verifyRelayClientBearerToken(relaySettings, "session-token")).toEqual({
        sub: "user_session",
        mode: "clerk_session_bearer",
      });
      expect(verifyToken).toHaveBeenCalledWith("session-token", {
        secretKey: "clerk-secret-key",
        audience: relaySettings.clerkJwtAudience,
      });
      expect(createClerkClient).not.toHaveBeenCalled();
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          vi.mocked(verifyToken).mockReset();
          vi.mocked(createClerkClient).mockReset();
        }),
      ),
    ),
  );

  it.effect("falls back to Clerk OAuth token verification for the headless CLI", () =>
    Effect.gen(function* () {
      vi.mocked(verifyToken).mockRejectedValue(new Error("not a session JWT"));
      vi.mocked(createClerkClient).mockReturnValue({
        authenticateRequest: vi.fn().mockResolvedValue({
          isAuthenticated: true,
          toAuth: () => ({ userId: "user_oauth" }),
        }),
      } as never);

      expect(yield* verifyRelayClientBearerToken(relaySettings, "oauth-token")).toEqual({
        sub: "user_oauth",
        mode: "clerk_oauth_bearer",
      });
      expect(createClerkClient).toHaveBeenCalledWith({
        secretKey: "clerk-secret-key",
        publishableKey: "pk_test_test",
      });
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          vi.mocked(verifyToken).mockReset();
          vi.mocked(createClerkClient).mockReset();
        }),
      ),
    ),
  );
});

describe("relay environment authentication", () => {
  it.effect("preserves credential lookup persistence failures as internal errors", () => {
    const failure = new EnvironmentCredentials.EnvironmentCredentialAuthenticatePersistenceError({
      stage: "lookup-credential",
      cause: "database unavailable",
    });
    const credentials: EnvironmentCredentials.EnvironmentCredentials["Service"] = {
      create: () => Effect.die("unused create"),
      authenticate: () => Effect.fail(failure),
      revokeForEnvironmentPublicKey: () => Effect.die("unused revoke"),
    };

    return Effect.gen(function* () {
      const auth = yield* RelayEnvironmentAuth;
      const error = yield* Effect.flip(
        auth.environmentBearer(Effect.succeed(HttpServerResponse.empty()), {
          credential: Redacted.make("environment-credential"),
          endpoint: {} as never,
          group: {} as never,
        }),
      );

      expect(Predicate.isTagged(error, "RelayInternalError")).toBe(true);
      if (Predicate.isTagged(error, "RelayInternalError")) {
        expect(error.reason).toBe("persistence_failed");
      }
    }).pipe(
      Effect.provideService(
        HttpServerRequest.HttpServerRequest,
        HttpServerRequest.fromWeb(new Request("https://relay.test/v1/server/link")),
      ),
      Effect.provideService(HttpServerRequest.ParsedSearchParams, {}),
      Effect.provideService(HttpRouter.RouteContext, {
        params: {},
        route: {} as never,
      }),
      Effect.provide(
        relayEnvironmentAuthLayer.pipe(
          Layer.provide(Layer.succeed(EnvironmentCredentials.EnvironmentCredentials, credentials)),
        ),
      ),
      Effect.scoped,
    );
  });
});

describe("relay environment unlink", () => {
  it.effect("commits link and credential revocation before external deprovision", () => {
    const calls: string[] = [];
    let transactionDepth = 0;
    const target = {
      userId: "user-1",
      environmentId: "environment-1",
      hostname: "environment-1.example.test",
      tunnelId: "tunnel-1",
      tunnelName: "environment-1-tunnel",
      dnsRecordId: "dns-1",
      readyAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "unlink-generation",
    };
    const client = Object.assign(
      (_strings: TemplateStringsArray, lockKey: unknown) =>
        Effect.sync(() => {
          expect(lockKey).toBe(
            EnvironmentLinks.environmentLinkLockKey({
              userId: "user-1",
              environmentId: "environment-1",
            }),
          );
          calls.push("lock");
        }),
      {
        withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.gen(function* () {
            transactionDepth += 1;
            const outermost = transactionDepth === 1;
            calls.push(outermost ? "transaction" : "savepoint");
            const result = yield* effect;
            calls.push(outermost ? "commit" : "release-savepoint");
            transactionDepth -= 1;
            return result;
          }),
      },
    );
    const db = {
      $client: client,
    } as unknown as RelayDb.RelayDb["Service"];
    const links = {
      getForUser: () =>
        Effect.succeed({
          environmentId: "environment-1",
          environmentPublicKey: "public-key-1",
        } as never),
      revokeForUser: () =>
        Effect.sync(() => {
          calls.push("link");
          return true;
        }),
    } as unknown as EnvironmentLinks.EnvironmentLinks["Service"];
    const credentials = {
      revokeForEnvironmentPublicKey: () =>
        Effect.sync(() => {
          calls.push("credential");
          return true;
        }),
    } as unknown as EnvironmentCredentials.EnvironmentCredentials["Service"];
    const managedEndpoints = {
      prepareDeprovision: () =>
        Effect.sync(() => {
          calls.push("prepare");
          return target;
        }),
      deprovision: (input: { readonly target?: unknown }) =>
        Effect.sync(() => {
          expect(input.target).toBe(target);
          calls.push("deprovision");
        }),
    } as unknown as ManagedEndpointProvider.ManagedEndpointProvider["Service"];

    return Effect.gen(function* () {
      const unlinked = yield* unlinkEnvironmentRecord(
        { db, links, credentials, managedEndpoints },
        { userId: "user-1", environmentId: "environment-1" },
      );

      expect(unlinked).toBe(true);
      expect(calls).toEqual([
        "transaction",
        "lock",
        "prepare",
        "link",
        "credential",
        "commit",
        "deprovision",
      ]);
    });
  });

  it.effect("does not deprovision when revocation fails to commit", () => {
    const failure = new Error("transaction failed");
    let transactionDepth = 0;
    let deprovisioned = false;
    const client = Object.assign(() => Effect.void, {
      withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.gen(function* () {
          transactionDepth += 1;
          const outermost = transactionDepth === 1;
          const result = yield* effect;
          transactionDepth -= 1;
          return outermost ? yield* Effect.fail(failure) : result;
        }),
    });
    const db = {
      $client: client,
    } as unknown as RelayDb.RelayDb["Service"];
    const links = {
      getForUser: () =>
        Effect.succeed({
          environmentId: "environment-1",
          environmentPublicKey: "public-key-1",
        } as never),
      revokeForUser: () => Effect.succeed(true),
    } as unknown as EnvironmentLinks.EnvironmentLinks["Service"];
    const credentials = {
      revokeForEnvironmentPublicKey: () => Effect.succeed(true),
    } as unknown as EnvironmentCredentials.EnvironmentCredentials["Service"];
    const managedEndpoints = {
      prepareDeprovision: () =>
        Effect.succeed({
          userId: "user-1",
          environmentId: "environment-1",
          updatedAt: "unlink-generation",
        } as never),
      deprovision: () =>
        Effect.sync(() => {
          deprovisioned = true;
        }),
    } as unknown as ManagedEndpointProvider.ManagedEndpointProvider["Service"];

    return Effect.gen(function* () {
      const error = yield* Effect.flip(
        unlinkEnvironmentRecord(
          { db, links, credentials, managedEndpoints },
          { userId: "user-1", environmentId: "environment-1" },
        ),
      );

      expect(error).toBe(failure);
      expect(deprovisioned).toBe(false);
    });
  });

  it.effect("serializes shutdown release before unlink captures its cleanup generation", () =>
    Effect.gen(function* () {
      const transactionLock = yield* Semaphore.make(1);
      const releaseStarted = yield* Deferred.make<void>();
      const continueRelease = yield* Deferred.make<void>();
      let linkActive = true;
      let allocation: { readonly generation: number; readonly dnsRecordId: string } | null = {
        generation: 7,
        dnsRecordId: "dns-1",
      };
      const dnsRecords = new Set(["dns-1"]);

      const client = Object.assign(() => Effect.void, {
        withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          transactionLock.withPermits(1)(effect),
      });
      const db = {
        $client: client,
      } as unknown as RelayDb.RelayDb["Service"];
      const links = {
        getForUser: () =>
          Effect.sync(() =>
            linkActive
              ? ({
                  environmentId: "environment-1",
                  environmentPublicKey: "public-key-1",
                } as never)
              : null,
          ),
        revokeForUser: () =>
          Effect.sync(() => {
            linkActive = false;
            return true;
          }),
      } as unknown as EnvironmentLinks.EnvironmentLinks["Service"];
      const credentials = {
        revokeForEnvironmentPublicKey: () => Effect.succeed(true),
      } as unknown as EnvironmentCredentials.EnvironmentCredentials["Service"];
      const managedEndpoints = {
        release: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(releaseStarted, undefined);
            yield* Deferred.await(continueRelease);
            if (allocation === null) {
              return false;
            }
            allocation = {
              ...allocation,
              generation: allocation.generation + 1,
            };
            return true;
          }),
        prepareDeprovision: () =>
          Effect.sync(() =>
            allocation === null
              ? null
              : ({
                  userId: "user-1",
                  environmentId: "environment-1",
                  hostname: "environment-1.example.test",
                  tunnelId: "tunnel-1",
                  tunnelName: "environment-1-tunnel",
                  readyAt: "2026-07-29T00:00:00.000Z",
                  updatedAt: "unlink-generation",
                  ...allocation,
                } as never),
          ),
        deprovision: (input: { readonly target?: { readonly generation: number } | null }) =>
          Effect.sync(() => {
            if (
              allocation !== null &&
              input.target !== null &&
              input.target !== undefined &&
              allocation.generation === input.target.generation
            ) {
              dnsRecords.delete(allocation.dnsRecordId);
              allocation = null;
            }
          }),
      } as unknown as ManagedEndpointProvider.ManagedEndpointProvider["Service"];

      const releaseFiber = yield* Effect.forkChild(
        releaseEnvironmentTunnelRecord(
          { db, links, managedEndpoints },
          { userId: "user-1", environmentId: "environment-1" },
        ),
      );
      yield* Deferred.await(releaseStarted);
      const unlinkFiber = yield* Effect.forkChild(
        unlinkEnvironmentRecord(
          { db, links, credentials, managedEndpoints },
          { userId: "user-1", environmentId: "environment-1" },
        ),
      );
      yield* Deferred.succeed(continueRelease, undefined);

      expect(yield* Fiber.join(releaseFiber)).toBe(true);
      expect(yield* Fiber.join(unlinkFiber)).toBe(true);
      expect(linkActive).toBe(false);
      expect(allocation).toBeNull();
      expect(dnsRecords.size).toBe(0);
      expect(allocation === null ? 0 : 1).toBe(0);
    }),
  );
});

describe("relay request tracing", () => {
  it.effect(
    "does not parent endpoint spans to an ambient parent captured while building handlers",
    () =>
      Effect.gen(function* () {
        const spans: Array<Tracer.NativeSpan> = [];
        const tracer = Tracer.make({
          span: (options) => {
            const span = new Tracer.NativeSpan(options);
            spans.push(span);
            return span;
          },
        });
        const ambientParent = Tracer.externalSpan({
          traceId: "00000000000000000000000000000001",
          spanId: "0000000000000001",
          sampled: true,
        });
        const endpoint = yield* withoutCapturedParentSpan(
          Effect.context<never>().pipe(
            Effect.map((capturedContext: Context.Context<never>) =>
              Effect.succeed(HttpServerResponse.empty({ status: 204 })).pipe(
                Effect.withSpan("relay.test.endpoint"),
                Effect.provideContext(capturedContext),
              ),
            ),
          ),
        ).pipe(Effect.provideService(Tracer.ParentSpan, ambientParent));
        const request = HttpServerRequest.fromWeb(
          new Request("https://relay.test/v1/mobile/devices?client=mobile", {
            method: "POST",
            headers: {
              authorization: "Bearer secret",
              dpop: "signed-proof",
            },
          }),
        );

        yield* traceRelayHttpRequestWith(endpoint, Layer.succeed(Tracer.Tracer, tracer)).pipe(
          Effect.provideService(HttpServerRequest.HttpServerRequest, request),
        );

        expect(spans.map((span) => span.name)).toEqual(["http.server POST", "relay.test.endpoint"]);
        expect(spans[0]?.kind).toBe("server");
        expect(spans[0]?.attributes.get("url.path")).toBe("/v1/mobile/devices");
        expect(spans[0]?.attributes.get("http.response.status_code")).toBe(204);
        expect(spans[0]?.attributes.get("http.request.header.authorization")).toBe("<redacted>");
        expect(spans[0]?.attributes.get("http.request.header.dpop")).toBe("<redacted>");
        expect(Option.isNone(spans[0]!.parent)).toBe(true);
        expect(Option.getOrUndefined(spans[1]!.parent)?.spanId).toBe(spans[0]?.spanId);
      }),
  );

  it.effect("fails hung requests with a 504 before the client's 10s abort", () =>
    Effect.gen(function* () {
      const spans: Array<Tracer.NativeSpan> = [];
      const tracer = Tracer.make({
        span: (options) => {
          const span = new Tracer.NativeSpan(options);
          spans.push(span);
          return span;
        },
      });
      const request = HttpServerRequest.fromWeb(
        new Request("https://relay.test/v1/mobile/devices", { method: "POST" }),
      );

      const fiber = yield* traceRelayHttpRequestWith(
        Effect.never,
        Layer.succeed(Tracer.Tracer, tracer),
      ).pipe(Effect.provideService(HttpServerRequest.HttpServerRequest, request), Effect.forkChild);
      yield* TestClock.adjust(Duration.millis(RELAY_REQUEST_DEADLINE_MS));
      const response = yield* Fiber.join(fiber);

      expect(response.status).toBe(504);
      expect(spans[0]?.attributes.get("relay.request.deadline_exceeded")).toBe(true);
      expect(spans[0]?.attributes.get("http.response.status_code")).toBe(504);
    }),
  );
});

describe("relay routing fallback", () => {
  it.effect("redirects the relay root to the API docs", () =>
    Effect.gen(function* () {
      const request = HttpServerRequest.fromWeb(new Request("https://relay.test/"));
      const httpEffect = yield* HttpRouter.toHttpEffect(
        Layer.mergeAll(relayDocsRedirectRoute, relayNotFoundRoute, relayCors),
      );
      const response = yield* httpEffect.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      );

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("/docs");
      expect(response.headers["access-control-allow-origin"]).toBe("*");
    }).pipe(Effect.scoped),
  );

  it.effect("returns a CORS-compatible 404 response for unmatched paths", () =>
    Effect.gen(function* () {
      const request = HttpServerRequest.fromWeb(
        new Request("https://relay.test/v1/environmentsd", { method: "GET" }),
      );
      const httpEffect = yield* HttpRouter.toHttpEffect(Layer.merge(relayNotFoundRoute, relayCors));
      const response = yield* httpEffect.pipe(
        Effect.provideService(HttpServerRequest.HttpServerRequest, request),
      );

      expect(response.status).toBe(404);
      expect(response.headers["access-control-allow-origin"]).toBe("*");
    }).pipe(Effect.scoped),
  );
});
