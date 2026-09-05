import { describe, expect, it } from "vite-plus/test";

import { isDesktopUpdateReconnect } from "./runtimeUpdateGuidance";

describe("desktop update reconnect guidance", () => {
  const reconnect = {
    capability: "desktop-managed",
    updateStatus: "idle",
    reconnecting: true,
    versionMismatch: true,
  } as const;

  it("infers a lost desktop update while reconnecting across a version mismatch", () => {
    expect(isDesktopUpdateReconnect(reconnect)).toBe(true);
  });

  it.each([undefined, null, "boot-service", "respawn"] as const)(
    "preserves deployment guidance for capability %s",
    (capability) => {
      expect(isDesktopUpdateReconnect({ ...reconnect, capability })).toBe(false);
    },
  );

  it.each(["running", "failed"] as const)(
    "leaves actual %s update state to its existing progress or failure presentation",
    (updateStatus) => {
      expect(isDesktopUpdateReconnect({ ...reconnect, updateStatus })).toBe(false);
    },
  );

  it("does not infer progress without both reconnect and version mismatch", () => {
    expect(isDesktopUpdateReconnect({ ...reconnect, reconnecting: false })).toBe(false);
    expect(isDesktopUpdateReconnect({ ...reconnect, versionMismatch: false })).toBe(false);
  });
});
