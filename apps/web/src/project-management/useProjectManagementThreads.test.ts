import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  latestActiveProjectThreadShell,
  projectActivityThreadRefs,
} from "./useProjectManagementThreads";

const ENVIRONMENT_ID = EnvironmentId.make("leviathan");
const PROJECT_ID = ProjectId.make("project-1");

function threadShell(
  index: number,
  input?: { readonly archivedAt?: string | null; readonly updatedAt?: string },
): EnvironmentThreadShell {
  return {
    id: ThreadId.make(`thread-${index}`),
    environmentId: ENVIRONMENT_ID,
    projectId: PROJECT_ID,
    archivedAt: input?.archivedAt ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: input?.updatedAt ?? "2026-01-01T00:00:00.000Z",
    latestTurn: null,
  } as EnvironmentThreadShell;
}

describe("project thread detail ownership", () => {
  it("keeps active activity details available on the dedicated project page", () => {
    const shells = Array.from({ length: 104 }, (_, index) =>
      threadShell(index, {
        archivedAt: index % 2 === 0 ? null : "2026-02-01T00:00:00.000Z",
      }),
    );

    const refs = projectActivityThreadRefs(shells, false);

    expect(refs).toHaveLength(52);
    expect(refs[0]).toEqual({ environmentId: ENVIRONMENT_ID, threadId: shells[0]?.id });
    expect(refs[51]).toEqual({ environmentId: ENVIRONMENT_ID, threadId: shells[102]?.id });
  });

  it("opts archived shells into activity details for the inference surface", () => {
    const shells = Array.from({ length: 104 }, (_, index) =>
      threadShell(index, {
        archivedAt: index % 2 === 0 ? null : "2026-02-01T00:00:00.000Z",
      }),
    );

    const refs = projectActivityThreadRefs(shells, true);

    expect(refs).toHaveLength(104);
    expect(refs[0]).toEqual({ environmentId: ENVIRONMENT_ID, threadId: shells[0]?.id });
    expect(refs[103]).toEqual({ environmentId: ENVIRONMENT_ID, threadId: shells[103]?.id });
  });
});

describe("latestActiveProjectThreadShell", () => {
  it("selects the latest active thread using shell timestamps", () => {
    const older = threadShell(1, { updatedAt: "2026-01-02T00:00:00.000Z" });
    const latestArchived = threadShell(2, {
      archivedAt: "2026-01-04T00:00:00.000Z",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    const latestActive = threadShell(3, { updatedAt: "2026-01-03T00:00:00.000Z" });

    expect(latestActiveProjectThreadShell([older, latestArchived, latestActive])).toBe(
      latestActive,
    );
  });

  it("returns null when every shell is archived", () => {
    expect(
      latestActiveProjectThreadShell([threadShell(1, { archivedAt: "2026-01-02T00:00:00.000Z" })]),
    ).toBeNull();
  });
});
