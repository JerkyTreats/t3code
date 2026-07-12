import { describe, expect, it } from "vite-plus/test";

import { clearPlanPreviewRouteSearch, parsePlanPreviewRouteSearch } from "./planPreviewRouteSearch";

describe("parsePlanPreviewRouteSearch", () => {
  it("keeps a valid virtual plan preview target", () => {
    expect(
      parsePlanPreviewRouteSearch({
        planPreview: "1",
        planThreadId: "thread-1",
        planId: "plan-1",
      }),
    ).toEqual({
      planPreview: "1",
      planThreadId: "thread-1",
      planId: "plan-1",
    });
  });

  it("allows plan preview to target the current route thread by omitting planThreadId", () => {
    expect(
      parsePlanPreviewRouteSearch({
        planPreview: true,
        planId: "plan-2",
      }),
    ).toEqual({
      planPreview: "1",
      planId: "plan-2",
    });
  });

  it("drops incomplete preview state", () => {
    expect(parsePlanPreviewRouteSearch({ planPreview: "1" })).toEqual({});
    expect(parsePlanPreviewRouteSearch({ planPreview: "0", planId: "plan-1" })).toEqual({});
  });
});

describe("clearPlanPreviewRouteSearch", () => {
  it("preserves unrelated search state while clearing plan preview state", () => {
    expect(
      clearPlanPreviewRouteSearch({
        view: "management",
        planPreview: "1",
        planThreadId: "thread-1",
        planId: "plan-1",
      }),
    ).toEqual({
      view: "management",
      planPreview: undefined,
      planThreadId: undefined,
      planId: undefined,
    });
  });
});
