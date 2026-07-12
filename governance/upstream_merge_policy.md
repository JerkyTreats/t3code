# Origin Only Source Control Policy

Date: 2026-07-12
Status: active

## CRITICAL VIOLATION

**DO NOT WRITE TO UPSTREAM. ONLY ACCEPT ORIGIN.**

Any write to `upstream`, any pull request targeting `upstream`, or any integration of upstream code into an accepted branch is a critical policy violation.

There is no automated, delegated, or implied exception. Only a direct user decision that changes this policy can authorize different behavior.

## Authority

- User request wins over this policy.
- This policy governs every person, automation, coding agent, workflow, and source control integration used by this repository.
- `origin` is the only remote from which this repository accepts code or publishes changes.
- `upstream` is read only reference material and never an integration target.

## Allowed Upstream Access

Reading upstream is allowed when it remains read only from the upstream perspective.

- inspect remote configuration, refs, commits, tags, and files
- fetch upstream refs for local comparison
- compare upstream history or content against local and origin history
- use upstream material for analysis without copying, replaying, merging, rebasing, cherry-picking, or otherwise accepting it into this repository

Read access must not create a commit, branch, pull request, release, tag, workflow mutation, or any other upstream-side state change.

## Prohibited Upstream Actions

Never do any of the following against or from `upstream`:

- push, force push, delete a ref, create a ref, tag, release, or workflow dispatch
- open, update, merge, close, approve, label, comment on, or otherwise mutate a pull request or issue
- merge, rebase, cherry-pick, reset, checkout, replay, port, or rebuild from upstream code into an accepted branch
- use upstream as the base or head repository for a pull request
- treat upstream code as a default base, default intake lane, or accepted product dependency

## Origin Only Workflow

- Create, commit, publish, review, and merge changes only through `origin`.
- Before every push, pull request, or repository mutation, verify that the target remote and repository are `origin`.
- Reject any generated command, automation configuration, or code path that could write to `upstream` or integrate upstream content.
- When a task mentions upstream, limit work to read-only inspection unless the user explicitly changes this policy.

## Enforcement

Treat a violation as a release-blocking security and governance incident.

- Stop the action before any remote mutation occurs.
- Do not retry the action with a different command or credential.
- Report the attempted target, command, and whether any external state changed.
- Require a direct user decision before continuing.
