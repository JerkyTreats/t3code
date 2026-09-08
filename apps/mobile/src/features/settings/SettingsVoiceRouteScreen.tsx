import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import {
  VOICE_OUTPUT_VOICE_IDS,
  VOICE_OUTPUT_VOICE_LABELS,
  type VoiceOutputVoiceId,
} from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { voiceOutputVoiceLabel } from "../voice-output/voiceOptions";
import { SettingsSection } from "./components/SettingsSection";

const VOICE_OPTIONS: ReadonlyArray<VoiceOutputVoiceId | null> = [null, ...VOICE_OUTPUT_VOICE_IDS];

export function SettingsVoiceRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const selectedVoiceId = AsyncResult.isSuccess(preferencesResult)
    ? (preferencesResult.value.voiceOutputVoiceId ?? null)
    : null;

  return (
    <View collapsable={false} className="flex-1 bg-sheet">
      {Platform.OS === "android" ? (
        <>
          <NativeStackScreenOptions options={{ headerShown: false }} />
          <AndroidScreenHeader title="Voice" onBack={() => navigation.goBack()} />
        </>
      ) : null}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title="Spoken reply voice">
          {VOICE_OPTIONS.map((voiceId, index) => (
            <Pressable
              key={voiceId ?? "server-default"}
              accessibilityLabel={voiceOutputVoiceLabel(voiceId)}
              accessibilityRole="radio"
              accessibilityState={{
                checked: selectedVoiceId === voiceId,
                disabled: !preferencesReady,
              }}
              disabled={!preferencesReady}
              onPress={() => savePreferences({ voiceOutputVoiceId: voiceId ?? undefined })}
              className={
                index === 0
                  ? "flex-row items-center gap-4 p-4"
                  : "flex-row items-center gap-4 border-t border-border-subtle p-4"
              }
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-lg text-foreground">
                  {voiceId === null ? "Server default" : VOICE_OUTPUT_VOICE_LABELS[voiceId]}
                </Text>
                {voiceId === null ? (
                  <Text className="text-sm leading-normal text-foreground-muted">
                    Use the voice configured by this environment.
                  </Text>
                ) : null}
              </View>
              {selectedVoiceId === voiceId ? (
                <SymbolView
                  name="checkmark"
                  size={18}
                  tintColorClassName={"accent-icon"}
                  type="monochrome"
                  weight="semibold"
                />
              ) : null}
            </Pressable>
          ))}
        </SettingsSection>
        <Text className="px-2 text-sm leading-normal text-foreground-muted">
          This choice stays on this device. The next spoken reply uses the selected voice.
        </Text>
      </ScrollView>
    </View>
  );
}
