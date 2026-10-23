# Ledger Format

The ledger is the durable control surface for the orchestrator. Keep it current after every worker result, review result, fix, gate run, and closeout decision.

## Required Sections

```markdown
# Implementation Ledger

Date:
Branch:
Commit Policy:
Objective:
Status:

## Objective Baseline

- requested outcome
- acceptance evidence
- explicit non goals
- applicable repository policies
- completion point

## Source Requirements

## Vertical Plan

## Parallel Work Slices

## Agent Strength Plan

| Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
| ---- | ----------------- | --------- | ------------------ | ------------------ |

## Requirement Coverage

| Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
| ----------- | ------ | ----------------------- | ------------- | ------------- | ----------------------- | ------ |

## Worktrees

| Slice | Worktree | Branch | Status | Integration Commit | Notes |
| ----- | -------- | ------ | ------ | ------------------ | ----- |

## Gate Evidence

| Gate | Command | Result | Evidence Date | Notes |
| ---- | ------- | ------ | ------------- | ----- |

## Commit Evidence

| Scope | Commit | Status | Notes |
| ----- | ------ | ------ | ----- |

## Commit Effects

### Delivery Scope

If applied, this commit ...

## Review Lanes

| Lane | Reviewer | Status | Findings | Notes |
| ---- | -------- | ------ | -------- | ----- |

## Blocking Findings

| ID  | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
| --- | ------ | -------- | ---- | ------------------------- | ------ | ---------- | ------------ |

## Deferred Findings

| ID  | Source | Observation | Objective Exclusion | Owner | Notes |
| --- | ------ | ----------- | ------------------- | ----- | ----- |

## Phase Notes

## Deliverable Closeout

## Closeout
```

## Status Values

Use these values:

- `planned`
- `in_progress`
- `blocked`
- `reviewing`
- `fixing`
- `verified`
- `closed`

## Finding Status Values

Use these values:

- `open`
- `needs_negotiation`
- `confirmed`
- `withdrawn`
- `fixed`
- `verified`

Do not close a blocking finding without either a fix commit and verification, or a withdrawal note from the reviewer. Record deferred findings without a fix commitment.

## Commit Gate

Closeout must record one of these outcomes:

- committed cleanly with commit ids
- no-commit exception with dirty files, reason, owner, and next action

Do not use passing tests as a substitute for commit evidence.

Before each commit, write one Commit Effects entry from the exact staged behavior. Begin with `If applied, this commit`. Describe only the behavior or durable repository capability introduced. Do not mention test results, review findings, workflow history, diff size, or the commit hash. Present the exact statement to the user at the commit point and include identical text in the ledger within that commit.

Use `If applied, the pending commit would` for a no-commit exception.

At vertical completion, write a Deliverable Closeout paragraph that states what the completed item provides. Keep gate and review evidence in their dedicated sections.
