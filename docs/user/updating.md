# Updating T3 Code

The app you use and the server running your agents can be on different machines.
When versions differ, update the machine named in the notice.
Official server, Code, and Thread versions include the source revision after
the base version, such as `0.0.42-abcdef0123`. Matching suffixes mean those
artifacts were built from the same source commit.

## Before you update

Restarting a server can interrupt active agents and terminal commands. Saved
threads, settings, and project files remain.

**Settings → General → Continue threads after restarts** is off by default.
Enable it to resume supported active threads after an update, crash, or machine
restart. Changes are saved to connected environments that support this setting.
Use **Apply to all** after an offline environment reconnects if its value differs.

T3 Code must start again on the host. This setting does not configure automatic
startup. Terminal commands may still be interrupted, and threads without saved
provider resume state need a new message.

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

## Update providers

**Settings → Providers** shows provider updates for the selected environment.
**Update all** updates every outdated provider on every connected environment
at once. Hover it to see which providers it will update. Providers that only
offer a manual update command are not included.

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
there before refreshing to find newer versions.

Install App Store or Google Play releases as usual. The mobile app can also
download updates in the background and apply them when you next leave the app.
It saves drafts and queued messages before restarting. If you keep the app open
for a long time, it may ask to install immediately. Choosing **Later** leaves
the update queued for the next suitable moment.
