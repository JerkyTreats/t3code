import { describe, expect, it } from "vite-plus/test";

import { synchronizationCopy } from "./NoActiveThreadState";

describe("synchronizationCopy", () => {
  it("describes a remote thread waiting for its environment", () => {
    expect(
      synchronizationCopy({
        phase: "waiting",
        version: null,
        deferredPayloadCount: 0,
        estimatedBytes: null,
        error: null,
      }),
    ).toEqual({
      header: "Waiting for connection",
      title: "Waiting for the environment",
      description: "Thread history will load when the environment reconnects.",
    });
  });

  it("reports deferred payload hydration", () => {
    expect(
      synchronizationCopy({
        phase: "hydrating",
        version: "v2",
        deferredPayloadCount: 3,
        estimatedBytes: 2048,
        error: null,
      }).description,
    ).toBe("3 deferred activity payloads are loading.");
  });

  it("preserves the sanitized synchronization error", () => {
    expect(
      synchronizationCopy({
        phase: "error",
        version: "v2",
        deferredPayloadCount: 0,
        estimatedBytes: null,
        error: "Remote history is unavailable.",
      }),
    ).toMatchObject({
      header: "Thread unavailable",
      title: "Could not load thread history",
      description: "Remote history is unavailable.",
    });
  });
});
