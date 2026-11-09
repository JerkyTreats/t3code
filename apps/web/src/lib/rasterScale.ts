/**
 * An element's on-screen scale can change without a resize, as when a canvas card lays out at a
 * new zoom. Canvases that size their backing store by device pixels listen here and refit.
 */
const RASTER_SCALE_EVENT = "t3:raster-scale";

export function announceRasterScaleChange() {
  window.dispatchEvent(new Event(RASTER_SCALE_EVENT));
}

export function onRasterScaleChange(listener: () => void) {
  window.addEventListener(RASTER_SCALE_EVENT, listener);
  return () => window.removeEventListener(RASTER_SCALE_EVENT, listener);
}

/** The CSS zoom an element renders at, from its own and its ancestors' `zoom`. */
export function cssZoomOf(element: Element) {
  const zoom = (element as Element & { readonly currentCSSZoom?: number }).currentCSSZoom;
  return typeof zoom === "number" && zoom > 0 ? zoom : 1;
}
