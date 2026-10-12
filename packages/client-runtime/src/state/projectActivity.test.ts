import { describe, expect, it } from "vite-plus/test";
import { getProjectThreadSortTimestamp, type ProjectActivityInput } from "./projectActivity.ts";

const thread = {
  createdAt: "2026-03-09T10:00:00.000Z",
  updatedAt: "2026-03-09T11:00:00.000Z",
  latestUserAuthoredMessageAt: "2026-03-09T10:01:00.000Z",
  latestUserMessageAt: "2026-03-09T10:10:00.000Z",
  latestPublishedResponseAt: "2026-03-09T10:05:00.000Z",
} satisfies ProjectActivityInput;

describe("project activity", () => {
  it("anchors to publication and stays there during later progress and background prompts", () => {
    expect(getProjectThreadSortTimestamp(thread, "updated_at")).toBe(
      Date.parse("2026-03-09T10:05:00.000Z"),
    );
  });

  it("moves on a new user prompt", () => {
    expect(
      getProjectThreadSortTimestamp(
        { ...thread, latestUserAuthoredMessageAt: "2026-03-09T10:15:00.000Z" },
        "updated_at",
      ),
    ).toBe(Date.parse("2026-03-09T10:15:00.000Z"));
  });

  it("ignores all updates before the first prompt or published response", () => {
    expect(
      getProjectThreadSortTimestamp(
        { ...thread, latestUserAuthoredMessageAt: null, latestPublishedResponseAt: null },
        "updated_at",
      ),
    ).toBe(Date.parse(thread.createdAt));
  });

  it("keeps creation ordering independent of activity", () => {
    expect(getProjectThreadSortTimestamp(thread, "created_at")).toBe(Date.parse(thread.createdAt));
  });

  it("uses available prompt stamps on older shells without falling back to general updates", () => {
    expect(
      getProjectThreadSortTimestamp(
        {
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          latestUserMessageAt: thread.latestUserMessageAt,
        },
        "updated_at",
      ),
    ).toBe(Date.parse(thread.latestUserMessageAt!));
  });
});
