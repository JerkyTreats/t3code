import { describe, expect, it, vi } from "vite-plus/test";
import { createPocketTts, MAX_SPEECH_TEXT_CHARS } from "./PocketTts.ts";

const wav = () =>
  new Response("RIFF0000WAVEsynthetic", { headers: { "content-type": "audio/wav" } });
describe("Pocket TTS transport", () => {
  it("sends exact text and operator voice as multipart and returns WAV bytes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(wav());
    const tts = createPocketTts({ url: "http://tts.example.test", voice: "alba", fetch: fetcher });
    expect(
      new TextDecoder().decode(await tts.synthesize(" Exact text. ", new AbortController().signal)),
    ).toBe("RIFF0000WAVEsynthetic");
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("http://tts.example.test/tts");
    expect((options!.body as FormData).get("text")).toBe(" Exact text. ");
    expect((options!.body as FormData).get("voice_url")).toBe("alba");
    expect(options!.redirect).toBe("error");
  });
  it("lets a validated client voice override the operator default", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(wav());
    const tts = createPocketTts({ url: "http://tts.example.test", voice: "alba", fetch: fetcher });
    await tts.synthesize("Preview", new AbortController().signal, "marius");
    const options = fetcher.mock.calls[0]![1]!;
    expect((options.body as FormData).get("voice_url")).toBe("marius");
    expect(tts.voiceIds).toContain("marius");
  });
  it("fails closed without configuration and rejects empty or excessive text", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const signal = new AbortController().signal;
    expect(createPocketTts({}).available).toBe(false);
    await expect(createPocketTts({}).synthesize("Hello", signal)).rejects.toMatchObject({
      status: 503,
    });
    const tts = createPocketTts({ url: "http://tts.example.test", fetch: fetcher });
    for (const text of [" ", "x".repeat(MAX_SPEECH_TEXT_CHARS + 1)])
      await expect(tts.synthesize(text, signal)).rejects.toMatchObject({ status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds concurrency and releases both cancelled slots", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener("abort", () => reject(new Error("cancelled")), {
            once: true,
          });
        }),
    );
    const tts = createPocketTts({ url: "http://tts.example.test", fetch: fetcher });
    const controller = new AbortController();
    const first = tts.synthesize("First", controller.signal);
    const second = tts.synthesize("Second", controller.signal);
    await expect(tts.synthesize("Third", controller.signal)).rejects.toMatchObject({ status: 429 });
    controller.abort();
    await expect(first).rejects.toThrow("cancelled");
    await expect(second).rejects.toThrow("cancelled");
    fetcher.mockResolvedValue(wav());
    await expect(tts.synthesize("Next", new AbortController().signal)).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });
  it("bounds a stalled upstream request with a timeout", async () => {
    const timeout = new AbortController();
    const timer = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options!.signal!.addEventListener("abort", () => reject(new Error("timeout")), {
              once: true,
            });
          }),
      );
      const pending = createPocketTts({
        url: "http://tts.example.test",
        fetch: fetcher,
      }).synthesize("Hello", new AbortController().signal);
      timeout.abort();
      await expect(pending).rejects.toMatchObject({ status: 504 });
    } finally {
      timer.mockRestore();
    }
  });
  it.each([
    () => new Response("private upstream failure", { status: 500 }),
    () => new Response("wrong format", { headers: { "content-type": "audio/wav" } }),
    () =>
      new Response(new Uint8Array(32 * 1024 * 1024 + 1), {
        headers: { "content-type": "audio/wav" },
      }),
  ])("bounds upstream errors and invalid audio", async (response) => {
    const tts = createPocketTts({
      url: "http://tts.example.test",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response()),
    });
    await expect(tts.synthesize("Hello", new AbortController().signal)).rejects.toMatchObject({
      status: 502,
      message: "Speech synthesis unavailable.",
    });
  });
});
