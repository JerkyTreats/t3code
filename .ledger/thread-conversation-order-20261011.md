# Thread conversation order

The [feature workflow](../.agents/skills/poteto-mode/playbooks/feature.md) guided this delivery.
The user selected the whole thread list and approved the exact patch-guide index proposal.
The [active contract](../fork/thread-conversation-order.md) owns the retained decision.

## Commit Effects

If applied, this commit orders every thread-list section by the newest user-authored prompt or completed assistant message and makes drag actions change lifecycle without manual placement.

## Verification

Formatting, lint, typecheck, the full repository test gate and mobile static checks passed.
The test gate ran with `NODE_ENV=test` and passed 24,830 tests with 31 skipped.
Focused proofs cover the shared owner, SQL and full projections, client presentation, every
list section and desktop drag behavior. The final implementation hashes remained unchanged
during acceptance. Optional SwiftLint, ktlint and detekt were unavailable.

Direct diff review was performed. Independent agent review and installed UI acceptance were
not performed. The first test attempt encountered incomplete task-local Electron installation
and an inherited production test environment; the corrected unmodified gate exited zero.

## Deliverable Closeout

Web, desktop and mobile list sections share conversation recency. Run, tool, streaming, wake
and lifecycle timestamps do not independently change placement. Empty conversations use
creation time, and older servers supply reduced ordering information. No migration is added.
Publication and installation acceptance remain separate from this source record.
