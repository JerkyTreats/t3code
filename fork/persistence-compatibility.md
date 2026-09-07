# Fork persistence compatibility

Status: implemented persistence contract

This contract owns the stored history shared by retained Admin, Board and Thread outcomes. It does not claim those runtime features have completed intake.

## Protected decisions

| Decision   | Required behavior                                                                                                 | Owner and evidence                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| PERSIST.D1 | Preserve fork journal meaning and reject uncharacterized lineages before continuation writes                      | `ForkMigrationPlan.ts`; historical-prefix, rejection and replacement-runner proofs |
| PERSIST.D2 | Preserve historical migration 50, skip its retired schema on fresh initialization and retain migration 51 cleanup | Fork loader and historical migration bodies; fresh and pre-50 proofs               |
| PERSIST.D3 | Append upstream fields as execution IDs 52, 53, 55 and 57                                                         | Existing upstream bodies and repository-reader proof                               |
| PERSIST.D4 | Apply automatic-default and settlement repairs at 54 and 56 with their original predicates                        | Existing upstream bodies; continuation, rollback and original migration tests      |
| PERSIST.D5 | Preserve surviving Board, thread, attachment and auth data through initialization and reopen                      | Historical schema substrate; populated file initialization and reopen proof        |

## Ownership and integration

The durable policy owner is `apps/server/src/persistence/ForkMigrationPlan.ts`. Its loader consumes the existing SQL migration journal and returns the selected implementations or a diagnostic migration error. `Migrations.ts` is the mechanical adapter to the upstream Effect SQL runner. The shared Node SQLite client, SQL transaction implementation, historical migration bodies and upstream repository readers remain substrate.

The six upstream bodies retain source filenames 42 through 47. Their fork execution IDs are 52 through 57. IDs 46 through 49 are accepted only as known retired journal history and are not fresh migration implementations. Journal rows are never renamed or deleted to force continuation.

`ForkMigrationPlan.test.ts` exercises the policy through a separately constructed upstream runner and proves batch rollback with a real data repair failure. `ForkMigrationHistory.test.ts` covers supported journal history, Board and auth preservation, cleanup and production persistence reopen. `ForkMigrationContinuation.test.ts` proves repair semantics and new fields through production project and thread readers. `ForkMigrationUpgrade.test.ts` initializes a populated historical file database through the production layer, checks current repository readers and preserved authority, then reopens without additional migrations. Existing upstream migration tests retain their behavior with remapped execution cutoffs.

Supported history is the frozen accepted fork lineage, including the characterized reconciled v0.0.28 identities from 14 through 26 and historical prefixes from 31 through 41 followed by canonical suffixes. The missing migration 35 row is accepted only when the complete released prefix and migration 36 reconciliation marker are present. Historical identities cannot restart after the canonical suffix begins. Retired entries 46 through 49 are supported as an absent or complete group. Arbitrary upstream database import, unknown forks, live database inspection and a second migration engine are outside this contract. F17 owns the integrated private pre-42 backup and runtime authority boundary. Its append-only migration 58 adds explicit pairing enrollment class without changing historical migration 42. Joined source acceptance and actual historical migration, reopen and matching-old restore pass; exact identities and provenance limits are recorded in the intake evidence.

The isolated development snapshot helper uses the same migration runner and lineage owner before replacing its destination. It has no independent journal-name validator. Its synthetic integration proof retains a supported historical prefix, rejects unknown identity without replacing existing data, and removes clients, sessions and pairing grants from the resulting development database.
