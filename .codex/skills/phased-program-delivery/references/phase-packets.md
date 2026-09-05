# Phase Packets

Use packets to keep phase workers, reviewers, and fix workers bounded.

## Phase Vertical Packet

Each phase vertical packet must include:

- objective baseline with requested outcome, acceptance evidence, explicit non goals, and applicable policies
- objective baseline items advanced by the packet
- source phase text
- derived vertical scope
- explicit out-of-scope work
- dependencies already integrated
- dependencies still blocked
- owned write scope
- selected agent strength and rationale
- expected tests
- expected docs or examples
- gate commands when known
- commit expectation
- proposed commit effect beginning with `If applied, this commit`
- branch or worktree path
- reporting format

Worker instructions must say:

- use `solo-vertical-delivery`
- you are not alone in the codebase
- do not revert edits made by others
- stay within the owned write scope
- report the proposed commit effect, changed files, commit ids, gates, review findings, and risks
- stop and report if the phase requires a shared contract outside the packet

## Wave Review Packet

Each wave review packet must include:

- objective baseline
- original phased plan excerpt
- completed phase inventory for the wave
- integrated diff or commit range
- gate evidence
- commit evidence or no-commit exception
- Commit Effect entries for every reviewed program commit
- known exceptions
- architecture constraints
- selected agent strength and rationale
- review lane

Reviewers must not edit files. They return findings only.

Reviewers may mark a finding as blocking only when it prevents acceptance evidence or identifies an applicable policy violation. They must mark every other observation as deferred.

## Fix Packet

Each fix packet must include:

- finding id
- evidence for the finding
- objective baseline item or policy basis
- accepted fix scope
- files or modules owned by the fix worker
- selected agent strength and rationale
- gates to rerun
- proposed commit effect beginning with `If applied, this commit`
- constraints from the program ledger

Fix workers must report the exact changed files and commands run.

If a fix changes accepted implementation state, it must also report the fix commit id or the no-commit exception approved by the orchestrator.
