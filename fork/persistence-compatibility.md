# Fork persistence compatibility

Status: implemented persistence contract

This contract owns the stored history shared by retained Admin, Board and Thread outcomes. It does not claim those runtime features have completed intake.

## Protected decisions

| Decision   | Required behavior                                                                                                 | Owner and evidence                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| PERSIST.D1 | Preserve fork journal meaning and reject uncharacterized lineages before continuation writes                      | `ForkMigrationPlan.ts`; historical-prefix, rejection and replacement-runner proofs             |
| PERSIST.D2 | Preserve historical migration 50, skip its retired schema on fresh initialization and retain migration 51 cleanup | Fork loader and historical migration bodies; fresh and pre-50 proofs                           |
| PERSIST.D3 | Append upstream fields under stable fork execution identities                                                     | Existing upstream bodies and repository-reader proof                                           |
| PERSIST.D4 | Apply automatic-default and settlement repairs at 54 and 56 with their original predicates                        | Existing upstream bodies; continuation, rollback and original migration tests                  |
| PERSIST.D5 | Preserve surviving Board, thread, attachment and auth data through initialization and reopen                      | Historical schema substrate; populated file initialization and reopen proof                    |
| PERSIST.D6 | Validate copied legacy history before publishing the one-time v2 database seed                                    | `initializeV2Database.ts`; source-lineage rejection and destination preservation tests         |
| PERSIST.D8 | Continue the exact retired Fleet production history without replaying Fleet or rewriting its journal              | `ForkMigrationPlan.ts`; retired-production preservation, rejection, rollback and reopen proofs |
| PERSIST.D7 | Keep one writable runtime and reconcile authority before rollback                                                 | Operator cutover boundary; migration and update guidance                                       |

## Ownership and integration

The durable policy owner is `apps/server/src/persistence/ForkMigrationPlan.ts`. Its loader consumes the existing SQL migration journal and returns the selected implementations or a diagnostic migration error. `Migrations.ts` selects that loader before the upstream Effect SQL runner can create a journal or write migrations. A populated database without a journal fails closed rather than being treated as fresh. The shared Node SQLite client, SQL transaction implementation, historical migration bodies and upstream repository readers remain substrate.

Upstream source filenames 42 through 47 execute as fork IDs 52 through 57. Fork IDs 58 and 59 retain pairing enrollment and interaction command fingerprints. Source filenames 48 through 54 execute as fork IDs 60 through 66 after those retained migrations. The new continuation adds branch pull-request state, active order, multi-PR links and backfill, structured message context, title state, viewed files and the auto-settle preference. ID 67 retains `ProjectionThreadCreationSurface`. The v2 continuation appends `68_OrchestrationV2`, `69_RemoveRedundantProjectionIndexes`, and `70_ApplicationBoardEventSequenceIndex`. The upstream v2 schema body remains the substrate under the fork execution identity 68; the deployed earlier ids keep their original meaning. IDs 46 through 49 are accepted only as known retired journal history and are not fresh migration implementations. Journal rows are never renamed or deleted to force continuation.

The current production continuation accepts the complete exact historical group `71_ThreadFleets` through `78_ManualRecoveryAdmission` only with its preserved retirement tables, completed retirement marker, and ready native identity fences. These are inert journal identities, without selectable Fleet implementations. Fresh databases never create Fleet schema or record those historical IDs. Upstream bodies `57_ScheduledTaskWebhooks`, `58_WebhookRelayDeliveries`, `59_McpAppModelContext`, and `60_ThreadSnapshotWindowIndexes` execute as fork IDs 79 through 82. The existing production journal and read-only retirement fences remain intact. This is a forward continuation of the sole retained production database, not a data rollback to a pre-Fleet checkpoint or a second migration engine.

`RetiredFleetContinuation.test.ts` constructs synthetic retired evidence and verifies continuation, exact history and fence preservation across reopen, rejection of incomplete or different history and missing retirement evidence, full transaction rollback before retry, and fresh initialization without Fleet tables. Upstream preview renumbering is not part of fork startup: `Migrations.ts` delegates directly to the fork lineage owner, and preview identities fail before continuation writes.

`ForkMigrationPlan.test.ts` exercises the policy through a separately constructed upstream runner, covers rejection before journal creation, and proves atomic rollback of v2 schema and baseline events before retrying the continuation from 68. It also retains batch rollback coverage for data repair failure. `ForkMigrationHistory.test.ts` covers supported journal history, Board and auth preservation, cleanup and production persistence reopen. `ForkMigrationContinuation.test.ts` proves repair semantics and new fields through production project and thread readers. `ForkMigrationUpgrade.test.ts` snapshots a populated historical file database through the current initializer, checks retained events, attachment references, Board and authority rows through continuation, then reopens without additional migrations. `initializeV2Database.test.ts` covers the one-time snapshot through 67, retained command receipts and fingerprints, lazy transcript import, committed WAL data, destination reuse, and rejection of unsupported source lineage before publication. Existing upstream migration tests retain their behavior with remapped execution cutoffs.

Supported history is the frozen accepted fork lineage, including the characterized reconciled v0.0.28 identities from 14 through 26 and historical prefixes from 31 through 41 followed by canonical suffixes. The missing migration 35 row is accepted only when the complete released prefix and migration 36 reconciliation marker are present. Historical identities cannot restart after the canonical suffix begins. Retired entries 46 through 49 are supported as an absent or complete group. Arbitrary upstream database import, unknown forks, live database inspection and a second migration engine are outside this contract. F17 owns the integrated private pre-42 backup and runtime authority boundary. Its append-only migration 58 adds explicit pairing enrollment class without changing historical migration 42. Historical acceptance and provenance limits remain in the intake evidence. Current tests identify source verification boundaries; this contract does not declare final joined gates, deployment, browser, or installed acceptance for the v2 intake.

The isolated development snapshot helper uses the same migration runner and lineage owner before replacing its destination. It has no independent journal-name validator. Its synthetic integration proof retains a supported historical prefix, rejects unknown identity without replacing existing data, and removes clients, sessions and pairing grants from the resulting development database.

## One-time v2 seed and retained history

`apps/server/src/persistence/initializeV2Database.ts` reads `state.sqlite` through SQLite's backup
boundary, validates the copied journal with `makeMigrationLoader`, and publishes `statev2.sqlite`
only after validation. Failed validation leaves the source intact and does not publish a destination.
An existing v2 database is reused rather than refreshed. Migration startup then applies the same
fail-closed lineage owner before journal creation and continuation writes.

Legacy events, command receipts and fingerprints, transcript projections, Board revision history,
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
