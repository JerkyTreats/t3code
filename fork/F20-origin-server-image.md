# F20 Origin Server Image

Date: 2026-08-16
Status: active

## Intent

Build and verify a standalone non-root server image, then permit publication only to the exact origin GHCR namespace from exact origin main.

## Required Behavior

- The production image contains the current server, bundled web client, and the pinned default Codex provider runtime.
- The runtime uses Node.js 24 on Debian Bookworm, runs as a non-root user, and exposes explicit data and workspace volumes.
- The server starts in headless mode as a non-root user and remains compatible with a read-only root filesystem when private temporary, data, and workspace mounts are supplied.
- Build context recursively excludes repository metadata, private configuration, environment files, package manager configuration, agent directories, runtime state, local plans, ledgers, skills, vendored references, build outputs, and dependency trees at any depth.
- One locally built image is the exact image that receives runtime smoke coverage and later publication tags.
- Published metadata includes an SBOM, maximum provenance, the full source revision, a unique build tag, and the moving main tag.
- Publication authority exists only in the dedicated image job for exact `JerkyTreats/t3code` main.
- The only allowed image namespace is `ghcr.io/jerkytreats/t3code-server`.
- Registry login and publication happen only after local policy and runtime smoke checks pass.
- The source server is private workspace software. It exposes no npm-backed T3 service installation or self-update path.
- Image replacement is the supported update model for an image deployment.

## Protected Decisions

| Decision | Required behavior                                                                                                                                                                     | Owner and evidence                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| F20.D1   | Publish only the locally verified candidate to the exact-origin image namespace from exact-origin main                                                                                | Image workflow and workflow safety proofs                                  |
| F20.D2   | Run the pinned server and provider image as a non-root user with explicit writable data and workspace boundaries                                                                      | Dockerfile contract and image smoke orchestration proofs                   |
| F20.D3   | Report `desktop-managed` update capability only when the desktop shell owns the server; every headless and operator-managed runtime reports no in-app update capability               | `officialRuntimeUpdatePolicy.ts` and direct headless update rejection      |
| F20.D4   | Replace headless runtimes through an authorized source deployment or exact-origin image replacement; never download, install, launch, or re-resolve T3 from a public package registry | `invocation.ts`, runtime update adapters, and non-registry guidance proofs |

## Current Owners

- `docker/t3code-server.Dockerfile`
- `.dockerignore`
- `.github/workflows/build-t3code-server-image.yml`
- `scripts/server-image-smoke.ts`
- `scripts/lib/server-image-workflow-safety.ts`
- `scripts/lib/release-workflow-safety.ts`
- `apps/server/src/fork/officialRuntimeUpdatePolicy.ts`
- `apps/server/src/cli/invocation.ts`

The web `runtimeUpdateGuidance.ts` owner permits only desktop-controlled update capability. `versionSkew.ts` and `ServerUpdateAction.tsx` adapt it to current version comparison and presentation. Headless and legacy service descriptors show deployment-manager guidance. Onboarding commands use the already-installed runtime and never invoke a public package runner. The server workspace build CLI has no package publication subcommand.

Reconnect presentation uses that same owner: only idle desktop-managed runtimes may infer a lost update from a reconnect with version mismatch. Headless and legacy descriptors retain ordinary reconnect and manual update guidance. An actual running update retains its progress even if its capability descriptor disappears during reconnect; failed updates retain their failure and retry presentation.

## Upstream Substrate

- current server build and headless serve command
- bundled production web client
- server state and workspace path contracts
- default Codex provider settings
- pnpm frozen dependency graph

## Non Ownership Boundaries

- F20 does not authorize publication from a fork, tag, pull request, or non-main branch.
- F20 does not publish to an upstream namespace.
- F20 does not restore inherited npm, AUR, relay, preview, mobile, or release publication workflows.
- F20 does not fetch or install a replacement T3 runtime from a public package registry.
- F20 does not offer headless self-update capability or public package-runner launch guidance.
- F20 does not store credentials in the image or Docker build context.
- Local image smoke performs no registry login or push.

## Verification

- Workflow tests prove exact repository, ref, namespace, permissions, immutable action revisions, tag, provenance, SBOM, dependency bootstrap, and verification order.
- Dockerfile tests parse the executable instruction contract and reject unsafe extra build or runtime instructions.
- Context tests use the bounded Docker pattern forms accepted by the safety scanner to prove nested environment files, package manager configuration, agent directories, and local T3 state are excluded while representative build inputs remain included, including root `package.json` and `pnpm-workspace.yaml`. They also reject server userdata inclusion, unsupported pattern forms, and every negation rule.
- Runtime smoke proves HTTP readiness, non-root execution, default provider availability, state creation, writable volumes, read-only root compatibility, and residue-free cleanup.
- Signal tests prove bounded cleanup after interruption.
- Release scanning rejects every unapproved write permission, trigger, reusable workflow, action, command surface, credential, and upstream target.
- Runtime update tests prove the desktop-managed-or-null policy and reject direct headless update and commit paths.
- Invocation tests prove public package-runner caches are reused only through the quoted current executable and entry.

## Current Evidence

Source tests cover the exact Dockerfile instruction contract, Docker-compatible recursive protected-context matching, required build-input inclusion, exact-origin workflow authority, immutable actions, build-once promotion order, provenance, SBOM, cleanup, mocked runtime command orchestration, desktop-managed-or-null update policy, direct headless update rejection, and non-registry CLI guidance.

An actual image build, HTTP startup, non-root identity, pinned provider availability, read-only root operation, writable mounts, signal handling, and residue-free cleanup remain pending in the integrated runtime gate. No image has been launched or published by this source replay.

## Reconciliation Rule

Accept upstream server and web build inputs. Preserve the exact-origin publication boundary, build-once promotion, non-root runtime, provider availability, private build context, and local smoke.
