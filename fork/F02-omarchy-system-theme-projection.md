# F2 Omarchy System Theme Projection

Date: 2026-06-02
Status: active

## Intent

System theme behavior on desktop Linux follows Omarchy theme state instead of generic upstream theme detection.

## Required Behavior

- Theme discovery reads Omarchy state from `~/.config/omarchy/current`.
- Theme source is `omarchy` when Omarchy theme data is available.
- Web theme variables project Omarchy accent, foreground, background, selection, and terminal colors into the UI.
- Missing Omarchy state degrades safely without pretending a generic upstream theme source is authoritative.

## Owner Modules

- `apps/desktop/src/fork/OmarchyThemeSource.ts`
- `apps/desktop/src/fork/DesktopSystemThemeService.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/web/src/hooks/useTheme.ts`
- `apps/web/src/index.css`

## Fork Seams

- Omarchy theme source service
- desktop system theme service
- desktop IPC theme bridge
- web theme projection hook
- CSS variable projection

## One Shot Rebuild Notes

- Restore the desktop theme source before wiring web CSS projection.
- Keep Omarchy as the source value when local theme data is available.
- Preserve missing state fallback as safe degradation, not as generic authority.
- Add web projection after desktop IPC contracts are restored.

## Upstream Replay Rule

- Replay upstream theme infrastructure changes under the Omarchy source model.
- Override upstream behavior that replaces Omarchy as the authoritative desktop theme source on Linux.

## Verification

- Changing Omarchy theme state updates desktop theme projection.
- Web colors and terminal palette follow Omarchy theme values when available.
- Missing Omarchy state does not crash the desktop app or web theme hook.

## Compatibility Checks

- Desktop IPC theme methods stay additive.
- Web CSS variables keep stable names for existing UI styles.
