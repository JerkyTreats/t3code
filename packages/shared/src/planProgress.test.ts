import { describe, expect, it } from "vite-plus/test";

import {
  derivePlanProgressPresentation,
  deriveThreadPlanProgressFromActivities,
  normalizePlanStepStatus,
  parseRuntimePlanSteps,
} from "./planProgress.ts";

describe("plan progress helpers", () => {
  it("normalizes supported and legacy step statuses", () => {
    expect(normalizePlanStepStatus("pending")).toBe("pending");
    expect(normalizePlanStepStatus("inProgress")).toBe("inProgress");
    expect(normalizePlanStepStatus("in_progress")).toBe("inProgress");
    expect(normalizePlanStepStatus("completed")).toBe("completed");
    expect(normalizePlanStepStatus("unknown")).toBe("pending");
  });

  it("parses valid plan steps and ignores malformed entries", () => {
    expect(
      parseRuntimePlanSteps([
        { step: "One", status: "completed" },
        { status: "completed" },
        null,
        { step: "Two", status: "in_progress" },
      ]),
    ).toEqual([
      { step: "One", status: "completed" },
      { step: "Two", status: "inProgress" },
    ]);
  });

  it("derives active progress from parsed steps", () => {
    expect(
      derivePlanProgressPresentation([
        { status: "completed" },
        { status: "completed" },
        { status: "inProgress" },
        { status: "pending" },
        { status: "pending" },
      ]),
    ).toMatchObject({
      completedAllSteps: false,
      currentStepNumber: 3,
      totalSteps: 5,
      label: "3/5",
    });
  });

  it("derives completed progress when every step is done", () => {
    expect(
      derivePlanProgressPresentation([{ status: "completed" }, { status: "completed" }]),
    ).toMatchObject({
      completedAllSteps: true,
      currentStepNumber: 2,
      totalSteps: 2,
      label: "2/2",
      pulse: false,
    });
  });

  it("prefers the latest plan activity for the current turn", () => {
    const progress = deriveThreadPlanProgressFromActivities(
      [
        {
          id: "activity-old",
          kind: "turn.plan.updated",
          turnId: "turn-old",
          createdAt: "2026-05-01T00:00:01.000Z",
          payload: { plan: [{ step: "Old", status: "completed" }] },
        },
        {
          id: "activity-current",
          kind: "turn.plan.updated",
          turnId: "turn-current",
          createdAt: "2026-05-01T00:00:02.000Z",
          payload: {
            plan: [
              { step: "One", status: "completed" },
              { step: "Two", status: "inProgress" },
            ],
          },
        },
      ],
      "turn-current",
    );

    expect(progress).toMatchObject({
      activityId: "activity-current",
      currentStepNumber: 2,
      totalSteps: 2,
      turnId: "turn-current",
    });
  });

  it("falls back to the latest plan activity from any turn", () => {
    const progress = deriveThreadPlanProgressFromActivities(
      [
        {
          id: "activity-plan",
          kind: "turn.plan.updated",
          turnId: "turn-plan",
          createdAt: "2026-05-01T00:00:01.000Z",
          payload: {
            plan: [
              { step: "One", status: "completed" },
              { step: "Two", status: "pending" },
            ],
          },
        },
      ],
      "turn-follow-up",
    );

    expect(progress).toMatchObject({
      activityId: "activity-plan",
      currentStepNumber: 2,
      totalSteps: 2,
      turnId: "turn-plan",
    });
  });

  it("returns null when no valid plan steps exist", () => {
    expect(
      deriveThreadPlanProgressFromActivities(
        [
          {
            id: "activity-empty",
            kind: "turn.plan.updated",
            turnId: "turn-1",
            createdAt: "2026-05-01T00:00:01.000Z",
            payload: { plan: [{ status: "completed" }] },
          },
        ],
        "turn-1",
      ),
    ).toBeNull();
  });
});
