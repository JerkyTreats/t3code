# Install T3 Code

T3 Code runs coding agents on your computer and lets you control them from its
desktop, web, or mobile app. Set up the machine where the agents will work first.

## Requirements

Command-line use, SSH hosts, and WSL backends need Node.js 22.16 or later in the
22 series, 23.11 or later in the 23 series, or 24.10 and later. The native
desktop app includes its server runtime.

Building from the current source checkout uses the stricter root toolchain and
requires Node.js 24.13.1 in the 24 series. Follow the version declared in the
root `package.json` when that requirement changes.

You need an installed, authenticated provider before starting a thread. You can
launch T3 Code and configure providers afterwards.

## Fork desktop and server distributions

Install this fork's desktop and command-line server runtimes only from the
[exact-origin release history](https://github.com/JerkyTreats/t3code/releases),
an artifact supplied through that repository, or an authorized checkout of the
same source. This fork does not install or run T3 Code from the public npm
registry. Package-manager entries for another repository are not supported
desktop or server distributions of this fork.

An installed command-line runtime uses the `t3` executable directly:

```bash
t3
t3 --help
```

Use `t3 serve` when the host should run without opening a browser. Keep the
installation method recorded so you can replace the runtime from the same
exact-origin source when updating.

## Desktop app

Download desktop artifacts only from the exact-origin release history. The app
checks desktop update metadata against that same repository.

The managed Linux installer requires an AppImage and its adjacent
`.AppImage.release.json` descriptor from the same exact-origin build. Run the
installer from an authorized exact-origin checkout and provide the HTTPS origin
the installed desktop client should open:

```bash
node scripts/install-linux-desktop.mjs \
  --artifact /path/to/T3-Code.AppImage \
  --descriptor /path/to/T3-Code.AppImage.release.json \
  --production-server-url https://server.example.test
```

The installer verifies the descriptor and artifact before changing its managed
destination. It installs the launcher, desktop entry, URL handler, and Linux
user service together. The source checks for this procedure pass in the current
candidate. An actual AppImage installation and independent client acceptance on
an installed Linux machine remain pending.

### Windows Subsystem for Linux

Choose a WSL distro in **Settings → Connections** to run agents and projects
there. Install Node.js and provider CLIs inside that distro. T3 Code uses the
matching server runtime packaged with the desktop app. The first launch after an
app update can take longer while that runtime is prepared.

### Open a project from a terminal

With the desktop app already running on the same machine:

```bash
t3 app
```

This opens a new thread for the current directory and adds the project if
needed. Pass a path, such as `t3 app ../my-project`, to open another directory.
It requires the desktop app, so a standalone server or an SSH session is not
enough. If the command cannot reach the app, start or update the desktop app and
try again.

## Mobile app

The mobile app remains an upstream-owned distribution lane. The store links
below describe that lane and do not show that a particular store build has been
validated against the current fork server protocol.

Install T3 Code from the
[App Store](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824) or
[Google Play](https://play.google.com/store/apps/details?id=com.t3tools.t3code).
The phone connects to a server on another machine. Follow
[remote access](./remote-access.md) to link it through T3 Connect or a pairing
URL.

## Providers

Open **Settings → Providers** in the web or desktop app, select the environment,
and enable the provider you want. Installation, login, and configuration belong
to that environment's machine, even when you connect from a phone or another
computer.

| Provider    | Install and authenticate                                                                     |
| ----------- | -------------------------------------------------------------------------------------------- |
| Codex       | Install [Codex CLI](https://developers.openai.com/codex/cli), then run `codex login`.        |
| Claude      | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`. |
| Cursor      | Install [Cursor CLI](https://cursor.com/cli), then run `agent login`.                        |
| Grok Build  | Install [Grok Build CLI](https://x.ai/cli), then run `grok login`.                           |
| OpenCode    | Install [OpenCode](https://opencode.ai), then run `opencode auth login`.                     |
| Antigravity | Install and sign in with Google from T3 Code's provider settings.                            |

Provider CLIs must be on the server's `PATH`. If T3 Code cannot find one, set
its **Binary path** in provider settings, especially when using a version
manager. Cursor's executable is `cursor-agent`, although its login command is
`agent login`. Antigravity can use its managed runtime without a `PATH` entry.

When a provider CLI is behind its latest release, its provider card can show the
available version. **Update now** appears only when T3 Code recognizes how that
provider was installed. Otherwise update the provider CLI the same way you
installed it. This provider update behavior does not install or update T3 Code
itself.

Add another provider instance for a separate account or configuration. Each
instance can have its own environment variables, such as API keys or a custom
base URL. Mark secret values as sensitive. T3 Code does not display their
original values after saving.

For provider-specific setup and accounts, see [Codex](./providers-codex.md),
[Claude](./providers-claude.md), [OpenCode](./providers-opencode.md), and
[Antigravity](./providers-antigravity.md).

## Next steps

- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): choose when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Keeping a host available](./background-service.md): choose a supported host process.
- [Updating T3 Code](./updating.md): update exact-origin installations.
