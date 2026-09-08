import { Schema } from "effect";

export const MAX_SPEECH_TEXT_CHARS = 12_000;
export const SpeechRequest = Schema.Struct({
  text: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(MAX_SPEECH_TEXT_CHARS)),
});
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

export class SpeechError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("Speech synthesis unavailable.");
    this.status = status;
  }
}

/** Owns bounded, operator-configured speech transport; clients never select an upstream URL. */
export function createPocketTts(options: {
  url?: string;
  voice?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const fetchAudio = options.fetch ?? fetch;
  let active = 0;
  const available = Boolean(options.url);
  async function synthesize(text: string, signal: AbortSignal): Promise<Uint8Array> {
    if (!options.url) throw new SpeechError(503);
    if (!text.trim() || text.length > MAX_SPEECH_TEXT_CHARS) throw new SpeechError(400);
    if (active >= 2) throw new SpeechError(429);
    active++;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 120_000);
    const combined = AbortSignal.any([signal, timeout]);
    try {
      const form = new FormData();
      form.set("text", text);
      if (options.voice) form.set("voice_url", options.voice);
      const response = await fetchAudio(new URL("tts", `${options.url.replace(/\/$/, "")}/`), {
        method: "POST",
        body: form,
        signal: combined,
        redirect: "error",
      });
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("audio/wav") ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new SpeechError(502);
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const next = await reader.read();
          combined.throwIfAborted();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > MAX_AUDIO_BYTES) throw new SpeechError(502);
          chunks.push(next.value);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
      const audio = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        audio.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (
        bytes < 12 ||
        new TextDecoder().decode(audio.subarray(0, 4)) !== "RIFF" ||
        new TextDecoder().decode(audio.subarray(8, 12)) !== "WAVE"
      )
        throw new SpeechError(502);
      return audio;
    } catch (error) {
      if (signal.aborted) throw error;
      if (timeout.aborted) throw new SpeechError(504);
      throw error instanceof SpeechError ? error : new SpeechError(502);
    } finally {
      active--;
    }
  }
  return { available, synthesize };
}
