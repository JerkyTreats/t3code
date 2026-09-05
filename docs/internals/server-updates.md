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
