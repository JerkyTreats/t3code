import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "@effect/vitest";

import {
  getThreadSyncDiagnosticsSnapshot,
  recordThreadSyncError,
  recordThreadSyncHydration,
  recordThreadSyncSubscription,
  recordThreadSyncWaiting,
  resetThreadSyncDiagnosticsForTests,
  subscribeThreadSyncDiagnostics,
  THREAD_SYNC_DIAGNOSTICS_ENTRY_LIMIT,
} from "./threadSyncDiagnostics.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const THREAD_ID = ThreadId.make("thread-1");

describe("thread sync diagnostics", () => {
  beforeEach(() => {
    resetThreadSyncDiagnosticsForTests();
  });

  it("stores metadata only and sanitizes failure details", () => {
    const snapshots: number[] = [];
    const unsubscribe = subscribeThreadSyncDiagnostics((entries) => {
      snapshots.push(entries.length);
    });

    recordThreadSyncSubscription({
      environmentId: ENVIRONMENT_ID,
      threadId: THREAD_ID,
      version: "v2",
    });
    recordThreadSyncHydration({
      environmentId: ENVIRONMENT_ID,
      threadId: THREAD_ID,
      version: "v2",
      requestCount: 2,
    });
    recordThreadSyncError({
      environmentId: ENVIRONMENT_ID,
      threadId: THREAD_ID,
      version: "v2",
      error: new Error(
        "token=raw-secret\nfailed at wss://user:password@example.test/ws?ticket=url-secret#trace",
      ),
    });
    unsubscribe();

    const [entry] = getThreadSyncDiagnosticsSnapshot();
    expect(entry).toMatchObject({
      environmentId: ENVIRONMENT_ID,
      threadId: THREAD_ID,
      version: "v2",
      phase: "error",
      subscribeCount: 1,
      hydrationRequestCount: 2,
    });
    expect(entry?.lastError).toContain("token=[redacted]");
    expect(entry?.lastError).toContain("wss://example.test/ws");
    expect(JSON.stringify(entry)).not.toContain("raw-secret");
    expect(JSON.stringify(entry)).not.toContain("url-secret");
    expect(JSON.stringify(entry)).not.toContain("password@example");
    expect(snapshots).toEqual([1, 1, 1]);
  });

  it("retains only the most recently observed thread entries", () => {
    for (let index = 0; index < THREAD_SYNC_DIAGNOSTICS_ENTRY_LIMIT + 10; index += 1) {
      recordThreadSyncWaiting({
        environmentId: EnvironmentId.make(`environment-${index}`),
        threadId: ThreadId.make(`thread-${index}`),
      });
    }

    const entries = getThreadSyncDiagnosticsSnapshot();
    expect(entries).toHaveLength(THREAD_SYNC_DIAGNOSTICS_ENTRY_LIMIT);
    expect(entries[0]?.threadId).toBe(`thread-${THREAD_SYNC_DIAGNOSTICS_ENTRY_LIMIT + 9}`);
    expect(entries.some((entry) => entry.threadId === "thread-0")).toBe(false);
  });

  it("normalizes identifiers before exposing diagnostic keys", () => {
    recordThreadSyncWaiting({
      environmentId: EnvironmentId.make(`environment\nsecret?${"x".repeat(200)}`),
      threadId: ThreadId.make("thread\u0000one"),
    });

    const [entry] = getThreadSyncDiagnosticsSnapshot();
    expect(entry?.environmentId).not.toContain("\n");
    expect(entry?.environmentId.length).toBeLessThanOrEqual(128);
    expect(entry?.threadId).toBe("thread_one");
  });
});
