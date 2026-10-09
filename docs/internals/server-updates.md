# Server updates

Official runtimes have two update owners. The packaged desktop app owns its
application update through the Electron updater. A standalone or headless server
is part of an operator-managed deployment and does not replace itself.

The server reports this boundary through the
[official runtime update policy](../../apps/server/src/fork/officialRuntimeUpdatePolicy.ts).
There is no server launcher protocol or server-side installation service.

## Desktop prepare and commit

The [desktop update bridge](../../apps/server/src/desktopUpdate/DesktopAppUpdate.ts)
asks the desktop process to check for and download an update. Preparation returns
a request token and target version while the current server connection is still
alive. Receiving that response does not install the update.

The client commits the token only after it has received the preparation result.
The [desktop update owner](../../apps/desktop/src/updates/DesktopRemoteUpdates.ts)
accepts the commit only while the same downloaded version remains prepared. The
prepared reservation expires after five minutes and cancellation clears an
uncommitted reservation.

An accepted commit stops every bundled backend before the desktop updater installs
and relaunches the app. The old server does not report success. Transport loss
followed by a reconnect on the prepared target version is the success proof. If
the install request fails before relaunch, the desktop app attempts to restart the
stopped backends and reports the failure for the same request token.

## Startup readiness

The replacement bundled server follows the normal startup sequence. Persistence
and migrations initialize as runtime dependencies. The HTTP listener starts, the
long-running roots park at their activation boundary, and the server then opens
command handling and publishes its ready event. A listening socket alone does not
prove command readiness.

This readiness sequence is owned by
[server runtime startup](../../apps/server/src/serverRuntimeStartup.ts) and
[server activation](../../apps/server/src/serverActivation.ts). It is independent
of the desktop preparation token and does not provide an application rollback.

## Restart recovery and delegated work

Restart continuation is an environment-owned preference, off by default. The
[v2 recovery service](../../apps/server/src/orchestration-v2/ProviderRuntimeRecoveryService.ts)
requires a matching durable run, provider thread, session and strong native resume
identity. Queued runs never started, so recovery leaves them held behind the interrupted
run. Current continuation resumes only unfinished root turns or a prepared restart
continuation. Cancelled background work from a settled run is retained for the next
user turn; it does not wake that settled run automatically.

The [continuation handler](../../apps/server/src/orchestration-v2/RestartContinuation.ts)
rechecks the preference, archive state, provider selection, newer user work, a user-requested
stop and maintenance turns such as `/compact` before dispatching. Stable command and
message IDs prevent duplicate submissions after an outbox retry. Codex resumes without
adding provider prompt text unless the turn lost background work; other adapters receive
the continuation through their normal turn path.

Delegated `delegate_task` child threads reconcile independently, rather than as the
parent's background work. The [orchestrator](../../apps/server/src/orchestration-v2/Orchestrator.ts)
settles child results and completion deliveries in a startup pass after reconciliation,
because its terminal-run listener skips reconciliation cancellations. A cancelled child
with a pending restart continuation is not a completed result yet. Its continuation run
settles it, or the handler settles it when continuation is declined. Schedulers wait for
activation so they cannot start runs that startup reconciliation would then cancel.

These recovery mechanics also apply after an operator-managed restart. They neither
replace the deployment supervisor nor grant a headless runtime self-update authority.

## Orchestration v2 cutover

The v2 runtime uses `statev2.sqlite`, seeded once from a validated snapshot of `state.sqlite`.
Stop the old runtime before this cutover and keep one writable runtime active. The copied auth
and access tables are an authority snapshot, not a shared grant registry. Before rollback, stop
v2 and reconcile grants and revocations in the database selected by the prior runtime. Retain
both databases and compatible artifacts for recovery. See
[legacy orchestration migration](./legacy-orchestration-migration.md) for stable fork migration
identities, imported transcript coverage, and the fail-closed journal boundary.

## Migration 42 backup

The persistence layer creates a validated, durable SQLite backup exactly once
when migration 42 is pending. Later starts inspect the migration journal and do
not replace that retained pre-migration image with post-migration data. Operators
may remove the retained directory after accepting migration 42.

This narrow safeguard is implemented by
[Migration42Backup](../../apps/server/src/persistence/Migration42Backup.ts). It is
not a snapshot for every update and the desktop updater does not restore it after
an application failure. Its restore primitive requires the server and every
SQLite client to be closed.

## Operator-managed servers

For a standalone or headless server, the operator selects an exact-origin runtime,
stops it through the deployment supervisor, replaces the runtime, and starts it
again. The normal startup readiness sequence is the acceptance boundary. Operators
should verify the running version and application health after reconnecting.

Backup retention and rollback belong to that deployment. An operator who needs a
general rollback must preserve compatible application and database backups before
the update, stop all database users before restoring data, and redeploy the prior
runtime through the same supervisor. The retained pre-migration 42 image is a
separate migration safeguard and does not replace that policy.

## Fleet-free continuation and client enrollment

The current fork preserves the characterized production journal through retired identities 71 through 78 without starting Fleet. Upstream migrations 57 through 60 continue at fork identities 79 through 82. The [persistence contract](../../fork/persistence-compatibility.md) owns that ordering and rejection boundary. Existing history and admission fences remain available; a pre-Fleet database restore would discard later user data.

Current upstream permissions split several historical broad grants. Stored and signed scopes are preserved exactly. Re-enroll affected clients through fresh portal-issued one-time grants after cutover, then verify their current permissions. Enrollment does not restore a retired embedded access-management surface. Preserve the pre-cutover database and runtime together and keep one writable runtime active.
