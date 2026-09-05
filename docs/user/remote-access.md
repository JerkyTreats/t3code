# Remote access

Connect a phone, browser, or another desktop app to T3 Code running on a
different machine. That machine must stay running and reachable while you work.

## T3 Connect

T3 Connect makes an environment available to your other devices without
requiring router forwarding. In the desktop app on the host, open **Settings →
Connections**, sign in, and enable **T3 Connect** for that environment.

For a command-line host, use the authorized installed runtime:

```bash
t3 connect
t3 serve
```

Follow the sign-in instructions, then keep the server running. Saving your
sign-in alone does not make the machine reachable.

On your other device, sign in to the same T3 Connect account and choose the
environment. Over SSH, the CLI prints a browser link and accepts the returned
authorization code, so you do not need to forward an OAuth callback port.

T3 Connect renews access credentials when needed without disconnecting a
healthy connection. Pull request diffs and provider settings keep working after
the previous credential expires. A failed renewal affects that request. It does
not disconnect an otherwise healthy conversation.

## Pair over a LAN or private network

Use direct pairing when the other device can reach the host's network address.

On a desktop host, open **Settings → Connections** and enable **Network access**.
Changing network access restarts the desktop app. You can turn it off in the
same place. Generate a pairing link with the installed command-line runtime on
the host, as described below.

For a command-line host, replace `<private-ip>` with the host's LAN or tailnet
address:

```bash
t3 serve --host <private-ip>
```

For an already-running desktop or command-line server, use the installed
command-line runtime on that host to generate a fresh link without restarting it:

```bash
t3 pair
```

Use the same server data location as the running host. If it uses a custom
location, select it with `--base-dir`; see `t3 pair --help`.

Scan the QR code on your phone or paste the pairing URL into **Add environment**
in the receiving app. Connection settings are under **Settings → Connections**
on web and desktop and **Settings → Environments** on mobile. A loopback address
such as `127.0.0.1` reaches only the device opening the link.

Pairing authorizes that device for future connections. Use a fresh one-time link
for each new device. You do not need the original token to reconnect. If a link
expires or has already been used, run `t3 pair` again to create another.

### Tailscale HTTPS

Join both devices to the same tailnet. In the desktop app, enable **Tailscale
HTTPS** in **Settings → Connections**. Turn it off there to remove that route.

To start a command-line server with Tailscale HTTPS:

```bash
t3 serve --tailscale-serve
```

For an already-running server:

```bash
t3 pair --tailscale
```

The pairing link uses an address such as
`https://machine.example-tailnet.ts.net/`. The mapping created by
`pair --tailscale` persists across restarts. Remove its default-port mapping
with:

```bash
tailscale serve --https=443 off
```

If that port is already in use, choose another with
`--tailscale-serve-port`. See `t3 pair --help` for other pairing options.

### Hosted web app

[app.t3.codes](https://app.t3.codes) needs an HTTPS endpoint. It connects
directly to your server. A hosted pairing link does not make an unreachable
backend reachable or convert HTTP to HTTPS.

For a plain HTTP LAN endpoint, use the direct pairing URL in a browser that can
open it, or pair from the desktop app. On mobile, an IP address entered without
a scheme uses HTTP, so include `https://` when your server uses HTTPS.

## Desktop-managed SSH

In the desktop app, open **Settings → Connections → Add environment**, choose
**SSH**, and enter a host or SSH alias such as `user@example.test`. T3 Code
starts or reuses a server there and opens the port forward for you. Projects,
provider credentials, and agent work stay on the remote machine.

The remote host needs a compatible [Node.js installation](./install.md#requirements)
and [provider setup](./install.md#providers). It also needs a compatible
preinstalled exact-origin `t3` runtime. The desktop app does not download T3
Code from a public package registry. If launch cannot find Node or reports an
incompatible version, check it through a non-interactive SSH session:

```bash
ssh user@example.test 'sh -lc "command -v node && node --version"'
```

Configure your version manager for non-interactive shells if this differs from
your normal terminal. With nvm, setting a compatible default, such as
`nvm alias default 24`, can resolve the problem.

If SSH reconnecting fails after an app update, update the preinstalled runtime
on the remote host through its exact-origin installation method, then retry the
launch. Removing the connection stops a server that T3 Code launched. A server
that was already running is left alone.

For Antigravity's Google callback on a remote host, see
[remote sign-in](./providers-antigravity.md#sign-in-from-a-remote-device).

## Manage pairing and device access

**Settings → Connections** configures environments, network reachability,
Tailscale, SSH, and T3 Connect. It is not an embedded Admin product and does not
own managed-device lifecycle.

Use `t3 pair` for an ordinary one-time pairing link. A headless operator can
inspect or revoke pending ordinary pairing credentials without revealing their
secret values:

```bash
t3 auth pairing list
t3 auth pairing revoke <pairing-id>
```

The separately deployed Admin portal is the authority for managed browser and
Electron devices. It can create one-time standard-device enrollment links and
enable, disable, or delete eligible devices. Headless operators and devices not
enrolled through a portal-created grant stay outside that inventory.

The portal receives its short-lived high-value authority from an explicit host
operator command. Choose a bounded lifetime no longer than seven days:

```bash
t3 auth session issue --device-administrator --ttl 1h --token-only
```

Keep that credential in the portal's server-side secret storage. Never place it
in browser state, a pairing URL, a screenshot, or a bug report.

To remove an environment from T3 Connect, open your account menu's **T3 Connect**
page, or **Settings → T3 Connect** on mobile, and choose **Deregister**. This
revokes its cloud access and frees its host space even when the environment is
offline or has been wiped.

On a command-line host, `t3 connect unlink` disables exposure while retaining
your login. `t3 connect logout` also clears that login. Stopping the host process
is separate.

Treat pairing URLs and authorization codes as passwords. Do not include them in
screenshots, logs, or bug reports.

## T3 Connect troubleshooting

Run `t3 connect status` on the host to inspect saved authorization and link
configuration. It is not a live reachability check. If the environment appears
offline, inspect the desktop host or your operator-managed process. If it
disappears when SSH closes, see
[host process troubleshooting](./background-service.md#troubleshooting).

| Error                                                     | Recovery                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment_link_limit_exceeded` or managed tunnel limit | Deregister an unused environment, then restart T3 Code on the host.                                                                         |
| `auth_invalid` or `invalid_bearer`                        | Run `t3 connect login`. If credentials were revoked, run `t3 connect logout`, then `t3 connect` again. Restart the server after signing in. |
| Expired or invalid link proof                             | Check the host's date and time, update T3 Code, then restart it.                                                                            |
| HTTP 403 without a recognized error                       | Check relay access, proxies, and firewall rules. Keep any Cloudflare Ray ID for a bug report.                                               |
| HTTP 408, 429, or 5xx                                     | Check network and relay availability. Startup retries temporary failures for up to ten minutes.                                             |

After fixing a permanent rejection, restart the host server. Restart the
managed Linux desktop unit with `systemctl --user restart
t3code-desktop.service`. For an operator-managed foreground server, stop it and
run `t3 serve` again with your usual options. Include the diagnostic message and
trace ID when reporting a persistent failure.

For a connection that still fails after linking, check the date and time on
both devices. For server version warnings, follow
[Updating T3 Code](./updating.md).
