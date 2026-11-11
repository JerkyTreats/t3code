import { viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { type RefObject, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import ChatMarkdown from "../components/ChatMarkdown";
import { CANVAS_CARD_REMARK_PLUGINS } from "./canvasStateChips";
import { canvasPlacementStore } from "./canvasSurfaceCards";
import { NOTE_CARD_SIZE, placeSurfaceCard } from "./CanvasSurfaceCardView";
import { TURN_INSET_PX } from "./turnBoard";

const swallowClick = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * The card being placed on this board: a faded copy follows the pointer at the board's zoom, and a
 * click on the board or a card on it drops the card with its top-left at the pointer. Escape, or a
 * click anywhere else, cancels with nothing placed.
 */
export function CanvasPlacement({
  api,
  threadRef,
  boardRef,
  layer,
}: {
  api: ExcalidrawImperativeAPI;
  threadRef: ScopedThreadRef;
  boardRef: RefObject<HTMLDivElement | null>;
  layer: HTMLElement | null;
}) {
  const current = useSyncExternalStore(canvasPlacementStore.subscribe, canvasPlacementStore.get);
  const placement = current?.threadKey === scopedThreadKey(threadRef) ? current : null;
  const ghostRef = useRef<HTMLDivElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- follows the pointer and takes the next click or Escape on the window, ahead of Excalidraw's own handlers
  useEffect(() => {
    if (placement === null) return;
    const move = (event: PointerEvent) => {
      const ghost = ghostRef.current;
      if (!ghost) return;
      ghost.style.translate = `${event.clientX}px ${event.clientY}px`;
      ghost.style.scale = String(api.getAppState().zoom.value);
    };
    const down = (event: PointerEvent) => {
      canvasPlacementStore.end();
      const target = event.target instanceof Node ? event.target : null;
      const canvas = boardRef.current?.querySelector(".excalidraw__canvas.interactive");
      const onBoard = target !== null && (canvas?.contains(target) || layer?.contains(target));
      if (!onBoard || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      // The click that ends this press would act on whatever lies under the new card.
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      window.addEventListener(
        "pointerdown",
        () => window.removeEventListener("click", swallowClick, { capture: true }),
        { capture: true, once: true },
      );
      const point = viewportCoordsToSceneCoords(event, api.getAppState());
      placeSurfaceCard(api, placement.card, {
        at: { x: point.x - TURN_INSET_PX, y: point.y - TURN_INSET_PX },
      });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      canvasPlacementStore.end();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [api, boardRef, layer, placement]);

  if (placement === null) return null;
  return createPortal(
    <div
      ref={ghostRef}
      className="canvas-card bg-background text-foreground rounded-lg"
      data-canvas-card="markdown"
      data-canvas-placement
      style={{
        position: "fixed",
        zIndex: 50,
        width: NOTE_CARD_SIZE.width,
        translate: `${placement.at.x}px ${placement.at.y}px`,
        scale: String(api.getAppState().zoom.value),
        transformOrigin: "0 0",
        opacity: 0.6,
        pointerEvents: "none",
      }}
    >
      <ChatMarkdown
        text={placement.card.text}
        lineBreaks
        extraRemarkPlugins={CANVAS_CARD_REMARK_PLUGINS}
        cwd={undefined}
        environmentId={threadRef.environmentId}
        threadRef={threadRef}
      />
    </div>,
    document.body,
  );
}
