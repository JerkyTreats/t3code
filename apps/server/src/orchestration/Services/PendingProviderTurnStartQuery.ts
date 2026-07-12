/**
 * PendingProviderTurnStartQuery - Durable pending provider intent enumeration.
 *
 * Joins pending turn projections to their original event journal records so
 * restart recovery retains the accepted command and event identities.
 *
 * @module PendingProviderTurnStartQuery
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../../persistence/Errors.ts";

export type PendingProviderTurnStart = Extract<
  OrchestrationEvent,
  { type: "thread.turn-start-requested" }
>;

export interface PendingProviderTurnStartQueryShape {
  /**
   * Lists a bounded sequence page of durable intents that remain pending.
   */
  readonly list: (
    sequenceExclusive: number,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<PendingProviderTurnStart>, ProjectionRepositoryError>;
}

export class PendingProviderTurnStartQuery extends Context.Service<
  PendingProviderTurnStartQuery,
  PendingProviderTurnStartQueryShape
>()("t3/orchestration/Services/PendingProviderTurnStartQuery") {}
