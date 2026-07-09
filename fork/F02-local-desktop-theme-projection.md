# F2 Local Desktop Theme Projection

Date: 2026-06-02
Status: active

## Intent

Desktop theme behavior follows the best available local host theme source.

Omarchy remains one supported source adapter, but it is not the product boundary.

## Required Behavior

- Theme discovery reads Omarchy state from `~/.config/omarchy/current` when available.
- Theme source is `omarchy` when Omarchy theme data is the selected local source.
- The theme projection model can accept additional local desktop theme sources without changing the product identity.
- Web theme variables project accent, foreground, background, selection, and terminal colors from the selected local source into the UI.
- Web runtime consumes `getSystemTheme` and `onSystemTheme` from the desktop bridge when present.
- Missing Omarchy state degrades safely and may use another available host theme source or fallback theme.

## Owner Modules

- `apps/desktop/src/fork/OmarchyThemeSource.ts`
- `apps/desktop/src/fork/DesktopSystemThemeService.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/components/ThreadTerminalDrawer.tsx`
- `apps/web/src/index.css`

## Fork Seams

- local desktop theme source service
- desktop system theme service
- desktop IPC theme bridge
- web theme projection hook
- CSS variable projection

## One Shot Rebuild Notes

- Restore the desktop theme source before wiring web CSS projection.
- Keep Omarchy as the source value when Omarchy theme data is the selected source.
- Keep the theme source model open to non Omarchy local providers.
- Keep desktop bridge theme reads and change notifications wired into web theme resolution.
- Preserve missing state fallback as safe degradation, not as generic authority.
- Add web projection after desktop IPC contracts are restored.

## Upstream Replay Rule

- Replay upstream theme infrastructure changes under the local desktop theme source model.
- Override upstream behavior that discards local host theme projection on desktop.
- Do not treat Omarchy as the product identity when preserving Omarchy theme support.

## Verification

- Changing the selected local theme source updates desktop theme projection.
- Web colors and terminal palette follow selected local theme values when available.
- Browser selection colors follow selected local theme values when available.
- Missing Omarchy state does not crash the desktop app or web theme hook.

## Compatibility Checks

- Desktop IPC theme methods stay additive.
- Web CSS variables keep stable names for existing UI styles.
