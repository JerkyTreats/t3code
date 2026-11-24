# Remote access

Connect a phone, browser, or another desktop app to T3 Code running on a
different machine. That machine must stay running and reachable while you work.

## T3 Connect

T3 Connect makes an environment available to your other devices without setting
up router forwarding. In the desktop app on the host, open **Settings →
Sharing & access**, sign in, and enable **T3 Connect** for that environment.

For a command-line host, use the authorized installed runtime:

```bash
t3 connect
t3 serve
```

Follow the sign-in instructions, then keep the server running. Saving your
sign-in alone does not make the machine reachable.

On your other device, sign in to the same T3 Connect account and choose the
environment. On the app.t3.codes home page with no computer added yet, signing
in adds compatible computers linked to your account. Over SSH, the CLI prints a
browser link and a short code. Open the link on any device, confirm the code
matches, and approve. The CLI continues on its own, so you do not need to forward
an OAuth callback port.

T3 Connect renews access credentials when needed without disconnecting a
healthy connection. Pull request diffs and provider settings keep working after
the previous credential expires. A failed renewal affects that request. It does
not disconnect an otherwise healthy conversation.

### Scripts and agents

`t3 connect` and `t3 pair` run without a terminal. T3 Connect sign-in then prints
a URL and a code; approve it on any device.

### More machines with T3 Chat

Each T3 Connect account can link up to 3 machines. Phones and browsers do not
count. A paid T3 Chat plan raises the limit to 10 machines with Pro, or 100 with
Premier.

To link T3 Chat, open your account menu on the web or desktop app, go to
**T3 Chat**, and select **Link T3 Chat**. Sign in to T3 Chat in the window that
opens and approve. The new limit applies the next time you add a machine. If you
cancel or downgrade T3 Chat, machines you already linked stay linked, but you
cannot add more until you are under the limit again.

## Pair over a LAN or private network

Use direct pairing when the other device can reach the host's network address.

On a desktop host, open **Settings → Sharing & access** and enable **Network access**.
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
in the receiving app. Connection settings are under **Settings → Environments**
on web and desktop and **Settings → Environments** on mobile. A loopback address
such as `127.0.0.1` reaches only the device opening the link.

On a computer with the desktop app, you can open the printed `t3code://pair`
app link instead. The desktop app asks you to confirm the server address, then
adds it.

If your HTTPS endpoint uses a certificate from your own certificate authority,
install that CA on Android as a **CA certificate** in its security settings; the
Android app then trusts it.

Pairing authorizes that device for future connections. Use a fresh one-time link
for each new device. You do not need the original token to reconnect. If a link
expires or has already been used, run `t3 pair` again to create another.
A device stays signed in while you keep using it. One unused for 30 days, or
paired with a host older than this release, has to pair again.

### Reach one machine several ways

A machine can have more than one route: LAN, Tailscale, another VPN, a public
URL, SSH, or T3 Connect. Tailscale shares its `100.64.0.0/10` address range with
other VPNs such as Cloudflare WARP, so an address in that range shows as VPN
unless the machine confirms it is on Tailscale. To add a route, choose **Add
route** in the machine's route list, or next to it in the T3 Connect list.
A pairing link for a saved machine is refused when it comes from an address
that machine does not have yet; add that address with **Add route** instead.
Pairing again over an address the machine already has still works. A new route
is placed by speed, in that order, and you can reorder routes at any time.

While connected through T3 Connect or a paired address, T3 Code also learns the
machine's current LAN and Tailscale addresses and adds them as routes, so
pairing once through T3 Connect is enough to use the LAN at home. When the
machine's LAN address changes, for example after it joins another Wi-Fi network,
the learned route follows it. The machine must allow network access for its LAN
address to be learned: **Network access** in the desktop app, or a reachable
`--host` for `t3 serve`.
You can reorder a learned route, but not remove it; it
goes away with the route it was learned through, or when the machine stops
reporting that address.

T3 Code connects over the first route that answers. Away from home, a LAN
address that does not answer is checked briefly and skipped. It is only tried
again, after the other routes, if none of them connect. While connected over a
later route, T3 Code checks the earlier ones when your network changes, when you
return to the app, and every minute, and moves back as soon as one works. A
route whose machine refused this device's sign-in is marked **Sign-in
refused**; pair that address again with **Add route** to use it.

On web and desktop, select the route count under the machine's name in
**Settings → Environments** to see its routes. Drag a route to change the order,
or remove it. On mobile, open the machine under **Settings → Environments** and
choose **Edit**. Signing out of T3 Connect removes only that route; a machine
you can still reach another way stays saved.

Open **Permissions** next to **Routes** in web or desktop, or **Your permissions**
in the mobile route details, to see what your current connection can do on that
environment. For a remote environment, this is in its route details. Permissions
shown there apply only to the route marked **In use**; other routes are not
checked. Direct pairing and T3 Connect have separate sessions and may grant
different permissions.

### Balance new threads across machines

Auto balance is off by default. On web and desktop, enable it in
**Settings → Environments → Load balancing** to automatically choose a machine for
new threads in projects grouped across connected environments. The section
appears once two or more machines are switched on.
Each machine starts at **Normal**. Choose **Prefer** to favor it when it has CPU and
memory available, **Less often** to reduce its share, or **Manual only** to exclude
it from automatic selection. These are preferences, not fixed traffic percentages.
Preferences are saved separately in each client.

The composer checks eligible machines when choosing a draft's environment, then keeps
that choice stable. Choose **Auto balance** again to check current resources, or choose
a specific machine to override it. Choosing a branch or worktree also keeps the draft
on that machine. Existing threads stay where they started. If resource checks are
unavailable or all eligible machines are full, choose a machine manually to continue.
Mobile keeps its manual environment selection.

### Tailscale HTTPS

Join both devices to the same tailnet. In the desktop app, enable **Tailscale
HTTPS** in **Settings → Sharing & access**. Turn it off there to remove that route.

Your tailnet needs MagicDNS and HTTPS certificates enabled; see
[Tailscale's HTTPS setup](https://tailscale.com/docs/how-to/set-up-https-certificates).
On Linux, T3 Code also needs permission to manage Tailscale; see
[operator permission](https://tailscale.com/docs/reference/troubleshooting/linux/linux-operator-permission)
for non-root users. If any of these is missing, T3 Code still starts but can't
add the HTTPS route.

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
tailscale serve --https=443 --set-path=/ off
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

In the desktop app, open **Settings → Environments → Add environment**, choose
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

T3 Code cannot answer a second sign-in prompt such as a Duo code. On macOS and
Linux it can reuse a connection you signed in to in a terminal instead: turn on
connection sharing for the host in `~/.ssh/config`, run `ssh <alias>`, then
connect. When that connection closes, sign in again in a terminal and retry.

```sshconfig
Host <alias>
  ControlMaster auto
  ControlPath ~/.ssh/cm-%C
  ControlPersist 8h
```

If SSH reconnecting fails after an app update, update the preinstalled runtime
on the remote host through its exact-origin installation method, then retry the
launch. Removing the connection stops a server that T3 Code launched. A server
that was already running is left alone.

Each desktop app keeps one session on the host for its SSH connection and reuses
it when it reconnects. Revoke sessions you no longer use in **Settings →
Sharing & access** on the host, or on a headless host with `t3 auth session list` and
`t3 auth session revoke <id>`. A desktop that can still sign in over SSH pairs
again on its next connect.

For Antigravity's Google callback on a remote host, see
[remote sign-in](./providers-antigravity.md#sign-in-from-a-remote-device).

## Browser on a remote environment

Browser tabs belong to the environment, so you and your agents see the same tabs
from any device. The desktop app shows its own environment's tabs directly. Other
devices, and the desktop app for other environments, stream them from the host.
Agents keep using them while no device is connected, and `localhost` addresses
reach servers on that host.

A tab you open yourself in the desktop app for another environment loads on
your computer instead, so the element picker, screenshots, and annotations work
as they do locally. Its `localhost` addresses still reach servers on the host,
over the connection the app already has, whichever way you connected. If the
host cannot be reached, the tab shows a connection error; a `localhost`,
`127.0.0.1`, or `[::1]` address never opens a server on your own computer.
Other names that point at your computer, such as `/etc/hosts` entries, still
do. These tabs ignore your system proxy settings, so they can't reach a host
you connect to only through a proxy or over HTTPS with a privately issued
certificate. The web app keeps streaming.

The desktop app can also forward a port on the host to your computer, so any
app there, such as your own browser, `curl`, or a database client, reaches it
at `localhost`. Use the forward button on a server in the thread's **Servers**
list, or **Forwarded ports** in the command palette, where you can also type
any port number and stop forwards. A forward keeps the host's port number
unless that port is taken on your computer, in which case it uses a free one
and shows it. Forwards end when you stop them or quit the app. ⌘-click
(Ctrl-click on Windows and Linux) on a remote server forwards it and opens it
in your browser.

A forwarded port behaves like a server running on your computer: anything on
your computer can reach it, including web pages open in your browser, so a
forwarded service is exposed the same way a local dev server is. Forwards
listen only on your computer's loopback, never on your network. On Linux they
accept only apps running as your user; on macOS and Windows, other users signed
in to the same computer can reach them too.

On iPhone, iPad, and Android, a tab showing one of the host's `localhost` pages
has **Open on this device** in its menu. So does a long press on a `localhost`
link in a chat. It opens the page in the phone's own browser view, at the same
`localhost` address, so it scrolls and responds to touch natively. Like the
desktop app, it never opens a server on the phone itself. The streamed tab
stays where it was, and agents keep using it. Each host keeps its own cookies
and site data on the phone. On iPhone and iPad the page runs under a stand-in
address while the address bar shows `localhost`, so browser features that need
a secure page, such as the clipboard or service workers, aren't available there.

All of this rides the host's preview tunnel. Turn off **Settings → Sharing &
access → Preview tunnel** on the host to stop other devices from loading its
`localhost` pages themselves: port forwarding and **Open on this device** go
away, and open tunnels close. Tabs keep working by streaming from the host, so
anyone who can use the host's browser tabs can still view its `localhost` pages
there. An administrator can also turn it off with a
[managed policy](./managed-policy.md#other-capabilities).

The first tab downloads a headless Chrome, about 120 MB, into the T3 home. It
is the same browser [HTML renders](html-renders.md) use, so a host downloads it
only once. Some Linux hosts need [setup](#browser-host-setup) before it can
start.

Agent tabs have separate storage and share a Chromium process. Take control before
typing into an agent's tab, then release control when the agent should continue.
Read-only connections can watch without changing the page.

While you control the tab, copied or cut text goes to your clipboard, file pickers
open on your device, and finished downloads are offered for you to save. Sign-in
popups open as separate tabs. Downloads remain on the host until the tab closes.
Audio does not play on your device.

On a phone, tap the floating preview's corner dot to show its controls, then choose
**Pop into separate window** to watch in picture-in-picture over other apps.

### Local servers

The browser lists ports held by processes your terminals and agents started.
T3 Code reads which process holds each port and never connects to it, so a
listed port opens as `http://localhost:<port>` and might not be a web page. For
an HTTPS server or a specific path, set the **Preview URL** on the project
script that starts it; T3 Code checks that address and opens it as written.

To stop listing ports, set `T3CODE_PORT_DISCOVERY=0` in the environment that
starts the T3 Code server, such as
[`service.env`](./background-service.md#configure-the-service-environment) for
the background service, and restart it. Script preview URLs still appear.

### Browser host setup

macOS, Windows and Linux desktops run the browser as is. Some Linux hosts need
one-time setup: Ubuntu 23.10 and later can block the browser sandbox, while minimal
images and containers can lack required libraries. The server reports these cases
at startup, and browser tabs and HTML previews show the command to run on the host.
With an authorized installed runtime on your path, the command is:

```sh
sudo t3 browser setup
```

Use the exact command the server displays for the installed runtime. Where Node is
available only in your user environment, it preserves the required `PATH`. Where
`t3` is not on your path, it uses the installed application's executable or the quoted
current executable and entry. It does not acquire T3 Code from a public package registry.
Setup allows Chrome's sandbox with an AppArmor profile and installs any missing
libraries and system fonts with apt; pages that load without text can mean the
host has no fonts. It is safe to run again, and each run reloads the AppArmor
profile: run it again if the browser reports a blocked sandbox on a host restored
from an image or snapshot, where the profile can be on disk without being loaded.
Without `sudo`, it only reports what it would change.

The browser runs in Chrome's sandbox by default. Chrome cannot start that sandbox
as root. If your T3 server runs as root, run it as a nonroot user to keep
sandboxing enabled. `t3 browser setup` does not fix this root restriction.

If you need to run as root, or cannot enable the sandbox on your host, set
`T3CODE_SERVER_BROWSER_SANDBOX=0` in the **T3 server's environment** and restart
the server. This disables Chrome's sandbox. For a manual launch:

```sh
T3CODE_SERVER_BROWSER_SANDBOX=0 t3 serve
```

For a systemd service, add `Environment=T3CODE_SERVER_BROWSER_SANDBOX=0` under
`[Service]` in its configuration, run `sudo systemctl daemon-reload`, then restart
your T3 service. Setting the variable in an agent's terminal does not change the
environment of an already running T3 server.

## Connect an outside agent

Claude Code, Codex, ChatGPT and other agents T3 Code did not start can drive
threads through the environment's MCP server. See [outside agents](./outside-agents.md)
for setup and approval. This does not give an outside agent external Admin authority
or access to the locally managed agents' preview or device endpoints.

## Link another environment

Link two machines, such as your laptop and a VPS, and agents on one can work on
the other: launch, message, wait on and stop its threads, answer their
questions, and manage its queues, projects and scheduled tasks.

Linked environments is a beta. Turn it on for both machines in **Settings →
Labs**; on mobile, **Settings → Labs** lists each connected machine. On a
headless server, open its address in a browser and pair to reach its **Settings
→ Labs**, or add `"linkedEnvironmentsEnabled": true` to `settings.json` in its
`userdata` directory, such as `~/.t3/userdata/settings.json`; a running server
picks it up. While it is
off on either machine, agents start nothing over a link between them. A task
already running on the other machine still finishes, and if that machine has it
off, its result arrives once it is back on.

On the machine you will work from, open **Settings → Environments → Linked environments**,
choose **Link**, and pick the other machine or enter its address. The list
holds the machines this app knows and those on your T3 Connect account. If this
app has an address for that machine and is connected to it with a session that
manages access there, it makes the pairing code itself; otherwise paste one
from that machine's **Settings → Sharing & access**. An address you type always
needs a pasted code. From a terminal, use
`t3 environment link <address> --pairing-code <code> --access <mode>`.

To link many machines at once, choose **Link several…** (it appears once this
app has two other machines saved). Tick the machines, pick one access level for
all of them, and confirm once. A machine can be ticked when this app is
connected to it with a session that manages access there and has an address
another machine can reach; the list says why when it cannot. Each machine
reports its own result, and the ones that failed stay ticked so you can try
only those again. Machines already linked are left as they are.

For machines no app is connected to, put one `<address> <pairing-code>` per
line in a file (make each code with `t3 pair` on that machine) and run
`t3 environment link --from <file> --access <mode>`, or `--from -` to read
standard input. It prints a result per line, leaves machines already linked as
they are, and exits non-zero if any line failed, so the same file can be run
again with fresh codes for the failures.

You can also ask an agent to link a machine by name, such as "delegate this to
my vps". It shows a card in the thread where you pick the machine the same way
and the access, then approve. An address the agent gives that this app does
not know for one of your machines also needs a pasted code. Paste one only for
an address you trust: the code is sent there.

- The access you pick is the most agents from this machine may do there. An
  agent also never gets more there than its own mode here.
- Threads a link starts are marked **From** and this machine's name there.
- A full-access link works there like that machine's own agents. Below full
  access, the link's agents can change only threads it started, not that
  machine's own threads, projects or settings, and they skip its project setup
  scripts.
- The link shows up in that machine's **Settings → Sharing & access** like any
  outside agent, and can be revoked there. **Forget** on this machine also ends
  it there when that machine confirms it. If it can't, such as when it is
  offline or on an older T3 Code, Forget says so; revoke it in that machine's
  Sharing & access.
- A link stays valid while agents use it. One unused for 30 days expires, as
  does one to a machine on an older T3 Code after 30 days; link again with a
  new pairing code.

On web and desktop, **Settings → Environments** opens as a map of your machines:
this app, each environment with one line per route (the one in use is
highlighted), and the machines an environment links to. Select a machine to
manage it, or switch to **List** for the same controls as rows. To link from
the map, drag the plus on an environment onto another machine, or press it and
pick one. If this app is connected to both machines, knows an address the first
can reach the other at, and its session on the other one manages access there,
it needs no pairing code.

A machine this app is not connected to, shown only because another environment
links to it, can still be linked without a code when that link has full access:
drop the plus on it and the environment holding the link gets the pairing code
from it. Your session on that environment must manage access there. The result
is a separate link with the access you pick, listed and revocable on the linked
machine like any other. Links still do not chain.

A link goes one way. To let the other machine's agents work back, tick **Also
link … back** when you create the link, or select a one-way link and use
**Link back…**. It is offered when this app is connected to both machines and
may manage access on each. Two machines linked to each other at the same access
are drawn as one line with an arrowhead at each end; they are still two links,
and each is forgotten on its own.

To link one environment to several machines at once, Shift-click the machines
(or Shift-drag a box around them, or press Space on a focused machine), then
drag the environment's plus onto any of them, or use **Link several…** above
the map. Dropping the plus on a stack offers the stack's machines. The dialog
ticks the machines it can link without a pairing code and says why for the
rest. When this app is connected to none of them, each needs a pairing code,
so the map says so and offers to link one at a time instead.

Large setups fold: machines known only through links that share the same
linking environments and access levels become one stack, and once this app
knows more than 12 environments, the ones that are not connected and have no
links fold by state. Select a stack to list and filter every machine in it.
Opening a stack on the map draws its first 24 below its card: the rest of the
map stays where it is and the map grows taller, so pan or press the fit button
to see all of it. **Find a machine** above the map searches by name, and Enter
goes to the first match. The **?** button above the map lists these gestures.

The map draws the links of the machines this app is connected to; a machine it
is not connected to may hold links the map cannot show. A link reaches one
machine and does not carry on through that machine's own links.

An agent can also hand a task to a linked machine with `delegate_task`: it runs
there as an ordinary thread, in the project with the same repository (or the
one `target.projectId` names), and this thread wakes with its result when it
ends, as for any delegated task. It keeps following the task across restarts.
If the other machine revokes the link, or the link is removed here, the task
fails with that reason.

### Read a linked machine's threads

You can read a thread on a linked machine without connecting this app to it. Open
a task that was delegated there from the thread's agents, or a thread link that
points there, and the thread opens read-only, streamed through the machine you
are connected to over its link. It follows the thread live. On web and desktop
it opens as a tab in the right panel, beside the thread you are in, or in the
main view with ⌘/Ctrl-click, like
[subagents and side chats](thread-sidebar.md#open-a-thread-beside-the-one-you-are-in).
On mobile it opens in the inspector on layouts that have one, where Maximize
fills the screen, and as its own screen elsewhere. It shows the same timeline as
any other thread on web and desktop, and a shorter read-only list on mobile.

- The view is marked **Read-only** with both machines' names. To reply, approve
  or stop the thread, choose **Connect to interact**. When the link has full
  access, this app pairs with that machine in one step and opens the thread
  there; you need permission to manage access on the machine you are connected
  to. Otherwise the add-environment form opens for that machine and asks for a
  pairing code you create on it.
- This app connects to that machine directly, so it must be able to reach one of
  the addresses the link uses. If it cannot, the view says so and stays
  read-only. The new connection is an ordinary paired client of that machine,
  named after this device and the machine it came through, and is revoked there
  like any other pairing.
- Files, images and published visuals stay on that machine and do not load
  here. A command's output shows as of when you open its row.
- If this app is already connected to that machine, the thread opens there as
  usual instead.
- You need permission to read threads on the machine you are connected to, and
  Linked environments must be on there. Both machines need a version of T3 Code
  that has this view.

## Manage pairing and device access

**Settings → Environments** and **Settings → Sharing & access** configure
environments, network reachability, Tailscale, SSH, and T3 Connect. They are not
an embedded Admin product and do not own managed-device lifecycle.

When the app connects to more than one environment, choose one at the top of
these pages; Settings then shows that environment's reachability and T3 Connect
link.

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

A device enrolled through the portal receives the standard permissions, which
include access management and T3 Connect management. It can approve outside
agent sign-ins and manage T3 Connect like any other standard device. The portal
is how you contain it: revoking an unused enrollment link, disabling a device,
or deleting it takes effect at once and disconnects the device. A device
enrolled earlier keeps the permissions it was issued until it pairs again.

The portal receives its short-lived high-value authority from an explicit host
operator command. Choose a bounded lifetime no longer than seven days:

```bash
t3 auth session issue --device-administrator --ttl 1h --token-only
```

Keep that credential in the portal's server-side secret storage. Never place it
in browser state, a pairing URL, a screenshot, or a bug report.

To choose a token's permissions, pass `--scope` once for each scope you want:

```sh
t3 pair --scope orchestration:read --scope relay:read
```

The selected scopes replace the default permissions. The same option works with
`t3 auth pairing create` and `t3 auth session issue`; each command's
`--help` lists the available scopes. Without `--scope`, pairing tokens and
issued bearer sessions both receive the standard permissions.

To change an existing client's permissions, create a fresh pairing link with the
scopes it needs. In a browser opened directly on the environment, open that link
to replace the browser's current grant. For mobile or a saved remote environment
in web or desktop, use **Add Environment** with the fresh link or code; pairing
the same environment replaces its saved grant. Reconnecting alone does not change
permissions.

Grouping checkouts does not combine their permissions. Shared project settings
require `orchestration:operate` on every member environment; actions on one
checkout use that checkout's permissions.

`source-control:write` covers direct Git and pull request changes made from the
client: pushing, switching or creating branches, cloning, and removing
worktrees. It does not restrict what a task does. Starting a task in a new
worktree still creates that branch and worktree with `orchestration:operate`,
and the agent it runs can use Git however the environment allows.

Settings changes, provider management, environment maintenance, access
management, and T3 Connect preferences can each be granted separately. Setting
up or replacing a T3 Connect link requires the administrative
`relay:configure` permission. `relay:write` covers preferences and unlinking.
New pairings without `--scope` include the standard client permissions. Existing clients keep the
permissions they paired with and can stay connected after an update, but newly
separated features may require pairing again with the permissions they need.
Older clients may show controls that the server denies. Create a fresh pairing
link to change a client's permissions.

`filesystem:read` allows browsing host files, opening workspace files, and viewing
local changes. Add `filesystem:write` to allow editing files or saving plans to
the workspace. These scopes control direct file access from the client.

Some permissions also give a client indirect access. With `terminal:operate`,
a client can run commands that read or change any files the server’s OS account
can access, even when the pairing link omits file permissions. With
`relay:configure`, a client can replace the trusted issuer of pairing
credentials. Grant these permissions only to clients you trust with those
capabilities.

To remove an environment from T3 Connect, open your account menu's **T3 Connect**
page, or **Settings → T3 Connect** on mobile, and choose **Deregister**. This
revokes its cloud access and frees its host space even when the environment is
offline or has been wiped. When T3 Connect rejects a host's link, the host
shows that it was removed from T3 Connect. To link it again, turn on
**T3 Connect** in **Settings → Sharing & access** on web or desktop, or turn on
**Live Activity Updates** in **Settings → Notifications** on mobile; if it is
already on, turn it off and on again. Either needs a client paired with
`relay:read`, `relay:write`, and `relay:configure`. The desktop app's own session
and the startup pairing link include all three; other pairings need
`relay:configure` among their scopes. You can also
run `t3 connect link` on the host and then restart T3 Code there. A
command-line host that released its tunnel when it last stopped may link itself
again on its next start; run `t3 connect unlink` on that host to keep it off.
Removing an environment from a device's connection settings only forgets it on
that device and doesn't change your T3 Connect account. A device keeps a saved
environment after it's deregistered until you remove it from that device.

When idle tunnel cleanup is enabled, T3 Connect removes a linked environment's
tunnel after it stays offline for several minutes. The environment stays linked
and keeps the same address. When the host starts again or wakes, T3 Connect
creates a replacement tunnel on its own. You do not need to pair again. Cleanup
usually runs five to ten minutes after the tunnel goes down.

T3 Connect also removes the tunnel of an environment running an older version of
T3 Code once it has been offline for seven days. That environment shows a message
asking you to update. Start T3 Code on that computer and update it to the latest
version; it reconnects at the same address without pairing again.

On a command-line host, `t3 connect unlink` disables exposure while retaining
your login. `t3 connect logout` also clears that login. Stopping the host process
is separate.

Treat pairing URLs and authorization codes as passwords. Do not include them in
screenshots, logs, or bug reports.

## T3 Connect troubleshooting

When a T3 Connect connection fails, see
[T3 Connect troubleshooting](./t3-connect-troubleshooting.md). It explains each
error, where the problem is, and how to fix it.

## Using the Desktop App as a Remote Only

If a computer should only drive work running elsewhere, turn off its local environment. In the
desktop app, open **Settings → Environments** and switch off **Local
environment**. T3 Code restarts without a local server: no local agents or terminals run, WSL
backends stay off, and other devices can no longer connect to this computer. Your projects,
history, and saved connections are kept, and you keep working through pairing, T3 Connect, or SSH.
If another T3 Code server on this computer, such as an operator-managed `t3 serve`,
uses the same T3 home, the app still treats it as this computer: **Open in** and
file reveal for its projects run here, whichever connection you reach it through.
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
