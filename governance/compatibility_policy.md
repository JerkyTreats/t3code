# Compatibility Policy

Date: 2026-03-07
Status: active

## Intent

This repository prioritizes clarity, performance, and reliability over broad backward compatibility.

## Rules

- Backward incompatible changes are allowed when they improve correctness, ownership, or operational predictability.
- Any backward incompatible change must be called out to the user before commit.
- Compatibility impact must be explicit for these surfaces:
- desktop IPC contracts
- WebSocket protocol contracts
- persisted browser state
- server side state and attachment storage
- user visible workflow behavior
- Commit messages must reflect severity through conventional commit rules.
- Use `type!:` or `type(scope)!:` for breaking changes.
- Add a `BREAKING CHANGE:` footer with a concise migration note.

## Migration Bias

- Prefer additive transitions when the old and new paths can coexist cheaply.
- Prefer direct replacement when a compatibility layer would add material complexity or failure risk.
- When removing an old path, document the migration impact in the commit and any related release notes.

## Approved Feature Retirement

An explicitly approved fork feature retirement is a direct-removal exception to the additive migration bias.

- Remove feature-specific implementation, integration, settings, flags, routes, commands, schemas, persistence, tests, fixtures, catalogs, and compatibility scaffolding.
- Do not keep a disabled implementation, compatibility shim, tombstone, or replacement solely to preserve retired behavior.
- Retain generic or upstream-compatible substrate only when a surviving active feature or accepted upstream behavior requires it.
- Call out user-visible, protocol, storage, or state impact before the retirement commit.
- Record any separately approved replacement under its active owner rather than under the retired feature.

## Fork Seam Bias

- When this fork intentionally diverges from upstream in a shared domain, prefer an explicit fork seam over scattered call site customization.
- A fork seam should isolate fork owned behavior from upstream facing runtime details so compatibility work stays local.
- Stable fork domain contracts are preferred for browser, desktop, and workflow features that would otherwise depend on upstream shaped internals.
- Introduce compatibility shims only as transitional tools. Promote long lived divergence into named adapter or policy layers with clear ownership.
- Apply the [Fork Isolation Policy](fork_isolation_policy.md) when a fork decision is new, materially changed, or selected for non-trivial upstream reconciliation in an upstream-sensitive domain.
- Code relocation, renamed imports, catalog labels, comments, or evidence markers do not by themselves establish an isolated fork seam.
- Isolation requires a durable decision owner, a mechanical upstream-facing adapter where practical, and behavior evidence at the declared boundary.
