#!/usr/bin/env python3
"""Deterministic helpers for solo vertical delivery.

The script does not call Codex subagent tools. It only scaffolds ledgers,
review packets, worker packets, and gate command lists so the orchestrator can
run a consistent workflow.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from textwrap import dedent


DEFAULT_GATES = [
    ("acceptance evidence", "<objective proof command>"),
    ("commit gate", "git status --short && git log -1 --oneline"),
]


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise SystemExit(f"refusing to overwrite existing file: {path}")
    path.write_text(content, encoding="utf-8")


def init_ledger(args: argparse.Namespace) -> None:
    path = Path(args.path)
    content = dedent(
        f"""\
        # Implementation Ledger

        Date:
        Branch: {args.branch}
        Commit Policy:
        Objective: {args.objective}
        Status: planned

        ## Objective Baseline

        - requested outcome: {args.objective}
        - acceptance evidence: {args.acceptance_evidence}
        - explicit non goals: {args.non_goals}
        - applicable repository policies: {args.policies}
        - completion point: acceptance evidence passes with applicable policy checks

        ## Source Requirements

        ## Vertical Plan

        ## Parallel Work Slices

        ## Agent Strength Plan

        | Lane | Selected Strength | Rationale | Selector Available | Escalation Trigger |
        | --- | --- | --- | --- | --- |

        ## Requirement Coverage

        | Requirement | Source | Implementation Evidence | Test Evidence | Fuzz Evidence | Comment Or Doc Evidence | Status |
        | --- | --- | --- | --- | --- | --- | --- |

        ## Worktrees

        | Slice | Worktree | Branch | Status | Integration Commit | Notes |
        | --- | --- | --- | --- | --- | --- |

        ## Gate Evidence

        | Gate | Command | Result | Evidence Date | Notes |
        | --- | --- | --- | --- | --- |

        ## Commit Evidence

        | Scope | Commit | Status | Notes |
        | --- | --- | --- | --- |

        ## Commit Effects

        ### Delivery Scope

        If applied, this commit ...

        ## Review Lanes

        | Lane | Reviewer | Status | Findings | Notes |
        | --- | --- | --- | --- | --- |

        ## Blocking Findings

        | ID | Source | Severity | File | Objective Or Policy Basis | Status | Fix Commit | Verification |
        | --- | --- | --- | --- | --- | --- | --- | --- |

        ## Deferred Findings

        | ID | Source | Observation | Objective Exclusion | Owner | Notes |
        | --- | --- | --- | --- | --- |

        ## Phase Notes

        ## Deliverable Closeout

        ## Closeout
        """
    )
    write_file(path, content)
    print(path)


def worker_packet(args: argparse.Namespace) -> None:
    print(
        dedent(
            f"""\
            Objective:
            {args.objective}

            Acceptance evidence:
            {args.acceptance_evidence}

            Explicit non goals:
            {args.non_goals}

            Applicable policies:
            {args.policies}

            Worktree:
            {args.worktree}

            Write scope:
            {args.write_scope}

            Read scope:
            {args.read_scope}

            Requirement sources:
            {args.requirements}

            Selected agent strength:

            Strength rationale:

            Tasks:

            Required tests when selected:

            Required fuzz when selected:

            Required comments when selected:

            Required examples or docs when selected:

            Commit expectation:

            Proposed commit effect:
            If applied, this commit ...

            Forbidden changes:
            {args.forbidden}

            You are not alone in the codebase. Do not revert edits made by others. Stay inside the write scope unless blocked. If blocked, stop and report the blocker.

            Final response must include summary, a proposed commit effect beginning with `If applied, this commit`, changed files, commit ids or no-commit exception, commands run, tests added or changed, comments or docs added, and risks.
            """
        )
    )


def review_packet(args: argparse.Namespace) -> None:
    print(
        dedent(
            f"""\
            Review lane:
            {args.lane}

            Objective:
            {args.objective}

            Acceptance evidence:
            {args.acceptance_evidence}

            Explicit non goals:
            {args.non_goals}

            Applicable policies:
            {args.policies}

            Repository path:
            {args.repo}

            Commit range or diff source:
            {args.diff}

            Changed files:
            {args.changed_files}

            Requirement sources:
            {args.requirements}

            Gate evidence:
            {args.gates}

            Commit evidence:
            <commit ids or no-commit exception>

            Selected agent strength:

            Strength rationale:

            Review rules:
            - do not edit files
            - return findings only
            - order findings by severity
            - include file and line references where useful
            - state when no issues are found
            - mark a finding as blocking only when it prevents acceptance evidence or identifies an applicable policy violation
            - mark every other observation as deferred

            Focus questions:
            {args.focus}
            """
        )
    )


def list_gates(_: argparse.Namespace) -> None:
    for name, command in DEFAULT_GATES:
        print(f"{name}: {command}")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    init = sub.add_parser("init-ledger")
    init.add_argument("--path", required=True)
    init.add_argument("--objective", required=True)
    init.add_argument("--acceptance-evidence", required=True)
    init.add_argument("--non-goals", required=True)
    init.add_argument("--policies", required=True)
    init.add_argument("--branch", required=True)
    init.set_defaults(func=init_ledger)

    worker = sub.add_parser("worker-packet")
    worker.add_argument("--objective", required=True)
    worker.add_argument("--acceptance-evidence", required=True)
    worker.add_argument("--non-goals", required=True)
    worker.add_argument("--policies", required=True)
    worker.add_argument("--worktree", required=True)
    worker.add_argument("--write-scope", required=True)
    worker.add_argument("--read-scope", default="repository")
    worker.add_argument("--requirements", default="see ledger")
    worker.add_argument("--forbidden", default="out of scope edits")
    worker.set_defaults(func=worker_packet)

    review = sub.add_parser("review-packet")
    review.add_argument("--lane", required=True)
    review.add_argument("--objective", required=True)
    review.add_argument("--acceptance-evidence", required=True)
    review.add_argument("--non-goals", required=True)
    review.add_argument("--policies", required=True)
    review.add_argument("--repo", required=True)
    review.add_argument("--diff", required=True)
    review.add_argument("--changed-files", default="see git diff")
    review.add_argument("--requirements", default="see ledger")
    review.add_argument("--gates", default="see ledger")
    review.add_argument("--focus", default="objective coverage and applicable policy violations")
    review.set_defaults(func=review_packet)

    gates = sub.add_parser("list-gates")
    gates.set_defaults(func=list_gates)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
