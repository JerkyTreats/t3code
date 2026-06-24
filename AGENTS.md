# AGENTS.md

## Task Completion Requirements

- For source code changes and runtime build input changes, `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` must pass before considering tasks completed.
- For documentation-only, governance-only, or workflow-only changes, full gates are optional unless the user asks for them.
- If changing native mobile code, `pnpm lint:mobile` must also pass.
- Never run `bun test`. Use `pnpm test` for the repository test gate.

## Project Snapshot

T3 Code is a minimal web GUI for using coding agents like Codex and Claude.

This repository is a VERY EARLY WIP. Proposing sweeping changes that improve long-term maintainability is encouraged.

## Governance Index

- [Commit Policy](governance/commit_policy.md)
- [Compatibility Policy](governance/compatibility_policy.md)
- [Docs Style Policy](governance/docs_style_policy.md)
- [Patch Guide](patch.md)
- [Policy Proposal Flow](governance/policy_proposal_flow.md)
- [Complex Change Workflow Governance](governance/complex_change_workflow.md)
- [Upstream Merge Policy](governance/upstream_merge_policy.md)

## Governance Rules

- For any request that asks for a commit or amend, review [Commit Policy](governance/commit_policy.md) before running `git commit` or `git commit --amend`.
- For any request to edit `AGENTS.md`, `patch.md`, or files under `governance/`, review [Policy Proposal Flow](governance/policy_proposal_flow.md) before editing.
- For upstream sync, merge, or divergence decisions, review [Upstream Merge Policy](governance/upstream_merge_policy.md) first.
- For upstream sync or merge implementation work, complete the required fork preservation gate in [Upstream Merge Policy](governance/upstream_merge_policy.md) before considering the work ready for review or merge.
- For upstream sync or any change that modifies fork owned behavior, review [Patch Guide](patch.md) first and update it in the same change.
- Complex workflow mode is opt in and not enforced by CI.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures such as session restarts, reconnects, and partial streams.

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server using JSON-RPC over stdio, serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and web adapters for shared runtime state. Connects to the server via WebSocket.
- `apps/mobile`: Upstream owned React Native lane. Keep mobile behavior upstream by default unless a later fork spec says otherwise.
- `packages/client-runtime`: Shared web and mobile runtime state for WebSocket transport, thread detail state, terminal state, VCS state, source control discovery, project path helpers, and remote environment clients.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only with no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports such as `@t3tools/shared/git` and no barrel index.

## Codex App Server

T3 Code is currently Codex-first. The server starts `codex app-server` using JSON-RPC over stdio per provider session, then streams structured events to the browser through WebSocket push messages.

How we use it in this codebase:

- Session startup/resume and turn lifecycle are brokered in `apps/server/src/codexAppServerManager.ts`.
- Provider dispatch and thread event logging are coordinated in `apps/server/src/providerManager.ts`.
- WebSocket server routes NativeApi methods in `apps/server/src/wsServer.ts`.
- Web app consumes orchestration domain events via WebSocket push on channel `orchestration.domainEvent`, with provider runtime activity projected into orchestration events server-side.

Docs:

- Codex App Server docs: https://developers.openai.com/codex/sdk/#app-server

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex
- Codex-Monitor, a Tauri feature-complete strong reference implementation: https://github.com/Dimillian/CodexMonitor

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Vendored Repositories

This project vendors external repositories under `.repos/` as read-only reference material for coding
agents.

- Prefer examples and patterns from the vendored source code over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- Manage vendored subtrees with `pnpm sync:repos`; use `pnpm sync:repos --repo <id>` to sync one
  configured repository.
- When updating a dependency with a configured vendored subtree, sync that subtree in the same change so
  `.repos/` matches the installed dependency version.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for
  examples of idiomatic usage, tests, module structure, and API design.
- When writing relay infrastructure code with Alchemy, inspect `.repos/alchemy-effect/` for examples of
  idiomatic usage, tests, module structure, and API design.
