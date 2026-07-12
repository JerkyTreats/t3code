# Desktop Release Operations

This document describes the retained fork desktop artifact workflow.

## Workflow Boundary

The active desktop release workflow is `.github/workflows/build-desktop-artifacts.yml`.

It supports two entry paths:

- Manual dispatch builds selected desktop artifacts and uploads workflow artifacts.
- A tag push matching `v*` builds the retained artifact matrix and publishes a GitHub release in the current repository.

The retained matrix contains:

- macOS DMG artifacts for `arm64` and `x64`
- Linux AppImage artifacts for `x64`

The workflow does not build Windows artifacts. It also does not publish the CLI package, deploy the hosted web app, deploy the relay, create nightly tags, or send release announcements.

Upstream hosted release and deployment workflows remain intentionally absent. Any future adoption requires an explicit fork workflow decision and origin-only target review.

## Release Publication

Tag runs assemble the macOS and Linux files and publish them with `gh release` against `GITHUB_REPOSITORY`.

The workflow merges the two macOS update manifests before publication. A tag containing `-nightly.` is marked as a prerelease. Other matching tags are marked as the latest release.

There is no scheduled nightly job. A nightly release requires an explicitly created matching tag.

Manual dispatch does not publish a GitHub release. It only uploads workflow artifacts for the selected platforms.

## Signing Boundary

The retained workflow invokes the default unsigned packaging commands. It does not configure Apple signing, notarization, or Windows signing.

Local packaging supports explicit signing inputs through the desktop artifact script, but that path is outside the retained GitHub workflow.

## Required Verification

The desktop artifact workflow does not run repository quality gates. Before creating a release tag, verify the candidate commit with:

```sh
pnpm fmt
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm lint:mobile` when native mobile code differs in the release candidate.

For packaging focused verification, also run:

```sh
pnpm release:smoke
```

Use an available target host for a local artifact smoke build when release risk warrants it.

## Release Checklist

1. Verify `origin` is the repository and release target.
2. Confirm the candidate commit passed the required repository gates.
3. Run the release smoke check.
4. Confirm the intended version and tag use the `v` prefix.
5. Push the tag only to `origin`.
6. Confirm both macOS architectures and the Linux artifact completed.
7. Confirm the release contains installers, update manifests, and required blockmaps.
8. Smoke test the produced artifacts on available target systems.

## Related Automation

The fork server image has a separate workflow at `.github/workflows/build-t3code-server-image.yml`.

Mobile production builds and updates have a separate manual workflow at `.github/workflows/mobile-eas-production.yml`.

Neither workflow is part of desktop release publication.
