import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

import {
  acceptsGzip,
  appendVaryAcceptEncoding,
  compressSnapshotResponse,
  isSnapshotCompressionPath,
} from "./httpCompression.ts";

const makeRequest = (
  path: string,
  options?: {
    readonly method?: string;
    readonly acceptEncoding?: string;
  },
) =>
  HttpServerRequest.fromWeb(
    new Request(`http://localhost${path}`, {
      method: options?.method ?? "GET",
      headers:
        options?.acceptEncoding === undefined
          ? undefined
          : { "accept-encoding": options.acceptEncoding },
    }),
  );

const makeJsonResponse = (
  size: number,
  options?: {
    readonly status?: number;
    readonly contentType?: string;
    readonly headers?: Record<string, string>;
  },
) =>
  HttpServerResponse.uint8Array(new Uint8Array(size).fill(97), {
    status: options?.status ?? 200,
    contentType: options?.contentType ?? "application/json",
    headers: options?.headers,
  });

const transform = (
  request: HttpServerRequest.HttpServerRequest,
  response: HttpServerResponse.HttpServerResponse,
) => compressSnapshotResponse(request, response);

describe("snapshot HTTP compression", () => {
  it("matches only the exact snapshot surfaces", () => {
    expect(isSnapshotCompressionPath("/api/orchestration/snapshot")).toBe(true);
    expect(isSnapshotCompressionPath("/api/orchestration/shell")).toBe(true);
    expect(isSnapshotCompressionPath("/api/orchestration/threads/thread-1")).toBe(true);

    expect(isSnapshotCompressionPath("/api/orchestration/dispatch")).toBe(false);
    expect(isSnapshotCompressionPath("/api/orchestration/threads")).toBe(false);
    expect(isSnapshotCompressionPath("/api/orchestration/threads/a/events")).toBe(false);
    expect(isSnapshotCompressionPath("/api/orchestration/snapshot/extra")).toBe(false);
  });

  it("honors explicit gzip quality and wildcard negotiation", () => {
    expect(acceptsGzip(undefined)).toBe(false);
    expect(acceptsGzip("br")).toBe(false);
    expect(acceptsGzip("gzip")).toBe(true);
    expect(acceptsGzip("GZip; q=0.5")).toBe(true);
    expect(acceptsGzip("gzip;q=0, *;q=1")).toBe(false);
    expect(acceptsGzip("*;q=0.5")).toBe(true);
    expect(acceptsGzip("*;q=0")).toBe(false);
    expect(acceptsGzip("gzip;q=wat, *;q=1")).toBe(false);
  });

  it("preserves and case-insensitively deduplicates vary tokens", () => {
    expect(appendVaryAcceptEncoding(undefined)).toBe("Accept-Encoding");
    expect(appendVaryAcceptEncoding("Origin")).toBe("Origin, Accept-Encoding");
    expect(appendVaryAcceptEncoding("Origin, origin, ACCEPT-ENCODING")).toBe(
      "Origin, ACCEPT-ENCODING",
    );
  });

  it.effect("leaves 1023 byte bodies uncompressed and varies the response", () =>
    Effect.gen(function* () {
      const response = makeJsonResponse(1023);
      const result = yield* transform(
        makeRequest("/api/orchestration/snapshot", { acceptEncoding: "gzip" }),
        response,
      );

      expect(result.headers["content-encoding"]).toBeUndefined();
      expect(result.headers.vary).toBe("Accept-Encoding");
      expect(result.body).toBe(response.body);
    }),
  );

  it.effect("compresses 1024 byte bodies with byte-identical decoded content", () =>
    Effect.gen(function* () {
      const response = makeJsonResponse(1024);
      const result = yield* transform(
        makeRequest("/api/orchestration/threads/thread-1?view=full", {
          acceptEncoding: "gzip",
        }),
        response,
      );

      expect(result.headers["content-encoding"]).toBe("gzip");
      expect(result.headers.vary).toBe("Accept-Encoding");
      expect(result.body._tag).toBe("Uint8Array");
      if (result.body._tag !== "Uint8Array" || response.body._tag !== "Uint8Array") {
        throw new Error("expected byte array response");
      }
      expect(new Uint8Array(gunzipSync(result.body.body))).toEqual(response.body.body);
      expect(result.headers["content-length"]).toBe(String(result.body.body.length));
    }),
  );

  it.effect("varies declined eligible responses without compressing them", () =>
    Effect.gen(function* () {
      const response = makeJsonResponse(2048, {
        headers: { vary: "Origin, origin, ACCEPT-ENCODING" },
      });
      const result = yield* transform(
        makeRequest("/api/orchestration/shell", { acceptEncoding: "br" }),
        response,
      );

      expect(result.headers["content-encoding"]).toBeUndefined();
      expect(result.headers.vary).toBe("Origin, ACCEPT-ENCODING");
      expect(result.body).toBe(response.body);
    }),
  );

  it.effect("skips ineligible methods, statuses, content, paths, and encoded bodies", () =>
    Effect.gen(function* () {
      const cases = [
        {
          request: makeRequest("/api/orchestration/snapshot", {
            method: "POST",
            acceptEncoding: "gzip",
          }),
          response: makeJsonResponse(2048),
        },
        {
          request: makeRequest("/api/orchestration/snapshot", {
            acceptEncoding: "gzip",
          }),
          response: makeJsonResponse(2048, { status: 401 }),
        },
        {
          request: makeRequest("/api/orchestration/snapshot", {
            acceptEncoding: "gzip",
          }),
          response: makeJsonResponse(2048, { contentType: "text/plain" }),
        },
        {
          request: makeRequest("/api/orchestration/dispatch", {
            acceptEncoding: "gzip",
          }),
          response: makeJsonResponse(2048),
        },
        {
          request: makeRequest("/assets/snapshot.json", {
            acceptEncoding: "gzip",
          }),
          response: makeJsonResponse(2048),
        },
        {
          request: makeRequest("/api/orchestration/snapshot", {
            acceptEncoding: "gzip",
          }),
          response: makeJsonResponse(2048, {
            headers: { "content-encoding": "br", vary: "Origin" },
          }),
        },
      ];

      for (const entry of cases) {
        const result = yield* transform(entry.request, entry.response);
        expect(result).toBe(entry.response);
      }
    }),
  );
});
