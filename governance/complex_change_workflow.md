# Complex Change Workflow Governance

Date: 2026-03-07
Status: active
Scope: user triggered workflow for complex requests

## Purpose

Define one optional workflow for changes that benefit from phased execution, dependency tracking, and explicit verification gates.

This workflow is opt in and not the default path for routine requests.

## Activation

Workflow activation requires explicit user intent.

Activation paths:

- the user requests complex workflow mode
- the agent recommends complex workflow mode and the user confirms

Without explicit user confirmation, work stays on the default workflow path.

## CI Enforcement

CI ignores this workflow.

Non enforcement rules:

- CI does not require workflow artifacts
- CI does not block merges for missing workflow metadata
- workflow compliance is an author and reviewer agreement, not an automation gate

## Required Artifact When Active

When this workflow is active, create and maintain one plan document under `.plans/`.

Required plan structure:

- overview with objective and intended outcome
- scope boundaries and exclusions
- ordered phases or slices
- exit criteria and verification gates
- implementation order summary
- risks and open questions

## Branch and Commit Model When Active

Branch model:

- one feature branch for the full plan scope
- optional short lived helper branches for parallel execution

Commit model:

- each phase or slice should land as one atomic commit by default
- tiny coupled plan updates may share a runtime commit when splitting adds little value
- mixed runtime and plan updates should keep the runtime focused commit type and mention plan impact in the body

## Completion Tracking

- Update task status in the active plan as work lands.
- Record verification evidence for each completed phase.
- Note unresolved risks before closing the plan.

## Deactivation

This workflow deactivates when either condition is true:

- the user requests return to the default workflow
- the scoped complex work is complete and closed out in the plan
