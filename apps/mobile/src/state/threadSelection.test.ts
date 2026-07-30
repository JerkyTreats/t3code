import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveThreadRouteRef,
  retainThreadRouteRef,
  threadDetailToShell,
} from "./threadSelection";

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const THREAD_ID = ThreadId.make("thread-1");

describe("mobile thread selection", () => {
  it("resolves array route parameters without crossing environment identity", () => {
    expect(
      resolveThreadRouteRef({
        environmentId: ["environment-1", "ignored-environment"],
        threadId: ["thread-1", "ignored-thread"],
      }),
    ).toEqual({
      environmentId: ENVIRONMENT_ID,
      threadId: THREAD_ID,
    });
  });

  it("retains the exact selected thread while a nested route omits thread parameters", () => {
    const previous = {
      environmentId: ENVIRONMENT_ID,
      threadId: THREAD_ID,
    };

    expect(retainThreadRouteRef(resolveThreadRouteRef(undefined), previous)).toEqual(previous);
    expect(
      retainThreadRouteRef(
        resolveThreadRouteRef({
          environmentId: "environment-2",
          threadId: "thread-2",
        }),
        previous,
      ),
    ).toEqual({
      environmentId: EnvironmentId.make("environment-2"),
      threadId: ThreadId.make("thread-2"),
    });
  });

  it("preserves settlement fields when cached detail supplies the shell fallback", () => {
    const thread: OrchestrationThread = {
      id: THREAD_ID,
      projectId: ProjectId.make("project-1"),
      title: "Settled work",
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex-work"),
        model: "gpt-test",
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: "main",
      worktreePath: null,
      latestTurn: null,
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:01:00.000Z",
      archivedAt: null,
      settledOverride: "settled",
      settledAt: "2026-07-30T00:02:00.000Z",
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      session: null,
    };

    expect(threadDetailToShell(ENVIRONMENT_ID, thread)).toMatchObject({
      environmentId: ENVIRONMENT_ID,
      id: THREAD_ID,
      projectId: ProjectId.make("project-1"),
      modelSelection: {
        instanceId: ProviderInstanceId.make("codex-work"),
        model: "gpt-test",
      },
      settledOverride: "settled",
      settledAt: "2026-07-30T00:02:00.000Z",
    });
  });
});
