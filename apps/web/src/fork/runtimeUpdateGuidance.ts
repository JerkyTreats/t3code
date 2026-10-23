import type { ServerSelfUpdateCapability } from "@t3tools/contracts";
import type { ServerUpdateState } from "@t3tools/client-runtime/state/server";

/** Only the origin-bound desktop artifact owns an in-app runtime replacement. */
export function supportedRuntimeUpdateCapability(
  advertised: ServerSelfUpdateCapability | null | undefined,
): "desktop-managed" | null {
  return advertised === "desktop-managed" ? advertised : null;
}

export function manualRuntimeUpdateGuidance(targetVersion: string): string {
  return `Update this server to ${targetVersion} through its deployment manager.`;
}

/** Infer a lost update only for a runtime that can perform a desktop update. */
export function isDesktopUpdateReconnect(input: {
  capability: ServerSelfUpdateCapability | null | undefined;
  updateStatus: ServerUpdateState["status"];
  reconnecting: boolean;
  versionMismatch: boolean;
}): boolean {
  return (
    supportedRuntimeUpdateCapability(input.capability) === "desktop-managed" &&
    input.updateStatus === "idle" &&
    input.reconnecting &&
    input.versionMismatch
  );
}
