import * as Schema from "effect/Schema";

export class ThreadPrimaryTransportError extends Schema.TaggedErrorClass<ThreadPrimaryTransportError>()(
  "ThreadPrimaryTransportError",
  {},
) {
  override get message(): string {
    return "The protected Thread connection must remain on its enrolled HTTPS origin.";
  }
}

export interface ThreadPrimaryTarget {
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

function exactHttpsOrigin(value: string): URL {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.origin === value && !url.username && !url.password) {
      return url;
    }
  } catch {
    // Invalid input has the same bounded failure as an origin mismatch.
  }
  throw new ThreadPrimaryTransportError();
}

export function resolveThreadPrimaryTarget(input: {
  readonly threadBridgePresent: boolean;
  readonly windowOrigin: string;
}): ThreadPrimaryTarget | null {
  if (!input.threadBridgePresent) return null;
  const url = exactHttpsOrigin(input.windowOrigin);
  const httpBaseUrl = url.href;
  url.protocol = "wss:";
  return { httpBaseUrl, wsBaseUrl: url.href };
}

export function readThreadPrimaryTarget(): ThreadPrimaryTarget | null {
  // The shell rejects foreign main-frame navigation and redirects before loading this document.
  if (typeof window === "undefined" || window.t3ThreadBridge === undefined) return null;
  return resolveThreadPrimaryTarget({
    threadBridgePresent: true,
    windowOrigin: window.location?.origin ?? "",
  });
}

export function assertThreadPrimaryTarget(
  input: ThreadPrimaryTarget & {
    readonly applicationOrigin: string;
  },
): void {
  const expected = resolveThreadPrimaryTarget({
    threadBridgePresent: true,
    windowOrigin: input.applicationOrigin,
  })!;
  try {
    const http = new URL(input.httpBaseUrl);
    const ws = new URL(input.wsBaseUrl);
    if (
      http.href === expected.httpBaseUrl &&
      (ws.href === expected.wsBaseUrl || ws.href === new URL("/ws", expected.wsBaseUrl).href)
    ) {
      return;
    }
  } catch {
    // Treat malformed target assertions as an origin mismatch.
  }
  throw new ThreadPrimaryTransportError();
}

export function makeThreadPrimaryFetch(input: {
  readonly applicationOrigin: string;
  readonly fetch: typeof globalThis.fetch;
}): typeof globalThis.fetch {
  const origin = exactHttpsOrigin(input.applicationOrigin).origin;
  // Invoke browser fetch without binding its receiver to the adapter options.
  const fetch = input.fetch;
  return async (request, init) => {
    const url = new URL(request instanceof Request ? request.url : request.toString());
    const headers = new Headers(
      init?.headers ?? (request instanceof Request ? request.headers : undefined),
    );
    if (url.origin !== origin || url.username || url.password || headers.has("authorization")) {
      throw new ThreadPrimaryTransportError();
    }
    // Main injects its credential after this renderer boundary. Never follow a redirect with it.
    const response = await fetch(request, {
      ...init,
      credentials: "omit",
      redirect: "error",
    });
    if (response.redirected || response.url !== url.href) {
      throw new ThreadPrimaryTransportError();
    }
    return response;
  };
}
