# Updating T3 Code

The app you use and the server running your agents can be on different machines.
When versions differ, update the machine named in the notice.
Official server, Code, and Thread versions include the source revision after
the base version, such as `0.0.42-abcdef0123`. Matching suffixes mean those
artifacts were built from the same source commit.

## Update everything at once

The update button at the bottom of the sidebar updates every connected machine
in one step. It updates outdated providers, then servers hosted by a desktop
app, then the desktop app you are using. A remote desktop app installs the
latest exact-origin release, and its server updates with it. Hover the button
to see what it will update.

While it runs, the button widens to show progress. It names a machine that is
taking longer than usual, and offers **Retry** for a server that failed. Click
it to see every machine. The desktop app restarts once each server has started
its own restart, after a short countdown. Choose **Later** to keep working and
restart from the update button when you are ready. A server still restarting
finishes on its own, and the button keeps showing it after the desktop app
restarts.

The confirmation lists each machine it skips and why, such as a machine that is
offline or needs a manual update. Command-line and server image installations
always need a manual update; see
[Update an installed command-line runtime](#update-an-installed-command-line-runtime).
Use the notice or **Settings → Connections** for the other skipped machines.

If a desktop app restarts on its old version, T3 Code tells you the update did
not apply. It does not install that version again on its own, even when another
device asks. Use the update button on that machine to retry.

The confirmation counts the running threads that the restarts will interrupt,
and how many can resume afterwards. See **Continue threads after restarts**
below.

## Before you update

Restarting a server can interrupt active agents and terminal commands. Saved
threads, settings, and project files remain.

**Settings → General → Continue threads after restarts** is on by default.
It resumes supported active threads after an update, crash, or machine
restart. Changes are saved to connected environments that support this setting;
update older servers first. If a supported environment was offline or has a
different value, use **Apply to all** in Settings after it connects.
T3 Code must start again on that machine;
the setting does not enable automatic startup. Terminal commands may still be
interrupted, and threads without saved provider resume state need a new message.
A thread that finished its turn to wait on a monitor, subagent, or background task
is woken and told that this work stopped. A background shell, such as a dev server,
does not wake it; the thread learns about it with your next message.
A thread is not resumed while it waits for your approval, answer, or secret, or
while it is archived, snoozed, or settled. After three automatic resumes in a row,
the thread waits for your next message.

Updates from the previous orchestration system preserve conversation transcripts but cannot carry
every kind of runtime history forward. Read [Threads from older T3 Code versions](./thread-migration.md)
before continuing an important older thread. Stop the old server before the first launch of the
new runtime on the same data directory. Keep one writable server active, and review access grants
and revocations before a downgrade because authentication is copied only at the first cutover.

## Reconnect after permission changes

After an update that splits permissions, an older connection can lack access to new actions. Re-enroll the affected browser or Electron client using a fresh one-time pairing credential from the external Admin portal. Existing credentials are not silently granted broader access. The portal remains the place to manage enrolled devices.

## When versions don't match

A client and server must speak the same orchestration protocol. If they do not, the connection is
refused rather than running half-upgraded:

- An app newer than the server is blocked before connecting, with a notice telling you to update
  T3 Code on the machine named in the notice.
- A server newer than your app refuses the connection with an update message.

Update the side the notice names, then reconnect.

## Update a desktop installation

The desktop update button downloads metadata and artifacts from the
[exact-origin release history](https://github.com/JerkyTreats/t3code/releases).
Select the update button once to download. After the download completes, select
it again to restart and install.

A desktop-hosted server uses the runtime packaged with that desktop app. Update
the desktop app on the host when a connected client reports that server as out
of date. A supported desktop-managed action can close and relaunch the app on
the host after confirmation.

## Update an installed command-line runtime

The standalone `t3` runtime does not update itself. Replace it using the same
exact-origin artifact or authorized source procedure used to install it, then
restart `t3 serve` with the same host, home, and network options.

For the managed Linux desktop installation, download the new AppImage and its
matching descriptor from the same exact-origin build, then run the installer
procedure in [Install T3 Code](./install.md#desktop-app).

For a source checkout, update it through your authorized exact-origin source
control process, rebuild the runtime, and restart it. Do not substitute a public
package registry command for the installed runtime.

## If an update fails

1. Keep the current runtime stopped while checking the replacement artifact.
2. Confirm that the artifact and descriptor came from the exact-origin release.
3. Confirm that you updated the server host rather than only the client device.
4. Restore the previously installed artifact through the same operator-managed
   installation process if the replacement cannot start.

The application does not provide an npm service rollback command.

Only one server can use a T3 home directory at a time. If startup reports that
another server owns it, stop that server before retrying, or use a separate home
directory and pair with the running server.

## Update providers

**Settings → Providers** shows provider updates for the selected environment.
**Update all** updates every outdated provider on every connected environment
at once. Hover it to see which providers it will update. Providers that only
offer a manual update command are not included.

After a successful provider CLI update, T3 Code refreshes model discovery for
every enabled instance of that provider using its own configuration. Connected
clients receive the refreshed catalogs automatically. Provider update checks
must be enabled to download the latest T3 Code model catalog.

Provider updates do not restart running chats. An existing session can keep
using the previous CLI until it ends. If discovery fails, check the provider
status and refresh it again.

## Mobile updates

To update an environment from your phone, open **Settings → Environments** and
select it. **Check for updates** finds the latest release on that environment's
current release channel. Keep the app open while the environment updates and
reconnects. Hosts that cannot update remotely show instructions for updating on
the machine instead.

The same page lets you refresh provider status and update supported providers.
These controls require a connected environment and permission to operate it.
Provider update checks and restart continuation preferences are in
**Settings → Maintenance**. If provider update checks are disabled, enable them
there before refreshing to find newer versions. The same setting controls whether
T3 Code downloads model catalog updates, so with it off new models may not appear
until you enable it and refresh provider status.

Install App Store or Google Play releases as usual. The mobile app can also
download updates in the background and apply them when you next leave the app.
It saves drafts and queued messages before restarting. If you keep the app open
for a long time, it may ask to install immediately. Choosing **Later** leaves
the update queued for the next suitable moment.
