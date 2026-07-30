# Patch Guide

Date: 2026-04-17
Status: active

## Intent

`patch.md` is the authoritative fork delta guide for this repository.

It defines the current expected behavior of fork owned features and the reconciliation rules to use for origin changes.

This fork is an opinionated T3 Code product, not an Omarchy edition.

Omarchy remains a supported local desktop integration where it provides real host capability. It is not the product boundary.

Only origin changes may enter the fork. Upstream may be read for reference but must never be accepted, replayed, or integrated.

Use it together with the [Origin Only Source Control Policy](governance/upstream_merge_policy.md).

## Required Use

- Review this file before changes that modify fork owned behavior.
- Review the linked feature specs under `fork/` for every affected feature.
- Update this file in the same change whenever fork owned behavior changes.
- Keep each feature spec current for intent, owner modules, fork seams, required behavior, origin rebuild notes, and verification.
- Use the pnpm verification gate: `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
- If code and this file drift, fix the drift before merge.
- Treat this file as a current state guide, not a release log.

## Authority

- User request wins over this file.
- Repository governance requires origin-only code acceptance.
- This file defines authoritative expected behavior for fork owned features.
- This file does not authorize accepting or integrating upstream code.

## Architectural Preference

Fork owned product behavior should usually be expressed through small, portable product modules that encode domain decisions without depending on a specific branch shape.

Prefer branch shaped adapter layers for router, store, transport, Git, source control, desktop, environment, and provider runtime details.

Prefer thin UI components that render product view models and call adapter callbacks instead of mixing fork policy directly into broad upstream shaped components.

This is a preference, not a hard rule. Direct edits to existing modules are acceptable when the behavior is narrow, the branch shape is stable, or an adapter would add more complexity than it removes.

When a feature is likely to be rebuilt onto future origin `main` snapshots, bias toward pure product logic plus adapters so future rebuilds can preserve product behavior first and branch integration second.

## Feature Index

- [`F1` branding and release identity](fork/F01-branding-and-release-identity.md)
- [`F2` local desktop theme projection](fork/F02-local-desktop-theme-projection.md)
- [`F3` desktop screenshot capture and attach flow](fork/F03-desktop-screenshot-capture-and-attach-flow.md)
- [`F4` composer draft autonomy and composer chrome](fork/F04-composer-draft-autonomy-and-composer-chrome.md)
- [`F5` Git surface isolation from draft ownership](fork/F05-git-panel-isolation-from-draft-ownership.md)
- [`F6` origin only GitHub target resolution](fork/F06-fork-first-github-identity-resolution.md)
- [`F7` local branch, worktree, and promotion workflow](fork/F07-local-branch-worktree-and-promotion-workflow.md)
- [`F8` plan aware sidebar, settled lifecycle, and activity status cues](fork/F08-plan-aware-sidebar-and-activity-status-cues.md)
- [`F9` plan markdown preview and markdown rendering behavior](fork/F09-plan-markdown-preview-and-document-markdown-rendering.md)
- [`F10` Codex model and binary selection](fork/F10-codex-model-and-binary-selection.md)
- [`F11` source control provider lane and publish workflow](fork/F11-source-control-provider-lane-and-publish-workflow.md)
- [`F12` provider instance identity seam](fork/F12-provider-instance-identity-seam.md)
- [`F13` auth access management](fork/F13-auth-access-management.md)
- [`F14` unified project context and inference dashboard](fork/F14-project-management-and-inference-dashboard.md)
- [`F15` connection resilience and offline send durability](fork/F15-connection-resilience-and-offline-send-durability.md)

## Origin Rebuild Packet

When rebuilding on a fresh `origin/main`, use this file as the index and the linked `fork/` specs as the executable product contract.

The rebuild packet must include:

- origin base commit
- target fork branch
- affected feature ids
- feature rebuild order
- per feature origin implementation decision
- fork seam or owner module used for each feature
- automated or manual verification evidence for each restored behavior
- compatibility notes for desktop IPC, WebSocket contracts, persisted browser state, server state, routes, and visible workflow

Do not mark a rebuild ready if any linked feature spec is unreviewed, stale, or missing evidence for affected behavior.

## Git Ref Refresh And Worktree Lifecycle

- Refresh Git refs once per live connection generation and retry transient failures with a delay capped at 30 seconds.
- Invalidate persisted and live ref snapshots after every ref-affecting action settles, including failed actions.
- Reject stale connection or invalidation generations before publication and persistence.
- Coalesce server ref scans by canonical Git common directory and generation so linked worktrees share bounded work.
- Release inactive ref atoms after 30 seconds.
- Preserve worktree close and discard as distinct operations over one teardown substrate.
- Close safely removes the dedicated worktree, retains the thread, and releases it to the primary checkout.
- Discard deletes the thread and clears its scoped runtime state after forced worktree teardown.
- Feed merged or closed VCS state through the shared settlement policy while active blockers and explicit active state remain authoritative.
- Keep origin-only remote policy unchanged and fail closed when fetch and push targets differ.

## F15 Transport Compression

- Compress only successful JSON snapshots on the exact orchestration snapshot routes.
- Start HTTP gzip at 1024 response bytes and preserve correct `Accept-Encoding` and `Vary` semantics.
- Keep WebSocket per-message compression optional so clients that do not negotiate it remain compatible.
- Configure Node and Bun compression through exact registered package patches without dependency version drift.
- Verify identity and compressed response equivalence, reconnect replay continuity, durable command identity, wire reduction, latency, server RSS, and client heap with the fixed local release benchmark.

## F1 Desktop Updater Relaunch

- Permit updater-controlled quit only after Electron emits its native updater quit event.
- Keep ordinary app quit and window close on the guarded desktop shutdown path across all platforms.
- Preserve renderer recovery and fork release identity while updater relaunch authority is active.

## F13 Connect Availability And Managed Tunnel Lifecycle

- Route signed-out Connect entry points directly to sign-in and keep the legacy mobile waitlist deep link only as a sign-in alias.
- Authenticate relay credentials only against an active environment link with the same environment id and public key.
- Serialize link finalization and unlink for the same user and environment, then revoke links and matching credentials transactionally before external teardown.
- Serialize shutdown tunnel release on the same link identity so unlink captures the released allocation generation before cleanup.
- Use allocation generation claims for deprovision and shutdown release so stale cleanup cannot delete newer resources.
- Enforce managed tunnel account limits before allocation and preserve per-user overrides.
- Release restart-authorized CLI managed tunnels during server shutdown while keeping allocation and hostname identity for restart.
- Keep paired-client managed tunnels live across shutdown until a restart reprovision credential path exists.
- Keep Linux Secret Service selection explicit in both launcher and app startup.

## F8 Sidebar V2 And Settled Work

- Keep Sidebar V2 optional and default it off until the user enables the persisted setting.
- Reuse the shared status resolver so approval and input outrank fractional plan progress, and plan progress outranks generic working state.
- Keep active rows stable by creation time and expose them in bounded pages of 50 while retaining the routed row.
- Keep settled history reachable behind an explicit shelf, with 10 initial rows and pages of 25.
- Gate settle, unsettle, and bulk settle through the exact environment `threadSettlement` capability.
- Decode missing settlement capability data as false and advertise support from current servers.
- Preserve exact environment, project, and thread identity through grouping, project actions, selection, navigation, rename, unread, delete, settle, and unsettle.
- Keep logical project group labels presentation only.
- Keep thread snoozing absent.

## Provider Runtime And Binary Selection

- Route provider work by exact instance id and use driver kind only for capabilities and presentation.
- Preserve an explicit configured target and model through missing snapshots, transient errors, reconnect,
  and durable outbox retry until the exact instance reports a ready authoritative model catalog.
- Accept thread, project, draft, and legacy model candidates only when their owning instance matches the
  final routed instance.
- Choose fallback instances deterministically with ready instances first, then enabled available non-error instances.
- Derive composer capabilities and controls from the final routed instance after fallback.
- Use a local non-dispatchable no-provider state only when no configured target can accept dispatch.
- Resolve default models from the selected instance and never borrow a model from another instance of the same driver.
- Treat a ready exact instance with an empty catalog or a missing selected slug as non-dispatchable,
  including background text generation.
- Keep live Codex models and skills authoritative and discover Claude skills from user and project roots
  with directory iteration and file reads bounded before allocation.
- Pass quote-aware Codex launch arguments through health probes, sessions, and text generation.
- Discover Codex binary choices only from the configured path and normalized process PATH entries,
  including quoted Windows paths, command shims, and hydrated desktop and WSL environments.
- Bound and continuously drain output from every Codex binary version probe.
- Keep an explicit configured Codex binary path pinned until the user selects another candidate.
- Subscribe once per adapter object even when multiple instance ids share a singleton adapter.
- Recover legacy untagged shared-adapter sessions only from a matching persisted exact-instance binding.
- Reject shared-adapter routing and recovery when an active session carries a different explicit instance id.
- Reject ordinary and resumed adapter start results that carry a different explicit instance id.
- Parse Claude skill frontmatter with the workspace catalog `yaml` runtime dependency.

## Sidebar V2 Selection

- Keep Sidebar V2 off by default for the first fork release.
- Hold Sidebar V1 until client settings finish hydration.
- Honor explicit persisted choices and preserve a legacy stored opt-in when explicit-choice tracking is absent.
- Keep settings routes on the Sidebar V1 navigation shell even when Sidebar V2 is enabled.
- Disable Sidebar V2 preference edits until saved client settings finish hydration.
- Persist every Beta switch interaction with the explicit-choice bit.
- Accept inactivity auto-settle as null or a whole number from 1 through 90 and reject invalid drafts before optimistic state or persistence.
- Keep sidebar version selection as presentation only so concrete environment, project, and thread identities remain unchanged.

## Composer Stash And Concrete Project Navigation

- Keep one provider-agnostic prompt stash for text and images.
- Clear the active prompt and images only after the stash entry is durably written and verified.
- Restore stash content without changing provider instance, model, rich mode, terminal context, element context, annotations, or review comments.
- Preserve exact stashed and active prompt whitespace during stash and restore.
- Enforce the exact global entry, per-image, and per-entry attachment budgets from `F4`.
- Migrate provider-scoped legacy queues atomically with deterministic ordering and id de-duplication.
- Treat simultaneous global and legacy storage as an interrupted migration and preserve every unique entry within the global cap.
- Delete legacy storage only after the complete replacement payload is written, reread, decoded, and verified.
- Report every image that finishes after its stash entry was restored or deleted.
- Never describe an unpersisted image as recoverable from a stash that does not contain it.
- Keep stash keyboard ownership inside one focused listbox with Enter restore, Delete removal, and a focus-restoring close path.
- Preload filesystem browse destinations before publishing visible navigation changes.
- Commit visible browse navigation only after a successful preload and surface one bounded failure notice otherwise.
- Reject stale browse completions after newer navigation or explicit invalidation.
- Require successful default destination preload before exposing clone confirmation.
- Guard repository lookup with the same browse generation and suppress superseded failure notices.
- Key command palette project metadata by exact environment plus project identity.
- Key command palette thread items and active state by exact environment plus thread identity.
- Route Sidebar V1, Sidebar V2, and command palette project-panel actions through one concrete project launcher.
- Filter launcher threads by exact environment and project identity before opening the right panel or navigating.

## Unified Project Surface Safety

- Validate persisted Git and Inference surface descriptors by exact environment plus project identity.
- Reconcile project surfaces after environment bootstrap and remove descriptors for missing or changed projects.
- Guard project surface rendering synchronously while reconciliation is pending.
- Keep project Git available without an active server thread and keep its composer draft ownership isolated.
- Key compatibility route redirect ownership by exact environment, project, and view.
- Preserve provider processed totals in inference burn while classifying cached input subsets from current turn usage.

## Context Window Snapshot Retention

- Retain only the latest resolvable context-window row per turn in V1 and V2 initial snapshot payloads.
- Preserve malformed rows, provider processed totals, activity pages, and live events.
- Apply V2 retention before bounded activity limits so stale rows cannot displace usable state.
- Keep one usable row for every surviving turn so a turn revert can reveal older context state.
- Reserve one bounded V2 activity slot for the newest usable context row when later malformed rows fill the tail.
- Treat every null-turn context row as an independent activity identity in V1 and V2.

## Feature Spec Contract

Every spec under `fork/` must include:

- intent
- required behavior
- owner modules
- fork seams
- one shot origin rebuild notes
- verification
- compatibility checks when the feature affects contracts, routes, persistence, desktop, or runtime state

Spec files should describe outcome behavior first and current implementation shape second. This lets future origin rebuilds preserve product behavior even when files have moved.

## Origin Rebuild Order

Use this order unless a rebuild note records a concrete dependency that requires a local adjustment:

- `F1` branding and release identity
- `F2` local desktop theme projection
- `F3` desktop screenshot capture and attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git surface isolation from draft ownership
- `F6` origin only GitHub target resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues
- `F9` plan markdown preview and markdown rendering behavior
- `F10` Codex model and binary selection
- `F11` source control provider lane and publish workflow
- `F12` provider instance identity seam
- `F13` auth access management
- `F14` unified project context and inference dashboard
- `F15` connection resilience and offline send durability

## Change Procedure

- Update the affected feature spec in the same change that modifies fork behavior.
- Add a new feature spec before merge if a new fork owned surface is introduced.
- Remove a feature spec only when the fork intentionally drops that behavior and the replacement is documented here in the same change.
- Keep `patch.md` and the matching `fork/` spec in sync.
- For a new feature, add the spec file first, then add it to the feature index and origin rebuild order.
