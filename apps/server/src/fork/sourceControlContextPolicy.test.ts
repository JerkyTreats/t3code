import { describe, expect, it } from "@effect/vitest";

import { pickForkSourceControlContext } from "./sourceControlContextPolicy.ts";

describe("sourceControlContextPolicy", () => {
  it("prefers an explicit fork remote over origin", () => {
    expect(
      pickForkSourceControlContext([
        { name: "origin", url: "git@gitlab.com:T3Tools/t3code.git" },
        { name: "fork", url: "git@gitlab.com:julius/t3code.git" },
      ]),
    ).toMatchObject({
      provider: {
        kind: "gitlab",
      },
      remoteName: "fork",
      remoteUrl: "git@gitlab.com:julius/t3code.git",
    });
  });

  it("uses origin when no explicit fork remote exists", () => {
    expect(
      pickForkSourceControlContext([
        { name: "origin", url: "git@github.com:julius/t3code.git" },
        { name: "upstream", url: "git@gitlab.com:T3Tools/t3code.git" },
      ]),
    ).toMatchObject({
      provider: {
        kind: "github",
      },
      remoteName: "origin",
    });
  });

  it("falls back to non-upstream remotes before upstream", () => {
    expect(
      pickForkSourceControlContext([
        { name: "upstream", url: "git@gitlab.com:T3Tools/t3code.git" },
        { name: "alice", url: "git@bitbucket.org:alice/t3code.git" },
      ]),
    ).toMatchObject({
      provider: {
        kind: "bitbucket",
      },
      remoteName: "alice",
    });
  });
});
