import { constants, gzip } from "node:zlib";

import * as Effect from "effect/Effect";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";

export const SNAPSHOT_COMPRESSION_THRESHOLD_BYTES = 1024;

const THREAD_SNAPSHOT_PATH = /^\/api\/orchestration\/threads\/[^/]+$/;
const FIXED_SNAPSHOT_PATHS = new Set(["/api/orchestration/snapshot", "/api/orchestration/shell"]);

function requestPath(request: HttpServerRequest.HttpServerRequest): string {
  try {
    return new URL(request.originalUrl, "http://localhost").pathname;
  } catch {
    return "";
  }
}

export function isSnapshotCompressionPath(path: string): boolean {
  return FIXED_SNAPSHOT_PATHS.has(path) || THREAD_SNAPSHOT_PATH.test(path);
}

function parseQuality(parameters: ReadonlyArray<string>): number {
  const qualityParameter = parameters.find((parameter) => {
    const separator = parameter.indexOf("=");
    return separator !== -1 && parameter.slice(0, separator).trim().toLowerCase() === "q";
  });
  if (qualityParameter === undefined) {
    return 1;
  }

  const separator = qualityParameter.indexOf("=");
  const quality = Number(qualityParameter.slice(separator + 1).trim());
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
}

export function acceptsGzip(acceptEncoding: string | undefined): boolean {
  if (acceptEncoding === undefined) {
    return false;
  }

  let wildcardQuality: number | undefined;
  let gzipQuality: number | undefined;
  for (const entry of acceptEncoding.split(",")) {
    const [rawEncoding, ...parameters] = entry.split(";");
    const encoding = rawEncoding?.trim().toLowerCase();
    if (encoding === "gzip") {
      const quality = parseQuality(parameters);
      if (quality === 0) {
        return false;
      }
      gzipQuality = Math.max(gzipQuality ?? 0, quality);
    } else if (encoding === "*") {
      wildcardQuality = Math.max(wildcardQuality ?? 0, parseQuality(parameters));
    }
  }

  if (gzipQuality !== undefined) {
    return gzipQuality > 0;
  }
  return (wildcardQuality ?? 0) > 0;
}

export function appendVaryAcceptEncoding(vary: string | undefined): string {
  const tokens: Array<string> = [];
  const seen = new Set<string>();
  for (const token of vary?.split(",") ?? []) {
    const trimmed = token.trim();
    const normalized = trimmed.toLowerCase();
    if (trimmed !== "" && !seen.has(normalized)) {
      tokens.push(trimmed);
      seen.add(normalized);
    }
  }
  if (!seen.has("accept-encoding")) {
    tokens.push("Accept-Encoding");
  }
  return tokens.join(", ");
}

function isJsonContentType(contentType: string | undefined): boolean {
  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function gzipAsync(body: Uint8Array): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    gzip(body, { level: constants.Z_BEST_SPEED }, (error, compressed) => {
      if (error) {
        reject(error);
      } else {
        resolve(compressed);
      }
    });
  });
}

export function compressSnapshotResponse(
  request: HttpServerRequest.HttpServerRequest,
  response: HttpServerResponse.HttpServerResponse,
): Effect.Effect<HttpServerResponse.HttpServerResponse> {
  const body = response.body;
  if (
    request.method !== "GET" ||
    response.status !== 200 ||
    !isSnapshotCompressionPath(requestPath(request)) ||
    body._tag !== "Uint8Array" ||
    !isJsonContentType(body.contentType) ||
    response.headers["content-encoding"] !== undefined
  ) {
    return Effect.succeed(response);
  }

  const variedResponse = HttpServerResponse.setHeader(
    response,
    "vary",
    appendVaryAcceptEncoding(response.headers.vary),
  );
  if (
    body.contentLength < SNAPSHOT_COMPRESSION_THRESHOLD_BYTES ||
    !acceptsGzip(request.headers["accept-encoding"])
  ) {
    return Effect.succeed(variedResponse);
  }

  return Effect.tryPromise(() => gzipAsync(body.body)).pipe(
    Effect.map((compressedBody) =>
      HttpServerResponse.setHeader(
        HttpServerResponse.setBody(
          variedResponse,
          HttpBody.uint8Array(compressedBody, body.contentType),
        ),
        "content-encoding",
        "gzip",
      ),
    ),
    Effect.orElseSucceed(() => variedResponse),
  );
}

export const snapshotCompressionMiddleware = HttpMiddleware.make((httpEffect) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const response = yield* httpEffect;
    return yield* compressSnapshotResponse(request, response);
  }),
);

export const snapshotCompressionMiddlewareLayer = HttpRouter.middleware(
  snapshotCompressionMiddleware,
).layer;
