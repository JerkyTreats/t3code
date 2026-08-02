import { useEffect, type RefObject } from "react";

const RESIZE_EPSILON_PX = 0.5;
const VIEWPORT_EDGE_EPSILON_PX = 1;
const LIVE_EDGE_EPSILON_PX = 2;

export function resolveMermaidScrollAdjustment(input: {
  readonly heightDelta: number;
  readonly previousBlockBottom: number;
  readonly viewportTop: number;
  readonly distanceFromEnd: number;
}): number {
  if (Math.abs(input.heightDelta) < RESIZE_EPSILON_PX) return 0;
  if (input.distanceFromEnd <= LIVE_EDGE_EPSILON_PX) return 0;
  if (input.previousBlockBottom > input.viewportTop + VIEWPORT_EDGE_EPSILON_PX) return 0;
  return input.heightDelta;
}

function findVerticalScrollContainer(element: HTMLElement): HTMLElement | null {
  let candidate = element.parentElement;
  while (candidate) {
    const overflowY = window.getComputedStyle(candidate).overflowY;
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return candidate;
    }
    candidate = candidate.parentElement;
  }
  return null;
}

export function usePreserveScrollOnMermaidResize(
  elementRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const element = elementRef.current;
    if (!enabled || !element || typeof ResizeObserver === "undefined") return;

    const scrollContainer = findVerticalScrollContainer(element);
    if (!scrollContainer) return;

    let previousHeight = element.getBoundingClientRect().height;
    const observer = new ResizeObserver(() => {
      const nextRect = element.getBoundingClientRect();
      const heightDelta = nextRect.height - previousHeight;
      const adjustment = resolveMermaidScrollAdjustment({
        heightDelta,
        previousBlockBottom: nextRect.bottom - heightDelta,
        viewportTop: scrollContainer.getBoundingClientRect().top,
        distanceFromEnd:
          scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight,
      });

      previousHeight = nextRect.height;
      if (adjustment !== 0) {
        scrollContainer.scrollTop += adjustment;
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [elementRef, enabled]);
}
