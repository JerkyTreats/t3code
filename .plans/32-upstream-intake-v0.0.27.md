# Upstream Intake v0.0.27

Date: 2026-06-13
Status: implemented and verified

## Scope

Integrate upstream `v0.0.27` from `pingdotgg/t3code` into the Omarchy fork.

Target upstream tag: `v0.0.27`

Target upstream commit: `a3422a9bb`

Current fork head during intake review: `24b42c4b5`

Prior accepted upstream tag: `v0.0.25`

Prior upstream commit: `348a9140e`

Selected workflow: merge and repair

The user request to implement this plan is explicit approval for the required `AGENTS.md` policy conflict resolution under the Policy Proposal Flow.

## Intake Summary

The upstream range from `v0.0.25` to `v0.0.27` has 40 commits.

Raw upstream diff from `v0.0.25` to `v0.0.27`:

```text
481 files changed, 55921 insertions, 2678 deletions
```

Fork head compared to `v0.0.27`:

```text
698 files changed, 56694 insertions, 27049 deletions
```

Dry merge tree: `22d574c216b942452b2a43f9eebfb5b5556215dd`

## Upstream Commit Inventory

```text
b0fa60a12 Prevent settings layout shifts with scrollbar gutters (#2960)
dfdb5a46d [codex] fix release finalize install (#2961)
49c1b6468 fix(source-control): handle self-hosted GitLab, multi-account GitHub auth & azure devops web url (#2480)
a74dfd4f3 [codex] Avoid shell for Node executable spawns (#2952)
6ce6f678b [codex] Avoid shell for Windows environment probe (#2951)
53042f47f fix(composer): support spaces in file mentions (#2625)
300f7fd11 [codex] Avoid shell for system executables (#2950)
5ae77c0d6 feat(relay): Add managed relay tunnels and APN service (#2837)
ec18938bf Restructure documentation into topical folders (#2963)
b5a62504d move
295b9db11 dont fail if env-file is unspecified
769bdd251 fallback to None when RELAY_DOMAIN is unset
969e6d274 implicit install from vp
af3dfd229 forward args directly
357900511 bump alchemy to fix absolute drizzle schema out
eda163ca1 bump alchemy to fix drizzle schema out attempt 2
f60def205 Migrate tests to vite-plus test APIs (#2964)
113b9d84c remove `vp staged`
94fc11756 publish deploy status on relay deploy workflow
e1cb19b55 Use pnpm for server publish workflow (#2966)
b870a6e34 Rename function for publishing arguments to vp pm (#2967)
a084fbbc0 Remove duplicate 'publish' argument in CLI script
9da430c82 Refactor recoverable Effect fallbacks to orElseSucceed (#2968)
c04d15d3b document vp instead of mise
5b26bd408 link
6f42bd9c8 cleanup
8ab58a0b2 tip
0d6e9e9ad we support cursor, duhhh
92be60e7c include @latest
602148f8f fix(cloud): use Electron fetch for proxying Clerk IPC requests (#2973)
e1ce9f850 fix: handle Claude Agent SDK 0.3.x system messages to stop runtime-warning flood (#2872)
75257d64e "claude system message" instead of "runtime warning" when using 4.8 from claude code (#2972)
b76f161d5 fix(desktop): stop looping macOS TCC permission prompts (#2745)
a56496c7f Annotate relay error spans with schema fields (#2976)
3ea6adf17 [codex] Enrich relay authorization diagnostics (#2977)
0e4a43519 [codex] Extract infrastructure, telemetry, and test tooling (#2994)
38ea6d483 feat(grok): add Grok CLI provider via ACP (#2809)
8e6f4229d [codex] Fix main CI Effect test runtimes (#3008)
de58ec8e2 Add Claude Fable 5 model (#3009)
983a8c7fa chore(release): prepare v0.0.26
22f9f3058 [codex] Rebrand T3 Cloud as T3 Connect (#3011)
a3422a9bb Fix Clerk browser test mock (#3013)
```

## Product Lane Decisions

- `accept` T3 Connect cloud auth, managed relay, relay infra, APN activity, mobile cloud flows, Grok ACP, Claude Fable 5, source control provider fixes, process spawn hardening, docs restructure, Vite plus test fixes, and release workflow fixes.
- `replay` Omarchy desktop identity, Omarchy theme, Omarchy screenshot capture, composer draft autonomy, Git panel draft isolation, fork first GitHub identity, branch promotion, worktree lifecycle, plan cues, markdown preview, project management, provider instance identity, Codex binary and model discovery, and auth access management.
- `override` upstream behavior that deletes fork seams, routes GitHub actions to upstream remotes, removes Omarchy desktop behavior, removes current session revocation protection, or collapses project identity into grouping labels.

## Protected Fork Features Touched

- `F1` branding and release identity
- `F2` Omarchy system theme projection
- `F3` Omarchy screenshot capture and attach flow
- `F4` composer draft autonomy and composer chrome
- `F5` Git panel isolation from draft ownership
- `F6` fork first GitHub identity resolution
- `F7` local branch, worktree, and promotion workflow
- `F8` plan aware sidebar and activity status cues
- `F9` plan markdown preview and document markdown rendering behavior
- `F10` Codex model and binary selection
- `F11` source control provider lane and publish workflow
- `F12` provider instance identity seam
- `F13` auth access management
- `F14` project management and inference dashboard

## Direct Conflict Inventory

Dry merge conflicts from `git merge-tree --write-tree HEAD v0.0.27`:

```text
AGENTS.md
apps/desktop/scripts/electron-launcher.mjs
apps/desktop/src/app/DesktopApp.ts
apps/desktop/src/app/DesktopEnvironment.test.ts
apps/desktop/src/app/DesktopEnvironment.ts
apps/desktop/src/main.ts
apps/server/src/persistence/Migrations.ts
apps/server/src/vcs/GitVcsDriverCore.ts
apps/server/src/ws.ts
apps/web/src/components/settings/ConnectionsSettings.tsx
apps/web/src/routes/_chat.index.tsx
packages/contracts/src/rpc.ts
```

## Replay Order

### Slice 1 Governance And Plan Note

Decision: `replay`

Upstream primitives:

- upstream `AGENTS.md` toolchain guidance
- upstream docs structure

Fork seams:

- `AGENTS.md`
- `patch.md`
- `governance/upstream_merge_policy.md`

Implementation notes:

- Preserve fork governance, pnpm gates, governance index, upstream merge policy, patch guide references, Codex app server notes, and pnpm repo sync instructions.
- Do not restore upstream `vp check`, `vp run typecheck`, or `bun run sync:repos`.

### Slice 2 Dependency And Tooling Substrate

Decision: `accept`

Upstream primitives:

- package metadata
- `pnpm-lock.yaml`
- `.github/workflows/release.yml`
- `.github/workflows/deploy-relay.yml`
- Vite plus configs

Implementation notes:

- Accept upstream dependency, release, relay deployment, and test tooling changes.
- Preserve fork release identity behavior through desktop and release script seams.

### Slice 3 Persistence

Decision: `replay`

Upstream primitives:

- `032_AuthPairingProofKeyThumbprint`
- upstream auth pairing proof key thumbprint schema

Fork seams:

- migration ordering policy
- `apps/server/src/persistence/Migrations.ts`

Implementation notes:

- Preserve fork ids `031_RepairProjectionThreadShellSummary`, `032_ProjectionThreadIssueLink`, and `033_AuthAuthorizationScopes`.
- Add upstream `AuthPairingProofKeyThumbprint` as id `034`.
- Update migration imports, entries, tests, and through id coverage.

### Slice 4 Desktop

Decision: `accept` plus `replay`

Upstream primitives:

- desktop cloud auth
- Electron fetch for Clerk IPC proxy
- macOS TCC loop fix
- desktop release fixes

Fork seams:

- Omarchy product identity
- Omarchy theme source service
- Omarchy screenshot capture service
- desktop IPC theme and screenshot bridge
- Codex binary environment bridge

Implementation notes:

- Merge T3 Connect auth with Omarchy product identity, theme projection, screenshot IPC, and Codex binary path preservation.
- Keep mobile and hosted web identity upstream owned.

### Slice 5 Contracts And Transport

Decision: `accept` plus `replay`

Upstream primitives:

- relay contracts
- relay client contracts
- managed relay state
- DPoP helpers
- Environment HttpApi changes

Fork seams:

- RPC auth access methods
- IPC desktop screenshot and theme methods
- WebSocket method router

Implementation notes:

- Keep RPC and IPC additive.
- Merge relay, cloud, source control, provider, and auth additions without removals.
- Preserve current session revocation protection and capability gating.

### Slice 6 Git And Source Control

Decision: `accept` plus `replay`

Upstream primitives:

- self hosted GitLab support
- multi account GitHub auth support
- Azure DevOps web URL support
- source control auth status helpers

Fork seams:

- fork first GitHub identity policy
- source control context policy
- Git promotion policy
- worktree lifecycle helpers

Implementation notes:

- Replay fork first identity and branch promotion on top of upstream provider fixes.
- Keep publish behavior provider neutral.
- Keep GitHub issue UI GitHub scoped until parity exists.

### Slice 7 Providers

Decision: `accept` plus `replay`

Upstream primitives:

- Grok ACP provider
- Claude Fable 5 model
- Claude Agent SDK system message handling
- provider test runtime fixes

Fork seams:

- provider instance identity
- Codex binary resolver
- Codex app server model and skill discovery

Implementation notes:

- Accept Grok and Claude model changes.
- Preserve instance aware provider routing and Codex live discovery.

### Slice 8 Web Composer And Routes

Decision: `accept` plus `replay`

Upstream primitives:

- file mention support for spaces
- settings layout fixes
- empty state and connect affordances

Fork seams:

- composer rich draft helper
- composer screenshot helper
- plan presentation policy
- project management routes
- markdown preview renderer

Implementation notes:

- Preserve rich drafts, screenshot action, top chrome, route driven project management, plan cues, and markdown preview routes.
- Ensure project grouping remains presentation only.

### Slice 9 Mobile And Relay

Decision: `accept`

Upstream primitives:

- mobile cloud auth
- managed relay
- agent awareness
- APN service
- relay infra

Implementation notes:

- Accept these as upstream owned product lanes unless they break shared contracts used by fork features.

## Selective Port Exceptions

- Real Codex runtime mode integration is explicit opt in through `T3CODE_RUN_REAL_CODEX_INTEGRATION_TESTS=1`. The local shell exports `CODEX_BINARY_PATH`, which made the live Codex test run during normal gates and timeout before its own wait budget. The scenario remains available with a longer timeout when explicitly enabled.
- Test mock imports keep `vi` sourced from the runner provided `vitest` module, while normal test APIs use `@effect/vitest`. App local type shims avoid adding direct `vitest` package edges that create duplicate runner context.
- `Schema.Defect` bare values from older fork tests were updated to `Schema.Defect()` for Effect `4.0.0-beta.78`.

## Verification Evidence Required

Focused package gates:

```text
PASS pnpm --filter @t3tools/contracts test
PASS pnpm --filter @t3tools/client-runtime test
PASS pnpm --filter @t3tools/shared test
PASS pnpm --filter @t3tools/desktop test
PASS pnpm --filter t3 test
PASS pnpm --filter @t3tools/web test
PASS pnpm lint:mobile
```

Full repository gates:

```text
PASS pnpm fmt
PASS pnpm lint
PASS pnpm typecheck
PASS pnpm test
PASS pnpm lint:mobile
```

Do not run `bun test`.

Verification notes:

- `pnpm lint` passed with three unused disable warnings in existing web files.
- `pnpm typecheck` passed with Effect suggestion diagnostics for `Effect.orElseSucceed`.
- `pnpm lint:mobile` passed and skipped optional native linters because `swiftlint`, `ktlint`, and `detekt` are not installed.
- Server migration output verified execution order through `34_AuthPairingProofKeyThumbprint`.
- Fork seam audit verified all requested seam files and matching tests remain present after merge repair.

## Preservation Gate Checklist

- Verify no fork seam remains deleted.
- Verify active drafts, screenshots, attachments, and local Git context remain intact.
- Verify fork specific sidebar, panel, plan, markdown, and project affordances render and behave as expected.
- Verify public contracts are additive or carry explicit compatibility notes.
- Update `patch.md` or feature specs only if behavior or owner modules change.
