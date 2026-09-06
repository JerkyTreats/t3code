// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off globalTimers:off -- Electron main owns this protected local credential boundary.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { ThreadEnrollmentSubmissionResult } from "./bridge.ts";

const AUTH_ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";
const AUTH_BOOTSTRAP_TOKEN_TYPE = "urn:t3:params:oauth:token-type:environment-bootstrap";
const AUTH_TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
const MAX_ENROLLMENT_DOCUMENT_BYTES = 64 * 1024;
const MAX_TOKEN_EXCHANGE_RESPONSE_BYTES = 64 * 1024;
const MAX_PAIRING_CREDENTIAL_BYTES = 256;
const DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS = 10_000;
const ELECTRON_PROTECTED_LINUX_DESKTOPS = new Set([
  "Deepin",
  "GNOME",
  "KDE",
  "Pantheon",
  "UKUI",
  "Unity",
  "X-Cinnamon",
  "XFCE",
]);
const ELECTRON_UNPROTECTED_LINUX_DESKTOPS = new Set(["LXQt"]);

export interface ThreadSafeStorage {
  readonly isEncryptionAvailable: () => boolean;
  readonly getSelectedStorageBackend: () => string;
  readonly encryptString: (value: string) => Buffer;
  readonly decryptString: (value: Buffer) => string;
}

export interface ThreadEnrollmentOwner {
  readonly bearerCredential: () => string | null;
  readonly submitPairingCredential: (
    credential: string,
  ) => Promise<ThreadEnrollmentSubmissionResult>;
}

export type ThreadEnrollmentFetch = (input: string, init: RequestInit) => Promise<Response>;

type EnrollmentPayload = {
  readonly version: 1;
  readonly origin: string;
  readonly bearerCredential: string;
  readonly expiresAtMs: number;
};

type EnrollmentDocument = {
  readonly version: 1;
  readonly encryptedEnrollment: string;
};

type TokenExchangeResponse = {
  readonly access_token: string;
  readonly issued_token_type: typeof AUTH_ACCESS_TOKEN_TYPE;
  readonly token_type: "Bearer";
  readonly expires_in: number;
};

export function resolveThreadEnrollmentPath(
  appDataPath: string,
  applicationOrigin: string,
): string {
  if (!NodePath.isAbsolute(appDataPath)) {
    throw new Error("T3 Thread application data path must be absolute.");
  }
  const origin = new URL(applicationOrigin).origin;
  if (origin !== applicationOrigin || !origin.startsWith("https://")) {
    throw new Error("T3 Thread enrollment origin must be an exact HTTPS origin.");
  }
  const originKey = NodeCrypto.createHash("sha256").update(origin).digest("hex");
  return NodePath.join(
    NodePath.resolve(appDataPath),
    "t3code-thread",
    `enrollment-${originKey}.v1.json`,
  );
}

export interface ThreadPreReadyCommandLine {
  readonly hasSwitch: (name: string) => boolean;
  readonly appendSwitch: (name: string, value: string) => void;
}

export function configureThreadProtectedStorageBeforeReady(input: {
  readonly platform: NodeJS.Platform;
  readonly commandLine: ThreadPreReadyCommandLine;
  readonly env: NodeJS.ProcessEnv;
}): void {
  if (input.platform !== "linux" || input.commandLine.hasSwitch("password-store")) return;
  const currentDesktops = input.env.XDG_CURRENT_DESKTOP?.split(":") ?? [];
  for (const name of currentDesktops) {
    const desktop = name.trim();
    if (ELECTRON_PROTECTED_LINUX_DESKTOPS.has(desktop)) return;
    if (ELECTRON_UNPROTECTED_LINUX_DESKTOPS.has(desktop)) break;
  }
  input.commandLine.appendSwitch("password-store", "gnome-libsecret");
}

export function assertProtectedThreadStorage(input: {
  readonly platform: NodeJS.Platform;
  readonly safeStorage: ThreadSafeStorage;
}): void {
  if (!input.safeStorage.isEncryptionAvailable()) {
    throw new Error("Protected T3 Thread enrollment storage is unavailable.");
  }
  if (
    input.platform === "linux" &&
    input.safeStorage.getSelectedStorageBackend().trim().toLowerCase() === "basic_text"
  ) {
    throw new Error("Protected T3 Thread enrollment storage is unavailable.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBearerCredential(value: string): boolean {
  // Bearers enter an HTTP header only in main; control bytes are never admitted.
  return /^[A-Za-z0-9._~+/-]+=*$/u.test(value) && value.length <= 16 * 1024;
}

function decodeEnrollmentDocument(value: unknown): EnrollmentDocument | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.encryptedEnrollment !== "string" ||
    value.encryptedEnrollment.length === 0
  ) {
    return null;
  }
  return { version: 1, encryptedEnrollment: value.encryptedEnrollment };
}

function decodeEnrollmentPayload(value: unknown): EnrollmentPayload | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.origin !== "string" ||
    typeof value.bearerCredential !== "string" ||
    !isBearerCredential(value.bearerCredential) ||
    typeof value.expiresAtMs !== "number" ||
    !Number.isFinite(value.expiresAtMs)
  ) {
    return null;
  }
  return {
    version: 1,
    origin: value.origin,
    bearerCredential: value.bearerCredential,
    expiresAtMs: value.expiresAtMs,
  };
}

function currentUserId(): number | null {
  return typeof process.getuid === "function" ? process.getuid() : null;
}

function assertProtectedPathStat(input: {
  readonly stat: NodeFS.Stats;
  readonly kind: "directory" | "file";
}): void {
  const expectedKind = input.kind === "directory" ? input.stat.isDirectory() : input.stat.isFile();
  const userId = currentUserId();
  if (
    !expectedKind ||
    input.stat.isSymbolicLink() ||
    (userId !== null && input.stat.uid !== userId) ||
    (input.stat.mode & 0o077) !== 0
  ) {
    throw new Error(`T3 Thread enrollment ${input.kind} is not safely owned.`);
  }
}

function readProtectedFile(path: string): Buffer | null {
  let pathStat: NodeFS.Stats;
  try {
    pathStat = NodeFS.lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  assertProtectedPathStat({ stat: pathStat, kind: "file" });

  const noFollow = NodeFS.constants.O_NOFOLLOW ?? 0;
  const descriptor = NodeFS.openSync(path, NodeFS.constants.O_RDONLY | noFollow);
  try {
    const openStat = NodeFS.fstatSync(descriptor);
    assertProtectedPathStat({ stat: openStat, kind: "file" });
    // A concurrent atomic replacement may change the path inode after lstat.
    // The no-follow descriptor and its own ownership/mode are the read authority.
    if (openStat.size === 0 || openStat.size > MAX_ENROLLMENT_DOCUMENT_BYTES) return null;
    return NodeFS.readFileSync(descriptor);
  } finally {
    NodeFS.closeSync(descriptor);
  }
}

function assertExistingProtectedDirectory(path: string): boolean {
  let stat: NodeFS.Stats;
  try {
    stat = NodeFS.lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  assertProtectedPathStat({ stat, kind: "directory" });
  return true;
}

function ensureProtectedDirectory(path: string): void {
  if (assertExistingProtectedDirectory(path)) return;
  try {
    NodeFS.mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (!assertExistingProtectedDirectory(path)) {
    throw new Error("T3 Thread enrollment directory could not be created.");
  }
}

function readEnrollment(input: {
  readonly enrollmentPath: string;
  readonly applicationOrigin: string;
  readonly safeStorage: ThreadSafeStorage;
  readonly now: () => number;
}): EnrollmentPayload | null {
  const bytes = readProtectedFile(input.enrollmentPath);
  if (!bytes) return null;

  try {
    const document = decodeEnrollmentDocument(JSON.parse(bytes.toString("utf8")));
    if (!document) return null;
    const encrypted = Buffer.from(document.encryptedEnrollment, "base64");
    if (encrypted.byteLength === 0) return null;
    const payload = decodeEnrollmentPayload(JSON.parse(input.safeStorage.decryptString(encrypted)));
    if (
      !payload ||
      payload.origin !== input.applicationOrigin ||
      payload.expiresAtMs <= input.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function persistEnrollment(input: {
  readonly enrollmentPath: string;
  readonly payload: EnrollmentPayload;
  readonly safeStorage: ThreadSafeStorage;
}): void {
  const parentPath = NodePath.dirname(input.enrollmentPath);
  ensureProtectedDirectory(parentPath);
  readProtectedFile(input.enrollmentPath);

  const encrypted = input.safeStorage.encryptString(JSON.stringify(input.payload));
  const document: EnrollmentDocument = {
    version: 1,
    encryptedEnrollment: encrypted.toString("base64"),
  };
  const encodedDocument = `${JSON.stringify(document)}\n`;
  if (Buffer.byteLength(encodedDocument, "utf8") > MAX_ENROLLMENT_DOCUMENT_BYTES) {
    throw new Error("Protected T3 Thread enrollment exceeded its byte bound.");
  }
  const temporaryPath = `${input.enrollmentPath}.${process.pid}.${NodeCrypto.randomUUID()}.tmp`;
  let descriptor: number | undefined;
  try {
    const noFollow = NodeFS.constants.O_NOFOLLOW ?? 0;
    descriptor = NodeFS.openSync(
      temporaryPath,
      NodeFS.constants.O_WRONLY | NodeFS.constants.O_CREAT | NodeFS.constants.O_EXCL | noFollow,
      0o600,
    );
    NodeFS.writeFileSync(descriptor, encodedDocument, "utf8");
    NodeFS.fsyncSync(descriptor);
    NodeFS.closeSync(descriptor);
    descriptor = undefined;
    NodeFS.renameSync(temporaryPath, input.enrollmentPath);
    // Atomic replacement permits concurrent processes; the last successful rename wins.
    // Do not reopen here: another valid writer may already have replaced our record.
  } catch (error) {
    if (descriptor !== undefined) NodeFS.closeSync(descriptor);
    try {
      NodeFS.unlinkSync(temporaryPath);
    } catch {
      // A failed temporary write may not have created a file.
    }
    throw error;
  }
}

function decodeTokenExchangeResponse(value: unknown): TokenExchangeResponse | null {
  if (
    !isRecord(value) ||
    typeof value.access_token !== "string" ||
    !isBearerCredential(value.access_token) ||
    value.issued_token_type !== AUTH_ACCESS_TOKEN_TYPE ||
    value.token_type !== "Bearer" ||
    typeof value.expires_in !== "number" ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0
  ) {
    return null;
  }
  return {
    access_token: value.access_token,
    issued_token_type: AUTH_ACCESS_TOKEN_TYPE,
    token_type: "Bearer",
    expires_in: value.expires_in,
  };
}

async function readBoundedTokenExchangeResponse(response: Response): Promise<unknown | null> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_TOKEN_EXCHANGE_RESPONSE_BYTES
  ) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > MAX_TOKEN_EXCHANGE_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
}

export function createThreadEnrollmentOwner(input: {
  readonly applicationOrigin: string;
  readonly enrollmentPath: string;
  readonly platform: NodeJS.Platform;
  readonly safeStorage: ThreadSafeStorage;
  readonly fetch: ThreadEnrollmentFetch;
  readonly now?: () => number;
  readonly requestTimeoutMs?: number;
}): ThreadEnrollmentOwner {
  const origin = new URL(input.applicationOrigin).origin;
  if (origin !== input.applicationOrigin || !origin.startsWith("https://")) {
    throw new Error("T3 Thread enrollment origin must be an exact HTTPS origin.");
  }
  assertProtectedThreadStorage({ platform: input.platform, safeStorage: input.safeStorage });
  assertExistingProtectedDirectory(NodePath.dirname(input.enrollmentPath));

  const now = input.now ?? Date.now;
  let currentEnrollment = readEnrollment({
    enrollmentPath: input.enrollmentPath,
    applicationOrigin: origin,
    safeStorage: input.safeStorage,
    now,
  });
  let submission: Promise<ThreadEnrollmentSubmissionResult> | null = null;

  const exchange = async (credential: string): Promise<ThreadEnrollmentSubmissionResult> => {
    const body = new URLSearchParams({
      grant_type: AUTH_TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: credential,
      subject_token_type: AUTH_BOOTSTRAP_TOKEN_TYPE,
      requested_token_type: AUTH_ACCESS_TOKEN_TYPE,
      client_label: "T3 Thread",
      client_device_type: "desktop",
    });

    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(),
      input.requestTimeoutMs ?? DEFAULT_TOKEN_EXCHANGE_TIMEOUT_MS,
    );
    try {
      assertProtectedThreadStorage({ platform: input.platform, safeStorage: input.safeStorage });
      const exchangeUrl = new URL("/oauth/token", origin).href;
      const response = await input.fetch(exchangeUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        credentials: "omit",
        redirect: "error",
        signal: abortController.signal,
      });
      if (response.redirected || response.url !== exchangeUrl || !response.ok) {
        void response.body?.cancel().catch(() => undefined);
        return {
          status:
            !response.redirected && response.url === exchangeUrl && response.status === 401
              ? "rejected"
              : "unavailable",
        };
      }
      const token = decodeTokenExchangeResponse(await readBoundedTokenExchangeResponse(response));
      if (!token) return { status: "unavailable" };
      const expiresAtMs = now() + token.expires_in * 1_000;
      if (!Number.isFinite(expiresAtMs)) return { status: "unavailable" };

      const payload: EnrollmentPayload = {
        version: 1,
        origin,
        bearerCredential: token.access_token,
        expiresAtMs,
      };
      assertProtectedThreadStorage({ platform: input.platform, safeStorage: input.safeStorage });
      persistEnrollment({
        enrollmentPath: input.enrollmentPath,
        payload,
        safeStorage: input.safeStorage,
      });
      currentEnrollment = payload;
      return { status: "accepted" };
    } catch {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    bearerCredential: () => {
      // An admitted window keeps its own credential, but cannot keep using it past expiry.
      if (currentEnrollment && currentEnrollment.expiresAtMs <= now()) currentEnrollment = null;
      return currentEnrollment?.bearerCredential ?? null;
    },
    submitPairingCredential: (credential) => {
      const trimmed = credential.trim();
      if (
        !trimmed ||
        trimmed.includes("\0") ||
        Buffer.byteLength(trimmed, "utf8") > MAX_PAIRING_CREDENTIAL_BYTES
      ) {
        return Promise.resolve({ status: "rejected" });
      }
      if (submission) return Promise.resolve({ status: "unavailable" });
      submission = exchange(trimmed).finally(() => {
        submission = null;
      });
      return submission;
    },
  };
}

export function authorizeThreadSessionRequest(input: {
  readonly requestUrl: string;
  readonly applicationOrigin: string;
  readonly bearerCredential: string | null;
  readonly requestHeaders: Record<string, string | string[]>;
}): Record<string, string | string[]> {
  // Redirects can carry previously injected headers. Strip them on every request,
  // including foreign targets, before selecting the one enrolled API origin.
  const requestHeaders = Object.fromEntries(
    Object.entries(input.requestHeaders).filter(([name]) => name.toLowerCase() !== "authorization"),
  );
  if (!input.bearerCredential) return requestHeaders;
  let requestUrl: URL;
  try {
    requestUrl = new URL(input.requestUrl);
  } catch {
    return requestHeaders;
  }
  if (
    requestUrl.origin !== input.applicationOrigin ||
    requestUrl.protocol !== "https:" ||
    requestUrl.username !== "" ||
    requestUrl.password !== "" ||
    !requestUrl.pathname.startsWith("/api/")
  ) {
    return requestHeaders;
  }

  requestHeaders.Authorization = `Bearer ${input.bearerCredential}`;
  return requestHeaders;
}

export function isThreadEnrollmentSubmissionAllowed(input: {
  readonly senderMatchesWindow: boolean;
  readonly senderIsMainFrame: boolean;
  readonly senderFrameUrl: string | null;
  readonly applicationOrigin: string;
}): boolean {
  if (!input.senderMatchesWindow || !input.senderIsMainFrame || input.senderFrameUrl === null) {
    return false;
  }
  try {
    const url = new URL(input.senderFrameUrl);
    return (
      url.origin === input.applicationOrigin &&
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}
