import { describe, expect, it } from "vite-plus/test";

import { SETTINGS_NAV_ITEMS } from "./SettingsSidebarNav";

describe("SETTINGS_NAV_ITEMS", () => {
  it("exposes Beta before the archive destination", () => {
    expect(SETTINGS_NAV_ITEMS.map(({ label, to }) => ({ label, to }))).toContainEqual({
      label: "Beta",
      to: "/settings/beta",
    });
    expect(SETTINGS_NAV_ITEMS.findIndex((item) => item.to === "/settings/beta")).toBeLessThan(
      SETTINGS_NAV_ITEMS.findIndex((item) => item.to === "/settings/archived"),
    );
  });
});
