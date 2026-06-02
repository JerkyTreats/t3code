# F1 Branding And Release Identity

Date: 2026-06-02
Status: active

## Intent

Fork builds identify as `T3 Code Omarchy` instead of generic upstream `T3 Code`.

## Required Behavior

- Desktop naming uses the Omarchy product identity across packaged and development surfaces.
- Web branding uses the same Omarchy base identity.
- Release identity keeps fork naming visible and must not silently fall back to upstream naming.

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

- Restore shared product identity before desktop, web, and release wiring.
- Keep technical storage identifiers stable unless a separate migration is approved.
- Replace visible upstream naming at the shared identity seam instead of scattering product literals.
- Recheck release scripts after upstream packaging changes because they can silently reintroduce generic names.

## Upstream Intake Rule

- Reject upstream naming changes that replace fork identity.
- Adapt release workflow or packaging changes so fork naming survives.

## Verification

- Desktop window title and packaged product name use the Omarchy identity.
- Web visible product name uses the Omarchy identity.
- Release artifact and announcement names use the Omarchy identity.

## Compatibility Checks

- Desktop app id and storage path remain stable unless an explicit migration lands.
- Release script output still matches existing artifact consumers.
