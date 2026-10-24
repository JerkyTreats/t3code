import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { runDoctor } from "./doctor.ts";
import { DatabaseMaintenance } from "../persistence/DatabaseMaintenance.ts";

it.effect(
  "--fix reclaims space and keeps the legacy rollback database, and --dry-run changes nothing",
  () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const doctor = (dryRun: boolean) =>
        runDoctor("/test/statev2.sqlite", { fix: true, dryRun, interactive: false }).pipe(
          Effect.provide(
            Layer.mergeAll(
              NodeServices.layer,
              Layer.succeed(DatabaseMaintenance, {
                // An unconverted database: reclaiming space is recommended.
                // The legacy database sits beside it and is never a repair.
                inspect: () =>
                  Effect.succeed({
                    databaseBytes: 2000,
                    reclaimableBytes: 1000,
                    incrementalVacuumEnabled: false,
                    legacyDatabaseBytes: 4000,
                  }),
                compact: () =>
                  Effect.sync(() => {
                    calls.push("compact");
                    return {
                      beforeBytes: 2000,
                      afterBytes: 1000,
                      deletedEventCount: 1,
                      deletedReceiptCount: 0,
                    };
                  }),
              }),
            ),
          ),
        );
      yield* doctor(true);
      assert.deepEqual(calls, []);
      yield* doctor(false);
      assert.deepEqual(calls, ["compact"]);
    }),
);

it.effect("offers no repair when only the legacy rollback database is present", () =>
  Effect.gen(function* () {
    const calls: string[] = [];
    yield* runDoctor("/test/statev2.sqlite", { fix: true, dryRun: false, interactive: false }).pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeServices.layer,
          Layer.succeed(DatabaseMaintenance, {
            inspect: () =>
              Effect.succeed({
                databaseBytes: 2000,
                reclaimableBytes: 0,
                incrementalVacuumEnabled: true,
                legacyDatabaseBytes: 4000,
              }),
            compact: () =>
              Effect.sync(() => {
                calls.push("compact");
                return {
                  beforeBytes: 0,
                  afterBytes: 0,
                  deletedEventCount: 0,
                  deletedReceiptCount: 0,
                };
              }),
          }),
        ),
      ),
    );
    assert.deepEqual(calls, []);
  }),
);
