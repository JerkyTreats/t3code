# Upstream intake 2026-10-27

Date: 2026-10-27
Branch: `intake/upstream-20261027`
Status: verified source; staging, origin publication and production activation are separate decisions
Commit policy: [repository commit policy](../governance/commit_policy.md)

Delivery uses the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md) and its [ledger format](../.codex/skills/solo-vertical-delivery/references/ledger.md). [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this implementation record; [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns the workflow link and Commit Effects. Lane packets, the immutable comparison baseline, dispositions and review scratch stay untracked and create no product requirements.

## Objective baseline

Take upstream main through the pinned target onto the fork and preserve every protected fork outcome. Acceptance requires decision-level preservation evidence and the full repository gates. Upstream remains read-only and origin is the only publication target. No publication, staging or production activation is part of this record.

## Source requirements

| Source boundary      | Exact revision                             |
| -------------------- | ------------------------------------------ |
| Accepted origin main | `b2290369a1294540c2f14e3a218f5bac0604ae4f` |
| Upstream target      | `531cee6f169578183e1b9d63032e5e9b68db9c03` |
| Merge base           | `9828cad49f3e1ef4f9e037b3baaca19f4e4928fc` |

[The patch guide](../patch.md) selects preserved outcomes. The [intake policy](../governance/upstream_merge_policy.md), [isolation policy](../governance/fork_isolation_policy.md), [compatibility policy](../governance/compatibility_policy.md) and [privacy policy](../governance/privacy_and_publication_policy.md) control their treatment. The 593-commit range merged with 215 conflicted paths, 413 text hunks and 35 modify/delete units. The immutable baseline froze 19 concerns and 525 decision items before resolution; every unit received a recorded accept, replay or override disposition.

## Integration decisions

The selected workflow is merge and repair. Fork owners were rebuilt on current upstream hosts in the previous intake, so ancestry merge kept intent visible. Four ownership lanes resolved foundation, exact origin, release and desktop, and clients; root owned contracts, migration registration, governance text and integration.

User decision on 2026-10-27: accept upstream's new design as the default. Upstream later made it the only design, so fork presentation now follows its 16-pixel composer radius and separator-free controls while keeping the floating permission control, full-width checkout strip, top spacing, screenshot button and nested thread badges.

Root decisions:

- Upstream's MCP tool consolidation is accepted; the fork keeps its four MCP endpoints with separate admission, and the Poteto runtime mapping follows the new tool names.
- Linked environments forward only to a peer's `/mcp`, so pull request tools forwarded to a fork peer fail closed.
- Four new upstream workflows (`relay-preview`, `relay-preview-cleanup`, `stale-needs-more-info`, `agent-context-budget`) are excluded as retired publication and preview automation, and CI keeps no OIDC token or task cache secret.
- The new server triage path writes exact-origin session files and never clones, fetches or deletes.
- `AGENTS.md` and `README.md` keep fork text.

Upstream migrations 69 through 72 continue at fork identities 93 through 96 after fork 92. A runtime built before 93 refuses to reopen an advanced journal.

## Preservation gate and repairs

Three fresh reviewers checked every baseline decision against the staged candidate. Repairs closed each blocking finding:

| Finding                                                          | Resolution                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Shell-created pull requests linked without an origin check       | The sync reactor links only change requests inside the exact origin repository     |
| Settled-thread snapshot trimming dropped nested parents          | A kept nested child keeps its parent in the shell snapshot                         |
| GitHub media fetch used the user's credential for any repository | Repository media is fetched only for the exact origin repository                   |
| GitCafe mutations followed redirects to other repositories       | Mutation redirects stay inside the origin repository                               |
| Azure SSH origins failed every hosted mutation                   | Mutation identity uses upstream's repository key primitive                         |
| Bitbucket preview omitted its origin context                     | Preview passes the origin context                                                  |
| Cached pull request detail missed custom web ports               | Display matching accepts a portless host only for providers without port authority |
| Screenshots lost the first-paint wait                            | Snapshots and the first recording frame wait for render readiness                  |
| Poteto guidance demanded an end-of-work PR list check            | Guidance follows the current tool contract                                         |
| Deleted service modules were still imported                      | Surviving code no longer reaches them                                              |

Recorded limits: a guest share outlives the device that created it until it expires or is closed; upstream media routes reuse one ticket while the fork nonce is single-use, unchanged from accepted origin; SwiftLint is unavailable on the Linux host; the redesigned surfaces have no new visual acceptance yet.

## Gate evidence

`pnpm fmt`, `pnpm lint`, `pnpm typecheck` and `pnpm lint:mobile` pass on the integrated source. `pnpm test` passes all 33 workspaces with 20,598 tests and 6 existing skips. Tests ran with `NODE_ENV` and every `T3CODE_*` variable unset; with `T3CODE_PORT` inherited from a running T3 host, the web browser-test server proxies `/ws` and `/api` to that host, so isolated runs are required. Kotlin static analysis ran with ktlint and detekt supplied for the run. No staging or production runtime was touched.

## Commit Effects

If applied, this commit lands upstream T3 Code through 531cee6f16 on the fork, including upstream's consolidated MCP tools, linked environments, guest thread sharing and new design, with every protected fork outcome preserved and new upstream paths held to exact-origin identity.

Production activation requires a stopped-service backup of the active database because migrations 93 through 96 advance the journal. Origin publication, staging and installed-client updates are separate decisions.
