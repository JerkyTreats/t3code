import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import {
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import type { Thread } from "../types";
import {
  buildProjectCwdByScopedKey,
  buildProjectTitleByScopedKey,
  buildThreadActionItems,
  filterCommandPaletteGroups,
  type CommandPaletteGroup,
} from "./CommandPalette.logic";

const LOCAL_ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const PROJECT_ID = ProjectId.make("project-1");
const LOCAL_PROJECT_KEY = scopedProjectKey(scopeProjectRef(LOCAL_ENVIRONMENT_ID, PROJECT_ID));

describe("buildProjectCwdByScopedKey", () => {
  it("keeps colliding project ids isolated by exact environment identity", () => {
    const otherEnvironmentId = EnvironmentId.make("environment-remote");
    const cwdByProject = buildProjectCwdByScopedKey([
      {
        environmentId: LOCAL_ENVIRONMENT_ID,
        id: PROJECT_ID,
        workspaceRoot: "/local/project",
      },
      {
        environmentId: otherEnvironmentId,
        id: PROJECT_ID,
        workspaceRoot: "/remote/project",
      },
    ]);

    expect(
      cwdByProject.get(scopedProjectKey(scopeProjectRef(LOCAL_ENVIRONMENT_ID, PROJECT_ID))),
    ).toBe("/local/project");
    expect(
      cwdByProject.get(scopedProjectKey(scopeProjectRef(otherEnvironmentId, PROJECT_ID))),
    ).toBe("/remote/project");

    const titleByProject = buildProjectTitleByScopedKey([
      {
        environmentId: LOCAL_ENVIRONMENT_ID,
        id: PROJECT_ID,
        title: "Local project",
      },
      {
        environmentId: otherEnvironmentId,
        id: PROJECT_ID,
        title: "Remote project",
      },
    ]);
    expect(titleByProject.get(LOCAL_PROJECT_KEY)).toBe("Local project");
    expect(
      titleByProject.get(scopedProjectKey(scopeProjectRef(otherEnvironmentId, PROJECT_ID))),
    ).toBe("Remote project");
  });
});

function makeThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: ThreadId.make("thread-1"),
    environmentId: LOCAL_ENVIRONMENT_ID,
    projectId: PROJECT_ID,
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "full-access",
    interactionMode: "default",
    session: null,
    messages: [],
    proposedPlans: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    updatedAt: "2026-03-01T00:00:00.000Z",
    latestTurn: null,
    branch: null,
    worktreePath: null,
    checkpoints: [],
    activities: [],
    ...overrides,
  };
}

describe("buildThreadActionItems", () => {
  it("orders threads by most recent activity and formats timestamps from updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

    try {
      const items = buildThreadActionItems({
        threads: [
          makeThread({
            id: ThreadId.make("thread-older"),
            title: "Older thread",
            updatedAt: "2026-03-24T12:00:00.000Z",
          }),
          makeThread({
            id: ThreadId.make("thread-newer"),
            title: "Newer thread",
            createdAt: "2026-03-20T00:00:00.000Z",
            updatedAt: "2026-03-20T00:00:00.000Z",
          }),
        ],
        projectTitleByScopedKey: new Map([[LOCAL_PROJECT_KEY, "Project"]]),
        sortOrder: "updated_at",
        icon: null,
        runThread: async (_thread) => undefined,
      });

      expect(items.map((item) => item.value)).toEqual([
        "thread:environment-local:thread-older",
        "thread:environment-local:thread-newer",
      ]);
      expect(items[0]?.timestamp).toBe("1d ago");
      expect(items[1]?.timestamp).toBe("5d ago");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ranks thread title matches ahead of contextual project-name matches", () => {
    const threadItems = buildThreadActionItems({
      threads: [
        makeThread({
          id: ThreadId.make("thread-context-match"),
          title: "Fix navbar spacing",
          updatedAt: "2026-03-20T00:00:00.000Z",
        }),
        makeThread({
          id: ThreadId.make("thread-title-match"),
          title: "Project kickoff notes",
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        }),
      ],
      projectTitleByScopedKey: new Map([[LOCAL_PROJECT_KEY, "Project"]]),
      sortOrder: "updated_at",
      icon: null,
      runThread: async (_thread) => undefined,
    });

    const groups = filterCommandPaletteGroups({
      activeGroups: [],
      query: "project",
      isInSubmenu: false,
      projectSearchItems: [],
      threadSearchItems: threadItems,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.value).toBe("threads-search");
    expect(groups[0]?.items.map((item) => item.value)).toEqual([
      "thread:environment-local:thread-title-match",
      "thread:environment-local:thread-context-match",
    ]);
  });

  it("preserves thread project-name matches when there is no stronger title match", () => {
    const group: CommandPaletteGroup = {
      value: "threads-search",
      label: "Threads",
      items: [
        {
          kind: "action",
          value: "thread:project-context-only",
          searchTerms: ["Fix navbar spacing", "Project"],
          title: "Fix navbar spacing",
          description: "Project",
          icon: null,
          run: async () => undefined,
        },
      ],
    };

    const groups = filterCommandPaletteGroups({
      activeGroups: [group],
      query: "project",
      isInSubmenu: false,
      projectSearchItems: [],
      threadSearchItems: [],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.value)).toEqual(["thread:project-context-only"]);
  });

  it("filters archived threads out of thread search items", () => {
    const items = buildThreadActionItems({
      threads: [
        makeThread({
          id: ThreadId.make("thread-active"),
          title: "Active thread",
          createdAt: "2026-03-02T00:00:00.000Z",
          updatedAt: "2026-03-19T00:00:00.000Z",
        }),
        makeThread({
          id: ThreadId.make("thread-archived"),
          title: "Archived thread",
          archivedAt: "2026-03-20T00:00:00.000Z",
          updatedAt: "2026-03-20T00:00:00.000Z",
        }),
      ],
      projectTitleByScopedKey: new Map([[LOCAL_PROJECT_KEY, "Project"]]),
      sortOrder: "updated_at",
      icon: null,
      runThread: async (_thread) => undefined,
    });

    expect(items.map((item) => item.value)).toEqual(["thread:environment-local:thread-active"]);
  });

  it("scopes item identity and active state across colliding thread ids", async () => {
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const sharedThreadId = ThreadId.make("thread-shared");
    const opened: string[] = [];
    const items = buildThreadActionItems({
      threads: [
        makeThread({
          environmentId: LOCAL_ENVIRONMENT_ID,
          id: sharedThreadId,
          title: "Local thread",
          updatedAt: "2026-03-20T00:00:00.000Z",
        }),
        makeThread({
          environmentId: remoteEnvironmentId,
          id: sharedThreadId,
          title: "Remote thread",
          updatedAt: "2026-03-21T00:00:00.000Z",
        }),
      ],
      activeThreadKey: scopedThreadKey(scopeThreadRef(remoteEnvironmentId, sharedThreadId)),
      projectTitleByScopedKey: new Map([[LOCAL_PROJECT_KEY, "Project"]]),
      sortOrder: "updated_at",
      icon: null,
      runThread: async (thread) => {
        opened.push(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)));
      },
    });

    expect(items.map((item) => item.value)).toEqual([
      "thread:environment-remote:thread-shared",
      "thread:environment-local:thread-shared",
    ]);
    expect(items[0]?.description).toContain("Current thread");
    expect(items[1]?.description).not.toContain("Current thread");

    await items[0]?.run();
    await items[1]?.run();
    expect(opened).toEqual(["environment-remote:thread-shared", "environment-local:thread-shared"]);
  });
});
