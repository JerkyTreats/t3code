# F02 Omarchy System Theme

Date: 2026-09-05
Status: active

## Intent

Project the current Omarchy desktop theme into upstream semantic theme roles only while the active appearance choice selects the system theme.

## Required Behavior

- Linux desktop prefers the bounded coherent Quattro snapshot under `.local/state`, including its explicit mode, and falls back to the legacy `.config` snapshot with its light-mode marker only when preferred current state is absent.
- Malformed preferred state fails closed instead of exposing a stale legacy snapshot.
- Theme observation follows atomic current-theme replacement, including same-path directory replacement, and changes to every decision-bearing directory. Failed watchers retire only their current instance and recreate observation even when directory identity is unchanged. Stale callbacks cannot retire a replacement or restart disposed observation.
- Desktop IPC exposes the initial theme and validated change notifications through the optional desktop bridge.
- A newer change notification wins over a late initial read.
- Omarchy colors apply only when the active appearance mode and active light or dark half select `system`.
- The transient projection activates upstream semantic palette mapping without persisting a theme identifier.
- Exact Omarchy background and accent seeds retain the restrained production surface hierarchy while action roles use the accent directly.
- Quattro selection and bright-foreground aliases map into the existing terminal selection and cursor roles.
- An explicitly selected theme remains authoritative.
- Missing or invalid Omarchy state falls back to the upstream theme path.
- Live Omarchy changes never write persisted theme preferences.

## Durable Owners

- `apps/desktop/src/fork/OmarchyThemeSource.ts`
- `apps/web/src/fork/omarchySystemTheme.ts`
- `apps/web/src/fork/desktopSystemTheme.ts`

## Upstream Sensitive Adapters

- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/desktop/src/ipc/DesktopIpcHandlers.ts`
- `apps/desktop/src/preload.ts`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/themePalette.ts`
- `packages/contracts/src/ipc.ts`

## Upstream Substrate

- semantic theme roles and palette application
- appearance mode and light plus dark theme halves
- persisted explicit theme preferences
- optional desktop bridge lifecycle

## Non Ownership Boundaries

- F02 does not own a parallel theme library or persisted Omarchy preference.
- F02 does not override an explicit theme selection.
- F02 does not change non-Linux theme behavior.
- F02 does not own wallpaper, terminal, compositor, or other desktop configuration.

## Verification

- Theme-source tests cover Quattro preference and explicit mode, legacy fallback and light marker compatibility, malformed preferred-state rejection, bounded coherent reads, atomic current retarget, same-path theme replacement, theme-name replacement, watcher rebinding, deduplication, and cleanup.
- Projection tests cover Quattro aliases, semantic palette activation, restrained tonal separation, direct action accent, active system halves, explicit theme precedence, invalid colors, and unavailable state.
- `desktopSystemTheme.test.ts` covers initial plus delta ordering, usable palette validation, deduplication, disposal and resubscription.
- `useTheme.test.ts` exercises current hook precedence, transient document application and persistence non-mutation.
- `themePalette.test.ts` covers the transient document marker, semantic role application and normal reset path.
- Synthetic built visual comparison covers light and dark appearance, same-mode Omarchy replacement and source removal; the intake ledger records exact source and rendered evidence.

## Reconciliation Rule

Retain upstream theme persistence, appearance resolution, and semantic roles. Preserve only the transient Omarchy source, projection, and narrow desktop bridge adapters.

## Current Adapter Contract

The source uses bounded `DesktopSystemThemeSchema` through optional `getSystemTheme` and `onSystemTheme`. The subscription owner validates a usable palette, observes before reading, gives newer pushes precedence and clears local state at the last subscriber. The current hook includes source revision in memoization and listener snapshots so same-mode color changes apply. The active local mode resolves only system appearance.

The focused projection specializes the accepted exact-seed restrained mapping using current exported color primitives. It does not restore the retired general theme generator. `applyThemePalette` accepts a transient palette with the `omarchy-system` document marker and complete existing semantic roles. That marker is never stored as a preference. Upstream theme preview and onboarding precedence remain authoritative.
