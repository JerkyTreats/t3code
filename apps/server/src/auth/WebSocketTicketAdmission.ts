import { AuthSessionId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

// A runtime-wide limit bounds both retained state and lazy expiry scan work.
const MAX_PENDING_TICKETS = 4096;

export interface IssuedTicket {
  readonly nonce: string;
  readonly sessionId: AuthSessionId;
  readonly expiresAt: number;
}

export class WebSocketTicketRegistrationError extends Schema.TaggedErrorClass<WebSocketTicketRegistrationError>()(
  "WebSocketTicketRegistrationError",
  { reason: Schema.Literals(["capacity", "collision", "expired"]) },
) {}

export class UnavailableWebSocketTicketError extends Schema.TaggedErrorClass<UnavailableWebSocketTicketError>()(
  "UnavailableWebSocketTicketError",
  {},
) {
  override get message(): string {
    return "Websocket ticket is unavailable in this runtime.";
  }
}

export const make = Effect.gen(function* () {
  // Each SessionStore owns one registry. Restarted and independent runtimes
  // must issue fresh tickets even when they share durable session credentials.
  const pending = yield* Ref.make(new Map<string, IssuedTicket>());

  const pruneExpired = (tickets: Map<string, IssuedTicket>, observedAt: DateTime.Utc) => {
    for (const [nonce, ticket] of tickets) {
      if (ticket.expiresAt <= observedAt.epochMilliseconds) tickets.delete(nonce);
    }
  };

  const register = Effect.fn("WebSocketTicketAdmission.register")(function* (
    ticket: IssuedTicket,
    observedAt: DateTime.Utc,
  ) {
    const reason = yield* Ref.modify(
      pending,
      (
        tickets,
      ): readonly [
        WebSocketTicketRegistrationError["reason"] | undefined,
        Map<string, IssuedTicket>,
      ] => {
        pruneExpired(tickets, observedAt);
        if (ticket.expiresAt <= observedAt.epochMilliseconds) return ["expired", tickets];
        if (tickets.has(ticket.nonce)) return ["collision", tickets];
        if (tickets.size >= MAX_PENDING_TICKETS) return ["capacity", tickets];
        tickets.set(ticket.nonce, ticket);
        return [undefined, tickets];
      },
    );
    if (reason !== undefined) return yield* new WebSocketTicketRegistrationError({ reason });
  });

  const consume = Effect.fn("WebSocketTicketAdmission.consume")(function* (
    ticket: IssuedTicket,
    observedAt: DateTime.Utc,
  ) {
    const admitted = yield* Ref.modify(pending, (tickets) => {
      const issued = tickets.get(ticket.nonce);
      if (
        !issued ||
        issued.sessionId !== ticket.sessionId ||
        issued.expiresAt !== ticket.expiresAt ||
        issued.expiresAt <= observedAt.epochMilliseconds
      )
        return [false, tickets] as const;

      // This synchronous deletion commits one authorization attempt. Never
      // restore it after cancellation or a later socket upgrade failure.
      tickets.delete(ticket.nonce);
      pruneExpired(tickets, observedAt);
      return [true, tickets] as const;
    });
    if (!admitted) return yield* new UnavailableWebSocketTicketError({});
  });

  return { register, consume };
});
