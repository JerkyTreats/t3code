import type { FileRevealIncarnation } from "./fileLineReveal";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const hookRuntime = vi.hoisted(() => ({
  activeCleanup: null as (() => void) | null,
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
    useLayoutEffect: (setup: () => void | (() => void)) => {
      hookRuntime.activeCleanup?.();
      const replayCleanup = setup();
      replayCleanup?.();
      hookRuntime.activeCleanup = setup() ?? null;
    },
  };
});

import { ownsFileRevealIncarnation } from "./fileLineReveal";
import { useFileRevealIncarnation } from "./useFileRevealIncarnation";

beforeEach(() => {
  hookRuntime.activeCleanup = null;
  hookRuntime.ref = null;
});

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

    runRevealCallback(ownership.currentIncarnationRef.current, ownership.incarnation, sideEffect);

    expect(ownership.currentIncarnationRef.current).toBe(ownership.incarnation);
    expect(sideEffect).toHaveBeenCalledExactlyOnceWith();
  });

  it("keeps stale incarnations inert after replaying a new request lifetime", () => {
    const oldSideEffect = vi.fn();
    const currentSideEffect = vi.fn();
    const oldOwnership = useFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 8,
    });
    const currentOwnership = useFileRevealIncarnation({
      ownerKey: "local:thread-one",
      relativePath: "src/index.ts",
      revealRequestId: 1,
    });

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
