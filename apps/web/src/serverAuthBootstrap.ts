import type {
  AuthBootstrapInput,
  AuthBootstrapResult,
  AuthSessionState,
  DesktopEnvironmentBootstrap,
} from "@t3tools/contracts";
import { create } from "zustand";

export type ServerAuthGateState =
  | { status: "booting" }
  | { status: "authenticated" }
  | {
      status: "requires-auth";
      auth: AuthSessionState["auth"];
      errorMessage?: string;
    };

interface ServerAuthGateStoreState {
  readonly state: ServerAuthGateState;
  readonly setState: (state: ServerAuthGateState) => void;
}

const useServerAuthGateStore = create<ServerAuthGateStoreState>()((set) => ({
  state: { status: "booting" },
  setState: (state) => set({ state }),
}));

let bootstrapPromise: Promise<ServerAuthGateState> | null = null;

const TRANSIENT_BOOTSTRAP_STATUS_CODES = new Set([502, 503, 504]);
const BOOTSTRAP_RETRY_TIMEOUT_MS = 15_000;
const BOOTSTRAP_RETRY_STEP_MS = 500;
const AUTH_SESSION_ESTABLISH_TIMEOUT_MS = 2_000;
const AUTH_SESSION_ESTABLISH_STEP_MS = 100;
const PAIRING_TOKEN_PARAM = "token";

function setServerAuthGateState(state: ServerAuthGateState): ServerAuthGateState {
  useServerAuthGateStore.getState().setState(state);
  return state;
}

function getDesktopEnvironmentBootstrap(): DesktopEnvironmentBootstrap | null {
  return window.desktopBridge?.getLocalEnvironmentBootstrap?.() ?? null;
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

function resolveServerHttpBaseUrl(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const desktopBootstrap = getDesktopEnvironmentBootstrap();
  if (desktopBootstrap?.httpBaseUrl) {
    return normalizeBaseUrl(desktopBootstrap.httpBaseUrl);
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
  return typeof bootstrap?.bootstrapToken === "string" && bootstrap.bootstrapToken.length > 0
    ? bootstrap.bootstrapToken
    : null;
}

async function waitFor(delayMs: number): Promise<void> {
  return await new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export class BootstrapHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BootstrapHttpError";
    this.status = status;
  }
}

function isTransientBootstrapError(error: unknown): boolean {
  if (error instanceof BootstrapHttpError) {
    return TRANSIENT_BOOTSTRAP_STATUS_CODES.has(error.status);
  }

  if (error instanceof TypeError) {
    return true;
  }

  return error instanceof DOMException && error.name === "AbortError";
}

async function retryTransientBootstrap<T>(operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
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

      await waitFor(BOOTSTRAP_RETRY_STEP_MS);
    }
  }
}

export async function fetchSessionState(): Promise<AuthSessionState> {
  return retryTransientBootstrap(async () => {
    const response = await fetch(resolveServerHttpUrl("/api/auth/session"), {
      credentials: "include",
    });
    if (!response.ok) {
      throw new BootstrapHttpError(
        `Failed to load server auth session state ${response.status}.`,
        response.status,
      );
    }
    return (await response.json()) as AuthSessionState;
  });
}

async function exchangeBootstrapCredential(credential: string): Promise<AuthBootstrapResult> {
  return retryTransientBootstrap(async () => {
    const payload: AuthBootstrapInput = { credential };
    const response = await fetch(resolveServerHttpUrl("/api/auth/bootstrap"), {
      body: JSON.stringify(payload),
      credentials: "include",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      const message = await response.text();
      throw new BootstrapHttpError(
        message || `Failed to bootstrap auth session ${response.status}.`,
        response.status,
      );
    }

    return (await response.json()) as AuthBootstrapResult;
  });
}

async function waitForAuthenticatedSessionAfterBootstrap(): Promise<AuthSessionState> {
  const startedAt = Date.now();

  while (true) {
    const session = await fetchSessionState();
    if (session.authenticated) {
      return session;
    }

    if (Date.now() - startedAt >= AUTH_SESSION_ESTABLISH_TIMEOUT_MS) {
      throw new Error("Timed out waiting for authenticated session after bootstrap.");
    }

    await waitFor(AUTH_SESSION_ESTABLISH_STEP_MS);
  }
}

async function bootstrapServerAuth(): Promise<ServerAuthGateState> {
  const currentSession = await fetchSessionState();
  if (currentSession.authenticated) {
    return setServerAuthGateState({ status: "authenticated" });
  }

  const bootstrapCredential = getDesktopBootstrapCredential();
  if (!bootstrapCredential) {
    return setServerAuthGateState({
      status: "requires-auth",
      auth: currentSession.auth,
    });
  }

  try {
    await exchangeBootstrapCredential(bootstrapCredential);
    await waitForAuthenticatedSessionAfterBootstrap();
    return setServerAuthGateState({ status: "authenticated" });
  } catch (error) {
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

  const nextPromise = bootstrapServerAuth();
  bootstrapPromise = nextPromise.finally(() => {
    if (bootstrapPromise === nextPromise) {
      bootstrapPromise = null;
    }
  });
  return bootstrapPromise;
}

export async function refreshServerAuthGateState(): Promise<ServerAuthGateState> {
  setServerAuthGateState({ status: "booting" });
  bootstrapPromise = null;
  return await startServerAuthGateBootstrap();
}

export async function submitServerAuthCredential(credential: string): Promise<void> {
  const trimmedCredential = credential.trim();
  if (!trimmedCredential) {
    throw new Error("Enter a pairing token to continue.");
  }

  await exchangeBootstrapCredential(trimmedCredential);
  await waitForAuthenticatedSessionAfterBootstrap();
  stripPairingTokenFromUrl();
  setServerAuthGateState({ status: "authenticated" });
}
