import { AuthSessionId } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as WebSocketTicketAdmission from "./WebSocketTicketAdmission.ts";

const ticket: WebSocketTicketAdmission.IssuedTicket = {
  nonce: "issued-nonce",
  sessionId: AuthSessionId.make("session-one"),
  expiresAt: 1000,
};
const now = DateTime.makeUnsafe(0);

it.effect("commits one admission across concurrent replacement hosts", () =>
  Effect.gen(function* () {
    const admission = yield* WebSocketTicketAdmission.make;
    yield* admission.register(ticket, now);
    const outcomes = yield* Effect.forEach(
      Array.from({ length: 16 }),
      () => admission.consume(ticket, now).pipe(Effect.result),
      { concurrency: "unbounded" },
    );
    expect(outcomes.filter((outcome) => outcome._tag === "Success")).toHaveLength(1);
    expect((yield* admission.consume(ticket, now).pipe(Effect.flip))._tag).toBe(
      "UnavailableWebSocketTicketError",
    );
  }),
);

it.effect("rejects collisions and exact-record substitutions without consuming the original", () =>
  Effect.gen(function* () {
    const admission = yield* WebSocketTicketAdmission.make;
    yield* admission.register(ticket, now);
    expect(
      (yield* admission.register({ ...ticket, expiresAt: 2000 }, now).pipe(Effect.flip)).reason,
    ).toBe("collision");
    for (const altered of [
      { ...ticket, nonce: "unknown" },
      { ...ticket, sessionId: AuthSessionId.make("other-session") },
      { ...ticket, expiresAt: 2000 },
    ]) {
      expect((yield* admission.consume(altered, now).pipe(Effect.flip))._tag).toBe(
        "UnavailableWebSocketTicketError",
      );
    }
    yield* admission.consume(ticket, now);
  }),
);

it.effect("uses trusted expiry and prunes only expired entries at the exact boundary", () =>
  Effect.gen(function* () {
    const admission = yield* WebSocketTicketAdmission.make;
    yield* admission.register(ticket, now);
    const unrelated = { ...ticket, nonce: "long-lived", expiresAt: 2000 };
    yield* admission.register(unrelated, now);
    const expiredAt = DateTime.makeUnsafe(1000);
    expect((yield* admission.consume(ticket, expiredAt).pipe(Effect.flip))._tag).toBe(
      "UnavailableWebSocketTicketError",
    );
    expect((yield* admission.register(ticket, expiredAt).pipe(Effect.flip)).reason).toBe("expired");
    const fresh = { ...ticket, expiresAt: 3000 };
    yield* admission.register(fresh, expiredAt);
    yield* admission.consume(unrelated, expiredAt);
    yield* admission.consume(fresh, expiredAt);
  }),
);

it.effect("gives an independent replacement host no authority over another owner's tickets", () =>
  Effect.gen(function* () {
    const issuer = yield* WebSocketTicketAdmission.make;
    const foreign = yield* WebSocketTicketAdmission.make;
    yield* issuer.register(ticket, now);
    expect((yield* foreign.consume(ticket, now).pipe(Effect.flip))._tag).toBe(
      "UnavailableWebSocketTicketError",
    );
    yield* issuer.consume(ticket, now);
  }),
);
