import { describe, expect, it, vi } from "vite-plus/test";
import { createVoicePlayback, type VoicePlaybackState } from "./voicePlayback";

function setup(play = vi.fn().mockResolvedValue(undefined)) {
  const audio = { play, pause: vi.fn(), onended: null, onerror: null };
  const release = vi.fn();
  const speech = vi.fn().mockResolvedValue(new Uint8Array([1, 2]));
  const states: VoicePlaybackState[] = [];
  const controller = createVoicePlayback({
    speech,
    createAudio: () => ({ audio: audio as unknown as HTMLAudioElement, release }),
    changed: (state) => states.push(state),
  });
  return { controller, audio, release, speech, states };
}

describe("voice playback", () => {
  it("plays the exact reply and releases its audio on stop", async () => {
    const test = setup();
    await test.controller.play("Here is the reply.");
    expect(test.speech.mock.calls[0]?.[0]).toBe("Here is the reply.");
    expect(test.states.at(-1)?.phase).toBe("playing");
    test.controller.stop();
    expect(test.audio.pause).toHaveBeenCalledOnce();
    expect(test.release).toHaveBeenCalledOnce();
    expect(test.states.at(-1)?.canReplay).toBe(true);
  });

  it("reports blocked autoplay and retains replay", async () => {
    const test = setup(vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError")));
    await test.controller.play("Hello.");
    expect(test.states.at(-1)).toEqual({
      phase: "idle",
      canReplay: true,
      error: "Your browser blocked automatic audio. Select Replay reply to listen.",
    });
    expect(test.release).toHaveBeenCalledOnce();
  });

  it("ignores synthesis that completes after cancellation", async () => {
    const test = setup();
    let resolve!: (bytes: Uint8Array) => void;
    test.speech.mockImplementationOnce(
      () =>
        new Promise<Uint8Array>((done) => {
          resolve = done;
        }),
    );
    const pending = test.controller.play("Old reply.");
    const signal = test.speech.mock.calls[0]?.[1] as AbortSignal;
    test.controller.clear();
    expect(signal.aborted).toBe(true);
    resolve(new Uint8Array([1]));
    await pending;
    expect(test.audio.play).not.toHaveBeenCalled();
    expect(test.states.at(-1)?.canReplay).toBe(false);
  });

  it("replays the previous response without changing its wording", async () => {
    const test = setup();
    await test.controller.play("Verbatim.");
    await test.controller.replay();
    expect(test.speech.mock.calls.map((call) => call[0])).toEqual(["Verbatim."]);
    expect(test.audio.play).toHaveBeenCalledTimes(2);
  });
});
