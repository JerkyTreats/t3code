import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { createVoiceOutputClient } from "@t3tools/client-runtime/voice-output";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { connectionAtomRuntime } from "../../connection/runtime";
import { uuidv4 } from "../../lib/uuid";
import { appAtomRegistry } from "../../state/atom-registry";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { useThreadDetail } from "../../state/use-thread-detail";
import {
  mobileVoiceReplies,
  clearMobileVoiceThread,
  clearMobileVoiceReplies,
  ownVoicePlayback,
} from "./coordination";
import { VoicePlayback, type VoicePlaybackState } from "./playback";
import { resolveVoiceModeEnabled } from "./preferences";
import { resolveVoiceOutputVoiceId } from "./voiceOptions";

const client = createVoiceOutputClient(connectionAtomRuntime, appAtomRegistry);

export function useVoiceOutput(
  environmentId: EnvironmentId,
  threadId: ThreadId,
  recording: boolean,
) {
  const focused = useIsFocused();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const loaded = AsyncResult.isSuccess(preferences);
  const enabled = loaded && resolveVoiceModeEnabled(preferences.value);
  const voiceId = loaded ? resolveVoiceOutputVoiceId(preferences.value) : null;
  const detail = Option.getOrNull(useThreadDetail({ environmentId, threadId }).data);
  const [availability, setAvailability] = useState<{
    environmentId: EnvironmentId;
    error: string | null;
  } | null>(null);
  const [state, setState] = useState<VoicePlaybackState>({
    phase: "idle",
    error: null,
    replayText: null,
  });
  const playback = useMemo(
    () =>
      new VoicePlayback({
        speech: (text, signal) => client.speech(environmentId, text, { signal, voiceId }),
        activate: async () => {
          await setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
            shouldPlayInBackground: false,
            interruptionMode: "doNotMix",
          });
          await setIsAudioActiveAsync(true);
        },
        deactivate: () => setIsAudioActiveAsync(false),
        create: (bytes, finished) => {
          const file = new File(Paths.cache, `t3-voice-${uuidv4()}.wav`);
          file.create();
          try {
            file.write(bytes);
            const player = createAudioPlayer(file.uri);
            const listener = player.addListener("playbackStatusUpdate", (status) => {
              if (status.error) finished(status.error);
              else if (status.didJustFinish) finished();
            });
            return {
              play: () => player.play(),
              dispose: () => {
                try {
                  listener.remove();
                  player.remove();
                } finally {
                  if (file.exists) file.delete();
                }
              },
            };
          } catch (error) {
            if (file.exists) file.delete();
            throw error;
          }
        },
        changed: setState,
      }),
    [environmentId, voiceId],
  );

  useFocusEffect(
    useCallback(() => {
      const release = ownVoicePlayback(() => playback.stop());
      return () => {
        clearMobileVoiceThread(environmentId, threadId);
        release();
        void playback.stop(true).catch(() => undefined);
      };
    }, [environmentId, threadId, playback]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") void playback.stop().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [playback]);

  useEffect(() => {
    if (!enabled) {
      if (loaded) clearMobileVoiceThread(environmentId, threadId);
      void playback.stop(true).catch(() => undefined);
      return;
    }
    const request = new AbortController();
    void client.status(environmentId, request.signal).then(
      (status) => {
        if (!request.signal.aborted)
          setAvailability({
            environmentId,
            error: status.available ? null : "Spoken replies are unavailable on this server.",
          });
      },
      () => {
        if (!request.signal.aborted)
          setAvailability({ environmentId, error: "Could not connect to spoken replies." });
      },
    );
    return () => request.abort();
  }, [enabled, loaded, environmentId, threadId, playback]);

  useEffect(() => {
    if (!enabled || !focused || recording || !detail || AppState.currentState === "background")
      return;
    const reply = mobileVoiceReplies.consume({
      environmentId,
      threadId,
      latestTurn: detail.latestTurn,
      messages: detail.messages,
    });
    if (reply) void playback.play(reply.text);
  }, [detail, enabled, focused, environmentId, threadId, recording, playback]);

  return {
    enabled,
    loaded,
    state,
    error: enabled
      ? (state.error ?? (availability?.environmentId === environmentId ? availability.error : null))
      : null,
    toggle: () => {
      if (!loaded) return;
      if (enabled) {
        clearMobileVoiceReplies();
        void playback.stop(true).catch(() => undefined);
      }
      savePreferences({ voiceModeEnabled: !enabled });
    },
    stop: () => {
      void playback.stop().catch(() => undefined);
    },
    replay: () => {
      if (enabled && !recording && state.replayText) void playback.play(state.replayText);
    },
  };
}
