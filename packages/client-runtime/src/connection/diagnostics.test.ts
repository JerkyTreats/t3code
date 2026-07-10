import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  MAX_CONNECTION_DIAGNOSTICS_ENTRIES,
  MAX_RECENT_CONNECTION_EVENTS,
  getConnectionDiagnosticsDurations,
  recordRpcSessionDiagnosticEvent,
  recordSupervisorConnectionState,
  rememberProcessedSessionEventId,
  sanitizeDiagnosticText,
  sanitizeDiagnosticUrl,
  selectConnectionDiagnosticsEntries,
  type ConnectionDiagnosticsEntry,
  type ConnectionDiagnosticsTarget,
} from "./diagnostics.ts";
import type { SupervisorConnectionState } from "./model.ts";

const ENVIRONMENT_ID = EnvironmentId.make("environment-diagnostics");
const TARGET: ConnectionDiagnosticsTarget = {
  environmentId: ENVIRONMENT_ID,
  kind: "BearerConnectionTarget",
  label: "Remote environment",
  origin: "https://user:password@remote.example.test/path?wsTicket=origin-secret",
};

function state(
  phase: SupervisorConnectionState["phase"],
  input?: Partial<SupervisorConnectionState>,
): SupervisorConnectionState {
  return {
    desired: phase !== "available",
    network: "online",
    phase,
    stage: phase === "connecting" ? "opening" : null,
    attempt: 1,
    generation: 1,
    lastFailure: null,
    retryAt: null,
    ...input,
  };
}

describe("connection diagnostics", () => {
  it("records sanitized lifecycle counters, close details, and durations", () => {
    let entries = new Map<EnvironmentId, ConnectionDiagnosticsEntry>();
    entries = new Map(recordSupervisorConnectionState(entries, TARGET, state("connecting"), 1_000));
    entries = new Map(
      recordRpcSessionDiagnosticEvent(entries, TARGET, {
        id: "session:attempt",
        type: "attempt",
        observedAtMs: 2_000,
        socketUrl: "wss://user:password@remote.example.test/ws?wsTicket=socket-secret#fragment",
      }),
    );
    entries = new Map(
      recordRpcSessionDiagnosticEvent(entries, TARGET, {
        id: "session:connected",
        type: "connected",
        observedAtMs: 3_000,
      }),
    );
    entries = new Map(
      recordRpcSessionDiagnosticEvent(entries, TARGET, {
        id: "session:disconnected",
        type: "disconnected",
        observedAtMs: 8_000,
        closeCode: 1006,
        closeReason: "lost wss://remote.example.test/ws?wsTicket=close-secret",
        intentional: false,
        wasConnected: true,
      }),
    );

    const entry = entries.get(ENVIRONMENT_ID);
    expect(entry).toMatchObject({
      origin: "https://remote.example.test",
      phase: "disconnected",
      lastSocketUrl: "wss://remote.example.test/ws",
      lastCloseCode: 1006,
      lastCloseReason: "lost wss://remote.example.test/ws",
      counters: {
        connectionStartCount: 1,
        socketAttemptCount: 1,
        connectCount: 1,
        disconnectCount: 1,
        unexpectedDisconnectCount: 1,
        intentionalDisconnectCount: 0,
      },
    });
    expect(entry ? getConnectionDiagnosticsDurations(entry, 10_000) : null).toEqual({
      connectedMs: 5_000,
      disconnectedMs: 2_000,
    });
    expect(JSON.stringify(entry)).not.toContain("origin-secret");
    expect(JSON.stringify(entry)).not.toContain("socket-secret");
    expect(JSON.stringify(entry)).not.toContain("close-secret");
    expect(JSON.stringify(entry)).not.toContain("password");
  });

  it("sanitizes ticket values from malformed URLs and free-form messages", () => {
    expect(sanitizeDiagnosticUrl("not-a-url/path?wsTicket=url-secret#fragment")).toBe(
      "not-a-url/path",
    );
    expect(
      sanitizeDiagnosticText(
        "failed at wss://remote.example.test/ws?wsTicket=text-secret and wsTicket=other-secret",
      ),
    ).toBe("failed at wss://remote.example.test/ws and wsTicket=[redacted]");
  });

  it("redacts sensitive connection credentials across diagnostic formats", () => {
    const cases: ReadonlyArray<readonly [message: string, secrets: ReadonlyArray<string>]> = [
      ["access_token=access-secret", ["access-secret"]],
      ["token: token-secret", ["token-secret"]],
      ["Authorization: Bearer authorization-secret", ["authorization-secret"]],
      ["bearer=bearer-secret", ["bearer-secret"]],
      ["pairing code pairing-secret", ["pairing-secret"]],
      ["Cookie: session=cookie-secret; Path=/", ["cookie-secret"]],
      ["ticket=ticket-secret", ["ticket-secret"]],
      ["wsTicket=ws-ticket-secret", ["ws-ticket-secret"]],
      [
        '{"access_token":"json-access-secret","authorization":"Bearer json-auth-secret","pairing_code":"json-pairing-secret","cookie":"json-cookie-secret"}',
        ["json-access-secret", "json-auth-secret", "json-pairing-secret", "json-cookie-secret"],
      ],
      [
        "failed at https://user:url-password@remote.example.test/ws?token=url-secret",
        ["url-password", "url-secret"],
      ],
    ];

    for (const [message, secrets] of cases) {
      const sanitized = sanitizeDiagnosticText(message);
      if (!message.includes("https://")) {
        expect(sanitized).toContain("[redacted]");
      }
      for (const secret of secrets) {
        expect(sanitized).not.toContain(secret);
      }
    }
  });

  it("bounds processed session event ids to the retained event horizon", () => {
    let processed: ReadonlySet<string> = new Set();
    for (let index = 0; index < MAX_RECENT_CONNECTION_EVENTS + 10; index += 1) {
      const [isNew, next] = rememberProcessedSessionEventId(processed, `event:${index}`);
      expect(isNew).toBe(true);
      processed = next;
    }

    expect(processed.size).toBe(MAX_RECENT_CONNECTION_EVENTS);
    expect(processed.has("event:0")).toBe(false);
    expect(processed.has(`event:${MAX_RECENT_CONNECTION_EVENTS + 9}`)).toBe(true);

    const latestEventId = `event:${MAX_RECENT_CONNECTION_EVENTS + 9}`;
    const [latestIsNew, unchanged] = rememberProcessedSessionEventId(processed, latestEventId);
    expect(latestIsNew).toBe(false);
    expect(unchanged).toBe(processed);

    const [evictedIsNew, recycled] = rememberProcessedSessionEventId(processed, "event:0");
    expect(evictedIsNew).toBe(true);
    expect(recycled.size).toBe(MAX_RECENT_CONNECTION_EVENTS);
  });

  it("bounds target and event retention while retaining the primary environment", () => {
    const primaryTarget: ConnectionDiagnosticsTarget = {
      environmentId: EnvironmentId.make("environment-primary"),
      kind: "PrimaryConnectionTarget",
      label: "This environment",
      origin: "http://localhost:3773",
    };
    let entries = recordSupervisorConnectionState(
      new Map(),
      primaryTarget,
      state("connected"),
      1_000,
    );
    for (let index = 0; index < 80; index += 1) {
      const environmentId = EnvironmentId.make(`environment-remote-${index}`);
      entries = recordRpcSessionDiagnosticEvent(
        entries,
        {
          environmentId,
          kind: "RelayConnectionTarget",
          label: `Remote ${index}`,
          origin: null,
        },
        {
          id: `session:${index}`,
          type: "attempt",
          observedAtMs: 2_000 + index,
          socketUrl: `wss://remote-${index}.example.test/ws`,
        },
      );
    }

    expect(entries.size).toBe(MAX_CONNECTION_DIAGNOSTICS_ENTRIES);
    expect(entries.has(primaryTarget.environmentId)).toBe(true);
    expect(entries.has(EnvironmentId.make("environment-remote-0"))).toBe(false);
    expect(entries.has(EnvironmentId.make("environment-remote-79"))).toBe(true);

    const recentTarget = {
      ...TARGET,
      environmentId: EnvironmentId.make("environment-event-limit"),
    };
    let recentEntries = new Map<EnvironmentId, ConnectionDiagnosticsEntry>();
    for (let index = 0; index < 40; index += 1) {
      recentEntries = new Map(
        recordRpcSessionDiagnosticEvent(recentEntries, recentTarget, {
          id: `event:${index}`,
          type: "attempt",
          observedAtMs: 10_000 + index,
          socketUrl: "wss://remote.example.test/ws",
        }),
      );
    }
    expect(recentEntries.get(recentTarget.environmentId)?.recentEvents).toHaveLength(
      MAX_RECENT_CONNECTION_EVENTS,
    );
    expect(selectConnectionDiagnosticsEntries(entries)[0]?.kind).toBe("PrimaryConnectionTarget");
  });
});
