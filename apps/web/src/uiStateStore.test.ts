import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  legacyProjectCwdPreferenceKey,
  markThreadUnread,
  markThreadVisited,
  parsePersistedState,
  PERSISTED_STATE_KEY,
  type PersistedUiState,
  persistState,
  reorderProjects,
  resolveProjectExpanded,
  setNestedThreadExpanded,
  setProjectExpanded,
  setSidebarView,
  type UiState,
} from "./uiStateStore";

function makeUiState(overrides: Partial<UiState> = {}): UiState {
  return {
    projectExpandedById: {},
    projectOrder: [],
    sidebarProjectScopeKey: null,
    sidebarView: "projects",
    threadLastVisitedAtById: {},
    threadChangedFilesExpandedById: {},
    nestedThreadExpandedByKey: {},
    defaultAdvertisedEndpointKey: null,
    pullRequestMergeMethod: "merge",
    ...overrides,
  };
}

describe("uiStateStore pure functions", () => {
  it("stores server timestamps without moving visit state backwards", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState();
    const visited = markThreadVisited(initialState, threadId, "2026-02-25T12:30:00.700Z");

    expect(visited.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:30:00.700Z");
    expect(markThreadVisited(visited, threadId, "2026-02-25T12:30:00.000Z")).toBe(visited);
    expect(markThreadVisited(visited, threadId, "not-a-date")).toBe(visited);
  });

  it("marks a completed thread unread using the server completion timestamp", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, "2026-02-25T12:30:00.000Z");

    expect(next.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:29:59.999Z");
    expect(markThreadUnread(next, threadId, null)).toBe(next);
  });

  it("resolves project expansion from logical, physical, and legacy preference keys", () => {
    const physicalKey = "environment:/repo/project";
    const legacyKey = legacyProjectCwdPreferenceKey("/repo/project");

    expect(resolveProjectExpanded({ logical: false, [physicalKey]: true }, ["logical"])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [physicalKey]: false }, ["new-logical", physicalKey])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [legacyKey]: false }, ["new-logical", legacyKey])).toBe(false);
    expect(resolveProjectExpanded({}, ["new-logical"])).toBe(true);
  });

  it("sets expansion for every stable key belonging to a logical project", () => {
    const initialState = makeUiState();
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];

    const next = setProjectExpanded(initialState, keys, false);

    expect(next.projectExpandedById).toEqual({
      logical: false,
      "environment-a:/repo": false,
      "environment-b:/repo": false,
    });
    expect(setProjectExpanded(next, keys, false)).toBe(next);
  });

  it("moves grouped project members together", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const currentOrder = [keyALocal, keyARemote, keyB, keyC];

    const next = reorderProjects(makeUiState(), currentOrder, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote]);
  });
});

describe("setNestedThreadExpanded", () => {
  it("stores an explicit choice and clears it back to automatic", () => {
    const initial = makeUiState();
    const collapsed = setNestedThreadExpanded(initial, "environment:parent", false);
    expect(collapsed.nestedThreadExpandedByKey).toEqual({ "environment:parent": false });
    expect(setNestedThreadExpanded(collapsed, "environment:parent", false)).toBe(collapsed);
    const cleared = setNestedThreadExpanded(collapsed, "environment:parent", null);
    expect(cleared.nestedThreadExpandedByKey).toEqual({});
    expect(setNestedThreadExpanded(cleared, "environment:parent", null)).toBe(cleared);
  });

  it("drops stored parents that no longer host nested threads when writing", () => {
    const stale = setNestedThreadExpanded(
      setNestedThreadExpanded(makeUiState(), "environment:gone", true),
      "environment:parent",
      false,
    );
    const threads = [
      {
        environmentId: EnvironmentId.make("environment"),
        nestedUnderThreadId: ThreadId.make("parent"),
      },
    ];
    expect(
      setNestedThreadExpanded(stale, "environment:parent", true, threads).nestedThreadExpandedByKey,
    ).toEqual({ "environment:parent": true });
    expect(setNestedThreadExpanded(stale, "environment:parent", false, threads)).not.toBe(stale);
  });
});

describe("parsePersistedState", () => {
  it("hydrates raw UI-owned state without server entities", () => {
    const parsed = parsePersistedState({
      projectExpandedById: {
        logical: false,
        invalid: "no" as unknown as boolean,
      },
      projectOrder: ["physical-b", "", "physical-a", "physical-b"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
        invalid: "not-a-date",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpansionVersion: 2,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
    });

    expect(parsed).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      sidebarProjectScopeKey: null,
      sidebarView: "projects",
      pullRequestMergeMethod: "merge",
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      nestedThreadExpandedByKey: {},
    });
  });

  it("hydrates nested-thread expansion and defaults state written before it existed", () => {
    expect(
      parsePersistedState({
        nestedThreadExpandedByKey: {
          "environment:parent-1": true,
          "environment:parent-2": false,
          invalid: "yes" as unknown as boolean,
        },
      }).nestedThreadExpandedByKey,
    ).toEqual({ "environment:parent-1": true, "environment:parent-2": false });
    expect(parsePersistedState({}).nestedThreadExpandedByKey).toEqual({});
  });

  it.each([undefined, 1])("ignores changed-file expansion version %s", (version) => {
    const parsed = parsePersistedState({
      ...(version === undefined ? {} : { threadChangedFilesExpansionVersion: version }),
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
        },
      },
    });

    expect(parsed.threadChangedFilesExpandedById).toEqual({});
  });

  it("migrates legacy CWD project preferences into local alias keys", () => {
    const parsed = parsePersistedState({
      collapsedProjectCwds: ["/repo/b"],
      expandedProjectCwds: ["/repo/a"],
      projectOrderCwds: ["/repo/b", "/repo/a"],
    });
    const projectAKey = legacyProjectCwdPreferenceKey("/repo/a");
    const projectBKey = legacyProjectCwdPreferenceKey("/repo/b");

    expect(parsed.projectOrder).toEqual([projectBKey, projectAKey]);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectAKey])).toBe(true);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectBKey])).toBe(false);
    expect(resolveProjectExpanded(parsed.projectExpandedById, ["unknown"])).toBe(true);
  });
});

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("uiStateStore persistence", () => {
  let localStorageStub: Storage;

  beforeEach(() => {
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage: localStorageStub });
    vi.stubGlobal("localStorage", localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists raw UI preferences including thread visit markers", () => {
    const state = makeUiState({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
    });

    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      sidebarProjectScopeKey: null,
      sidebarView: "projects",
      threadChangedFilesExpansionVersion: 2,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      nestedThreadExpandedByKey: {},
      pullRequestMergeMethod: "merge",
    });
    expect(parsePersistedState(persisted)).toEqual({
      ...state,
    });
  });

  it("restores the T3 Threads view across reloads", () => {
    const state = setSidebarView(makeUiState(), "threads");
    persistState(state);
    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(parsePersistedState(persisted).sidebarView).toBe("threads");
    expect(parsePersistedState({ sidebarView: "unknown" as "projects" }).sidebarView).toBe(
      "projects",
    );
  });

  it("restores the sidebar project scope across reloads", () => {
    persistState(makeUiState({ sidebarProjectScopeKey: "github.com/pingdotgg/t3code" }));

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;

    expect(parsePersistedState(persisted).sidebarProjectScopeKey).toBe(
      "github.com/pingdotgg/t3code",
    );
  });
});
