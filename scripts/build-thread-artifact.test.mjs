import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { expect, it } from "vite-plus/test";

import {
  buildThreadArtifact,
  parseGitHubRepositoryIdentity,
  readCleanThreadSourceState,
} from "./build-thread-artifact.mjs";
import { parseThreadArtifactSmokeArguments } from "./thread-artifact-smoke.ts";

const COMMIT = "1234567890abcdef1234567890abcdef12345678";

function gitResult(arguments_, overrides = {}) {
  if (arguments_[0] === "rev-parse")
    return { stdout: `${overrides.revision ?? COMMIT}\n`, stderr: "" };
  if (arguments_[0] === "status") return { stdout: overrides.status ?? "", stderr: "" };
  if (arguments_[0] === "remote") {
    return {
      stdout: `${overrides.remote ?? "https://github.com/JerkyTreats/t3code.git"}\n`,
      stderr: "",
    };
  }
  throw new Error(`Unexpected git command: ${arguments_.join(" ")}`);
}

it("normalizes only supported exact GitHub repository URL forms", () => {
  expect(parseGitHubRepositoryIdentity("https://github.com/JerkyTreats/t3code.git")).toBe(
    "JerkyTreats/t3code",
  );
  expect(parseGitHubRepositoryIdentity("git@github.com:JerkyTreats/t3code.git")).toBe(
    "JerkyTreats/t3code",
  );
  expect(parseGitHubRepositoryIdentity("ssh://git@github.com/JerkyTreats/t3code")).toBe(
    "JerkyTreats/t3code",
  );
  expect(parseGitHubRepositoryIdentity("https://example.test/JerkyTreats/t3code")).toBeNull();
});

it("refuses dirty source before deleting output or invoking a build", async () => {
  let mutated = false;
  const commands = [];
  await expect(
    buildThreadArtifact(
      { repositoryRoot: "/synthetic/repository" },
      {
        fileSystem: {
          rm: async () => {
            mutated = true;
          },
        },
        runCommand: async (command, arguments_) => {
          commands.push([command, arguments_]);
          return gitResult(arguments_, { status: " M scripts/source.mjs\n" });
        },
      },
    ),
  ).rejects.toThrow("clean source checkout");
  expect(mutated).toBe(false);
  expect(commands).toEqual([
    ["git", ["rev-parse", "--verify", "HEAD^{commit}"]],
    ["git", ["status", "--porcelain=v1", "--untracked-files=all"]],
  ]);
});

it("rejects a clean checkout whose origin is not the accepted repository", async () => {
  await expect(
    readCleanThreadSourceState("/synthetic/repository", async (_command, arguments_) =>
      gitResult(arguments_, { remote: "https://github.com/example/other.git" }),
    ),
  ).rejects.toThrow("exact official source repository");
});

it("builds through stubs and binds the descriptor to unchanged clean source", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-build-test-"));
  const threadRoot = NodePath.join(root, "apps", "thread");
  const outputDirectory = NodePath.join(threadRoot, "release");
  const launcherSource = NodePath.join(root, "scripts", "thread-launcher.mjs");
  await NodeFSP.mkdir(NodePath.dirname(launcherSource), { recursive: true });
  await NodeFSP.mkdir(threadRoot, { recursive: true });
  await NodeFSP.writeFile(launcherSource, "#!/usr/bin/env node\n", { mode: 0o755 });
  await NodeFSP.writeFile(NodePath.join(threadRoot, "package.json"), '{"version":"1.2.3"}\n');
  const commands = [];
  const runCommand = async (command, arguments_) => {
    commands.push([command, arguments_]);
    if (command === "git") return gitResult(arguments_);
    if (arguments_.includes("electron-builder")) {
      await NodeFSP.mkdir(outputDirectory, { recursive: true });
      await NodeFSP.writeFile(NodePath.join(outputDirectory, "T3-Thread.AppImage"), "artifact\n", {
        mode: 0o755,
      });
    }
    return { stdout: "", stderr: "" };
  };
  try {
    const result = await buildThreadArtifact(
      { repositoryRoot: root, threadRoot, outputDirectory, launcherSource },
      { runCommand },
    );
    expect(result.source).toEqual({
      revision: COMMIT,
      sourceRepository: "JerkyTreats/t3code",
    });
    const descriptor = JSON.parse(await NodeFSP.readFile(result.descriptorPath, "utf8"));
    expect(descriptor).toMatchObject({
      commitHash: COMMIT,
      sourceRepository: "JerkyTreats/t3code",
      artifactFileName: "T3-Thread.AppImage",
      launcherFileName: "t3-thread-launcher.mjs",
    });
    expect(descriptor).not.toHaveProperty("updaterRepository");
    expect(commands.filter(([command]) => command === "pnpm")).toHaveLength(2);
    expect(commands.filter(([command]) => command === "git")).toHaveLength(6);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it("refuses provenance when the source commit changes during the stubbed build", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-build-race-test-"));
  const threadRoot = NodePath.join(root, "apps", "thread");
  const outputDirectory = NodePath.join(threadRoot, "release");
  const launcherSource = NodePath.join(root, "scripts", "thread-launcher.mjs");
  await NodeFSP.mkdir(NodePath.dirname(launcherSource), { recursive: true });
  await NodeFSP.mkdir(threadRoot, { recursive: true });
  await NodeFSP.writeFile(launcherSource, "#!/usr/bin/env node\n", { mode: 0o755 });
  await NodeFSP.writeFile(NodePath.join(threadRoot, "package.json"), '{"version":"1.2.3"}\n');
  let revisionReads = 0;
  const runCommand = async (command, arguments_) => {
    if (command === "git") {
      if (arguments_[0] === "rev-parse") revisionReads += 1;
      return gitResult(arguments_, {
        revision: revisionReads > 1 ? "abcdef1234567890abcdef1234567890abcdef12" : COMMIT,
      });
    }
    if (arguments_.includes("electron-builder")) {
      await NodeFSP.mkdir(outputDirectory, { recursive: true });
      await NodeFSP.writeFile(NodePath.join(outputDirectory, "T3-Thread.AppImage"), "artifact\n", {
        mode: 0o755,
      });
    }
    return { stdout: "", stderr: "" };
  };
  try {
    await expect(
      buildThreadArtifact(
        { repositoryRoot: root, threadRoot, outputDirectory, launcherSource },
        { runCommand },
      ),
    ).rejects.toThrow("source identity changed");
    await expect(
      NodeFSP.lstat(NodePath.join(outputDirectory, "T3-Thread.AppImage.release.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});

it("requires explicit disposable paths and target for every smoke launch", () => {
  const fixtureRoot = "/tmp/t3-thread-disposable";
  expect(
    parseThreadArtifactSmokeArguments([
      "--fixture-root",
      fixtureRoot,
      "--artifact",
      `${fixtureRoot}/T3-Thread.AppImage`,
      "--launcher",
      `${fixtureRoot}/t3-thread-launcher.mjs`,
      "--open",
      "--target",
      "https://thread.example.test/",
    ]),
  ).toMatchObject({ mode: "open", target: "https://thread.example.test/" });
  expect(() => parseThreadArtifactSmokeArguments([])).toThrow("--fixture-root");
  expect(() =>
    parseThreadArtifactSmokeArguments([
      "--fixture-root",
      fixtureRoot,
      "--artifact",
      "/home/example/.local/bin/T3-Thread.AppImage",
      "--launcher",
      `${fixtureRoot}/t3-thread-launcher.mjs`,
    ]),
  ).toThrow("disposable fixture root");
  expect(() =>
    parseThreadArtifactSmokeArguments([
      "--fixture-root",
      fixtureRoot,
      "--artifact",
      `${fixtureRoot}/T3-Thread.AppImage`,
      "--launcher",
      `${fixtureRoot}/t3-thread-launcher.mjs`,
      "--open",
    ]),
  ).toThrow("--target");
});
