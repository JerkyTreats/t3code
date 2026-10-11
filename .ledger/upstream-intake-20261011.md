# Upstream intake evidence

Date: 2026-10-11
Branch: `reconcile/upstream-intake-20261011`
Commit policy: [repository commit policy](../governance/commit_policy.md)
Objective: integrate pinned upstream while preserving the user-selected local main and its four newer commits.
Status: source verified; local commit and staging deployment authorized

## Objective Baseline

The selected local base is `c7ec2a7113baa849eacabe9296518333d8e99868`, accepted origin is `146a41bf6fc445180a55f84cc8ce19a57c0bf29f`, and upstream target is `bed923986fbcbe8279f23b9367efde1596bde1f9`. The prior accepted upstream is `ec80933ac8cd02fec5c97b342462ccc9567cdb1e`. The selected base retains the accepted theme and Poteto Mode work.

Acceptance requires active outcomes, durable decision owners, focused and replacement-host proofs, declared overlaps, zero blocking decision-bearing conflicts, fresh source reviews and repository gates. The initial source-intake grant excluded commit, publication, accepted-main replacement, deployment, live-state access and visual or installed-client acceptance. The later user request authorizes a local commit, all staging deployment and a separate production snapshot migration test; publication, accepted-main replacement and production activation remain outside scope. Source verification does not establish installed acceptance.

## Source Requirements

[The patch guide](../patch.md), active `fork/` contracts, [upstream reconciliation](../governance/upstream_merge_policy.md), [fork isolation](../governance/fork_isolation_policy.md), [compatibility](../governance/compatibility_policy.md) and [privacy](../governance/privacy_and_publication_policy.md) govern this intake. [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this record and [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns delivery workflow and Commit Effects. Temporary baseline, source snapshots, fingerprints, packets, logs and dispositions remain outside tracked artifacts.

## Vertical Plan

Freeze source and semantic attribution, merge without commit, repair disjoint domains, integrate shared contracts, run owner and replacement-host checks, run joined gates, perform fresh reviews, then propose the patch-guide update under its confirmation rule. The lead alone owns index staging, shared contracts, dependency synchronization and final gates.

## Parallel Work Slices

Persistence owns lineage and storage; origin owns Git and hosted source-control authority; providers own runtime adapters; runtime owns auth, MCP and server composition; web owns client presentation and shared client operations; platform owns Code, Thread, mobile, SSH, shared substrate and packaging. Documentation is lead-owned. Reviewers have independent, read-only data/provider, client/platform and authority lanes.

## Agent Strength Plan

Implementation and fresh review use inherited Codex `gpt-6.1-sol` at high reasoning effort. No separate strength selector is exposed. Narrow disjoint packets and fresh reviewer context supply independent scrutiny; concrete acceptance failures trigger scoped fixes and affected re-review.

## Requirement Coverage

- [Persistence](../fork/persistence-compatibility.md): upstream source migration 61 executes at additive fork identity 84. Earlier identities and admission fences survive. Synthetic fresh and historical fixtures prove retained records, production repository behavior, independent reopen, post-DDL transactional rollback and retry.
- [F06](../fork/F06-exact-origin-repository-identity.md): package-safe target and review-thread owners replace application imports. Current registry, GitCafe, published-branch discovery and review-guide generation retain literal origin, exact endpoint and live-authority checks. Client membership and endpoint preparation have explicit owners with port and full Azure-selector proofs.
- [F17](../fork/F17-settings-admin.md): portal routes and response boundaries, persisted admission, independent-runtime revocation and current granular grants survive. Four MCP endpoints remain independently admitted, including DELETE session isolation and current canonical tool discovery.
- Providers and [F27](../fork/F27-t3-thread.md): current upstream lifecycle and adapter packages are retained. Capability-specific session authentication, structured Pi results and typed pre42 failures survive. Explicit child metadata prevents parent creation-surface inheritance.
- [F02](../fork/F02-omarchy-system-theme.md), [F22](../fork/F22-serialized-mermaid-rendering.md) and [F30](../fork/F30-poteto-mode-workflow.md): both shell theme bridges, bounded Mermaid rendering and stable guide identities, Poteto applicability, selection, compact placement and history hiding remain owned. The reviewed 31-file skill bundle retains its locked bytes.
- [F16](../fork/F16-official-linux-desktop-launcher.md), [F20](../fork/F20-origin-server-image.md) and [F01](../fork/F01-exact-origin-desktop-release.md): standalone registration plans preserve installer ownership; runtime updates keep operator-managed refusal; registry-free invocation and SSH acquisition remain. Current mobile and native input are accepted upstream substrate.
- Retired Board, liaison, Fleet and fork voice remain retired. New upstream workflow, review, provider and ordinary client mechanics do not reinstate their authority.

No fuzzing was selected for this bounded integration. Active contracts describe changed owner boundaries; focused tests exercise production owner behavior and current or replacement adapters rather than duplicating implementation labels.

## Worktrees

The intake uses an isolated worktree and reconciliation branch from the selected base. The original checkout and unrelated work are preserved. Accepted main and origin remain unchanged. No repository was cloned.

## Gate Evidence

The final unassisted formatter, lint, typecheck across all 33 workspace tasks, full test gate and mobile static-check command pass. The full test command exited successfully with 24816 passing tests and 31 skipped tests across 31 completed workspace reports. No runtime guard, assertion, compiler severity or required gate was weakened. An earlier full run required a synthetic mount-fixture rescue and is not final acceptance evidence. Earlier failures and corrected fixture or temporary-path causes remain in the private command record.

| Gate           | Command                              | Result | Evidence date | Boundary                                                                         |
| -------------- | ------------------------------------ | ------ | ------------- | -------------------------------------------------------------------------------- |
| Format         | `pnpm fmt`                           | pass   | 2026-10-11    | Final source and active documentation                                            |
| Lint           | `pnpm lint`                          | pass   | 2026-10-11    | Existing upstream nonblocking warnings retained                                  |
| Types          | `pnpm typecheck`                     | pass   | 2026-10-11    | All 33 tasks; no severity overrides                                              |
| Tests          | `pnpm test`                          | pass   | 2026-10-11    | Entire workspace; unassisted exit 0; server uses serial files                    |
| Native mobile  | `pnpm lint:mobile`                   | pass   | 2026-10-11    | Current native inputs; optional SwiftLint, ktlint and detekt unavailable         |
| Production web | `vp run --filter @t3tools/web build` | pass   | 2026-10-11    | Separate Mermaid chunks and bootstrapped application static-import graph checked |

Production bundle evidence does not establish visual acceptance. The reviewed skill lock verifies all 31 bundle files. Immutable baseline and supplemental hashes remain unchanged.

## Commit Evidence

The user authorized a local commit and all staging deployment on 2026-10-11 after reviewing the patch-guide proposal. That continuation authorizes the implementation-index refresh in this change. The merge retains selected local main as its first parent and the pinned upstream target as its second parent. Publication and production activation remain outside this grant. The production snapshot migration test is separately authorized and uses a disposable private copy.

## Commit Effects

If applied, this commit integrates the pinned upstream improvements while retaining fork authority, migration lineage, theme, Poteto Mode and independent Code and Thread behavior.

## Review Lanes

Data/provider review found no blockers and independently passed 42 focused tests. Client/platform and authority reviews identified concrete integration gaps, verified their repairs and found no remaining blocking source issue. A fresh narrow authority round independently proves both same-repository and cross-repository GitCafe checkout and bound or unbound refusal behavior. Inspected source blob identities and immutable baseline hashes bind each private receipt. All final source changes require affected review coverage.

## Blocking Findings

GitCafe list expansion and bound clone lookup lost origin context; nonempty-page and independent current checkout proofs verify both repairs. Preview host fixtures lacked current route dependencies; corrected mocks execute the replacement-host cases. Mermaid now uses the upstream resize helper with synchronous adjustment and cancellation proofs. New core tests use the repository test import. Incoming PR service and client expectations that permitted absent selected-project origin or cross-repository credential borrowing now assert refusal and zero provider calls. Desktop fixtures use synthetic temporary roots and pass the selected temporary directory into isolated CLI-shim children; the mount helper proves it receives that directory without inheriting credentials; VCS mode tests set the real working-tree bit for current preview mechanics. A source-control fixture uses one composed layer instead of chained providers. No production admission guard, assertion, compiler severity or test gate was weakened. Blocking source findings are verified closed; all required joined gate commands pass.

## Deferred Findings

Nonconflicted EnvironmentAuth hosts retain direct client-authority predicates already declared in the baseline without isolated-owner credit. Passing portal-denial proofs do not claim that those predicates migrated. The hidden-directory ASAR glob limitation is a preexisting test environment constraint and is recorded without a packaging change.

## Phase Notes

The immutable comparison includes 89 raw conflicts, 196 overlaps and 1037 original fork hunk occurrences across 204 selected paths. These are source comparison diagnostics, not independent product requirements or isolation credit. New and moved origin and client hosts are separately declared. Original fingerprints cannot be replaced by later labels or paths. Final source audit accounts for all 1037 occurrences across 204 paths, with zero missing or extra fingerprints, stale candidate bindings or unmerged index entries. The tracked candidate-input digest, excluding this ledger to avoid self-reference, is `a652f0e3d8c875601718708e321889b2132bea56f3ef30b57f0ab0910d2aa6c4`. That source binding and fresh review establish the declared source decisions; they do not turn raw hunk counts into isolated-owner credit.

## Deliverable Closeout

Source implementation, focused and replacement-host proofs, fresh review and all required joined gate commands are complete. The patch-guide proposal was reviewed and the user continuation authorized applying it with the local commit. The implementation index records the current candidate without advancing origin or replacing accepted main. Staging deployment and a separate production snapshot migration test follow the source commit.

## Closeout

The source candidate remains local and reviewable. Installed Code, Thread, image runtime, native mobile and visual acceptance are unverified for this revision. The approved patch-guide refresh records this candidate target and current decision owners without changing governance. Its strength is alignment with verified source and the existing fork index; its tradeoff is maintaining a few additional owner entries. The subsequent user request authorizes the local commit and staging deployment. Production activation, remote publication and accepted-branch replacement remain separate actions. Installed staging and production snapshot evidence will be reported after deployment; source gate results do not preclaim those outcomes.
