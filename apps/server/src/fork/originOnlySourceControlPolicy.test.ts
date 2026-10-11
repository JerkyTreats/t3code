import { describe, expect, it } from "@effect/vitest";

import {
  ORIGIN_REMOTE_NAME,
  isOriginRemoteName,
  isOriginRemoteRef,
  selectOriginRemote,
  selectOriginRemoteName,
  originHeadAssociation,
  originRemoteBranchPattern,
  hasOriginCreationTracking,
  originStatusTracking,
  selectOriginUpstream,
  originSameNameUpstream,
} from "@t3tools/source-control-core/server/fork/originOnlySourceControlPolicy";

describe("originOnlySourceControlPolicy", () => {
  it("selects only origin", () => {
    expect(selectOriginRemoteName(["upstream", "fork", "origin"])).toBe(ORIGIN_REMOTE_NAME);
    expect(selectOriginRemoteName(["upstream", "fork"])).toBeNull();
  });

  it("recognizes only the exact origin remote and its refs", () => {
    expect(isOriginRemoteName("origin")).toBe(true);
    expect(isOriginRemoteName("origin-1")).toBe(false);
    expect(isOriginRemoteRef("origin/main")).toBe(true);
    expect(isOriginRemoteRef("upstream/main")).toBe(false);
  });

  it("selects the exact origin candidate without falling back", () => {
    const upstream = { name: "upstream", url: "git@example.test/upstream.git" };
    const origin = { name: "origin", url: "git@example.test/origin.git" };

    expect(selectOriginRemote([upstream, origin])).toBe(origin);
    expect(selectOriginRemote([upstream])).toBeNull();
  });

  it("owns head selection, status reset and creation tracking independently of the driver", () => {
    expect(originHeadAssociation("feature", "upstream/main")).toEqual({
      remoteName: "origin",
      headBranch: "feature",
    });
    expect(originHeadAssociation("feature", "origin/topic/nested")).toEqual({
      remoteName: "origin",
      headBranch: "topic/nested",
    });
    expect(originRemoteBranchPattern("topic/nested")).toBe("refs/remotes/origin/topic/nested");
    expect(hasOriginCreationTracking("upstream", "origin/feature")).toBe(false);
    expect(hasOriginCreationTracking("origin", "upstream/feature")).toBe(false);
    expect(hasOriginCreationTracking("origin", "origin/feature")).toBe(true);
    expect(
      originStatusTracking({
        upstreamRef: "upstream/feature",
        parsedRemoteName: "upstream",
        aheadCount: 4,
        behindCount: 7,
      }),
    ).toEqual({ upstreamRef: null, aheadCount: 0, behindCount: 0 });
    expect(selectOriginUpstream({ remoteName: "upstream", branchName: "main" })).toBeNull();
    expect(originSameNameUpstream("feature", false)).toBeNull();
    expect(originSameNameUpstream("feature", true)).toEqual({
      remoteName: "origin",
      upstreamRef: "origin/feature",
      branchName: "feature",
    });
  });
});
