# t3code-omarchy

t3code-omarchy is an Omarchy tuned fork of T3 Code for Codex, Claude, and OpenCode.

[Omarchy](https://omarchy.org/) is opinionated about desktop tooling and workflow. This fork aligns T3 Code with those decisions instead of treating them as generic Linux defaults.

## Omarchy Alignment

### Screenshot Attach

Desktop chat includes a `Screenshot` button that triggers the Omarchy screenshot flow and attaches the resulting image to the active draft.

### System Theme Sync

When T3 appearance is set to `System`, the desktop app inherits the active Omarchy theme palette and light or dark mode from the current Omarchy theme.

### GitHub Panel

Desktop chat now includes a project scoped GitHub panel in the header.

It surfaces local Git actions such as commit and push, verifies `gh` authentication, and lists repository issues.

## How to use

> [!WARNING]
> Install and authorize at least one provider before using t3code-omarchy.
>
> - Codex: install [Codex CLI](https://github.com/openai/codex) and run `codex login`
> - Claude: install [Claude Code](https://docs.anthropic.com/en/docs/claude-code/setup) and run `claude auth login`
> - OpenCode: install [OpenCode](https://opencode.ai/docs/) and run `opencode auth login`

```bash
npx t3
```

You can also just install the desktop app.

Install the desktop app from this fork's Releases page after publishing a release.

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

## If you REALLY want to contribute still.... read this first

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
