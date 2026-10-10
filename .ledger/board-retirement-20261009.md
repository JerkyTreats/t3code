# Board and automatic submitter retirement

Date: 2026-10-09
Branch: `retire-board-and-liaison`
Status: source verified; deployment outside scope
Authority: historical verification only

The user retired F25 message Board and F28 automatic subagent Board submitter. Their UI,
contracts, provider attachments, MCP tools, participation instructions, event handling,
dedicated stores, and active fork contracts are removed. Ordinary explicitly delegated
subagents, thread launch, authentication, and surviving toolkits remain available.
Existing historical reconciliation baselines remain unchanged and carry no feature replay
obligation.

Migration 83 removes retired posts, revisions, events, command receipts, projection cursor,
and Collective tables during upgrade. Fresh databases omit the retired schemas. Supported
journal identities remain historical evidence under generic persistence authority. Cleanup
tests cover installed migration histories, retained data, foreign keys, sequence continuity,
index use, and transactional rollback and retry. Saved panel state upgrades to version 15
and retains registered panel kinds through generic hydration.

## Verification

`pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `NODE_ENV=test pnpm test` passed.
Focused persistence, provider, authorization, upload-launch, client-state, contract, and
tool-presentation checks passed. Two fresh-context review passes found no blocking issues;
the initial saved-state observation was fixed and the final review found no deferred
findings. Native mobile source did not change. No browser testing was performed.

No deployment, publication, live-state access, or running-installation migration was part
of this source retirement.

## Commit effect

If applied, this commit retires the message Board and automatic Board subagent submitter, removes their stored data on upgrade, and preserves ordinary threads, authentication, and explicitly delegated subagents.
