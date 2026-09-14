import { useEffect, useMemo, useState } from "react";
import type { EnvironmentId, VoiceOutputVoiceId } from "@t3tools/contracts";
import { createVoiceOutputClient } from "@t3tools/client-runtime/voice-output";
import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { createVoicePlayback, type VoicePlaybackState } from "./voicePlayback";

const client = createVoiceOutputClient(connectionAtomRuntime, appAtomRegistry);
export const VOICE_PREVIEW_TEXT = "Hi. This is how I’ll sound when I read an agent reply.";

export function useVoicePreview(
  environmentId: EnvironmentId | null,
  voiceId: VoiceOutputVoiceId | null,
) {
  const [state, setState] = useState<VoicePlaybackState>({
    phase: "idle",
    error: null,
    canReplay: false,
  });
  const playback = useMemo(
    () =>
      createVoicePlayback({
        speech: (text, signal) =>
          environmentId === null
            ? Promise.reject(new Error("Connect a primary environment to preview this voice."))
            : client.speech(environmentId, text, { signal, voiceId }),
        createAudio: (bytes) => {
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/wav" }));
          return { audio: new Audio(url), release: () => URL.revokeObjectURL(url) };
        },
        changed: setState,
      }),
    [environmentId, voiceId],
  );

  useEffect(() => () => playback.clear(), [playback]);

  return {
    state,
    preview: () => playback.play(VOICE_PREVIEW_TEXT),
    stop: playback.stop,
  };
}
