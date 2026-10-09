# Fleet-free upstream intake evidence

Date: 2026-10-09
Branch: `reconcile/fleet-free-upstream-20261009`
Status: verified source; artifact acceptance is bound separately to the delivery commit
Commit policy: [repository commit policy](../governance/commit_policy.md)

Delivery uses the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md) and its [ledger format](../.codex/skills/solo-vertical-delivery/references/ledger.md). [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this active implementation record; [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns the workflow link and Commit Effects. This file records implemented behavior, decisions and evidence. Temporary packets, the immutable comparison baseline and review scratch remain untracked. They do not replace this durable record or create another source of product requirements.

## Objective baseline

Integrate full upstream source on the Fleet-free fork and preserve the sole production database through a forward continuation. The user superseded the earlier remediation plan. Fleet reactivation, pre-Fleet data restoration, support for other live databases and a generalized rollout framework are excluded.

Acceptance requires current protected outcomes, decision-level conflict review, focused boundary proofs, joined source gates, exact-source artifacts and production-preservation evidence. Source integration and a successful build alone do not establish runtime or installed acceptance. Upstream remains read-only; origin is the only publication target. No publication is part of this record.

## Source requirements

| Source boundary            | Exact revision                             |
| -------------------------- | ------------------------------------------ |
| Fleet-free local base      | `cabb31603a87957324121c3361e7063362c487de` |
| Accepted remote origin     | `f7b63a31802c30d7f70f833d64c8efffb1d429c6` |
| Previous upstream ancestor | `cc1e634bfa62edd56ff792eea666e436fdef788f` |
| Full upstream target       | `ec80933ac8cd02fec5c97b342462ccc9567cdb1e` |
| Pre-intake runtime source  | `b26cd51f76e9d3a700f20cc0038e56aa5a9baec5` |

[The patch guide](../patch.md) and its active contracts select preserved outcomes. The [intake policy](../governance/upstream_merge_policy.md), [isolation policy](../governance/fork_isolation_policy.md), [compatibility policy](../governance/compatibility_policy.md) and [privacy policy](../governance/privacy_and_publication_policy.md) control their treatment. Historical ledgers remain evidence only for their recorded revisions.

## Integration decisions

The selected workflow is merge and repair from the Fleet-free local base. Current upstream runtime, provider packages, stable Effect APIs, client mechanics and migration bodies are accepted. Focused fork owners retain exact-origin authority, external Admin, Board, Collective instructions, desktop and Thread identity, retained context and presentation.

The [persistence contract](../fork/persistence-compatibility.md) retains the characterized retired journal identities through 78 without selecting Fleet implementations. Current upstream bodies 57 through 60 continue at fork identities 79 through 82. Existing history and admission fences remain intact. Fresh initialization does not create Fleet state.

Current upstream granular permissions are accepted. Stored and signed scope bytes are not rewritten. The user selected fresh portal-issued one-time enrollment for clients that need the new standard permissions. External Admin authority remains separate from generic scopes.

## Integrated lanes and focused evidence

The full upstream runtime, providers, dependency graph and client are integrated. Fresh reviews retain current upstream mechanics unless a protected outcome requires a focused owner. All original 325 conflict occurrences across 323 unique hunk hashes have reviewed dispositions. The immutable baseline remains unchanged; its additive attribution covers 180 selected outcomes, including the authorized retired-production continuation.

| Lane           | Integrated behavior                                                                                                                                                      | Evidence boundary                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth           | External Admin authority, managed enrollment, signed and stored scope equality, granular upstream permissions, one-use WebSocket tickets and persisted per-RPC admission | Focused authority, credential, transport and endpoint tests; CLI issuance delegates to the same authority owner                               |
| MCP and Board  | Independent capability-filtered endpoints, nominal Board access, Plan write denial, transactional author continuity and current-only history                             | Endpoint matrix and current Board integration tests; Pi repair passes all 124 tests; native ACP repair passes 44 runtime and six bridge tests |
| Runtime        | Current provider hosts, retained Codex instructions and compaction context, held recovery and retired native identity fences                                             | Core import, provider binding and native-operation rejection proofs; ordinary operations remain admitted                                      |
| Desktop        | Current lifecycle, standalone selection, preview shortcuts, guest focus, screenshot capture and exact-origin acquisition                                                 | Source and focused host proofs; actual installed client acceptance is separate                                                                |
| Web and Thread | Current chat hierarchy, draft geometry, compact renderer, one-use protected transport and current preview controls                                                       | Full web suite passes; synthetic built-renderer ordinary and compact visual acceptance passes                                                 |
| Persistence    | Exact historical lineage, additive continuation, atomic failure, fresh initialization and held recovery                                                                  | Retired continuation, populated initialization, reopen, replacement runner and synthetic recovery proofs                                      |
| Origin         | Exact-origin authority for current Git and hosted repository operations, including labels and viewed-file mutation                                                       | Policy owner and replacement-host proofs; final source-control review closes newly introduced upstream operations                             |
| Documentation  | Current owner paths, enrollment transition, Fleet-free continuation and historical evidence limits                                                                       | Independent source bindings and local links checked; private runtime evidence remains outside Git                                             |

Muse now builds native MCP attachments through the canonical capability-filtered owner for start and resume. Its exact replay materializer changes only the designated runtime PR endpoint phrase. Recordings and exact frame matching remain unchanged. Ordinary Muse Board exclusion and upstream Plan-mode rejection remain intact.

## Database preservation evidence

An authorized offline snapshot rehearsal passed. The comparison found all pre-existing table rows and original columns unchanged, preserved existing indexes, triggers and views, and found only the expected additive continuation changes. Both snapshots passed full SQLite integrity and foreign-key checks. Migrations 79 through 82 applied once; reopening applied no further migration. Queued work remained held, and retirement identity fences and trigger enforcement survived the continuation.

This is schema and data preservation evidence, not a provider-runtime rehearsal. No provider-capable server ran against either snapshot. Private evidence remains outside the repository. Production is unchanged by this intake work.

## Gate evidence

| Boundary        | Command or proof                                                                                            | Result                                                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting      | `pnpm fmt`                                                                                                  | Passed on final source, including the last provider and fixture corrections                                                                                                                                                                                            |
| Static analysis | `pnpm lint` and `pnpm typecheck`                                                                            | Passed across all 25 packages on final source; lint exits zero with existing nonblocking warnings                                                                                                                                                                      |
| Recursive tests | `pnpm test`                                                                                                 | Recursive run passed other packages and 6521 server tests; one unchanged upstream Chromium screenshot test failed transiently, then all 19 tests in its suite passed in isolation. The failed command is retained as such; the immutable release gets a fresh full run |
| Build           | `pnpm build`                                                                                                | All eight build tasks passed on the integration tree; immutable release results are bound separately to this delivery commit                                                                                                                                           |
| Mobile          | `pnpm lint:mobile`                                                                                          | Command exited zero; SwiftLint, ktlint and detekt were unavailable and skipped                                                                                                                                                                                         |
| Database        | Offline continuation, full preservation comparison, integrity, foreign-key, reopen and held-recovery proofs | Passed; final migration and native-fence sources match the rehearsed runner                                                                                                                                                                                            |
| Renderer        | Actual built UI with synthetic V2 data, ordinary and compact viewports, light and dark                      | Passed 16 inspected captures: empty and edited draft with attachment, chat and plan in both themes and viewports; no production data, provider turns or installed-client claim                                                                                         |
| Artifact        | Isolated built-server document and hashed JavaScript requests                                               | Both HTTP 200 on integration artifacts; release acceptance requires a repeat against exact committed bytes                                                                                                                                                             |

Earlier recursive attempts exposed mechanical test-registration issues, a long-name OpenCode replay mismatch and the Muse runtime namespace mismatch. The last recursive run had one Chromium `Page.captureScreenshot` failure in source byte-identical to pinned upstream; its complete 19-test suite passed unchanged in an isolated rerun. Repairs preserve exact replay matching. Superseded runs are not reported as passing. Later Muse, Pi and ACP repairs have full affected-package or runtime proofs and fresh independent review. The complete final formatting, lint and typecheck runs pass. The single unchanged Chromium failure is retained as an explicit integration gate exception after its complete isolated suite passes; immutable packaging requires another full recursive run before release acceptance.

## Review and blocking findings

| Finding                                                         | Disposition and proof                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retired native identity bypass through direct import or binding | Closed through authoritative Orchestrator and ProviderSessionManager admission; source review and focused rejection/ordinary-operation proofs pass                                                                                                        |
| Mermaid streaming blank state                                   | Closed through actual highlighted-source rendering and upstream controls; focused and complete web tests pass                                                                                                                                             |
| Exact-origin marketing and new hosted mutations                 | Closed through shared identity and mutation authority owners; fresh source and focused integration review pass                                                                                                                                            |
| Auth lifetime and MCP endpoint policy stranded in hosts         | Closed through SessionAuthorityPolicy and McpEndpointAdmission; owner and adapter tests pass                                                                                                                                                              |
| Preview shortcuts and reopened native zoom                      | Closed through platform-specific owner and authoritative returned snapshot; focused tests and desktop/web joined review pass                                                                                                                              |
| Upstream usage shortcut ordering drift                          | Restored upstream ordering; focused tests and web typecheck pass                                                                                                                                                                                          |
| Muse independent MCP attachment                                 | Closed by adapter repair and fresh review; 26 adapter tests and five orchestration replays pass                                                                                                                                                           |
| Pi and native MCP-over-ACP attachment branches                  | Closed through canonical independent attachments and connection-scoped routing, including activation changes, revocation races and shutdown; 124 Pi, 44 ACP runtime and six bridge tests pass                                                             |
| Decision-level attribution                                      | All 180 selected decisions have source evidence, with four renderer outcomes also visually accepted; all 325 original hunk occurrences have reviewed dispositions. Final audit binds 496 fingerprints across 333 paths with no unresolved source mismatch |
| Final source and artifact binding                               | Source gates and bounded follow-up proofs reconciled; immutable release acceptance must bind final clean-tree gates and artifact smoke to this delivery commit                                                                                            |

Deferred observations are six unused package exports and an unused composer-padding helper. Neither prevents the selected outcomes; unrelated cleanup is excluded. Native installed-client behavior and unavailable mobile native linters remain explicit acceptance limits.

## Commit evidence and Commit Effects

This record accompanies the local full-intake delivery commit on the reconciliation branch. It contains the pinned upstream merge and the source corrections described above. Review scratch and private database or renderer evidence stay outside Git. No origin push, upstream mutation, production activation or installed-client update is part of this commit.

If applied, this commit integrates current upstream T3 Code on Fleet-free source while preserving production history, fork authority and client behavior, with fresh enrollment for current permissions.

Release acceptance must bind clean immutable-build gates, artifact hashes and isolated smoke results to this exact delivery commit. Production activation requires a fresh stopped-service backup of the active database, one writable runtime, verification of the expected continuation and client re-enrollment. An older binary must not reopen the advanced journal; data restoration remains an explicit operator decision.

## Deliverable closeout

The source delivers the complete pinned upstream intake without Fleet manager implementations. The sole retained production database continues forward without rewriting history or restoring a pre-Fleet checkpoint. Protected source outcomes have decision-level review, current owner and host proofs, and ordinary plus compact renderer acceptance. Production remains unchanged. Immutable release verification is recorded against this delivery commit separately; native installed acceptance and skipped native mobile linters are not implied by source, renderer or database proofs.

## Preview snapshot readiness correction

The first clean immutable candidate reproduced the same first-screenshot failure seen in the integration run and was not accepted. Every other recursive test passed. Chromium reports this error when the screenshot result contains an empty image. A render-readiness race is an inference from that condition and the first-capture pattern, not a proven diagnosis of the compositor.

`ServerBrowserPage.captureViewport` now waits for a bounded render opportunity before a visible-document capture. Hidden documents use their existing surface, and a visibility change releases the wait. Capture scale, scroll offsets, image options and original errors remain unchanged; the operation does not retry or suppress capture failures.

The deterministic frame-ordering regression fails the earlier helper and passes the correction. All 70 focused tests pass, including the original first test, inactive-page captures at full and half scale, explicit hidden-state handling, visibility changes and error propagation. Three concurrent cold Chromium suite runs pass all 26 tests each. Server typecheck, scoped lint, formatting and whitespace checks pass. Hidden-state simulation does not establish native installed-window acceptance. The corrected immutable release must pass the full recursive test command before acceptance.

If applied, this commit waits for preview rendering readiness before capturing screenshots while preserving background capture and error reporting.
