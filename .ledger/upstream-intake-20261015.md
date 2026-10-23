# Upstream intake evidence

Date: 2026-10-15
Branch: `intake/upstream-20261015`
Commit policy: [repository commit policy](../governance/commit_policy.md)
Objective: integrate pinned upstream into accepted main while preserving every active fork outcome.
Status: source verified; local commit authorized; publication and deployment not authorized

## Objective Baseline

Accepted main and origin are `d9ab2bd9767f7b47e2f18a0d975edcf1cae008ba`. The upstream target is `42da166d131017335a1158d0b379dd68b8985796`, 261 commits past merge base `bed923986fbcbe8279f23b9367efde1596bde1f9`. The workflow is merge and repair in an isolated worktree. The private immutable baseline froze 35 conflicted paths, 61 text hunks, 5 non-text units and 50 decision identifiers across 18 active concerns before resolution began.

## Requirement Coverage

- [Persistence](../fork/persistence-compatibility.md): upstream migration 62 runs at fork identity 86. The fork loader keeps sole lineage authority. Upstream's V2-id skip guard and its test assume upstream numbering and are not adopted. SQLite setup carries upstream's synchronous, checkpoint and planner-statistics pragmas inside the fork setup hook.
- [F06](../fork/F06-exact-origin-repository-identity.md): origin-only remote selection survives inside upstream's Git state cache. Bitbucket keeps origin host authorization with upstream's workspace and slug. Upstream's new source-branch deletion is offered and executed only for a head branch inside the origin repository.
- [F01](../fork/F01-exact-origin-desktop-release.md) and [F20](../fork/F20-origin-server-image.md): upstream's nightly APK publication workflow and mirror script are removed. Deleted upstream release workflows stay deleted. Triage keeps exact-origin source access and no `npx` launch. Runtime state records the fork build identity. Update-everything offers self-update only to desktop-managed servers.
- [F16](../fork/F16-official-linux-desktop-launcher.md): the retired service launcher stays deleted. Upstream single-server ownership is accepted without the launcher client.
- [F03](../fork/F03-desktop-screenshot-capture.md), [F04](../fork/F04-composer-context-whitespace.md), [F22](../fork/F22-serialized-mermaid-rendering.md), [F23](../fork/F23-preview-browser-controls.md), [F27](../fork/F27-t3-thread.md), [F30](../fork/F30-poteto-mode-workflow.md), [chat presentation](../fork/chat-and-draft-presentation.md), [project activity](../fork/sidebar-project-activity.md) and [conversation order](../fork/thread-conversation-order.md): replayed through their owners in upstream's stable-callback component shape. Project order now reaches the sidebar through upstream's project-group hook.
- Effect 4.0.4 changed `randomUUIDv4` to a method; fork owners call it accordingly, including the F27 ticket nonce.

## Compatibility

Migration 86 adds one partial index without rewriting rows. Restart continuation becomes on by default, accepted from upstream. Delete-branch disappears for pull requests opened from another repository. No WebSocket contract, desktop IPC or persisted browser state changes are introduced by fork repairs.

## Gate Evidence

| Gate          | Command            | Result                    | Boundary                                                |
| ------------- | ------------------ | ------------------------- | ------------------------------------------------------- |
| Format        | `pnpm fmt`         | pass                      | Final candidate                                         |
| Lint          | `pnpm lint`        | pass                      | Existing upstream warnings retained                     |
| Types         | `pnpm typecheck`   | pass                      | All workspace tasks                                     |
| Native mobile | `pnpm lint:mobile` | pass                      | No native mobile source changed by repairs              |
| Tests         | per-package `test` | 25,605 passed, 42 skipped | 31 workspace packages, one Node-version exclusion below |

The workspace `pnpm test` aborts on one upstream test, `nodeSqliteClient.test.ts` "keeps large text and blob parameters off cached statements". The local Node 24.13.1 binds `ArrayBuffer` SQLite parameters as null; upstream CI resolves a newer Node 24 release. The fork does not modify that module or test. Every package therefore ran individually, with only that test excluded. A final fixture repair in `PullRequestService.test.ts` was verified with the pull request suite, formatting and server typecheck.

## Review Lanes

Four disjoint resolution lanes covered server runtime, web, packages, and workflows and docs; persistence was resolved by the lead. A fresh logical review accepted with corrections. Its corrections covered record consistency, the F06 branch-deletion gap, the restart-continuation callout and evidence gaps. Style assurance found a remaining offered-but-refused delete action, a dropped upstream comment, parenthetical prose and a comment prefix; all were corrected and verified with focused tests.

## Evidence Gaps

- The SQLite planner-statistics test asserts an exact row count and an approximate per-key estimate. Through the fork layer SQLite records `1000 99` where a plain probe records `1000 100`; the cause is not isolated.
- Installed Code, Thread, server image, native mobile and visual acceptance are unverified for this revision.
- Inactive upstream code remains for npm release lookup and nightly mobile beta links; neither runs in fork builds.

## Commit Effects

If applied, this commit integrates the pinned upstream improvements while keeping exact-origin authority, fork migration lineage, retired launcher and publication boundaries, and every active client presentation outcome.
