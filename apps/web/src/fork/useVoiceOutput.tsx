import { useEffect, useMemo, useState } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { createVoiceOutputClient, VoiceReplyTracker } from "@t3tools/client-runtime/voice-output";
import { connectionAtomRuntime } from "../connection/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { useUpdateClientSettings } from "../hooks/useSettings";
import type { Thread } from "../types";
import { createVoicePlayback, type VoicePlaybackState } from "./voicePlayback";

export const webVoiceReplies = new VoiceReplyTracker();
const client = createVoiceOutputClient(connectionAtomRuntime, appAtomRegistry);

export function useVoiceOutput(
  environmentId: EnvironmentId,
  thread: Thread | undefined,
  enabled: boolean,
) {
  const updateSettings = useUpdateClientSettings();
  const [state, setState] = useState<VoicePlaybackState>({
    phase: "idle",
    error: null,
    canReplay: false,
  });
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const playback = useMemo(
    () =>
      createVoicePlayback({
        speech: (text, signal) => client.speech(environmentId, text, signal),
        createAudio: (bytes) => {
          const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "audio/wav" }));
          return { audio: new Audio(url), release: () => URL.revokeObjectURL(url) };
        },
        changed: setState,
      }),
    [environmentId],
  );
  const threadId = thread?.id;
  useEffect(() => {
    const deactivateThread = threadId
      ? webVoiceReplies.activateThread(environmentId, threadId)
      : null;
    return () => {
      playback.clear();
      deactivateThread?.();
    };
  }, [environmentId, threadId, playback]);
  useEffect(() => {
    setAvailabilityError(null);
    if (!enabled) {
      playback.clear();
      webVoiceReplies.clear();
      return;
    }
    const request = new AbortController();
    void client
      .status(environmentId, request.signal)
      .then((status) => {
        if (!request.signal.aborted && !status.available)
          setAvailabilityError("Voice service is not configured for this environment.");
      })
      .catch(() => {
        if (!request.signal.aborted)
          setAvailabilityError("Unable to reach this environment’s voice service.");
      });
    return () => request.abort();
  }, [environmentId, enabled, playback]);
  useEffect(() => {
    if (!enabled || !thread) return;
    const reply = webVoiceReplies.consume({
      environmentId,
      threadId: thread.id,
      latestTurn: thread.latestTurn,
      messages: thread.messages,
    });
    if (reply) void playback.play(reply.text);
  }, [environmentId, enabled, thread, playback]);
  return {
    stop: playback.stop,
    controls: (
      <div className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
        <button
          type="button"
          aria-label="Voice mode"
          aria-pressed={enabled}
          onClick={() => updateSettings({ voiceModeEnabled: !enabled })}
          className="rounded px-2 py-1 hover:bg-accent"
        >
          Voice {enabled ? "on" : "off"}
        </button>
        {enabled && state.phase !== "idle" && (
          <button
            type="button"
            onClick={playback.stop}
            className="rounded px-2 py-1 hover:bg-accent"
          >
            Stop audio
          </button>
        )}
        {enabled && state.canReplay && state.phase === "idle" && (
          <button
            type="button"
            onClick={() => void playback.replay()}
            className="rounded px-2 py-1 hover:bg-accent"
          >
            Replay reply
          </button>
        )}
        {enabled && (
          <span role="status">
            {state.error ??
              availabilityError ??
              (state.phase === "loading"
                ? "Preparing speech…"
                : state.phase === "playing"
                  ? "Speaking…"
                  : "")}
          </span>
        )}
      </div>
    ),
  };
}
