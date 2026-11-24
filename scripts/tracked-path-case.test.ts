import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const MODULE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;

// macOS and Windows checkouts resolve paths case-insensitively. Two tracked paths that
// differ only by case, or modules such as `foo.ts` and `Foo.tsx` that an extensionless
// import cannot tell apart, break builds there while Linux builds pass. Vendored
// `.repos/` references are never built, so their own spellings are left alone.
it.layer(NodeServices.layer)("tracked path case", (it) => {
  it.effect("no two tracked paths or module specifiers differ only by case", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const listing = yield* spawner.string(
        ChildProcess.make("git", ["ls-files", "-z", "--", ".", ":!.repos"], {
          cwd: path.join(import.meta.dirname, ".."),
        }),
      );

      const spellingsByFoldedKey = new Map<string, Set<string>>();
      for (const tracked of listing.split("\0").filter((entry) => entry.length > 0)) {
        for (const key of new Set([tracked, tracked.replace(MODULE_EXTENSION, "")])) {
          const folded = key.toLowerCase();
          spellingsByFoldedKey.set(
            folded,
            (spellingsByFoldedKey.get(folded) ?? new Set()).add(key),
          );
        }
      }
      const collisions = [...spellingsByFoldedKey.values()]
        .filter((spellings) => spellings.size > 1)
        .map((spellings) => [...spellings].toSorted());

      assert.deepEqual(collisions, []);
    }),
  );
});
