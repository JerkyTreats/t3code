import { describe, expect, it } from "vite-plus/test";

import { settingsAccountLabel } from "./settingsAccountLabel";

describe("settingsAccountLabel", () => {
  it("uses general sign-in wording for signed-out accounts", () => {
    expect(
      settingsAccountLabel({
        isLoaded: true,
        isSignedIn: false,
        emailAddress: undefined,
      }),
    ).toBe("Sign in");
  });
});
