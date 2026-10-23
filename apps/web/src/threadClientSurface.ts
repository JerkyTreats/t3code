export function resolveThreadClientSurface(): boolean {
  if (typeof window === "undefined") return false;
  if (window.t3ThreadBridge) return true;
  const requested = new URL(window.location.href).searchParams.get("t3-thread-client") === "1";
  try {
    if (requested) window.sessionStorage.setItem("t3code:thread-client-surface", "1");
    return requested || window.sessionStorage.getItem("t3code:thread-client-surface") === "1";
  } catch {
    return requested;
  }
}

/** Presentation selection never grants protected transport or enrollment authority. */
export function resolveThreadClientHostPolicy() {
  return {
    compact: resolveThreadClientSurface(),
    ownsLaunchNavigation: typeof window !== "undefined" && window.t3ThreadBridge !== undefined,
  };
}
