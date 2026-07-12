# Commit Policy

Date: 2026-03-07
Status: active

## Intent

Define commit message and scoping rules for this repository.

## Conventional Commit Use

Use conventional commits when instructed to commit.

Approved commit `type` values:

- `feat`
- `fix`
- `perf`
- `refactor`
- `docs`
- `design`
- `test`
- `build`
- `ci`
- `chore`
- `policy`

## Scope Rules

- Keep each commit focused on one behavior change, one refactor seam, or one policy update.
- Avoid mixing unrelated runtime, design, and policy work in the same commit.
- When a change spans server, web, desktop, and contracts for one feature, one commit is acceptable if the diff is still atomic.
- If a change includes large mechanical cleanup plus behavior changes, split the mechanical work first when practical.

## Type Selection

- Use `design` for changes under `.plans/` and for architecture or workflow docs that define future implementation work.
- Use `docs` for user facing docs and operator docs.
- Use `policy` for repository governance updates such as standards, process rules, and workflow enforcement changes.
- When one commit mixes design docs with runtime code changes, keep the runtime focused type and describe design impact in the body.

## Policy Commit Trace

For `policy` commits include at least one governance trace footer such as:

- `Policy-Ref: governance/commit_policy.md`
- `Policy-Ref: AGENTS.md`
- `Discussion: user request on 2026-03-07`

## Breaking Change Rules

- Backward incompatible changes must use `type!:` or `type(scope)!:`.
- Add a `BREAKING CHANGE:` footer with a concise migration note.
- Call out protocol, storage, state, or user visible impact before commit.

## Subject Rules

- Write the subject as a declarative summary of what changed.
- Describe concrete behavior or ownership changes, not process state.
- Do not use phase labels or milestone labels in the subject.
- Prefer `type(scope): summary`.

Examples:

- `feat(desktop): attach Omarchy screenshots to the active draft`
- `refactor(web): split chat screenshot attach flow from paste handling`
- `policy(governance): add commit and compatibility rules`
- `refactor(protocol)!: remove legacy thread attachment payload`

## Push Guard

Verify with the user before push unless the user explicitly asked for the push in the current request.

## CRITICAL ORIGIN ONLY GUARD

**DO NOT WRITE TO UPSTREAM. ONLY ACCEPT ORIGIN.**

- Treat `upstream` as read only reference material. Read and comparison operations are allowed only under the [Origin Only Source Control Policy](upstream_merge_policy.md).
- Never push, open a pull request, publish a branch, create a release, or mutate repository state against `upstream`.
- Never merge, rebase, cherry-pick, replay, or otherwise accept upstream code into an origin branch.
- Before every source control mutation, verify that `origin` is the only remote and repository target.
- Stop and report any command or automation that selects `upstream` as an integration or write target.
