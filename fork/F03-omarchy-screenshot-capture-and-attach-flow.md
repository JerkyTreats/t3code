# F3 Omarchy Screenshot Capture And Attach Flow

Date: 2026-06-02
Status: active

## Intent

Screenshot capture and attach flows are tuned for Omarchy tooling and Linux desktop capability checks.

## Required Behavior

- Desktop capture prefers `omarchy-capture-screenshot` when available and still recognizes legacy `omarchy-cmd-screenshot`.
- Capture resolves the Omarchy screenshot output directory and handles Omarchy smart mode behavior.
- Capture waits for a complete PNG artifact before attaching it.
- Clipboard fallback remains available when Omarchy updates the clipboard instead of writing a file.
- Composer chrome exposes screenshot capture as a first class action and attaches the result into the active draft.

## Owner Modules

- `apps/desktop/src/fork/OmarchyScreenshotCapture.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/components/chat/ChatComposer.tsx`

## Fork Seams

- Omarchy screenshot capture service
- desktop screenshot IPC bridge
- composer screenshot helper
- active draft attachment path

## One Shot Rebuild Notes

- Restore desktop capture service and tests before UI attachment wiring.
- Keep command preference order explicit.
- Wait for a stable PNG artifact before converting to a draft attachment.
- Attach through the active draft store or current upstream equivalent, not through route level prompt ownership.
- Preserve clipboard fallback for smart capture behavior.

## Upstream Intake Rule

- Adapt upstream screenshot or attachment changes under the Omarchy capture contract.
- Reject upstream flows that remove Omarchy specific capture probing or attach behavior.

## Verification

- Screenshot capture works through Omarchy tooling when available.
- Composer receives the captured image as a draft attachment.
- Failure paths keep clear user facing error handling.
- Draft text survives screenshot capture and attachment.

## Compatibility Checks

- Desktop IPC screenshot methods stay capability gated.
- Browser backed web flows degrade without showing a broken desktop action.
