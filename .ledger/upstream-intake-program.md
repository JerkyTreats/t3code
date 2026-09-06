# Upstream intake implementation

Date: 2026-09-05
Status: in progress
Readiness: S34 source acceptance passes; Board commit closes its delivery gate; S5 prerequisites are next
Branch: `reconcile/upstream-intake-20260905`

## Objective Baseline

Implement the agreed upstream intake with eight retained product outcomes: Board and liaison, chat/draft presentation, thin Omarchy themes, T3 Thread, desktop screenshots, Mermaid, prompt whitespace and preview controls. Preserve exact-origin identity, Linux operations, external Admin and repository governance. Retire the fork web outbox, custom Markdown renderer, inline commenting and outbox-specific shelf atomically.

Acceptance requires executable owner and host-replacement evidence, truthful retirement, full repository gates, and the planned installed compatibility evidence under the relevant operational authority. A clean merge or source-shaped test is not product acceptance.

Non-goals: new services, stores, brokers, generalized adapters, an alternate Thread renderer, a replacement queue, upstream publication or production changes.

Origin baseline: `9c80a4c63bb0d8391301e6e17bc7afe5226dbce5`.
Upstream baseline: `761d4bac1c238ea7af4dd36b56719ad5e30771c3`.
Preserved origin branch: `baseline/origin-before-intake-20260905`.
Immutable decision inventory SHA256: `500abe6378142d01537c45c48f829f248bc1a04d9fcca5218f47b8dcea43d8f5`.

## Source Plan And Authority

The local source plan is `.plans/57-upstream-intake-program.md`; the active group contract is `.plans/60-upstream-intake-board-and-chat.md`. The completed S12 contract remains historical execution evidence in `.plans/59-upstream-intake-persistence-and-authority.md`, carrying `.plans/58-upstream-intake-persistence-slice.md`. Those working records remain uncommitted. This ledger owns current execution, acceptance, commit effects and continuation. The immutable inventory remains supporting evidence.

The user instruction to proceed with implementation activates the full local program, the approved scope changes, the selected subagent/worktree orchestration, focused fixes, required verification and delivery commits. Activation of a later covered slice follows its dependency and contract gates without another permission request. Source changes and associated current patch/spec updates are within scope. No policy amendment is inferred.

Push, PR, release, deployment and access to existing user state retain their separate authorization boundaries. The implementation request authorizes reversible browser and desktop tests using isolated processes, temporary synthetic state and disposable profiles. Such tests do not authorize deployment or access to existing client credentials and history. No upstream mutation is ever authorized.

Workflow owners: [phased program delivery](../.codex/skills/phased-program-delivery/SKILL.md) and [solo vertical delivery](../.codex/skills/solo-vertical-delivery/SKILL.md). Applicable policy is indexed by [AGENTS](../AGENTS.md), including [Commit Policy](../governance/commit_policy.md), [Fork Isolation](../governance/fork_isolation_policy.md) and [Upstream Reconciliation](../governance/upstream_merge_policy.md).

## Maturity And Limits

The reconciled product has first-slice maturity with operational data and identity obligations. Preserve the immutable decision denominator. New authority, unexplained data lineage, a resurrected retired writer or a changed source pin reopens the relevant contract.

The root owns migration identities, shared contracts, broad hosts, integration and gate evidence. Start with at most four workers; S1 uses two proof workers. Each worker gets exact files and a physically present prerequisite baseline. One repository-wide gate run at a time. Synthetic state only.

## Phase Inventory And Dependency Graph

| Slice | Product result                                                                | Dependencies                                    | State                 | Owner and evidence                               |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------- | --------------------- | ------------------------------------------------ |
| S1    | New persistence opens supported fork history and applies upstream corrections | Pinned baseline and historical fixture contract | Complete              | Root migration owner; two proof lanes integrated |
| S2    | Exact-origin Git and external Admin authority                                 | S12 joint persistence acceptance                | Complete              | Four bounded implementation lanes                |
| S3    | Global Board and truthful liaison behavior                                    | S1, S2                                          | Complete              | Accepted S34 runtime, provider and client proof  |
| S4    | Normal upstream sends/rendering and complete fork retirement                  | S1, S2                                          | Complete              | Accepted S34 retirement and substrate proof      |
| S5    | Retained visuals and thin adapters                                            | S4                                              | Ready                 | Reference captured; shared source prework next   |
| S6    | Independent installed Linux clients and Thread                                | S2, S4, S5                                      | Blocked by dependency | Source and installed compatibility to prove      |
| S7    | Integrated preservation and rollback evidence                                 | S3 through S6                                   | Blocked by dependency | No acceptance claim                              |

## Wave Plan And Agent Strength

S1 runs root-owned lineage implementation alongside two standard proof workers after their prerequisites are available. A fresh strong reviewer follows integration. S2 uses bounded origin-policy and external-Admin lanes. S3/S4 may run in one frozen group with separate Board/server, Board/client, send-retirement and Markdown/review-retirement ownership. S5 fans out focused desktop/web adapters while root owns presentation and common hosts. S6 separates Thread boundaries from Linux packaging. S7 joins the exact final candidate.

Bounded evidence work starts with `gpt-5.6-luna` medium. Focused implementation and synthetic proofs use `gpt-5.6-sol` high. Difficult lineage, authority and final integration review use `gpt-6-astra` high. Escalate for a named semantic or recovery ambiguity, not diff size. Root inherits its active model. Record actual selections at dispatch.

## Shared Contract Decisions

- S1 keeps fork history through 51 and appends upstream 42 through 47 as execution IDs 52 through 57.
- The migration runner remains upstream Effect SQL. Fork lineage policy moves into `ForkMigrationPlan.ts`.
- SQLite is now the upstream shared `@t3tools/shared/nodeSqliteClient` owner. Do not restore the old server-local copy.
- Known retired journal names at 46 through 49 remain accepted historical evidence without reintroducing their runtime or fresh schema.
- Auth, Board and attachment records retain surviving meaning. Upstream automatic-default and settlement corrections require data-level assertions.

## Wave Execution Log

Implementation activation verified exact origin against its remote and the pinned upstream object locally. Created the isolated reconciliation branch from upstream and preserved accepted origin. The initial dirty checkout remains outside implementation.

Pristine dependencies installed with the frozen lockfile. Formatting, lint and typecheck passed. The initial test run inherited production mode and failed React test helpers. A clean-environment rerun removed that cause and exposed remaining upstream test failures; their diagnosis is separate from migration implementation.

| Lane                    | Agent                     | Model and effort   | State      | Scope                                                      |
| ----------------------- | ------------------------- | ------------------ | ---------- | ---------------------------------------------------------- |
| Pristine gate diagnosis | `pristine_gate_diagnosis` | `gpt-5.6-sol` high | Complete   | Read-only diagnosis of baseline test failures              |
| S1 core                 | Root                      | Inherited          | Verified   | Historical source, lineage owner, runner and central proof |
| S1 history proof        | `s1_history_proof`        | `gpt-5.6-sol` high | Integrated | Historical/fresh/reopen data proof                         |
| S1 repair proof         | `s1_repair_proof`         | `gpt-5.6-sol` high | Integrated | Upstream schema and data correction proof                  |

## Gate Evidence

| Candidate         | Command                                    | Result                                            |
| ----------------- | ------------------------------------------ | ------------------------------------------------- |
| Pristine upstream | `pnpm install --frozen-lockfile`           | Passed                                            |
| Pristine upstream | `pnpm fmt`                                 | Passed; clean source tree                         |
| Pristine upstream | `pnpm lint`                                | Passed                                            |
| Pristine upstream | `pnpm typecheck`                           | Passed                                            |
| Pristine upstream | `pnpm test` with inherited production mode | Failed; not an appropriate React test environment |
| Pristine upstream | `env -u NODE_ENV pnpm test`                | Failed; remaining causes under diagnosis          |

Use a clean test environment for subsequent gates. Do not waive baseline failures or quietly attribute them to fork changes.

## Commit Effects

### Repository governance

If applied, this commit preserves the fork’s repository rules, onboarding, and delivery records during upstream reconciliation.

### Exact-origin source control

If applied, this commit binds repository discovery, change requests, and Git publication to exact origin, including automatic pulls and hosted URL selectors.

Compatibility: source-control provider lookup and publication require the explicit provider base URL. Use matching client and server builds. Missing origin and foreign hosted selectors fail closed. Supported numeric and branch selectors remain available.

Governance delivery commit: `ed1f5ebb7`.

### Persistence and runtime authority

If applied, this commit opens supported fork databases through the current runtime, keeps device administration in the external portal, and confines installation and updates to exact-origin managed releases.

Compatibility: upgrade clients and server together for the fixed external Admin protocol and removal of embedded access-management APIs. Existing pending grants do not gain managed enrollment from their labels or subjects; previously enrolled clients retain their explicit class. Use a newly issued portal grant for managed enrollment where needed. Preserve the matching pre-upgrade database and binary for rollback after append-only migration. Public-package T3 service installation and self-update paths are removed; operators replace headless deployments through their authorized source or image installation, and desktop-controlled updates remain supported. This local commit performs no live migration, cutover, installation or publication.

Exact-origin delivery commit: `bd58fc5f9`. This persistence/runtime authority commit closes the joined local delivery gate.

## Review Findings

S12 logical review passes persistence and all 46 selected exact hunk roles. Bounded correction reviews close F17-R1 through R3, F06-R1, F20-R1 and S12-SUP-R1. Ordered Style Assurance closes SA1 through SA5 after correcting active documentation, shared contract comments, runtime error wording, remaining Settings pairing guidance and the current provider checklist. No blocking findings remain for this group. Later product obligations remain pending. Detailed evidence follows in the execution record.

## Deferred Findings

Provider lifecycle state retains one historical session entry per thread until explicit stop, replacement or shutdown. This existing retention is deferred because it does not expand Board authority or waive a preservation or test requirement.

## Phase Completion Matrix

S1 and S2 are complete as the joined S12 source delivery group through `2b691e322`. S34 implementation, full gates, logical review, ordered Style Assurance and root acceptance pass; this Board commit closes its source delivery gate. S5 reference capture and adapter contracts are prepared. Final visuals and installed Linux/Thread acceptance remain pending.

## Risks And Exceptions

No existing user data has been accessed and no deployed process has been changed. Five synthetic browser reference cases and preliminary candidate comparisons are captured. All 175 conflict rows are attributed; 38 retain later implementation obligations. Final same-candidate visuals and the Thread/hosted-client matrix remain prerequisites to their respective acceptance gates.

Local working plans are excluded from commits under repository instructions. Required durable implementation and Commit Effect evidence is recorded here under F18/F19. This does not create a second active implementation plan.

## Final Reconciliation

Pending all required slices. Origin has not been mutated and no deployment has occurred.

## Deliverable Closeout

Supported fork databases open through the current runtime with their retained history and explicit device authority. Repository operations use exact origin, external device administration stays with the portal, and runtime acquisition follows the managed fork installation boundary. These accepted source outcomes are prerequisites to the complete product; Board and chat retirement pass source acceptance, with this Board commit closing their local gate; visuals and installed Linux/Thread acceptance remain pending.

### S1 prerequisite handoff

Both proof worktrees received base `761d4bac1c238ea7af4dd36b56719ad5e30771c3` plus the same root-owned prework manifest, SHA256 `1265308d9d94a098cbd1b210b20540edecfde42612280326ed80aa43553eefd4`. Dependencies installed successfully in each isolated worktree. Workers own only their assigned proof file and return diffs without commits. Root continues owning migration source, existing upstream migration-test remapping, host-replacement and transaction proof.

### Prerequisite correction G0-WSL

Two executed WSL pruning fixture assertions fail on pristine upstream. Root authorizes a bounded prerequisite correction in `apps/desktop/src/wsl/DesktopWslEnvironment.test.ts` only, with stable runtime-path holder identity and explicit readiness, preserving production code and assertions. This supporting verification change fits the full implementation authorization; it does not expand S1 migration ownership. The isolated worker returns an exact diff without commit. Root requires focused proof before integration and keeps any unsupported diagnosis provisional.

### S1 integration dependency correction

The combined candidate passes formatting, lint, type checking, nine new persistence proofs and the original focused migration checks. The corrected WSL fixture passes all 50 tests. The full run now passes desktop, mobile and web, then fails server bootstrap after the fork schema is installed. Upstream authentication consumers still expect the pre-fork persistence shape. S1 is not independently acceptable before S2 authority integration.

S1 and S2 therefore form one S12 integration group under the existing full-program authorization. Preserve S1 decisions and proofs unchanged as subgates. Freeze the S12 shared auth contracts and exact ownership before new runtime fan-out. The group must pass real auth bootstrap, server routing, persistence, exact-origin and external portal proofs together. No failed gate is waived and no incomplete runtime commit is accepted.

The WSL fixture defect was independently reproduced: the former shell holder tail-execs sleep and loses its runtime path from argv. Explicit FIFO readiness and a runtime-local blocking shell holder repair the fixture without production changes or weakened retention assertions.

### S1 logical review and correction

Fresh reviewer `s1_logical_review`, `gpt-6-astra` high, found two blockers. R1: per-row aliases admitted unsupported mixed journal lineages and sparse retired groups. Root now requires the characterized historical prefix followed by canonical suffix and absent-or-complete retired 46 through 49 history. R2: the required populated historical database must traverse the actual initialization layer, repository readers and reopen with thread, attachment and non-null authority data preserved. A bounded standard worker owns that joined proof in `ForkMigrationUpgrade.test.ts`.

The reviewer independently executed all ten older states 31 through 40 successfully. Their regression cases are included in the R1 correction because they distinguish valid mixed prefixes from fabricated histories. No other logic blocker was found in the adapter, continuation identities, cleanup, repair predicates or transaction boundary. Logical acceptance remains pending correction review and joined S12 acceptance.

Full S1 candidate gate result: formatting, lint and typecheck passed; test failed in the server workspace after all other workspaces passed. Log record: `t3code-intake-s1-final-gates`. The failure is an acceptance blocker, not an inherited exception.

### S12 contract-first prework

The source-backed authority map found two written-contract/code mismatches in accepted F17: management class inferred from subject, and a seventh declared Admin endpoint. Root corrects the existing requirements with append-only migration 58 and a single six-method privacy-safe HTTP contract. Historical migration 42 is unchanged. Existing grants do not acquire management class from their subjects; already-enrolled client classes survive.

The standard contract worker receives an explicit sole-file transfer for the nine shared auth/RPC contract files. Downstream consumers wait for the compiled prerequisite. Root owns migration 58 and all broad integration hosts. The frozen hunk attribution covers all 23 selected S12 hunks; root corrected reversed source-side attribution in the initial bounded report before using it. The immutable inventory remains unchanged.

### S12 implementation dispatch and integration record

The nine shared auth contract files passed all 362 contract tests, typecheck and focused static checks before physical handoff. The contract handoff SHA256 is `2ba06703be7b804bdf99f6c2cbc01bd62353deb0078a1ab12d32c02c422c504f`.

| Lane                     | Agent strength     | State                          | Ownership                                                                                              |
| ------------------------ | ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Exact-origin publication | `gpt-6-astra` high | Integrated, pending acceptance | Git identity, source control and pull request authority owners, mechanical client endpoint plumbing    |
| External Admin           | `gpt-6-astra` high | Running                        | Auth repositories, authority policy, HTTP handlers, lifecycle registry and pre-42 backup               |
| Release identity         | `gpt-5.6-sol` high | Running                        | Origin desktop artifacts, bundled SSH runner, private image and release workflow scanner               |
| Client access retirement | `gpt-5.6-sol` high | Integrated, pending acceptance | Ordinary client access UI, RPC stream consumer and direct contract fixtures                            |
| Root integration         | Inherited          | Running                        | Migration 58, global HTTP and WS hosts, npm runtime retirement, workflow reconciliation and full gates |

Explicit endpoint-plumbing scope extends the origin lane to `pullRequestHostOf`, `sourceControlActions.ts`, `GitActionsControl.tsx` and their direct tests. Client cleanup extends to the stale package export, primary auth reexports and auth bootstrap HTTP fixtures. Release scope includes the bundled runner process proof. These are dependent consumers of frozen contracts rather than new product behavior.

The root runtime policy retains desktop-controlled updates and removes npm-backed service installation, launcher staging and registry self-update. Current upstream relay, desktop continuation, build checks and CLI commands survive where independent of that retired deployment path. Workflow reconciliation retains current build dependencies and uses local credential-free mobile change detection. Actual installed runtime acceptance remains S6.

An isolated worker accidentally restored 28 accepted-origin files in the original checkout through relative patch paths. Root stopped the worker, verified all 28 exact object contents and saved a recovery manifest before restoring the 13 originally clean tracked files and removing 15 newly created files. The original status again matches the recorded initial status, including all existing user changes. All later patch paths are absolute. No accidental work was accepted or lost.

The corrected joined migration proofs include the full historical initialization and reopen case. Adding migration 58 preserves existing pairing columns and independently asserts a null explicit enrollment class; historical migration 42 remains immutable. Final corrected review and full S12 gates are pending.

### S12 physical fan-in

Root verified and integrated the release lane's 44 owned paths, the exact-origin lane's 74 hashed paths, the client lane's 12 modified and three deleted paths, and the Admin lane's 27 hashed paths. The Admin manifest SHA256 is `a37bacd6ee221d05a434733365459f5fb16239fd318be7b80ac801de9af6b4f4`. Final origin contract-test cleanup was separately hash-verified and copied.

Both workflow policy scanners pass in the joined root tree. Joined web typecheck passes. The joined migration, runtime-update, cloud, CLI and pairing proof passes 81 tests across nine files. Lane evidence remains supporting evidence: release 280 tests, origin 1056 tests, client 45 tests, Admin 104 tests. Required full gates and fresh reviews remain pending.

The standard client worker now owns only `server.test.ts` transport reconciliation in its isolated worktree. Root physically reseeded all 267 candidate paths before execution, manifest SHA256 `3270cf2c0b9c4c2893753f7dbeec440e8a2ca242b5e473d437e6a1bbe936ab20`. Root owns subsequent production host fixes and sends them explicitly. The shared connection registry is acquired while the route layer is built, then reused by each request and exact teardown.

New upstream diagnostic guidance also carries origin publication and clone-authority decisions. A bounded standard follow-up owns mirrored triage instructions and CLI invocation guidance. Root removed the inherited npm publication subcommand because it rewrote package metadata without the private flag before publishing. Workspace build mechanics remain. No publication command was executed.

Next-wave Board mapping is read-only preparation. S34 is not activated until S12 acceptance.

### S12 executable ownership correction

Root identified semantic decisions still held in selected upstream-sensitive session, desktop-link, build and SSH hosts. The authority worker extracted `SessionAuthorityPolicy.ts` with independent host-free behavior proofs; 110 focused tests pass. The release worker connected `forkReleaseIdentity.ts` and `officialRuntimeAcquisition.ts` through mechanical adapters; 126 focused tests pass. These are implementation corrections to the retained decisions, not classification-only changes. All 23 current hunk dispositions still await fresh review; the frozen 175-hunk denominator is unchanged.

Root removed remaining public-package update instructions from web version-skew and onboarding flows. `runtimeUpdateGuidance.ts` admits only desktop-managed updates and supplies deployment-manager guidance for other runtimes. The current version-skew suite passes 18 tests, including refusal of legacy update descriptors. Mirrored origin-only triage instructions and invocation guidance pass 12 focused tests. These paths complete F01/F20 runtime identity consumers.

The real server transport suite currently passes 166 tests, including the six Admin routes, portal exclusion and active managed-client WebSocket teardown after disable. Its worker is finishing typed fixture decoders before final handoff. Required full gates, fresh logical review, style assurance and gate acceptance remain pending.

### S12 transport handoff and integrated gates

Root inspected and copied the final transport file with SHA256 `d0943f918e7741483ad83aa3019c6b7899849dc7f7c2bce7122dfac6d28056a0`. All 166 focused transport tests pass. Typed contract decoders replace new raw JSON casts. Legacy-only fixtures and handlers are removed, while ordinary pairing, bootstrap, DPoP, metadata, cloud, PR and settings tests remain. The worker's missing YAML dependency belongs to its isolated install; the root gate resolves those scripts.

Root additionally reconciled the update-action suite with desktop-managed updates and denied legacy descriptors through rendered component assertions. Version and action tests pass 31 cases. Pairing and terminal diagnostics now direct operators to their installed runtime, and their 12 tests pass. No public T3 package runner is offered by these surviving paths.

The first full joined typecheck passed every workspace except the not-yet-copied transport fixture. That fixture is now integrated and a fresh complete gate run is in progress. Final formatting and lint passed; existing upstream React warnings remain warnings. No acceptance or commit claim is made before the complete result.

### S12 full-gate corrections

The first full test run exposed stale upstream release URLs in two web presentation tests and an exclusive relay test that required the removed upstream release workflow. Root corrected the exact-origin URL assertions and removed only the retired workflow test. Focused reruns pass; all surviving relay serializer and deployment logic tests remain. Fork workflow safety is directly covered by the retained scanners.

The second full run passes all 4047 web tests plus shared packages, desktop, mobile, scripts and relay. The server run exposes the development snapshot helper as another persistence consumer. Its test seeds the old auth shape, its independent manifest equality check rejects supported historical aliases, and auth cleanup omits the new durable client table. Root delegates exactly the helper and its tests to the existing standard worker, with a complete physical candidate reseed recorded in `t3code-intake-dev-clone-prework`. The helper must reuse the migration owner, preserve fail-loudly and destination safety, and clear cloned auth authority. Synthetic state only. Full gate acceptance remains blocked until correction.

The bounded development helper correction is integrated after exact two-file hash verification. Six focused tests pass, covering current auth fixtures and complete authority pruning, characterized history, unknown lineage rejection before destination replacement, and existing destination safety. The second full server result was 4044 passing tests with only the four corrected helper failures. A complete post-correction run follows.

### S12 frozen logical-review candidate

The complete post-correction candidate passes `pnpm fmt`, `pnpm lint`, `pnpm typecheck` and `env -u NODE_ENV pnpm test --maxWorkers=4`. The full test command completes all 14 workspaces successfully. Server results are 4049 passing tests and ten existing skipped tests across 298 passing and two skipped files. Web results are 4047 passing tests. No gate is waived.

The source delta remained unchanged during the final test run. Root freezes the candidate for three fresh logical review lanes: persistence, external authority, and exact-origin/release identity. Each uses `gpt-6-astra` high because these are cross-domain preservation and authority boundaries. Reviewers are read-only and receive the immutable baseline, provisional 23-row dispositions, current specifications and full gate evidence. Style Assurance follows logical closure; Gate Acceptance and the local commit gate remain pending. S34 is not active.

### S12 initial logical review dispositions

All three fresh reviewers matched the frozen candidate and immutable baseline. Persistence passes with no findings; R1 and R2 are closed. All 23 selected hunks have acceptable owner, adapter or substrate roles, but concern-level acceptance remains blocked by five independently demonstrated defects. Hunk-role acceptance does not waive those defects.

| Finding | Required correction                                                                                                          | Owner lane              | State    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------- |
| F17-R1  | Independent operator revocation must deny later RPC and promptly terminate an existing server stream                         | Strong authority worker | Assigned |
| F17-R2  | Normalize every presented credential consistently so whitespace and scheme case cannot hide portal authority behind a cookie | Strong authority worker | Assigned |
| F17-R3  | Enforce the portal boundary outside CORS, including actual OPTIONS rejection and no-store                                    | Strong authority worker | Assigned |
| F06-R1  | Validate GitHub and GitLab URL host, port and repository at the owner boundary, then pass numeric selectors to the CLIs      | Strong origin worker    | Assigned |
| F20-R1  | Exclude nested private files and state from Docker context with behavior evidence beyond literal entry presence              | Standard release worker | Assigned |

The authority correction may extend the existing registry/session owner with bounded persisted revalidation and must cover two independent runtimes over synthetic SQLite plus actual transport. It must not introduce a generic authority service or protocol. Exact file transfers assign server and WS hosts and their tests to that worker for the coherent correction. Root owns integration, migration identities and the shared ledger. The source freeze ends for these bounded corrections; unaffected persistence evidence remains valid. No ordinary deferred findings were reported.

### S12 bounded correction fan-in

F06-R1 is integrated after exact seven-file hash verification. The focused owner normalizes only origin-matching GitHub and GitLab URLs to numeric selectors before get and checkout. Joined owner and adapter tests pass 31 cases, including foreign host/repository/port rejection without a process call and retained branch/numeric behavior.

F20-R1's first handoff adds recursive exclusions and a bounded semantic matcher. Root found that unsupported bracket, question-mark, escape and path-cleaning forms could bypass its claimed fail-closed grammar, so returned the same four-file scope for correction before integration. This is a correction to the initial finding's proposed evidence, not an unrelated scope expansion.

F17-R1 correction strengthens an existing transport test whose finite subscription could complete before disable. Required evidence now holds the target and unrelated peer streams open, proves persisted RPC denial before the watch interval, and then proves exact transport teardown. The worker uses the existing session policy and one registry-owned persisted revalidation loop; no authority schema or protocol is added.

F20-R1 is now integrated after the returned correction. Its four exact hashes are recorded in the local handoff. Recursive exclusions protect nested private paths; a bounded Docker-pattern checker tests those exclusions and required build-input inclusion, rejects negation and every unsupported pattern form before matching, and passes 20 focused cases plus both workflow scanners. No dependency or image execution was introduced.

F17-R1 through R3 are integrated after ten-file hash verification, manifest SHA256 `f53bc12ce0ccf2ebfab7b45d93055d5cd84d26feceeea967ba88f2282f6445d4`. The shared credential parser feeds selection and all-token scanning. Authority middleware now wraps CORS. RPC and subscription start recheck persisted admission; one registry watcher observes independent-runtime changes through the existing policy. It waits one second between passes, bounds concurrency to eight and each read to one second, and fails closed per session. Queueing and database execution affect total observation delay, so this is not a universal one-second teardown guarantee. Local notifications remain immediate.

The worker's 264 tests across 16 suites pass, including complete transport coverage with genuinely live streams. A synthetic independent file-backed auth runtime revokes the target; an RPC fails before clock advance, then observation closes the target stream while the peer still executes RPC on its existing connection. A subsequent local revoke closes that peer without another clock advance. Actual HTTP tests cover whitespace and scheme-case variants, portal OPTIONS denial with no-store, and ordinary preflight preservation. Full joined gates and fresh bounded correction verification follow.

### S12 bounded verification and final corrections

The corrected full gates pass all 14 test workspaces with 13,139 passing tests. Server has 4,061 passing tests and ten inherited skips. Candidate manifest SHA256 is `538f42e8b7025b2e6245aa1aac27f9661efd7cedcef55f111668999531c55c06`; gate logs use the `t3code-intake-s12-corrected` stem. All candidate and requirement hashes remained unchanged during that run.

Fresh authority correction review independently closes F17-R1, R2 and R3 with 12 owner tests and three actual transport tests. No deferred or blocking authority findings remain. Exact-origin correction review confirms the original URL override defect is corrected but demonstrates that generic scheme detection rejects supported GitHub `owner:branch` selectors. Root narrows that owner decision and adds both owner and real adapter argument assertions. Image correction review confirms nested exclusions and fail-closed grammar, but demonstrates that root `package.json` and `pnpm-workspace.yaml` could be excluded without scanner rejection. Root adds both root inputs and direct exclusion regression cases. These two corrections stay within the initial retained-selector and build-input findings.

The final correction changes five source/test paths plus current contract and ledger descriptions. Authority and persistence bytes remain unchanged. Focused origin tests and image tests pass; final full gates and bounded correction rechecks precede Style Assurance and Gate Acceptance.

### S12 Style Assurance correction

The final selector and manifest candidate passes all required full gates with 13,139 tests. Fresh bounded verification closes F06-R1 and F20-R1. Together with the unchanged persistence and authority evidence, logical review has no remaining blockers or deferred findings. Final source manifest SHA256 is `2d1e410174182273035f919e5531dd85e0ac4beff0f14490a1946838fe31e3b0`.

Ordered Style Assurance identifies four current-contract contradictions: SA1 upstream desktop download guidance, SA2 public-package service and release instructions, SA3 removed embedded device-administration guidance, and SA4 shared update descriptions and error text that still imply npm service ownership. These are active linked instructions, not historical evidence. A standard worker owns exactly eight user/operator documentation files in the shared candidate. Root owns the three shared contract and client-runtime files for comments and error wording. Wire schemas and runtime algorithms are unchanged by SA4. Scope remains the already accepted F01/F17/F20 operating boundary.

The documentation worker must preserve surviving Connect, network, Tailscale, SSH and mobile behavior and derive its commands from current source. Root retains the ledger, patch, source gates, final correction verification and commit ownership. No operator command, runtime launch or remote mutation is performed during this correction.

The documentation scope explicitly expanded to the active internal server-update guide because it described the deleted launcher and automatic database rollback. Root verified all nine handoff hashes. Targeted formatting, local links and anchors, Markdown prose, executable guidance and source cross-checks pass. The corrected guide distinguishes actual desktop preparation and commit from operator-managed headless replacement and pre42 backup. Mobile remains upstream-owned with compatibility evidence stated separately.

SA4 changes only comments in two shared contract files and version-based error wording in shared client state. Its existing 22 focused tests pass. Source hashes are frozen before joined lint, typecheck and tests; documentation-only handoff does not alter runtime inputs. Final formatting, full gate completion and bounded Style Assurance verification remain pending.

### Supplemental exact-hunk coverage

S34 source-side preparation finds 23 additional exact auth and update hunks in four broad hosts that were not among the 23 individually recorded S12 rows. A path-level attribution initially implied prior coverage; root rejected that credit and required a per-row refinement. The corrected source-side artifact distinguishes three genuinely reviewed overlap rows from these 23 pending rows. Source bytes and the immutable 175-hunk denominator are unchanged.

Root brings the 23 pending rows into S12 exact-role verification before its commit gate. This does not reopen unrelated ordinary findings or invent new product scope. A fresh strong reviewer must match each row to an actual owner, mechanical host or unchanged upstream substrate, preserving chat/reconnect behavior and prior authority corrections. Mixed later-slice obligations remain explicit. This closes a review-record gap rather than treating a source-file review as automatic hunk acceptance.

The supplemental reviewer passes 22 exact rows and blocks ChatView hunk 8 because reconnect folding ignored update capability, hiding manual guidance for headless and legacy runtimes. Root moves that predicate into `runtimeUpdateGuidance.ts` with direct capability, status, reconnect and mismatch tests. ChatView passes its existing resolved capability mechanically. Actual running progress and failure presentation stay on their existing paths. The reviewer also corrects ws hunk 6 attribution to current layered VCS composition; no direct VcsProcess import is claimed. Full gates and bounded logical recheck precede ordered Style Assurance verification.

### S12 Gate Acceptance

The corrected runtime candidate passes `pnpm fmt`, `pnpm lint`, `pnpm typecheck` and `env -u NODE_ENV pnpm test --maxWorkers=4`. All 14 workspaces pass with 13,147 tests, including 4,061 server tests and ten inherited server skips. The gate logs use the `t3code-intake-s12-reconnect` stem. Candidate manifest SHA256 is `62bad7ee9ee318eb0b6ec5d957cd88a09632e5e6cfc2a71abd078b9b709a002f`. All source and immutable requirement hashes match after gates.

Fresh bounded logical verification closes S12-SUP-R1 with 39 focused tests, 240 executions of the actual host decision statements and two replacement-owner scenarios. All 23 supplemental rows pass alongside the original 23. Current attribution records layered VCS composition and explicitly leaves mixed later obligations pending. The immutable denominator remains 175; unrecorded rows are not accepted by inference.

Ordered Style Assurance closes SA1, SA2 and SA4, then identifies two remaining documentation contradictions. Root replaces absent Settings pairing-link creation guidance with the actual installed `t3 pair` path and `--base-dir` selector, and restores Antigravity to the upstream provider checklist. Bounded verification closes SA3-R1 and SA5-R1. Final reviewed documentation candidate SHA256 is `4ff88d128b271d6473a56eb95f20c61580d7a6238c7f461e4baa4a889d68bcef`. Only those two Markdown files differ from the passing runtime candidate. No source gate is invalidated or waived.

Root accepts S12 source persistence, exact-origin identity, external authority and release prerequisites. This is not the final product preservation gate. Installed Linux/image evidence remains in S6; Board, retirement, visuals, Thread and final integrated proof remain in later slices. The local delivery group separates governance, exact-origin source control, and the coupled persistence/runtime authority integration. The joined candidate has the gate evidence; intermediate commits are not complete deployable fork products. Current acceptance metadata and exact Commit Effects are reconciled at the commit gate without changing runtime inputs.

### S34 activation

The S12 group is committed as `ed1f5ebb7`, `bd58fc5f9` and `2b691e322`. Root verifies a clean integration tree and unchanged reviewed runtime bytes after commit hooks. S34 activates from `2b691e322241348d0f6ef0ce5f33b1018a93b667` under the combined Board and ordinary-chat retirement contract. The immutable baseline remains unchanged and 46 exact rows carry prior S12 evidence, with mixed later obligations still explicit.

A standard `gpt-5.6-sol` high worker owns the eleven-file Board schema/RPC prerequisite in `worker/intake-board-contracts`. Root owns the ten-file capability, invocation, attachment and actual credential-registry prerequisite. Both prerequisites must physically exist and pass focused checks before consumer fan-out. Later lanes are strong Board persistence/MCP runtime, standard provider adapters and standard shared client/panel work. Exact disjoint allocations are frozen in the local active contract; no worker may change a shared boundary independently.

The capability contract admits Board only for Codex, Claude, Cursor, Grok and local OpenCode. Antigravity remains preview-only, and future provider kinds fail closed for Board. Browser settings control preview independently. Plan mode removes writes from existing admitted Board credentials; mode changes cannot add Board to preview-only credentials. Public human Board methods never expose trusted agent authorship. F28 remains a Codex prompt contract with first-create/later-reuse cadence and nonblocking failure.

Retirement preparation identifies 33 exclusive origin paths already absent from this upstream rebuild. S34 verifies that absence and current contract removal while proving ordinary send, attachment bootstrap, upstream Markdown, mobile outbox, prompt stash and source/PR review survival. No replacement outbox, rendered comment state or reduced Thread renderer is introduced. Root retains common server, WS, auth and ChatView hosts. No interactive or installed acceptance is claimed by this source slice.

Root's independent capability, interaction and attachment tests pass 14 cases. Credential-registry and invocation tests await the shared Board schema exports before joined execution. The registry now requires explicit requested capabilities, independent endpoints and guarded write-mode updates. Consumer integration is still pending; helper implementation alone is not claimed as restored Board behavior.

The active retirement scan confirms all 33 exclusive paths and four retired feature specs are absent, with no references to the selected exclusive runtime symbols. The historical retirement record now includes the approved F09, F15, F21 and F24 decisions and retains earlier retirements. Its source-side evidence does not replace later integrated send and review tests. The old client's pending or ambiguous outbox work remains a cutover precondition and is not touched.

Three future consumer worktrees are prepared from the accepted S12 commit. Parallel dependency installation exposed a shared Git-config lock in one setup hook; its serial retry passes and all three trees remain clean before prerequisite materialization. Future setup hooks that mutate shared Git configuration run serially. No consumer worker has been launched before the shared prerequisite gate.

The eleven-file contract handoff passes 380 tests and both contract and client-runtime typechecks. Root's ten-file MCP prerequisite passes 25 joined tests, focused transitive compilation and lint. The exact 21-file prerequisite manifest has SHA256 `f2b32085430b891e220436e76ce1b01012a53fc41c54d9ab733d19f6211e8b92`; root verifies every hash and physically materializes it in all three consumer worktrees before launch. The active contract hash is `6810af1d88c71a209991dd8171cb82136360a4e8b52267a3bf9280b2b351f6f5`.

Consumer fan-out now runs with `gpt-6-astra` high on Board runtime and `gpt-5.6-sol` high on provider adapters and Board client state/panel. Root integrates shared server, WS, authorization and chat hosts. Worker source grants remain disjoint, and only root runs whole-repository gates and commits.

Runtime inspection finds a patch-versus-expression gap in the old Board transport: the advertised bounded event API was optional and the WS host consumed the unbounded general stream. The accepted implementation seam makes `subscribeBoardDomainEvents` required. The focused Board subscription owner admits only Board events into a sliding buffer before exposing its acquired stream; upstream lossless event APIs remain intact. Root acquires that stream before reading the initial Board snapshot under the existing authorization wrapper. The runtime lane proves overflow recovery and that unrelated traffic cannot evict the final Board wakeup; root ports actual transport tests to the same owner and updates affected test fixtures. This implements the frozen bounded-subscription requirement without changing public schemas or provider/client contracts.

All three consumer lanes are integrated after root verifies their exact scopes and SHA256 hashes. Runtime contributes 34 changed files from its 35-file grant; `Schemas.ts` remains unchanged because owners consume shared contract schemas. Providers contribute nineteen files and the client twelve. The runtime handoff passes 129 focused tests, the provider handoff 480 joined tests, and the client handoff 93 tests plus both runtime and web typechecks. Root's joined web typecheck passes with actual ChatView integration.

Root registers the four Board RPC handlers and scopes, acquires the bounded event subscription before snapshot, and adds nine synthetic transport tests covering reads, correction, deliberate history, stable revisions, buffered wakeups, slow-subscriber rebasing and catch-up. Standard-client proof checks authorization at effect execution; fixture call construction alone is not a runtime side effect. Five affected test fixtures now expose the required Board subscription API, with the real-engine wrapper forwarding its actual subscription. Production `server.ts` needs no duplicate service registration because the existing provider runtime exports the joined orchestration layer. Full joined verification follows.

### S34 joined gates and logical review

The 100-path S34 candidate is frozen at manifest SHA256 `778bdfc20f9125b33c6ea4c5ffd465d8ce8d852d41a993f01df0cae6cf4f6922`. Formatting, lint, typecheck and the complete test gate pass, with 13,269 tests across fourteen workspaces. The server passes 4,131 tests with ten inherited skips. Gate logs use the `t3code-s34-full` stem. All candidate hashes remain unchanged through fresh review.

Three fresh reviewers inspect 80 exact rows: strong runtime review covers 26, standard provider review covers twelve, and strong client/retirement review covers 42. Each independently checks exact baseline keys and current owner/host expression. Runtime finds no independent blocker. Provider finding `S34-PROVIDER-001` shows a Default follow-up can restore the shared credential while an earlier Plan turn remains live. Client finding `CR1` reproduces closing Board exposing an old panel and reopening a sole Board producing an empty panel. Passing test counts do not waive either actual host failure.

Root accepts both findings for bounded correction and preserves every other exact-row result. A strong worker receives a focused Board turn-lifecycle owner and ProviderService integration, plus F25/F28 contract wording. A standard worker receives exactly the right-panel store and its tests. Root physically copies and verifies the same 100-file frozen candidate into the existing isolated provider and client worktrees before dispatch. No public schema, migration or shared prerequisite revision is authorized by these packets. Root retains integration, whole gates, bounded correction review, ordered Style Assurance and the commit gate.

The hunk ledger now records 126 of the immutable 175 rows: 46 accepted S12 rows and 80 S34 reviewed rows whose joined concern acceptance remains pending correction. Mixed later visual and Thread obligations stay explicit. Source-side S5 preparation continues independently; interactive synthetic browser/desktop authorization remains pending and no such client is launched.

Correction ownership is explicit: `s34_fix_provider_lifecycle` runs `gpt-6-astra` high in the provider worktree, and `s34_fix_board_visibility` runs `gpt-5.6-sol` high in the client worktree. The provider correction uses existing lifecycle signals and the unchanged registry setter. Pending and active Plan work holds conservative session-wide denial. Ambiguous send failures and uncorrelated session exits cannot prove that old work stopped, so they retain denial until credential revocation or replacement; stale generation callbacks must not alter replacement credentials. This preserves concurrency without claiming per-turn MCP identity that the protocol does not carry.

Read-only later-slice preparation resolves the desktop-capture versus preview-capture API name, Mermaid fence coverage through upstream ChatMarkdown including file preview, and a residual preview-action equivalence matrix. Root separately records the missing fork-only theme generator dependency and the full whitespace composition path, including a final source-review append that would otherwise trim preserved bytes. A strong read-only Thread preflight traces future process and enrollment ownership. These preparations activate no implementation, installed operation or visual acceptance.

### S34 bounded correction verification

The corrected 103-path candidate has manifest SHA256 `262511b201166d02b48f58850d848f32504427d94227c120becdbc9dbe3cf894`. All four repository gates pass again under the `t3code-s34-corrected` log stem. Bounded review confirms the original overlap and panel-close cases are fixed, but finds two immediate edge cases that still prevent acceptance. A real Codex image read precedes session selection, allowing pending Plan work to cross credential replacement after its denial was reset. The panel migration mistakes the prior writer's inactive Board selection for the new intentionally retained hidden selection and hides an explicitly selected Agents panel.

Root retains both original finding identities for a second bounded correction. The strong provider worker receives the real CodexAdapter and its tests in addition to the prior lifecycle grant; the standard panel worker retains its two-file grant. Both receive the exact physically copied 103-file corrected candidate. Root preserves passing exact-row evidence and requires host-level regressions, full joined gates and bounded rechecks. The reviewer notes per-thread lifecycle state retention as deferred because it does not independently reopen Board authority.

The earlier interactive-test approval request was broader than the applicable authorization boundary. Root corrects that interpretation: isolated reversible synthetic tests are necessary implementation verification already authorized by the user. No response to the pending optional question is treated as approval. Existing user state, deployment and publication remain outside this implementation activity. A standard read-only preparation lane now traces a synthetic full-app visual harness while root prepares S5 owner contracts. Source snapshots remain source evidence; visual acceptance requires actual rendered cases.

The remaining-hunk source audit verifies all 49 previously unrecorded exact keys and both pinned sides. The ledger now records all 175 immutable rows without changing the denominator or granting new acceptance. Eleven newly attributed rows need current exact-role review: provider model/usage/send substrate, generic attachment admission and opening, two external-Admin exclusions, and mixed Markdown substrate. The latter retains explicit S5 Mermaid surface identity obligations. Thirty-eight rows remain assigned to later implementation. Source-level feature labels are corrected where actual expression differs, including launcher activation previously labeled as theme or screenshot work. A fresh bounded supplemental review follows the joined correction gates.

Read-only release inspection identifies clean installed source `74247e2db3c5d5c70e1cec048e5277070e05dc65` through the host launcher's verified release link. Twelve ordinary appearance and theme owner blobs exactly match accepted origin. Root prepares a detached origin reference checkout, empty synthetic state and an isolated browser profile. The application has not yet launched and no existing user state has been accessed. Four future adapter worktrees are prepared from S12 with successful serial frozen-lockfile dependency installation; they remain inactive until S34 acceptance and physical S5 prerequisites.

The provider correction's real host tests extend the same boundary to Grok's queued preparation lock. Root grants its test file only, making nine maximum owned paths; Grok production code remains unchanged. The worker catches and fixes a local cancellation-completion stall before handoff, then proves delayed Codex image preparation and queued Grok work cannot enter replacement authority. Focused and full joined validation remain prerequisites to acceptance.

Root completes the isolated visual reference using the installed built application, synthetic SQL projections and a disposable Chromium profile with loopback-only request routing. A local Codex protocol fixture answers startup, account, skills and model discovery and rejects all other requests; its recorded audit contains zero turn requests. Five inspected captures cover light and dark conversation, code and plan presentation, an empty draft, and editable drafts. Authored whitespace survives reload and no JavaScript errors occur. The reference manifest has SHA256 `0d0494ec5b43290fc9886d27f1fb2a59683ea56d83cd78e7344057ec5fe0713c`. Root reconciles these cases with the user's retained installed-appearance requirement and stops the temporary server after capture. This closes reference preparation, not candidate visual acceptance, Omarchy-specific behavior or compact Thread proof. Existing user state and deployed processes are untouched.

The second corrected candidate passes all four repository gates with 13,294 tests, including 4,151 server tests and ten inherited skips. Its 103-file manifest has SHA256 `384eb8dc2a58d7656a3eaaa42bd352552b79382937d8552a268b2c46e1668b4f`; all hashes survive gates and the isolated client build. Bounded provider review closes `S34-PROVIDER-001` and all twelve provider rows. Fresh supplemental review passes all eleven added exact roles and preserves later obligations. The manifest's inherited convenience delta list was stale; the reviewers compute the correct fourteen changed paths, and the next manifest corrects that metadata without changing source evidence.

Panel review rejects the second correction's version premise: exact origin already writes persistence version 12, so reusing version 12 skips Zustand migration. Root accepts the finding and requires actual persisted-envelope hydration rather than another helper-only fixture. The two-file correction advances to version 13, migrates exact origin version-12 inactive Board selection, and retains version-13 hidden Board close and reopen state. Its exported-store hydration tests and 69 focused panel tests pass. Root integrates the verified hashes after the other frozen reviews finish; full gates and bounded panel recheck follow.

The preliminary built client matches the reference's broad ordinary chat and draft hierarchy. Remaining presentation differences are localized to permission-control placement, checkout strip width, composer corners and timeline top spacing. Upstream generic attachments, draft indication and send semantics remain authoritative; retired custom plan expansion is not replayed. The separate temporary candidate runtime is stopped after capture. This preparation grants no final visual, rate-limit or provider execution acceptance.

### S34 final logical closure

The final 103-path candidate has manifest SHA256 `a9d62a2b60790848c8e9ed59327df1afb2950a3d4de8a20d9a121ea4d77a8f84`. All four repository gates pass with 13,296 tests across fourteen workspaces. The server passes 4,151 tests with ten inherited skips. Bounded panel review closes CR1 and CR1.PERSISTENCE through actual version-12 origin hydration, version-13 roundtrip and close/reopen host checks. All 42 client rows pass, with 69 focused tests and all candidate hashes unchanged. Combined runtime, provider, client and supplemental logical review passes all 91 selected S34 roles. Mixed S5/S6 obligations remain pending. Ordered Style Assurance and local commits follow; no deployment or publication occurs.

### S34 Style Assurance correction

Ordered Style Assurance found four current wording issues: stale active-plan readiness, 68 stale hunk-row blocker notes, overbroad Board admission wording and missing historical provenance in the user guide. Root corrects these status and text fields only. The frozen semantic contract body, runtime source and tests remain unchanged. Original contract SHA256 `6810af1d88c71a209991dd8171cb82136360a4e8b52267a3bf9280b2b351f6f5` remains historical review evidence; current lifecycle metadata has a separately recorded revision. A bounded recheck precedes root acceptance and commits.

### S34 source acceptance and commit gate

Root accepts the joined S34 source group after all four gates, all 91 selected exact-role reviews, bounded provider and panel corrections, and ordered Style Assurance pass. The final style correction changes only twelve remaining provider note sentences. Every runtime and test file retains the passing 13,296-test candidate hash. All 175 immutable rows remain recorded, with 38 later implementation rows and every mixed later obligation retained. The only deferred source observation is historical per-thread provider session entry retention; it grants no test or authority exception. Synthetic reference captures are preparation for S5, not installed or final visual acceptance.

Local delivery uses two focused commits: the historical retirement record and its patch index, then the atomic Board feature spanning shared contracts, runtime, providers and web consumers. Existing queued work is not inspected or migrated by this source delivery. Source and PR review, mobile outbox, prompt stash and upstream Markdown remain intact. Right-panel persistence advances from origin version 12 to version 13; forward hydration preserves the prior visible panel and new hidden Board selection. Use the matching accepted client/server build and preserve the previous browser profile for an intentional downgrade.

### Approved chat retirement record

If applied, this commit records the approved retirement of the fork web outbox, custom Markdown renderer, rendered-document comments and queue shelf.

Compatibility: these retired fork workflows do not return in the reconciled client. Dispose of any old pending web outbox work explicitly in the old client before cutover. The source change neither resends nor removes that work and performs no live cutover. Historical retirement records create no current replay or compatibility obligation.

### Global Board delivery

If applied, this commit restores the global Board with authenticated agent posts, revisioned corrections, bounded updates and mode-aware provider access in the current client.

The Board feature is atomic across shared schemas, MCP and SQL runtime, provider lifecycle and the web panel. Explicit supported-provider capabilities remain independent of preview. Plan work retains session-wide write denial through overlapping sends and credential transitions. Human readers share the same Board; only authorized owners correct posts. Codex receives the root Collective prompt contract without a durable exactly-once guarantee.

Compatibility: matching current clients and server are required. Right-panel state upgrades from origin version 12 to version 13 and preserves the prior visible panel; keep the previous browser profile if intentionally downgrading. Board history and historical provenance survive. The historical retirement record is committed as `9ddd85585`. This Board commit closes S34 source delivery; S5, S6 and S7 remain open.
