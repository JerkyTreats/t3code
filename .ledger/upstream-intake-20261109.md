# Upstream intake 2026-11-09

Date: 2026-11-09
Branch: `reconcile/upstream-3e4d449308`, fast-forwarded onto `spike/canvas-surface-cards`
Status: verified source; origin publication is authorized by the user for this intake; staging and production activation are separate decisions
Commit policy: [repository commit policy](../governance/commit_policy.md)

Delivery uses the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md) and its [ledger format](../.codex/skills/solo-vertical-delivery/references/ledger.md). [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this implementation record; [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns the workflow link and Commit Effects. The frozen conflict baseline and lane packets stay untracked and create no product requirements.

## Objective baseline

Take upstream main through the pinned target onto the canvas working branch, preserve every protected fork outcome and the thread canvas (F32), and retire F30 Poteto Mode and F31 nested threads on the user's instruction. Acceptance requires decision-level preservation evidence and the full repository gates. Upstream remains read-only and origin is the only publication target.

## Source requirements

| Source boundary                                | Exact revision                             |
| ---------------------------------------------- | ------------------------------------------ |
| Working branch (`spike/canvas-surface-cards`)  | `62a28800f7`                               |
| Upstream target (`v0.1.8` release preparation) | `3e4d449308`                               |
| Merge base                                     | `ade473018d32003658b7d38693e083ee2e314bd8` |

The 141-commit range merged with 46 conflicted paths: 34 content units holding about 45 text hunks, 9 fork-deleted and upstream-modified files, and 3 fork-modified and upstream-deleted files. Upstream adds no migration; migration 104 remains the journal head.

## Integration decisions

The selected workflow is merge and repair. Root resolved server, desktop, docs, scripts, lockfile and governance units; one lane resolved the composer, timeline, settings, root route and canvas styles; two lanes retired F30 and F31.

- Fork-deleted release workflows, `uninstall`, pinned runtime and public install scripts stay deleted. Upstream's new `t3 install` command and its `npx t3` offer (`cli/install.ts`, `InstallT3Commands.tsx`) are not adopted: the fork never directs users to public npm acquisition. `binCli.ts` keeps the fork command set.
- Upstream's server restart hook (`DatabaseStorage.ServerRestart`) restarts only a desktop-supervised server; the service launcher stays excluded.
- Upstream removed plan mode (#33131). The plan send hook and plan follow-up composition are accepted as removed; fork retained chat-prompt context stays on the remaining composer, multiple-model and queued-edit send paths.
- Upstream's GitHub star prompt and the driver's star capability are not adopted: starring `pingdotgg/t3code` from a user's account is an action against upstream. Upstream's GitHub socket test proves REST routing instead of a change-request read, which F06 refuses without an exact origin.
- The new Welcome page (#33209) replaces the wizard and carries no `npx` or install text. `HostedEmptyState` keeps the fork's `t3 connect` and `t3 pair` commands.
- "Use T3 Code in another app (MCP)" (#33196) keeps its one-time approval-code dialog and Cmd-K entry; it lists no clients and offers no revoke, consistent with F17. Its button in Authorized clients stays out with the fork's F17 removal. MCP approval codes are digested like other pairing credentials, and the removed pairing-link change stream stays removed.
- `README.md`, the install, remote-access, FAQ and outside-agents docs, `AGENTS.md` and the server package version keep the fork text and identity.
- The new Cursor Origin source-control provider (`packages/source-control-cursor-origin`) is not adopted. It resolves the origin by hostname alone and sends requests to a fixed API host, so it cannot keep F06 exact-origin authority without its own target owner. Its package, registry and server driver entries, documentation section, link icon and lockfile entries are removed.
- F30 Poteto Mode and F31 nested threads are retired; see the [retired-feature record](../fork/retired-features.md).

## Preservation gate and repairs

A fresh `gpt-6-astra` high reviewer checked F17, F06, acquisition and service exclusion, restart, F32, F27, retained presentation, the F30 and F31 retirements and persistence against the staged candidate. Repairs closed each finding:

| Finding                                                                                                                | Severity   | Resolution                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream's GitHub socket client followed same-host redirects into other repositories and bodyless cross-host redirects | Blocking   | `isFollowableRedirect` follows only reads that stay on the original host and port and, for repository paths, inside the same `repos/{owner}/{name}`; tested |
| Cursor Origin dropped the origin endpoint's port and called a fixed API host                                           | Blocking   | Provider not adopted                                                                                                                                        |
| Cursor Origin admitted any repository on the host for in-app change requests                                           | Should-fix | Closed with the provider's exclusion                                                                                                                        |
| The MCP dialog's "Get code" always failed: the fork disables issuance yet advertises approval codes                    | Should-fix | The dialog tells the user to approve from a browser enrolled through the Admin portal; the unused web and client-runtime code-issuance commands are removed |
| `remote-access.md` prescribed `t3 up`, which the fork does not ship                                                    | Should-fix | Replaced with `t3 serve --host`, `t3 connect` and `t3 pair`                                                                                                 |

Gate repairs found by the tests: the fork CLI's pairing list keeps raw granted scopes rather than upstream's legacy-scope response view; the link-state test fixture grants `relay:read`, which the fork never infers from `relay:write`; upstream's new GitHub socket test proves REST routing because F06 refuses origin-less change-request reads; and the fork's desktop preload and standalone bootstrap tests provide the document and upstream's new `DesktopCliCommand` and shell-environment services. The CI workflow safety allowlist accepts upstream's reviewed `ci-changes` action digest and three read-only multiline steps (the desktop launch check under xvfb, its apt package and the gate job list). The agent context budget is set to the measured 8580, 10308 and 58687 bytes; it was already stale on the working branch after the canvas card guidance.

Deferred findings, not regressions of this intake:

- `useAccessEnvironment` and the MCP dialog's "Manage access" button point at `/settings/access`, whose fork page shows no client inventory; the wording there still describes upstream's page.
- No client received visual acceptance; the composer, timeline, Welcome page and MCP dialog are source-verified only.

## Gate evidence

`pnpm fmt`, `pnpm lint`, `pnpm typecheck` and the knip export check pass on the integrated source. Tests ran with `NODE_ENV` and every `T3CODE_*` variable unset, one workspace at a time, because the root runner stops at its first failure. After the repairs above, the final rerun of every changed workspace passes: server 7,194 (4 skipped), web 6,234 of 6,238, desktop 1,144, client-runtime 1,883, GitHub 394, contracts 222 and source-control core 73. The first full sweep passed the other workspaces, including mobile 3,363, shared 1,561, scripts 563 and evals 981. Of the web exceptions, the 12-hour reset test fails only under this host's `en_CA` locale, and the relay telemetry and inline merge-confirm tests fail only under full-suite load and pass in isolation. The Codex app-server client exit test failed once under the root runner and passes in isolation. `pnpm lint:mobile` was not run because no native mobile source changed in fork-owned code and SwiftLint, ktlint and detekt are not installed here. No staging or production runtime was touched.

## Commit Effects

If applied, this commit lands upstream T3 Code through 3e4d449308 on the canvas working branch, including the single Welcome page, using T3 Code from another app over MCP, model mentions in the composer, text generator settings and the removal of plan mode, while keeping exact-origin identity, fork persistence lineage, external Admin authority, T3 Thread and the thread canvas, and retiring Poteto Mode and nested threads.
