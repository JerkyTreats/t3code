# F19 Repository Delivery Skills And Commit Effects

Date: 2026-08-03
Status: active

## Intent

Keep the workflows that define top-level workstream ledgers available inside the repository and close each delivery commit with a concise statement of its applied behavior.

## Required Behavior

- Repository-local copies of phased program delivery and solo vertical delivery live under `.codex/skills`.
- Workstream ledgers link to the repository-local workflow copy that defines their structure.
- A delivery workflow update changes its repository-local copy in the same program change.
- Immediately before a delivery commit, the exact staged behavior is summarized in its ledger.
- The exact summary is presented to the user at the commit point.
- Each summary begins with `If applied, this commit`.
- Each summary describes user-visible, operator-visible, or durable repository behavior.
- A summary excludes test results, review findings, workflow narration, diff statistics, and commit hashes.
- Identical summary text is included in the ledger within the commit it describes.
- A no-commit exception uses `If applied, the pending commit would` and remains attached to the exception.
- Program closeout states the behavior provided by every completed deliverable in product language.
- Repository-local skill files and ledgers use public-safe paths and never record private topology or personal information.

## Owner Modules

- `.codex/skills/phased-program-delivery/`
- `.codex/skills/solo-vertical-delivery/`
- `.ledger/`

## Fork Seams

- repository-local delivery workflow snapshots
- commit effect ledger entries
- product-language program closeout

## Upstream Reconciliation Notes

- Restore repository-local delivery skills before resuming `.ledger` managed workstreams.
- Preserve the exact commit effect sentence contract.
- Keep verification and review evidence separate from human-readable commit effects.
- Update ledger workflow links to the restored repository-local skill paths.

## Upstream Reconciliation Rule

- Preserve repository-local delivery workflows and commit-effect semantics while accepting unrelated upstream automation changes.
- Override upstream process changes that remove the required user-facing effect summary or durable ledger record.

## Verification

- Both repository-local skill folders pass skill validation.
- The solo ledger scaffold contains Commit Effects and Deliverable Closeout sections.
- Skill copies contain the same commit effect contract as their maintained source copies.
- Active program ledger workflow links resolve to repository-local skill files.
- Historical ledgers may preserve a non-workflow skill reference as execution evidence when clearly marked historical.
- Markdown and privacy scans reject private topology and personal data.

## Compatibility Checks

- Existing gate, review, and commit evidence remains in its dedicated ledger sections.
- No runtime application behavior or persisted application state changes.
- Skills remain usable from their normal installed locations.
