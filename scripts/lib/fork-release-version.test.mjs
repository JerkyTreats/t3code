import { expect, it } from "vite-plus/test";

import { forkReleaseVersion } from "./fork-release-version.mjs";

const COMMIT = "abcdef0123456789abcdef0123456789abcdef01";

it("derives a semver prerelease from the upstream server base and exact source commit", () => {
  expect(forkReleaseVersion("0.0.42", COMMIT)).toBe("0.0.42-abcdef0123");
  expect(forkReleaseVersion("0.0.42", COMMIT, "0.0.42-abcdef0123")).toBe("0.0.42-abcdef0123");
  expect(forkReleaseVersion("0.0.42-nightly.20260926.1", COMMIT)).toBe(
    "0.0.42-nightly.20260926.1-abcdef0123",
  );
});

it("rejects missing provenance and mismatched explicit versions", () => {
  expect(() => forkReleaseVersion("0.0.42", "abcdef0123")).toThrow("full lowercase");
  expect(() => forkReleaseVersion("0.0.42", COMMIT.toUpperCase())).toThrow("full lowercase");
  expect(() => forkReleaseVersion("0.0.42+build.1", COMMIT)).toThrow("without build metadata");
  expect(() => forkReleaseVersion("0.0.42-nightly.01", COMMIT)).toThrow("invalid semver");
  expect(() => forkReleaseVersion("0.0.42", "0123456789abcdef0123456789abcdef01234567")).toThrow(
    "invalid numeric semver",
  );
  expect(() => forkReleaseVersion("0.0.42", COMMIT, "0.0.42-1111111111")).toThrow("must match");
});
