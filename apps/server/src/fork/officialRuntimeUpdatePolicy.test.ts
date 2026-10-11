import { describe, expect, it } from "@effect/vitest";
import {
  officialRuntimeUpdateAdmission,
  officialRuntimeUpdateCapability,
} from "./officialRuntimeUpdatePolicy.ts";

describe("official runtime update admission without the historical update host", () => {
  it.each([false, true])(
    "refuses headless updates with desktop adapter available: %s",
    (available) => {
      const calls: string[] = [];
      const admission = officialRuntimeUpdateAdmission({
        desktopManaged: false,
        desktopAdapterAvailable: available,
      });
      const replacementHost = (operation: "update" | "commit") => {
        if (admission.kind === "desktop") {
          calls.push(operation);
          throw new Error("headless host reached an injected desktop adapter");
        }
        return operation === "update" ? admission.updateReason : admission.commitReason;
      };

      expect(officialRuntimeUpdateCapability({ desktopManaged: false })).toBeNull();
      expect(replacementHost("update")).toBe(
        "This server is updated through its operator-managed deployment.",
      );
      expect(replacementHost("commit")).toBe("Desktop updates are unavailable for this server.");
      expect(calls).toEqual([]);
    },
  );

  it("retains desktop guidance when its control adapter is absent", () => {
    expect(
      officialRuntimeUpdateAdmission({ desktopManaged: true, desktopAdapterAvailable: false }),
    ).toEqual({
      kind: "unavailable",
      updateReason: "Update the T3 Code desktop app on the server machine.",
      commitReason: "Desktop updates are unavailable for this server.",
    });
  });

  it("admits both desktop operations through an available replacement control host", () => {
    const calls: string[] = [];
    const admission = officialRuntimeUpdateAdmission({
      desktopManaged: true,
      desktopAdapterAvailable: true,
    });
    const replacementHost = (operation: "update" | "commit") => {
      if (admission.kind === "desktop") calls.push(operation);
      else throw new Error("desktop control host was refused");
    };
    replacementHost("update");
    replacementHost("commit");
    expect(calls).toEqual(["update", "commit"]);
    expect(officialRuntimeUpdateCapability({ desktopManaged: true })).toBe("desktop-managed");
  });
});
