import {
  AuthStandardClientScopes,
  EnvironmentId,
  PRIMARY_LOCAL_ENVIRONMENT_ID,
  type DesktopBridge,
  type DesktopSshEnvironmentBootstrap,
  type DesktopSshEnvironmentTarget,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { afterEach, vi } from "vite-plus/test";
import { ClientCapabilities, PlatformConnectionSource } from "@t3tools/client-runtime/platform";
import {
  PrimaryEnvironmentHttpClient,
  layer as primaryClientLayer,
} from "../environments/primary/httpClient";
import { layer as primaryEnvironmentHttpLayer } from "../environments/primary/httpLayer";
import {
  hasBridgeBoundPrimaryTarget,
  readPrimaryEnvironmentTarget,
} from "../environments/primary/target";
import { __resetDesktopPrimaryAuthForTests } from "../environments/primary/desktopAuth";
import {
  ConnectionBlockedError,
  ConnectionTransientError,
} from "@t3tools/client-runtime/connection";

import {
  canRetainCachedPlatformRegistrationAfterRefreshFailure,
  canReuseCachedPlatformRegistration,
  layer,
  layerPlatformConnectionSource as platformConnectionSourceLayer,
  loadPrimaryConnectionRegistration,
  makePrimaryEnvironmentAuth,
  isRejectedBootstrapCredentialError,
  isRejectedSecondaryBootstrap,
  nextRejectedSecondaryBootstrap,
  primaryRegistrationToRetainAfterTopologyRead,
  prepareDesktopSshEnvironment,
  provisionDesktopSshEnvironment,
  secondaryRegistrationsToRetainAfterTopologyRead,
} from "./platform.ts";

const TARGET: DesktopSshEnvironmentTarget = {
  alias: "devbox",
  hostname: "devbox.example.test",
  username: "developer",
  port: 22,
};

const SSH_BOOTSTRAP = {
  target: TARGET,
  httpBaseUrl: "http://127.0.0.1:3201/",
  wsBaseUrl: "ws://127.0.0.1:3201/",
  pairingToken: "abandoned-token",
};

function pendingSetup() {
  let resolve!: (bootstrap: DesktopSshEnvironmentBootstrap) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<DesktopSshEnvironmentBootstrap>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeBridge(
  calls: string[],
  options?: {
    readonly failDescriptor?: boolean;
    readonly savedTokenRejected?: boolean;
    readonly savedTokenPermissions?: ReadonlyArray<string>;
  },
): DesktopBridge {
  return {
    ensureSshEnvironment: async (
      target: DesktopSshEnvironmentTarget,
      ensureOptions?: { issuePairingToken?: boolean },
    ) => {
      calls.push("ensure");
      return {
        target,
        httpBaseUrl: "http://127.0.0.1:3201/",
        wsBaseUrl: "ws://127.0.0.1:3201/",
        pairingToken: ensureOptions?.issuePairingToken === true ? "pairing-token" : null,
      };
    },
    disconnectSshEnvironment: async () => {
      calls.push("disconnect");
    },
    fetchSshSessionState: async () => {
      calls.push("session");
      return {
        authenticated: options?.savedTokenRejected !== true,
        permissions: options?.savedTokenPermissions ?? AuthStandardClientScopes,
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
  it.effect("does not consume the credential when adding a route to a different machine", () =>
    Effect.gen(function* () {
      const calls: string[] = [];

      const error = yield* provisionDesktopSshEnvironment(
        makeBridge(calls),
        TARGET,
        EnvironmentId.make("some-other-machine"),
      ).pipe(Effect.flip);

      expect(error).toMatchObject({ reason: "configuration" });
      expect(calls).toEqual(["ensure", "descriptor"]);
    }),
  );

  it.effect("exchanges one setup credential after repeated interrupted provisions", () =>
    Effect.gen(function* () {
      const bridge = makeBridge([]);
      const setup = pendingSetup();
      const ensure = vi.spyOn(bridge, "ensureSshEnvironment").mockReturnValue(setup.promise);
      const exchange = vi.spyOn(bridge, "bootstrapSshBearerSession");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const interrupted = yield* Effect.forkChild(
          provisionDesktopSshEnvironment(bridge, TARGET),
          { startImmediately: true },
        );
        yield* Fiber.interrupt(interrupted);
      }

      const retry = yield* Effect.forkChild(provisionDesktopSshEnvironment(bridge, TARGET), {
        startImmediately: true,
      });
      setup.resolve(SSH_BOOTSTRAP);
      const provisioned = yield* Fiber.join(retry);

      expect(provisioned.bearerToken).toBe("bearer-token");
      expect(ensure).toHaveBeenCalledExactlyOnceWith(TARGET, { issuePairingToken: true });
      expect(exchange).toHaveBeenCalledExactlyOnceWith(
        SSH_BOOTSTRAP.httpBaseUrl,
        "abandoned-token",
      );
    }),
  );

  it.effect("starts fresh after an abandoned setup settles in success or failure", () =>
    Effect.gen(function* () {
      for (const outcome of ["success", "failure"]) {
        const bridge = makeBridge([]);
        const setup = pendingSetup();
        const ensure = vi.spyOn(bridge, "ensureSshEnvironment").mockReturnValueOnce(setup.promise);
        const exchange = vi.spyOn(bridge, "bootstrapSshBearerSession");
        const interrupted = yield* Effect.forkChild(
          provisionDesktopSshEnvironment(bridge, TARGET),
          { startImmediately: true },
        );
        yield* Fiber.interrupt(interrupted);
        if (outcome === "success") setup.resolve(SSH_BOOTSTRAP);
        else setup.reject(new Error("remote launch failed"));
        yield* Effect.promise(() =>
          setup.promise.then(
            () => undefined,
            () => undefined,
          ),
        );

        const provisioned = yield* provisionDesktopSshEnvironment(bridge, TARGET);

        expect(provisioned.bearerToken).toBe("bearer-token");
        expect(ensure).toHaveBeenCalledTimes(2);
        expect(exchange).toHaveBeenCalledExactlyOnceWith(
          SSH_BOOTSTRAP.httpBaseUrl,
          "pairing-token",
        );
      }
    }),
  );

  it.effect("disconnect invalidates unfinished setup even before provision is interrupted", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const bridge = makeBridge(calls);
      const setup = pendingSetup();
      const ensure = vi.spyOn(bridge, "ensureSshEnvironment").mockReturnValueOnce(setup.promise);
      const exchange = vi.spyOn(bridge, "bootstrapSshBearerSession");
      vi.stubGlobal("window", { desktopBridge: bridge });
      const ssh = yield* ClientCapabilities.SshEnvironmentGateway.pipe(Effect.provide(layer));
      const interrupted = yield* Effect.forkChild(ssh.provision(TARGET), {
        startImmediately: true,
      });
      yield* ssh.disconnect(TARGET);
      yield* Fiber.interrupt(interrupted);

      const retry = yield* Effect.forkChild(ssh.provision(TARGET), { startImmediately: true });
      setup.resolve(SSH_BOOTSTRAP);
      const provisioned = yield* Fiber.join(retry);

      expect(provisioned.bearerToken).toBe("bearer-token");
      expect(ensure).toHaveBeenCalledTimes(2);
      expect(calls).toEqual(["disconnect", "ensure", "descriptor", "token"]);
      expect(exchange).toHaveBeenCalledExactlyOnceWith(SSH_BOOTSTRAP.httpBaseUrl, "pairing-token");
    }),
  );

  it.effect("reconnects with the saved token while it holds every standard scope", () =>
    Effect.gen(function* () {
      const calls: string[] = [];

      const bridge = makeBridge(calls);
      const ensure = vi.spyOn(bridge, "ensureSshEnvironment");
      const prepared = yield* prepareDesktopSshEnvironment(bridge, {
        target: TARGET,
        expectedEnvironmentId: EnvironmentId.make("environment-ssh"),
        bearerToken: "saved-token",
      });

      expect(prepared.bearerToken).toBe("saved-token");
      expect(ensure).toHaveBeenCalledExactlyOnceWith(TARGET, { issuePairingToken: false });
      expect(calls).toEqual(["ensure", "descriptor", "session"]);
    }),
  );

  it.effect("pairs again when the host no longer accepts the saved token", () =>
    Effect.gen(function* () {
      const calls: string[] = [];

      const prepared = yield* prepareDesktopSshEnvironment(
        makeBridge(calls, { savedTokenRejected: true }),
        {
          target: TARGET,
          expectedEnvironmentId: EnvironmentId.make("environment-ssh"),
          bearerToken: "saved-token",
        },
      );

      expect(prepared.bearerToken).toBe("bearer-token");
      expect(calls).toEqual(["ensure", "descriptor", "session", "ensure", "descriptor", "token"]);
    }),
  );

  it.effect("pairs again when the saved token predates a standard scope", () =>
    Effect.gen(function* () {
      const calls: string[] = [];

      const prepared = yield* prepareDesktopSshEnvironment(
        makeBridge(calls, {
          savedTokenPermissions: ["orchestration:read", "orchestration:operate"],
        }),
        {
          target: TARGET,
          expectedEnvironmentId: EnvironmentId.make("environment-ssh"),
          bearerToken: "saved-token",
        },
      );

      expect(prepared.bearerToken).toBe("bearer-token");
      expect(calls).toEqual(["ensure", "descriptor", "session", "ensure", "descriptor", "token"]);
    }),
  );

  it.effect("stops before sending the saved token or pairing on a different machine", () =>
    Effect.gen(function* () {
      const calls: string[] = [];

      const error = yield* prepareDesktopSshEnvironment(makeBridge(calls), {
        target: TARGET,
        expectedEnvironmentId: EnvironmentId.make("some-other-machine"),
        bearerToken: "saved-token",
      }).pipe(Effect.flip);

      expect(error).toMatchObject({ reason: "configuration" });
      expect(calls).toEqual(["ensure", "descriptor"]);
    }),
  );
});

describe("desktop-local bearer cache", () => {
  const registration = {} as never;

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

describe("rejected desktop-local bootstrap tokens", () => {
  it("retries at once when the token or endpoint changes", () => {
    const rejected = nextRejectedSecondaryBootstrap(undefined, "http://a|ws://a|old-token", 0);

    expect(isRejectedSecondaryBootstrap(rejected, "http://a|ws://a|new-token", 1)).toBe(false);
    expect(isRejectedSecondaryBootstrap(rejected, "http://b|ws://b|old-token", 1)).toBe(false);
    expect(isRejectedSecondaryBootstrap(undefined, "http://a|ws://a|old-token", 1)).toBe(false);
    expect(nextRejectedSecondaryBootstrap(rejected, "http://a|ws://a|new-token", 1).delayMs).toBe(
      60_000,
    );
  });

  // regression: #16273 a rejected desktop-local credential was retried every poll
  it("treats only authentication rejections as a dead credential", () => {
    expect(
      isRejectedBootstrapCredentialError(
        new ConnectionBlockedError({ reason: "authentication", detail: "invalid" }),
      ),
    ).toBe(true);
    expect(
      isRejectedBootstrapCredentialError(
        new ConnectionTransientError({ reason: "endpoint-unavailable", detail: "booting" }),
      ),
    ).toBe(false);
  });
});

describe("desktop-local bearer cache across token changes", () => {
  it("keeps a live bearer when only the bootstrap token rotates", () => {
    const cached = {
      signature: "http://a|ws://a",
      registration: {} as never,
      expiresAtEpochMs: 20_000,
      refreshAtEpochMs: 15_000,
    };

    expect(canReuseCachedPlatformRegistration(cached, "http://a|ws://a", 10_000)).toBe(true);
    expect(
      canRetainCachedPlatformRegistrationAfterRefreshFailure(cached, "http://a|ws://a", 16_000),
    ).toBe(true);
    expect(canReuseCachedPlatformRegistration(cached, "http://b|ws://b", 10_000)).toBe(false);
  });
});

describe("primary topology cache", () => {
  const registration = {} as never;
  const cached = {
    signature: "primary|http://127.0.0.1:3773/|ws://127.0.0.1:3773/",
    registration,
  };
  const previous = new Map([[PRIMARY_LOCAL_ENVIRONMENT_ID, cached]]);

  it("retains the cached primary after a transient topology read failure", () => {
    expect(
      primaryRegistrationToRetainAfterTopologyRead(previous, {
        _tag: "Failure",
        cause: new Error("IPC unavailable"),
      }),
    ).toBe(cached);
  });
});

describe("primary platform authentication", { concurrent: false }, () => {
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
      expect(readPrimaryEnvironmentTarget()!.target.httpBaseUrl).toBe(
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
          readPrimaryEnvironmentTarget()!,
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
      const source = yield* PlatformConnectionSource.PlatformConnectionSource;
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
        yield* loadPrimaryConnectionRegistration(readPrimaryEnvironmentTarget()!).pipe(Effect.flip),
      ).toMatchObject({ _tag: "ConnectionTransientError" });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
