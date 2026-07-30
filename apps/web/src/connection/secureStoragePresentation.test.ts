import { ConnectionPersistenceError } from "@t3tools/client-runtime/platform";
import { describe, expect, it } from "vite-plus/test";

import {
  connectionRegistrationErrorMessage,
  DESKTOP_SECURE_STORAGE_REMEDIATION,
} from "./secureStoragePresentation";

describe("connectionRegistrationErrorMessage", () => {
  it("explains how to restore Linux Secret Service support", () => {
    const error = new ConnectionPersistenceError({
      operation: "register-connection",
      reason: "secure-storage-unavailable",
      message: "Could not register connection.",
    });

    expect(connectionRegistrationErrorMessage(error)).toBe(DESKTOP_SECURE_STORAGE_REMEDIATION);
    expect(DESKTOP_SECURE_STORAGE_REMEDIATION).toContain("gnome-keyring");
    expect(DESKTOP_SECURE_STORAGE_REMEDIATION).toContain("libsecret");
    expect(DESKTOP_SECURE_STORAGE_REMEDIATION).toContain("restart T3 Code");
  });

  it("preserves unrelated connection failures", () => {
    expect(connectionRegistrationErrorMessage(new Error("Pairing token expired."))).toBe(
      "Pairing token expired.",
    );
  });
});
