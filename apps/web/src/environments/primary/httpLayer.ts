import { layerRemoteHttpClient } from "@t3tools/client-runtime/rpc";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { readDesktopPrimaryBearerToken } from "./desktopAuth";
import { isStandaloneDesktopPrimary, resolvePrimaryEnvironmentHttpUrl } from "./target";
import { makeThreadPrimaryFetch, readThreadPrimaryTarget } from "./threadTransport";

function isSameOriginBrowserPrimary(): boolean {
  if (
    typeof window === "undefined" ||
    (window.desktopBridge !== undefined && !isStandaloneDesktopPrimary()) ||
    !window.location.origin.startsWith("http")
  ) {
    return false;
  }

  return new URL(resolvePrimaryEnvironmentHttpUrl("/")).origin === window.location.origin;
}

function withPrimaryBearerToken(client: HttpClient.HttpClient): HttpClient.HttpClient {
  return client.pipe(
    HttpClient.mapRequestEffect((request) =>
      Effect.promise(readDesktopPrimaryBearerToken).pipe(
        Effect.map((bearerToken) =>
          bearerToken ? HttpClientRequest.bearerToken(request, bearerToken) : request,
        ),
      ),
    ),
  );
}

export function layerForCurrentOrigin() {
  return Layer.unwrap(
    Effect.sync(() => {
      const thread = readThreadPrimaryTarget();
      if (thread) {
        return layerRemoteHttpClient(
          makeThreadPrimaryFetch({
            applicationOrigin: new URL(thread.httpBaseUrl).origin,
            fetch: globalThis.fetch,
          }),
        ).pipe(
          Layer.provide(
            Layer.succeed(FetchHttpClient.RequestInit, {
              credentials: "omit",
              redirect: "error",
            }),
          ),
        );
      }
      const layerBase = layerRemoteHttpClient(globalThis.fetch);
      if (isSameOriginBrowserPrimary()) {
        return Layer.merge(
          layerBase,
          Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" }),
        );
      }

      const layerBearerClient = Layer.effect(
        HttpClient.HttpClient,
        Effect.map(HttpClient.HttpClient, withPrimaryBearerToken),
      ).pipe(Layer.provide(layerBase));

      return Layer.merge(
        layerBearerClient,
        Layer.succeed(FetchHttpClient.RequestInit, { credentials: "omit" }),
      );
    }),
  );
}

export const layer = layerForCurrentOrigin();
