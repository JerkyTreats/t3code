# Upstream intake 2026-10-23

Date: 2026-10-23
Branch: `intake/upstream-20261023`
Status: verified source and staging runtime; origin publication and production activation are separate decisions
Commit policy: [repository commit policy](../governance/commit_policy.md)

Delivery uses the repository-local [solo vertical delivery workflow](../.codex/skills/solo-vertical-delivery/SKILL.md) and its [ledger format](../.codex/skills/solo-vertical-delivery/references/ledger.md). [F18](../fork/F18-protected-onboarding-and-workstream-ledgers.md) owns this implementation record; [F19](../fork/F19-repository-delivery-skills-and-commit-effects.md) owns the workflow link and Commit Effects. Temporary lane packets, the immutable comparison baseline and review scratch stay untracked and create no product requirements.

## Objective baseline

Take upstream main through the pinned target onto the fork and preserve every protected fork outcome. Acceptance requires decision-level preservation evidence, the full repository gates and a staging runtime check. Upstream remains read-only and origin is the only publication target. No publication or production activation is part of this record.

## Source requirements

| Source boundary      | Exact revision                             |
| -------------------- | ------------------------------------------ |
| Accepted origin main | `7d3406a7ef86cc4964e9023cc061b1c3bdce0074` |
| Upstream target      | `9828cad49f3e1ef4f9e037b3baaca19f4e4928fc` |
| Merge base           | `42da166d131017335a1158d0b379dd68b8985796` |

[The patch guide](../patch.md) selects preserved outcomes. The [intake policy](../governance/upstream_merge_policy.md), [isolation policy](../governance/fork_isolation_policy.md), [compatibility policy](../governance/compatibility_policy.md) and [privacy policy](../governance/privacy_and_publication_policy.md) control their treatment. A trial merge produced 329 conflicted paths, 610 text hunks and 63 modify/delete units. The immutable baseline froze 19 concerns, 117 decisions and 34 new upstream risk items before replay.

## Integration decisions

The selected workflow is base rebuild and replay. Upstream decomposed the chat view, composer, timeline and sidebar and removed the GitHub host that carried exact-origin guards, so lane analysis favored replay over merge and repair. The integration branch starts at upstream, carries the 419 paths only the fork changed, and replays the 496 paths both sides changed through four ownership lanes: foundation, exact origin, release and desktop, and client.

User decisions on 2026-10-23:

- F22 accepts the upstream `pele` renderer. The `mermaid` dependency, render serialization (F22.D3) and per-surface identity (F22.D4) retire; visibility-gated mounting and the bounded height cache are rebuilt on pele.
- F06 origin-only extends to new upstream paths: new-thread base fetch, remote-qualified and per-branch PR bases, Forgejo branch deletion and MCP linking of foreign PR URLs.
- `t3 doctor` keeps the legacy database; upstream's deletion is removed.
- F17 portal-issued pairing issues upstream's standard client scopes, which now include access and relay management. Ordinary pairing receives the same widened set. Containment is the portal lifecycle.
- A Node 26 server image build and runtime smoke must pass before any image publication.

Upstream migrations 63 through 68 continue at fork identities 87 through 92 after fork 86. A runtime built before 87 refuses to reopen an advanced journal.

## Preservation gate and repairs

Independent reviewers checked 114 decisions against the integrated source: 87 passed, none failed and 27 had missing or weak evidence; 33 of 34 risk items were resolved. Repairs restored the evidence and fixed the defects the restored tests exposed:

| Finding                                   | Resolution                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Connection record before admission        | `client.connected` and owners recorded once, after WebSocket admission                             |
| Unverified pnpm in the image workflow     | Checksum-verified pnpm shared with the Dockerfile; the safety scanner rejects package launchers    |
| Marker-like text before a context block   | Legacy blocks open on their own line, so earlier marker-like text stays authored                   |
| Approval feedback blocked by Poteto       | Approval feedback bypasses Poteto injection and validation                                         |
| Stale Poteto error                        | Turning Poteto off clears its unavailable-skill error                                              |
| Silent image preparation failure          | A failed preparation reports its error while the attachment holds its slot                         |
| Git 2.56 dangling worktree wording        | Storage cleanup recognizes the new message and keeps the worktree                                  |
| Evidence lost with upstream-deleted tests | Origin, Mermaid, timeline context, composer controls, screenshot, launcher and nested badge suites |

Remaining limits: the mobile card-row badge placement and the core pele import retry are proven by source reading only, and SwiftLint is unavailable on the Linux host.

## Gate evidence

`pnpm fmt`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm lint:mobile` pass on the integrated source. Kotlin static analysis ran with ktlint and detekt supplied for the run. Staging ran the integrated source on Node 26.12.1, applied migrations 87 through 92 after a verified database backup, served the development client over HTTPS with a live HMR connection, and left production unchanged.

## Commit Effects

If applied, this commit lands upstream T3 Code through 9828cad49f on the fork with every protected fork outcome preserved, the user's intake decisions recorded, and origin main fast-forwarding without rewriting history.

Production activation requires a stopped-service backup of the active database because migrations 87 through 92 advance the journal. Origin publication and installed-client updates are separate decisions.
