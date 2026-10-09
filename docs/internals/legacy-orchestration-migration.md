# Legacy orchestration migration

Orchestration v2 snapshots `state.sqlite` into `statev2.sqlite` before opening writable persistence
on its first launch. Only the copy receives v2 migrations; the original is retained for controlled recovery or rollback.
Subsequent launches reuse the copy without refreshing it from v1. It creates v2 thread shell events first and imports
the complete user and assistant transcript lazily when a client reads or continues the thread. The
v1 projection tables remain the import source and provide a read-only recovery source if an import
needs investigation.

## Imported data

The shell import preserves the project and thread identifiers, title, provider and model selection,
runtime and interaction modes, branch, worktree path, creation and update times, archive and delete
times, settlement override and timestamps, snooze timestamps, pin timestamp and order, and linked
pull request. The metadata repair path fills snooze, pin order, `unsettledAt`, and linked pull request
fields for threads imported before those fields were covered.

Transcript import reads user and assistant rows from `projection_thread_messages`. It preserves
message identifiers, text, supported attachments, timestamps, role, and ordering. A message that was
still streaming becomes an interrupted turn item.

The importer does not translate provider session identity, native provider runs, checkpoints and
diffs, activities and tool calls, approvals, or proposed plans. V2 therefore must not present those
records as migrated history.

## First continuation

A migrated thread has no active provider thread. Its first continuation creates a fresh provider
session and sends a handoff built only from user and assistant messages through the portable
handoff budget. The handoff service separately retains a 32,000-character recovery excerpt. Neither
budget replaces the full imported transcript.

## Persistence and authority cutover

`initializeV2Database.ts` snapshots committed SQLite data, validates the copied fork journal,
and publishes `statev2.sqlite` only after validation. An existing destination is never replaced.
The operation copies authentication and authorization tables once; it does not synchronize
subsequent access grants, revocations, or provider authority between databases.

Stop the v1 runtime before starting v2 on the same environment data directory. Run only one
writable runtime. SQLite snapshot consistency is not permission to keep both versions serving
requests. Shared settings and attachment storage also remain outside the database separation.
For rollback, stop v2, retain its database, and reconcile authentication and authorization in the
chosen rollback database before admitting clients. In particular, do not resurrect revoked grants
from the original snapshot. This is an operator boundary, not an automatic authority merge.

`ForkMigrationPlan.ts` retains deployed fork journal identities through 67 and registers
`68_OrchestrationV2`, `69_RemoveRedundantProjectionIndexes`, and
`70_ApplicationBoardEventSequenceIndex`. Migration 68 runs the upstream v2 schema body under the
fork's next stable identity; migration 70 indexes Board application-event sequence reads.
The copied legacy event log, transcript projections, Board audit history, and attachment references
remain available. Retention does not imply conversion of legacy tools, approvals, plans,
checkpoints, or provider sessions into v2 timeline items.

## Client and server cutover

Clients and servers must agree on `ORCHESTRATION_PROTOCOL_VERSION`, currently 2. The client
runtime appends `orchestrationProtocol=2` to the socket URL, and the `/ws` route rejects a missing
or mismatched version with HTTP 426 with `orchestration_protocol_incompatible` before any RPC or auth
work runs. The client checks the environment descriptor the same way: a missing version means the
host predates protocol 2, and a different version means both sides need updating. Either direction
blocks the connection as `unsupported` with a message naming the machine to update rather than
running half-upgraded. See `packages/client-runtime/src/connection/compatibility.ts` and
`apps/server/src/ws.ts`.

## Divergent migration ids

`effect_sql_migrations` records both migration ids and names. The upstream runner compares ids,
so the fork validates lineage first through `makeMigrationLoader` in `ForkMigrationPlan.ts`.
Unknown id/name pairs, populated databases without a journal, incomplete required histories,
and invalid historical-to-canonical transitions fail before migration writes. Supported historical
names are explicit compatibility inputs rather than alternate implementations. The same loader
validates the first v2 snapshot before publishing it. Startup does not merely warn and continue.

The deployed migration identities remain stable. New upstream migrations receive the next fork
identities rather than overwriting a deployed id. Fork startup delegates directly to
`ForkMigrationPlan.ts`; it rejects preview migration identities before continuation writes.
The upstream `reconcileV2PreviewMigration.ts` helper is not part of fork startup.

## Recovery

There is no supported whole-thread export API. Recovery uses an untouched copy of the environment's
`userdata` directory and opens that copy with SQLite's read-only mode. The user guide documents the
queries against `projection_threads` and `projection_thread_messages`. Never start a server against
the recovery copy because startup can run migrations and write new state.
