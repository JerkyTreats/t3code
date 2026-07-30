import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  type SidebarAutoSettleAfterDays,
} from "@t3tools/contracts/settings";

export interface SidebarV2Preference {
  readonly enabled: boolean;
  readonly configuredByUser: boolean;
}

export const DEFAULT_SIDEBAR_V2_ENABLED = false;

export function resolveSidebarV2Enabled(input: {
  readonly preference: SidebarV2Preference;
  readonly settingsHydrated: boolean;
}): boolean {
  if (!input.settingsHydrated) {
    return false;
  }

  if (input.preference.configuredByUser) {
    return input.preference.enabled;
  }

  // A stored true value predates explicit-choice tracking and remains an opt-in.
  if (input.preference.enabled) {
    return true;
  }

  return DEFAULT_SIDEBAR_V2_ENABLED;
}

export function resolveAppSidebarVersion(input: {
  readonly pathname: string;
  readonly sidebarV2Enabled: boolean;
}): "v1" | "v2" {
  const isSettingsRoute = input.pathname === "/settings" || input.pathname.startsWith("/settings/");
  return input.sidebarV2Enabled && !isSettingsRoute ? "v2" : "v1";
}

export function parseSidebarAutoSettleDaysDraft(
  draft: string,
): Exclude<SidebarAutoSettleAfterDays, null> | null {
  if (draft.trim().length === 0) {
    return null;
  }

  const parsed = Number(draft);
  if (
    !Number.isInteger(parsed) ||
    parsed < MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS ||
    parsed > MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS
  ) {
    return null;
  }

  return parsed as Exclude<SidebarAutoSettleAfterDays, null>;
}
