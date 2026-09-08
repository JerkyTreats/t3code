import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { ComposerInlineControl } from "../../components/ComposerToolbar";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { clearMobileVoiceReplies, stopMobileVoicePlayback } from "./coordination";
import { resolveVoiceModeEnabled } from "./preferences";

export function VoiceModeToggle() {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferences);
  const enabled = loaded && resolveVoiceModeEnabled(preferences.value);
  return (
    <ComposerInlineControl
      label={enabled ? "Voice on" : "Voice"}
      accessibilityLabel={
        enabled ? "Disable spoken replies on this device" : "Enable spoken replies on this device"
      }
      selected={enabled}
      disabled={!loaded}
      showChevron={false}
      onPress={() => {
        if (enabled) {
          clearMobileVoiceReplies();
          void stopMobileVoicePlayback().catch(() => undefined);
        }
        save({ voiceModeEnabled: !enabled });
      }}
    />
  );
}
