import { View } from "react-native";
import { ComposerInlineControl } from "../../components/ComposerToolbar";
import type { useVoiceOutput } from "./useVoiceOutput";

export function VoiceOutputControls({
  voice,
  recording,
}: {
  readonly voice: ReturnType<typeof useVoiceOutput>;
  readonly recording: boolean;
}) {
  const playing = voice.state.phase === "playing" || voice.state.phase === "loading";
  return (
    <View className="flex-row items-center">
      <ComposerInlineControl
        label={voice.enabled ? "Voice on" : "Voice"}
        accessibilityLabel={
          voice.enabled
            ? "Disable spoken replies on this device"
            : "Enable spoken replies on this device"
        }
        selected={voice.enabled}
        disabled={!voice.loaded}
        showChevron={false}
        onPress={voice.toggle}
      />
      {voice.enabled && playing ? (
        <ComposerInlineControl
          label={voice.state.phase === "loading" ? "Cancel audio" : "Stop audio"}
          showChevron={false}
          onPress={voice.stop}
        />
      ) : null}
      {voice.enabled && !playing && voice.state.replayText ? (
        <ComposerInlineControl
          label="Replay"
          accessibilityLabel="Replay spoken reply"
          disabled={recording}
          showChevron={false}
          onPress={voice.replay}
        />
      ) : null}
    </View>
  );
}
