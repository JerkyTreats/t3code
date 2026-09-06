// @effect-diagnostics nodeBuiltinImport:off -- The protected enrollment test owns temporary filesystem state.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  assertProtectedThreadStorage,
  authorizeThreadSessionRequest,
  configureThreadProtectedStorageBeforeReady,
  createThreadEnrollmentOwner,
  isThreadEnrollmentSubmissionAllowed,
  resolveThreadEnrollmentPath,
  type ThreadSafeStorage,
} from "./enrollment.ts";

const fileFaults = vi.hoisted(() => ({ failRename: false }));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (fileFaults.failRename) throw new Error("synthetic write failure");
      return actual.renameSync(...args);
    },
  };
});

const applicationOrigin = "https://production.example.test";
const pairingCredential = "synthetic-one-time-pairing-credential";
const bearerCredential = "synthetic-thread-bearer-credential";
const now = () => Date.UTC(2026, 8, 4);
const temporaryRoots: string[] = [];

function makeTemporaryEnrollmentPath(origin = applicationOrigin): string {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-thread-enrollment-test-"));
  temporaryRoots.push(root);
  return resolveThreadEnrollmentPath(root, origin);
}

function makeSafeStorage(
  backend = "gnome_libsecret",
  encryptionAvailable = true,
): ThreadSafeStorage {
  return {
    isEncryptionAvailable: () => encryptionAvailable,
    getSelectedStorageBackend: () => backend,
    encryptString: (value) => Buffer.from(`protected:${Buffer.from(value).toString("base64")}`),
    decryptString: (value) => {
      const encoded = value.toString("utf8");
      if (!encoded.startsWith("protected:")) throw new Error("invalid protected bytes");
      return Buffer.from(encoded.slice("protected:".length), "base64").toString("utf8");
    },
  };
}

function responseAtExchange(response: Response): Response {
  Object.defineProperty(response, "url", { value: `${applicationOrigin}/oauth/token` });
  return response;
}

function tokenExchangeResponse(): Response {
  return responseAtExchange(
    Response.json({
      access_token: bearerCredential,
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "Bearer",
      expires_in: 3_600,
      scope: "orchestration:read orchestration:operate",
    }),
  );
}

afterEach(() => {
  fileFaults.failRename = false;
  for (const root of temporaryRoots.splice(0)) {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

describe("protected T3 Thread enrollment", () => {
  it("exchanges one pairing credential and persists only protected enrollment bytes", async () => {
    const enrollmentPath = makeTemporaryEnrollmentPath();
    const fetch = vi.fn().mockResolvedValue(tokenExchangeResponse());
    const owner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath,
      platform: "linux",
      safeStorage: makeSafeStorage(),
      fetch,
      now,
    });

    await expect(owner.submitPairingCredential(pairingCredential)).resolves.toEqual({
      status: "accepted",
    });
    expect(owner.bearerCredential()).toBe(bearerCredential);
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0];
    expect(String(request?.[0])).toBe("https://production.example.test/oauth/token");
    const init = request?.[1] as RequestInit;
    expect(init).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const body = init.body as URLSearchParams;
    expect(body.get("subject_token")).toBe(pairingCredential);
    expect(body.get("client_label")).toBe("T3 Thread");

    const stored = NodeFS.readFileSync(enrollmentPath, "utf8");
    expect(stored).not.toContain(pairingCredential);
    expect(stored).not.toContain(bearerCredential);
    expect(NodeFS.statSync(enrollmentPath).mode & 0o777).toBe(0o600);
    expect(NodeFS.statSync(NodePath.dirname(enrollmentPath)).mode & 0o777).toBe(0o700);
  });

  it("silently loads the same protected enrollment from a fresh process owner", async () => {
    const enrollmentPath = makeTemporaryEnrollmentPath();
    const safeStorage = makeSafeStorage();
    const firstFetch = vi.fn().mockResolvedValue(tokenExchangeResponse());
    const firstOwner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath,
      platform: "linux",
      safeStorage,
      fetch: firstFetch,
      now,
    });
    await firstOwner.submitPairingCredential(pairingCredential);

    const freshFetch = vi.fn();
    const freshOwner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath,
      platform: "linux",
      safeStorage,
      fetch: freshFetch,
      now,
    });

    expect(freshOwner.bearerCredential()).toBe(bearerCredential);
    expect(freshFetch).not.toHaveBeenCalled();
  });

  it("rejects unavailable encryption and Linux basic text storage", () => {
    const unavailable = makeSafeStorage("gnome_libsecret", false);
    expect(() =>
      assertProtectedThreadStorage({ platform: "linux", safeStorage: unavailable }),
    ).toThrow("storage is unavailable");
    expect(() =>
      assertProtectedThreadStorage({
        platform: "linux",
        safeStorage: makeSafeStorage("basic_text"),
      }),
    ).toThrow("storage is unavailable");
  });

  it("forces libsecret for Hyprland before Linux Electron readiness", () => {
    const appendSwitch = vi.fn();
    configureThreadProtectedStorageBeforeReady({
      platform: "linux",
      commandLine: { hasSwitch: () => false, appendSwitch },
      env: { XDG_CURRENT_DESKTOP: "Hyprland" },
    });
    expect(appendSwitch).toHaveBeenCalledExactlyOnceWith("password-store", "gnome-libsecret");

    appendSwitch.mockClear();
    configureThreadProtectedStorageBeforeReady({
      platform: "linux",
      commandLine: { hasSwitch: () => false, appendSwitch },
      env: { XDG_CURRENT_DESKTOP: "LXQt:GNOME" },
    });
    expect(appendSwitch).toHaveBeenCalledExactlyOnceWith("password-store", "gnome-libsecret");
  });

  it("preserves Electron protected GNOME and KDE backend selection", () => {
    for (const desktop of ["GNOME", "KDE"]) {
      const appendSwitch = vi.fn();
      configureThreadProtectedStorageBeforeReady({
        platform: "linux",
        commandLine: { hasSwitch: () => false, appendSwitch },
        env: { XDG_CURRENT_DESKTOP: desktop },
      });
      expect(appendSwitch).not.toHaveBeenCalled();
    }
  });

  it("keeps an explicit Linux password store authoritative", () => {
    const appendSwitch = vi.fn();
    configureThreadProtectedStorageBeforeReady({
      platform: "linux",
      commandLine: { hasSwitch: () => true, appendSwitch },
      env: { XDG_CURRENT_DESKTOP: "Hyprland" },
    });
    expect(appendSwitch).not.toHaveBeenCalled();
  });

  it("uses a separate protected enrollment file for every exact origin", () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-thread-origin-test-"));
    temporaryRoots.push(root);
    const production = resolveThreadEnrollmentPath(root, applicationOrigin);
    const staging = resolveThreadEnrollmentPath(root, "https://staging.example.test");

    expect(production).not.toBe(staging);
    expect(NodePath.dirname(production)).toBe(NodePath.dirname(staging));
  });

  it("fails closed on symlinked enrollment directories and unsafe enrollment modes", async () => {
    const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-thread-path-test-"));
    temporaryRoots.push(root);
    const redirected = NodePath.join(root, "redirected");
    NodeFS.mkdirSync(redirected, { mode: 0o700 });
    NodeFS.symlinkSync(redirected, NodePath.join(root, "t3code-thread"), "dir");
    const symlinkedPath = resolveThreadEnrollmentPath(root, applicationOrigin);
    expect(() =>
      createThreadEnrollmentOwner({
        applicationOrigin,
        enrollmentPath: symlinkedPath,
        platform: "linux",
        safeStorage: makeSafeStorage(),
        fetch: vi.fn(),
        now,
      }),
    ).toThrow("not safely owned");

    const enrollmentPath = makeTemporaryEnrollmentPath();
    const safeStorage = makeSafeStorage();
    const owner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath,
      platform: "linux",
      safeStorage,
      fetch: vi.fn().mockResolvedValue(tokenExchangeResponse()),
      now,
    });
    await owner.submitPairingCredential(pairingCredential);
    NodeFS.chmodSync(enrollmentPath, 0o644);
    expect(() =>
      createThreadEnrollmentOwner({
        applicationOrigin,
        enrollmentPath,
        platform: "linux",
        safeStorage,
        fetch: vi.fn(),
        now,
      }),
    ).toThrow("not safely owned");
  });

  it("fails a redirected or timed out token exchange without persisting enrollment", async () => {
    const redirectedPath = makeTemporaryEnrollmentPath();
    const redirectedOwner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath: redirectedPath,
      platform: "linux",
      safeStorage: makeSafeStorage(),
      fetch: vi.fn().mockResolvedValue(new Response(null, { status: 302 })),
      now,
    });
    await expect(redirectedOwner.submitPairingCredential(pairingCredential)).resolves.toEqual({
      status: "unavailable",
    });
    expect(NodeFS.existsSync(redirectedPath)).toBe(false);

    const timedOutPath = makeTemporaryEnrollmentPath();
    const timedOutFetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const timedOutOwner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath: timedOutPath,
      platform: "linux",
      safeStorage: makeSafeStorage(),
      fetch: timedOutFetch,
      now,
      requestTimeoutMs: 5,
    });
    await expect(timedOutOwner.submitPairingCredential(pairingCredential)).resolves.toEqual({
      status: "unavailable",
    });
    expect(timedOutFetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(NodeFS.existsSync(timedOutPath)).toBe(false);
  });

  it("rejects unsafe or oversized pairing credentials before allocating a request body", async () => {
    const fetch = vi.fn();
    const owner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath: makeTemporaryEnrollmentPath(),
      platform: "linux",
      safeStorage: makeSafeStorage(),
      fetch,
      now,
    });

    await expect(owner.submitPairingCredential("   ")).resolves.toEqual({ status: "rejected" });
    await expect(owner.submitPairingCredential("token\0suffix")).resolves.toEqual({
      status: "rejected",
    });
    await expect(owner.submitPairingCredential("é".repeat(129))).resolves.toEqual({
      status: "rejected",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cancels an oversized streamed token response before buffering the full body", async () => {
    let cancelled = false;
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(40 * 1024));
        controller.enqueue(new Uint8Array(40 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const enrollmentPath = makeTemporaryEnrollmentPath();
    const owner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath,
      platform: "linux",
      safeStorage: makeSafeStorage(),
      fetch: vi.fn().mockResolvedValue(responseAtExchange(new Response(oversizedBody))),
      now,
    });

    await expect(owner.submitPairingCredential(pairingCredential)).resolves.toEqual({
      status: "unavailable",
    });
    expect(cancelled).toBe(true);
    expect(NodeFS.existsSync(enrollmentPath)).toBe(false);
  });

  it("injects the bearer only into requests for the exact canonical origin", () => {
    const headers = { Accept: "application/json", authorization: "Bearer renderer-value" };
    expect(
      authorizeThreadSessionRequest({
        requestUrl: "https://production.example.test/api/auth/session",
        applicationOrigin,
        bearerCredential,
        requestHeaders: headers,
      }),
    ).toEqual({ Accept: "application/json", Authorization: `Bearer ${bearerCredential}` });
    expect(
      authorizeThreadSessionRequest({
        requestUrl: "https://production.example.test.evil.invalid/api/auth/session",
        applicationOrigin,
        bearerCredential,
        requestHeaders: headers,
      }),
    ).toEqual({ Accept: "application/json" });
    expect(
      authorizeThreadSessionRequest({
        requestUrl: "https://production.example.test:444/api/auth/session",
        applicationOrigin,
        bearerCredential,
        requestHeaders: headers,
      }),
    ).toEqual({ Accept: "application/json" });
    expect(
      authorizeThreadSessionRequest({
        requestUrl: "https://production.example.test/assets/app.js",
        applicationOrigin,
        bearerCredential,
        requestHeaders: headers,
      }),
    ).toEqual({ Accept: "application/json" });
    expect(
      authorizeThreadSessionRequest({
        requestUrl: "https://production.example.test/",
        applicationOrigin,
        bearerCredential,
        requestHeaders: headers,
      }),
    ).toEqual({ Accept: "application/json" });
    expect(
      authorizeThreadSessionRequest({
        requestUrl: "wss://production.example.test/ws",
        applicationOrigin,
        bearerCredential,
        requestHeaders: headers,
      }),
    ).toEqual({ Accept: "application/json" });
  });

  it("rejects absent, malformed, cross-origin, and non-main enrollment senders", () => {
    const allowed = {
      senderMatchesWindow: true,
      senderIsMainFrame: true,
      senderFrameUrl: `${applicationOrigin}/?t3-thread-client=1`,
      applicationOrigin,
    };
    expect(isThreadEnrollmentSubmissionAllowed(allowed)).toBe(true);
    expect(isThreadEnrollmentSubmissionAllowed({ ...allowed, senderFrameUrl: null })).toBe(false);
    expect(isThreadEnrollmentSubmissionAllowed({ ...allowed, senderFrameUrl: "invalid" })).toBe(
      false,
    );
    expect(isThreadEnrollmentSubmissionAllowed({ ...allowed, senderIsMainFrame: false })).toBe(
      false,
    );
    expect(
      isThreadEnrollmentSubmissionAllowed({
        ...allowed,
        senderFrameUrl: "https://other.example.test/",
      }),
    ).toBe(false);
  });

  it("does not reuse expired or differently scoped enrollment bytes", async () => {
    const enrollmentPath = makeTemporaryEnrollmentPath();
    const safeStorage = makeSafeStorage();
    const owner = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath,
      platform: "linux",
      safeStorage,
      fetch: vi.fn().mockResolvedValue(tokenExchangeResponse()),
      now,
    });
    await owner.submitPairingCredential(pairingCredential);

    const expired = createThreadEnrollmentOwner({
      applicationOrigin,
      enrollmentPath,
      platform: "linux",
      safeStorage,
      fetch: vi.fn(),
      now: () => now() + 3_600_001,
    });
    const otherOrigin = createThreadEnrollmentOwner({
      applicationOrigin: "https://staging.example.test",
      enrollmentPath,
      platform: "linux",
      safeStorage,
      fetch: vi.fn(),
      now,
    });
    expect(expired.bearerCredential()).toBeNull();
    expect(otherOrigin.bearerCredential()).toBeNull();
  });
});

describe("enrollment admission, persistence and bounded failures", () => {
  function ownerInput(enrollmentPath = makeTemporaryEnrollmentPath()) {
    return {
      applicationOrigin,
      enrollmentPath,
      platform: "linux" as const,
      safeStorage: makeSafeStorage(),
      now,
      fetch: vi.fn().mockResolvedValue(tokenExchangeResponse()),
    };
  }

  it("checks expiry at every use, including the exact expiry instant", async () => {
    let clock = now();
    const owner = createThreadEnrollmentOwner({ ...ownerInput(), now: () => clock });
    await owner.submitPairingCredential(pairingCredential);
    clock += 3_599_999;
    expect(owner.bearerCredential()).toBe(bearerCredential);
    clock += 1;
    expect(owner.bearerCredential()).toBeNull();
    clock -= 1;
    expect(owner.bearerCredential()).toBeNull();
  });

  it("keeps independent admitted credentials while later launches reuse the last complete atomic write", async () => {
    const input = ownerInput();
    let firstResponse!: (value: Response) => void;
    let secondResponse!: (value: Response) => void;
    const first = createThreadEnrollmentOwner({
      ...input,
      fetch: () =>
        new Promise((resolve) => {
          firstResponse = resolve;
        }),
    });
    const second = createThreadEnrollmentOwner({
      ...input,
      fetch: () =>
        new Promise((resolve) => {
          secondResponse = resolve;
        }),
    });
    const firstSubmission = first.submitPairingCredential("synthetic-first-grant");
    const secondSubmission = second.submitPairingCredential("synthetic-second-grant");
    await expect(first.submitPairingCredential("synthetic-conflicting-grant")).resolves.toEqual({
      status: "unavailable",
    });
    secondResponse(
      responseAtExchange(
        Response.json({
          access_token: "synthetic-second-bearer",
          issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
          token_type: "Bearer",
          expires_in: 3600,
        }),
      ),
    );
    expect(await secondSubmission).toEqual({ status: "accepted" });
    expect(createThreadEnrollmentOwner(input).bearerCredential()).toBe("synthetic-second-bearer");
    firstResponse(tokenExchangeResponse());
    expect(await firstSubmission).toEqual({ status: "accepted" });
    expect(createThreadEnrollmentOwner(input).bearerCredential()).toBe(bearerCredential);
    expect(second.bearerCredential()).toBe("synthetic-second-bearer");
    expect(NodeFS.readdirSync(NodePath.dirname(input.enrollmentPath))).toEqual([
      NodePath.basename(input.enrollmentPath),
    ]);
  });

  it("preserves the previous protected record and in-memory bearer when replacement fails", async () => {
    const input = ownerInput();
    let fail = false;
    const owner = createThreadEnrollmentOwner({
      ...input,
      safeStorage: {
        ...input.safeStorage,
        encryptString: (text) => {
          if (fail) throw new Error("synthetic-encryption-error-with-credential");
          return input.safeStorage.encryptString(text);
        },
      },
    });
    await owner.submitPairingCredential(pairingCredential);
    const before = NodeFS.readFileSync(input.enrollmentPath);
    fail = true;
    input.fetch.mockResolvedValueOnce(tokenExchangeResponse());
    expect(await owner.submitPairingCredential("synthetic-new-grant")).toEqual({
      status: "unavailable",
    });
    expect(NodeFS.readFileSync(input.enrollmentPath)).toEqual(before);
    expect(owner.bearerCredential()).toBe(bearerCredential);
    expect(createThreadEnrollmentOwner(input).bearerCredential()).toBe(bearerCredential);
  });

  it("fails an atomic rename without admitting new bytes or leaving a temporary file", async () => {
    const input = ownerInput();
    const owner = createThreadEnrollmentOwner(input);
    await owner.submitPairingCredential(pairingCredential);
    const before = NodeFS.readFileSync(input.enrollmentPath);
    fileFaults.failRename = true;
    input.fetch.mockResolvedValueOnce(tokenExchangeResponse());
    expect(await owner.submitPairingCredential("synthetic-new-grant")).toEqual({
      status: "unavailable",
    });
    expect(NodeFS.readFileSync(input.enrollmentPath)).toEqual(before);
    expect(owner.bearerCredential()).toBe(bearerCredential);
    expect(NodeFS.readdirSync(NodePath.dirname(input.enrollmentPath))).toEqual([
      NodePath.basename(input.enrollmentPath),
    ]);
  });

  it("rechecks protected storage before exchange and before persistence", async () => {
    for (const timing of ["before-exchange", "after-exchange"]) {
      const input = ownerInput();
      let available = true;
      const fetch = vi.fn(async () => {
        available = false;
        return tokenExchangeResponse();
      });
      const owner = createThreadEnrollmentOwner({
        ...input,
        safeStorage: { ...input.safeStorage, isEncryptionAvailable: () => available },
        fetch,
      });
      if (timing === "before-exchange") available = false;
      expect(await owner.submitPairingCredential(pairingCredential)).toEqual({
        status: "unavailable",
      });
      expect(fetch).toHaveBeenCalledTimes(timing === "before-exchange" ? 0 : 1);
      expect(NodeFS.existsSync(input.enrollmentPath)).toBe(false);
      expect(owner.bearerCredential()).toBeNull();
    }
  });

  it.each([
    "not-json",
    "null",
    "[]",
    "{}",
    JSON.stringify({
      access_token: "synthetic\r\nheader",
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "Bearer",
      expires_in: 3600,
    }),
    JSON.stringify({
      access_token: "x".repeat(16 * 1024 + 1),
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "Bearer",
      expires_in: 3600,
    }),
    JSON.stringify({
      access_token: "synthetic-token",
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "Bearer",
      expires_in: 0,
    }),
    JSON.stringify({
      access_token: "synthetic-token",
      issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
      token_type: "Bearer",
      expires_in: Number.MAX_VALUE,
    }),
  ])("returns safe unavailable for malformed token response %$", async (body) => {
    const input = ownerInput();
    input.fetch.mockResolvedValue(responseAtExchange(new Response(body)));
    const owner = createThreadEnrollmentOwner(input);
    expect(await owner.submitPairingCredential(pairingCredential)).toEqual({
      status: "unavailable",
    });
    expect(NodeFS.existsSync(input.enrollmentPath)).toBe(false);
    expect(owner.bearerCredential()).toBeNull();
  });

  it("rejects response URL drift and already-followed redirects before consuming the token", async () => {
    for (const response of [Response.json({}), tokenExchangeResponse(), tokenExchangeResponse()]) {
      const input = ownerInput();
      if (response.url) Object.defineProperty(response, "redirected", { value: true });
      input.fetch.mockResolvedValue(response);
      expect(
        await createThreadEnrollmentOwner(input).submitPairingCredential(pairingCredential),
      ).toEqual({ status: "unavailable" });
      expect(NodeFS.existsSync(input.enrollmentPath)).toBe(false);
    }
    const response = Response.json({});
    Object.defineProperty(response, "url", { value: "https://foreign.example.test/oauth/token" });
    const input = ownerInput();
    input.fetch.mockResolvedValue(response);
    expect(
      await createThreadEnrollmentOwner(input).submitPairingCredential(pairingCredential),
    ).toEqual({ status: "unavailable" });
  });

  it("cancels an advertised oversized body and safely maps an unauthorized response", async () => {
    const cancel = vi.fn();
    const input = ownerInput();
    input.fetch.mockResolvedValue(
      responseAtExchange(
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-length": String(64 * 1024 + 1) },
        }),
      ),
    );
    const owner = createThreadEnrollmentOwner(input);
    expect(await owner.submitPairingCredential(pairingCredential)).toEqual({
      status: "unavailable",
    });
    expect(cancel).toHaveBeenCalledOnce();
    input.fetch.mockResolvedValue(
      responseAtExchange(new Response("synthetic-secret", { status: 401 })),
    );
    expect(await owner.submitPairingCredential(pairingCredential)).toEqual({ status: "rejected" });
  });

  it("does not grant metadata authority or leak a previously injected bearer to lookalike requests", async () => {
    const input = ownerInput();
    await createThreadEnrollmentOwner(input).submitPairingCredential(pairingCredential);
    const body = input.fetch.mock.calls[0]![1].body as URLSearchParams;
    expect([...body.keys()].sort()).toEqual([
      "client_device_type",
      "client_label",
      "grant_type",
      "requested_token_type",
      "subject_token",
      "subject_token_type",
    ]);
    for (const url of [
      `${applicationOrigin}/.well-known/t3/environment`,
      `${applicationOrigin}/api-lookalike`,
      `${applicationOrigin}/ws`,
      "https://user:pass@production.example.test/api/auth/session",
      "invalid",
    ]) {
      expect(
        authorizeThreadSessionRequest({
          requestUrl: url,
          applicationOrigin,
          bearerCredential,
          requestHeaders: {
            Authorization: `Bearer ${bearerCredential}`,
            Accept: "application/json",
          },
        }),
      ).toEqual({ Accept: "application/json" });
    }
    expect(
      authorizeThreadSessionRequest({
        requestUrl: `${applicationOrigin}/api/auth/session`,
        applicationOrigin,
        bearerCredential: null,
        requestHeaders: { Authorization: `Bearer ${bearerCredential}` },
      }),
    ).toEqual({});
  });
});
