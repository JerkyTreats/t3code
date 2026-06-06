# F1 Branding And Release Identity

Date: 2026-06-02
Status: active

## Intent

Electron desktop fork builds identify as `T3 Code Omarchy` instead of generic upstream `T3 Code`.

Other upstream product lanes, including mobile and hosted web, may keep upstream product identity unless a separate fork product decision changes them.

## Required Behavior

- Electron desktop naming uses the Omarchy product identity across packaged and development surfaces.
- Web branding used by the Electron desktop shell keeps the same Omarchy base identity where it represents the desktop product.
- Mobile and other upstream product lanes are not required to use Omarchy naming by default.
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
- Replace visible upstream naming at the Electron desktop identity seam instead of scattering product literals.
- Recheck release scripts after upstream packaging changes because they can silently reintroduce generic names.

## Upstream Replay Rule

- Override upstream naming changes that replace Electron desktop fork identity.
- Replay release workflow or packaging changes so Electron desktop fork naming survives.
- Accept upstream naming for product lanes that are not governed by this Electron desktop identity spec.

## Verification

- Electron desktop window title and packaged product name use the Omarchy identity.
- Desktop web shell visible product name uses the Omarchy identity.
- Electron desktop release artifact and announcement names use the Omarchy identity.
- Mobile product identity can remain upstream `T3 Code` unless separately specified.

## Compatibility Checks

- Desktop app id and storage path remain stable unless an explicit migration lands.
- Release script output still matches existing artifact consumers.
