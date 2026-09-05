# Patch Guide

Status: current implementation index for the isolated intake candidate

This index describes fork responsibilities implemented in this tree. The accepted product preservation requirements and pending replay belong to the [intake ledger](.ledger/upstream-intake-program.md). This candidate has not passed the product preservation gate.

Review this guide and the relevant active specification before changing fork behavior. Update the active contract and this guide in the same completed change. Historical source and plans do not independently require replay.

Upstream is a read-only intake source. Exact origin is the only product repository and publication target. Follow the [reconciliation policy](governance/upstream_merge_policy.md) and [fork isolation policy](governance/fork_isolation_policy.md).

## Active Repository Responsibilities

[F18 protected onboarding and workstream ledgers](fork/F18-protected-onboarding-and-workstream-ledgers.md) owns fork-first documentation, clone authorization, privacy and the implementation ledger. [F19 delivery skills and Commit Effects](fork/F19-repository-delivery-skills-and-commit-effects.md) owns the local workflow and commit-effect record. Runtime and client features not indexed below remain under their pending delivery slices.

## Verification

Source and runtime build-input changes require `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Native mobile changes also require `pnpm lint:mobile`. Use synthetic state and keep client installation, production changes and publication within their explicit authorization.
