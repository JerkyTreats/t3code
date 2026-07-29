import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PgDialect } from "drizzle-orm/pg-core";

import * as RelayDb from "../db.ts";
import { relayManagedEndpointAllocations } from "../persistence/schema.ts";
import * as ManagedEndpointAllocations from "./ManagedEndpointAllocations.ts";

const layerWithDb = (db: RelayDb.RelayDb["Service"]) =>
  ManagedEndpointAllocations.layer.pipe(Layer.provide(Layer.succeed(RelayDb.RelayDb, db)));

describe("ManagedEndpointAllocations", () => {
  it.effect("retains database failures with allocation operation and identity", () => {
    const cause = new Error("database unavailable");
    const fakeDb = {
      select: () => ({
        from: (table: unknown) => {
          expect(table).toBe(relayManagedEndpointAllocations);
          return {
            where: () => ({
              limit: () => Effect.fail(cause),
            }),
          };
        },
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const allocations = yield* ManagedEndpointAllocations.ManagedEndpointAllocations;
      const error = yield* Effect.flip(
        allocations.get({ userId: "user-1", environmentId: "environment-1" }),
      );

      expect(error).toMatchObject({
        _tag: "ManagedEndpointAllocationPersistenceError",
        operation: "get",
        stage: "database-request",
        userId: "user-1",
        environmentId: "environment-1",
      });
      expect(error.cause).toBe(cause);
    }).pipe(Effect.provide(layerWithDb(fakeDb)));
  });

  it.effect("reports an unresolved reservation without manufacturing a cause", () => {
    const fakeDb = {
      insert: (table: unknown) => {
        expect(table).toBe(relayManagedEndpointAllocations);
        return {
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => Effect.succeed([]),
            }),
          }),
        };
      },
      select: () => ({
        from: (table: unknown) => {
          expect(table).toBe(relayManagedEndpointAllocations);
          return {
            where: () => ({
              limit: () => Effect.succeed([]),
            }),
          };
        },
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const allocations = yield* ManagedEndpointAllocations.ManagedEndpointAllocations;
      const error = yield* Effect.flip(
        allocations.reserve({
          userId: "user-1",
          environmentId: "environment-1",
          hostname: "environment-1.example.test",
          tunnelName: "environment-1-tunnel",
        }),
      );

      expect(error).toMatchObject({
        _tag: "ManagedEndpointAllocationPersistenceError",
        operation: "reserve",
        stage: "resolve-reservation",
        userId: "user-1",
        environmentId: "environment-1",
        hostname: "environment-1.example.test",
        tunnelName: "environment-1-tunnel",
      });
      expect(error.cause).toBeUndefined();
      expect(error.message).toContain("'resolve-reservation'");
    }).pipe(Effect.provide(layerWithDb(fakeDb)));
  });

  it.effect("claims deprovision with an integer generation independent of clock collisions", () => {
    let values: Record<string, unknown> | undefined;
    let condition: unknown;
    const fakeDb = {
      update: () => ({
        set: (next: Record<string, unknown>) => {
          values = next;
          return {
            where: (nextCondition: unknown) => {
              condition = nextCondition;
              return {
                returning: () => Effect.succeed([{ generation: 8 }]),
              };
            },
          };
        },
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const allocations = yield* ManagedEndpointAllocations.ManagedEndpointAllocations;
      expect(
        yield* allocations.claimDeprovision({
          userId: "user-1",
          environmentId: "environment-1",
          generation: 7,
        }),
      ).toBe(8);

      expect(new PgDialect().sqlToQuery(values?.generation as never).sql).toContain(
        '"generation" + 1',
      );
      const claim = new PgDialect().sqlToQuery(condition as never);
      expect(claim.sql).toContain('"generation" = $3');
      expect(claim.params).toEqual(["user-1", "environment-1", 7]);
    }).pipe(Effect.provide(layerWithDb(fakeDb)));
  });

  it.effect("loses release claims unless tunnel id and generation still match", () => {
    let condition: unknown;
    const fakeDb = {
      update: () => ({
        set: () => ({
          where: (nextCondition: unknown) => {
            condition = nextCondition;
            return { returning: () => Effect.succeed([]) };
          },
        }),
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const allocations = yield* ManagedEndpointAllocations.ManagedEndpointAllocations;
      expect(
        yield* allocations.claimRelease({
          userId: "user-1",
          environmentId: "environment-1",
          tunnelId: "tunnel-1",
          generation: 7,
        }),
      ).toBe(false);

      const claim = new PgDialect().sqlToQuery(condition as never);
      expect(claim.sql).toContain('"tunnel_id" = $3');
      expect(claim.sql).toContain('"generation" = $4');
      expect(claim.params).toEqual(["user-1", "environment-1", "tunnel-1", 7]);
    }).pipe(Effect.provide(layerWithDb(fakeDb)));
  });

  it.effect("removes only the allocation generation owned by cleanup", () => {
    let condition: unknown;
    const fakeDb = {
      delete: () => ({
        where: (nextCondition: unknown) => {
          condition = nextCondition;
          return { returning: () => Effect.succeed([]) };
        },
      }),
    } as unknown as RelayDb.RelayDb["Service"];

    return Effect.gen(function* () {
      const allocations = yield* ManagedEndpointAllocations.ManagedEndpointAllocations;
      expect(
        yield* allocations.removeClaimed({
          userId: "user-1",
          environmentId: "environment-1",
          generation: 8,
        }),
      ).toBe(false);

      const claim = new PgDialect().sqlToQuery(condition as never);
      expect(claim.sql).toContain('"generation" = $3');
      expect(claim.params).toEqual(["user-1", "environment-1", 8]);
    }).pipe(Effect.provide(layerWithDb(fakeDb)));
  });
});
