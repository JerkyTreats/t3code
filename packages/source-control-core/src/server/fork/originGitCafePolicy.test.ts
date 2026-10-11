import { describe, expect, it } from "vite-plus/test";
import {
  gitCafeOriginTarget,
  gitCafeOriginPullNumber,
  gitCafePublicationTarget,
  gitCafeCloneLookupTarget,
} from "./originGitCafePolicy.ts";

describe("GitCafe exact origin admission", () => {
  const origin = {
    remoteName: "origin",
    remoteUrl: "https://staging.git.cafe/team/repository.git",
  };
  it("requires literal origin and refuses foreign selector targets", () => {
    expect(gitCafeOriginTarget(origin)).toEqual({
      host: "staging.git.cafe",
      repository: "team/repository",
    });
    expect(gitCafeOriginTarget(undefined)).toBeNull();
    expect(gitCafeOriginTarget({ ...origin, remoteName: "upstream" })).toBeNull();
    expect(gitCafeOriginTarget(origin, "other/repository")).toBeNull();
    expect(gitCafeOriginTarget(origin, "https://git.cafe/team/repository")).toBeNull();
    expect(
      gitCafeOriginTarget({
        ...origin,
        remoteUrl: "https://staging.git.cafe:8443/team/repository",
      }),
    ).toBeNull();
  });
  it("reduces only origin URLs to numeric pull selectors", () => {
    const target = gitCafeOriginTarget(origin)!;
    expect(gitCafeOriginPullNumber(target, "#7")).toBe("7");
    expect(
      gitCafeOriginPullNumber(target, "https://staging.git.cafe/team/repository/pulls/7"),
    ).toBe("7");
    expect(gitCafeOriginPullNumber(target, "https://git.cafe/team/repository/pulls/7")).toBeNull();
    expect(
      gitCafeOriginPullNumber(target, "https://staging.git.cafe/other/repository/pulls/7"),
    ).toBeNull();
  });
  it("requires an explicit supported endpoint for publication", () => {
    expect(gitCafePublicationTarget("https://staging.git.cafe/api", "team/repository")).toEqual({
      host: "staging.git.cafe",
      repository: "team/repository",
    });
    expect(gitCafePublicationTarget("", "team/repository")).toBeNull();
    expect(gitCafePublicationTarget("https://git.cafe:8443", "team/repository")).toBeNull();
    expect(gitCafePublicationTarget("https://foreign.example.test", "team/repository")).toBeNull();
  });
  it("binds head clone lookup to origin's host while refusing unbound and foreign endpoints", () => {
    expect(gitCafeCloneLookupTarget({ context: origin, repository: "fork/repository" })).toEqual({
      host: "staging.git.cafe",
      repository: "fork/repository",
    });
    expect(gitCafeCloneLookupTarget({ repository: "fork/repository" })).toBeNull();
    expect(
      gitCafeCloneLookupTarget({
        context: { ...origin, remoteName: "upstream" },
        providerBaseUrl: "https://git.cafe",
        repository: "fork/repository",
      }),
    ).toBeNull();
    expect(
      gitCafeCloneLookupTarget({ context: origin, repository: "https://git.cafe/team/repository" }),
    ).toBeNull();
  });
});
