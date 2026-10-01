import { describe, expect, it } from "vite-plus/test";

import { isThreadInSidebarView, sidebarViewShowsDrafts } from "./threadSidebarView";

describe("T3 Thread sidebar view", () => {
  it("keeps only T3 Thread creations in their own view", () => {
    const threads = [
      { id: "older" },
      { id: "web", creationSurface: "web" as const },
      { id: "desktop", creationSurface: "desktop" as const },
      { id: "thread", creationSurface: "thread" as const },
    ];
    expect(
      threads
        .filter((thread) => isThreadInSidebarView(thread, "threads"))
        .map((thread) => thread.id),
    ).toEqual(["thread"]);
    expect(
      threads
        .filter((thread) => isThreadInSidebarView(thread, "projects"))
        .map((thread) => thread.id),
    ).toEqual(["older", "web", "desktop"]);
    expect(sidebarViewShowsDrafts("threads")).toBe(false);
    expect(sidebarViewShowsDrafts("projects")).toBe(true);
  });
});
