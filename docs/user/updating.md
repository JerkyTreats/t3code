# Updating T3 Code

The app you use and the server running your agents can be on different machines.
When versions differ, update the machine named in the notice.

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

## Mobile updates

Install App Store or Google Play releases as usual. The mobile app can also
download updates in the background and apply them when you next leave the app.
It saves drafts and queued messages before restarting. If you keep the app open
for a long time, it may ask to install immediately. Choosing **Later** leaves
the update queued for the next suitable moment.
