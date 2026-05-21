import { describe, expect, it } from "vitest";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import {
  buildLegacyClientSettingsMigrationPatch,
  normalizeHydratedClientSettings,
} from "./useSettings";

describe("buildLegacyClientSettingsMigrationPatch", () => {
  it("migrates archive confirmation from legacy local settings", () => {
    expect(
      buildLegacyClientSettingsMigrationPatch({
        autoOpenPlanSidebar: false,
        confirmThreadArchive: true,
        confirmThreadDelete: false,
      }),
    ).toEqual({
      autoOpenPlanSidebar: false,
      confirmThreadArchive: true,
      confirmThreadDelete: false,
    });
  });
});

describe("normalizeHydratedClientSettings", () => {
  it("fills defaults for legacy partial client settings", () => {
    expect(
      normalizeHydratedClientSettings({
        confirmThreadArchive: true,
      }),
    ).toEqual({
      ...DEFAULT_CLIENT_SETTINGS,
      confirmThreadArchive: true,
    });
  });
});
