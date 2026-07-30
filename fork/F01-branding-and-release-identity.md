# F1 Branding And Release Identity

Date: 2026-06-02
Status: active

## Intent

Visible product identity belongs to the opinionated T3 Code fork.

The product must not present itself as an Omarchy edition. Omarchy may appear only where a surface is specifically describing Omarchy integration.

## Required Behavior

- Electron desktop naming uses the fork product identity across packaged and development surfaces.
- Web branding used by the Electron desktop shell keeps the same fork base identity where it represents the desktop product.
- Unconfigured web branding uses the `Alpha` stage label in development and production.
- Mobile and hosted lanes may keep the reference product naming unless a separate fork product decision changes them.
- Omarchy is not a product qualifier outside Omarchy specific integration surfaces.
- Electron desktop release identity keeps fork naming visible and must not silently fall back to the reference product naming.
- Tag-triggered desktop builds derive the artifact version from the release tag unless an explicit manual build version is supplied.
- Desktop update metadata and release publication accept only the fork origin repository.
- Linux AppImage publication requires an extracted packaged-entry smoke with isolated state, ordered backend and renderer readiness markers, bounded shutdown, and complete process cleanup.
- Native updater relaunch may bypass the ordinary guarded quit path only after Electron emits its updater-specific quit event.
- Ordinary window close and app quit continue through the guarded shutdown path on every desktop platform.

## Owner Modules

- `apps/desktop/package.json`
- `packages/shared/src/productIdentity.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts`
- `apps/desktop/src/app/DesktopLifecycle.ts`
- `apps/desktop/src/electron/ElectronApp.ts`
- `apps/desktop/scripts/electron-launcher.mjs`
- `apps/web/src/branding.ts`
- `scripts/build-desktop-artifact.ts`
- `scripts/resolve-nightly-release.ts`
- `scripts/notify-discord-release.ts`
- `scripts/desktop-artifact-smoke.ts`
- `scripts/lib/desktop-artifact-process-supervisor.py`
- `scripts/lib/release-workflow-safety.ts`
- `.github/workflows/build-desktop-artifacts.yml`

## Fork Seams

- `packages/shared/src/productIdentity.ts`
- desktop environment identity helpers
- web branding fallback
- release and nightly artifact naming scripts
- updater-specific Electron quit event adapter
- guarded desktop lifecycle state

## One Shot Origin Rebuild Notes

- Restore shared product identity before Electron desktop, desktop web shell, and release wiring.
- Keep technical storage identifiers stable unless a separate migration is approved.
- Replace visible reference product naming at the shared product identity seam instead of scattering product literals.
- Remove `Omarchy` from broad product labels when it is not describing an Omarchy integration.
- Recheck release scripts after origin packaging changes because they can silently reintroduce generic names.
- Keep tag version propagation, exact origin publication guards, and extracted Linux artifact smoke in the retained release workflow.
- Keep updater-controlled quit permission separate from ordinary shutdown state so a normal quit cannot inherit updater authority.

## Origin Rebuild Rule

- Rebuild release workflow or packaging changes only from origin-owned changes so Electron desktop fork naming survives.
- Reject origin changes that replace the fork identity in governed product lanes.
- Preserve the reference product naming for lanes that are not governed by this Electron desktop identity spec.

## Verification

- Electron desktop window title and packaged product name use the fork identity.
- Desktop web shell visible product name uses the fork identity.
- Electron desktop release artifact and announcement names use the fork identity.
- Tag builds propagate the tag version into desktop artifacts while manual builds can supply an explicit version.
- Release workflow safety rejects upstream targets and any desktop update repository other than the fork origin.
- The representative Linux AppImage extracts and reaches ordered backend and renderer readiness before a bounded clean shutdown.
- Failed artifact startup and shutdown terminate every exact captured packaged process identity and prove no adopted child remains before temporary state is removed.
- Native updater quit proceeds on macOS and Windows after the updater-specific event.
- Ordinary quit remains guarded on macOS, Windows, and Linux.
- Broad product labels do not include `Omarchy` unless they describe an Omarchy integration.
- Mobile product identity can remain `T3 Code` unless separately specified.

## Compatibility Checks

- Desktop app id and storage path remain stable unless an explicit migration lands.
- Release script output still matches existing artifact consumers.
- Updater relaunch does not weaken renderer recovery or normal shutdown sequencing.
