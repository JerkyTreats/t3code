# CI Quality Gates

## Client Package Workflow

`.github/workflows/ci.yml` is the retained pull request and `main` branch CI workflow.

Automatic runs start only when client package paths or their shared build inputs change. Operators can also start the workflow manually without a path restriction. The workflow checks formatting, lint, type safety, and tests for these areas:

- `apps/mobile`
- `apps/web`
- `packages/client-runtime`
- `packages/contracts`
- `packages/shared`

The workflow uses pnpm `11.10.0` and Vite+ commands.

It does not replace the full repository completion gate. Source and runtime build changes must still pass these commands before completion:

```sh
pnpm fmt
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm lint:mobile` when native mobile code changes.

## Desktop Artifact Workflow

`.github/workflows/build-desktop-artifacts.yml` builds unsigned macOS and Linux desktop artifacts. Tag pushes also publish those artifacts to a GitHub release in the current repository.

The workflow does not run the full repository quality gate. Complete the gate before creating a release tag.

## Server Image Workflow

`.github/workflows/build-t3code-server-image.yml` builds and publishes the fork server image to `ghcr.io/jerkytreats/t3code-server` after relevant changes reach `main`. It can also be started manually.

## Mobile Production Workflow

`.github/workflows/mobile-eas-production.yml` remains a manual production build and update lane. It skips work when `EXPO_TOKEN` is unavailable.

See [Desktop Release Operations](./release.md) for the retained desktop release behavior.
