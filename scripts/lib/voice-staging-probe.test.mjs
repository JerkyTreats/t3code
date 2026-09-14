import { describe, expect, it, vi } from "vite-plus/test";
import { runVoiceHttpProbe } from "./voice-staging-probe.mjs";
import { validateStagingOrigin } from "../voice-staging-harness.mjs";

describe("staging voice harness", () => {
  it("requires an explicit staging origin and rejects production or credential-bearing URLs", () => {
    expect(validateStagingOrigin("https://staging.example.test")).toBe(
      "https://staging.example.test",
    );
    for (const value of [
      "https://production.example.test",
      "http://staging.example.test",
      "https://staging.example.test/path",
      "https://user:secret@staging.example.test",
    ])
      expect(() => validateStagingOrigin(value)).toThrow();
  });
  it("probes rejection and real synthesis without reading conversations", async () => {
    const audio = new Uint8Array(100);
    audio.set(new TextEncoder().encode("RIFF"), 0);
    audio.set(new TextEncoder().encode("WAVE"), 8);
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ available: true, voiceIds: ["marius"] }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        new Response(audio, {
          headers: { "content-type": "audio/wav", "cache-control": "no-store" },
        }),
      );
    const result = await runVoiceHttpProbe(request, { voiceId: "marius" });
    expect(result.summary.wavBytes).toBe(100);
    expect(result.summary.voiceId).toBe("marius");
    expect(request.mock.calls[3][1].body).toBe(
      JSON.stringify({
        text: "The staging voice test is ready. This reply stays on the local speech service.",
        voiceId: "marius",
      }),
    );
    expect(request.mock.calls[0][2]).toBe(false);
    expect(request.mock.calls.every(([url]) => url.startsWith("/api/voice/"))).toBe(true);
  });
  it("does not label missing configuration a passing run", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ available: false }));
    await expect(runVoiceHttpProbe(request)).rejects.toThrow("voice-not-configured");
  });
});
