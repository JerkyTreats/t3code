// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as Schema from "effect/Schema";

import { runMigrations } from "../persistence/Migrations.ts";
import { cleanupUnretainedAttachments } from "./ResourceCleanupService.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

it.effect("keeps legacy recovery attachments while deleting unreferenced V2 files", () => {
  const attachmentsDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-retained-files-"));
  const retainedId = "11111111-1111-4111-8111-111111111111";
  const unreferencedId = "22222222-2222-4222-8222-222222222222";
  const retainedPath = NodePath.join(attachmentsDir, `${retainedId}.png`);
  const unreferencedPath = NodePath.join(attachmentsDir, `${unreferencedId}.png`);
  NodeFS.writeFileSync(retainedPath, "synthetic retained attachment");
  NodeFS.writeFileSync(unreferencedPath, "synthetic removable attachment");
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations();
    yield* sql`INSERT INTO projection_thread_messages (
      message_id, thread_id, role, text, attachments_json, is_streaming, created_at, updated_at
    ) VALUES ('synthetic-message', 'synthetic-legacy-thread', 'user', 'Recovery attachment',
      ${encodeJson([{ type: "image", id: retainedId }])}, 0, '2026-01-01', '2026-01-01')`;
    // No V2 thread remains to claim either file. The historical transcript is
    // sufficient to retain its attachment across deletion, cleanup and reopen.
    yield* cleanupUnretainedAttachments(attachmentsDir, [retainedId, unreferencedId]);
    assert.equal(NodeFS.readFileSync(retainedPath, "utf8"), "synthetic retained attachment");
    assert.isFalse(NodeFS.existsSync(unreferencedPath));
    yield* cleanupUnretainedAttachments(attachmentsDir, [retainedId, unreferencedId]);
    assert.isTrue(NodeFS.existsSync(retainedPath));
  }).pipe(
    Effect.provide(
      Layer.mergeAll(NodeServices.layer, NodeSqliteClient.layer({ filename: ":memory:" })),
    ),
    Effect.ensuring(
      Effect.sync(() => NodeFS.rmSync(attachmentsDir, { recursive: true, force: true })),
    ),
  );
});
