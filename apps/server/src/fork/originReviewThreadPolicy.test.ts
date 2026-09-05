import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
class MembershipError extends Schema.TaggedErrorClass<MembershipError>()("MembershipError", {}) {}
import { requireOriginReviewThread } from "./originReviewThreadPolicy.ts";

it.effect(
  "replacement review transport cannot mutate before origin thread membership is proven",
  () =>
    Effect.gen(function* () {
      let mutations = 0;
      const failure = new MembershipError({});
      const mutate = (belongs: boolean) =>
        requireOriginReviewThread(Effect.succeed(belongs), failure).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              mutations += 1;
            }),
          ),
        );
      assert.strictEqual(yield* mutate(false).pipe(Effect.flip), failure);
      assert.equal(mutations, 0);
      yield* mutate(true);
      assert.equal(mutations, 1);
    }),
);
