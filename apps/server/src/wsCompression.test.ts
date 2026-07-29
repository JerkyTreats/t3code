import { NodeHttpServer, NodeSocket } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";

const payloads = [
  JSON.stringify({ sequence: 41, kind: "snapshot", body: "a".repeat(4096) }),
  JSON.stringify({ sequence: 42, kind: "event", body: "b".repeat(4096) }),
];

const websocketRoute = HttpRouter.add(
  "GET",
  "/ws-compression-test",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const socket = yield* request.upgrade;
    yield* socket.runRaw(() => undefined, {
      onOpen: Effect.scoped(
        Effect.gen(function* () {
          const write = yield* socket.writer;
          for (const payload of payloads) {
            yield* write(payload).pipe(Effect.orDie);
          }
        }),
      ),
    });
    return HttpServerResponse.empty();
  }),
).pipe(HttpRouter.serve);

const collect = (
  url: string,
  perMessageDeflate: boolean,
): Promise<{ readonly extensions: string; readonly messages: ReadonlyArray<string> }> =>
  new Promise((resolve, reject) => {
    const messages: Array<string> = [];
    const websocket = new NodeSocket.NodeWS.WebSocket(url, {
      perMessageDeflate,
    });
    websocket.on("message", (data) => {
      messages.push(data.toString());
      if (messages.length === payloads.length) {
        websocket.close(1000, "complete");
      }
    });
    websocket.on("error", reject);
    websocket.on("close", (code) => {
      if (code !== 1000) {
        reject(new Error(`unexpected close code ${code}`));
        return;
      }
      resolve({ extensions: websocket.extensions, messages });
    });
  });

describe("Effect platform WebSocket compression patch", () => {
  it.effect("negotiates compression optionally with identical decoded sequences", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(websocketRoute);
        const server = yield* HttpServer.HttpServer;
        if (server.address._tag !== "TcpAddress") {
          throw new Error("expected a TCP test server");
        }
        const url = `ws://127.0.0.1:${server.address.port}/ws-compression-test`;

        const compressed = yield* Effect.promise(() => collect(url, true));
        const identity = yield* Effect.promise(() => collect(url, false));

        expect(compressed.extensions).toContain("permessage-deflate");
        expect(identity.extensions).toBe("");
        expect(compressed.messages).toEqual(payloads);
        expect(identity.messages).toEqual(payloads);
        expect(compressed.messages).toEqual(identity.messages);
      }),
    ).pipe(Effect.provide(NodeHttpServer.layerTest)),
  );
});
