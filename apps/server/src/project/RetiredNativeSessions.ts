// @effect-diagnostics-next-line nodeBuiltinImport:off -- persisted identity membership needs synchronous SHA-256; Effect Crypto exposes an effectful digest.
import * as NodeCrypto from "node:crypto";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";

// These persisted fingerprints predate this intake. Keep the exact driver,
// NUL separator and native identity bytes; provider instance names are not keys.
export const fingerprint = (driver: string, nativeId: string): string =>
  NodeCrypto.createHash("sha256").update(`${driver}\0${nativeId}`).digest("hex");

export class RetiredNativeSessions extends Context.Service<
  RetiredNativeSessions,
  {
    readonly contains: (driver: string, nativeId: string) => boolean;
  }
>()("t3/project/RetiredNativeSessions") {}

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const fingerprints = yield* Effect.gen(function* () {
    const tables = yield* sql<{ name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
          AND name IN ('manual_recovery_native_fences', 'manual_recovery_guard')
      `;
    if (tables.length === 0) return new Set<string>();
    if (tables.length !== 2) {
      return yield* Effect.die("Retired native session fingerprint proof is incomplete");
    }
    const ready = yield* sql<{ native_fences_ready: number }>`
        SELECT native_fences_ready FROM manual_recovery_guard WHERE id = 1
      `;
    if (ready[0]?.native_fences_ready !== 1) {
      return yield* Effect.die("Retired native session fingerprints are not ready");
    }
    const rows = yield* sql<{ fingerprint: string }>`
        SELECT fingerprint FROM manual_recovery_native_fences
      `;
    return new Set(rows.map((row) => row.fingerprint));
  }).pipe(Effect.orDie);
  return RetiredNativeSessions.of({
    contains: (driver, nativeId) => fingerprints.has(fingerprint(driver, nativeId)),
  });
});

export const layer = Layer.effect(RetiredNativeSessions, make);
