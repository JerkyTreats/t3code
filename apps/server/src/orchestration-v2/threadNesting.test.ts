import {
  type OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { nestingParentRejection } from "./threadNesting.ts";

const now = DateTime.makeUnsafe(0);
const projectId = ProjectId.make("project:nesting");
const childId = ThreadId.make("thread:child");
const parentId = ThreadId.make("thread:parent");

function makeParent(overrides: Partial<OrchestrationV2AppThread> = {}): OrchestrationV2AppThread {
  const providerInstanceId = ProviderInstanceId.make("codex");
  return {
    createdBy: "user",
    creationSource: "web",
    id: parentId,
    projectId,
    title: "Parent",
    providerInstanceId,
    modelSelection: { instanceId: providerInstanceId, model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: parentId },
    forkedFrom: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const reject = (parent: OrchestrationV2AppThread | null, parentThreadId = parentId) =>
  nestingParentRejection({ threadId: childId, projectId, parentThreadId, parent });

describe("nestingParentRejection", () => {
  it("accepts a live top-level thread in the same project", () => {
    expect(reject(makeParent())).toBeNull();
  });

  it("rejects each invalid nesting target", () => {
    expect(reject(makeParent({ id: childId }), childId)).toBe("a thread cannot nest under itself");
    expect(reject(null)).toBe("the parent thread does not exist");
    expect(reject(makeParent({ deletedAt: now }))).toBe("the parent thread does not exist");
    expect(reject(makeParent({ projectId: ProjectId.make("project:other") }))).toBe(
      "the parent thread belongs to another project",
    );
    expect(reject(makeParent({ archivedAt: now }))).toBe("the parent thread is archived");
    expect(
      reject(
        makeParent({
          lineage: {
            parentThreadId: ThreadId.make("thread:root"),
            relationshipToParent: "subagent",
            rootThreadId: ThreadId.make("thread:root"),
          },
        }),
      ),
    ).toBe("the parent thread is a subagent");
    expect(reject(makeParent({ nestedUnderThreadId: ThreadId.make("thread:grand") }))).toBe(
      "the parent thread is itself nested",
    );
  });
});
