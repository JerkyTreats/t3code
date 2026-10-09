import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as SqlClient from "effect/sql/SqlClient";

import * as RetiredNativeSessions from "./RetiredNativeSessions.ts";

const prepareProof = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE manual_recovery_guard (id INTEGER PRIMARY KEY, native_fences_ready INTEGER)`;
  yield* sql`CREATE TABLE manual_recovery_native_fences (fingerprint TEXT PRIMARY KEY)`;
  yield* sql`INSERT INTO manual_recovery_guard VALUES (1, 1)`;
  yield* sql`INSERT INTO manual_recovery_native_fences VALUES
    ('5503d3d5910cce9fde3d9b3880b1e1071a2686ded8adb1192bfa10c0e3b3cc7e')`;
});

it.layer(NodeServices.layer)("RetiredNativeSessions", (it) => {
  it.effect("leaves a fresh database unchanged and admits ordinary identities", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const retired = yield* RetiredNativeSessions.make;
      expect(retired.contains("codex", "retired-session")).toBe(false);
      expect(yield* sql`SELECT name FROM sqlite_master WHERE type = 'table'`).toEqual([]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect(
    "reads the deployed fingerprint bytes without modifying proof or taking runtime holds",
    () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* prepareProof;
        yield* sql`PRAGMA query_only = ON`;
        const retired = yield* RetiredNativeSessions.make;
        expect(retired.contains("codex", "retired-session")).toBe(true);
        expect(retired.contains("codex", "ordinary-session")).toBe(false);
        expect(retired.contains("claudeAgent", "retired-session")).toBe(false);
        expect(yield* sql`SELECT native_fences_ready FROM manual_recovery_guard`).toEqual([
          { native_fences_ready: 1 },
        ]);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect.each([0, null])("refuses an unready proof with readiness %s", (ready) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* prepareProof;
      yield* sql`UPDATE manual_recovery_guard SET native_fences_ready = ${ready}`;
      expect(Exit.isFailure(yield* Effect.exit(RetiredNativeSessions.make))).toBe(true);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect.each(["manual_recovery_guard", "manual_recovery_native_fences"])(
    "refuses incomplete proof when %s is missing",
    (table) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* prepareProof;
        yield* sql.unsafe(`DROP TABLE ${table}`);
        expect(Exit.isFailure(yield* Effect.exit(RetiredNativeSessions.make))).toBe(true);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
