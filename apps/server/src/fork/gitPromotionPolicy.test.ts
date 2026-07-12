import { describe, expect, it } from "@effect/vitest";

import {
  choosePromotePushRemoteName,
  parseRemoteNames,
  parseRemoteRefWithRemoteNames,
} from "./gitPromotionPolicy.ts";

describe("gitPromotionPolicy", () => {
  it("parses remote names from git remote output", () => {
    expect(parseRemoteNames("origin\nupstream\n\n")).toEqual(["origin", "upstream"]);
  });

  it("parses remote refs with slash names", () => {
    expect(parseRemoteRefWithRemoteNames("fork/team/feature/test", ["fork/team", "fork"])).toEqual({
      remoteName: "fork/team",
      remoteBranch: "feature/test",
    });
  });

  it("uses origin for backup pushes even when another remote is configured", () => {
    expect(
      choosePromotePushRemoteName({
        remoteNames: ["origin", "upstream"],
        upstreamRef: "upstream/feature/test",
        branchPushRemote: "branch-push",
        pushDefaultRemote: "push-default",
      }),
    ).toBe("origin");
  });

  it("ignores push config and rejects repositories without origin", () => {
    expect(
      choosePromotePushRemoteName({
        remoteNames: ["origin", "upstream"],
        upstreamRef: null,
        branchPushRemote: "upstream",
        pushDefaultRemote: "upstream",
      }),
    ).toBe("origin");

    expect(
      choosePromotePushRemoteName({
        remoteNames: ["upstream"],
        upstreamRef: "upstream/main",
        branchPushRemote: "upstream",
        pushDefaultRemote: null,
      }),
    ).toBeNull();
  });
});
