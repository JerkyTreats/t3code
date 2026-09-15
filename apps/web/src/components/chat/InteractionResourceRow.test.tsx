import { ThreadId, TurnId, type InteractionResource } from "@t3tools/contracts";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { InteractionResourceRow } from "./InteractionResourceRow";

function resourceFixture(overrides: Partial<InteractionResource> = {}): InteractionResource {
  return {
    id: "interaction-1" as InteractionResource["id"],
    threadId: ThreadId.make("thread-1"),
    revision: 0,
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
    display: { title: "Guide the field", summary: "Move the pointer through the target." },
    lifecycle: { state: "open" },
    presentation: {
      state: "unavailable",
      presentationRevision: 0,
      lastFrameSequence: null,
      droppedFrames: 0,
    },
    engagement: { state: "disengaged", latestEpoch: 0 },
    evidence: null,
    resolution: null,
    continuation: { state: "none" },
    createdAt: "2026-01-01T00:00:02.000Z",
    updatedAt: "2026-01-01T00:00:02.000Z",
    ...overrides,
  };
}

const noOp = () => {};
const flushRenderer = async (action: () => void) => {
  action();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

describe("InteractionResourceRow", () => {
  it("shows truthful web unavailability while keeping cancellation operable", () => {
    const markup = renderToStaticMarkup(
      <InteractionResourceRow
        resource={resourceFixture()}
        hostAvailable={false}
        onEngage={noOp}
        onDisengage={noOp}
        onCancel={noOp}
      />,
    );

    expect(markup).toContain("This native interaction is unavailable in the web client.");
    expect(markup).toContain("Synthetic input");
    expect(markup).toContain("Cancel interaction");
    expect(markup).toContain('data-thread-id="thread-1"');
    expect(markup).toContain('data-interaction-id="interaction-1"');
    expect(markup).toContain('data-engagement-state="disengaged"');
    expect(markup).toContain('data-testid="interaction-resource-interaction-1"');
    expect(markup).toContain('data-testid="interaction-provenance-interaction-1"');
    expect(markup).toContain('data-testid="interaction-cancel-interaction-1"');
    expect(markup).not.toContain('data-testid="interaction-canvas-interaction-1"');
    expect(markup).not.toContain(">Engage<");
    expect(markup).not.toContain("Leaving this interaction ends its native session.");
    expect(markup).not.toContain("autofocus");
  });

  it("uses native buttons to request engagement and explicit disengagement", async () => {
    const onEngage = vi.fn();
    const onDisengage = vi.fn();
    const resource = resourceFixture({
      presentation: {
        state: "ready",
        presentationRevision: 1,
        lastFrameSequence: "8",
        droppedFrames: 0,
      },
    });
    let renderer: ReactTestRenderer | undefined;
    await flushRenderer(() => {
      renderer = create(
        <InteractionResourceRow
          resource={resource}
          hostAvailable
          onEngage={onEngage}
          onDisengage={onDisengage}
          onCancel={noOp}
        />,
      );
    });

    const engage = renderer!.root
      .findAllByType("button")
      .find((button) => button.props["data-testid"] === "interaction-engage-interaction-1");
    expect(engage).toBeDefined();
    expect(renderer!.toJSON()).toEqual(
      expect.objectContaining({
        children: expect.arrayContaining([
          expect.objectContaining({
            children: [
              "Leaving this interaction ends its native session. To retry, start a new request.",
            ],
          }),
        ]),
      }),
    );
    expect(
      renderer!.root.findByProps({ "data-testid": "interaction-canvas-interaction-1" }).type,
    ).toBe("canvas");
    expect(engage!.props.type).toBe("button");
    engage!.props.onClick();
    expect(onEngage).toHaveBeenCalledWith(resource);

    const engaged = resourceFixture({
      revision: 1,
      presentation: resource.presentation,
      engagement: {
        state: "engaged",
        epoch: 1,
        ownerClientId: "client-1",
        presentationRevision: 1,
      },
    });
    await flushRenderer(() => {
      renderer!.update(
        <InteractionResourceRow
          resource={engaged}
          hostAvailable
          engagementOwned
          onEngage={onEngage}
          onDisengage={onDisengage}
          onCancel={noOp}
        />,
      );
    });
    const disengage = renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Disengage"));
    expect(disengage).toBeDefined();
    disengage!.props.onClick();
    expect(onDisengage).toHaveBeenCalledWith(engaged);
  });

  it("disengages on Escape and when focus leaves the row", async () => {
    const onDisengage = vi.fn();
    const resource = resourceFixture({
      presentation: {
        state: "ready",
        presentationRevision: 1,
        lastFrameSequence: "8",
        droppedFrames: 0,
      },
      engagement: {
        state: "engaged",
        epoch: 2,
        ownerClientId: "client-1",
        presentationRevision: 1,
      },
    });
    let renderer: ReactTestRenderer | undefined;
    await flushRenderer(() => {
      renderer = create(
        <InteractionResourceRow
          resource={resource}
          hostAvailable
          engagementOwned
          onEngage={noOp}
          onDisengage={onDisengage}
          onCancel={noOp}
        />,
      );
    });
    const section = renderer!.root.findByType("section");
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    section.props.onKeyDownCapture({ key: "Escape", preventDefault, stopPropagation });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onDisengage).toHaveBeenCalledWith(resource);

    const nextEpoch = resourceFixture({
      revision: 2,
      presentation: resource.presentation,
      engagement: {
        state: "engaged",
        epoch: 3,
        ownerClientId: "client-1",
        presentationRevision: 1,
      },
    });
    await flushRenderer(() => {
      renderer!.update(
        <InteractionResourceRow
          resource={nextEpoch}
          hostAvailable
          engagementOwned
          onEngage={noOp}
          onDisengage={onDisengage}
          onCancel={noOp}
        />,
      );
    });
    const updatedSection = renderer!.root.findByType("section");
    const inside = renderer!.root.findByType("canvas");
    expect(inside.props.tabIndex).toBe(0);
    const canvasFocus = vi.fn();
    inside.props.onPointerDown({
      clientX: 1,
      clientY: 1,
      currentTarget: {
        focus: canvasFocus,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
      },
      nativeEvent: { isTrusted: true },
      preventDefault: vi.fn(),
    });
    expect(canvasFocus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    updatedSection.props.onBlurCapture({
      currentTarget: { contains: (target: unknown) => target === inside },
      relatedTarget: inside,
    });
    expect(onDisengage).toHaveBeenCalledTimes(1);

    updatedSection.props.onBlurCapture({
      currentTarget: { contains: () => false },
      relatedTarget: {},
    });
    expect(onDisengage).toHaveBeenCalledTimes(2);
    expect(onDisengage).toHaveBeenLastCalledWith(nextEpoch);
  });

  it("normalizes trusted pointer samples only while the local lease is owned", async () => {
    const onPointerInput = vi.fn();
    const resource = resourceFixture({
      presentation: {
        state: "ready",
        presentationRevision: 1,
        lastFrameSequence: "8",
        droppedFrames: 0,
      },
      engagement: {
        state: "engaged",
        epoch: 4,
        ownerClientId: "client-1",
        presentationRevision: 1,
      },
    });
    let renderer: ReactTestRenderer | undefined;
    await flushRenderer(() => {
      renderer = create(
        <InteractionResourceRow
          resource={resource}
          hostAvailable
          engagementOwned
          hasFrame
          onEngage={noOp}
          onDisengage={noOp}
          onCancel={noOp}
          onPointerInput={onPointerInput}
        />,
      );
    });
    const canvas = renderer!.root.findByType("canvas");
    const preventDefault = vi.fn();
    const focus = vi.fn();
    canvas.props.onPointerDown({
      clientX: 75,
      clientY: 225,
      currentTarget: {
        focus,
        getBoundingClientRect: () => ({ left: 25, top: 25, width: 200, height: 100 }),
      },
      nativeEvent: { isTrusted: true },
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(onPointerInput).toHaveBeenCalledWith(resource, {
      phase: "press",
      normalizedX: 0.25,
      normalizedY: 1,
      isTrusted: true,
    });

    await flushRenderer(() => {
      renderer!.update(
        <InteractionResourceRow
          resource={resource}
          hostAvailable
          engagementOwned={false}
          hasFrame
          onEngage={noOp}
          onDisengage={noOp}
          onCancel={noOp}
          onPointerInput={onPointerInput}
        />,
      );
    });
    renderer!.root.findByType("canvas").props.onPointerMove({});
    expect(onPointerInput).toHaveBeenCalledOnce();
  });

  it("disengages and immediately fences pointer input when the canvas leaves the viewport", async () => {
    const onDisengage = vi.fn();
    const onPointerInput = vi.fn();
    const observe = vi.fn();
    const disconnect = vi.fn();
    let intersectionCallback: IntersectionObserverCallback | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    class TestIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
        intersectionObserver = this as unknown as IntersectionObserver;
      }
      disconnect = disconnect;
      observe = observe;
      takeRecords = () => [];
      unobserve = vi.fn();
    }
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    const canvasElement = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 640,
        bottom: 360,
        width: 640,
        height: 360,
      }),
    } as unknown as HTMLCanvasElement;
    const resource = resourceFixture({
      presentation: {
        state: "ready",
        presentationRevision: 1,
        lastFrameSequence: "8",
        droppedFrames: 0,
      },
      engagement: {
        state: "engaged",
        epoch: 5,
        ownerClientId: "client-1",
        presentationRevision: 1,
      },
    });
    let renderer: ReactTestRenderer | undefined;
    try {
      await flushRenderer(() => {
        renderer = create(
          <InteractionResourceRow
            resource={resource}
            hostAvailable
            engagementOwned
            hasFrame
            onEngage={noOp}
            onDisengage={onDisengage}
            onCancel={noOp}
            onPointerInput={onPointerInput}
          />,
          {
            createNodeMock: (element) => (element.type === "canvas" ? canvasElement : null),
          },
        );
      });
      expect(observe).toHaveBeenCalledWith(canvasElement);
      const canvas = renderer!.root.findByType("canvas");
      intersectionCallback?.(
        [
          {
            target: canvasElement,
            isIntersecting: false,
            intersectionRatio: 0,
          } as unknown as IntersectionObserverEntry,
        ],
        intersectionObserver!,
      );
      canvas.props.onPointerMove({
        clientX: 10,
        clientY: 10,
        currentTarget: canvasElement,
        nativeEvent: { isTrusted: true },
        preventDefault: vi.fn(),
      });
      intersectionCallback?.(
        [
          {
            target: canvasElement,
            isIntersecting: false,
            intersectionRatio: 0,
          } as unknown as IntersectionObserverEntry,
        ],
        intersectionObserver!,
      );

      expect(onDisengage).toHaveBeenCalledOnce();
      expect(onDisengage).toHaveBeenCalledWith(resource);
      expect(onPointerInput).not.toHaveBeenCalled();
    } finally {
      await flushRenderer(() => renderer?.unmount());
      vi.unstubAllGlobals();
    }
    expect(disconnect).toHaveBeenCalled();
  });
});
