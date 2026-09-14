import { AsyncResult } from "effect/unstable/reactivity";
import { appAtomRegistry } from "../../state/atom-registry";
import { mobilePreferencesAtom } from "../../state/preferences";

export function resolveVoiceModeEnabled(value: { readonly voiceModeEnabled?: boolean } | null) {
  return value?.voiceModeEnabled === true;
}

export function mobileResponseStyle(): "voice" | "text" {
  const preferences = appAtomRegistry.get(mobilePreferencesAtom);
  return AsyncResult.isSuccess(preferences) && resolveVoiceModeEnabled(preferences.value)
    ? "voice"
    : "text";
}
