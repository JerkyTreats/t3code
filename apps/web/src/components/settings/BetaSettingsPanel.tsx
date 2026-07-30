import {
  DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts/settings";
import { useEffect, useState } from "react";

import {
  useClientSettings,
  useClientSettingsHydrated,
  useSidebarV2Enabled,
  useUpdateClientSettings,
} from "../../hooks/useSettings";
import { parseSidebarAutoSettleDaysDraft } from "../../sidebarV2Settings";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  readonly value: number;
  readonly onCommit: (days: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      min={MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      max={MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
      step={1}
      inputMode="numeric"
      className="w-full sm:w-24"
      value={draft}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        const days = parseSidebarAutoSettleDaysDraft(nextDraft);
        if (days !== null) {
          onCommit(days);
        }
      }}
      onBlur={() => setDraft(String(value))}
      aria-label="Days of inactivity before auto-settle"
    />
  );
}

export function BetaSettingsPanel() {
  const settingsHydrated = useClientSettingsHydrated();
  const sidebarV2Enabled = useSidebarV2Enabled();
  const sidebarAutoSettleAfterDays = useClientSettings(
    (settings) => settings.sidebarAutoSettleAfterDays,
  );
  const updateSettings = useUpdateClientSettings();

  return (
    <SettingsPageContainer>
      <SettingsSection title="Beta features">
        <SettingsRow
          title="Sidebar V2"
          description="Try the new project and thread navigator. Sidebar V1 stays available and Settings always keeps the familiar navigation shell."
          status={settingsHydrated ? null : "Loading saved preference…"}
          control={
            <Switch
              checked={sidebarV2Enabled}
              disabled={!settingsHydrated}
              onCheckedChange={(checked) =>
                updateSettings({
                  sidebarV2Enabled: Boolean(checked),
                  sidebarV2ConfiguredByUser: true,
                })
              }
              aria-label="Enable Sidebar V2"
            />
          }
        />

        {sidebarV2Enabled ? (
          <>
            <SettingsRow
              title="Auto-settle inactive threads"
              description="Move inactive threads into the settled list after a bounded period. New activity returns them to active work."
              control={
                <Switch
                  checked={sidebarAutoSettleAfterDays !== null}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      sidebarAutoSettleAfterDays: checked
                        ? DEFAULT_SIDEBAR_AUTO_SETTLE_AFTER_DAYS
                        : null,
                    })
                  }
                  aria-label="Auto-settle inactive threads"
                />
              }
            />

            {sidebarAutoSettleAfterDays !== null ? (
              <SettingsRow
                title="Days before auto-settle"
                description={`Choose a whole number from ${MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS} through ${MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}. Invalid values are not saved.`}
                control={
                  <AutoSettleDaysInput
                    value={sidebarAutoSettleAfterDays}
                    onCommit={(days) => updateSettings({ sidebarAutoSettleAfterDays: days })}
                  />
                }
              />
            ) : null}
          </>
        ) : null}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
