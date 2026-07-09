# F1 Branding And Release Identity

Date: 2026-06-02
Status: active

## Intent

Visible product identity belongs to the opinionated T3 Code fork.

The product must not present itself as an Omarchy edition. Omarchy may appear only where a surface is specifically describing Omarchy integration.

## Required Behavior

- Electron desktop naming uses the fork product identity across packaged and development surfaces.
- Web branding used by the Electron desktop shell keeps the same fork base identity where it represents the desktop product.
- Mobile and hosted lanes may keep upstream naming unless a separate fork product decision changes them.
- Omarchy is not a product qualifier outside Omarchy specific integration surfaces.
- Electron desktop release identity keeps fork naming visible and must not silently fall back to upstream naming.

## Owner Modules

- `apps/desktop/package.json`
- `packages/shared/src/productIdentity.ts`
- `apps/desktop/src/app/DesktopEnvironment.ts`
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

## One Shot Rebuild Notes

- Restore shared product identity before Electron desktop, desktop web shell, and release wiring.
- Keep technical storage identifiers stable unless a separate migration is approved.
- Replace visible upstream naming at the shared product identity seam instead of scattering product literals.
- Remove `Omarchy` from broad product labels when it is not describing an Omarchy integration.
- Recheck release scripts after upstream packaging changes because they can silently reintroduce generic names.

## Upstream Replay Rule

- Override upstream naming changes that replace the fork identity.
- Replay release workflow or packaging changes so Electron desktop fork naming survives.
- Accept upstream naming for product lanes that are not governed by this Electron desktop identity spec.

## Verification

- Electron desktop window title and packaged product name use the fork identity.
- Desktop web shell visible product name uses the fork identity.
- Electron desktop release artifact and announcement names use the fork identity.
- Broad product labels do not include `Omarchy` unless they describe an Omarchy integration.
- Mobile product identity can remain upstream `T3 Code` unless separately specified.

## Compatibility Checks

- Desktop app id and storage path remain stable unless an explicit migration lands.
- Release script output still matches existing artifact consumers.
