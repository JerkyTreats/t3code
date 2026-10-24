import { describe, expect, it } from "vite-plus/test";

import {
  isNightlyDesktopVersion,
  resolveDefaultDesktopUpdateChannel,
} from "../updates/updateChannels.ts";

// F01.D5 appends the exact release commit as `-<10hex>`; channel detection must survive it.
describe("fork release version update channels", () => {
  it("keeps the channel of a commit-suffixed release version", () => {
    expect(resolveDefaultDesktopUpdateChannel("0.0.45-abcdef0123")).toBe("latest");
    expect(isNightlyDesktopVersion("0.0.45-abcdef0123")).toBe(false);
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7-abcdef0123")).toBe(
      "nightly",
    );
    expect(isNightlyDesktopVersion("0.0.41-preview.20260911.7-abcdef0123")).toBe(true);
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-preview.20260911.7-abcdef0123")).toBe(
      "latest",
    );
  });

  it("rejects suffixes that are not exactly ten lowercase hex characters", () => {
    expect(resolveDefaultDesktopUpdateChannel("0.0.41-nightly.20260911.7-ABCDEF0123")).toBe(
      "latest",
    );
    expect(isNightlyDesktopVersion("0.0.41-nightly.20260911.7-abcdef012")).toBe(false);
  });
});
