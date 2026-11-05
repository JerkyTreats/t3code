# Upstream intake 2026-11-04

Date: 2026-11-04
Branch: `intake/upstream-20261104`
Status: verified source; origin publication, staging and production activation are separate decisions
Commit policy: [repository commit policy](../governance/commit_policy.md)

Delivery uses the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md) and its [ledger format](../.codex/skills/solo-vertical-delivery/references/ledger.md). [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this implementation record; [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns the workflow link and Commit Effects. Lane packets, the frozen conflict baseline, dispositions and review scratch stay untracked and create no product requirements.

## Objective baseline

Take upstream main through the pinned target onto the working branch and preserve every protected fork outcome plus the canvas demo. Acceptance requires decision-level preservation evidence and the full repository gates. Upstream remains read-only and origin is the only publication target. No publication, staging or production activation is part of this record.

## Source requirements

| Source boundary                          | Exact revision                             |
| ---------------------------------------- | ------------------------------------------ |
| Working branch (`demo/excalidraw-board`) | `d6106538d158def1e2d161c522ee755d3d12b624` |
| Accepted origin main                     | `c642f945d5a1360f700b9d59e50e8798559c2633` |
| Upstream target                          | `a21d788752695764028e6d26ba924f3963e05806` |
| Merge base                               | `531cee6f169578183e1b9d63032e5e9b68db9c03` |

The working branch carries 34 canvas demo commits over origin main. [The patch guide](../patch.md) has no entry for the canvas demo; this intake treated its outcomes as protected: the `canvas_read`, `canvas_update` and `canvas_preview` MCP tools, the diagram layout engine, the restart note, canvas orchestration guidance and the web board.

The 1,370-commit range merged with 196 conflicted paths: 162 content, 1 add/add and 33 modify/delete units, holding 371 text hunks. The frozen baseline was recorded before resolution; every unit received a recorded accept, replay or override disposition.

## Integration decisions

The selected workflow is merge and repair. Five disjoint lanes resolved server authority and persistence, orchestration and MCP, source control, web and clients, and desktop, release and docs. Root owned the migration registry, dependency graph, context budget and cross-lane retirements.

Root decisions:

- Upstream migrations 73 through 79 continue at fork identities 97 through 103 after fork 96. Upstream's preview-migration reconciliation and V2 skip assertion are not adopted because the fork lineage selector owns both checks.
- Fork-deleted service, update, uninstall, boot service, pinned runtime and launcher modules stay deleted. Upstream's `t3 up`, `t3 service protect`, npm release lookup and fleet Stable/Nightly switch build on them or on the public npm registry, so they are excluded; the desktop's own update-track select remains.
- Upstream's GitHub star prompt is removed with its star RPCs, because it stars the upstream repository with the user's credential.
- The fork keeps its four MCP endpoints with separate admission; upstream's in-process MCP layers and `t3-code-direct` server are carried on them. Canvas tools stay on the orchestration endpoint.
- Event-store pruning follows upstream but keeps every legacy v1 event and command receipt.
- Strict peer dependencies are kept; Excalidraw's Radix 1.0 peers are admitted for React 19 by name. Thread's `electron-builder` matches desktop at 26.16.1, and Thread type-checks with `effect-tsgo` like every other package.
- Two new upstream EAS and fingerprint workflows are excluded with the retired publication workflows.
- `AGENTS.md` and `README.md` keep fork text.

## Preservation gate and repairs

Three fresh reviewers checked server authority and persistence, client and desktop outcomes, and the canvas demo against the staged candidate. Repairs closed each blocking finding:

| Finding                                                                           | Resolution                                                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Upstream's `link_pull_requests` linked pull requests from any repository          | The call resolves the thread's project and links nothing when any target lies outside exact origin   |
| Upstream text sent users to `npx t3 serve` and `t3 up`                            | Pairing, serve and onboarding text keep fork wording                                                 |
| A side chat in Comfortable width mounted a second canvas board                    | Side chats keep the ordinary chat layout                                                             |
| The checkout strip lost its shared glass when upstream renamed the context row    | The fork presentation owner targets upstream's context row and paints one backdrop                   |
| Runtime mode appeared in the floating lock, the picker footer and the draft strip | While the lock floats, the picker footer and strip omit permissions; compact layouts keep upstream's |

Integration repairs found by the gates: the merged CI dependency action had a duplicated step key, now fixed with its reviewed digest; upstream's new knip pre-commit check passes after unused fork and retired-feature exports were removed or made file-local, the unused preview-migration helper was deleted and the fork's path-loaded scripts were declared; the Thread package type-checks with `effect-tsgo`; fork tests adopt upstream's crypto services, `Redacted` tickets and renamed services; Pi launch keeps its `hasT3Mcp` result; upstream's new right-panel close test runs against the F23 hook, where a confirmed close is dropped once the route leaves its thread.

Recorded limits:

- The redesigned composer, checkout strip glass and floating lock placement have no visual acceptance yet; upstream removed the desktop resting state, so the lock now falls back to the toolbar only when primary actions go compact.
- A side chat reads its own canvas, not its parent's.
- Upstream's admin-managed update `feedUrl` policy can replace the origin update feed; it is opt-in managed policy and is not exercised by the fork.
- Empty pinned project folders may appear in the T3 Threads sidebar view.
- Dead upstream track-switch plumbing remains in desktop update and telemetry services, the descriptor's migration head and `connect.ts`; nothing reaches it.
- GitLab change-request stats rely on the batched origin-selected caller rather than a provider-level origin binding, matching the GitHub equivalent.
- The canvas demo still has no patch guide entry.
- The fork's Azure DevOps threads-URL membership guard had no caller before this intake and was removed as dead code.

## Gate evidence

`pnpm fmt`, `pnpm lint` and `pnpm typecheck` pass on the integrated source; typecheck now runs `effect-tsgo` in every package. Tests ran with `NODE_ENV` and every `T3CODE_*` variable unset, one workspace at a time, because parallel web and mobile runs exhaust memory on this host. Thirty-two workspaces pass; the server passes 6,771 tests after three intake repairs, desktop 1,121 and web 5,928 of 5,930. The web exceptions are the existing 12-hour reset test, which fails only under this host's `en_CA` locale, and `AddEnvironmentDialog` SSH dismissal, which failed once under full-suite load and passes in isolation. Upstream changed native Swift and Kotlin sources that the fork does not modify; `pnpm lint:mobile` could not run because SwiftLint, ktlint and detekt are not installed on this host. No staging or production runtime was touched, and no client received visual acceptance.

## Commit Effects

If applied, this commit lands upstream T3 Code through a21d788752 on the canvas working branch, including side chats, project folders, pinned and archived projects, the grouped composer, MCP Apps and secret providers, while keeping exact-origin identity, fork persistence lineage, external Admin authority, T3 Thread and the canvas tools.

Production activation requires a stopped-service backup of the active database because migrations 97 through 103 advance the journal. Origin publication, staging and installed-client updates are separate decisions.
