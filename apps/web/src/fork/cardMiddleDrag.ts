const MIDDLE_BUTTON = 1;
const PASTE_GUARD_MS = 100;

/**
 * A middle-button press on a card pans the canvas under it, as it would on the canvas itself.
 * On Linux the middle button also pastes the primary selection on release, and Excalidraw
 * guards that only for drags that started on its canvas, so a press on a card swallows the
 * paste that follows it: the words the reader just selected in a card are not a note.
 */
export function forwardCardMiddleDrag(layer: HTMLElement, canvasOf: () => Element | null) {
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== MIDDLE_BUTTON) return;
    event.preventDefault();
    const swallow = (paste: Event) => {
      paste.preventDefault();
      paste.stopImmediatePropagation();
    };
    document.addEventListener("paste", swallow, { capture: true });
    const release = () => {
      window.removeEventListener("pointerup", release);
      setTimeout(
        () => document.removeEventListener("paste", swallow, { capture: true }),
        PASTE_GUARD_MS,
      );
    };
    window.addEventListener("pointerup", release);
    canvasOf()?.dispatchEvent(new PointerEvent("pointerdown", event));
  };
  layer.addEventListener("pointerdown", onPointerDown);
  return () => layer.removeEventListener("pointerdown", onPointerDown);
}
