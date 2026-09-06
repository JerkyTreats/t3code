# F01 Exact Origin Desktop Release

Date: 2026-08-16
Status: active

## Intent

Retain upstream T3 Code product identity while binding official desktop updates and Linux release artifacts to the exact origin repository.

## Required Behavior

- Visible product naming, application identity, and ordinary packaging remain upstream owned.
- Official desktop update metadata names only `JerkyTreats/t3code`.
- Desktop release links resolve only to `JerkyTreats/t3code`.
- An official Linux release contains exactly one final AppImage and one versioned descriptor for that artifact.
- The descriptor binds the artifact filename, SHA-256 digest, version, full commit hash, architecture, product application identifier, and updater repository.
- Production descriptors reject any updater repository other than the exact origin repository.
- The Linux installer verifies the descriptor and artifact bytes before any managed destination is changed.
- Artifact validation extracts the AppImage, verifies embedded package and updater identity, installs into isolated user directories, and requires exact launcher readiness.
- Validation workflows run only for exact origin main, use read-only authority, persist no checkout credential, and publish no artifact.
- General CI persists no checkout credential, consumes no repository token directly, and resolves conditional mobile checks from a credential-free local Git diff.
- Packaged desktop SSH uses a compatible preinstalled remote `t3` runtime or an explicit development entry and never downloads T3 Code from a public package registry.
- Triage playbook, source, release, and issue guidance resolves only to exact origin.
- Diagnostic source clones require explicit permission for the exact source and destination, and triage never deletes or replaces source-cache entries automatically.
- CLI follow-up guidance uses an authorized installed runtime or the quoted current executable and entry without resolving T3 from a public package registry.

## Protected Decisions

| Decision | Required behavior                                                                                                                    | Durable owner and evidence                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| F01.D1   | Official desktop repository selection, release history, and version links resolve only to exact origin                               | `packages/shared/src/forkReleaseIdentity.ts`; direct owner and replacement-host tests                                 |
| F01.D2   | A production Linux descriptor binds one physical AppImage to exact release identity and rejects another updater repository           | `scripts/linux-desktop-release-artifact.ts`; descriptor and artifact smoke tests                                      |
| F01.D3   | Remote SSH launch uses an explicit development entry or a preinstalled `t3` executable and fails without public-registry acquisition | `packages/ssh/src/officialRuntimeAcquisition.ts`; direct missing-runtime execution and replacement-host process tests |
| F01.D4   | Desktop and image validation remain read-only until a separately authorized exact-origin publication action                          | `scripts/lib/release-workflow-safety.ts`; full workflow safety scan                                                   |

## Durable Owners

- `packages/shared/src/forkReleaseIdentity.ts`
- `scripts/linux-desktop-release-artifact.ts`
- `packages/ssh/src/officialRuntimeAcquisition.ts`
- `scripts/lib/release-workflow-safety.ts`

## Upstream Sensitive Adapters

- `scripts/build-desktop-artifact.ts`
- `scripts/desktop-artifact-smoke.ts`
- `scripts/install-linux-desktop.mjs`
- `apps/desktop/scripts/smoke-test.mjs`
- `apps/desktop/src/main.ts`
- `packages/ssh/src/tunnel.ts`
- `apps/web/src/components/desktopUpdate.logic.ts`
- `apps/marketing/src/lib/site.ts`
- `apps/marketing/src/lib/releases.ts`
- `apps/server/src/cli/triagePrompt.ts`
- `.github/triage/PLAYBOOK.md`
- `CONTRIBUTING.md`
- `.github/ISSUE_TEMPLATE`
- `.github/workflows/desktop-artifact-validation.yml`

## Upstream Substrate

- T3 Code visible product name and desktop application identifier
- Electron Builder packaging
- desktop update service
- packaged server and web assets
- Clerk single-instance ownership

## Non Ownership Boundaries

- F01 does not rename the upstream product or create a second application identity.
- F01 does not publish releases, packages, artifacts, or update metadata during validation.
- F01 does not authorize a workflow dispatch or any remote mutation.
- F01 does not replace the F16 launcher state machine or installer path-safety contract.
- F01 does not own SSH transport, remote Node discovery, port selection, readiness, or process supervision mechanics.

## Verification

- Build tests reject a non-origin updater repository and multiple final AppImages.
- Portable identity tests execute repository and release-link decisions through a replacement build and presentation host.
- Descriptor tests cover identity fields, full commit binding, checksum drift, architecture, and symlink rejection. A producer-to-consumer build test resolves the actual full Git revision and writes and verifies the production descriptor.
- Installer tests prove descriptor verification occurs before managed writes.
- Artifact smoke verifies extraction identity, exact updater metadata, isolated installation, launcher manifest compatibility, readiness, early exit, and bounded cleanup.
- Runtime acquisition tests execute the exact missing-runtime failure without the SSH tunnel host and reject every public-registry fallback.
- Replacement-host runner tests execute preinstalled and explicit-entry paths while preserving child process ownership and graceful shutdown.
- SSH tunnel integration tests retain current Node discovery and inject the owner-produced runner into launch and pairing mechanics.
- Marketing and contributor surface scans reject non-origin repository, release, download, source, issue, and contribution targets.
- Triage tests require exact-origin playbook, source, and issue targets, explicit clone authorization, and source-cache preservation.
- Invocation tests prove package-runner cache launches produce quoted direct commands without another public package resolution.
- Workflow scanning rejects upstream targets, publication authority, credentials, unsafe triggers, and unapproved workflow actions.
- Workflow scanning accepts the exact read-only CI commands and multiline scripts only by reviewed source or content digest.

## Current Evidence

Source tests cover the portable identity owner, descriptor contract, no-follow reads, byte verification before managed writes, installer and launcher decisions, exact release links, SSH runtime acquisition owner, replacement-host execution, triage routing, explicit clone authorization, safe CLI guidance, and workflow authority. Mocked artifact smoke covers extraction metadata, isolated paths, readiness, early exit, and bounded cleanup.

An actual AppImage build, extraction, isolated installation, launcher readiness, and independent-client acceptance remain pending under the S6 installed Linux verification lane. The source replay does not claim that runtime evidence.

## Reconciliation Rule

Accept upstream product identity, packaging mechanics, SSH transport, Node discovery, readiness, and process supervision. Preserve the portable exact-origin identity owner, descriptor binding, no-registry runtime acquisition owner, isolated artifact smoke, and validation-only workflow.
