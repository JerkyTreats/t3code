# Release validation and exact-origin artifacts

> For maintainers. Using T3 Code? See [docs/user](../user/).

This repository binds official artifacts, update metadata, source links, and
publication targets to the exact origin repository `JerkyTreats/t3code`.
Upstream remains a read-only reconciliation source.

This runbook describes the workflows present in the repository. It does not
authorize a workflow dispatch, tag, release, package publication, image
publication, or any other remote mutation.

## Active workflows

| Workflow                                            | Current responsibility                                                                  | Remote effect                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `.github/workflows/ci.yml`                          | Runs checks, tests, builds, and release-authority scanning                              | Uploads workflow artifacts only                       |
| `.github/workflows/desktop-artifact-validation.yml` | Builds and smokes one unsigned Linux AppImage and its descriptor on exact-origin `main` | None                                                  |
| `.github/workflows/build-t3code-server-image.yml`   | Builds, smokes, and promotes the exact-origin server image from exact-origin `main`     | Publishes only to `ghcr.io/jerkytreats/t3code-server` |
| `.github/workflows/mobile-showcase-screenshots.yml` | Produces mobile showcase screenshots after manual dispatch                              | Uploads workflow artifacts only                       |

There is no active `.github/workflows/release.yml`. The current repository does
not publish a T3 Code CLI package to npm, create stable or nightly desktop
GitHub Releases, deploy a hosted web release, or push release version commits.
Do not follow inherited instructions that depend on those retired jobs.

## Global release authority check

Run the policy scanner before reviewing any workflow or artifact change:

```sh
node scripts/lib/release-workflow-safety.ts
```

The scanner requires exact-origin targets, rejects upstream publication, rejects
public package publication, and allows only the reviewed server-image mutation
workflow. General CI and desktop artifact validation remain read-only.

Changing the scanner or a protected workflow is a source change. Run the
repository gates and focused workflow tests before delivery.

## Desktop artifact validation

The desktop validation workflow runs only for the exact origin repository on
`main` when desktop artifact inputs change. It performs these steps:

1. Checks out source without persisting a checkout credential.
2. Runs the release-authority scanner.
3. Builds one unsigned Linux `x64` AppImage.
4. Requires one adjacent `.AppImage.release.json` descriptor.
5. Smokes the exact artifact and descriptor together.

The descriptor binds the artifact filename, SHA-256 digest, version, commit,
architecture, product application identifier, and exact updater repository.
Validation must fail if another updater repository is present or more than one
final AppImage exists.

For a local source check:

```sh
vp run dist:desktop:linux
vp run test:desktop-artifact-smoke -- \
  release/T3-Code.AppImage \
  release/T3-Code.AppImage.release.json
```

Use the actual generated filenames when they include a version or architecture.
The smoke test installs only into isolated temporary directories.

Source validation does not prove an installed release. An actual AppImage
build, extraction, managed installation, launcher readiness, and independent
client acceptance remain pending in the installed Linux verification lane.

## Desktop update identity

Desktop packaging configures GitHub update metadata for
`JerkyTreats/t3code`. Release history and version links use that same repository.
The app can download and install metadata already published there, but this
repository currently has no active desktop publication workflow.

Required updater assets depend on platform and channel. They can include the
installer, macOS zip payload, channel YAML, and blockmaps. Artifact creation and
signing support in source do not authorize publication and do not prove that a
matching exact-origin release exists.

## Server image workflow

The server-image workflow is the only active publication workflow. Its job is
guarded to the exact repository and `main` ref. It can run after matching pushes
or a manual dispatch.

The workflow:

1. Installs only the scanner dependency set without lifecycle scripts.
2. Runs the global release-authority and server-image policy scanners.
3. Builds and smokes one OCI archive from the pinned Dockerfile inputs.
4. Logs in only to GHCR with the repository workflow token.
5. Promotes the verified bytes without rebuilding.
6. Verifies the remote digest after every promotion.

It publishes the same verified digest under an immutable build tag, an immutable
`sha-<commit>` tag, and the moving `main` tag. A divergent immutable tag causes
the workflow to fail rather than overwrite it.

Run its focused source checks locally with:

```sh
node scripts/lib/server-image-workflow-safety.ts
node scripts/server-image-smoke.ts
```

The smoke command needs a compatible local container runtime. It builds an OCI
archive and exercises the image without publishing it.

## Publication boundary

- Never write to upstream.
- Publish only to exact origin targets defined by the active workflow and
  portable release identity owner.
- Treat a manual workflow dispatch as a remote mutation requiring separate
  authorization.
- Do not add package-registry acquisition or publication for T3 Code.
- Do not add a second artifact build between verification and promotion.
- Do not infer publication authority from a successful local test or a release
  link.

## Review checklist

1. Confirm the target repository and registry are exact origin.
2. Confirm checkout credentials are not persisted.
3. Run the global release-authority scanner.
4. Run the focused workflow scanner for the changed artifact lane.
5. Build and smoke the exact candidate bytes locally when the host supports it.
6. Run repository gates for source or workflow changes.
7. Record installed acceptance separately from source validation.
8. Request explicit authorization before any workflow dispatch or publication.

## Troubleshooting

- If the Linux descriptor check fails, confirm there is one physical AppImage
  and one adjacent descriptor from the same build.
- If update identity validation fails, inspect the repository selected by
  `T3CODE_DESKTOP_UPDATE_REPOSITORY` or `GITHUB_REPOSITORY`.
- If the server-image scanner fails, compare workflow actions, permissions,
  triggers, build inputs, and promotion logic with
  `scripts/lib/server-image-workflow-safety.ts`.
- If an immutable image tag already exists with another digest, stop. Do not
  overwrite or delete it as part of routine release recovery.
