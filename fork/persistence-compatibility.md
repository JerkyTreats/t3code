# Fork persistence compatibility

Status: implemented persistence contract

Migration 85 appends `PublishedResponseActivityIndex` after the supported
continuation and retirement identities. It adds an ordered assistant-message
index for bounded project-activity shell reads without rewriting stored rows.

This contract owns the stored history shared by retained Admin and Thread outcomes. It does not claim those runtime features have completed intake.

## Protected decisions

| Decision   | Required behavior                                                                                                 | Owner and evidence                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| PERSIST.D1 | Preserve fork journal meaning and reject uncharacterized lineages before continuation writes                      | `ForkMigrationPlan.ts`; historical-prefix, rejection and replacement-runner proofs     |
| PERSIST.D2 | Preserve historical migration 50, skip its retired schema on fresh initialization and retain migration 51 cleanup | Fork loader and historical migration bodies; fresh and pre-50 proofs                   |
| PERSIST.D3 | Append upstream fields under stable fork execution identities                                                     | Existing upstream bodies and repository-reader proof                                   |
| PERSIST.D4 | Apply automatic-default and settlement repairs at 54 and 56 with their original predicates                        | Existing upstream bodies; continuation, rollback and original migration tests          |
| PERSIST.D5 | Preserve surviving thread, attachment and auth data through initialization and reopen                             | Historical schema substrate; populated file initialization and reopen proof            |
| PERSIST.D6 | Validate copied legacy history before publishing the one-time v2 database seed                                    | `initializeV2Database.ts`; source-lineage rejection and destination preservation tests |
| PERSIST.D7 | Keep one writable runtime and reconcile authority before rollback                                                 | Operator cutover boundary; migration and update guidance                               |

## Ownership and integration

The durable policy owner is `apps/server/src/persistence/ForkMigrationPlan.ts`. Its loader consumes the existing SQL migration journal and returns the selected implementations or a diagnostic migration error. `Migrations.ts` selects that loader before the upstream Effect SQL runner can create a journal or write migrations. A populated database without a journal fails closed rather than being treated as fresh. The shared Node SQLite client, SQL transaction implementation, historical migration bodies and upstream repository readers remain substrate.

Upstream source filenames 42 through 47 execute as fork IDs 52 through 57. Fork IDs 58 and 59 retain pairing enrollment and interaction command fingerprints. Source filenames 48 through 54 execute as fork IDs 60 through 66 after those retained migrations. The new continuation adds branch pull-request state, active order, multi-PR links and backfill, structured message context, title state, viewed files and the auto-settle preference. ID 67 retains `ProjectionThreadCreationSurface`. The v2 continuation appends `68_OrchestrationV2` and `69_RemoveRedundantProjectionIndexes`. The upstream v2 schema body remains the substrate under the fork execution identity 68; the deployed earlier ids keep their original meaning. IDs 43 through 49 and 70 are accepted only as known retired journal history and are not fresh migration implementations. Journal rows are never renamed or deleted to force continuation.

The supported mainline assumes Fleet was never installed. It has no Fleet journal exceptions, retirement evidence reader, native-session denylist, or automatic repair for a Fleet-era database. Unknown journal identities fail before continuation writes. Upstream bodies `57_ScheduledTaskWebhooks`, `58_WebhookRelayDeliveries`, `59_McpAppModelContext`, and `60_ThreadSnapshotWindowIndexes` retain fork execution IDs 79 through 82. Their stable identities are independent of the unused gaps. Migration 83 removes retired storage and restores the surviving application-event index.

A database from the former Fleet deployment requires a separately verified offline alignment before this runtime can open it. That deployment operation preserves surviving user data and prevents retired native conversations from returning through ordinary provider discovery. It is not a supported application migration or a reusable compatibility layer. The retired one-time continuation decision is historical in the [retirement record](retired-features.md).

Upstream source `61_PullRequestReviewGuides` executes as stable fork identity `84_PullRequestReviewGuides`. Existing journal identities remain unchanged. The accepted upstream body adds review-guide storage through the same transactional runner.

Upstream preview renumbering is not part of fork startup: `Migrations.ts` delegates directly to the fork lineage owner, and preview identities fail before continuation writes.

`ForkMigrationPlan.test.ts` exercises the policy through a separately constructed upstream runner, covers rejection before journal creation, and proves atomic rollback of v2 schema and baseline events before retrying the continuation from 68. It also retains batch rollback coverage for data repair failure. `ForkMigrationHistory.test.ts` covers supported journal history, auth preservation, cleanup and production persistence reopen. `ForkMigrationContinuation.test.ts` proves repair semantics and new fields through production project and thread readers. `ForkMigrationUpgrade.test.ts` snapshots a populated historical file database through the current initializer, checks retained events, attachment references and authority rows through continuation, then reopens without additional migrations. `initializeV2Database.test.ts` covers the one-time snapshot through 67, retained command receipts and fingerprints, lazy transcript import, committed WAL data, destination reuse, and rejection of unsupported source lineage before publication. Existing upstream migration tests retain their behavior with remapped execution cutoffs.

Supported history is the frozen accepted fork lineage, including the characterized reconciled v0.0.28 identities from 14 through 26 and historical prefixes from 31 through 41 followed by canonical suffixes. The missing migration 35 row is accepted only when the complete released prefix and migration 36 reconciliation marker are present. Historical identities cannot restart after the canonical suffix begins. Retired entries retain only their characterized journal meaning; fresh databases do not execute those feature migrations. Arbitrary upstream database import, unknown forks, live database inspection and a second migration engine are outside this contract. F17 owns the integrated private pre-42 backup and runtime authority boundary. Its append-only migration 58 adds explicit pairing enrollment class without changing historical migration 42. Historical acceptance and provenance limits remain in the intake evidence. Current tests identify source verification boundaries; this contract does not declare final joined gates, deployment, browser, or installed acceptance for the v2 intake.

`ForkMigrationReviewGuides.test.ts` exercises the 83-to-84 continuation through an independent runner, verifies retained thread, attachment and authority data, uses the production review-guide repository, and checks transactional rollback, retry and reopen. These synthetic source proofs do not establish live database or deployment acceptance.

The isolated development snapshot helper uses the same migration runner and lineage owner before replacing its destination. It has no independent journal-name validator. Its synthetic integration proof retains a supported historical prefix, rejects unknown identity without replacing existing data, and removes clients, sessions and pairing grants from the resulting development database.

## One-time v2 seed and retained history

`apps/server/src/persistence/initializeV2Database.ts` reads `state.sqlite` through SQLite's backup
boundary, validates the copied journal with `makeMigrationLoader`, and publishes `statev2.sqlite`
only after validation. Failed validation leaves the source intact and does not publish a destination.
An existing v2 database is reused rather than refreshed. Migration startup then applies the same
fail-closed lineage owner before journal creation and continuation writes.

Legacy events, command receipts and fingerprints, transcript projections,
authentication rows, access grants, and attachment references remain in the copied database.
`LegacyV1ThreadImporter.ts` imports supported user and assistant messages and metadata into v2;
retention does not convert legacy provider sessions, tools, approvals, plans, checkpoints, or diffs
into current v2 timeline history. Referenced attachment files remain under the existing storage
ownership and are not an independently isolated runtime copy.

## Runtime and rollback boundary

Stop v1 before the first v2 launch against the same environment data directory. Keep one writable
runtime active. SQLite snapshot consistency does not make concurrent old and new servers safe:
authentication and authorization are copied once, while later grants and revocations are not
synchronized. Settings, attachment files, and workspace files may remain shared.

Before rollback, stop v2 and preserve its database and compatible artifacts. Reconcile grants and
revocations in the database selected by the older runtime before admitting clients, so an old
snapshot cannot silently reactivate revoked access. V2-only conversations and mutations are not
merged back. This operator boundary does not claim that startup detects or prevents simultaneous
versions, and the retained pre-42 backup is not a general rollback for v2 changes. See
[legacy orchestration migration](../docs/internals/legacy-orchestration-migration.md) and
[server updates](../docs/internals/server-updates.md).
