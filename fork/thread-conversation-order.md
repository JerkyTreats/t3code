# Thread conversation order

The user requested conversation recency across the whole thread list after the accepted upstream
intake. A delivered user-authored prompt or completed assistant message determines recency.
Run requests, run completion, streaming updates, tool activity and automatic wake messages
do not independently advance it. Empty conversations use creation time. Lifecycle changes
and stored manual ordering keys do not override conversation recency.

## Ownership

`packages/client-runtime/src/state/fork/threadConversationOrder.ts` owns the narrow timestamp
and stable ordering decision. It accepts message stamps and creation time without run or tool
state. Equal timestamps use thread ID and environment ID so clients converge independently of
input order. The pure owner test supplies newer run, wake and lifecycle timestamps independently
and proves they cannot change the result.

The ordinary thread shell schema adds optional `latestAssistantResponseAt`. `ProjectionStore`
derives it from non-streaming assistant messages in both SQL shell snapshots and full projection
presentation. SQL reads the existing streaming column rather than message bodies. No migration
or provider-specific execution change is required. Existing provider adapters remain responsible
for completing their ordinary messages.

`presentThreadShell` carries the response stamp into shared client state. Web list sections and
mobile home and navigation lists consume the same ordering owner. Web drag previews consume that
order and drops change lifecycle without order-key writes. Mobile arrangement controls are
unavailable while conversation ordering owns placement. Legacy recency sorting consumes these
stamps when available.

## Compatibility and proof

Servers without the authored prompt stamp use their latest user-message stamp. Servers without
the response stamp cannot order by responses. An explicit null authored stamp remains different
from an omitted legacy field, so known automatic messages never become authored prompts.

Focused proofs cover bare-owner ordering, non-streaming delivery versus streaming updates,
SQL and in-memory projection agreement, client presentation, all list sections, manual-key
arrival and lifecycle-only drag behavior. Installed client acceptance is a separate check.
