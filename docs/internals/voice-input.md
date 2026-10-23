# Voice input

Transcription edits a composer draft. It does not submit an agent turn. Audio is
temporary client input, and only normal message submission sends the resulting
text. Supported iOS, Android, web and desktop clients transcribe on the device.
Environment-backed and cloud transcription are not implemented.

When a draft has no sendable content, a supported client places the microphone in
the primary action where disabled Send would otherwise appear. Send returns as soon
as the draft becomes sendable. Unsupported clients retain disabled Send rather than
offering a recognizer that might process speech remotely.

The [shared mobile controller](../../packages/client-runtime/src/voice-input/controller.ts)
owns the native operation while the client supplies capture and transcription. Preparation
binds the transcriber and resolved locale for the whole recording. Draft ownership,
text, and revision are captured before recording and checked before insertion, so
a late transcript cannot overwrite a draft that was edited or replaced.

Cancellation invalidates a result immediately, but resources stay owned until the
underlying work settles. Apple's native transcription call cannot be interrupted
once started. Releasing the session or deleting its recording when the abort signal
fires would race that work. The [transcription contract](../../packages/client-runtime/src/voice-input/transcription.ts)
therefore requires implementations to settle only after their work has stopped;
the [Apple binding](../../apps/mobile/src/native/voiceTranscription.ios.ts) checks
cancellation between native calls and discards late results.

Android uses the platform speech recognizer only with on-device recognition
required. Web and desktop use browser speech recognition only when local processing
and local language-pack admission are available. Neither adapter has a remote
fallback. The web owner and shared mobile controller each preserve draft identity
and explicit-submit behavior.
