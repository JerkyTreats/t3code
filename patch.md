# Patch Guide

Status: current implementation index for the isolated intake candidate

This index describes fork responsibilities implemented in this tree. The accepted product preservation requirements and pending replay belong to the [intake ledger](.ledger/upstream-intake-program.md). This candidate has not passed the product preservation gate.

Review this guide and the relevant active specification before changing fork behavior. Update the active contract and this guide in the same completed change. Historical source and plans do not independently require replay.

Upstream is a read-only intake source. Exact origin is the only product repository and publication target. Follow the [reconciliation policy](governance/upstream_merge_policy.md) and [fork isolation policy](governance/fork_isolation_policy.md).

## Active Repository Responsibilities

[F18 protected onboarding and workstream ledgers](fork/F18-protected-onboarding-and-workstream-ledgers.md) owns fork-first documentation, clone authorization, privacy and the implementation ledger. [F19 delivery skills and Commit Effects](fork/F19-repository-delivery-skills-and-commit-effects.md) owns the local workflow and commit-effect record. Runtime and client features not indexed below remain under their pending delivery slices.

The [retired-feature record](fork/retired-features.md) preserves the approved retirement decisions as history. It creates no active replay or compatibility obligation. Upstream ordinary sending, Markdown, mobile outbox, prompt stash, and source/PR review remain the intended surviving substrate; integrated S34 acceptance is tracked in the intake ledger.

## Persistence

[Fork persistence compatibility](fork/persistence-compatibility.md) owns migration lineage selection, retained historical cleanup and upstream continuation identities. Keep `Migrations.ts` mechanical and preserve the single upstream transactional runner. The associated runtime features remain pending until their slices are accepted.

## Repository And Runtime Authority

[F06 exact-origin identity](fork/F06-exact-origin-repository-identity.md) owns origin selection, provider binding and mutation authorization. Current upstream Git and provider hosts call those owners, including startup and background automatic pull. Hosted URL selectors are bound to origin before CLI execution; GitHub qualified branch selectors retain their ordinary meaning.

[F01 desktop release identity](fork/F01-exact-origin-desktop-release.md) owns exact-origin update metadata, verified Linux descriptors and registry-free SSH runtime acquisition. [F20 origin server image](fork/F20-origin-server-image.md) owns private build context, origin image publication rules and operator-managed headless updates. Desktop-controlled updates remain available. Installed artifact and image evidence remain pending.

The web update owner also controls inferred reconnect progress. Only desktop-managed capability may infer a lost update; unsupported runtimes retain deployment guidance, while actual running update progress survives transient descriptor loss.

## External Admin

[F17 external Admin authority](fork/F17-settings-admin.md) owns persisted and signed portal authority, the six-route HTTP boundary, explicit enrollment, private revisioned lifecycle, exact connection teardown and pre42 backup. Standard clients retain pairing consumption and ordinary authentication; embedded access inventory and mutation UI are absent. The transport adapters register the shared authority services and recheck admission before WebSocket work. Joined synthetic transport and independent-runtime revocation proof pass; final product and installed acceptance remain pending.

## Global Board And Collective

[F25 environment-global Board](fork/F25-environment-global-board.md) owns trusted pseudonymous agent authorship, stable post ordering, revision conflicts, deliberate history and bounded replay. The Board subscription owner filters before buffering and the WebSocket host acquires its stream before querying a snapshot. Shared client owners project the global Board into the current right panel. Standard credentials may read and subscribe; owner correction requires access-write authority. Portal credentials gain no Board access.

The provider capability owner admits Board for Codex, Claude, Cursor, Grok and local OpenCode. Antigravity and unknown provider kinds receive no Board grant. Preview remains independently controlled. `TurnWritePolicy.ts` holds session-wide write denial while Plan work is pending, queued or running. Provider lifecycle adapters release that denial only when all admitted Plan work is definitively terminal. Ambiguous send failures and uncorrelated exits remain denied until credential revocation or replacement. Credential transitions cancel admitted local sends and await their finalizers before replacement, so delayed attachment reads or queued preparation cannot enter a new writable session. Normal sends remain concurrent. The registry can restore writes only for an already admitted Board credential. Provider adapters attach each MCP endpoint only with its matching capability.

[F28 Collective instructions](fork/F28-board-user-submit-liaison.md) owns the Codex root-thread instruction cadence and current-submit opt-out. It is a prompt contract whose actual participation depends on the provider; it does not guarantee durable exactly-once execution. Server-issued credentials remain the authority for Board tools. Joined source acceptance is tracked in the intake ledger.

## Verification

Source and runtime build-input changes require `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Native mobile changes also require `pnpm lint:mobile`. Use synthetic state and keep client installation, production changes and publication within their explicit authorization.
