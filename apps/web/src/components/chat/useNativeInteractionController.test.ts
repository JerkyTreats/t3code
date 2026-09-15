import {
  EnvironmentId,
  ThreadId,
  TurnId,
  type DesktopInteractionBridge,
  type DesktopInteractionEvent,
  type InteractionResource,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { act, createElement, StrictMode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { setPresentation, engageInteraction, disengageInteraction, cancelInteraction } = vi.hoisted(
  () => ({
    setPresentation: vi.fn(),
    engageInteraction: vi.fn(),
    disengageInteraction: vi.fn(),
    cancelInteraction: vi.fn(),
  }),
);

const commandAtoms = vi.hoisted(() => ({
  setInteractionPresentation: {},
  engageInteraction: {},
  disengageInteraction: {},
  cancelInteraction: {},
}));

vi.mock("~/state/threads", () => ({ threadEnvironment: commandAtoms }));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: object) => {
    if (command === commandAtoms.setInteractionPresentation) return setPresentation;
    if (command === commandAtoms.engageInteraction) return engageInteraction;
    if (command === commandAtoms.disengageInteraction) return disengageInteraction;
    if (command === commandAtoms.cancelInteraction) return cancelInteraction;
    throw new Error("Unexpected interaction command atom.");
  },
}));

import {
  interactionLeaseMatchesProjection,
  paintInteractionFrame,
  useNativeInteractionController,
} from "./useNativeInteractionController";

const environmentId = EnvironmentId.make("native-controller-test");
let renderer: ReactTestRenderer | null;
let bridge: DesktopInteractionBridge;
let nativeListener: ((event: DesktopInteractionEvent) => void) | null;

function InteractionSurface(props: { interactions: ReadonlyArray<InteractionResource> }) {
  useNativeInteractionController(environmentId, props.interactions);
  return null;
}

function mountedSurface(interactions: ReadonlyArray<InteractionResource>) {
  return createElement(StrictMode, null, createElement(InteractionSurface, { interactions }));
}

async function flushLifecycle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function engagedResource(
  engagement: InteractionResource["engagement"] = {
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

function availableResource(overrides: Partial<InteractionResource> = {}): InteractionResource {
  return {
    ...engagedResource({ state: "disengaged", latestEpoch: 0 }),
    revision: 1,
    presentation: {
      state: "unavailable",
      ownerClientId: null,
      presentationRevision: 0,
      lastFrameSequence: null,
      droppedFrames: 0,
    },
    ...overrides,
  };
}

beforeEach(() => {
  renderer = null;
  nativeListener = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setPresentation.mockReset().mockResolvedValue(AsyncResult.success({ sequence: 1 }));
  engageInteraction.mockReset();
  disengageInteraction.mockReset();
  cancelInteraction.mockReset();
  bridge = {
    start: vi.fn().mockResolvedValue(undefined),
    arm: vi.fn().mockResolvedValue(undefined),
    input: vi.fn().mockResolvedValue(true),
    disarm: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onEvent: vi.fn((listener) => {
      nativeListener = listener;
      return vi.fn();
    }),
  };
  vi.stubGlobal("window", {
    desktopBridge: { interaction: bridge },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(async () => {
  if (renderer !== null) await act(async () => renderer?.unmount());
  renderer = null;
  vi.unstubAllGlobals();
});

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

  it("claims presentation before launching a resource present on first mount", async () => {
    const resource = availableResource();
    act(() => {
      renderer = create(mountedSurface([resource]));
    });
    await flushLifecycle();

    expect(setPresentation).toHaveBeenCalledTimes(1);
    expect(setPresentation).toHaveBeenCalledWith({
      environmentId,
      input: {
        operationId: expect.any(String),
        threadId: resource.threadId,
        interactionId: resource.id,
        resourceRevision: 1,
        presentationRevision: 1,
        state: "starting",
        lastFrameSequence: null,
        droppedFrames: 0,
      },
    });
    expect(bridge.start).toHaveBeenCalledTimes(1);
    expect(bridge.start).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId: resource.id,
        resourceRevision: 1,
      }),
    );
    expect(bridge.stop).not.toHaveBeenCalled();
  });

  it("claims and launches a resource that arrives in a projection update", async () => {
    const resource = availableResource();
    act(() => {
      renderer = create(mountedSurface([]));
    });
    await flushLifecycle();
    expect(setPresentation).not.toHaveBeenCalled();
    expect(bridge.start).not.toHaveBeenCalled();

    act(() => renderer!.update(mountedSurface([resource])));
    await flushLifecycle();

    expect(setPresentation).toHaveBeenCalledTimes(1);
    expect(setPresentation.mock.calls[0]![0].input.state).toBe("starting");
    expect(bridge.start).toHaveBeenCalledTimes(1);
  });

  it("uses the accepted starting revision for the native ready transition", async () => {
    const resource = availableResource();
    act(() => {
      renderer = create(mountedSurface([resource]));
    });
    await flushLifecycle();
    const nativeSessionId = vi.mocked(bridge.start).mock.calls[0]![0].nativeSessionId;

    act(() => {
      nativeListener?.({
        kind: "Ready",
        nativeSessionId,
        presentationRevision: 1,
      } as DesktopInteractionEvent);
    });
    await flushLifecycle();

    expect(setPresentation.mock.calls.map(([request]) => request.input.state)).toEqual([
      "starting",
      "ready",
    ]);
    expect(setPresentation.mock.calls[1]![0].input).toEqual(
      expect.objectContaining({
        resourceRevision: 2,
        presentationRevision: 1,
      }),
    );
  });

  it("releases an accepted starting lease when ready is rejected", async () => {
    setPresentation
      .mockResolvedValueOnce(AsyncResult.success({ sequence: 1 }))
      .mockResolvedValueOnce(
        AsyncResult.failure(Cause.fail(new Error("ready transition rejected"))),
      )
      .mockResolvedValueOnce(AsyncResult.success({ sequence: 2 }));
    const resource = availableResource();
    act(() => {
      renderer = create(mountedSurface([resource]));
    });
    await flushLifecycle();
    const nativeSessionId = vi.mocked(bridge.start).mock.calls[0]![0].nativeSessionId;

    act(() => {
      nativeListener?.({
        kind: "Ready",
        nativeSessionId,
        presentationRevision: 1,
      } as DesktopInteractionEvent);
    });
    await flushLifecycle();

    expect(setPresentation.mock.calls.map(([request]) => request.input.state)).toEqual([
      "starting",
      "ready",
      "stopped",
    ]);
    expect(setPresentation.mock.calls.map(([request]) => request.input.resourceRevision)).toEqual([
      1, 2, 2,
    ]);
    expect(bridge.stop).toHaveBeenCalledExactlyOnceWith({
      nativeSessionId,
      reason: "protocol-fault",
    });
  });

  it("does not launch when the server rejects the initial presentation claim", async () => {
    setPresentation.mockResolvedValueOnce(
      AsyncResult.failure(Cause.fail(new Error("presentation lease rejected"))),
    );
    act(() => {
      renderer = create(mountedSurface([availableResource()]));
    });
    await flushLifecycle();

    expect(setPresentation).toHaveBeenCalledTimes(1);
    expect(bridge.start).not.toHaveBeenCalled();
    expect(bridge.stop).not.toHaveBeenCalled();
  });

  it("does not attempt to take over an existing presentation lease", async () => {
    act(() => {
      renderer = create(mountedSurface([engagedResource()]));
    });
    await flushLifecycle();

    expect(setPresentation).not.toHaveBeenCalled();
    expect(bridge.start).not.toHaveBeenCalled();
  });

  it("does not let StrictMode replay retire the owned native session", async () => {
    const resource = availableResource();
    act(() => {
      renderer = create(mountedSurface([resource]));
    });
    await flushLifecycle();

    expect(bridge.start).toHaveBeenCalledTimes(1);
    expect(bridge.stop).not.toHaveBeenCalled();
    expect(setPresentation.mock.calls.map(([request]) => request.input.state)).toEqual([
      "starting",
    ]);
  });

  it("retires and reclaims the projection-shaped stopped resource across remount", async () => {
    const resource = availableResource();
    act(() => {
      renderer = create(mountedSurface([resource]));
    });
    await flushLifecycle();
    const firstSessionId = vi.mocked(bridge.start).mock.calls[0]![0].nativeSessionId;

    await act(async () => renderer!.unmount());
    renderer = null;
    await flushLifecycle();

    expect(bridge.stop).toHaveBeenCalledExactlyOnceWith({
      nativeSessionId: firstSessionId,
      reason: "navigation",
    });
    expect(setPresentation.mock.calls.map(([request]) => request.input.state)).toEqual([
      "starting",
      "stopped",
    ]);

    const stoppedResource = availableResource({
      revision: 3,
      presentation: {
        state: "stopped",
        ownerClientId: null,
        presentationRevision: 1,
        lastFrameSequence: null,
        droppedFrames: 0,
      },
    });
    act(() => {
      renderer = create(mountedSurface([stoppedResource]));
    });
    await flushLifecycle();

    expect(bridge.start).toHaveBeenCalledTimes(2);
    expect(vi.mocked(bridge.start).mock.calls[1]![0].nativeSessionId).not.toBe(firstSessionId);
    expect(vi.mocked(bridge.start).mock.calls[1]![0].resourceRevision).toBe(3);
    expect(setPresentation.mock.calls[2]![0].input).toEqual(
      expect.objectContaining({
        resourceRevision: 3,
        presentationRevision: 1,
        state: "starting",
      }),
    );
    expect(bridge.stop).toHaveBeenCalledTimes(1);
  });

  it("recovers a delayed claim across a fast unmount and remount", async () => {
    let resolveClaim!: (result: ReturnType<typeof AsyncResult.success>) => void;
    setPresentation.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveClaim = resolve;
        }),
    );
    const resource = availableResource();
    act(() => {
      renderer = create(mountedSurface([resource]));
    });
    await act(async () => renderer!.unmount());
    renderer = null;
    setPresentation.mockResolvedValueOnce(
      AsyncResult.failure(Cause.fail(new Error("stale unavailable projection"))),
    );
    act(() => {
      renderer = create(mountedSurface([resource]));
    });
    await flushLifecycle();
    resolveClaim(AsyncResult.success({ sequence: 1 }));
    await flushLifecycle();

    expect(bridge.start).not.toHaveBeenCalled();
    expect(setPresentation.mock.calls.map(([request]) => request.input.state)).toEqual([
      "starting",
      "starting",
      "stopped",
    ]);

    const stoppedResource = availableResource({
      revision: 3,
      presentation: {
        state: "stopped",
        ownerClientId: null,
        presentationRevision: 1,
        lastFrameSequence: null,
        droppedFrames: 0,
      },
    });
    act(() => renderer!.update(mountedSurface([stoppedResource])));
    await flushLifecycle();

    expect(bridge.start).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bridge.start).mock.calls[0]![0].resourceRevision).toBe(3);
    expect(setPresentation.mock.calls[3]![0].input).toEqual(
      expect.objectContaining({
        resourceRevision: 3,
        presentationRevision: 1,
        state: "starting",
      }),
    );
  });
});
