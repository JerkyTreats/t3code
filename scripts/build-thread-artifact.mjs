import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeProcess from "node:process";
import * as NodeURL from "node:url";

import {
  OFFICIAL_THREAD_ARTIFACT_NAME,
  OFFICIAL_THREAD_LAUNCHER_NAME,
  OFFICIAL_THREAD_SOURCE_REPOSITORY,
  THREAD_BUILD_ARCHITECTURE,
  writeLinuxThreadReleaseDescriptor,
} from "./linux-thread-release-artifact.mjs";

const runtimeProcess = process;

function defaultRunCommand(command, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = NodeChildProcess.spawn(command, arguments_, {
      cwd: options.cwd,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    const stdout = [];
    const stderr = [];
    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(result);
      else {
        reject(
          new Error(
            `${command} failed with ${signal ?? `exit ${String(code)}`}: ${result.stderr.trim()}`,
          ),
        );
      }
    });
  });
}

export function parseGitHubRepositoryIdentity(remoteUrl) {
  const normalized = remoteUrl
    .trim()
    .replace(/\/+$/u, "")
    .replace(/\.git$/u, "");
  const match = normalized.match(
    /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/]+)\/([^/]+)$/u,
  );
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function readCleanThreadSourceState(repositoryRoot, runCommand = defaultRunCommand) {
  const command = async (arguments_) =>
    runCommand("git", arguments_, { cwd: repositoryRoot, capture: true });
  const revision = (await command(["rev-parse", "--verify", "HEAD^{commit}"])).stdout.trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error("Could not resolve the exact source commit for the T3 Thread release.");
  }
  const status = (await command(["status", "--porcelain=v1", "--untracked-files=all"])).stdout;
  if (status.length !== 0) {
    throw new Error("T3 Thread artifacts require a clean source checkout.");
  }
  const remoteUrl = (await command(["remote", "get-url", "origin"])).stdout.trim();
  if (parseGitHubRepositoryIdentity(remoteUrl) !== OFFICIAL_THREAD_SOURCE_REPOSITORY) {
    throw new Error("T3 Thread artifacts require the exact official source repository.");
  }
  return { revision, sourceRepository: OFFICIAL_THREAD_SOURCE_REPOSITORY };
}

export async function buildThreadArtifact(options = {}, dependencies = {}) {
  const repositoryRoot = options.repositoryRoot ?? NodePath.resolve(import.meta.dirname, "..");
  const threadRoot = options.threadRoot ?? NodePath.join(repositoryRoot, "apps", "thread");
  const outputDirectory = options.outputDirectory ?? NodePath.join(threadRoot, "release");
  const launcherSource =
    options.launcherSource ?? NodePath.join(repositoryRoot, "scripts", "thread-launcher.mjs");
  const launcherOutput = NodePath.join(outputDirectory, OFFICIAL_THREAD_LAUNCHER_NAME);
  const fileSystem = dependencies.fileSystem ?? NodeFSP;
  const runCommand = dependencies.runCommand ?? defaultRunCommand;

  // Provenance is admitted before any output deletion or build-side mutation.
  const initialSource = await readCleanThreadSourceState(repositoryRoot, runCommand);
  await fileSystem.rm(outputDirectory, { recursive: true, force: true });
  await runCommand("pnpm", ["--filter", "@t3tools/thread", "build"], {
    cwd: repositoryRoot,
  });
  await runCommand(
    "pnpm",
    [
      "--filter",
      "@t3tools/thread",
      "exec",
      "electron-builder",
      "--linux",
      "AppImage",
      `--${THREAD_BUILD_ARCHITECTURE}`,
      "--publish",
      "never",
    ],
    { cwd: repositoryRoot },
  );
  await fileSystem.copyFile(launcherSource, launcherOutput);
  await fileSystem.chmod(launcherOutput, 0o755);

  const appImages = (await fileSystem.readdir(outputDirectory)).filter((name) =>
    name.endsWith(".AppImage"),
  );
  if (appImages.length !== 1 || appImages[0] !== OFFICIAL_THREAD_ARTIFACT_NAME) {
    throw new Error(
      `Expected exactly ${OFFICIAL_THREAD_ARTIFACT_NAME}, found ${appImages.length} AppImage files.`,
    );
  }
  const finalSource = await readCleanThreadSourceState(repositoryRoot, runCommand);
  if (
    finalSource.revision !== initialSource.revision ||
    finalSource.sourceRepository !== initialSource.sourceRepository
  ) {
    throw new Error("T3 Thread source identity changed during the artifact build.");
  }

  const artifactPath = NodePath.join(outputDirectory, OFFICIAL_THREAD_ARTIFACT_NAME);
  const packageDocument = JSON.parse(
    await fileSystem.readFile(NodePath.join(threadRoot, "package.json"), "utf8"),
  );
  const { descriptorPath } = await writeLinuxThreadReleaseDescriptor({
    artifactPath,
    launcherPath: launcherOutput,
    version: packageDocument.version,
    commitHash: initialSource.revision,
    architecture: THREAD_BUILD_ARCHITECTURE,
  });
  return { artifactPath, launcherPath: launcherOutput, descriptorPath, source: initialSource };
}

async function main() {
  const result = await buildThreadArtifact();
  NodeProcess.stdout.write(
    `${result.artifactPath}\n${result.launcherPath}\n${result.descriptorPath}\n`,
  );
}

if (
  NodeProcess.argv[1] &&
  NodePath.resolve(NodeProcess.argv[1]) === NodeURL.fileURLToPath(import.meta.url)
) {
  main().catch((cause) => {
    NodeProcess.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    runtimeProcess.exitCode = 1;
  });
}
