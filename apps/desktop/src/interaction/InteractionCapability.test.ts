// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  INTERACTION_ARGUMENTS,
  makeNativeInteractionCapability,
  type InteractionChild,
} from "./InteractionCapability.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => NodeFSP.rm(path, { recursive: true })),
  );
});

async function executableFixture(): Promise<{ path: string; sha256: string }> {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "t3-native-binding-"));
  temporaryDirectories.push(directory);
  const path = NodePath.join(directory, "meld-sim-lab");
  const bytes = Buffer.from("fixed native artifact");
  await NodeFSP.writeFile(path, bytes, { mode: 0o700 });
  return { path, sha256: NodeCrypto.createHash("sha256").update(bytes).digest("hex") };
}

describe("native interaction capability admission", () => {
  it("rejects a relative binary path and a mismatched digest before spawn", async () => {
    const spawnProcess = vi.fn();
    await expect(
      makeNativeInteractionCapability({
        binaryPath: "meld-sim-lab",
        expectedSha256: "0".repeat(64),
        spawnProcess,
      }).launch(),
    ).rejects.toThrow("absolute path");
    const fixture = await executableFixture();
    await expect(
      makeNativeInteractionCapability({
        binaryPath: fixture.path,
        expectedSha256: "0".repeat(64),
        spawnProcess,
      }).launch(),
    ).rejects.toThrow("digest does not match");
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("launches the verified artifact with fixed arguments and a bounded allowlist", async () => {
    const fixture = await executableFixture();
    const child = {} as InteractionChild;
    const spawnProcess = vi.fn(() => child);
    const capability = makeNativeInteractionCapability({
      binaryPath: fixture.path,
      expectedSha256: fixture.sha256,
      environment: {
        HOME: "/private/home",
        LD_PRELOAD: "/untrusted/injection.so",
        LANG: "en_US.UTF-8",
        XDG_RUNTIME_DIR: "/run/user/1000",
      },
      spawnProcess,
    });
    await expect(capability.launch()).resolves.toBe(child);
    expect(spawnProcess).toHaveBeenCalledExactlyOnceWith(fixture.path, INTERACTION_ARGUMENTS, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      env: { LANG: "en_US.UTF-8", XDG_RUNTIME_DIR: "/run/user/1000" },
    });
  });
});
