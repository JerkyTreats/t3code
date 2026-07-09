# Patch Guide

Date: 2026-04-17
Status: active

## Intent

`patch.md` is the authoritative fork delta guide for this repository.

It defines the current expected behavior of fork owned features and the reconciliation rules to use when reviewing upstream changes.

This fork is an opinionated T3 Code product, not an Omarchy edition.

Omarchy remains a supported local desktop integration where it provides real host capability. It is not the product boundary.

Other upstream product lanes should enter the fork by default unless they conflict with a documented fork owned product outcome.

Use it together with [Upstream Merge Policy](governance/upstream_merge_policy.md).

## Required Use

- Review this file before upstream sync, merge, or divergence work.
- Review the linked feature specs under `fork/` for every affected feature.
- Update this file in the same change whenever fork owned behavior changes.
- Keep each feature spec current for intent, owner modules, fork seams, required behavior, replay notes, and verification.
- Classify upstream behavior against the relevant feature spec as `accept`, `replay`, or `override`.
- Use the pnpm verification gate: `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- If code and this file drift, fix the drift before merge.
- Treat this file as a current state guide, not a release log.

## Authority

- User request wins over this file.
- Repository governance wins over routine upstream defaults.
- This file defines authoritative expected behavior for fork owned features.
- When upstream differs from this file, replay the documented product outcome on upstream primitives until the fork intentionally changes direction.
- This file does not authorize removing upstream product lanes only because they are not tied to one local desktop integration.

## Architectural Preference

Fork owned product behavior should usually be expressed through small, portable product modules that encode domain decisions without depending on a specific branch shape.

Prefer branch shaped adapter layers for router, store, transport, Git, source control, desktop, environment, and provider runtime details.

Prefer thin UI components that render product view models and call adapter callbacks instead of mixing fork policy directly into broad upstream shaped components.

This is a preference, not a hard rule. Direct edits to existing modules are acceptable when the behavior is narrow, the branch shape is stable, or an adapter would add more complexity than it removes.

When a feature is likely to be rebuilt onto future upstream `main` snapshots, bias toward pure product logic plus adapters so future rebuilds can replay product behavior first and branch integration second.

## Feature Index

- [`F1` branding and release identity](fork/F01-branding-and-release-identity.md)
- [`F2` local desktop theme projection](fork/F02-local-desktop-theme-projection.md)
- [`F3` desktop screenshot capture and attach flow](fork/F03-desktop-screenshot-capture-and-attach-flow.md)
- [`F4` composer draft autonomy and composer chrome](fork/F04-composer-draft-autonomy-and-composer-chrome.md)
- [`F5` Git surface isolation from draft ownership](fork/F05-git-panel-isolation-from-draft-ownership.md)
- [`F6` fork first GitHub identity resolution](fork/F06-fork-first-github-identity-resolution.md)
- [`F7` local branch, worktree, and promotion workflow](fork/F07-local-branch-worktree-and-promotion-workflow.md)
- [`F8` plan aware sidebar and activity status cues](fork/F08-plan-aware-sidebar-and-activity-status-cues.md)
- [`F9` plan markdown preview and markdown rendering behavior](fork/F09-plan-markdown-preview-and-document-markdown-rendering.md)
- [`F10` Codex model and binary selection](fork/F10-codex-model-and-binary-selection.md)
- [`F11` source control provider lane and publish workflow](fork/F11-source-control-provider-lane-and-publish-workflow.md)
- [`F12` provider instance identity seam](fork/F12-provider-instance-identity-seam.md)
- [`F13` auth access management](fork/F13-auth-access-management.md)
- [`F14` unified project context and inference dashboard](fork/F14-project-management-and-inference-dashboard.md)

## One Shot Rebuild Packet

When rebuilding on a fresh `upstream/main`, use this file as the index and the linked `fork/` specs as the executable product contract.

The rebuild packet must include:

- upstream base commit
- target fork branch
- affected feature ids
- feature replay order
- per feature upstream outcome of `accept`, `replay`, or `override`
- fork seam or owner module used for each feature
- automated or manual verification evidence for each restored behavior
- compatibility notes for desktop IPC, WebSocket contracts, persisted browser state, server state, routes, and visible workflow

Do not mark a rebuild ready if any linked feature spec is unreviewed, stale, or missing evidence for affected behavior.

## Feature Spec Contract

Every spec under `fork/` must include:

- intent
- required behavior
- owner modules
- fork seams
- one shot rebuild notes
- upstream replay rule
- verification
- compatibility checks when the feature affects contracts, routes, persistence, desktop, or runtime state

Spec files should describe outcome behavior first and current implementation shape second. This lets future rebuilds replay product behavior even when upstream files have moved.

## Rebuild Replay Order

Use this order unless a rebuild note records a concrete dependency that requires a local adjustment:

- `F1` branding and release identity
- `F2` local desktop theme projection
- `F3` desktop screenshot capture and attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git surface isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues
- `F9` plan markdown preview and markdown rendering behavior
- `F10` Codex model and binary selection
- `F11` source control provider lane and publish workflow
- `F12` provider instance identity seam
- `F13` auth access management
- `F14` unified project context and inference dashboard

## Change Procedure

- Update the affected feature spec in the same change that modifies fork behavior.
- Add a new feature spec before merge if a new fork owned surface is introduced.
- Remove a feature spec only when the fork intentionally drops that behavior and the replacement is documented here in the same change.
- Keep `patch.md` and the matching `fork/` spec in sync.
- For a new feature, add the spec file first, then add it to the feature index and replay order.
