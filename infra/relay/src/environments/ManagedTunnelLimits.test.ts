import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as RelayDb from "../db.ts";
import {
  relayManagedEndpointAllocations,
  relayManagedTunnelLimits,
} from "../persistence/schema.ts";
import * as ManagedTunnelLimits from "./ManagedTunnelLimits.ts";

function layerWithCounts(input: { readonly override?: number; readonly activeTunnels: number }) {
  let selection = 0;
  const db = {
    select: () => {
      selection += 1;
      if (selection === 1) {
        return {
          from: (table: unknown) => {
            expect(table).toBe(relayManagedTunnelLimits);
            return {
              where: () => ({
                limit: () =>
                  Effect.succeed(
                    input.override === undefined ? [] : [{ maxTunnels: input.override }],
                  ),
              }),
            };
          },
        };
      }
      return {
        from: (table: unknown) => {
          expect(table).toBe(relayManagedEndpointAllocations);
          return {
            where: () => Effect.succeed([{ activeTunnels: input.activeTunnels }]),
          };
        },
      };
    },
  } as unknown as RelayDb.RelayDb["Service"];

  return ManagedTunnelLimits.layer.pipe(Layer.provide(Layer.succeed(RelayDb.RelayDb, db)));
}

describe("ManagedTunnelLimits", () => {
  it.effect("rejects a new environment at the default account limit", () =>
    Effect.gen(function* () {
      const limits = yield* ManagedTunnelLimits.ManagedTunnelLimits;
      const error = yield* Effect.flip(
        limits.ensureCapacity({
          userId: "user-1",
          environmentId: "environment-new",
        }),
      );

      expect(error).toMatchObject({
        _tag: "ManagedTunnelLimitExceeded",
        userId: "user-1",
        environmentId: "environment-new",
        maxTunnels: ManagedTunnelLimits.DEFAULT_MANAGED_TUNNEL_LIMIT,
        activeTunnels: 3,
      });
    }).pipe(Effect.provide(layerWithCounts({ activeTunnels: 3 }))),
  );

  it.effect("honors a per-user capacity override", () =>
    Effect.gen(function* () {
      const limits = yield* ManagedTunnelLimits.ManagedTunnelLimits;
      yield* limits.ensureCapacity({
        userId: "user-1",
        environmentId: "environment-new",
      });
    }).pipe(Effect.provide(layerWithCounts({ override: 5, activeTunnels: 3 }))),
  );

  it.effect("identifies failures while loading the configured limit", () => {
    const cause = new Error("database unavailable");
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Effect.fail(cause),
          }),
        }),
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const limits = yield* ManagedTunnelLimits.ManagedTunnelLimits;
      const error = yield* Effect.flip(
        limits.ensureCapacity({
          userId: "user-1",
          environmentId: "environment-new",
        }),
      );

      expect(error).toMatchObject({
        _tag: "ManagedTunnelLimitPersistenceError",
        operation: "load-limit",
        userId: "user-1",
        cause,
      });
    }).pipe(
      Effect.provide(
        ManagedTunnelLimits.layer.pipe(Layer.provide(Layer.succeed(RelayDb.RelayDb, db))),
      ),
    );
  });

  it.effect("serializes capacity checks and reservations with a per-user database lock", () => {
    const sqlCalls: string[] = [];
    const client = Object.assign(
      (strings: TemplateStringsArray) => {
        sqlCalls.push(strings.join("?"));
        return Effect.void;
      },
      {
        withTransaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
      },
    );
    let selection = 0;
    const db = {
      $client: client,
      select: () => {
        selection += 1;
        return selection === 1
          ? {
              from: () => ({
                where: () => ({ limit: () => Effect.succeed([]) }),
              }),
            }
          : {
              from: () => ({
                where: () => Effect.succeed([{ activeTunnels: 2 }]),
              }),
            };
      },
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const limits = yield* ManagedTunnelLimits.ManagedTunnelLimits;
      const result = yield* limits.withCapacityReservation(
        { userId: "user-1", environmentId: "environment-new" },
        Effect.succeed("reserved"),
      );

      expect(result).toBe("reserved");
      expect(sqlCalls).toEqual(["SELECT pg_advisory_xact_lock(hashtextextended(?, 0))"]);
    }).pipe(
      Effect.provide(
        ManagedTunnelLimits.layer.pipe(Layer.provide(Layer.succeed(RelayDb.RelayDb, db))),
      ),
    );
  });
});
