# Install And Run The Current Source Tree

## Safety Boundary

**DO NOT CLONE WITHOUT USER AUTHORIZATION.**

Authorization must identify the exact repository source and intended destination. Review `AGENTS.md`, `README.md`, package scripts, lockfiles, and active fork contracts before installing dependencies or running repository code.

Installation and launch are separate decisions. Installing dependencies does not authorize launching a server, desktop client, or browser.

## Requirements

- Node.js `24.13.1`
- repository-declared pnpm `11.10.0`
- at least one supported provider installed and authenticated for actual agent use

## Install Dependencies

From an authorized existing checkout, inspect the package scripts and lockfile, then run:

```bash
pnpm install --frozen-lockfile
```

This installs repository dependencies and runs declared lifecycle scripts. It does not authorize a later launch.

## Launch After Separate Authorization

Start the web and server development surfaces with:

```bash
pnpm dev
```

Start the Electron development surface with:

```bash
pnpm dev:desktop
```

Use worktree-local state. Never start development code against live user data. Read the repository agent instructions for current state isolation, process ownership, and shutdown rules.

## Verify Source Changes

```bash
pnpm fmt
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm lint:mobile` as well when native mobile code changes.

This guide describes running and verifying the source tree. The patch guide lists only fork behavior implemented in the current candidate. Validation does not authorize publication or changes to a managed installation.
