// @effect-diagnostics nodeBuiltinImport:off - Static architecture test scans source files.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { assert, it } from "@effect/vitest";

const sourceRoot = NodePath.resolve(import.meta.dirname, "..");
const forbiddenImport =
  /from\s+["'][^"']*(?:ProviderService|ProviderSessionDirectory|ProviderSessionReaper|ProviderCommandReactor|ProviderRuntimeIngestion)[^"']*["']/;
// Historical projection tables. Projects remain the V2 project store; Board retains only its named cursor in projection_state.
const legacyTable =
  /\bprojection_(?:threads|thread_messages|thread_activities|thread_proposed_plans|thread_pull_requests|thread_sessions|turns|pending_approvals|state)\b/;
/** Directories whose files may read the V1 tables: the importer and the schema history. */
const legacyReaders = ["orchestration-v2/legacy/", "persistence/Migrations/"] as const;
/**
 * Individual files allowed to read the V1 tables, each with its reason. Keep this
 * list short; new V1 reads belong in the importer.
 */
const legacyReaderFiles: Record<
  string,
  { readonly tables: ReadonlyArray<string>; readonly reason: string }
> = {
  "serverSettings.ts": {
    tables: ["projection_thread_sessions"],
    reason: "one-time provider history for settings migration",
  },
  "orchestration/Layers/Board.ts": {
    tables: ["projection_state"],
    reason: "the surviving global Board owner commits its cursor with publication and correction",
  },
  "orchestration/Layers/BoardQuery.ts": {
    tables: ["projection_state"],
    reason: "the surviving Board query reads its own global cursor",
  },
  "persistence/ProjectionBoardPosts.ts": {
    tables: ["projection_state"],
    reason: "Board current-row reads share one SQL snapshot with their cursor",
  },
  "orchestration-v2/ResourceCleanupService.ts": {
    tables: ["projection_thread_messages"],
    reason: "attachment deletion protects references in the immutable legacy recovery source",
  },
};

/** These standalone fork owners do not provide a V1 thread runtime. */
const retainedOrchestrationFiles = [
  "orchestration/Layers/Board.ts",
  "orchestration/Layers/BoardQuery.ts",
  "orchestration/Services/Board.ts",
  "orchestration/Services/BoardQuery.ts",
  "orchestration/board/Cursor.ts",
] as const;
const retiredPaths = [
  "orchestration/decider.ts",
  "orchestration/projector.ts",
  "orchestration/runtimeLayer.ts",
  "orchestration/Layers/OrchestrationEngine.ts",
  "orchestration/Services/OrchestrationEngine.ts",
  "orchestration/Layers/ProjectionPipeline.ts",
  "orchestration/Services/ProjectionPipeline.ts",
  "orchestration/Layers/ProjectionSnapshotQuery.ts",
  "orchestration/Services/ProjectionSnapshotQuery.ts",
  "orchestration/Layers/ProviderCommandReactor.ts",
  "orchestration/Layers/ProviderRuntimeIngestion.ts",
  "orchestration/Services/ProviderCommandReactor.ts",
  "orchestration/Services/ProviderRuntimeIngestion.ts",
  "persistence/Services/ProjectionThreads.ts",
  "persistence/Services/ProjectionProjects.ts",
] as const;

function productionTypeScriptFiles(directory: string): ReadonlyArray<string> {
  return NodeFS.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.includes(".test.")
      ? [path]
      : [];
  });
}

const relativeSources = productionTypeScriptFiles(sourceRoot).map((path) => ({
  path: NodePath.relative(sourceRoot, path).split(NodePath.sep).join("/"),
  source: NodeFS.readFileSync(path, "utf8"),
}));

it("keeps the V1 agent runtime and engine deleted", () => {
  for (const relativePath of retiredPaths) {
    assert.isFalse(NodeFS.existsSync(NodePath.join(sourceRoot, relativePath)), relativePath);
  }
  assert.deepEqual(
    relativeSources
      .filter(({ path }) => path.startsWith("orchestration/"))
      .map(({ path }) => path)
      .toSorted(),
    [...retainedOrchestrationFiles].toSorted(),
    "Only the declared standalone Board owners may remain under orchestration",
  );
  const violations = relativeSources
    .filter(({ path, source }) => !path.includes("/legacy/") && forbiddenImport.test(source))
    .map(({ path }) => path);
  assert.deepEqual(violations, []);
});

it("limits historical table access to the importer and declared surviving owners", () => {
  const tablesIn = (source: string) =>
    [...source.matchAll(new RegExp(legacyTable, "g"))].map(([table]) => table);
  const readers = relativeSources.flatMap(({ path, source }) => {
    if (legacyReaders.some((directory) => path.startsWith(directory))) return [];
    const allowedTables = legacyReaderFiles[path]?.tables ?? [];
    return tablesIn(source)
      .filter((table) => !allowedTables.includes(table))
      .map((table) => ({ path, table }));
  });
  assert.deepEqual(readers, []);
  // Every permission names an actual surviving read and cannot excuse a different table.
  for (const [path, allowance] of Object.entries(legacyReaderFiles)) {
    const file = relativeSources.find((candidate) => candidate.path === path);
    assert.isTrue(file !== undefined, path);
    for (const table of allowance.tables) {
      assert.isTrue(
        file !== undefined && tablesIn(file.source).includes(table),
        `${path}: ${allowance.reason}`,
      );
    }
  }
});

it("keeps the legacy importer out of reach of new code", () => {
  const importers = relativeSources
    .filter(
      ({ path, source }) =>
        !path.startsWith("orchestration-v2/legacy/") && /from\s+["'][^"']*\/legacy\//.test(source),
    )
    .map(({ path }) => path)
    .toSorted();
  // Startup imports pending transcripts, the V2 runtime wires the importer, and
  // thread and project services hydrate a V1 transcript before they act on it.
  assert.deepEqual(importers, [
    "orchestration-v2/ThreadManagementService.ts",
    "orchestration-v2/runtimeLayer.ts",
    "project/ProjectService.ts",
    "serverRuntimeStartup.ts",
  ]);
});
