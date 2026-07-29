import { assert, describe, it } from "@effect/vitest";

import { desktopStartupCommandLineSwitches } from "./DesktopApp.ts";

describe("DesktopApp startup command-line switches", () => {
  it("selects libsecret explicitly for Linux app startup", () => {
    assert.deepEqual(desktopStartupCommandLineSwitches("linux", "dev.t3code.desktop"), [
      ["class", "dev.t3code.desktop"],
      ["password-store", "gnome-libsecret"],
    ]);
  });

  it("does not select Linux switches on other platforms", () => {
    assert.deepEqual(desktopStartupCommandLineSwitches("darwin", "dev.t3code.desktop"), []);
    assert.deepEqual(desktopStartupCommandLineSwitches("win32", "dev.t3code.desktop"), []);
  });
});
