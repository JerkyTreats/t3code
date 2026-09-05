# Keeping a T3 Code host available

A remote client can reach T3 Code only while the host runtime is running and the
machine is awake. Choose the host process that matches your installation.

## Packaged desktop host

Keep the desktop app running on the host. Updating the app also updates its
packaged server runtime.

The managed Linux desktop installer creates the `t3code-desktop.service` systemd
user service as part of one verified artifact installation. Inspect that service
with standard systemd tools:

```sh
systemctl --user status t3code-desktop.service
journalctl --user -u t3code-desktop.service
```

Restart it after an operator-managed configuration change with:

```sh
systemctl --user restart t3code-desktop.service
```

The current source validates the installer and service files. Installed Linux
acceptance remains pending, so do not treat source checks as proof that a
particular machine completed installation successfully.

## Command-line host

Run the authorized installed runtime directly:

```sh
t3 serve
```

The `t3` CLI has no built-in service-management commands. If the server must
survive logout or restart, configure your operating system or process supervisor
to run the absolute path to the installed `t3` executable with your normal
`serve` options. Keep that service definition under operator control and update
the executable through the same exact-origin installation method.

Record the service name, runtime path, working directory, `T3CODE_HOME`, bind
address, and log destination in your own runbook. Do not place pairing links,
session credentials, or provider secrets in a published service definition.

## Connection services

T3 Connect exposure and the host process have separate lifecycles. Signing out
of T3 Connect stops cloud exposure but does not stop a desktop app, systemd user
service, or operator-managed process. Stopping the host process does not erase
the saved T3 Connect login.

## Troubleshooting

For the managed Linux desktop service, inspect systemd status and the journal as
shown above. If the service stops when an SSH session closes, verify that the
user manager and lingering policy on that host are configured by its
administrator.

For an operator-managed command-line service, use that supervisor's status and
log commands. You can also stop the managed process and run the same installed
command in a terminal to inspect startup output:

```sh
t3 serve
```

For failures after signing in to T3 Connect, see
[connection troubleshooting](./remote-access.md#t3-connect-troubleshooting).
