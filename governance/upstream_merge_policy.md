# Upstream Product Replay Policy

Date: 2026-06-05
Status: active

## Intent

Keep this fork current by using upstream code as the default base.

Fork product behavior is durable.

Fork implementation shape is disposable by default.

Replay fork product features on top of upstream primitives instead of preserving old fork internals.

Avoid long lived code divergence unless it protects a documented product outcome and has a planned convergence path.

## Core Principle

Upstream code is the substrate.

Fork specs are the product contract.

The fork should preserve outcomes from `patch.md` and `fork/`, not old file shapes, component structure, store design, adapter APIs, or local helper implementations.

Omarchy alignment is a protected Electron desktop product lane. It is not a global product scope limiter.

Upstream product surfaces such as web, hosted, mobile, relay, and shared runtime should be accepted by default unless they directly conflict with a documented fork product outcome.

The fork product scope is the full set of features documented in `patch.md`, `fork/`, and active user decisions. Do not use Omarchy policy as a reason to narrow unrelated product lanes.

When upstream replaces architecture, start from the upstream architecture and rebuild fork behavior on top of it.

Before reusing old fork code, verify that upstream does not now provide a primitive that can carry the same product behavior.

Prefer deleting old fork implementation over sheltering it when upstream has replaced the surrounding system.

## Authority Order

- User request wins over repository policy.
- Repository governance wins over routine upstream defaults.
- Fork product outcomes win over conflicting upstream product outcomes.
- Upstream implementation wins by default unless a fork feature spec requires product behavior that upstream does not provide.

## Default Workflow

Use one of these workflows for non-trivial upstream work.

### Merge And Repair

Use this when a normal upstream merge is reviewable.

1. Merge the target upstream tag or commit.
2. Resolve conflicts by preferring upstream structure where practical.
3. Repair protected fork product outcomes through scoped commits.
4. Verify the Required Fork Preservation Gate.

### Base Rebuild And Replay

Use this when upstream has moved enough that normal conflict resolution would preserve more history than clarity.

1. Start from the target upstream tag or commit.
2. Reapply fork product features from `patch.md` and `fork/`.
3. Use upstream primitives first.
4. Add fork seams only for product policy or adapter translation.
5. Verify the Required Fork Preservation Gate before replacing fork `main`.

This workflow is preferred over selective porting when the fork is far behind upstream.

### Selective Port Exception

Selective cherry-pick or manual porting is an exception.

It is allowed only when merge and repair or base rebuild and replay is impractical for a named slice, or when a named upstream product lane has an explicit fork policy decision not to accept it yet.

Every selective port exception must record:

- the upstream target the fork will later converge to
- why ancestry based intake is not being used now
- which fork product outcomes are protected
- which upstream primitives were considered before keeping old fork code
- the planned follow-up or convergence trigger

## Replay Decisions

Use these terms for upstream behavior decisions.

- `accept`: upstream behavior becomes fork behavior.
- `replay`: fork behavior remains, but is rebuilt on upstream primitives.
- `override`: upstream product behavior conflicts with fork product behavior and is changed through the smallest fork policy layer.

These labels are behavior decisions. They are not ancestry decisions.

They do not justify avoiding upstream code by themselves.

Older notes may use `adopt`, `adapt`, and `reject`. Map them as follows when reading historical intake records:

- `adopt` maps to `accept`
- `adapt` maps to `replay`
- `reject` maps to `override`

## Product Replay Rules

- Start each replay slice from upstream code, not old fork code.
- Preserve user visible behavior, workflow semantics, desktop integration outcomes, and compatibility guarantees from the fork specs.
- Do not preserve old implementation only because it is fork owned.
- Do not use broad reverts to restore fork behavior.
- Do not copy whole upstream components into fork folders unless the entire component is product owned.
- Do not create compatibility layers that freeze old architecture unless they are temporary and have a documented removal condition.
- Prefer upstream contracts, stores, process models, and runtime state names when they can carry the fork feature.
- Rebuild churn-heavy adapters around stable product seams.
- Keep fork product logic small, explicit, and easy to replay on the next upstream base.

## Fork Owned Product Outcomes

The fork has final product authority for these areas:

- Electron desktop branding, naming, and release identity
- Electron desktop Linux behavior tied to Omarchy
- Electron desktop screenshot capture and attach flows tied to Omarchy tooling
- Electron desktop system theme behavior derived from Omarchy theme state
- GitHub panel behavior and local Git workflow guidance
- workspace promotion behavior and merge guidance
- governance files and repository process rules

The fork does not have a standing policy to remove upstream product lanes only because they are not Omarchy specific.

New upstream product lanes should usually be accepted as upstream owned surfaces. Add fork product policy only where the fork has an explicit outcome to protect.

## Protected Fork Features

Treat these as protected product outcomes during every upstream sync:

- fork first GitHub identity resolution for repo, issue, and panel context
- draft autonomy for composer text, screenshots, attachments, and local thread state
- Electron desktop composer chrome layout including access control placement, screenshot control placement, and rich draft affordances
- Git panel isolation from active draft ownership and prompt state
- plan sidebar progress affordances and fork specific status cues, including plan progress such as `1/4` when a plan exists
- plan markdown preview flows and markdown rendering behavior, including fullscreen in memory plan preview, plan specific markdown navigation, and horizontal overflow handling for wide markdown content
- local branch, worktree, and promotion workflow behavior
- Omarchy specific Electron desktop and screenshot integration behavior
- Omarchy system theme behavior derived from local Electron desktop theme state
- Electron desktop screenshot capture and attach flows tied to Omarchy tooling and desktop capability checks

Do not remove, silently degrade, or route around these outcomes without an intentional fork decision recorded in the replay notes.

## Protected Review Areas

Use this list as a concrete audit aid during upstream work.

- composer chrome and layout in `apps/web/src/components/ChatView.tsx`, including floating access control placement, screenshot placement, and rich draft controls
- sidebar status cues for plan aware progress in thread and activity surfaces, including fractional progress such as `1/4` when plan data exists
- plan markdown preview and markdown document rendering in `apps/web/src/components/ChatMarkdown.tsx`, `apps/web/src/components/DocumentMarkdownRenderer.tsx`, `apps/web/src/components/PlanConversationDocument.tsx`, and `apps/web/src/routes/_chat.$threadId.tsx`
- Omarchy system theme behavior and Electron desktop adapters that project desktop theme state into the app
- screenshot capability detection, screenshot capture, and screenshot attach flows across Electron desktop, web, and composer state
- fork first GitHub repo identity resolution in `apps/server/src/git/Layers/GitHubCli.ts` so fork operations resolve to the fork remote instead of upstream
- Git panel promote semantics in `apps/server/src/git/Layers/GitManager.ts` and related web UI, including backup branch creation, merge to target branch, push of target branch, and source branch cleanup

## Replay Plan Requirements

Every non-trivial upstream take must have one controlling note under `.plans/` before broad implementation starts.

The note must include:

- target upstream tag or commit
- selected workflow
- upstream commit inventory
- upstream product lanes being accepted
- protected fork features touched
- replay order by feature or product surface
- upstream primitives that should carry each feature
- fork seams or owner modules used only where product policy or adapter translation is required
- any selective port exceptions
- verification evidence required before review

The plan must describe feature replay from product outcomes to implementation, not from old fork files to new fork files.

## Seam Rules

A fork seam is valid when it expresses product policy or translates between upstream mechanics and fork behavior.

A fork seam is not valid when it only shelters old implementation from upstream churn.

Good seams are:

- small
- product aware
- replayable
- close to the boundary where upstream behavior becomes fork behavior
- covered by focused tests or replay evidence

Expected seam roots include:

- `apps/web/src/fork`
- `apps/server/src/fork`
- `apps/desktop/src/fork`
- `packages/contracts/src/fork`
- `packages/shared/src/fork`

Do not create a seam only to rename upstream APIs.

Do not keep duplicate fork and upstream implementations alive unless the old path has a removal condition.

## Patch Guide

`patch.md` and the linked specs under `fork/` define current fork product behavior.

Use them as outcome contracts during replay.

When code changes intentionally modify a fork product outcome, update `patch.md` or the matching feature spec in the same change.

When upstream differs from `patch.md`, rebuild the documented fork outcome on upstream primitives unless the fork intentionally changes direction.

## Required Fork Preservation Gate

Before an upstream sync, merge, rebuild, or selective port exception is ready for review or merge, complete this gate:

- review the relevant `patch.md` entries and `fork/` specs
- identify protected fork features touched by the upstream change
- classify each product behavior as `accept`, `replay`, or `override`
- state the upstream primitive that carries each accepted or replayed behavior
- state the fork seam or owner module for each replayed or overridden behavior
- verify that old fork implementation was not preserved only due to ownership
- verify that no protected fork behavior silently falls back to generic upstream behavior
- verify that active drafts, screenshots, attachments, and local Git context remain intact across affected flows
- verify that fork specific sidebar, panel, and workflow affordances still render and behave as expected
- update `patch.md` or feature specs when product behavior, owner modules, or verification expectations changed
- record the protected fork features reviewed in the pull request, replay notes, or commit body

If this gate is not complete, the upstream work is not ready.

## Base Rebuild Readiness Gate

A base rebuild is not ready to replace fork `main` until:

- the Required Fork Preservation Gate is complete
- every protected fork feature in `patch.md` has `accept`, `replay`, or `override` notes
- every fork verification scenario has evidence in the active rebuild note
- every replayed feature identifies the upstream primitive it is built on
- no protected behavior is implemented by wholesale preservation of stale fork internals
- `patch.md` reflects the new fork seam owner modules
- active drafts, screenshots, attachments, local Git context, sidebar cues, panel workflows, and Omarchy desktop flows have been verified
- `bun fmt`, `bun lint`, and `bun typecheck` pass
- focused automated tests for affected web, server, desktop, contracts, and shared packages pass

## Commit Discipline

- Establish the upstream ancestry point before broad fork repair work.
- Prefer one local repair commit per protected product surface.
- Keep product replay commits separate from unrelated cleanup.
- Cite relevant upstream refs and protected feature ids in repair commit bodies.
- Explain why old fork code was reused when it was reused.
- Explain every selective port exception.
- Do not continue a large upstream take as freeform implementation after an incomplete preservation gate.
