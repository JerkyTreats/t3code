# Privacy And Publication Policy

Date: 2026-08-02
Status: active

## Intent

Minimize data published by this repository while preserving enough public evidence to review product behavior and repository history.

Alignment here means procedural coordination around shared repository constraints. It does not claim moral authority, universal consensus, human identity, or inherent safety. Repository content must still be reviewed before execution.

## Scope

This policy governs repository content, generated artifacts, issue and change request text, release material, logs, screenshots, agent output, and other information prepared for public disclosure.

It applies to people, automation, coding agents, workflows, and integrations acting for this repository.

## Data Minimization

- Publish only information necessary to understand, build, test, operate, or audit public product behavior.
- Prefer behavior evidence over identity, access, device, network, or account evidence.
- Do not collect or expose protected data merely because a tool can retrieve it.
- Keep private access reviews private. Public reports may state only that an authorized review occurred and whether the declared policy passed.
- Do not publish counts or descriptions that reveal or support inference of contributor topology.

## Protected Data

Do not publish, request for public reporting, correlate, or infer:

- collaborator lists, team membership, access roles, pending invitations, access counts, or contributor topology
- relationships among people, accounts, organizations, credentials, devices, or private services
- claims that a public account maps to one person or is the only party able to contribute
- personal names, personal email addresses, private account identifiers, or other personal information unless intentional public attribution is strictly required
- local usernames, home directories, absolute user paths, worktree locations, device identifiers, or local process details
- private hostnames, internal DNS names, IP addresses, service routes, or private repository links
- credentials, tokens, cookies, session identifiers, keys, authorization headers, secrets, credential locations, or secret-derived values

Never use local device data, filesystem ownership, Git configuration, cached credentials, environment state, or private access output to make public claims about identity or contributor access.

## Neutral Examples

- Use neutral placeholders in documentation, plans, fixtures, logs, and screenshots.
- Use values such as `/workspace/project`, `user@example.test`, `service.example.test`, and `example/repository`.
- Do not preserve a real value merely to make an example appear realistic.
- Keep test-only secret examples obviously synthetic and scoped to the behavior under test.

## Agent Clone Authorization

- An agent must not clone this repository or any linked repository without explicit user authorization.
- Authorization must identify the exact source and intended destination.
- Public availability, a repository link, read access, or a general request to inspect does not authorize cloning.
- Before cloning, verify the source and destination with the user and describe material local effects.
- Keep the authorized destination private unless the user explicitly approves its publication.

## Public Provenance Limits

- Public provenance may cite public repository metadata, commits, change requests, releases, licenses, and intentional public attribution.
- State only the narrow claim directly supported by the cited public record.
- Distinguish repository namespace ownership, account attribution, commit authorship, change request authorship, collaborator access, and human identity.
- Public commit or contributor history does not prove current write access, exclusive access, account control, or human identity.
- Absence from a public record does not prove absence of access or participation.
- Never describe public evidence as proving that a named account is one person or the only party able to contribute.
- Link to protected fork behavior and public provenance without linking to private access surfaces or inferred relationships.

## Publication Review

Before committing or publishing changed content:

- inspect the changed tracked files for protected data
- scan for absolute user paths, personal email addresses, private hostnames, credential patterns, private URLs, and identity correlations
- replace sensitive examples with neutral placeholders
- verify that provenance claims match cited public evidence and do not imply access or identity
- verify that generated output, logs, screenshots, and attachments follow the same rules

If protected data is found, stop publication and report only the affected file and data category. Do not repeat the protected value in the report.

## Disclosure Response

- Remove exposed protected data from the current change or current repository tip.
- Rotate or revoke affected credentials through an authorized private process.
- Do not publish the protected value while describing remediation.
- Treat repository history rewriting as a separate destructive decision requiring explicit user authorization.
- Do not claim that deletion removes copies from forks, caches, archives, or existing clones.

## Exceptions

A user may authorize a narrowly scoped disclosure after reviewing the exact field, purpose, destination, and risk. Publish no more than the authorized minimum.

This exception process does not authorize disclosure of credentials or private access output and does not override the [Upstream Reconciliation And Origin Publication Policy](upstream_merge_policy.md).

## Proposal Trace

- Proposal evaluation completed on 2026-08-02.
- Strengths, weaknesses, tradeoffs, project fit, public evidence limits, and a recommendation were provided before editing.
- User continuation confirmation on 2026-08-02 authorized this privacy governance proposal.
- README changes remain outside this policy change.
