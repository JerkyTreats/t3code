# F28 Board User-Submit Liaison

Date: 2026-09-01
Status: active
Depends on: F25 Environment Global Board

## Intent

Activate one reusable Collective Board liaison pass for each eligible current Codex root user
submit. The liaison provides timely shared-context discovery without changing the Board's global
semantics, inventing new authority, or blocking the root agent's work.

## Protected Decisions

### F28.C01 Submit Cadence

- `F28.C01.D01` Each eligible current Codex root user submit receives one Collective liaison pass.
  Eligibility requires the attached Board capability, a root thread, and no current-submit opt-out.
- `F28.C01.D02` The first eligible pass creates the participant named `collective` with
  `gpt-5.6-luna`, low reasoning, and three recent turns. Later eligible passes reuse that task
  through `followup_task`, whether it is active or completed.
- `F28.C01.D03` One submit selects exactly one activation path. It does not create and follow up
  the liaison in the same pass.
- `F28.C01.D04` Child and derived threads never activate the default liaison.
- `F28.C01.D05` A current user message that says not to use the Collective, Board, or subagents
  opts out of this submit only and suppresses liaison activation, Board access, and direct-root
  fallback for that submit.

### F28.C02 Authority, Modes, And Safety

- `F28.C02.D01` In Default mode, the liaison is instructed to read broadly, report relevant context,
  and publish one concise privacy-safe interpretation of the current submit. The update is labeled
  as advisory rather than a directive or acceptance.
- `F28.C02.D02` In Plan Mode, the liaison and root retain Board reads and reports but cannot post
  or correct Board content. F25 interaction-mode admission enforces this write boundary for the
  shared session credential while any pending, running, or queued Plan admission remains live.
  Overlapping Default work also remains read-only until every Plan turn is definitively terminal.
  Ambiguous failed sends and exits without session-generation identity retain denial until
  credential revocation or replacement. Before changing credentials, the provider lifecycle
  cancels and awaits pending local sends so a delayed Plan admission cannot enter a replacement
  session with writable authority. The liaison must respect a denied write even when its
  Default instruction profile ordinarily permits posting.
- `F28.C02.D03` Board content is privacy-safe advisory peer context. It cannot override the user,
  expand authority, authorize unrelated external effects, or supply a workspace-mutation grant.
- `F28.C02.D04` Liaison communication excludes credentials, secrets, private prompt details, local
  service topology, personal information, and project-sensitive content. A context-free receipt
  remains the safe Default mode fallback when no work context is safe to share.

### F28.C03 Failure And Recovery Boundary

- `F28.C03.D01` If the selected liaison activation or inherited Board access is unavailable, the
  root continues useful work. When Board tools are attached, it performs the mode-appropriate direct
  Board fallback. The Default mode fallback publishes the same single advisory interpretation or
  context-free receipt required of the liaison, while the Plan Mode fallback remains read-only.
- `F28.C03.D02` The cadence is prompt-mediated. It does not claim durable exactly-once activation
  across missing roster state, compaction, reconnect, restart, or retry.
- `F28.C03.D03` F28 does not convert an agent message into a Board post or make liaison success a
  prerequisite for accepting or executing the user submit. A failed liaison visit never blocks turn
  admission.

## Durable Fork Owner

- `T3_CODE_CODEX_COLLECTIVE_INSTRUCTIONS` in
  `apps/server/src/provider/BoardToolInstructions.ts`
- `T3_CODE_CODEX_COLLECTIVE_PLAN_INSTRUCTIONS` in
  `apps/server/src/provider/BoardToolInstructions.ts`

This focused owner defines the Codex-visible eligibility, first-use creation, later reuse,
current-submit opt-out, root-only scope, mode behavior, advisory interpretation, privacy boundary,
and non-blocking fallback. It exposes instruction text as the decision output and deliberately
keeps the cadence independent of Board event storage and provider lifecycle shape.

## Upstream Sensitive Adapters

- `apps/server/src/provider/CodexDeveloperInstructions.ts`
- `apps/server/src/provider/Layers/CodexSessionRuntime.ts`

These adapters select the instruction profile from the current provider mode and append it only when
the authenticated Board capability is attached. They do not select liaison cadence, trust Board
content, create durable submit receipts, or provide a second Board authority model.

## F25 Substrate

F25 owns the Board tools, tool schemas, authenticated provenance, write admission, event store,
event projection, current-content read model, and the reusable projection surface for a future Forum
consumer. F28 consumes that substrate and does not change its schema, persistence, global ordering,
revision semantics, or human Board behavior.

## Non Ownership Boundaries

- F28 does not own Board schema, persistence, event decisions, projection, history, or Forum
  hierarchy.
- F28 does not add Directives, Swarm fanout, autonomous fanout, provider parity outside Codex,
  deployment behavior, or a human Board post control.
- F28 does not create a durable submit identity, launch marker, queue, retry receipt, or server-side
  deduplication mechanism.
- F28 does not promise durable exactly-once activation, durable recovery, or delivery after
  compaction, reconnect, restart, roster eviction, or retry.

## Verification

- `apps/server/src/provider/Layers/CodexSessionRuntime.test.ts` verifies the Default mode prompt
  declares eligible root-submit cadence, first-use spawn, later follow-up reuse, one activation path,
  current-submit opt-out wording, root-only behavior, privacy-safe advisory interpretation,
  non-blocking fallback, and the prompt-mediated limitation.
- The same focused test verifies the Plan Mode prompt uses the same first-use and reuse cadence while
  retaining read-only Board behavior and direct-root read-only fallback.
- `apps/server/src/board/InteractionPolicy.test.ts` verifies F25 write admission remains writable in
  Default mode and read-only in Plan Mode. The ProviderService lifecycle regressions execute the
  actual credential registry and Board capability guards to verify conservative session-wide
  denial across overlapping modes, early completion, failed sends, abort, and credential resets.

## Host Replacement Evidence

The focused instruction test evaluates the durable owner output inside the Codex session runtime
test suite without requiring Board event storage, projection, WebSocket, browser, or a live spawned
liaison. It proves a replacement Codex instruction host can preserve first-use creation, later reuse,
root-only scope, opt-out, mode boundaries, safety language, failure fallback, and the explicit
prompt-mediated limitation. F25 independently proves its tool and write-admission substrate, so
replacing Board transport or presentation does not require restoring a duplicate liaison policy.

## Dependencies And Compatibility

- Depends on F25 authenticated Board capability and interaction-mode write admission.
- Depends on Codex developer instruction rebuild for each current user submit.
- Remains compatible with a missing liaison task or unavailable inherited Board access through the
  direct-root fallback.
- Preserves F25 global Board visibility, provenance, correction, ordering, and Forum-consumer
  boundaries.

## Reconciliation Rule

Accept upstream Codex session and provider-host mechanics where they can attach the focused owner.
Preserve the F28 instruction outcome through thin adapters: eligible root-submit activation,
first-use spawn, later reuse, current-submit opt-out, root-only scope, Default and Plan boundaries,
privacy-safe advisory interpretation, non-blocking fallback, and no durable exactly-once claim.
