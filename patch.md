# Patch Guide

Status: current implementation index for the isolated intake candidate

This index describes fork responsibilities implemented in this tree. The accepted product preservation requirements and pending replay belong to the [intake ledger](.ledger/upstream-intake-program.md). This candidate has not passed the product preservation gate.

Review this guide and the relevant active specification before changing fork behavior. Update the active contract and this guide in the same completed change. Historical source and plans do not independently require replay.

Upstream is a read-only intake source. Exact origin is the only product repository and publication target. Follow the [reconciliation policy](governance/upstream_merge_policy.md) and [fork isolation policy](governance/fork_isolation_policy.md).

## Active Repository Responsibilities

[F18 protected onboarding and workstream ledgers](fork/F18-protected-onboarding-and-workstream-ledgers.md) owns fork-first documentation, clone authorization, privacy and the implementation ledger. [F19 delivery skills and Commit Effects](fork/F19-repository-delivery-skills-and-commit-effects.md) owns the local workflow and commit-effect record. Runtime and client features not indexed below remain under their pending delivery slices.

## Persistence

[Fork persistence compatibility](fork/persistence-compatibility.md) owns migration lineage selection, retained historical cleanup and upstream continuation identities. Keep `Migrations.ts` mechanical and preserve the single upstream transactional runner. The associated runtime features remain pending until their slices are accepted.

## Repository And Runtime Authority

[F06 exact-origin identity](fork/F06-exact-origin-repository-identity.md) owns origin selection, provider binding and mutation authorization. Current upstream Git and provider hosts call those owners, including startup and background automatic pull. Hosted URL selectors are bound to origin before CLI execution; GitHub qualified branch selectors retain their ordinary meaning.

[F01 desktop release identity](fork/F01-exact-origin-desktop-release.md) owns exact-origin update metadata, verified Linux descriptors and registry-free SSH runtime acquisition. [F20 origin server image](fork/F20-origin-server-image.md) owns private build context, origin image publication rules and operator-managed headless updates. Desktop-controlled updates remain available. Installed artifact and image evidence remain pending.

The web update owner also controls inferred reconnect progress. Only desktop-managed capability may infer a lost update; unsupported runtimes retain deployment guidance, while actual running update progress survives transient descriptor loss.

## External Admin

[F17 external Admin authority](fork/F17-settings-admin.md) owns persisted and signed portal authority, the six-route HTTP boundary, explicit enrollment, private revisioned lifecycle, exact connection teardown and pre42 backup. Standard clients retain pairing consumption and ordinary authentication; embedded access inventory and mutation UI are absent. The transport adapters register the shared authority services and recheck admission before WebSocket work. Joined synthetic transport and independent-runtime revocation proof pass; final product and installed acceptance remain pending.

## Verification

Source and runtime build-input changes require `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Native mobile changes also require `pnpm lint:mobile`. Use synthetic state and keep client installation, production changes and publication within their explicit authorization.
