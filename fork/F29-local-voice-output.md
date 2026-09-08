# F29 Local Voice Output

Date: 2026-09-07
Status: active

## Protected Decisions

- `F29.C01` Turn commands optionally carry voice or text response style. The common provider boundary supplies turn-only guidance without rewriting the stored user message. Native slash commands keep their grammar. The client setting defaults to off.
- `F29.C02` The agent writes a speakable conversational final reply. No second model rewrites or summarizes it. Text mode explicitly ends prior voice-format guidance.
- `F29.C03` Only an in-memory registration from a local voice submission admits automatic playback. A completed turn and its projected assistant-message identity select a non-streaming reply. History hydration and other devices do not opt themselves in. Text is sent verbatim to TTS.
- `F29.C04` The authenticated environment proxy owns backend selection, request and audio limits, concurrency, timeout and failure handling. Clients cannot submit a backend URL. Speech stays separate from coding-model inference.

## Owners And Adapters

`apps/server/src/voice/responseStyle.ts` owns response guidance. `PocketTts.ts` and `http.ts` in the same directory own bounded synthesis and authenticated admission. The provider reactor, turn decider, command contracts and server route list are mechanical transport and registration adapters.

`packages/client-runtime/src/voice-output` owns device-memory reply admission and authenticated HTTP requests, consuming the existing environment authorization and connection owners. Tests exercise these decisions independently of any screen implementation.

Shared contracts, provider execution, turn projection and client settings storage remain substrate. The shared reply tracker exposes explicit registration, forgetting, thread clearing and one-time consumption for client adapters.

## Evidence And Boundaries

The response-style tests and provider-reactor integration test cover instruction injection, text reset and unchanged stored messages. Pocket transport and authenticated route tests cover failure and admission boundaries. Shared reply tests prove history suppression, completed reply selection, verbatim text and device/thread identity. Shared HTTP tests exercise cookie, bearer and refreshed request-bound DPoP authorization.

The current message projection does not expose a final-versus-commentary phase. Playback uses the completed turn's selected assistant message, never streams interim updates. A provider that ends without a separate final message can therefore leave its last assistant message as the selected reply. This feature does not introduce new STT, duplex audio, conversational turn detection or cloud TTS.

The pinned CPU service and activation boundary are documented in [Local Voice Service](../docs/operations/local-voice.md). Production activation and real-device listening are independent of source acceptance.
