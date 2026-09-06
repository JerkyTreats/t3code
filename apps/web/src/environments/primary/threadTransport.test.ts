import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import {
  hasBridgeBoundPrimaryTarget,
  readPrimaryEnvironmentTarget,
  resolvePrimaryEnvironmentHttpUrl,
} from "./target";
import {
  assertThreadPrimaryTarget,
  makeThreadPrimaryFetch,
  resolveThreadPrimaryTarget,
  ThreadPrimaryTransportError,
} from "./threadTransport";

const origin = "https://thread.example.test:8443";
const target = { httpBaseUrl: `${origin}/`, wsBaseUrl: "wss://thread.example.test:8443/" };

describe("protected Thread transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("takes bridge-selected origin before baked or desktop targets and dev rewriting", () => {
    vi.stubGlobal("window", {
      location: new URL(`${origin}/?t3-thread-client=1`),
      t3ThreadBridge: {},
      desktopBridge: {
        getLocalEnvironmentBootstraps: () => {
          throw new Error("desktop must not be consulted");
        },
      },
    });
    vi.stubEnv("VITE_HTTP_URL", "https://foreign.example.test");
    vi.stubEnv("VITE_WS_URL", "wss://foreign.example.test");
    vi.stubEnv("VITE_DEV_SERVER_URL", "http://localhost:9999");
    expect(hasBridgeBoundPrimaryTarget()).toBe(true);
    expect(readPrimaryEnvironmentTarget()).toEqual({ source: "window-origin", target });
    expect(resolvePrimaryEnvironmentHttpUrl("/api/auth/session")).toBe(
      `${origin}/api/auth/session`,
    );
  });

  it("does not infer protected auth from a presentation marker", () => {
    vi.stubGlobal("window", {
      location: new URL(`${origin}/?t3-thread-client=1`),
      sessionStorage: { getItem: () => "1" },
    });
    vi.stubEnv("VITE_HTTP_URL", "https://ordinary.example.test");
    expect(hasBridgeBoundPrimaryTarget()).toBe(false);
    expect(readPrimaryEnvironmentTarget().source).toBe("configured");
    expect(
      resolveThreadPrimaryTarget({ threadBridgePresent: false, windowOrigin: origin }),
    ).toBeNull();
  });

  it.each([
    "http://thread.example.test",
    "https://user@thread.example.test",
    `${origin}/`,
    "invalid",
  ])("rejects invalid origin %s", (windowOrigin) => {
    expect(() => resolveThreadPrimaryTarget({ threadBridgePresent: true, windowOrigin })).toThrow(
      ThreadPrimaryTransportError,
    );
  });

  it.each([
    { ...target, httpBaseUrl: "https://foreign.example.test/" },
    { ...target, httpBaseUrl: `${origin}/?token=wrong` },
    { ...target, httpBaseUrl: "https://user@thread.example.test:8443/" },
    { ...target, wsBaseUrl: "ws://thread.example.test:8443/" },
    { ...target, wsBaseUrl: "wss://thread.example.test/" },
    { ...target, wsBaseUrl: "wss://thread.example.test:8443/other" },
    { ...target, wsBaseUrl: "wss://thread.example.test:8443/ws?wsTicket=old" },
    { ...target, wsBaseUrl: "wss://thread.example.test:8443/ws#fragment" },
  ])("rejects target drift before acquisition: %j", (proposed) => {
    expect(() => assertThreadPrimaryTarget({ ...proposed, applicationOrigin: origin })).toThrow(
      ThreadPrimaryTransportError,
    );
  });

  it("admits only the enrolled WSS socket route", () => {
    expect(() => assertThreadPrimaryTarget({ ...target, applicationOrigin: origin })).not.toThrow();
    expect(() =>
      assertThreadPrimaryTarget({
        ...target,
        wsBaseUrl: `${target.wsBaseUrl}ws`,
        applicationOrigin: origin,
      }),
    ).not.toThrow();
  });

  it("rejects foreign requests and renderer authorization without invoking fetch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const bound = makeThreadPrimaryFetch({ applicationOrigin: origin, fetch });
    await expect(bound("https://foreign.example.test/api/auth/session")).rejects.toThrow(
      ThreadPrimaryTransportError,
    );
    await expect(
      bound(`${origin}/api/auth/session`, {
        headers: { Authorization: "synthetic-renderer-token" },
      }),
    ).rejects.toThrow(ThreadPrimaryTransportError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the browser fetch receiver for an admitted session request", async () => {
    const response = new Response("{}", { status: 200 });
    Object.defineProperty(response, "url", { value: `${origin}/api/auth/session` });
    const fetch = vi.fn<typeof globalThis.fetch>(async function (this: unknown) {
      // Browser fetch rejects an options object as its receiver.
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return response;
    });
    const bound = makeThreadPrimaryFetch({ applicationOrigin: origin, fetch });

    await expect(bound(`${origin}/api/auth/session`)).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${origin}/api/auth/session`, {
      credentials: "omit",
      redirect: "error",
    });
  });

  it.each(["foreign", "redirected", "missing-url"])(
    "rejects unexpected response %s",
    async (kind) => {
      const response = new Response(null);
      Object.defineProperty(response, "url", {
        value:
          kind === "foreign"
            ? "https://foreign.example.test/"
            : kind === "missing-url"
              ? ""
              : `${origin}/api/auth/session`,
      });
      Object.defineProperty(response, "redirected", { value: kind === "redirected" });
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
      const bound = makeThreadPrimaryFetch({ applicationOrigin: origin, fetch });
      await expect(bound(`${origin}/api/auth/session`)).rejects.toThrow(
        ThreadPrimaryTransportError,
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
});
