import { describe, expect, it, vi } from "vite-plus/test";
import { VoicePlayback } from "./playback";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const resource = { play: vi.fn(), dispose: vi.fn() };
  const activate = vi.fn(async (): Promise<void> => undefined);
  const deactivate = vi.fn(async () => undefined);
  let finished: (error?: string) => void = () => undefined;
  const create = vi.fn((_bytes: Uint8Array, done: (error?: string) => void) => {
    finished = done;
    return resource;
  });
  const speech = vi.fn(
    async (_text: string, _signal: AbortSignal): Promise<Uint8Array> => new Uint8Array([1, 2]),
  );
  const playback = new VoicePlayback({ speech, activate, deactivate, create, changed: vi.fn() });
  return {
    playback,
    resource,
    activate,
    deactivate,
    create,
    speech,
    finish: (error?: string) => finished(error),
  };
}

describe("native voice playback lifecycle", () => {
  it("does not deactivate dictation when stopping an idle output owner", async () => {
    const h = harness();
    await h.playback.stop();
    expect(h.deactivate).not.toHaveBeenCalled();
  });

  it("activates audio before playing and releases the player and file resource on stop", async () => {
    const h = harness();
    await h.playback.play("Ready to review.");
    expect(h.activate).toHaveBeenCalledOnce();
    expect(h.activate.mock.invocationCallOrder[0]).toBeLessThan(
      h.resource.play.mock.invocationCallOrder[0]!,
    );
    expect(h.playback.state.phase).toBe("playing");
    await h.playback.stop();
    expect(h.resource.dispose).toHaveBeenCalledOnce();
    expect(h.deactivate).toHaveBeenCalledOnce();
    expect(h.playback.state.replayText).toBe("Ready to review.");
    await h.playback.stop(true);
    expect(h.playback.state.replayText).toBeNull();
  });

  it("aborts a synthesis request and ignores late bytes after leaving the thread", async () => {
    const h = harness();
    const bytes = deferred<Uint8Array>();
    const requested = deferred<AbortSignal>();
    h.speech.mockImplementation((_text, signal) => {
      requested.resolve(signal);
      return bytes.promise;
    });
    const playing = h.playback.play("Old thread.");
    const signal = await requested.promise;
    await h.playback.stop(true);
    expect(signal.aborted).toBe(true);
    bytes.resolve(new Uint8Array([3]));
    await playing;
    expect(h.create).not.toHaveBeenCalled();
    expect(h.playback.state.phase).toBe("idle");
  });

  it("waits for pending activation to release before dictation can acquire audio", async () => {
    const h = harness();
    const active = deferred<void>();
    const activating = deferred<void>();
    h.activate.mockImplementation(() => {
      activating.resolve();
      return active.promise;
    });
    const playing = h.playback.play("Reply.");
    await activating.promise;
    const stopped = h.playback.stop();
    expect(h.deactivate).not.toHaveBeenCalled();
    active.resolve();
    await stopped;
    await playing;
    expect(h.deactivate).toHaveBeenCalledOnce();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("cleans up after natural completion and keeps replay available", async () => {
    const h = harness();
    await h.playback.play("All done.");
    h.finish();
    await h.playback.stop();
    expect(h.resource.dispose).toHaveBeenCalledOnce();
    expect(h.playback.state.replayText).toBe("All done.");
    await h.playback.play(h.playback.state.replayText!);
    expect(h.resource.play).toHaveBeenCalledTimes(2);
  });

  it("surfaces synthesis errors while retaining retry text", async () => {
    const h = harness();
    h.speech.mockRejectedValue(new Error("Speech is unavailable."));
    await h.playback.play("Keep visible text.");
    expect(h.playback.state).toEqual({
      phase: "error",
      error: "Speech is unavailable.",
      replayText: "Keep visible text.",
    });
    expect(h.activate).not.toHaveBeenCalled();
  });
});
