import type {
  AuthBootstrapInput,
  AuthBootstrapResult,
  AuthSessionState,
  AuthWebSocketTokenResult,
  DesktopEnvironmentBootstrap,
} from "@t3tools/contracts";
import { Data, Predicate } from "effect";
import { create } from "zustand";

export type ServerAuthGateState =
  | { status: "booting" }
  | { status: "authenticated" }
  | {
      status: "unavailable";
      errorMessage: string;
    }
  | {
      status: "requires-auth";
      auth: AuthSessionState["auth"];
      errorMessage?: string;
    };

export interface ServerAuthDiagnosticEvent {
  readonly id: number;
  readonly at: string;
  readonly level: "info" | "success" | "warning" | "error";
  readonly message: string;
  readonly detail?: string;
}

interface ServerAuthGateStoreState {
  readonly diagnostics: ReadonlyArray<ServerAuthDiagnosticEvent>;
  readonly state: ServerAuthGateState;
  readonly appendDiagnostic: (
    event: Omit<ServerAuthDiagnosticEvent, "id" | "at"> & {
      readonly at?: string;
    },
  ) => void;
  readonly clearDiagnostics: () => void;
  readonly setState: (state: ServerAuthGateState) => void;
}

let nextDiagnosticId = 1;
const MAX_DIAGNOSTIC_EVENTS = 80;

const useServerAuthGateStore = create<ServerAuthGateStoreState>()((set) => ({
  appendDiagnostic: (event) =>
    set((state) => ({
      diagnostics: [
        ...state.diagnostics,
        {
          ...event,
          at: event.at ?? new Date().toISOString(),
          id: nextDiagnosticId++,
        },
      ].slice(-MAX_DIAGNOSTIC_EVENTS),
    })),
  clearDiagnostics: () => set({ diagnostics: [] }),
  diagnostics: [],
  state: { status: "booting" },
  setState: (state) => set({ state }),
}));

let bootstrapPromise: Promise<ServerAuthGateState> | null = null;
let desktopBearerSessionToken: string | null = null;
let desktopWebSocketToken: string | null = null;

const TRANSIENT_BOOTSTRAP_STATUS_CODES = new Set([502, 503, 504]);
const BOOTSTRAP_RETRY_TIMEOUT_MS = 15_000;
const BOOTSTRAP_RETRY_STEP_MS = 500;
const BOOTSTRAP_REQUEST_TIMEOUT_MS = 10_000;
const AUTH_SESSION_ESTABLISH_TIMEOUT_MS = 2_000;
const AUTH_SESSION_ESTABLISH_STEP_MS = 100;
const PAIRING_TOKEN_PARAM = "token";

function setServerAuthGateState(state: ServerAuthGateState): ServerAuthGateState {
  useServerAuthGateStore.getState().setState(state);
  return state;
}

function appendAuthDiagnostic(
  event: Omit<ServerAuthDiagnosticEvent, "id" | "at"> & {
    readonly at?: string;
  },
) {
  useServerAuthGateStore.getState().appendDiagnostic(event);
}

function peekDesktopEnvironmentBootstrap(): DesktopEnvironmentBootstrap | null {
  try {
    return window.desktopBridge?.getLocalEnvironmentBootstrap?.() ?? null;
  } catch {
    return null;
  }
}

function getDesktopEnvironmentBootstrap(): DesktopEnvironmentBootstrap | null {
  try {
    return window.desktopBridge?.getLocalEnvironmentBootstrap?.() ?? null;
  } catch (error) {
    appendAuthDiagnostic({
      level: "error",
      message: "Desktop bridge bootstrap lookup failed.",
      detail: errorMessageFromUnknown(error),
    });
    return null;
  }
}

export interface AuthBootstrapEnvironmentSnapshot {
  readonly resolvedHttpBaseUrl: string;
  readonly authSessionUrl: string;
  readonly wsBaseUrl: string | null;
  readonly pageOrigin: string;
  readonly pageHref: string;
  readonly desktopLabel: string | null;
  readonly desktopBridgePresent: boolean;
  readonly desktopBootstrapCredentialPresent: boolean;
  readonly desktopSessionTokenPresent: boolean;
}

export function readAuthBootstrapEnvironmentSnapshot(): AuthBootstrapEnvironmentSnapshot {
  const bridgePresent = Boolean(window.desktopBridge);
  const bootstrap = peekDesktopEnvironmentBootstrap();
  const resolvedHttpBaseUrl = resolveServerHttpBaseUrl(bootstrap);
  const sessionUrl = new URL(resolvedHttpBaseUrl);
  sessionUrl.pathname = "/api/auth/session";
  sessionUrl.search = "";
  sessionUrl.hash = "";

  const wsBaseUrl =
    (typeof bootstrap?.wsBaseUrl === "string" && bootstrap.wsBaseUrl.length > 0
      ? bootstrap.wsBaseUrl
      : null) ??
    (typeof window.desktopBridge?.getWsUrl === "function" ? window.desktopBridge.getWsUrl() : null);

  return {
    resolvedHttpBaseUrl,
    authSessionUrl: sessionUrl.toString(),
    wsBaseUrl,
    pageOrigin: window.location.origin,
    pageHref: window.location.href,
    desktopLabel: typeof bootstrap?.label === "string" ? bootstrap.label : null,
    desktopBridgePresent: bridgePresent,
    desktopBootstrapCredentialPresent: Boolean(
      bootstrap &&
      typeof bootstrap.bootstrapToken === "string" &&
      bootstrap.bootstrapToken.length > 0,
    ),
    desktopSessionTokenPresent: Boolean(
      bootstrap && typeof bootstrap.sessionToken === "string" && bootstrap.sessionToken.length > 0,
    ),
  };
}

function normalizeBaseUrl(rawValue: string): string {
  return new URL(rawValue, window.location.origin).toString();
}

function swapBaseUrlProtocol(
  rawValue: string,
  nextProtocol: "http:" | "https:" | "ws:" | "wss:",
): string {
  const url = new URL(normalizeBaseUrl(rawValue));
  url.protocol = nextProtocol;
  return url.toString();
}

function resolveServerHttpBaseUrl(desktopBootstrap?: DesktopEnvironmentBootstrap | null): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const resolvedBootstrap =
    desktopBootstrap === undefined ? getDesktopEnvironmentBootstrap() : desktopBootstrap;
  if (resolvedBootstrap?.httpBaseUrl) {
    return normalizeBaseUrl(resolvedBootstrap.httpBaseUrl);
  }

  const configuredHttpBaseUrl = env.VITE_HTTP_URL?.trim() || undefined;
  if (configuredHttpBaseUrl) {
    return normalizeBaseUrl(configuredHttpBaseUrl);
  }

  const configuredWsBaseUrl = env.VITE_WS_URL?.trim() || undefined;
  if (configuredWsBaseUrl) {
    return configuredWsBaseUrl.startsWith("wss:")
      ? swapBaseUrlProtocol(configuredWsBaseUrl, "https:")
      : swapBaseUrlProtocol(configuredWsBaseUrl, "http:");
  }

  const bridgeWsUrl = window.desktopBridge?.getWsUrl?.();
  if (bridgeWsUrl) {
    return bridgeWsUrl.startsWith("wss:")
      ? swapBaseUrlProtocol(bridgeWsUrl, "https:")
      : swapBaseUrlProtocol(bridgeWsUrl, "http:");
  }

  return normalizeBaseUrl(window.location.origin);
}

function resolveServerHttpUrl(pathname: string): string {
  const url = new URL(resolveServerHttpBaseUrl());
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function readHashParams(url: URL): URLSearchParams {
  return new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
}

export function peekPairingTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const hashToken = readHashParams(url).get(PAIRING_TOKEN_PARAM)?.trim() ?? "";
  if (hashToken.length > 0) {
    return hashToken;
  }

  const searchToken = url.searchParams.get(PAIRING_TOKEN_PARAM)?.trim() ?? "";
  return searchToken.length > 0 ? searchToken : null;
}

export function stripPairingTokenFromUrl() {
  const currentUrl = new URL(window.location.href);
  const nextUrl = new URL(currentUrl.toString());
  const hashParams = readHashParams(nextUrl);
  if (hashParams.has(PAIRING_TOKEN_PARAM)) {
    hashParams.delete(PAIRING_TOKEN_PARAM);
    nextUrl.hash = hashParams.toString();
  }
  nextUrl.searchParams.delete(PAIRING_TOKEN_PARAM);

  if (nextUrl.toString() !== currentUrl.toString()) {
    window.history.replaceState({}, document.title, nextUrl.toString());
  }
}

function getDesktopBootstrapCredential(): string | null {
  const bootstrap = getDesktopEnvironmentBootstrap();
  updateDesktopBearerSessionTokenFromBootstrap(bootstrap);
  const credential =
    typeof bootstrap?.bootstrapToken === "string" && bootstrap.bootstrapToken.length > 0
      ? bootstrap.bootstrapToken
      : null;
  appendAuthDiagnostic({
    level: credential ? "success" : "warning",
    message: credential
      ? "Desktop bootstrap credential is available."
      : "Desktop bootstrap credential is not available.",
    detail: desktopBootstrapDetail(bootstrap),
  });
  return credential;
}

function getDesktopBearerSessionToken(): string | null {
  const bootstrap = getDesktopEnvironmentBootstrap();
  updateDesktopBearerSessionTokenFromBootstrap(bootstrap);
  return desktopBearerSessionToken;
}

function updateDesktopBearerSessionTokenFromBootstrap(
  bootstrap: DesktopEnvironmentBootstrap | null,
): void {
  const token =
    typeof bootstrap?.sessionToken === "string" && bootstrap.sessionToken.length > 0
      ? bootstrap.sessionToken
      : null;
  desktopBearerSessionToken = token;
}

export function getDesktopWebSocketToken(): string | null {
  return desktopWebSocketToken;
}

async function waitFor(delayMs: number): Promise<void> {
  return await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchWithBootstrapTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, BOOTSTRAP_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: init?.signal ?? controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export class BootstrapHttpError extends Data.TaggedError("BootstrapHttpError")<{
  readonly message: string;
  readonly status: number;
}> {}

const isBootstrapHttpError = (u: unknown): u is BootstrapHttpError =>
  Predicate.isTagged(u, "BootstrapHttpError");

function isTransientBootstrapError(error: unknown): boolean {
  if (isBootstrapHttpError(error)) {
    return TRANSIENT_BOOTSTRAP_STATUS_CODES.has(error.status);
  }

  if (error instanceof TypeError) {
    return true;
  }

  return error instanceof DOMException && error.name === "AbortError";
}

async function retryTransientBootstrap<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  let retryCount = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientBootstrapError(error)) {
        throw error;
      }

      if (Date.now() - startedAt >= BOOTSTRAP_RETRY_TIMEOUT_MS) {
        throw error;
      }

      retryCount += 1;
      appendAuthDiagnostic({
        level: "warning",
        message: `Transient auth bootstrap failure. Retrying attempt ${retryCount}.`,
        detail: errorMessageFromUnknown(error),
      });
      await waitFor(BOOTSTRAP_RETRY_STEP_MS);
    }
  }
}

export async function fetchSessionState(): Promise<AuthSessionState> {
  return retryTransientBootstrap(async () => {
    const sessionUrl = resolveServerHttpUrl("/api/auth/session");
    const bearerToken = getDesktopBearerSessionToken();
    appendAuthDiagnostic({
      level: "info",
      message: "Checking local auth session.",
      detail: `${sessionUrl} bearer=${bearerToken ? "present" : "missing"}`,
    });
    const response = await fetchWithBootstrapTimeout(sessionUrl, {
      credentials: "include",
      ...(bearerToken ? { headers: { authorization: `Bearer ${bearerToken}` } } : {}),
    }).catch((error: unknown) => {
      appendAuthDiagnostic({
        level: "error",
        message: "Auth session fetch failed before receiving a response.",
        detail: `${sessionUrl} ${errorMessageFromUnknown(error)}`,
      });
      throw error;
    });
    appendAuthDiagnostic({
      level: response.ok ? "success" : "error",
      message: `Auth session endpoint returned ${response.status}.`,
    });
    if (!response.ok) {
      throw new BootstrapHttpError({
        message: `Failed to load server auth session state ${response.status}.`,
        status: response.status,
      });
    }
    const session = (await response.json()) as AuthSessionState;
    const sessionDetail = session.authenticated
      ? session.sessionMethod
      : `${session.auth.policy} using ${session.auth.bootstrapMethods.join(", ")}`;
    appendAuthDiagnostic({
      level: session.authenticated ? "success" : "info",
      message: session.authenticated
        ? "Existing browser session is authenticated."
        : "Server requires pairing before app connection.",
      ...(sessionDetail ? { detail: sessionDetail } : {}),
    });
    return session;
  });
}

async function issueDesktopWebSocketToken(): Promise<void> {
  const bearerToken = getDesktopBearerSessionToken();
  if (!bearerToken) {
    desktopWebSocketToken = null;
    return;
  }

  const tokenUrl = resolveServerHttpUrl("/api/auth/ws-token");
  appendAuthDiagnostic({
    level: "info",
    message: "Requesting desktop WebSocket token.",
    detail: tokenUrl,
  });
  const response = await fetchWithBootstrapTimeout(tokenUrl, {
    headers: {
      authorization: `Bearer ${bearerToken}`,
    },
    method: "POST",
  }).catch((error: unknown) => {
    appendAuthDiagnostic({
      level: "error",
      message: "Desktop WebSocket token fetch failed before receiving a response.",
      detail: `${tokenUrl} ${errorMessageFromUnknown(error)}`,
    });
    throw error;
  });
  appendAuthDiagnostic({
    level: response.ok ? "success" : "error",
    message: `Desktop WebSocket token endpoint returned ${response.status}.`,
  });

  if (!response.ok) {
    throw new BootstrapHttpError({
      message: `Failed to issue desktop WebSocket token ${response.status}.`,
      status: response.status,
    });
  }

  const result = (await response.json()) as AuthWebSocketTokenResult;
  desktopWebSocketToken = result.token;
}

async function exchangeBootstrapCredential(credential: string): Promise<AuthBootstrapResult> {
  return retryTransientBootstrap(async () => {
    const payload: AuthBootstrapInput = { credential };
    const bootstrapUrl = resolveServerHttpUrl("/api/auth/bootstrap");
    appendAuthDiagnostic({
      level: "info",
      message: "Submitting bootstrap credential.",
      detail: bootstrapUrl,
    });
    const response = await fetchWithBootstrapTimeout(bootstrapUrl, {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    }).catch((error: unknown) => {
      appendAuthDiagnostic({
        level: "error",
        message: "Bootstrap credential fetch failed before receiving a response.",
        detail: `${bootstrapUrl} ${errorMessageFromUnknown(error)}`,
      });
      throw error;
    });
    appendAuthDiagnostic({
      level: response.ok ? "success" : "error",
      message: `Bootstrap credential endpoint returned ${response.status}.`,
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BootstrapHttpError({
        message: message || `Failed to bootstrap auth session ${response.status}.`,
        status: response.status,
      });
    }

    return (await response.json()) as AuthBootstrapResult;
  });
}

async function waitForAuthenticatedSessionAfterBootstrap(): Promise<AuthSessionState> {
  const startedAt = Date.now();
  appendAuthDiagnostic({
    level: "info",
    message: "Waiting for authenticated browser session cookie.",
  });

  while (true) {
    const session = await fetchSessionState();
    if (session.authenticated) {
      appendAuthDiagnostic({
        level: "success",
        message: "Authenticated browser session is ready.",
      });
      return session;
    }

    if (Date.now() - startedAt >= AUTH_SESSION_ESTABLISH_TIMEOUT_MS) {
      throw new Error("Timed out waiting for authenticated session after bootstrap.");
    }

    await waitFor(AUTH_SESSION_ESTABLISH_STEP_MS);
  }
}

async function bootstrapServerAuth(): Promise<ServerAuthGateState> {
  appendAuthDiagnostic({
    level: "info",
    message: "Starting server auth bootstrap.",
    detail: environmentDiagnosticDetail(),
  });
  const currentSession = await fetchSessionState();
  if (currentSession.authenticated) {
    await issueDesktopWebSocketToken();
    appendAuthDiagnostic({
      level: "success",
      message: "Auth bootstrap finished with existing session.",
    });
    return setServerAuthGateState({ status: "authenticated" });
  }

  const bootstrapCredential = getDesktopBootstrapCredential();
  if (!bootstrapCredential) {
    appendAuthDiagnostic({
      level: "warning",
      message: "No trusted desktop credential found. Showing manual pairing.",
    });
    return setServerAuthGateState({
      status: "requires-auth",
      auth: currentSession.auth,
    });
  }

  try {
    await exchangeBootstrapCredential(bootstrapCredential);
    await waitForAuthenticatedSessionAfterBootstrap();
    await issueDesktopWebSocketToken();
    appendAuthDiagnostic({
      level: "success",
      message: "Auth bootstrap finished with desktop credential.",
    });
    return setServerAuthGateState({ status: "authenticated" });
  } catch (error) {
    appendAuthDiagnostic({
      level: "error",
      message: "Desktop credential bootstrap failed.",
      detail: errorMessageFromUnknown(error),
    });
    return setServerAuthGateState({
      status: "requires-auth",
      auth: currentSession.auth,
      errorMessage: error instanceof Error ? error.message : "Authentication failed.",
    });
  }
}

export function useServerAuthGateState(): ServerAuthGateState {
  return useServerAuthGateStore((state) => state.state);
}

export function useServerAuthDiagnostics(): ReadonlyArray<ServerAuthDiagnosticEvent> {
  return useServerAuthGateStore((state) => state.diagnostics);
}

function readServerAuthGateState(): ServerAuthGateState {
  return useServerAuthGateStore.getState().state;
}

export async function startServerAuthGateBootstrap(): Promise<ServerAuthGateState> {
  const currentState = readServerAuthGateState();
  if (currentState.status !== "booting" && bootstrapPromise === null) {
    return currentState;
  }

  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  const nextPromise = bootstrapServerAuth().catch((error: unknown) =>
    setServerAuthGateState({
      status: "unavailable",
      errorMessage:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unable to contact the T3 Code server.",
    }),
  );
  bootstrapPromise = nextPromise.finally(() => {
    if (bootstrapPromise === nextPromise) {
      bootstrapPromise = null;
    }
  });
  return bootstrapPromise;
}

export async function refreshServerAuthGateState(): Promise<ServerAuthGateState> {
  setServerAuthGateState({ status: "booting" });
  useServerAuthGateStore.getState().clearDiagnostics();
  bootstrapPromise = null;
  return await startServerAuthGateBootstrap();
}

export async function submitServerAuthCredential(credential: string): Promise<void> {
  const trimmedCredential = credential.trim();
  if (!trimmedCredential) {
    throw new Error("Enter a pairing token to continue.");
  }

  appendAuthDiagnostic({
    level: "info",
    message: "Submitting manually entered pairing credential.",
  });
  await exchangeBootstrapCredential(trimmedCredential);
  await waitForAuthenticatedSessionAfterBootstrap();
  stripPairingTokenFromUrl();
  appendAuthDiagnostic({
    level: "success",
    message: "Manual pairing succeeded.",
  });
  setServerAuthGateState({ status: "authenticated" });
}

export function __resetServerAuthGateBootstrapForTests() {
  bootstrapPromise = null;
  desktopBearerSessionToken = null;
  desktopWebSocketToken = null;
  useServerAuthGateStore.getState().clearDiagnostics();
  setServerAuthGateState({ status: "booting" });
}

export function __readServerAuthGateStateForTests(): ServerAuthGateState {
  return readServerAuthGateState();
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Unknown error.";
}

function desktopBootstrapDetail(bootstrap: DesktopEnvironmentBootstrap | null): string {
  if (!bootstrap) {
    return `bridge=${String(Boolean(window.desktopBridge))}`;
  }

  const parts = [
    `label=${bootstrap.label ?? "none"}`,
    `http=${bootstrap.httpBaseUrl ?? "none"}`,
    `ws=${bootstrap.wsBaseUrl ?? "none"}`,
    `credential=${bootstrap.bootstrapToken ? "present" : "missing"}`,
    `session=${bootstrap.sessionToken ? "present" : "missing"}`,
  ];
  return parts.join(" ");
}

function environmentDiagnosticDetail(): string {
  const bridge = window.desktopBridge;
  const parts = [
    `location=${window.location.href}`,
    `origin=${window.location.origin}`,
    `desktopBridge=${bridge ? "present" : "missing"}`,
    `getLocalEnvironmentBootstrap=${
      typeof bridge?.getLocalEnvironmentBootstrap === "function" ? "present" : "missing"
    }`,
    `getWsUrl=${typeof bridge?.getWsUrl === "function" ? "present" : "missing"}`,
  ];
  return parts.join(" ");
}
