import { QueryClient } from "@tanstack/react-query";
import type { WsRpcClient } from "@t3tools/client-runtime";
import {
  EnvironmentId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationShellSnapshot,
  type OrchestrationThreadStreamV2Item,
} from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mockSubscribeThread = vi.fn();
const mockSubscribeThreadV2 = vi.fn();
const mockHydrateThreadActivityPayloads = vi.fn();
const mockThreadUnsubscribe = vi.fn();
const mockCreateEnvironmentConnection = vi.fn();
const mockCreateWsRpcClient = vi.fn();
const mockWaitForSavedEnvironmentRegistryHydration = vi.fn();
const mockListSavedEnvironmentRecords = vi.fn();
const mockGetSavedEnvironmentRecord = vi.fn();
const mockReadSavedEnvironmentBearerToken = vi.fn();
const mockReadSavedEnvironmentCredential = vi.fn();
const mockSavedEnvironmentRegistrySubscribe = vi.fn();
const mockGetPrimaryKnownEnvironment = vi.hoisted(() => vi.fn());
const mockFetchRemoteSessionState = vi.fn();
const mockResolveRemoteWebSocketConnectionUrl = vi.fn(async () => "ws://remote.example.test/ws");
const mockRemoteHttpRunPromise = vi.fn((effect: Promise<unknown>) => effect);
const mockConnectionReconnects: Array<ReturnType<typeof vi.fn>> = [];
const mockPatchRuntime = vi.fn();
const mockSavedEnvironmentRuntimeById: Record<string, { readonly descriptor?: unknown }> = {};
const mockWsTransportInstances: Array<{
  readonly handlers: {
    readonly onClose?: (
      details: { readonly code: number; readonly reason: string },
      context: { readonly intentional: boolean },
    ) => void;
  };
  readonly runtimeOptions: { readonly trackGlobalConnectionState?: boolean } | undefined;
}> = [];
let savedEnvironmentRegistryListener: (() => void) | null = null;

function MockWsTransport(
  _url: unknown,
  handlers: {
    readonly onClose?: (
      details: { readonly code: number; readonly reason: string },
      context: { readonly intentional: boolean },
    ) => void;
  },
  runtimeOptions?: { readonly trackGlobalConnectionState?: boolean },
) {
  const instance = { handlers, runtimeOptions };
  mockWsTransportInstances.push(instance);
  return instance;
}

vi.mock("../primary", () => ({
  getPrimaryKnownEnvironment: mockGetPrimaryKnownEnvironment,
}));

vi.mock("../../lib/runtime", () => ({
  webRuntime: {
    runPromise: mockRemoteHttpRunPromise,
  },
}));

vi.mock("./catalog", () => ({
  getSavedEnvironmentRecord: mockGetSavedEnvironmentRecord,
  hasSavedEnvironmentRegistryHydrated: vi.fn(() => true),
  listSavedEnvironmentRecords: mockListSavedEnvironmentRecords,
  persistSavedEnvironmentRecord: vi.fn(),
  readSavedEnvironmentBearerToken: mockReadSavedEnvironmentBearerToken,
  readSavedEnvironmentCredential: mockReadSavedEnvironmentCredential,
  removeSavedEnvironmentBearerToken: vi.fn(),
  useSavedEnvironmentRegistryStore: {
    subscribe: mockSavedEnvironmentRegistrySubscribe,
    getState: () => ({
      upsert: vi.fn(),
      remove: vi.fn(),
      markConnected: vi.fn(),
      rename: vi.fn(),
    }),
  },
  useSavedEnvironmentRuntimeStore: {
    getState: () => ({
      byId: mockSavedEnvironmentRuntimeById,
      ensure: vi.fn(),
      patch: mockPatchRuntime,
      clear: vi.fn(),
    }),
  },
  waitForSavedEnvironmentRegistryHydration: mockWaitForSavedEnvironmentRegistryHydration,
  writeSavedEnvironmentBearerToken: vi.fn(),
  writeSavedEnvironmentCredential: vi.fn(),
}));

vi.mock("./connection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./connection")>()),
  createEnvironmentConnection: mockCreateEnvironmentConnection,
}));

vi.mock("@t3tools/client-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@t3tools/client-runtime")>();
  const stubWsClient: WsRpcClient = {
    dispose: async () => undefined,
    reconnect: async () => undefined,
    isHeartbeatFresh: () => false,
    cloud: {
      getRelayClientStatus: vi.fn(),
      installRelayClient: vi.fn(),
    },
    orchestration: {
      dispatchCommand: vi.fn(),
      getTurnDiff: vi.fn(),
      getFullThreadDiff: vi.fn(),
      getArchivedShellSnapshot: vi.fn(),
      subscribeShell: vi.fn(() => () => undefined),
      subscribeThread: mockSubscribeThread,
      subscribeThreadV2: mockSubscribeThreadV2,
      getThreadActivityPage: vi.fn(),
      hydrateThreadActivityPayloads: mockHydrateThreadActivityPayloads,
    },
    terminal: {
      open: vi.fn(),
      attach: vi.fn(() => () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      clear: vi.fn(),
      restart: vi.fn(),
      close: vi.fn(),
      onEvent: vi.fn(() => () => undefined),
      onMetadata: vi.fn(() => () => undefined),
    },
    projects: {
      listDirectory: vi.fn(),
      readFile: vi.fn(),
      searchEntries: vi.fn(),
      writeFile: vi.fn(),
    },
    filesystem: {
      browse: vi.fn(),
    },
    sourceControl: {
      lookupRepository: vi.fn(),
      cloneRepository: vi.fn(),
      publishRepository: vi.fn(),
    },
    shell: {
      openInEditor: vi.fn(),
    },
    vcs: {
      pull: vi.fn(),
      refreshStatus: vi.fn(),
      onStatus: vi.fn(() => () => undefined),
      listRefs: vi.fn(),
      createWorktree: vi.fn(),
      removeWorktree: vi.fn(),
      createRef: vi.fn(),
      switchRef: vi.fn(),
      init: vi.fn(),
    },
    git: {
      abortMerge: vi.fn(),
      mergeBranches: vi.fn(),
      runStackedAction: vi.fn(),
      resolvePullRequest: vi.fn(),
      preparePullRequestThread: vi.fn(),
    },
    github: {
      status: vi.fn(),
      login: vi.fn(),
      listIssues: vi.fn(),
      createIssue: vi.fn(),
      closeIssue: vi.fn(),
      reopenIssue: vi.fn(),
    },
    review: {
      getDiffPreview: vi.fn(),
    },
    server: {
      getConfig: vi.fn(),
      refreshProviders: vi.fn(),
      discoverSourceControl: vi.fn(),
      updateProvider: vi.fn(),
      upsertKeybinding: vi.fn(),
      removeKeybinding: vi.fn(),
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      subscribeConfig: vi.fn(() => () => undefined),
      subscribeLifecycle: vi.fn(() => () => undefined),
      subscribeAuthAccess: vi.fn(() => () => undefined),
      getTraceDiagnostics: vi.fn(),
      getProcessDiagnostics: vi.fn(),
      getProcessResourceHistory: vi.fn(),
      signalProcess: vi.fn(),
    },
  };
  return {
    ...actual,
    createWsRpcClient: vi.fn(() => stubWsClient),
    fetchRemoteSessionState: mockFetchRemoteSessionState,
    resolveRemoteWebSocketConnectionUrl: mockResolveRemoteWebSocketConnectionUrl,
  };
});

vi.mock("../../rpc/wsTransport", () => ({
  WsTransport: MockWsTransport,
}));

function makeThreadShellSnapshot(params: {
  readonly threadId: ThreadId;
  readonly sessionStatus?:
    | "idle"
    | "starting"
    | "running"
    | "ready"
    | "interrupted"
    | "stopped"
    | "error";
  readonly hasPendingApprovals?: boolean;
  readonly hasPendingUserInput?: boolean;
  readonly hasActionableProposedPlan?: boolean;
}): OrchestrationShellSnapshot {
  const projectId = ProjectId.make("project-1");
  const turnId = TurnId.make("turn-1");

  return {
    snapshotSequence: 1,
    projects: [],
    updatedAt: "2026-04-13T00:00:00.000Z",
    threads: [
      {
        id: params.threadId,
        projectId,
        title: "Thread",
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5-codex",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn:
          params.sessionStatus === "running"
            ? {
                turnId,
                state: "running",
                requestedAt: "2026-04-13T00:00:00.000Z",
                startedAt: "2026-04-13T00:00:01.000Z",
                completedAt: null,
                assistantMessageId: null,
              }
            : null,
        createdAt: "2026-04-13T00:00:00.000Z",
        updatedAt: "2026-04-13T00:00:00.000Z",
        archivedAt: null,
        session: params.sessionStatus
          ? {
              threadId: params.threadId,
              status: params.sessionStatus,
              providerName: "codex",
              runtimeMode: "full-access",
              activeTurnId: params.sessionStatus === "running" ? turnId : null,
              lastError: null,
              updatedAt: "2026-04-13T00:00:00.000Z",
            }
          : null,
        latestUserMessageAt: null,
        hasPendingApprovals: params.hasPendingApprovals ?? false,
        hasPendingUserInput: params.hasPendingUserInput ?? false,
        hasActionableProposedPlan: params.hasActionableProposedPlan ?? false,
      },
    ],
  };
}

describe("retainThreadDetailSubscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.clearAllMocks();
    mockHydrateThreadActivityPayloads.mockResolvedValue({
      payloads: [],
      omitted: [],
    });
    mockGetPrimaryKnownEnvironment.mockReturnValue({
      id: "env-1",
      label: "Primary environment",
      source: "window-origin",
      target: {
        httpBaseUrl: "http://127.0.0.1:3000/",
        wsBaseUrl: "ws://127.0.0.1:3000/",
      },
      environmentId: EnvironmentId.make("env-1"),
    });

    mockThreadUnsubscribe.mockImplementation(() => undefined);
    mockSubscribeThread.mockImplementation(() => mockThreadUnsubscribe);
    mockSubscribeThreadV2.mockImplementation(() => mockThreadUnsubscribe);
    for (const key of Object.keys(mockSavedEnvironmentRuntimeById)) {
      delete mockSavedEnvironmentRuntimeById[key];
    }
    mockPatchRuntime.mockImplementation((environmentId, patch) => {
      mockSavedEnvironmentRuntimeById[environmentId] = {
        ...mockSavedEnvironmentRuntimeById[environmentId],
        ...patch,
      };
    });
    mockCreateWsRpcClient.mockReturnValue({
      server: {
        getConfig: vi.fn(async () => ({
          environment: {
            environmentId: EnvironmentId.make("env-remote"),
            label: "Remote env",
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "0.0.0-test",
            capabilities: { repositoryIdentity: true },
          },
        })),
      },
      isHeartbeatFresh: vi.fn(() => true),
      orchestration: {
        subscribeThread: mockSubscribeThread,
        subscribeThreadV2: mockSubscribeThreadV2,
        getThreadActivityPage: vi.fn(),
        hydrateThreadActivityPayloads: vi.fn(),
      },
    });
    mockCreateEnvironmentConnection.mockImplementation((input) => {
      const reconnect = vi.fn(async () => undefined);
      mockConnectionReconnects.push(reconnect);
      queueMicrotask(() => {
        input.onConfigSnapshot?.({
          environment: {
            environmentId: input.knownEnvironment.environmentId,
            label: input.knownEnvironment.label,
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "0.0.0-test",
            capabilities: { repositoryIdentity: true },
          },
        });
      });
      return {
        kind: input.kind,
        environmentId: input.knownEnvironment.environmentId,
        knownEnvironment: input.knownEnvironment,
        client: input.client,
        ensureBootstrapped: vi.fn(async () => undefined),
        reconnect,
        dispose: vi.fn(async () => undefined),
      };
    });
    savedEnvironmentRegistryListener = null;
    mockSavedEnvironmentRegistrySubscribe.mockImplementation((listener: () => void) => {
      savedEnvironmentRegistryListener = listener;
      return () => {
        if (savedEnvironmentRegistryListener === listener) {
          savedEnvironmentRegistryListener = null;
        }
      };
    });
    mockWaitForSavedEnvironmentRegistryHydration.mockResolvedValue(undefined);
    mockListSavedEnvironmentRecords.mockReturnValue([]);
    mockGetSavedEnvironmentRecord.mockReturnValue(null);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue(null);
    mockReadSavedEnvironmentCredential.mockImplementation(async () => {
      const token = await mockReadSavedEnvironmentBearerToken();
      return token ? { version: 1, method: "bearer", token } : null;
    });
    mockFetchRemoteSessionState.mockResolvedValue({
      authenticated: true,
      scopes: ["orchestration:read"],
    });
    mockConnectionReconnects.length = 0;
    mockWsTransportInstances.length = 0;
    mockPatchRuntime.mockClear();
  });

  afterEach(async () => {
    const { resetEnvironmentServiceForTests } = await import("./service");
    await resetEnvironmentServiceForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps thread detail subscriptions warm across releases until idle eviction", async () => {
    const {
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
      resetEnvironmentServiceForTests,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    const environmentId = EnvironmentId.make("env-1");
    const threadId = ThreadId.make("thread-1");

    const releaseFirst = retainThreadDetailSubscription(environmentId, threadId);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);

    releaseFirst();
    expect(mockThreadUnsubscribe).not.toHaveBeenCalled();

    const releaseSecond = retainThreadDetailSubscription(environmentId, threadId);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);

    releaseSecond();
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
    expect(mockThreadUnsubscribe).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(28 * 60 * 1000);
    expect(mockThreadUnsubscribe).toHaveBeenCalledTimes(1);

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("does not start the primary connection until the known environment has an id", async () => {
    mockGetPrimaryKnownEnvironment.mockReturnValue({
      id: "env-1",
      label: "Primary environment",
      source: "window-origin",
      target: {
        httpBaseUrl: "http://127.0.0.1:3000/",
        wsBaseUrl: "ws://127.0.0.1:3000/",
      },
    });
    const {
      listEnvironmentConnections,
      resetEnvironmentServiceForTests,
      startEnvironmentConnectionService,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());

    expect(mockCreateEnvironmentConnection).not.toHaveBeenCalled();
    expect(listEnvironmentConnections()).toEqual([]);

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("keeps non-idle thread detail subscriptions attached until the thread becomes idle", async () => {
    const {
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
      resetEnvironmentServiceForTests,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    const environmentId = EnvironmentId.make("env-1");
    const threadId = ThreadId.make("thread-active");

    const connectionInput = mockCreateEnvironmentConnection.mock.calls[0]?.[0];
    expect(connectionInput).toBeDefined();

    connectionInput.syncShellSnapshot(
      makeThreadShellSnapshot({
        threadId,
        sessionStatus: "ready",
        hasPendingApprovals: true,
      }),
      environmentId,
    );

    const release = retainThreadDetailSubscription(environmentId, threadId);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);

    release();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(mockThreadUnsubscribe).not.toHaveBeenCalled();

    connectionInput.applyShellEvent(
      {
        kind: "thread-upserted",
        sequence: 2,
        thread: makeThreadShellSnapshot({
          threadId,
          sessionStatus: "idle",
        }).threads[0]!,
      },
      environmentId,
    );

    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(mockThreadUnsubscribe).toHaveBeenCalledTimes(1);

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("reattaches retained thread detail subscriptions after a saved environment reconnect replaces the client", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const threadId = ThreadId.make("thread-reconnect");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "http://remote.example.test",
      wsBaseUrl: "ws://remote.example.test",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");

    const {
      disconnectSavedEnvironment,
      listEnvironmentConnections,
      reconnectSavedEnvironment,
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
      resetEnvironmentServiceForTests,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });
    const createConnectionCallsBeforeReconnect = mockCreateEnvironmentConnection.mock.calls.length;

    const release = retainThreadDetailSubscription(environmentId, threadId);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);

    await disconnectSavedEnvironment(environmentId);
    expect(mockThreadUnsubscribe).toHaveBeenCalledTimes(1);
    expect(
      listEnvironmentConnections().some((connection) => connection.environmentId === environmentId),
    ).toBe(false);

    const reconnectPromise = reconnectSavedEnvironment(environmentId);
    await vi.advanceTimersByTimeAsync(200);
    await reconnectPromise;
    await vi.waitFor(() => {
      expect(mockCreateEnvironmentConnection).toHaveBeenCalledTimes(
        createConnectionCallsBeforeReconnect + 1,
      );
      expect(mockSubscribeThread).toHaveBeenCalledTimes(2);
    });

    release();
    stop();
    await resetEnvironmentServiceForTests();
  });

  it("uses thread detail v2 for saved environments that advertise the capability", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const threadId = ThreadId.make("thread-v2");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");

    const {
      listEnvironmentConnections,
      resetEnvironmentServiceForTests,
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });
    mockSavedEnvironmentRuntimeById[environmentId] = {
      descriptor: {
        environmentId,
        label: "Remote env",
        platform: { os: "darwin", arch: "arm64" },
        serverVersion: "0.0.0-test",
        capabilities: { repositoryIdentity: true, threadSyncV2: true },
      },
    };

    const release = retainThreadDetailSubscription(environmentId, threadId);

    expect(mockSubscribeThread).not.toHaveBeenCalled();
    expect(mockSubscribeThreadV2).toHaveBeenCalledTimes(1);
    expect(mockSubscribeThreadV2).toHaveBeenCalledWith({ threadId }, expect.any(Function));

    release();
    stop();
    await resetEnvironmentServiceForTests();
  });

  it("hydrates deferred thread sync v2 activity payloads before applying snapshots and events", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const threadId = ThreadId.make("thread-v2-hydration");
    const projectId = ProjectId.make("project-v2-hydration");
    const snapshotActivityId = EventId.make("activity-v2-snapshot");
    const eventActivityId = EventId.make("activity-v2-event");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    mockHydrateThreadActivityPayloads.mockImplementation(
      async (input: { activityIds: EventId[] }) => ({
        payloads: input.activityIds.map((activityId) => ({
          activityId,
          payload: {
            requestId: `request-${activityId}`,
            requestKind: "command",
            detail: `hydrated-${activityId}`,
          },
          byteLength: 64,
        })),
        omitted: [],
      }),
    );
    let threadV2Listener: ((item: OrchestrationThreadStreamV2Item) => void) | null = null;

    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");
    mockSubscribeThreadV2.mockImplementation((_input, listener) => {
      threadV2Listener = listener;
      return mockThreadUnsubscribe;
    });

    const {
      listEnvironmentConnections,
      resetEnvironmentServiceForTests,
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
    } = await import("./service");
    const { selectThreadByRef, useStore } = await import("~/store");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });
    mockSavedEnvironmentRuntimeById[environmentId] = {
      descriptor: {
        environmentId,
        label: "Remote env",
        platform: { os: "darwin", arch: "arm64" },
        serverVersion: "0.0.0-test",
        capabilities: { repositoryIdentity: true, threadSyncV2: true },
      },
    };

    const release = retainThreadDetailSubscription(environmentId, threadId);
    expect(threadV2Listener).toBeDefined();
    const emitThreadV2Item = (item: OrchestrationThreadStreamV2Item) => {
      const listener = threadV2Listener as ((item: OrchestrationThreadStreamV2Item) => void) | null;
      if (!listener) {
        throw new Error("Expected thread v2 listener to be registered");
      }
      listener(item);
    };

    emitThreadV2Item({
      kind: "snapshot",
      snapshot: {
        snapshotSequence: 1,
        thread: {
          id: threadId,
          projectId,
          title: "Hydrated thread",
          modelSelection: {
            instanceId: ProviderInstanceId.make("codex"),
            model: "gpt-5-codex",
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          issueLink: null,
          latestTurn: null,
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
          archivedAt: null,
          deletedAt: null,
          messages: [
            {
              id: MessageId.make("message-v2-hydration"),
              role: "user",
              text: "hello",
              turnId: null,
              streaming: false,
              createdAt: "2026-05-01T00:00:00.000Z",
              updatedAt: "2026-05-01T00:00:00.000Z",
            },
          ],
          proposedPlans: [],
          activities: [
            {
              id: snapshotActivityId,
              tone: "approval",
              kind: "approval.requested",
              summary: "Approval",
              payload: {
                __t3Deferred: "thread-activity-payload",
                byteLength: 4097,
              },
              turnId: null,
              sequence: 1,
              createdAt: "2026-05-01T00:00:01.000Z",
            },
          ],
          checkpoints: [],
          session: null,
        },
        windows: {
          messages: { returned: 1, limit: 1, hasMoreBefore: false, hasMoreAfter: false },
          proposedPlans: { returned: 0, limit: 1, hasMoreBefore: false, hasMoreAfter: false },
          activities: { returned: 1, limit: 1, hasMoreBefore: false, hasMoreAfter: false },
          checkpoints: { returned: 0, limit: 1, hasMoreBefore: false, hasMoreAfter: false },
        },
        deferredActivityPayloads: 1,
        estimatedSerializedBytes: 512,
      },
    });

    await vi.waitFor(() => {
      const thread = selectThreadByRef(useStore.getState(), { environmentId, threadId });
      expect(thread?.activities[0]?.payload).toMatchObject({
        requestId: `request-${snapshotActivityId}`,
        requestKind: "command",
      });
    });

    emitThreadV2Item({
      kind: "event",
      event: {
        sequence: 2,
        eventId: EventId.make("event-v2-activity"),
        aggregateKind: "thread",
        aggregateId: threadId,
        occurredAt: "2026-05-01T00:00:02.000Z",
        commandId: null,
        causationEventId: null,
        correlationId: null,
        metadata: {},
        type: "thread.activity-appended",
        payload: {
          threadId,
          activity: {
            id: eventActivityId,
            tone: "approval",
            kind: "approval.requested",
            summary: "Approval event",
            payload: {
              __t3Deferred: "thread-activity-payload",
              byteLength: 4097,
            },
            turnId: null,
            sequence: 2,
            createdAt: "2026-05-01T00:00:02.000Z",
          },
        },
      },
      deferredActivityPayloads: 1,
      estimatedSerializedBytes: 256,
    });

    await vi.waitFor(() => {
      const thread = selectThreadByRef(useStore.getState(), { environmentId, threadId });
      expect(thread?.activities.at(-1)?.payload).toMatchObject({
        requestId: `request-${eventActivityId}`,
        requestKind: "command",
      });
    });
    expect(mockHydrateThreadActivityPayloads).toHaveBeenCalledTimes(2);

    release();
    stop();
    await resetEnvironmentServiceForTests();
  });

  it("upgrades retained saved thread detail subscriptions after reconnect refreshes v2 capability", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const threadId = ThreadId.make("thread-upgrade");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    const upgradedDescriptor = {
      environmentId,
      label: "Remote env",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: true, threadSyncV2: true },
    };

    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");
    mockCreateEnvironmentConnection.mockImplementation((input) => {
      const reconnect = vi.fn(async () => {
        mockPatchRuntime(input.knownEnvironment.environmentId, {
          descriptor: upgradedDescriptor,
          serverConfig: {
            environment: upgradedDescriptor,
          },
        });
      });
      mockConnectionReconnects.push(reconnect);
      queueMicrotask(() => {
        input.onConfigSnapshot?.({
          environment: {
            environmentId: input.knownEnvironment.environmentId,
            label: input.knownEnvironment.label,
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "0.0.0-test",
            capabilities: { repositoryIdentity: true },
          },
        });
      });
      return {
        kind: input.kind,
        environmentId: input.knownEnvironment.environmentId,
        knownEnvironment: input.knownEnvironment,
        client: input.client,
        ensureBootstrapped: vi.fn(async () => undefined),
        reconnect,
        dispose: vi.fn(async () => undefined),
      };
    });

    const {
      listEnvironmentConnections,
      reconnectSavedEnvironment,
      resetEnvironmentServiceForTests,
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });

    const release = retainThreadDetailSubscription(environmentId, threadId);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);
    expect(mockSubscribeThreadV2).not.toHaveBeenCalled();

    await reconnectSavedEnvironment(environmentId);

    expect(mockThreadUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);
    expect(mockSubscribeThreadV2).toHaveBeenCalledTimes(1);
    expect(mockSubscribeThreadV2).toHaveBeenCalledWith({ threadId }, expect.any(Function));

    release();
    stop();
    await resetEnvironmentServiceForTests();
  });

  it("auto-reconnects a saved environment after an unexpected socket close", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");

    const {
      listEnvironmentConnections,
      resetEnvironmentServiceForTests,
      startEnvironmentConnectionService,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });

    const savedTransport = mockWsTransportInstances.find(
      (instance) => instance.runtimeOptions?.trackGlobalConnectionState === false,
    );
    const savedReconnect = mockConnectionReconnects.at(-1);
    expect(savedTransport).toBeDefined();
    expect(savedReconnect).toBeDefined();

    savedTransport?.handlers.onClose?.({ code: 1006, reason: "" }, { intentional: false });

    await vi.advanceTimersByTimeAsync(999);
    expect(savedReconnect).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(savedReconnect).toHaveBeenCalledTimes(1);
    });

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("drops released saved thread detail subscriptions before auto-reconnect replay", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const threadId = ThreadId.make("thread-cached-heavy");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");

    const {
      listEnvironmentConnections,
      resetEnvironmentServiceForTests,
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });

    const release = retainThreadDetailSubscription(environmentId, threadId);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);
    release();

    const savedTransport = mockWsTransportInstances.find(
      (instance) => instance.runtimeOptions?.trackGlobalConnectionState === false,
    );
    const savedReconnect = mockConnectionReconnects.at(-1);
    expect(savedTransport).toBeDefined();
    expect(savedReconnect).toBeDefined();

    savedTransport?.handlers.onClose?.({ code: 1006, reason: "" }, { intentional: false });

    expect(mockThreadUnsubscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => {
      expect(savedReconnect).toHaveBeenCalledTimes(1);
    });
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("keeps active saved thread detail subscriptions through auto-reconnect", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const threadId = ThreadId.make("thread-active");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");

    const {
      listEnvironmentConnections,
      resetEnvironmentServiceForTests,
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });

    const release = retainThreadDetailSubscription(environmentId, threadId);
    expect(mockSubscribeThread).toHaveBeenCalledTimes(1);

    const savedTransport = mockWsTransportInstances.find(
      (instance) => instance.runtimeOptions?.trackGlobalConnectionState === false,
    );
    expect(savedTransport).toBeDefined();

    savedTransport?.handlers.onClose?.({ code: 1006, reason: "" }, { intentional: false });

    expect(mockThreadUnsubscribe).not.toHaveBeenCalled();

    release();
    stop();
    await resetEnvironmentServiceForTests();
  });

  it("cancels pending saved environment auto-reconnects on manual disconnect", async () => {
    const environmentId = EnvironmentId.make("env-remote");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");

    const {
      disconnectSavedEnvironment,
      listEnvironmentConnections,
      resetEnvironmentServiceForTests,
      startEnvironmentConnectionService,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    savedEnvironmentRegistryListener?.();
    await vi.waitFor(() => {
      expect(
        listEnvironmentConnections().some(
          (connection) => connection.environmentId === environmentId,
        ),
      ).toBe(true);
    });

    const savedTransport = mockWsTransportInstances.find(
      (instance) => instance.runtimeOptions?.trackGlobalConnectionState === false,
    );
    const savedReconnect = mockConnectionReconnects.at(-1);
    expect(savedTransport).toBeDefined();
    expect(savedReconnect).toBeDefined();

    savedTransport?.handlers.onClose?.({ code: 1006, reason: "" }, { intentional: false });
    await disconnectSavedEnvironment(environmentId);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(savedReconnect).not.toHaveBeenCalled();

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("keeps healthy environment streams connected when the browser resumes from the background", async () => {
    let visibilityState: DocumentVisibilityState = "visible";
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    vi.stubGlobal("document", {
      addEventListener: documentTarget.addEventListener.bind(documentTarget),
      removeEventListener: documentTarget.removeEventListener.bind(documentTarget),
      get visibilityState() {
        return visibilityState;
      },
    });
    vi.stubGlobal("window", {
      addEventListener: windowTarget.addEventListener.bind(windowTarget),
      removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    });

    const { resetEnvironmentServiceForTests, startEnvironmentConnectionService } =
      await import("./service");
    mockCreateEnvironmentConnection.mockImplementation((input) => {
      const reconnect = vi.fn(async () => undefined);
      mockConnectionReconnects.push(reconnect);
      queueMicrotask(() => {
        input.onConfigSnapshot?.({
          environment: {
            environmentId: input.knownEnvironment.environmentId,
            label: input.knownEnvironment.label,
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "0.0.0-test",
            capabilities: { repositoryIdentity: true },
          },
        });
      });
      return {
        kind: input.kind,
        environmentId: input.knownEnvironment.environmentId,
        knownEnvironment: input.knownEnvironment,
        client: {
          ...input.client,
          isHeartbeatFresh: vi.fn(() => true),
        },
        ensureBootstrapped: vi.fn(async () => undefined),
        reconnect,
        dispose: vi.fn(async () => undefined),
      };
    });

    const stop = startEnvironmentConnectionService(new QueryClient());
    expect(mockConnectionReconnects).toHaveLength(1);

    visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(mockConnectionReconnects[0]).not.toHaveBeenCalled();

    visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(mockConnectionReconnects[0]).not.toHaveBeenCalled();

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("reconnects stale environment streams when the browser resumes from the background", async () => {
    let visibilityState: DocumentVisibilityState = "visible";
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    vi.stubGlobal("document", {
      addEventListener: documentTarget.addEventListener.bind(documentTarget),
      removeEventListener: documentTarget.removeEventListener.bind(documentTarget),
      get visibilityState() {
        return visibilityState;
      },
    });
    vi.stubGlobal("window", {
      addEventListener: windowTarget.addEventListener.bind(windowTarget),
      removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    });
    mockCreateWsRpcClient.mockReturnValue({
      server: {
        getConfig: vi.fn(async () => ({
          environment: {
            environmentId: EnvironmentId.make("env-remote"),
            label: "Remote env",
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "0.0.0-test",
            capabilities: { repositoryIdentity: true },
          },
        })),
      },
      isHeartbeatFresh: vi.fn(() => false),
      orchestration: {
        subscribeThread: mockSubscribeThread,
        subscribeThreadV2: mockSubscribeThreadV2,
        getThreadActivityPage: vi.fn(),
        hydrateThreadActivityPayloads: vi.fn(),
      },
    });

    const { resetEnvironmentServiceForTests, startEnvironmentConnectionService } =
      await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    expect(mockConnectionReconnects).toHaveLength(1);

    visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(mockConnectionReconnects[0]).not.toHaveBeenCalled();

    visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(mockConnectionReconnects[0]).toHaveBeenCalledTimes(1);

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("records saved environment runtime errors when browser resume reconnect fails", async () => {
    let visibilityState: DocumentVisibilityState = "visible";
    const documentTarget = new EventTarget();
    const windowTarget = new EventTarget();
    const environmentId = EnvironmentId.make("env-remote");
    const record = {
      environmentId,
      label: "Remote env",
      httpBaseUrl: "https://remote.example.test/",
      wsBaseUrl: "wss://remote.example.test/",
      createdAt: "2026-05-01T00:00:00.000Z",
      lastConnectedAt: "2026-05-01T00:00:00.000Z",
    };
    vi.stubGlobal("document", {
      addEventListener: documentTarget.addEventListener.bind(documentTarget),
      removeEventListener: documentTarget.removeEventListener.bind(documentTarget),
      get visibilityState() {
        return visibilityState;
      },
    });
    vi.stubGlobal("window", {
      addEventListener: windowTarget.addEventListener.bind(windowTarget),
      removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    });
    mockListSavedEnvironmentRecords.mockReturnValue([record]);
    mockGetSavedEnvironmentRecord.mockReturnValue(record);
    mockReadSavedEnvironmentBearerToken.mockResolvedValue("bearer-token");
    mockCreateWsRpcClient.mockReturnValue({
      server: {
        getConfig: vi.fn(async () => ({
          environment: {
            environmentId,
            label: "Remote env",
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "0.0.0-test",
            capabilities: { repositoryIdentity: true },
          },
        })),
      },
      isHeartbeatFresh: vi.fn(() => false),
      orchestration: {
        subscribeThread: mockSubscribeThread,
        subscribeThreadV2: mockSubscribeThreadV2,
        getThreadActivityPage: vi.fn(),
        hydrateThreadActivityPayloads: vi.fn(),
      },
    });
    mockCreateEnvironmentConnection.mockImplementation((input) => {
      const reconnect = vi.fn(async () => {
        if (input.kind === "saved") {
          throw new Error("shell snapshot timeout");
        }
      });
      mockConnectionReconnects.push(reconnect);
      queueMicrotask(() => {
        input.onConfigSnapshot?.({
          environment: {
            environmentId: input.knownEnvironment.environmentId,
            label: input.knownEnvironment.label,
            platform: { os: "darwin", arch: "arm64" },
            serverVersion: "0.0.0-test",
            capabilities: { repositoryIdentity: true },
          },
        });
      });
      return {
        kind: input.kind,
        environmentId: input.knownEnvironment.environmentId,
        knownEnvironment: input.knownEnvironment,
        client: {
          ...input.client,
          isHeartbeatFresh: vi.fn(() => false),
        },
        ensureBootstrapped: vi.fn(async () => undefined),
        reconnect,
        dispose: vi.fn(async () => undefined),
      };
    });

    const { resetEnvironmentServiceForTests, startEnvironmentConnectionService } =
      await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    await vi.waitFor(() => {
      expect(mockConnectionReconnects).toHaveLength(2);
    });

    visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));

    await vi.waitFor(() => {
      expect(mockPatchRuntime).toHaveBeenCalledWith(
        environmentId,
        expect.objectContaining({
          connectionState: "error",
          lastError: expect.stringContaining(
            'Saved environment "Remote env" (env-remote, https://remote.example.test) failed while reconnecting after browser visibilitychange: shell snapshot timeout',
          ),
        }),
      );
    });

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("allows a larger idle cache before capacity eviction starts", async () => {
    const {
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
      resetEnvironmentServiceForTests,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    const environmentId = EnvironmentId.make("env-1");

    for (let index = 0; index < 12; index += 1) {
      const release = retainThreadDetailSubscription(
        environmentId,
        ThreadId.make(`thread-${index + 1}`),
      );
      release();
    }

    expect(mockThreadUnsubscribe).not.toHaveBeenCalled();

    stop();
    await resetEnvironmentServiceForTests();
  });

  it("disposes cached thread detail subscriptions when the environment service resets", async () => {
    const {
      retainThreadDetailSubscription,
      startEnvironmentConnectionService,
      resetEnvironmentServiceForTests,
    } = await import("./service");

    const stop = startEnvironmentConnectionService(new QueryClient());
    const environmentId = EnvironmentId.make("env-1");
    const threadId = ThreadId.make("thread-2");

    const release = retainThreadDetailSubscription(environmentId, threadId);
    release();

    await resetEnvironmentServiceForTests();
    expect(mockThreadUnsubscribe).toHaveBeenCalledTimes(1);

    stop();
  });
});
