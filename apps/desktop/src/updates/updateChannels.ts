import type { DesktopUpdateChannel } from "@t3tools/contracts";

const NIGHTLY_VERSION_PATTERN = /^[^-+]+-nightly\.\d{8}\.\d+(?:-[0-9a-f]{10})?$/;
// Preview builds share nightly branding but ship without an update feed.
const PRERELEASE_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+(?:-[0-9a-f]{10})?$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  return NIGHTLY_VERSION_PATTERN.test(appVersion) ? "nightly" : "latest";
}
