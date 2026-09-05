import { describe, expect, it } from "@effect/vitest";

import {
  ORIGIN_REMOTE_NAME,
  isOriginRemoteName,
  isOriginRemoteRef,
  selectOriginRemote,
  selectOriginRemoteName,
} from "./originOnlySourceControlPolicy.ts";

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
});
