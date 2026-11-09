import { describe, expect, it } from "vite-plus/test";

import { isFollowableRedirect } from "./GitHubHttpClient.ts";

const url = (path: string, host = "api.github.com") => new URL(`https://${host}${path}`);

describe("isFollowableRedirect", () => {
  it("follows a read that stays in the same repository, whatever its case", () => {
    expect(
      isFollowableRedirect(url("/repos/acme/web/pulls/7"), url("/repos/Acme/Web/pulls/7"), "GET"),
    ).toBe(true);
    expect(
      isFollowableRedirect(
        url("/api/v3/repos/acme/web", "git.acme.test"),
        url("/api/v3/repos/acme/web/", "git.acme.test"),
        "HEAD",
      ),
    ).toBe(true);
    expect(isFollowableRedirect(url("/user"), url("/user/emails"), "GET")).toBe(true);
  });

  it("refuses a redirect into another repository, to another host, or of a write", () => {
    expect(
      isFollowableRedirect(url("/repos/acme/web/pulls/7"), url("/repos/other/web/pulls/7"), "GET"),
    ).toBe(false);
    expect(isFollowableRedirect(url("/repos/acme/web"), url("/user"), "GET")).toBe(false);
    expect(
      isFollowableRedirect(url("/repos/acme/web"), url("/repos/acme/web", "evil.test"), "GET"),
    ).toBe(false);
    expect(
      isFollowableRedirect(url("/repos/acme/web/pulls"), url("/repos/acme/web/pulls"), "POST"),
    ).toBe(false);
  });
});
