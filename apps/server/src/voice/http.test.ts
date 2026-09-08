import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import { Context, Effect, Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { vi } from "vite-plus/test";
import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerConfig from "../config.ts";
import { createPocketTts } from "./PocketTts.ts";
import { makeVoiceRouteLayer } from "./http.ts";

it.live("authenticates speech routes before synthesis and validates scope and JSON", () =>
  Effect.gen(function* () {
    const auth = yield* EnvironmentAuth.EnvironmentAuth;
    const session = yield* auth.issueSession();
    const readOnly = yield* auth.issueSession({ scopes: [AuthOrchestrationReadScope] });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response("RIFF0000WAVEsynthetic", { headers: { "content-type": "audio/wav" } }),
      );
    const router = HttpRouter.toWebHandler(
      makeVoiceRouteLayer(createPocketTts({ url: "http://tts.example.test", fetch: fetcher })).pipe(
        Layer.provide(Layer.succeed(EnvironmentAuth.EnvironmentAuth, auth)),
      ),
      { disableLogger: true },
    );
    yield* Effect.addFinalizer(() => Effect.promise(() => router.dispose()));
    for (const [path, token, body, status] of [
      ["status", undefined, undefined, 401],
      ["speech", undefined, '{"text":"Hello"}', 401],
      ["speech", readOnly.token, '{"text":"Hello"}', 403],
      ["speech", session.token, '{"text":123}', 400],
      ["speech", session.token, '{"text":" "}', 400],
      ["speech", session.token, "invalid JSON", 400],
      ["speech", session.token, `{"text":"${"x".repeat(90_000)}"}`, 400],
      ["status", session.token, undefined, 200],
      ["speech", session.token, '{"text":"Hello"}', 200],
    ] as const) {
      const response = yield* Effect.promise(() =>
        router.handler(
          new Request(`http://service.example.test/api/voice/${path}`, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              ...(token ? { authorization: `Bearer ${token}` } : {}),
              "content-type": "application/json",
            },
            ...(body === undefined ? {} : { body }),
          }),
          Context.make(EnvironmentAuth.EnvironmentAuth, auth),
        ),
      );
      expect(response.status).toBe(status);
      if (status === 200) expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    const started = Promise.withResolvers<AbortSignal>();
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          const signal = options!.signal!;
          signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
          started.resolve(signal);
        }),
    );
    const controller = new AbortController();
    const pending = router.handler(
      new Request("http://service.example.test/api/voice/speech", {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
        body: '{"text":"Cancel this speech"}',
        signal: controller.signal,
      }),
      Context.make(EnvironmentAuth.EnvironmentAuth, auth),
    );
    const upstreamSignal = yield* Effect.promise(() => started.promise);
    controller.abort();
    yield* Effect.promise(() => pending);
    expect(upstreamSignal.aborted).toBe(true);
  }).pipe(
    Effect.provide(
      EnvironmentAuth.runtimeLayer.pipe(
        Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-voice-test-" })),
        Layer.provide(NodeServices.layer),
      ),
    ),
    Effect.scoped,
  ),
);
