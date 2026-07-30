import { EnvironmentId, ProjectId, type ScopedProjectRef, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { collectLocallyKnownProjectThreadRefs } from "./archivedThreadsState";

const environmentA = EnvironmentId.make("environment-a");
const environmentB = EnvironmentId.make("environment-b");
const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const projectRef: ScopedProjectRef = {
  environmentId: environmentA,
  projectId: projectA,
};

function knownThread(input: {
  environmentId: EnvironmentId;
  id: string;
  projectId: ReturnType<typeof ProjectId.make>;
}) {
  return {
    environmentId: input.environmentId,
    id: ThreadId.make(input.id),
    projectId: input.projectId,
  };
}

describe("collectLocallyKnownProjectThreadRefs", () => {
  it("finds an archived-only project with exact environment and project isolation", () => {
    const archivedThread = knownThread({
      environmentId: environmentA,
      id: "archived-target",
      projectId: projectA,
    });

    expect(
      collectLocallyKnownProjectThreadRefs({
        projectRef,
        activeThreads: [],
        archivedThreads: [
          archivedThread,
          knownThread({
            environmentId: environmentB,
            id: "archived-other-environment",
            projectId: projectA,
          }),
          knownThread({
            environmentId: environmentA,
            id: "archived-other-project",
            projectId: projectB,
          }),
        ],
      }),
    ).toEqual([
      {
        environmentId: environmentA,
        threadId: archivedThread.id,
      },
    ]);
  });

  it("combines active and archived project threads without duplicates", () => {
    const activeThread = knownThread({
      environmentId: environmentA,
      id: "active-target",
      projectId: projectA,
    });
    const archivedThread = knownThread({
      environmentId: environmentA,
      id: "archived-target",
      projectId: projectA,
    });

    expect(
      collectLocallyKnownProjectThreadRefs({
        projectRef,
        activeThreads: [activeThread],
        archivedThreads: [
          archivedThread,
          activeThread,
          knownThread({
            environmentId: environmentA,
            id: "archived-other-project",
            projectId: projectB,
          }),
        ],
      }),
    ).toEqual([
      {
        environmentId: environmentA,
        threadId: activeThread.id,
      },
      {
        environmentId: environmentA,
        threadId: archivedThread.id,
      },
    ]);
  });
});
