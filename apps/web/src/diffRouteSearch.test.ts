import { describe, expect, it } from "vite-plus/test";

import {
  clearDiffSearchParams,
  parseDiffRouteSearch,
  stripDiffSearchParams,
} from "./diffRouteSearch";

describe("parseDiffRouteSearch", () => {
  it("parses valid diff search values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      diff: "1",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });
  });

  it("treats numeric and boolean diff toggles as open", () => {
    expect(
      parseDiffRouteSearch({
        diff: 1,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      diff: "1",
      diffTurnId: "turn-1",
    });

    expect(
      parseDiffRouteSearch({
        diff: true,
        diffTurnId: "turn-1",
      }),
    ).toEqual({
      diff: "1",
      diffTurnId: "turn-1",
    });
  });

  it("drops turn and file values when diff is closed", () => {
    const parsed = parseDiffRouteSearch({
      diff: "0",
      diffTurnId: "turn-1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({});
  });

  it("drops file value when turn is not selected", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffFilePath: "src/app.ts",
    });

    expect(parsed).toEqual({
      diff: "1",
    });
  });

  it("normalizes whitespace-only values", () => {
    const parsed = parseDiffRouteSearch({
      diff: "1",
      diffTurnId: "  ",
      diffFilePath: "  ",
    });

    expect(parsed).toEqual({
      diff: "1",
    });
  });

  it("parses Git panel mode", () => {
    expect(parseDiffRouteSearch({ git: "1" })).toEqual({ git: "1" });
  });

  it("parses fullscreen plan preview mode", () => {
    expect(
      parseDiffRouteSearch({
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

  it("drops incomplete fullscreen plan preview mode", () => {
    expect(
      parseDiffRouteSearch({
        planPreview: "1",
        planThreadId: "thread-1",
      }),
    ).toEqual({});
  });

  it("strips plan preview search params", () => {
    expect(
      stripDiffSearchParams({
        planPreview: "1",
        planThreadId: "thread-1",
        planId: "plan-1",
        git: "1",
        keep: "value",
      }),
    ).toEqual({ keep: "value" });
  });

  it("clears panel params explicitly for retained route search", () => {
    expect(
      clearDiffSearchParams({
        diff: "1",
        git: "1",
        files: "1",
        diffTurnId: "turn-1",
        diffFilePath: "src/app.ts",
        docPath: "README.md",
        docExpanded: "1",
        planPreview: "1",
        planThreadId: "thread-1",
        planId: "plan-1",
        keep: "value",
      }),
    ).toEqual({
      diff: undefined,
      git: undefined,
      files: undefined,
      diffTurnId: undefined,
      diffFilePath: undefined,
      docPath: undefined,
      docExpanded: undefined,
      planPreview: undefined,
      planThreadId: undefined,
      planId: undefined,
      keep: "value",
    });
  });
});
