# F29 Local Voice

Date: 2026-09-07
Status: active

## Protected Decisions

- `F29.C01` Voice is device-local and opt-in. Each submitted turn carries its voice or text response style, including mobile outbox recovery. The common provider boundary supplies turn-only guidance without rewriting the stored user message. Native slash commands keep their grammar.
- `F29.C02` The agent writes a speakable conversational final reply. No second model rewrites or summarizes it. Text mode explicitly ends prior voice-format guidance.
- `F29.C03` Only an in-memory registration from a local voice submission admits automatic playback. A completed turn and its projected assistant-message identity select a non-streaming reply. History hydration and other devices do not opt themselves in. A same-thread draft promotion preserves admission across its route handoff, while genuinely leaving revokes queued eligibility even across pending audio shutdown. Offline new-task creation retains its response style but does not arm later autoplay. Text is sent verbatim to TTS.
- `F29.C04` The authenticated environment proxy owns backend selection, the finite Pocket TTS voice catalog, request and audio limits, concurrency, timeout and failure handling. Clients can select a named catalog voice but cannot submit a backend or voice URL. Speech stays separate from coding-model inference.
- `F29.C05` Clients own stop, replay, audio resources and visible failures. Turning voice off or leaving a thread cancels playback. Native dictation stops speech before recording. Browser autoplay denial exposes a manual replay action.
- `F29.C06` Voice selection is device-local and defaults to the server-configured voice. Web and desktop Settings provide an explicit preview before a user relies on the next automatic reply. Mobile Settings exposes the same finite catalog and applies the choice to subsequent playback.
- `F29.C07` Every supported chat composer replaces an otherwise disabled primary Send action with a primary microphone when its draft has no sendable content. One recording produces editable draft text and never submits a turn. Send returns as soon as the draft becomes sendable. Android and web admit transcription only when their platform can guarantee on-device recognition. Electron desktop shells fail closed before inspecting Chromium's browser recognition API because Electron does not provide the required on-device recognition binder. Unsupported platforms retain the ordinary disabled Send action and never fall back to remote speech processing.

## Owners And Adapters

`apps/server/src/voice/responseStyle.ts` owns response guidance. `PocketTts.ts` and `http.ts` in the same directory own bounded synthesis and authenticated admission. The provider reactor, turn decider, command contracts and server route list are mechanical transport and registration adapters.

`packages/client-runtime/src/voice-output` owns device-memory reply admission and authenticated HTTP requests, consuming the existing environment authorization and connection owners. The contracts voice catalog bounds client selection to known Pocket TTS names. Tests exercise these decisions independently of any screen implementation.

`apps/web/src/fork/useVoiceOutput.tsx` and `voicePlayback.ts` own the web and desktop interaction and audio lifecycle. The web owner acquires its same-thread admission lease in the synchronous route lifecycle so draft cleanup and server-thread setup settle before deferred departure. `apps/mobile/src/features/voice-output` owns the native equivalent. Composer, route, preferences and outbox integrations supply inputs and render controls. Shared contracts, provider execution, turn projection, client settings storage, Expo audio and browser audio remain substrate.

`packages/client-runtime/src/voice-input/controller.ts` owns one-shot mobile recording, draft identity, stale-result rejection and transcript insertion without submission. `apps/web/src/fork/localVoiceInput.ts` and `useLocalVoiceInput.ts` own the same draft and explicit-submit contract around browser recognition. `apps/mobile/src/native/voiceTranscription.android.ts` and `voiceTranscription.ios.ts` own platform-local recognizer admission and lifecycle. `apps/mobile/src/features/voice-input/voiceInputPresentation.ts` owns the native microphone and Send selection. Composer hosts mechanically render owner-produced recording, cancellation, transcription and failure state.

## Evidence And Boundaries

The response-style tests and provider-reactor integration test cover instruction injection, text reset and unchanged stored messages. Pocket transport and authenticated route tests cover failure, admission, catalog validation and operator-default override boundaries. Shared reply tests prove history suppression, completed reply selection, canonical projected-time matching, verbatim text, device/thread identity, same-thread route handoff and true thread departure. Shared HTTP tests exercise cookie, bearer and refreshed request-bound DPoP authorization while retaining the chosen voice. Playback-owner tests execute cleanup, replay and stale-request handling without depending on a particular composer host. Client-settings and mobile preference tests cover device-local default and selection behavior. Transient mobile eligibility tests cover outbox hydration and leaving before dispatch.

For `F29.C07`, `apps/web/src/fork/localVoiceInput.test.ts` executes local recognition admission, Electron fail-closed detection, the microphone swap, draft identity and transcript insertion without a composer host, providing owner-boundary and host-replacement evidence. `ComposerPrimaryActions.test.tsx` verifies the mechanical web host, while `voiceInputPresentation.test.ts` verifies the mobile presentation owner across content and unsupported states. `voiceTranscription.android.test.ts` proves installed-model admission, local-only live recognition and lifecycle cleanup. `DesktopWindow.test.ts` proves exact-origin audio permission handling for the shared desktop renderer.

The current message projection does not expose a final-versus-commentary phase. Playback uses the completed turn's selected assistant message, never streams interim updates. A provider that ends without a separate final message can therefore leave its last assistant message as the selected reply. Voice input introduces no environment or cloud transcription route, duplex audio, conversational turn detection, wake word or background recording. Platform recognition must fail closed when local processing is unavailable.

The pinned CPU service and activation boundary are documented in [Local Voice Service](../docs/operations/local-voice.md). Production activation and real-device listening are independent of source acceptance.
