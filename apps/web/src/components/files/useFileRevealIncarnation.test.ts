import type { FileRevealIncarnation } from "./fileLineReveal";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

type EffectSetup = () => void | (() => void);

const hookRuntime = vi.hoisted(() => ({
  activeInsertionCleanup: null as (() => void) | null,
  activeLayoutCleanup: null as (() => void) | null,
  pendingInsertionSetup: null as EffectSetup | null,
  pendingLayoutSetup: null as EffectSetup | null,
  ref: null as { current: unknown } | null,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useMemo: <T>(factory: () => T) => factory(),
    useRef: <T>(initialValue: T) => {
      hookRuntime.ref ??= { current: initialValue };
      return hookRuntime.ref as { current: T };
    },
    useInsertionEffect: (setup: EffectSetup) => {
      hookRuntime.pendingInsertionSetup = setup;
    },
    useLayoutEffect: (setup: EffectSetup) => {
      hookRuntime.pendingLayoutSetup = setup;
    },
  };
});

import { ownsFileRevealIncarnation } from "./fileLineReveal";
import { useFileRevealIncarnation } from "./useFileRevealIncarnation";

beforeEach(() => {
  hookRuntime.activeInsertionCleanup = null;
  hookRuntime.activeLayoutCleanup = null;
  hookRuntime.pendingInsertionSetup = null;
  hookRuntime.pendingLayoutSetup = null;
  hookRuntime.ref = null;
});

function commitPendingEffects(): void {
  const insertionSetup = hookRuntime.pendingInsertionSetup;
  const layoutSetup = hookRuntime.pendingLayoutSetup;
  if (!insertionSetup || !layoutSetup) {
    throw new Error("Expected reveal ownership commit effects");
  }
  hookRuntime.pendingInsertionSetup = null;
  hookRuntime.pendingLayoutSetup = null;

  hookRuntime.activeInsertionCleanup?.();
  hookRuntime.activeInsertionCleanup = insertionSetup() ?? null;

  hookRuntime.activeLayoutCleanup?.();
  const replayCleanup = layoutSetup();
  replayCleanup?.();
  hookRuntime.activeLayoutCleanup = layoutSetup() ?? null;
}

function abandonPendingEffects(): void {
  hookRuntime.pendingInsertionSetup = null;
  hookRuntime.pendingLayoutSetup = null;
}

function runRevealCallback(
  current: FileRevealIncarnation | null,
  candidate: FileRevealIncarnation,
  sideEffect: () => void,
): void {
  if (!ownsFileRevealIncarnation(current, candidate)) return;
  sideEffect();
}

describe("useFileRevealIncarnation", () => {
  it("restores ownership after Strict Mode layout-effect replay", () => {
    const sideEffect = vi.fn();
    const ownership = useFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 8,
    });
    commitPendingEffects();

    runRevealCallback(ownership.currentIncarnationRef.current, ownership.incarnation, sideEffect);

    expect(ownership.currentIncarnationRef.current).toBe(ownership.incarnation);
    expect(sideEffect).toHaveBeenCalledExactlyOnceWith();
  });

  it("does not let an abandoned render steal callback or frame ownership", () => {
    const currentCallback = vi.fn();
    const currentFrame = vi.fn();
    const abandonedCallback = vi.fn();
    const committedOwnership = useFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 8,
    });
    commitPendingEffects();

    const abandonedOwnership = useFileRevealIncarnation({
      ownerKey: "local:thread-two",
      relativePath: "README.md",
      revealRequestId: 1,
    });
    abandonPendingEffects();

    runRevealCallback(
      committedOwnership.currentIncarnationRef.current,
      committedOwnership.incarnation,
      currentCallback,
    );
    runRevealCallback(
      committedOwnership.currentIncarnationRef.current,
      committedOwnership.incarnation,
      currentFrame,
    );
    runRevealCallback(
      abandonedOwnership.currentIncarnationRef.current,
      abandonedOwnership.incarnation,
      abandonedCallback,
    );

    expect(committedOwnership.currentIncarnationRef.current).toBe(committedOwnership.incarnation);
    expect(currentCallback).toHaveBeenCalledExactlyOnceWith();
    expect(currentFrame).toHaveBeenCalledExactlyOnceWith();
    expect(abandonedCallback).not.toHaveBeenCalled();
  });

  it("publishes committed transitions while keeping stale incarnations inert", () => {
    const oldSideEffect = vi.fn();
    const currentSideEffect = vi.fn();
    const oldOwnership = useFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 8,
    });
    commitPendingEffects();
    const currentOwnership = useFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 1,
    });
    commitPendingEffects();

    runRevealCallback(
      currentOwnership.currentIncarnationRef.current,
      oldOwnership.incarnation,
      oldSideEffect,
    );
    runRevealCallback(
      currentOwnership.currentIncarnationRef.current,
      currentOwnership.incarnation,
      currentSideEffect,
    );

    expect(oldSideEffect).not.toHaveBeenCalled();
    expect(currentOwnership.currentIncarnationRef.current).toBe(currentOwnership.incarnation);
    expect(currentSideEffect).toHaveBeenCalledExactlyOnceWith();
  });
});
