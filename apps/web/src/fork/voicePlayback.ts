export interface VoicePlaybackState {
  phase: "idle" | "loading" | "playing";
  error: string | null;
  canReplay: boolean;
}

export function createVoicePlayback(deps: {
  speech: (text: string, signal: AbortSignal) => Promise<Uint8Array>;
  createAudio: (bytes: Uint8Array) => { audio: HTMLAudioElement; release: () => void };
  changed: (state: VoicePlaybackState) => void;
}) {
  let generation = 0;
  let request: AbortController | null = null;
  let resource: ReturnType<typeof deps.createAudio> | null = null;
  let lastText: string | null = null;
  let lastBytes: Uint8Array | null = null;
  const publish = (phase: VoicePlaybackState["phase"], error: string | null = null) =>
    deps.changed({ phase, error, canReplay: lastText !== null });
  const stop = () => {
    generation++;
    request?.abort();
    request = null;
    if (resource) {
      resource.audio.onended = null;
      resource.audio.onerror = null;
      resource.audio.pause();
      resource.release();
      resource = null;
    }
    publish("idle");
  };
  const play = async (text: string, cachedBytes?: Uint8Array) => {
    stop();
    lastText = text;
    lastBytes = cachedBytes ?? null;
    const current = generation;
    request = new AbortController();
    publish("loading");
    try {
      // Replay uses retained audio so play runs directly in the user's gesture.
      const bytes = cachedBytes ?? (await deps.speech(text, request.signal));
      if (current !== generation) return;
      lastBytes = bytes;
      resource = deps.createAudio(bytes);
      resource.audio.onended = stop;
      resource.audio.onerror = () => {
        stop();
        publish("idle", "Audio playback failed. Try replaying the reply.");
      };
      // Browsers can reject unattended playback even after a previous interaction.
      await resource.audio.play();
      if (current === generation) publish("playing");
    } catch (error) {
      if (current !== generation) return;
      stop();
      publish(
        "idle",
        error instanceof Error && error.name === "NotAllowedError"
          ? "Your browser blocked automatic audio. Select Replay reply to listen."
          : "Speech is unavailable. Check the environment voice service and try again.",
      );
    }
  };
  return {
    play,
    stop,
    replay: () => (lastText === null ? Promise.resolve() : play(lastText, lastBytes ?? undefined)),
    clear: () => {
      lastText = null;
      lastBytes = null;
      stop();
    },
  };
}
