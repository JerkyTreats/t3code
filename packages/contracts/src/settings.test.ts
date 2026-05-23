import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import {
  ClientSettingsSchema,
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_ENVIRONMENT_GROUPING,
  DEFAULT_SIDEBAR_PROJECT_GROUPING,
} from "./settings.ts";

describe("ClientSettingsSchema", () => {
  it("hydrates grouping defaults for legacy client settings", () => {
    const parsed = Schema.decodeUnknownSync(ClientSettingsSchema)({});

    expect(parsed.sidebarProjectGrouping).toBe(DEFAULT_SIDEBAR_PROJECT_GROUPING);
    expect(parsed.environmentGrouping).toBe(DEFAULT_ENVIRONMENT_GROUPING);
    expect(DEFAULT_CLIENT_SETTINGS.sidebarProjectGrouping).toBe("none");
    expect(DEFAULT_CLIENT_SETTINGS.environmentGrouping).toBe("none");
  });

  it("parses grouping settings", () => {
    const parsed = Schema.decodeUnknownSync(ClientSettingsSchema)({
      sidebarProjectGrouping: "directory",
      environmentGrouping: "provider",
    });

    expect(parsed.sidebarProjectGrouping).toBe("directory");
    expect(parsed.environmentGrouping).toBe("provider");
  });
});
