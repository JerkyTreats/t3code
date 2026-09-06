import {
  AuthStandardClientScopes,
  EnvironmentId,
  PRIMARY_LOCAL_ENVIRONMENT_ID,
  type DesktopBridge,
  type DesktopSshEnvironmentTarget,
} from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { PlatformConnectionSource } from "@t3tools/client-runtime/platform";
import {
  PrimaryEnvironmentHttpClient,
  layer as primaryClientLayer,
} from "../environments/primary/httpClient";
import { primaryEnvironmentHttpLayer } from "../environments/primary/httpLayer";
import {
  hasBridgeBoundPrimaryTarget,
  readPrimaryEnvironmentTarget,
} from "../environments/primary/target";
import { __resetDesktopPrimaryAuthForTests } from "../environments/primary/desktopAuth";

import {
  platformConnectionSourceLayer,
  makePrimaryEnvironmentAuth,
  loadPrimaryConnectionRegistration,
  canRetainCachedPlatformRegistrationAfterRefreshFailure,
  canReuseCachedPlatformRegistration,
  primaryRegistrationToRetainAfterTopologyRead,
  provisionDesktopSshEnvironment,
  readPrimaryEnvironmentTargetResult,
  secondaryRegistrationsToRetainAfterTopologyRead,
  secondaryBearerExpiresAtEpochMs,
  secondaryBearerRefreshAtEpochMs,
} from "./platform.ts";

const TARGET: DesktopSshEnvironmentTarget = {
  alias: "devbox",
  hostname: "devbox.example.test",
  username: "developer",
  port: 22,
};

function makeBridge(
  calls: string[],
  options?: { readonly failDescriptor?: boolean },
): DesktopBridge {
  return {
    ensureSshEnvironment: async (target: DesktopSshEnvironmentTarget) => {
      calls.push("ensure");
      return {
        target,
        httpBaseUrl: "http://127.0.0.1:3201/",
        wsBaseUrl: "ws://127.0.0.1:3201/",
        pairingToken: "pairing-token",
      };
    },
    fetchSshEnvironmentDescriptor: async () => {
      calls.push("descriptor");
      if (options?.failDescriptor === true) {
        throw new Error("descriptor unavailable");
      }
      return {
        environmentId: EnvironmentId.make("environment-ssh"),
        label: "SSH environment",
        platform: {
          os: "linux",
          arch: "x64",
        },
        serverVersion: "0.0.0-test",
        capabilities: {
          repositoryIdentity: true,
        },
      };
    },
    bootstrapSshBearerSession: async () => {
      calls.push("token");
      return {
        access_token: "bearer-token",
        issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
        token_type: "Bearer",
        expires_in: 3_600,
        scope: AuthStandardClientScopes.join(" "),
      };
    },
  } as unknown as DesktopBridge;
}

describe("desktop SSH pairing", () => {
  it.effect("fetches the descriptor before consuming the one-time credential", () =>
    Effect.gen(function* () {
      const calls: string[] = [];

      const provisioned = yield* provisionDesktopSshEnvironment(makeBridge(calls), TARGET);

      expect(provisioned.environmentId).toBe(EnvironmentId.make("environment-ssh"));
      expect(calls).toEqual(["ensure", "descriptor", "token"]);
    }),
  );

  it.effect("does not consume the credential when descriptor discovery fails", () =>
    Effect.gen(function* () {
      const calls: string[] = [];

      yield* provisionDesktopSshEnvironment(
        makeBridge(calls, { failDescriptor: true }),
        TARGET,
      ).pipe(Effect.flip);

      expect(calls).toEqual(["ensure", "descriptor"]);
    }),
  );
});

describe("desktop-local bearer cache", () => {
  const registration = {} as never;

  it("refreshes a secondary bearer before it expires", () => {
    const issuedAtEpochMs = 10_000;
    const refreshAtEpochMs = secondaryBearerRefreshAtEpochMs(issuedAtEpochMs, 60);
    const expiresAtEpochMs = secondaryBearerExpiresAtEpochMs(issuedAtEpochMs, 60);
    const cached = {
      expiresAtEpochMs,
      signature: "secondary-signature",
      registration,
      refreshAtEpochMs,
    };

    expect(refreshAtEpochMs).toBe(65_000);
    expect(canReuseCachedPlatformRegistration(cached, cached.signature, 64_999)).toBe(true);
    expect(canReuseCachedPlatformRegistration(cached, cached.signature, 65_000)).toBe(false);
    expect(
      canRetainCachedPlatformRegistrationAfterRefreshFailure(cached, cached.signature, 69_999),
    ).toBe(true);
    expect(
      canRetainCachedPlatformRegistrationAfterRefreshFailure(cached, cached.signature, 70_000),
    ).toBe(false);
  });

  it("does not cache credentials whose lifetime is shorter than the refresh skew", () => {
    const refreshAtEpochMs = secondaryBearerRefreshAtEpochMs(10_000, 3);
    const cached = {
      expiresAtEpochMs: secondaryBearerExpiresAtEpochMs(10_000, 3),
      signature: "secondary-signature",
      registration,
      refreshAtEpochMs,
    };

    expect(refreshAtEpochMs).toBe(10_000);
    expect(canReuseCachedPlatformRegistration(cached, cached.signature, 10_000)).toBe(false);
  });

  it("retains only unexpired secondaries after a topology read failure", () => {
    const valid = {
      expiresAtEpochMs: 20_000,
      signature: "valid-secondary",
      registration,
      refreshAtEpochMs: 15_000,
    };
    const previous = new Map([
      ["valid-secondary", valid],
      [
        "expired-secondary",
        {
          expiresAtEpochMs: 10_000,
          signature: "expired-secondary",
          registration,
          refreshAtEpochMs: 5_000,
        },
      ],
    ]);

    expect(
      secondaryRegistrationsToRetainAfterTopologyRead(
        previous,
        { _tag: "Failure", cause: new Error("IPC unavailable") },
        10_000,
      ),
    ).toEqual(new Map([["valid-secondary", valid]]));
  });

  it("treats a successful empty topology as authoritative removal", () => {
    const previous = new Map([
      [
        "secondary",
        {
          expiresAtEpochMs: 20_000,
          signature: "secondary",
          registration,
          refreshAtEpochMs: 15_000,
        },
      ],
    ]);

    expect(
      secondaryRegistrationsToRetainAfterTopologyRead(
        previous,
        { _tag: "Success", bootstraps: [] },
        10_000,
      ),
    ).toEqual(new Map());
  });
});

describe("primary topology cache", () => {
  const registration = {} as never;
  const cached = {
    signature: "primary|http://127.0.0.1:3773/|ws://127.0.0.1:3773/",
    registration,
  };
  const previous = new Map([[PRIMARY_LOCAL_ENVIRONMENT_ID, cached]]);

  it("captures synchronous primary target read failures", () => {
    const cause = new Error("invalid primary target");

    expect(
      readPrimaryEnvironmentTargetResult(() => {
        throw cause;
      }),
    ).toEqual({ _tag: "Failure", cause });
  });

  it("retains the cached primary after a transient topology read failure", () => {
    expect(
      primaryRegistrationToRetainAfterTopologyRead(previous, {
        _tag: "Failure",
        cause: new Error("IPC unavailable"),
      }),
    ).toBe(cached);
  });

  it("treats a successful primary absence as authoritative removal", () => {
    expect(
      primaryRegistrationToRetainAfterTopologyRead(previous, {
        _tag: "Success",
        target: null,
      }),
    ).toBeUndefined();
  });
});

describe.sequential("primary platform authentication", () => {
  afterEach(() => {
    __resetDesktopPrimaryAuthForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.effect("keeps standalone Code on its window origin and cookie path", () => {
    const getBearer = vi.fn(() => {
      throw new Error("standalone has no backend credential");
    });
    vi.stubGlobal("window", {
      location: new URL("https://standalone.example.test/"),
      desktopBridge: {
        getLocalEnvironmentBootstraps: () => [],
        getLocalEnvironmentBearerToken: getBearer,
      },
    });
    vi.stubEnv("VITE_HTTP_URL", "https://foreign.example.test/");
    const auth = makePrimaryEnvironmentAuth();
    return Effect.gen(function* () {
      expect(yield* auth.bearerToken).toEqual(Option.none());
      expect(auth.webSocketTicket).toBeUndefined();
      expect(hasBridgeBoundPrimaryTarget()).toBe(true);
      expect(readPrimaryEnvironmentTarget().target.httpBaseUrl).toBe(
        "https://standalone.example.test/",
      );
      expect(getBearer).not.toHaveBeenCalled();
    });
  });

  it.effect("preserves ordinary desktop primary bearer acquisition", () => {
    const getBearer = vi.fn().mockResolvedValue("synthetic-local-bearer");
    vi.stubGlobal("window", {
      location: new URL("https://desktop.example.test/"),
      desktopBridge: {
        getLocalEnvironmentBootstraps: () => [
          {
            id: "primary",
            httpBaseUrl: "http://localhost:3773/",
            wsBaseUrl: "ws://localhost:3773/",
          },
        ],
        getLocalEnvironmentBearerToken: getBearer,
      },
    });
    const auth = makePrimaryEnvironmentAuth();
    return Effect.gen(function* () {
      expect(yield* auth.bearerToken).toEqual(Option.some("synthetic-local-bearer"));
      expect(auth.webSocketTicket).toBeUndefined();
      expect(getBearer).toHaveBeenCalledTimes(1);
    });
  });

  it.effect(
    "joins fresh-profile session, public descriptor and new tickets through protected HTTP",
    () => {
      const origin = "https://thread.example.test";
      const requests: Array<{
        path: string;
        rendererAuthorization: string | null;
        networkAuthorization: string | null;
      }> = [];
      let serial = 0;
      vi.stubGlobal("window", {
        location: new URL(origin),
        t3ThreadBridge: {},
        desktopBridge: {
          getLocalEnvironmentBearerToken: () => {
            throw new Error("renderer bearer forbidden");
          },
        },
      });
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        expect(request.credentials).toBe("omit");
        expect(request.redirect).toBe("error");
        const path = new URL(request.url).pathname;
        const rendererAuthorization = request.headers.get("authorization");
        // Synthetic main boundary adds its credential only after renderer request construction.
        const networkHeaders = new Headers(request.headers);
        if (new URL(request.url).origin === origin && path.startsWith("/api/"))
          networkHeaders.set("authorization", "Bearer synthetic-main-only");
        requests.push({
          path,
          rendererAuthorization,
          networkAuthorization: networkHeaders.get("authorization"),
        });
        const body =
          path === "/api/auth/session"
            ? {
                authenticated: true,
                sessionMethod: "bearer-access-token",
                expiresAt: "2099-01-01T00:00:00.000Z",
                auth: {
                  policy: "remote-reachable",
                  bootstrapMethods: ["one-time-token"],
                  sessionMethods: ["bearer-access-token"],
                  sessionCookieName: "fixture",
                },
              }
            : path === "/.well-known/t3/environment"
              ? {
                  environmentId: "synthetic-thread-environment",
                  label: "Thread fixture",
                  platform: { os: "linux", arch: "x64" },
                  serverVersion: "0.0.0-test",
                  capabilities: { repositoryIdentity: true },
                }
              : { ticket: `one-use-${++serial}`, expiresAt: "2099-01-01T00:00:00.000Z" };
        return Object.defineProperty(Response.json(body), "url", { value: request.url });
      });
      return Effect.gen(function* () {
        const session = yield* PrimaryEnvironmentHttpClient.pipe(
          Effect.flatMap((client) => client.auth.session({ headers: {} })),
          Effect.provide(primaryClientLayer.pipe(Layer.provide(primaryEnvironmentHttpLayer))),
        );
        expect(session.authenticated).toBe(true);
        const registration = yield* loadPrimaryConnectionRegistration(
          readPrimaryEnvironmentTarget(),
        );
        expect(registration.target.environmentId).toBe("synthetic-thread-environment");
        const auth = makePrimaryEnvironmentAuth();
        expect(yield* auth.bearerToken).toEqual(Option.none());
        expect((yield* auth.webSocketTicket!(registration.target)).ticket).toBe("one-use-1");
        expect((yield* auth.webSocketTicket!(registration.target)).ticket).toBe("one-use-2");
        expect(requests.map((request) => request.path)).toEqual([
          "/api/auth/session",
          "/.well-known/t3/environment",
          "/api/auth/websocket-ticket",
          "/api/auth/websocket-ticket",
        ]);
        expect(requests.every((request) => request.rendererAuthorization === null)).toBe(true);
        expect(requests[1]?.networkAuthorization).toBeNull();
        expect(
          requests
            .filter((request) => request.path.startsWith("/api/"))
            .every((request) => request.networkAuthorization === "Bearer synthetic-main-only"),
        ).toBe(true);
      });
    },
  );

  it.effect("registers protected Thread despite a hosted static bundle channel", () => {
    vi.stubGlobal("window", {
      location: new URL("https://thread.example.test/"),
      t3ThreadBridge: {},
    });
    vi.stubEnv("VITE_HOSTED_APP_CHANNEL", "latest");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) =>
      Object.defineProperty(
        Response.json({
          environmentId: "synthetic-thread-environment",
          label: "Thread fixture",
          platform: { os: "linux", arch: "x64" },
          serverVersion: "0.0.0-test",
          capabilities: { repositoryIdentity: true },
        }),
        "url",
        { value: input.toString() },
      ),
    );
    return Effect.gen(function* () {
      const source = yield* PlatformConnectionSource;
      const emissions = yield* source.registrations.pipe(Stream.take(1), Stream.runCollect);
      expect(emissions[0]?.[0]?.target.environmentId).toBe("synthetic-thread-environment");
    }).pipe(Effect.provide(platformConnectionSourceLayer));
  });

  it.effect("rejects a descriptor redirected away from the enrolled origin", () => {
    vi.stubGlobal("window", {
      location: new URL("https://thread.example.test/"),
      t3ThreadBridge: {},
    });
    const fetch = vi.fn().mockResolvedValue(
      Object.defineProperty(Response.json({}), "url", {
        value: "https://foreign.example.test/.well-known/t3/environment",
      }),
    );
    vi.stubGlobal("fetch", fetch);
    return Effect.gen(function* () {
      expect(
        yield* loadPrimaryConnectionRegistration(readPrimaryEnvironmentTarget()).pipe(Effect.flip),
      ).toMatchObject({ _tag: "ConnectionTransientError" });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
