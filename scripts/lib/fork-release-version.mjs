export function forkReleaseVersion(baseVersion, commitHash, override) {
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u.test(baseVersion)) {
    throw new Error("The upstream server base version must be semver without build metadata.");
  }
  const prerelease = baseVersion.split("-").slice(1).join("-");
  if (prerelease && prerelease.split(".").some((part) => part === "" || /^0\d+$/u.test(part))) {
    throw new Error("The upstream server base version has an invalid semver prerelease.");
  }
  if (!/^[0-9a-f]{40}$/u.test(commitHash)) {
    throw new Error("A full lowercase release source commit is required.");
  }
  const version = `${baseVersion}-${commitHash.slice(0, 10)}`;
  if (
    /^\d{10}$/u.test(commitHash.slice(0, 10)) &&
    commitHash[0] === "0" &&
    !baseVersion.includes("-")
  ) {
    throw new Error("The exact commit suffix would be an invalid numeric semver prerelease.");
  }
  if (override !== undefined && override !== version) {
    throw new Error(`Build version must match the release source version ${version}.`);
  }
  return version;
}
