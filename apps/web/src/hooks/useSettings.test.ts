import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { type ClientSettingsPatch, DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { __resetLocalApiForTests } from "../localApi";
import {
  applyClientSettingsPatch,
  getClientSettings,
  mergeEnvironmentSettings,
  __setClientSettingsForTests,
} from "./useSettings";

afterEach(async () => {
  await __resetLocalApiForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubClientSettingsPersistence() {
  const setClientSettings = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("window", {
    nativeApi: {
      persistence: {
        getClientSettings: vi.fn().mockResolvedValue(null),
        setClientSettings,
      },
    },
  });
  return setClientSettings;
}

describe("mergeEnvironmentSettings", () => {
  it("combines the selected environment's server settings with client preferences", () => {
    const serverSettings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [ProviderInstanceId.make("codex_remote")]: {
          driver: ProviderDriverKind.make("codex"),
          enabled: true,
        },
      },
    };
    const clientSettings = {
      ...DEFAULT_CLIENT_SETTINGS,
      favorites: [
        {
          provider: ProviderInstanceId.make("codex_remote"),
          model: "gpt-5.4",
        },
      ],
    };

    const settings = mergeEnvironmentSettings(serverSettings, clientSettings);

    expect(settings.providerInstances).toBe(serverSettings.providerInstances);
    expect(settings.favorites).toBe(clientSettings.favorites);
  });
});

describe("applyClientSettingsPatch", () => {
  it.each([null, 1, 90] as const)(
    "publishes and persists the valid auto-settle value %s",
    (sidebarAutoSettleAfterDays) => {
      const setClientSettings = stubClientSettingsPersistence();

      expect(
        applyClientSettingsPatch({
          sidebarV2Enabled: true,
          sidebarV2ConfiguredByUser: true,
          sidebarAutoSettleAfterDays,
        }),
      ).toBe(true);

      expect(getClientSettings()).toMatchObject({
        sidebarV2Enabled: true,
        sidebarV2ConfiguredByUser: true,
        sidebarAutoSettleAfterDays,
      });
      expect(setClientSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          sidebarV2Enabled: true,
          sidebarV2ConfiguredByUser: true,
          sidebarAutoSettleAfterDays,
        }),
      );
    },
  );

  it.each([0, 91, 1.5])(
    "rejects the invalid auto-settle value %s before snapshot replacement and persistence",
    (sidebarAutoSettleAfterDays) => {
      const setClientSettings = stubClientSettingsPersistence();
      const initialSettings = {
        ...DEFAULT_CLIENT_SETTINGS,
        sidebarAutoSettleAfterDays: 7 as const,
      };
      __setClientSettingsForTests(initialSettings);
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      expect(
        applyClientSettingsPatch({
          sidebarAutoSettleAfterDays,
        } as unknown as ClientSettingsPatch),
      ).toBe(false);

      expect(getClientSettings()).toBe(initialSettings);
      expect(setClientSettings).not.toHaveBeenCalled();
    },
  );
});
