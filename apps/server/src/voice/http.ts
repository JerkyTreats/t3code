import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import { Effect, FileSystem, Layer, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as HttpIncomingMessage from "effect/unstable/http/HttpIncomingMessage";
import * as HttpServerRespondable from "effect/unstable/http/HttpServerRespondable";
import { authenticateRawRouteWithScope } from "../http.ts";
import { createPocketTts, SpeechError, SpeechRequest } from "./PocketTts.ts";
const decodeSpeechRequest = Schema.decodeUnknownEffect(SpeechRequest);

export const makeVoiceRouteLayer = (tts: ReturnType<typeof createPocketTts>) => {
  const authErrors = {
    EnvironmentAuthInvalidError: HttpServerRespondable.toResponse,
    EnvironmentInternalError: HttpServerRespondable.toResponse,
    EnvironmentScopeRequiredError: HttpServerRespondable.toResponse,
  };
  return Layer.mergeAll(
    HttpRouter.add(
      "GET",
      "/api/voice/status",
      Effect.gen(function* () {
        yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
        return HttpServerResponse.jsonUnsafe(
          { available: tts.available },
          { headers: { "cache-control": "no-store" } },
        );
      }).pipe(Effect.catchTags(authErrors)),
    ),
    HttpRouter.add(
      "POST",
      "/api/voice/speech",
      Effect.gen(function* () {
        yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
        const request = yield* HttpServerRequest.HttpServerRequest;
        return yield* Effect.gen(function* () {
          const body = yield* request.json.pipe(
            Effect.provideService(HttpIncomingMessage.MaxBodySize, FileSystem.Size(80_000)),
          );
          const input = yield* decodeSpeechRequest(body);
          const audio = yield* Effect.tryPromise({
            try: (signal) => tts.synthesize(input.text, signal),
            catch: (error) => (error instanceof SpeechError ? error : new SpeechError(502)),
          });
          return HttpServerResponse.uint8Array(audio, {
            contentType: "audio/wav",
            headers: { "cache-control": "no-store" },
          });
        }).pipe(
          Effect.catch((error) =>
            Effect.succeed(
              HttpServerResponse.text("Speech synthesis unavailable.", {
                status: error instanceof SpeechError ? error.status : 400,
              }),
            ),
          ),
        );
      }).pipe(Effect.catchTags(authErrors)),
    ),
  );
};

export const voiceRouteLayer = Layer.unwrap(
  Effect.sync(() =>
    makeVoiceRouteLayer(
      createPocketTts({
        ...(process.env.T3CODE_TTS_URL ? { url: process.env.T3CODE_TTS_URL } : {}),
        ...(process.env.T3CODE_TTS_VOICE ? { voice: process.env.T3CODE_TTS_VOICE } : {}),
      }),
    ),
  ),
);
