import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { openConcreteProjectLauncher } from "./openProjectLauncher";

const ENVIRONMENT_A = EnvironmentId.make("environment-a");
const ENVIRONMENT_B = EnvironmentId.make("environment-b");
const PROJECT = ProjectId.make("shared-project");

describe("openConcreteProjectLauncher", () => {
  it("opens and navigates the latest thread from the exact environment", async () => {
    const shown: ScopedThreadRef[] = [];
    const navigated: ScopedThreadRef[] = [];
    const createProjectThread = vi.fn();
    await openConcreteProjectLauncher({
      projectRef: scopeProjectRef(ENVIRONMENT_B, PROJECT),
      sortOrder: "updated_at",
      threads: [
        {
          id: ThreadId.make("wrong-environment"),
          environmentId: ENVIRONMENT_A,
          projectId: PROJECT,
          title: "Wrong",
          archivedAt: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-30T00:00:00.000Z",
        },
        {
          id: ThreadId.make("right-environment"),
          environmentId: ENVIRONMENT_B,
          projectId: PROJECT,
          title: "Right",
          archivedAt: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      showLauncher: (threadRef) => shown.push(threadRef),
      navigateToThread: async (threadRef) => {
        navigated.push(threadRef);
      },
      createProjectThread,
    });

    const expected = scopeThreadRef(ENVIRONMENT_B, ThreadId.make("right-environment"));
    expect(shown).toEqual([expected]);
    expect(navigated).toEqual([expected]);
    expect(createProjectThread).not.toHaveBeenCalled();
  });

  it("opens the launcher against a newly allocated concrete thread", async () => {
    const shown: ScopedThreadRef[] = [];
    const projectRef = scopeProjectRef(ENVIRONMENT_A, PROJECT);
    await openConcreteProjectLauncher({
      projectRef,
      sortOrder: "updated_at",
      threads: [],
      showLauncher: (threadRef) => shown.push(threadRef),
      navigateToThread: vi.fn(),
      createProjectThread: async (receivedRef, beforeNavigate) => {
        expect(receivedRef).toEqual(projectRef);
        beforeNavigate(ThreadId.make("new-thread"));
      },
    });
    expect(shown).toEqual([scopeThreadRef(ENVIRONMENT_A, ThreadId.make("new-thread"))]);
  });
});
