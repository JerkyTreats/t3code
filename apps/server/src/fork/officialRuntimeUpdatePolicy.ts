/** Official server runtimes update through the desktop artifact or operator deployment. */
export function officialRuntimeUpdateCapability(input: {
  readonly desktopManaged: boolean;
}): "desktop-managed" | null {
  return input.desktopManaged ? "desktop-managed" : null;
}
