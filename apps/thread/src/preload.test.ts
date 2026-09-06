import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ThreadAppActivation } from "@t3tools/contracts/threadAppActivation";
import {
  THREAD_CLIENT_ACTIVATION_CHANNEL,
  THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL,
  THREAD_ENROLLMENT_SUBMISSION_CHANNEL,
} from "./bridge.ts";

const electron = vi.hoisted(() => ({ on: vi.fn(), invoke: vi.fn(), exposeInMainWorld: vi.fn() }));
vi.mock("electron", () => ({ ipcRenderer: electron, contextBridge: electron }));
const activation = {
  contractVersion: 1,
  launchId: "01234567-89ab-4def-8abc-0123456789ab",
  draft: "  雪\r\n ",
} as const;
async function preload() {
  vi.resetModules();
  vi.clearAllMocks();
  await import("./preload.ts");
  expect(electron.on).toHaveBeenCalledWith(THREAD_CLIENT_ACTIVATION_CHANNEL, expect.any(Function));
  expect(electron.exposeInMainWorld).toHaveBeenCalledWith("t3ThreadBridge", expect.any(Object));
  return {
    receive: electron.on.mock.calls[0]![1] as (event: unknown, value: unknown) => void,
    bridge: electron.exposeInMainWorld.mock.calls[0]![1] as {
      subscribe: (listener: (activation: ThreadAppActivation) => void) => () => void;
      submitPairingCredential: (credential: string) => Promise<unknown>;
      completeActivation: (completion: unknown) => Promise<boolean>;
    },
  };
}
afterEach(() => vi.clearAllMocks());

describe("protected Thread preload", () => {
  it("retains only the first valid activation for every later subscription", async () => {
    const { bridge, receive } = await preload();
    receive({}, { ...activation, launchId: "bad" });
    receive({}, activation);
    receive({}, { ...activation, draft: "changed same identity" });
    for (let index = 0; index < 100; index++)
      receive({}, { ...activation, launchId: "11234567-89ab-4def-8abc-0123456789ab" });
    const first = vi.fn();
    const unsubscribe = bridge.subscribe(first);
    expect(first).toHaveBeenCalledExactlyOnceWith(activation);
    unsubscribe();
    expect(() =>
      bridge.subscribe(() => {
        throw new Error("synthetic replay failure");
      }),
    ).not.toThrow();
    const later = vi.fn();
    bridge.subscribe(later);
    expect(later).toHaveBeenCalledExactlyOnceWith(activation);
    expect(first).toHaveBeenCalledOnce();
    expect(Object.isFrozen(first.mock.calls[0]![0])).toBe(true);
  });

  it("delivers initial activation once to active listeners and isolates subscriber failures", async () => {
    const { bridge, receive } = await preload();
    bridge.subscribe(() => {
      throw new Error("synthetic subscriber failure");
    });
    const listener = vi.fn();
    bridge.subscribe(listener);
    receive({}, activation);
    receive({}, activation);
    expect(listener).toHaveBeenCalledExactlyOnceWith(activation);
  });

  it("exposes only one-way pairing results and converts IPC failures to safe unavailable", async () => {
    const { bridge } = await preload();
    expect(Object.keys(bridge).sort()).toEqual([
      "completeActivation",
      "submitPairingCredential",
      "subscribe",
    ]);
    for (const status of ["accepted", "rejected", "unavailable"]) {
      electron.invoke.mockResolvedValueOnce({ status, access_token: "synthetic-secret" });
      expect(await bridge.submitPairingCredential("synthetic-pairing")).toEqual({ status });
    }
    expect(electron.invoke).toHaveBeenCalledWith(
      THREAD_ENROLLMENT_SUBMISSION_CHANNEL,
      "synthetic-pairing",
    );
    electron.invoke.mockRejectedValueOnce(new Error("synthetic-secret"));
    expect(await bridge.submitPairingCredential("synthetic-pairing")).toEqual({
      status: "unavailable",
    });
    electron.invoke.mockResolvedValueOnce({ access_token: "synthetic-secret" });
    expect(await bridge.submitPairingCredential("synthetic-pairing")).toEqual({
      status: "unavailable",
    });
  });

  it("validates identity-only completion before invoking the fixed channel", async () => {
    const { bridge } = await preload();
    const completion = { contractVersion: 1, launchId: activation.launchId };
    for (const value of [
      null,
      [],
      {},
      { ...completion, contractVersion: 2 },
      { ...completion, launchId: "bad" },
      { ...completion, launchId: "01234567-89ab-1def-8abc-0123456789ab" },
      { ...completion, draft: "synthetic draft" },
      { ...completion, credential: "synthetic-secret" },
      { ...completion, url: "https://foreign.example.test" },
    ]) {
      expect(await bridge.completeActivation(value)).toBe(false);
    }
    expect(electron.invoke).not.toHaveBeenCalled();
    electron.invoke.mockResolvedValueOnce(true);
    expect(await bridge.completeActivation(completion)).toBe(true);
    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(
      THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL,
      completion,
    );
  });

  it("returns strict false for rejected or unexpected completion replies and IPC failures", async () => {
    const { bridge } = await preload();
    const completion = { contractVersion: 1, launchId: activation.launchId };
    for (const reply of [false, undefined, null, 1, "true", { accepted: true }]) {
      electron.invoke.mockResolvedValueOnce(reply);
      expect(await bridge.completeActivation(completion)).toBe(false);
    }
    electron.invoke.mockRejectedValueOnce(new Error("synthetic IPC failure"));
    expect(await bridge.completeActivation(completion)).toBe(false);
  });
});
