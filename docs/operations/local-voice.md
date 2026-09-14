# Local Voice Service

Voice output uses a separate CPU-only Pocket TTS process. The coding model server does not need to change. Clients send authenticated text requests to their connected T3 environment; only the T3 server contacts the speech process. No cloud speech account is required.

## Install And Run

Use Python 3.12 and `uv`. From the checkout, install the pinned dependencies:

```sh
uv sync --project scripts/voice-tts --locked
uv run --project scripts/voice-tts --locked pocket-tts serve --host 127.0.0.1 --port 8000 --default-voice alba
```

The first start downloads public model and voice files from Hugging Face. These downloads do not contain conversation text. For offline operation, populate the cache first and retain it between restarts. Use `HF_HOME` to choose a persistent cache directory and `HF_HUB_OFFLINE=1` once the required artifacts have been downloaded. The checked-in lock pins Pocket TTS and CPU PyTorch, avoiding GPU runtime dependencies.

Bind the service to loopback when it shares a network namespace with T3. For separate containers or machines, use a private, operator-controlled route and firewall it to the T3 server. Pocket TTS itself does not authenticate callers. Do not expose it through a public ingress. Container loopback is not the host loopback.

Set these variables in the T3 server's operator-managed environment, then restart that chosen environment through its normal deployment procedure:

```sh
T3CODE_TTS_URL=http://127.0.0.1:8000
T3CODE_TTS_VOICE=alba
```

`T3CODE_TTS_URL` is a base URL. T3 sends multipart `text` and optional `voice_url` to its `/tts` endpoint. `T3CODE_TTS_VOICE` is optional; omit it to use the voice loaded by `--default-voice`. It remains the fallback until a client selects a named voice in Settings.

T3 exposes the bounded English catalog Alba, Marius, Javert, Jean, Fantine, Cosette, Eponine and Azelma. Pocket TTS downloads a selected voice embedding on first use. Preview every voice that clients may use before enabling `HF_HUB_OFFLINE=1`, then retain the populated cache between restarts. Use only voice samples you have permission to use. Review the [voice catalog and its licenses](https://huggingface.co/kyutai/tts-voices) before enabling additional samples in a future catalog change.

For a service manager, run the same pinned `uv run` command with a persistent cache, a dedicated unprivileged account, a restart-on-failure policy and a private listener. No unit is installed or enabled by this checkout. Activating a production environment remains a separate operator action.

## Verify And Recover

`GET /health` on the private Pocket TTS listener returns its health status. A synthetic audio check is:

```sh
curl --fail --form 'text=The voice service is ready.' --form 'voice_url=alba' http://127.0.0.1:8000/tts --output /tmp/voice-check.wav
```

On T3, authenticated `GET /api/voice/status` reports whether the server has speech configuration and the accepted named voice IDs, not a live model-readiness probe. Authenticated `POST /api/voice/speech` requires orchestration-operate scope and accepts JSON containing the text to speak plus an optional catalog `voiceId`. It returns a non-cached WAV. The client cannot choose a backend URL or voice URL.

The proxy accepts at most 12,000 text characters and an 80 KB request body, caps audio at 32 MiB, admits two simultaneous requests and times out after 120 seconds. It buffers a complete WAV before playback. This first version favors simple, consistent native and browser playback over streaming latency. Overlong or malformed input is rejected rather than silently shortened.

Missing configuration returns 503, a busy proxy returns 429, backend failure returns 502 and timeout returns 504. Text remains usable when voice fails. Stop cancels client playback and HTTP handling; the upstream Pocket TTS generation thread may finish work already started. Removing `T3CODE_TTS_URL` and restarting T3 disables synthesis without changing chat history or the coding model server.

The service processes the selected reply text. T3 does not persist generated audio; clients retain only the current replay audio and release it when voice is disabled or the thread is left. Avoid adding request-body logging at reverse proxies or service wrappers.

## Staging Harness

`scripts/voice-staging-harness.mjs` checks the deployed HTTPS path with synthetic text. It requires an explicit origin whose hostname starts with `stage.` or `staging.` or their hyphenated forms. This prevents an accidental production default; the operator must still verify the exact deployment before running it.

Supply a fresh staging pairing token on standard input, not in command arguments or a tracked file. The output directory must not already exist:

```sh
node scripts/voice-staging-harness.mjs \
  --staging-origin https://staging.example.test \
  --output-dir /tmp/voice-staging-result \
  --voice marius < /private/staging-token
```

The private credential file is operator-supplied. Use a pipe instead when the pairing tool can hand over the token directly. Pairing URLs and CLI display output are not valid input: pass just the token. Never reuse a consumed token. The harness refuses redirects and writes only `speech.wav` and `summary.json`, with private permissions. It checks anonymous denial, configured availability, invalid input rejection, non-cached WAV output and synthesis duration. No conversation or coding-agent task is read or created.

For browser verification, `scripts/lib/voice-staging-probe.mjs` also exports `runVoicePlaybackProbe`. Run it in an authenticated staging browser with the deployed `createVoicePlayback` and `VoiceReplyTracker` owners, audio from `runVoiceHttpProbe`, and a real `Audio` element backed by a WAV object URL. The result distinguishes actual playback from browser autoplay denial, and verifies exact text, historical-reply suppression, stop, cached replay and resource clearing. Separately select and preview a voice in Settings, reload to verify persistence, toggle Voice in the real composer, and restore the prior choices.

This is a transport and playback acceptance harness, not an end-to-end coding-provider turn test. A browser run does not prove native Android or iOS audio behavior. Keep staging enabled for the human listening pass; never promote or reconfigure production as part of this harness.
