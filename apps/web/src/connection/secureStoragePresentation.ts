import { ConnectionPersistenceError } from "@t3tools/client-runtime/platform";
import * as Schema from "effect/Schema";

export const DESKTOP_SECURE_STORAGE_REMEDIATION =
  "Desktop secure storage is unavailable. Install gnome-keyring and libsecret, start or unlock the login keyring for this desktop session, then restart T3 Code.";

const isConnectionPersistenceError = Schema.is(ConnectionPersistenceError);

export function connectionRegistrationErrorMessage(
  error: unknown,
  fallback = "Failed to add backend.",
): string {
  if (isConnectionPersistenceError(error) && error.reason === "secure-storage-unavailable") {
    return DESKTOP_SECURE_STORAGE_REMEDIATION;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}
