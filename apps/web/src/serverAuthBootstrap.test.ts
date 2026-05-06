import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __readServerAuthGateStateForTests,
  __resetServerAuthGateBootstrapForTests,
  startServerAuthGateBootstrap,
} from "./serverAuthBootstrap";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  __resetServerAuthGateBootstrapForTests();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      clearTimeout: globalThis.clearTimeout,
      desktopBridge: undefined,
      location: {
        href: "http://localhost:3020/",
        origin: "http://localhost:3020",
      },
      setTimeout: globalThis.setTimeout,
    },
  });
});

afterEach(() => {
  __resetServerAuthGateBootstrapForTests();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("server auth bootstrap", () => {
  it("leaves booting when the auth session request fails permanently", async () => {
    globalThis.fetch = vi.fn(async () => new Response("server failed", { status: 500 }));

    const state = await startServerAuthGateBootstrap();

    expect(state).toEqual({
      status: "unavailable",
      errorMessage: "Failed to load server auth session state 500.",
    });
    expect(__readServerAuthGateStateForTests()).toEqual(state);
  });
});
