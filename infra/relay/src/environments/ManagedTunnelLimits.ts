import { and, count, eq, ne } from "drizzle-orm";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as RelayDb from "../db.ts";
import {
  relayManagedEndpointAllocations,
  relayManagedTunnelLimits,
} from "../persistence/schema.ts";

export const DEFAULT_MANAGED_TUNNEL_LIMIT = 3;

export class ManagedTunnelLimitPersistenceError extends Schema.TaggedErrorClass<ManagedTunnelLimitPersistenceError>()(
  "ManagedTunnelLimitPersistenceError",
  {
    operation: Schema.Literals(["load-limit", "count-tunnels", "capacity-reservation"]),
    userId: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Managed tunnel limit '${this.operation}' failed for user '${this.userId}'`;
  }
}

export class ManagedTunnelLimitExceeded extends Schema.TaggedErrorClass<ManagedTunnelLimitExceeded>()(
  "ManagedTunnelLimitExceeded",
  {
    userId: Schema.String,
    environmentId: Schema.String,
    maxTunnels: Schema.Number,
    activeTunnels: Schema.Number,
  },
) {
  override get message(): string {
    return `Managed tunnel limit reached for user '${this.userId}': ${this.activeTunnels} of ${this.maxTunnels} tunnels in use`;
  }
}

export class ManagedTunnelLimits extends Context.Service<
  ManagedTunnelLimits,
  {
    readonly ensureCapacity: (input: {
      readonly userId: string;
      readonly environmentId: string;
    }) => Effect.Effect<void, ManagedTunnelLimitExceeded | ManagedTunnelLimitPersistenceError>;
    readonly withCapacityReservation: <A, E, R>(
      input: {
        readonly userId: string;
        readonly environmentId: string;
      },
      reserve: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | ManagedTunnelLimitExceeded | ManagedTunnelLimitPersistenceError, R>;
  }
>()("t3code-relay/environments/ManagedTunnelLimits") {}

export const make = Effect.gen(function* () {
  const db = yield* RelayDb.RelayDb;

  const ensureCapacity = Effect.fn("relay.managed_tunnel_limits.ensure_capacity")(
    function* (input: { readonly userId: string; readonly environmentId: string }) {
      const overrides = yield* db
        .select({ maxTunnels: relayManagedTunnelLimits.maxTunnels })
        .from(relayManagedTunnelLimits)
        .where(eq(relayManagedTunnelLimits.userId, input.userId))
        .limit(1)
        .pipe(
          Effect.mapError(
            (cause) =>
              new ManagedTunnelLimitPersistenceError({
                operation: "load-limit",
                userId: input.userId,
                cause,
              }),
          ),
        );
      const maxTunnels = overrides[0]?.maxTunnels ?? DEFAULT_MANAGED_TUNNEL_LIMIT;

      const rows = yield* db
        .select({ activeTunnels: count() })
        .from(relayManagedEndpointAllocations)
        .where(
          and(
            eq(relayManagedEndpointAllocations.userId, input.userId),
            ne(relayManagedEndpointAllocations.environmentId, input.environmentId),
          ),
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new ManagedTunnelLimitPersistenceError({
                operation: "count-tunnels",
                userId: input.userId,
                cause,
              }),
          ),
        );
      const activeTunnels = rows[0]?.activeTunnels ?? 0;
      if (activeTunnels >= maxTunnels) {
        return yield* new ManagedTunnelLimitExceeded({
          ...input,
          maxTunnels,
          activeTunnels,
        });
      }
    },
  );

  return ManagedTunnelLimits.of({
    ensureCapacity,
    withCapacityReservation: (input, reserve) =>
      db.$client
        .withTransaction(
          Effect.gen(function* () {
            yield* db.$client`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`;
            yield* ensureCapacity(input);
            return yield* reserve;
          }),
        )
        .pipe(
          Effect.catchTag("SqlError", (cause) =>
            Effect.fail(
              new ManagedTunnelLimitPersistenceError({
                operation: "capacity-reservation",
                userId: input.userId,
                cause,
              }),
            ),
          ),
        ),
  });
});

export const layer = Layer.effect(ManagedTunnelLimits, make);
