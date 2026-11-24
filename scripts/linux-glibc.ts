// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Runs in electron-builder's Node afterPack hook.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

// Both Linux release jobs build on Ubuntu 24.04; this is a build ceiling, not a distro support promise.
const GLIBC_BUILD_CEILING = "2.39";
const GLIBC_BUILD_CEILING_ENV = "T3CODE_LINUX_GLIBC_CEILING";
const GLIBC_VERSION_PATTERN = /^\d+(?:\.\d+)+$/;
const readelf = NodeUtil.promisify(NodeChildProcess.execFile);

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI?.trim().toLowerCase();
  return Boolean(value && value !== "0" && value !== "false");
}

function detectHostGlibcVersion(): string | undefined {
  const report = process.report?.getReport?.();
  if (!report || typeof report !== "object" || !("header" in report)) return undefined;
  const header = report.header as { readonly glibcVersionRuntime?: unknown } | undefined;
  const version =
    typeof header?.glibcVersionRuntime === "string" ? header.glibcVersionRuntime.trim() : "";
  return GLIBC_VERSION_PATTERN.test(version) ? version : undefined;
}

export function resolveGlibcBuildCeiling(options?: {
  readonly env?: NodeJS.ProcessEnv;
  readonly hostGlibc?: string | undefined;
}): string {
  const env = options?.env ?? process.env;
  const hostGlibc =
    options && "hostGlibc" in options ? options.hostGlibc : detectHostGlibcVersion();
  const hostCeiling =
    hostGlibc && compareVersions(hostGlibc, GLIBC_BUILD_CEILING) > 0
      ? hostGlibc
      : GLIBC_BUILD_CEILING;
  const configured = env[GLIBC_BUILD_CEILING_ENV]?.trim();
  if (configured) {
    if (configured.toLowerCase() === "host") {
      if (!hostGlibc) {
        throw new Error(
          `${GLIBC_BUILD_CEILING_ENV}=host requires a detectable host glibc runtime version`,
        );
      }
      return hostCeiling;
    }
    if (!GLIBC_VERSION_PATTERN.test(configured)) {
      throw new Error(
        `Invalid ${GLIBC_BUILD_CEILING_ENV} value "${configured}": expected "host" or a numeric version such as "${GLIBC_BUILD_CEILING}"`,
      );
    }
    return configured;
  }
  return isCiEnvironment(env) ? GLIBC_BUILD_CEILING : hostCeiling;
}

export function parseGlibcNeeds(output: string): string | undefined {
  let inNeeds = false;
  let minimum: string | undefined;
  for (const line of output.split("\n")) {
    if (line.startsWith("Version ")) inNeeds = line.startsWith("Version needs section ");
    if (!inNeeds) continue;
    const name = /\bName:\s+(GLIBC_\S+)/.exec(line)?.[1];
    // The loader only warns when a WEAK version is missing, so it does not raise the floor.
    if (!name || /\bFlags:[^:]*\bWEAK\b/.test(line)) continue;
    // DT_RELR's named ABI requirement was introduced in glibc 2.36.
    const version =
      name === "GLIBC_ABI_DT_RELR" ? "2.36" : /^GLIBC_(\d+(?:\.\d+)+)$/.exec(name)?.[1];
    if (!version) throw new Error(`Unhandled glibc requirement: ${name}`);
    if (!minimum || compareVersions(version, minimum) > 0) minimum = version;
  }
  return minimum;
}

export async function scanGlibcNeeds(
  appOutDir: string,
  options?: { readonly ceiling?: string },
): Promise<{
  minimum: string;
  elfCount: number;
}> {
  const ceiling = options?.ceiling ?? resolveGlibcBuildCeiling();
  let minimum: string | undefined;
  let elfCount = 0;
  async function walk(directory: string): Promise<void> {
    for (const entry of await NodeFSP.readdir(directory, { withFileTypes: true })) {
      const file = NodePath.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(file);
        continue;
      }
      if (!entry.isFile()) continue;
      const handle = await NodeFSP.open(file, "r");
      let isElf: boolean;
      try {
        const magic = Buffer.alloc(4);
        await handle.read(magic, 0, 4, 0);
        isElf = magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
      } finally {
        await handle.close();
      }
      if (!isElf) continue;
      elfCount++;
      try {
        // readelf inspects either release architecture without executing the binary.
        const { stdout, stderr } = await readelf("readelf", ["--wide", "--version-info", file], {
          env: { ...process.env, LC_ALL: "C" },
          maxBuffer: 16 * 1024 * 1024,
        });
        if (stderr.trim()) throw new Error(stderr.trim());
        const required = parseGlibcNeeds(stdout);
        if (required && compareVersions(required, ceiling) > 0) {
          throw new Error(`requires GLIBC_${required}, exceeding build ceiling ${ceiling}`);
        }
        if (required && (!minimum || compareVersions(required, minimum) > 0)) minimum = required;
      } catch (cause) {
        throw new Error(
          `Cannot validate glibc compatibility of ${file}: ${cause instanceof Error ? cause.message : String(cause)}`,
          { cause },
        );
      }
    }
  }
  await walk(appOutDir);
  if (elfCount === 0 || !minimum) throw new Error(`No glibc requirements found in ${appOutDir}`);
  console.log(
    `[linux-glibc] ${elfCount} ELF files; requires glibc >= ${minimum}; build ceiling ${ceiling}`,
  );
  return { minimum, elfCount };
}
