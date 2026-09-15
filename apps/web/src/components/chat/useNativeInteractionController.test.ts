import {
  ThreadId,
  TurnId,
  type DesktopInteractionEvent,
  type InteractionResource,
} from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  interactionLeaseMatchesProjection,
  paintInteractionFrame,
} from "./useNativeInteractionController";

function engagedResource(
  engagement: Extract<InteractionResource["engagement"], { state: "engaged" }> = {
    state: "engaged",
    epoch: 3,
    ownerClientId: "client-a",
    presentationRevision: 1,
  },
): InteractionResource {
  return {
    id: "interaction-1" as InteractionResource["id"],
    threadId: ThreadId.make("thread-1"),
    revision: 2,
    anchorTurnId: TurnId.make("turn-1"),
    createdSequence: 10,
    capabilityId: "wallpaper.interaction.lab.v1",
    createdByClientId: "client-fixture" as InteractionResource["createdByClientId"],
    request: {
      ref: "request-1",
      revision: "1",
      digest: "digest-1",
      conditionRevision: "1",
      inputProvenance: "synthetic",
    },
    display: { title: "Guide the field", summary: "Move through the target." },
    lifecycle: { state: "open" },
    presentation: {
      state: "ready",
      ownerClientId: "client-a",
      presentationRevision: 1,
      lastFrameSequence: null,
      droppedFrames: 0,
    },
    engagement,
    evidence: null,
    resolution: null,
    continuation: { state: "none" },
    createdAt: "2026-01-01T00:00:02.000Z",
    updatedAt: "2026-01-01T00:00:03.000Z",
  };
}

describe("native interaction controller boundaries", () => {
  it("requires exact projected owner, epoch, and presentation equality", () => {
    const lease = { ownerClientId: "client-a", engagementEpoch: 3 };
    expect(interactionLeaseMatchesProjection(engagedResource(), lease)).toBe(true);
    expect(
      interactionLeaseMatchesProjection(
        engagedResource({
          state: "engaged",
          epoch: 3,
          ownerClientId: "client-b",
          presentationRevision: 1,
        }),
        lease,
      ),
    ).toBe(false);
    expect(
      interactionLeaseMatchesProjection(
        engagedResource({
          state: "engaged",
          epoch: 4,
          ownerClientId: "client-a",
          presentationRevision: 1,
        }),
        lease,
      ),
    ).toBe(false);
    expect(
      interactionLeaseMatchesProjection(
        engagedResource({
          state: "engaged",
          epoch: 3,
          ownerClientId: "client-a",
          presentationRevision: 2,
        }),
        lease,
      ),
    ).toBe(false);
  });

  it("paints the exact native frame payload into the canvas", () => {
    const payload = new Uint8Array([12, 34, 56, 255]);
    const data = new Uint8ClampedArray(4);
    const context = {
      createImageData: vi.fn(() => ({ data })),
      putImageData: vi.fn(),
    };
    const canvas = {
      getContext: vi.fn(() => context),
    } as unknown as HTMLCanvasElement;
    const frame = {
      kind: "Frame",
      width: 1,
      height: 1,
      payload,
    } as unknown as Extract<DesktopInteractionEvent, { kind: "Frame" }>;

    expect(paintInteractionFrame(canvas, frame)).toBe(true);
    expect([...data]).toEqual([...payload]);
    expect(context.putImageData).toHaveBeenCalledWith({ data }, 0, 0);
  });
});
