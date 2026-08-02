import { describe, expect, it } from "vite-plus/test";
import { resolveMermaidScrollAdjustment } from "./mermaidScrollStability";

describe("Mermaid scroll stability", () => {
  it("preserves the reading position when an off-screen diagram changes height", () => {
    expect(
      resolveMermaidScrollAdjustment({
        heightDelta: 180,
        previousBlockBottom: 80,
        viewportTop: 100,
        distanceFromEnd: 420,
      }),
    ).toBe(180);
    expect(
      resolveMermaidScrollAdjustment({
        heightDelta: -60,
        previousBlockBottom: 80,
        viewportTop: 100,
        distanceFromEnd: 420,
      }),
    ).toBe(-60);
  });

  it("does not move the viewport while the diagram is visible", () => {
    expect(
      resolveMermaidScrollAdjustment({
        heightDelta: 180,
        previousBlockBottom: 220,
        viewportTop: 100,
        distanceFromEnd: 420,
      }),
    ).toBe(0);
  });

  it("leaves live-edge following to the timeline", () => {
    expect(
      resolveMermaidScrollAdjustment({
        heightDelta: 180,
        previousBlockBottom: 80,
        viewportTop: 100,
        distanceFromEnd: 1,
      }),
    ).toBe(0);
  });
});
