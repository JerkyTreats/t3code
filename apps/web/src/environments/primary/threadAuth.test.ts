import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { makeThreadPrimaryAuth, submitThreadEnrollmentCredential } from "./threadAuth";

const origin = "https://thread.example.test";
const target = { httpBaseUrl: `${origin}/`, wsBaseUrl: "wss://thread.example.test/" };
const endpoint = `${origin}/api/auth/websocket-ticket`;

function response(body: unknown, status = 200) {
  return Object.defineProperty(Response.json(body, { status }), "url", { value: endpoint });
}
function install(fetch: typeof globalThis.fetch) {
  vi.stubGlobal("window", {
    location: new URL(origin),
    t3ThreadBridge: {
      submitPairingCredential: vi.fn().mockResolvedValue({ status: "accepted" }),
    },
    desktopBridge: {
      getLocalEnvironmentBearerToken: () => {
        throw new Error("renderer bearer forbidden");
      },
    },
  });
  vi.stubGlobal("fetch", fetch);
  return makeThreadPrimaryAuth()!.webSocketTicket!;
}

describe.sequential("protected Thread ticket acquisition", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.effect("uses generated POST decoding and a fresh ticket for every attempt", () => {
    let serial = 0;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () =>
        response({ ticket: `one-use-${++serial}`, expiresAt: "2099-01-01T00:00:00.000Z" }),
      );
    const issue = install(fetch);
    return Effect.gen(function* () {
      expect((yield* issue(target)).ticket).toBe("one-use-1");
      expect((yield* issue(target)).ticket).toBe("one-use-2");
      for (const [url, init] of fetch.mock.calls) {
        expect(url.toString()).toBe(endpoint);
        expect(init?.method).toBe("POST");
        expect(init?.credentials).toBe("omit");
        expect(init?.redirect).toBe("error");
        expect(new Headers(init?.headers).get("authorization")).toBeNull();
      }
    });
  });

  it.effect("fails target drift with no request", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const issue = install(fetch);
    return Effect.gen(function* () {
      const error = yield* issue({ ...target, wsBaseUrl: "wss://foreign.example.test/" }).pipe(
        Effect.flip,
      );
      expect(error).toMatchObject({ _tag: "ConnectionBlockedError", reason: "configuration" });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it.effect("rejects an origin change after capability creation", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const issue = install(fetch);
    vi.stubGlobal("window", {
      location: new URL("https://foreign.example.test"),
      t3ThreadBridge: {},
    });
    return Effect.gen(function* () {
      expect(yield* issue(target).pipe(Effect.flip)).toMatchObject({ reason: "configuration" });
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  it.effect("rejects origin drift while ticket acquisition is in flight", () => {
    const issue = install(async () => {
      vi.stubGlobal("window", {
        location: new URL("https://foreign.example.test"),
        t3ThreadBridge: {},
      });
      return response({ ticket: "must-not-be-used", expiresAt: "2099-01-01T00:00:00.000Z" });
    });
    return Effect.gen(function* () {
      expect(yield* issue(target).pipe(Effect.flip)).toMatchObject({ reason: "configuration" });
    });
  });

  for (const [status, body, reason] of [
    [
      401,
      {
        _tag: "EnvironmentAuthInvalidError",
        code: "auth_invalid",
        reason: "invalid_credential",
        traceId: "test-trace",
      },
      "authentication",
    ],
    [
      403,
      {
        _tag: "EnvironmentOperationForbiddenError",
        code: "operation_forbidden",
        reason: "authority_not_allowed",
        traceId: "test-trace",
      },
      "permission",
    ],
    [500, {}, "remote-unavailable"],
    [200, { ticket: "", expiresAt: "2099-01-01T00:00:00.000Z" }, "remote-unavailable"],
    [200, { ticket: "invalid-date", expiresAt: "not-a-date" }, "remote-unavailable"],
    [200, { ticket: "expired", expiresAt: "1970-01-01T00:00:00.000Z" }, "remote-unavailable"],
  ] as const) {
    it.effect(`maps response ${status} ${JSON.stringify(body)}`, () => {
      const issue = install(
        vi.fn<typeof globalThis.fetch>().mockResolvedValue(response(body, status)),
      );
      return Effect.gen(function* () {
        const error = yield* issue(target).pipe(Effect.flip);
        expect(error.reason).toBe(reason);
      });
    });
  }

  it.effect("does not retry or follow a redirect rejected by fetch", () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const issue = install(fetch);
    return Effect.gen(function* () {
      expect(yield* issue(target).pipe(Effect.flip)).toMatchObject({ reason: "network" });
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("error");
    });
  });

  it.effect("interrupts the in-flight HTTP request when its connection attempt is canceled", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let signal: AbortSignal | null | undefined;
      const issue = install(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal;
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
            Deferred.doneUnsafe(started, Effect.void);
          }),
      );
      const fiber = yield* issue(target).pipe(Effect.forkScoped);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      expect(signal?.aborted).toBe(true);
    }),
  );

  it.effect("aborts a hung request at the fixed timeout", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      let signal: AbortSignal | null | undefined;
      const issue = install(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal;
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
            Deferred.doneUnsafe(started, Effect.void);
          }),
      );
      const fiber = yield* issue(target).pipe(Effect.flip, Effect.forkScoped);
      yield* Deferred.await(started);
      yield* TestClock.adjust("10 seconds");
      expect(yield* Fiber.join(fiber)).toMatchObject({ reason: "timeout" });
      expect(signal?.aborted).toBe(true);
    }),
  );

  it.each(["accepted", "rejected", "unavailable"] as const)(
    "returns only one-way enrollment result %s",
    async (status) => {
      const submit = vi.fn().mockResolvedValue({ status });
      vi.stubGlobal("window", { t3ThreadBridge: { submitPairingCredential: submit } });
      expect(await submitThreadEnrollmentCredential("synthetic-pairing")).toEqual({ status });
      expect(submit).toHaveBeenCalledExactlyOnceWith("synthetic-pairing");
    },
  );
});
