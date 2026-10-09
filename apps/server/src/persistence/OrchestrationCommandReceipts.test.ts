import { assert, it } from "@effect/vitest";
import { BOARD_AGGREGATE_ID, CommandId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as Receipts from "./OrchestrationCommandReceipts.ts";
import * as SqlitePersistence from "./Sqlite.ts";

it.effect("round-trips Board command receipts through the flattened repository", () =>
  Effect.gen(function* () {
    const repository = yield* Receipts.OrchestrationCommandReceiptRepository;
    const receipt: Receipts.OrchestrationCommandReceipt = {
      commandId: CommandId.make("synthetic-board-command"),
      aggregateKind: "board",
      aggregateId: BOARD_AGGREGATE_ID,
      commandType: "board.post.create",
      acceptedAt: "2026-10-01T00:00:00.000Z",
      resultSequence: 1,
      status: "accepted",
      error: null,
    };
    assert.isTrue(yield* repository.insertIfAbsent(receipt));
    assert.isFalse(yield* repository.insertIfAbsent(receipt));
    assert.deepStrictEqual(
      yield* repository.getByCommandId({ commandId: receipt.commandId }),
      Option.some(receipt),
    );
    const updated = { ...receipt, resultSequence: 2 };
    yield* repository.upsert(updated);
    assert.deepStrictEqual(
      yield* repository.getByCommandId({ commandId: receipt.commandId }),
      Option.some(updated),
    );
  }).pipe(Effect.provide(Receipts.layer.pipe(Layer.provide(SqlitePersistence.layerMemory)))),
);
