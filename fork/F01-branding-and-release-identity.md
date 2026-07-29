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
- Keep updater-controlled quit permission separate from ordinary shutdown state so a normal quit cannot inherit updater authority.

## Origin Rebuild Rule

- Rebuild release workflow or packaging changes only from origin-owned changes so Electron desktop fork naming survives.
- Reject origin changes that replace the fork identity in governed product lanes.
- Preserve the reference product naming for lanes that are not governed by this Electron desktop identity spec.

## Verification

- Electron desktop window title and packaged product name use the fork identity.
- Desktop web shell visible product name uses the fork identity.
- Electron desktop release artifact and announcement names use the fork identity.
- Native updater quit proceeds on macOS and Windows after the updater-specific event.
- Ordinary quit remains guarded on macOS, Windows, and Linux.
- Broad product labels do not include `Omarchy` unless they describe an Omarchy integration.
- Mobile product identity can remain `T3 Code` unless separately specified.

## Compatibility Checks

- Desktop app id and storage path remain stable unless an explicit migration lands.
- Release script output still matches existing artifact consumers.
- Updater relaunch does not weaken renderer recovery or normal shutdown sequencing.
