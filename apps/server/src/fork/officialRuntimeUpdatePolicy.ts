/** Official server runtimes update through the desktop artifact or operator deployment. */
export function officialRuntimeUpdateCapability(input: {
  readonly desktopManaged: boolean;
}): "desktop-managed" | null {
  return input.desktopManaged ? "desktop-managed" : null;
}

/** Translate deployment ownership into update admission before any adapter runs. */
export function officialRuntimeUpdateAdmission(input: {
  readonly desktopManaged: boolean;
  readonly desktopAdapterAvailable: boolean;
}):
  | { readonly kind: "desktop" }
  | {
      readonly kind: "unavailable";
      readonly updateReason: string;
      readonly commitReason: string;
    } {
  const capability = officialRuntimeUpdateCapability(input);
  if (capability === "desktop-managed" && input.desktopAdapterAvailable) {
    return { kind: "desktop" };
  }
  return {
    kind: "unavailable",
    updateReason:
      capability === "desktop-managed"
        ? "Update the T3 Code desktop app on the server machine."
        : "This server is updated through its operator-managed deployment.",
    commitReason: "Desktop updates are unavailable for this server.",
  };
}
