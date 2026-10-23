import { describe, expect, it } from "vite-plus/test";

import {
  OFFICIAL_DESKTOP_UPDATER_REPOSITORY,
  officialDesktopReleaseUrl,
  officialDesktopRepository,
} from "./forkReleaseIdentity.ts";

describe("fork release identity", () => {
  it("owns the exact official desktop repository and rejects alternatives", () => {
    expect(OFFICIAL_DESKTOP_UPDATER_REPOSITORY).toBe("JerkyTreats/t3code");
    expect(officialDesktopRepository()).toEqual({ owner: "JerkyTreats", repo: "t3code" });
    expect(officialDesktopRepository(" JerkyTreats/t3code ")).toEqual({
      owner: "JerkyTreats",
      repo: "t3code",
    });
    expect(officialDesktopRepository("another/example")).toBeNull();
  });

  it("owns release history and encoded tag URLs", () => {
    expect(officialDesktopReleaseUrl()).toBe("https://github.com/JerkyTreats/t3code/releases");
    expect(officialDesktopReleaseUrl(" 1.2.3-nightly/a ")).toBe(
      "https://github.com/JerkyTreats/t3code/releases/tag/v1.2.3-nightly%2Fa",
    );
  });

  it("preserves identity through a replacement build and presentation host", () => {
    const replacementHost = (requestedRepository: string | undefined, version: string) => {
      const repository = officialDesktopRepository(requestedRepository);
      return repository === null
        ? null
        : {
            publish: `${repository.owner}/${repository.repo}`,
            releaseUrl: officialDesktopReleaseUrl(version),
          };
    };

    expect(replacementHost(undefined, "2.0.0")).toEqual({
      publish: "JerkyTreats/t3code",
      releaseUrl: "https://github.com/JerkyTreats/t3code/releases/tag/v2.0.0",
    });
    expect(replacementHost("upstream/example", "2.0.0")).toBeNull();
  });
});
