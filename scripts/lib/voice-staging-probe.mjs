export const VOICE_PROBE_TEXT =
  "The staging voice test is ready. This reply stays on the local speech service.";

function check(value, label) {
  if (!value) throw new Error(label);
}

/** Runs against real authenticated HTTP, with synthetic text and no conversation reads. */
export async function runVoiceHttpProbe(request) {
  const denied = await request(
    "/api/voice/speech",
    { method: "POST", body: JSON.stringify({ text: VOICE_PROBE_TEXT }) },
    false,
  );
  check(denied.status === 401, "anonymous-speech-was-not-denied");
  const status = await request("/api/voice/status");
  check(status.ok && (await status.json()).available === true, "voice-not-configured");
  const malformed = await request("/api/voice/speech", { method: "POST", body: '{"text":123}' });
  check(malformed.status === 400, "invalid-input-was-not-rejected");
  const started = performance.now();
  const response = await request("/api/voice/speech", {
    method: "POST",
    body: JSON.stringify({ text: VOICE_PROBE_TEXT }),
  });
  check(response.ok, "synthesis-failed");
  check(response.headers.get("content-type")?.startsWith("audio/wav"), "unexpected-audio-type");
  check(response.headers.get("cache-control") === "no-store", "audio-was-cacheable");
  const audio = new Uint8Array(await response.arrayBuffer());
  check(audio.length > 44 && audio.length <= 32 * 1024 * 1024, "invalid-audio-size");
  const decoder = new TextDecoder();
  check(
    decoder.decode(audio.subarray(0, 4)) === "RIFF" &&
      decoder.decode(audio.subarray(8, 12)) === "WAVE",
    "invalid-wav",
  );
  return {
    audio,
    summary: {
      anonymousDenied: true,
      configured: true,
      invalidInputRejected: true,
      wavBytes: audio.length,
      synthesisMs: Math.round(performance.now() - started),
    },
  };
}

/** Uses shipped client owners and a real browser Audio element, without submitting an agent turn. */
export async function runVoicePlaybackProbe({ createPlayback, createAudio, audio, Tracker }) {
  const history = new Tracker();
  const submission = {
    environmentId: "synthetic-environment",
    threadId: "synthetic-thread",
    messageId: "synthetic-user",
    createdAt: "2026-09-07T00:00:00Z",
  };
  const snapshot = {
    ...submission,
    latestTurn: {
      turnId: "synthetic-turn",
      state: "completed",
      requestedAt: submission.createdAt,
      assistantMessageId: "synthetic-final",
    },
    messages: [
      {
        id: submission.messageId,
        role: "user",
        text: "Synthetic test",
        turnId: null,
        streaming: false,
        createdAt: submission.createdAt,
      },
      {
        id: "synthetic-final",
        role: "assistant",
        text: VOICE_PROBE_TEXT,
        turnId: "synthetic-turn",
        streaming: false,
        createdAt: submission.createdAt,
      },
    ],
  };
  check(history.consume(snapshot) === null, "history-autoplayed");
  history.register(submission);
  check(
    history.consume(snapshot)?.text === VOICE_PROBE_TEXT && history.consume(snapshot) === null,
    "reply-admission-failed",
  );
  let state;
  let released = 0;
  let requests = 0;
  const playback = createPlayback({
    speech: async (text) => {
      check(text === VOICE_PROBE_TEXT, "reply-was-rewritten");
      requests++;
      return audio;
    },
    createAudio: (bytes) => {
      const resource = createAudio(bytes);
      return {
        audio: resource.audio,
        release: () => {
          released++;
          resource.release();
        },
      };
    },
    changed: (next) => {
      state = next;
    },
  });
  try {
    await playback.play(VOICE_PROBE_TEXT);
    const autoplay = state.phase === "playing" ? "playing" : "blocked";
    check(
      autoplay === "playing" || state.error?.includes("blocked automatic audio"),
      "browser-playback-failed",
    );
    playback.stop();
    check(
      state.phase === "idle" && state.canReplay && released === 1,
      "stop-did-not-release-audio",
    );
    await playback.replay();
    check(requests === 1, "replay-resynthesized-audio");
    playback.clear();
    check(!state.canReplay && released === 2, "clear-retained-audio");
    return {
      historySilent: true,
      exactReply: true,
      autoplay,
      stopReleased: true,
      replayCached: true,
      clearReleased: true,
    };
  } finally {
    playback.clear();
  }
}
