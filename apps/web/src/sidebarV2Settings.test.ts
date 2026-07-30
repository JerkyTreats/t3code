import { describe, expect, it } from "vite-plus/test";

import {
  parseSidebarAutoSettleDaysDraft,
  resolveAppSidebarVersion,
  resolveSidebarV2Enabled,
} from "./sidebarV2Settings";

describe("resolveSidebarV2Enabled", () => {
  it("holds V1 until client settings hydrate", () => {
    expect(
      resolveSidebarV2Enabled({
        preference: {
          enabled: true,
          configuredByUser: true,
        },
        settingsHydrated: false,
      }),
    ).toBe(false);
  });

  it("defaults to V1 when the user has not opted in", () => {
    expect(
      resolveSidebarV2Enabled({
        preference: {
          enabled: false,
          configuredByUser: false,
        },
        settingsHydrated: true,
      }),
    ).toBe(false);
  });

  it.each([
    [true, true],
    [false, false],
  ] as const)("honors an explicit hydrated choice of %s", (enabled, expected) => {
    expect(
      resolveSidebarV2Enabled({
        preference: {
          enabled,
          configuredByUser: true,
        },
        settingsHydrated: true,
      }),
    ).toBe(expected);
  });

  it("preserves a legacy stored opt-in without an explicit-choice bit", () => {
    expect(
      resolveSidebarV2Enabled({
        preference: {
          enabled: true,
          configuredByUser: false,
        },
        settingsHydrated: true,
      }),
    ).toBe(true);
  });
});

describe("resolveAppSidebarVersion", () => {
  it.each(["/settings", "/settings/", "/settings/general", "/settings/beta"])(
    "keeps the V1 settings shell on %s",
    (pathname) => {
      expect(resolveAppSidebarVersion({ pathname, sidebarV2Enabled: true })).toBe("v1");
    },
  );

  it("mounts V2 on product routes after opt-in", () => {
    expect(resolveAppSidebarVersion({ pathname: "/env/thread", sidebarV2Enabled: true })).toBe(
      "v2",
    );
  });

  it("keeps V1 on product routes without opt-in", () => {
    expect(resolveAppSidebarVersion({ pathname: "/", sidebarV2Enabled: false })).toBe("v1");
  });

  it("does not classify a settings-like product path as Settings", () => {
    expect(
      resolveAppSidebarVersion({ pathname: "/settings-preview", sidebarV2Enabled: true }),
    ).toBe("v2");
  });
});

describe("parseSidebarAutoSettleDaysDraft", () => {
  it.each([
    ["1", 1],
    ["3", 3],
    ["90", 90],
  ] as const)("accepts the bounded whole-day value %s", (draft, expected) => {
    expect(parseSidebarAutoSettleDaysDraft(draft)).toBe(expected);
  });

  it.each(["", " ", "0", "91", "3.5", "not-a-number"])("rejects the invalid draft %j", (draft) => {
    expect(parseSidebarAutoSettleDaysDraft(draft)).toBeNull();
  });
});
