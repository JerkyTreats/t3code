# F3 Desktop Screenshot Capture And Attach Flow

Date: 2026-06-02
Status: active

## Intent

Screenshot capture is a first class composer action that captures the local desktop or supported screenshot entity and attaches it directly to the active chat draft.

Omarchy remains one supported capture adapter, but the product feature is direct screenshot attach, not an Omarchy edition behavior.

## Required Behavior

- Desktop capture uses the best available supported capture adapter for the host.
- Omarchy capture prefers `omarchy-capture-screenshot` when available and still recognizes legacy `omarchy-cmd-screenshot`.
- Capture resolves the selected adapter output and handles adapter specific delayed artifact behavior.
- Capture waits for a complete PNG artifact before attaching it.
- Clipboard fallback remains available when the capture adapter updates the clipboard instead of writing a file.
- Composer chrome exposes screenshot capture as a first class action and attaches the result into the active draft.
- Desktop bridge exposes screenshot capture only when the host platform can support at least one capture implementation.
- New screenshot entities may be used for direct attach when they provide or can resolve a PNG `File` and draft preview URL without replacing active draft text.

## Owner Modules

- `apps/desktop/src/fork/OmarchyScreenshotCapture.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/components/chat/ComposerTopActions.tsx`
- `apps/web/src/components/chat/ChatComposer.tsx`

## Fork Seams

- desktop screenshot capture service
- desktop screenshot IPC bridge
- composer screenshot helper
- active draft attachment path

## One Shot Rebuild Notes

- Restore desktop capture service and tests before UI attachment wiring.
- Keep capture adapter preference order explicit.
- Keep bridge capability exposure platform gated so non Linux clients do not render a broken composer action.
- Wait for a stable PNG artifact before converting to a draft attachment.
- Attach through the active draft store or current upstream equivalent, not through route level prompt ownership.
- Preserve clipboard fallback for capture adapters that use the clipboard.
- Reuse preview annotation screenshot conversion when the entity already provides a PNG data URL and active draft attachment path.

## Upstream Replay Rule

- Replay upstream screenshot or attachment changes under the direct desktop screenshot attach contract.
- Override upstream flows that remove the first class composer screenshot action or make capture mutate unrelated draft text.
- Keep Omarchy capture support as one adapter when the host provides it.

## Verification

- Screenshot capture works through a supported host adapter when available.
- Composer receives the captured image as a draft attachment.
- Failure paths keep clear user facing error handling.
- Draft text survives screenshot capture and attachment.
- Preview annotation screenshots can attach through the same draft image shape when the source entity provides a PNG data URL.

## Compatibility Checks

- Desktop IPC screenshot methods stay capability gated.
- Browser backed web flows degrade without showing a broken desktop action.
- Screenshot entities used for direct attach must provide bounded size metadata or pass the existing max attachment gate before mutating the draft.
