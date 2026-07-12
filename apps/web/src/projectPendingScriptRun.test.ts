import { ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, beforeEach } from "vite-plus/test";

import {
  consumePendingProjectScriptRun,
  resetPendingProjectScriptRunsForTests,
  schedulePendingProjectScriptRun,
} from "./projectPendingScriptRun";

describe("projectPendingScriptRun", () => {
  beforeEach(() => {
    resetPendingProjectScriptRunsForTests();
  });

  it("consumes a scheduled project script run once", () => {
    const threadId = ThreadId.make("thread-1");
    const projectId = ProjectId.make("project-1");

    schedulePendingProjectScriptRun({
      threadId,
      projectId,
      scriptId: "test",
    });

    expect(consumePendingProjectScriptRun(threadId)).toEqual({
      projectId,
      scriptId: "test",
    });
    expect(consumePendingProjectScriptRun(threadId)).toBeNull();
  });
});
