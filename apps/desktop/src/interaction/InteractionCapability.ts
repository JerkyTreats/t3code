// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import type * as NodeStream from "node:stream";

export const INTERACTION_EXECUTABLE = "meld-sim-lab";
export const INTERACTION_ARGUMENTS = ["--conversation-stdio", "--no-audio"] as const;
export const INTERACTION_BINARY_PATH_CONFIG = "T3_INTERACTION_BINARY_PATH";
export const INTERACTION_BINARY_SHA256_CONFIG = "T3_INTERACTION_BINARY_SHA256";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MAX_BINARY_BYTES = 512 * 1024 * 1024;
const MAX_ENV_VALUE_BYTES = 4_096;
const MAX_ENV_BYTES = 16_384;
const CHILD_ENV_ALLOWLIST = [
  "LANG",
  "LC_ALL",
  "RUST_BACKTRACE",
  "TMPDIR",
  "WGPU_BACKEND",
  "XDG_RUNTIME_DIR",
] as const;

export interface InteractionChild {
  readonly stdin: NodeStream.Writable;
  readonly stdout: NodeStream.Readable;
  readonly stderr: NodeStream.Readable;
  readonly pid?: number | undefined;
  readonly exitCode: number | null;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface InteractionCapability {
  readonly launch: () => Promise<InteractionChild>;
}

export interface InteractionCapabilityConfig {
  readonly binaryPath: string | undefined;
  readonly expectedSha256: string | undefined;
  readonly environment?: NodeJS.ProcessEnv;
  readonly spawnProcess?: (
    binaryPath: string,
    arguments_: readonly string[],
    options: NodeChildProcess.SpawnOptionsWithoutStdio,
  ) => InteractionChild;
}

export function sanitizedChildEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  let totalBytes = 0;
  for (const key of CHILD_ENV_ALLOWLIST) {
    const value = source[key];
    if (value === undefined || Buffer.byteLength(value) > MAX_ENV_VALUE_BYTES) continue;
    totalBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
    if (totalBytes > MAX_ENV_BYTES) throw new Error("Native interaction environment is too large.");
    environment[key] = value;
  }
  return environment;
}

async function sha256File(path: string): Promise<string> {
  const bytes = await NodeFSP.readFile(path);
  return NodeCrypto.createHash("sha256").update(bytes).digest("hex");
}

export async function verifyExecutableArtifact(
  binaryPath: string | undefined,
  expectedSha256: string | undefined,
  pathConfigName: string,
  digestConfigName: string,
): Promise<string> {
  if (binaryPath === undefined || !NodePath.isAbsolute(binaryPath)) {
    throw new Error(`${pathConfigName} must name an absolute path.`);
  }
  if (expectedSha256 === undefined || !SHA256_PATTERN.test(expectedSha256)) {
    throw new Error(`${digestConfigName} must be a lowercase SHA-256 digest.`);
  }
  const stat = await NodeFSP.lstat(binaryPath);
  if (!stat.isFile() || (stat.mode & 0o111) === 0 || stat.size > MAX_BINARY_BYTES) {
    throw new Error("Configured binary must be a bounded regular executable artifact.");
  }
  const actualSha256 = await sha256File(binaryPath);
  if (actualSha256 !== expectedSha256) {
    throw new Error("Configured binary digest does not match its admitted binding.");
  }
  return binaryPath;
}

export function makeNativeInteractionCapability(
  config: InteractionCapabilityConfig,
): InteractionCapability {
  return {
    launch: async () => {
      const binaryPath = await verifyExecutableArtifact(
        config.binaryPath,
        config.expectedSha256,
        INTERACTION_BINARY_PATH_CONFIG,
        INTERACTION_BINARY_SHA256_CONFIG,
      );
      const spawnProcess = config.spawnProcess ?? NodeChildProcess.spawn;
      return spawnProcess(binaryPath, INTERACTION_ARGUMENTS, {
        stdio: ["pipe", "pipe", "pipe"],
        shell: false,
        windowsHide: true,
        env: sanitizedChildEnvironment(config.environment ?? NodeProcess.env),
      });
    },
  };
}

/**
 * This is the only command admission point. No renderer or request data can
 * select the executable, arguments, environment, shell, or working directory.
 */
export const nativeInteractionCapability: InteractionCapability = {
  launch: makeNativeInteractionCapability({
    binaryPath: NodeProcess.env[INTERACTION_BINARY_PATH_CONFIG],
    expectedSha256: NodeProcess.env[INTERACTION_BINARY_SHA256_CONFIG],
  }).launch,
};
