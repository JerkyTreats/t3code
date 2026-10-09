import * as NodeURL from "node:url";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { OFFICIAL_DESKTOP_UPDATER_REPOSITORY } from "@t3tools/shared/forkReleaseIdentity";
import { assertNoPublicT3Acquisition } from "./runtime-acquisition-guidance.ts";

const root = NodeURL.fileURLToPath(new URL("../..", import.meta.url));

it.effect("keeps current marketing and documentation guidance registry-free", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const directory of ["apps/marketing/src", "docs"]) {
      const sourceRoot = path.join(root, directory);
      const files = yield* fs.readDirectory(sourceRoot, { recursive: true });
      for (const file of files) {
        if (!/\.(?:astro|md|mdx|ts|tsx|js|jsx)$/.test(file) || file.includes(".test.")) continue;
        const sourcePath = path.join(sourceRoot, file);
        assertNoPublicT3Acquisition(yield* fs.readFileString(sourcePath), sourcePath);
      }
    }
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.each([
  "npx t3",
  "npx --yes t3@latest",
  "pnpm dlx t3@1.2.3",
  "bunx t3",
  "npm exec -- t3",
  "npm install --global t3",
  "npm i -g t3@1.2.3",
  "yarn global add t3",
])("rejects actionable registry acquisition: %s", (command) => {
  assert.throws(() => assertNoPublicT3Acquisition(command, "fixture"), /public package registry/);
});

it.each(["t3 serve", "npx @other/tool", "pnpm dlx another-tool", "npm install vite-plus"])(
  "allows installed T3 launches and unrelated package tooling: %s",
  (command) => assert.doesNotThrow(() => assertNoPublicT3Acquisition(command, "fixture")),
);

it.effect(
  "the retro page copies an installed-runtime command and routes acquisition to exact-origin releases",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const source = yield* fs.readFileString(path.join(root, "apps/marketing/src/pages/95.astro"));
      const releases = yield* fs.readFileString(
        path.join(root, "apps/marketing/src/lib/releases.ts"),
      );
      const input = /<input\b[^>]*\bid="run-command"[^>]*\bvalue="([^"]+)"[^>]*>/.exec(source);
      assert.equal(input?.[1], "t3 serve");
      assert.include(source, 'import { RELEASES_URL } from "../lib/releases"');
      assert.include(source, "href={RELEASES_URL}");
      assert.equal(
        /const REPO = "([^"]+)";/.exec(releases)?.[1],
        OFFICIAL_DESKTOP_UPDATER_REPOSITORY,
      );
      assert.include(
        releases,
        "export const RELEASES_URL = `https://github.com/${REPO}/releases`;",
      );
      assertNoPublicT3Acquisition(source, "retro page");
      assert.throws(
        () =>
          assertNoPublicT3Acquisition(
            source.replace('value="t3 serve"', 'value="npx t3"'),
            "retro page",
          ),
        /public package registry/,
      );
    }).pipe(Effect.provide(NodeServices.layer)),
);
