import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeOS from "node:os";
import * as NodeEvents from "node:events";
import { expect, it } from "vite-plus/test";
import { prepareThreadRelease, verifyThreadRelease, spawnAppImage } from "./thread-launcher.mjs";

async function fixture(run) {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-prepared-test-"));
  const artifact = NodePath.join(root, "Thread.AppImage");
  await NodeFSP.writeFile(artifact, "synthetic release one", { mode: 0o755 });
  let extractions = 0;
  const extract = async (_artifact, args, options) => {
    expect(args).toEqual(["--appimage-extract"]);
    extractions++;
    const code = NodePath.join(options.cwd, "squashfs-root");
    await NodeFSP.mkdir(code);
    await NodeFSP.writeFile(
      NodePath.join(code, "t3-thread"),
      "#!/usr/bin/env node\nprocess.stdin.resume();\n",
      { mode: 0o755 },
    );
    await NodeFSP.writeFile(NodePath.join(code, "resource"), "release resource", { mode: 0o644 });
    await NodeFSP.symlink("resource", NodePath.join(code, "resource-link"));
  };
  try {
    await run({ root, artifact, extract, count: () => extractions });
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
}

it("prepares once and verifies reuse without extracting or rewriting code", () =>
  fixture(async ({ artifact, extract, count }) => {
    const executable = await prepareThreadRelease(artifact, { extract });
    const before = await NodeFSP.stat(executable);
    expect(await prepareThreadRelease(artifact, { extract })).toBe(executable);
    expect(await verifyThreadRelease(artifact)).toBe(executable);
    expect(count()).toBe(1);
    expect((await NodeFSP.stat(executable)).ino).toBe(before.ino);
    expect((await NodeFSP.stat(executable)).mtimeMs).toBe(before.mtimeMs);
  }));

it("normalizes generated AppImage icon permissions before sealing the release", () =>
  fixture(async ({ artifact, extract }) => {
    const executable = await prepareThreadRelease(artifact, {
      extract: async (...args) => {
        await extract(...args);
        const apps = NodePath.join(
          args[2].cwd,
          "squashfs-root/usr/share/icons/hicolor/128x128/apps",
        );
        await NodeFSP.mkdir(apps, { recursive: true });
        const icon = NodePath.join(apps, "t3-thread.png");
        await NodeFSP.writeFile(icon, "synthetic icon");
        await NodeFSP.chmod(icon, 0o664);
      },
    });
    const icon = NodePath.join(
      NodePath.dirname(executable),
      "usr/share/icons/hicolor/128x128/apps/t3-thread.png",
    );
    expect((await NodeFSP.stat(icon)).mode & 0o777).toBe(0o644);
    expect(await verifyThreadRelease(artifact)).toBe(executable);
  }));

it("publishes one complete release under concurrent cold preparation", () =>
  fixture(async ({ root, artifact, extract }) => {
    const paths = await Promise.all([
      prepareThreadRelease(artifact, { extract }),
      prepareThreadRelease(artifact, { extract }),
    ]);
    expect(paths[0]).toBe(paths[1]);
    expect(await NodeFSP.readdir(NodePath.join(root, ".t3-thread-releases"))).toHaveLength(1);
    expect(await verifyThreadRelease(artifact)).toBe(paths[0]);
  }));

for (const mutation of ["content", "missing", "extra", "mode", "link", "manifest"]) {
  it(`rejects ${mutation} damage without silently repairing a published release`, () =>
    fixture(async ({ artifact, extract, count }) => {
      const executable = await prepareThreadRelease(artifact, { extract });
      const code = NodePath.dirname(executable);
      if (mutation === "content")
        await NodeFSP.writeFile(NodePath.join(code, "resource"), "tampered");
      if (mutation === "missing") await NodeFSP.unlink(NodePath.join(code, "resource-link"));
      if (mutation === "extra") await NodeFSP.writeFile(NodePath.join(code, "extra"), "unexpected");
      if (mutation === "mode") await NodeFSP.chmod(executable, 0o777);
      if (mutation === "link") {
        await NodeFSP.unlink(NodePath.join(code, "resource-link"));
        await NodeFSP.symlink("/etc/passwd", NodePath.join(code, "resource-link"));
      }
      if (mutation === "manifest")
        await NodeFSP.writeFile(NodePath.join(code, "..", "release.json"), "{}");
      await expect(prepareThreadRelease(artifact, { extract })).rejects.toThrow();
      expect(count()).toBe(1);
    }));
}

it("discards only unpublished staging after failed extraction or unsafe code", () =>
  fixture(async ({ root, artifact, extract }) => {
    await expect(
      prepareThreadRelease(artifact, {
        extract: async () => {
          throw new Error("fixture extraction failed");
        },
      }),
    ).rejects.toThrow("fixture extraction failed");
    expect(await NodeFSP.readdir(NodePath.join(root, ".t3-thread-releases"))).toEqual([]);
    await expect(
      prepareThreadRelease(artifact, {
        extract: async (...args) => {
          await extract(...args);
          await NodeFSP.symlink(
            "/etc/passwd",
            NodePath.join(args[2].cwd, "squashfs-root", "escape"),
          );
        },
      }),
    ).rejects.toThrow("escapes");
    expect(await NodeFSP.readdir(NodePath.join(root, ".t3-thread-releases"))).toEqual([]);
  }));

it("rejects an artifact that changes during expansion", () =>
  fixture(async ({ root, artifact, extract }) => {
    await expect(
      prepareThreadRelease(artifact, {
        extract: async (...args) => {
          await extract(...args);
          await NodeFSP.writeFile(artifact, "different artifact");
        },
      }),
    ).rejects.toThrow("changed during preparation");
    expect(await NodeFSP.readdir(NodePath.join(root, ".t3-thread-releases"))).toEqual([]);
  }));

it("does not write through a linked preparation directory", () =>
  fixture(async ({ root, artifact, extract }) => {
    const other = NodePath.join(root, "other");
    await NodeFSP.mkdir(other);
    await NodeFSP.symlink(other, NodePath.join(root, ".t3-thread-releases"));
    await expect(prepareThreadRelease(artifact, { extract })).rejects.toThrow(
      "directory is unsafe",
    );
    expect(await NodeFSP.readdir(other)).toEqual([]);
  }));

it("keeps concurrent clients and old release code alive across another release preparation", () =>
  fixture(async ({ root, artifact, extract }) => {
    const executable = await prepareThreadRelease(artifact, { extract });
    const runtime = NodePath.join(root, "runtime");
    await NodeFSP.mkdir(runtime, { mode: 0o700 });
    const children = [];
    try {
      for (let index = 0; index < 2; index++) {
        const launched = await spawnAppImage(artifact, {
          environment: { ...process.env, XDG_RUNTIME_DIR: runtime },
        });
        children.push(launched);
        await NodeEvents.once(launched.child, "spawn");
      }
      expect(children[0].child.pid).not.toBe(children[1].child.pid);
      const exit = NodeEvents.once(children[0].child, "exit");
      children[0].child.kill("SIGTERM");
      await exit;
      children[0].cleanup({ childExited: true });
      await NodeFSP.writeFile(artifact, "synthetic release two");
      expect(await prepareThreadRelease(artifact, { extract })).not.toBe(executable);
      expect(await NodeFSP.readFile(executable, "utf8")).toContain("process.stdin.resume");
      expect(children[1].child.exitCode).toBeNull();
      expect(children[1].child.signalCode).toBeNull();
    } finally {
      for (const launched of children) {
        if (launched.child.exitCode === null && launched.child.signalCode === null) {
          const exit = NodeEvents.once(launched.child, "exit");
          launched.child.kill("SIGTERM");
          await exit;
        }
        launched.cleanup({ childExited: true });
      }
    }
  }));
