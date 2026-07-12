# Upstream Intake v0.0.22 To v0.0.23

Date: 2026-05-26
Status: assessment

## Scope

Assess upstream `v0.0.23` for integration into the Omarchy fork.

Upstream range: `v0.0.22..v0.0.23`

Release tag: `v0.0.23` at `3c32bc8f`

Current fork head during assessment: `01f7a858`

## Summary

This release is not a clean merge candidate. The new upstream range has 39 commits and touches 666 files.

A direct merge reports broad conflicts across desktop bootstrap, server auth, provider runtime, Git workflow, persistence, settings, and protected web surfaces. The fork should integrate this as ordered slice commits, not as one merge.

## Protected Fork Features Reviewed

- `F1` branding and release identity
- `F2` Omarchy system theme projection
- `F3` Omarchy screenshot capture and attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git panel isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues
- `F9` plan markdown preview and markdown rendering behavior
- `F10` Codex model and binary selection
- `F11` source control provider lane and publish workflow
- `F12` provider instance identity seam
- `F13` auth access management

## Initial Slice Map

### Slice 1: Release And Hosted Web Plumbing

Outcome: adapt

Upstream commits:

- `aa8b9f22` Deploy hosted web app from release workflow
- `073eb389` Fix Windows release signing setup
- `6b9feb1b` Update deployment command in release workflow
- `39371c60` Fix Vercel release web deploy scope
- `6efdf67e` Fix Vercel Turbo env forwarding
- `3c32bc8f` Fix hosted channel bootstrap

Fork seam:

- `.github/workflows/release.yml`
- `apps/web/vite.config.ts`
- `apps/web/vercel.ts`
- release branding scripts

Notes:

- Preserve Omarchy release identity and desktop package naming.
- Hosted web deploy changes are useful, but release workflow conflicts with fork packaging and branding.

### Slice 2: Desktop Effect Split And Remote Exposure

Outcome: adapt

Upstream commits:

- `aa219be7` port desktop app to Effect
- `9d919d0b` Move desktop server exposure logic into backend
- `932df4ed` fix ssh reconnect issues and node binary path resolution
- `e0f3abd1` Fix remote pairing CORS responses

Fork seam:

- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/omarchyTheme.ts`
- `apps/desktop/src/screenshotCapture.ts`
- desktop backend and IPC modules after extraction

Notes:

- This is the highest risk slice.
- The upstream split deletes and replaces many flat desktop modules that currently carry Omarchy theme and screenshot behavior.
- Preserve Omarchy theme projection and screenshot capture as fork owned adapters before moving desktop startup code.

### Slice 3: Provider Maintenance And Runtime Fixes

Outcome: adapt

Upstream commits:

- `9b604bca` provider update advisories
- `dd32f526` Refresh Codex protocol bindings and adapter mappings
- `271d65e0` Fix OpenCode raw text delta assembly
- `7bfacd55` Handle NuGet provider bootstrap failures
- `34ec8a86` add configurable automatic git fetch interval

Fork seam:

- `apps/server/src/provider`
- `apps/server/src/codexAppServerManager.ts`
- `apps/web/src/components/settings/SettingsPanels.tsx`
- provider instance settings and snapshot modules

Notes:

- Provider update advisories and OpenCode fixes are valuable.
- Codex protocol refresh must preserve app server model and skill discovery from `F10`.
- Provider settings UI must preserve fork provider instance layout from `F12`.

### Slice 4: Settings And Diagnostics UI

Outcome: adapt

Upstream commits:

- `0e388706` Add keybindings settings editor
- `a2ff50db` Add process and trace diagnostics views
- `25b02f4b` Enable stricter Effect LSP rules
- `825263b6` Scaffold oxlint plugin with initial rule

Fork seam:

- `apps/web/src/components/settings`
- `apps/server/src/keybindings.ts`
- `apps/server/src/diagnostics`
- `packages/shared/src/observability.ts`
- `oxlint-plugin-t3code`

Notes:

- The features are useful and mostly additive.
- Settings navigation conflicts with fork connections, provider, source control, and archived settings surfaces.

### Slice 5: Timeline, Sidebar, And Composer Product Polish

Outcome: adapt

Upstream commits:

- `536dcad1` Reduce timeline row rerenders
- `1498335e` Optimize MessagesTimeline work row stability
- `449e1aaa` Make changed files header sticky in chat timeline
- `131234be` Match sticky changed files header tint to card background
- `2ba58076` Avoid timeline timer rerender commits
- `99efaa0f` Collapse long user messages by default
- `466d8ee5` add configurable sidebar thread preview count
- `31b52acc` Fix sidebar preview settings reset
- `7455472c` Reduce sidebar selection rerenders
- `c27109cc` mention skills in composer placeholder
- `11f40556` render skill calls as inline chips

Fork seam:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/chat/MessagesTimeline.tsx`
- `apps/web/src/components/chat/ComposerCommandMenu.tsx`
- `apps/web/src/composerDraftStore.ts`

Notes:

- Performance fixes should be ported.
- Composer and sidebar UI must preserve fork draft ownership, screenshot chrome, and plan progress cues.
- Long message collapse is a product choice that needs fork design review before adoption.

### Slice 6: Git, Terminal, And Shell Reliability

Outcome: adapt

Upstream commits:

- `25c9d267` Stabilize git workspace and terminal tests
- `63859aa0` Add archived shell snapshot support
- related persistence and terminal changes in the range

Fork seam:

- `apps/server/src/git`
- `apps/server/src/terminal`
- `apps/server/src/persistence`
- `apps/web/src/lib/gitStatusState.ts`

Notes:

- Reliability improvements are desirable.
- Git changes must preserve fork first GitHub identity, promotion backups, worktree cleanup, and draft isolation.

### Slice 7: Editor Support

Outcome: mostly adopted

Upstream commits:

- `166bce03` Feature intellij editors

Fork seam:

- `packages/contracts/src/editor.ts`
- `apps/web/src/components/Icons.tsx`
- `apps/web/src/components/chat/OpenInPicker.tsx`

Notes:

- The current fork already includes IntelliJ IDEA support in these files.
- Recheck whether the upstream JetBrains icon extraction adds additional editors that should be ported.

### Slice 8: Mechanical Effect And Schema Idioms

Outcome: adopt when isolated

Upstream commits:

- `22384ae9` Adopt Effect JSON and DateTime idioms
- `1bcfc88f` Adopt idiomatic Effect APIs in generator and decider
- related schema and generated binding changes

Fork seam:

- `packages/effect-acp`
- `packages/effect-codex-app-server`
- `packages/shared/src/schemaJson.ts`
- orchestration decider modules

Notes:

- Adopt after provider runtime seams are stable to avoid mixing generated binding churn with product behavior.

## Initial Risk Assessment

- High: desktop Effect split, provider runtime maintenance, Git workflow reconciliation.
- Medium: settings and diagnostics, timeline and sidebar performance, hosted release workflow.
- Low: IntelliJ editor support, release docs, isolated generated binding refresh.

## Recommended Integration Order

1. Create the release workflow and hosted web slice with Omarchy branding preserved.
2. Port low risk UI and editor support that is already close to fork shape.
3. Port diagnostics and keybindings behind the fork settings layout.
4. Port provider maintenance and Codex protocol updates through `F10` and `F12`.
5. Port Git and shell reliability changes through `F6` and `F7`.
6. Split desktop app modules only after extracting Omarchy theme and screenshot adapters.

## Verification Gate

Before merge readiness:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- focused tests for provider runtime, source control, Git workflow, desktop IPC, settings, and protected web surfaces
- manual desktop smoke for Omarchy theme and screenshot attach flow
- manual web smoke for composer draft retention, sidebar plan progress, settings navigation, hosted pairing, and Git panel isolation

## Latest Upstream Addendum

Date: 2026-05-26

Latest checked upstream: `upstream/main` at `4f0f24f0`

Latest upstream is 20 commits beyond `v0.0.23` and 251 commits ahead of the fork head used for this assessment.

The additional upstream commits do not change the strategic recommendation. If rebuilding from an upstream base, target latest `upstream/main` rather than `v0.0.23`.

Additional upstream themes beyond `v0.0.23`:

- `v0.0.24` release prep and desktop runtime dependency cleanup
- VCS diff loading and remote refresh reliability
- diagnostics resource history
- browser resume reconnect hardening
- composer ref and context provider refactor
- chat timeline activity rerender reductions
- Effect child process based editor launches
- stable release router domain aliasing
- multi provider reasoning selection persistence
- marketing site refresh

Direct merge check against `upstream/main`:

- 389 reported conflicts
- 1171 merge affected paths

Decision update:

- Prefer a clean upstream base branch at `upstream/main`.
- Re-port fork owned product features from `patch.md` as explicit commits.
- Do not attempt a normal merge of `upstream/main` into the current fork branch.
- Keep the slice map above, with the latest upstream additions folded into provider, VCS, diagnostics, composer, and release slices.
