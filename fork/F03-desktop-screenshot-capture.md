# F03 Desktop Screenshot Capture

Date: 2026-09-05
Status: active

## Intent

Expose a bounded Linux desktop screenshot capture through an optional capability-gated desktop bridge.

## Required Behavior

- Screenshot capture is available only when a supported Linux adapter is executable.
- Adapter selection prefers the specialized Omarchy path, then supported generic Linux capture tools in deterministic order.
- Capture returns a contract-valid PNG byte payload within the shared image ceiling or `null` for explicit user cancellation.
- The specialized Omarchy path accepts only a delayed stable output file or changed clipboard image. Success and cancellation wait for confirmed child exit or close. Termination requests escalate from SIGTERM after a bounded grace period to SIGKILL with a bounded confirmation window. Unconfirmed termination raises a redacted fatal error, releases owned resources and prevents another capture adapter from starting.
- Generic adapters use isolated temporary state and clean it after success, cancellation, or failure.
- Main process owns capability discovery and capture execution.
- Preload exposes `captureDesktopScreenshot` only when capability is present at bridge construction.
- Main and preload boundaries validate capture payloads before renderer use.
- The composer exposes capture only while the optional desktop capability is present.
- Capture reserves one ordinary attachment slot before native work starts, then transfers the resulting PNG through the upstream admission path without a gap or double counting. Ordinary paste and capture share the same pending reservation accounting.
- Cancellation is silent, capture remains single flight, and failures never log image bytes.
- Reservation tokens bind environment, composer target and thread, with draft project identity where relevant. A stale destination or disposal releases the token exactly once and never attaches to a replacement destination.
- Normal compression, file classification, reattachment-marker replacement and send gating remain upstream behavior.

## Durable Owners

- `apps/desktop/src/fork/DesktopScreenshotCaptureAvailability.ts`
- `apps/desktop/src/fork/DesktopScreenshotPng.ts`
- `apps/desktop/src/fork/OmarchyScreenshotCapture.ts`
- `apps/desktop/src/fork/DesktopScreenshotCapture.ts`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/fork/composerAttachmentAdmission.ts`

## Upstream Sensitive Adapters

- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/window.ts`
- `apps/desktop/src/ipc/DesktopIpcHandlers.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/vite.config.ts`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `packages/contracts/src/ipc.ts`

## Upstream Substrate

- optional desktop bridge contract
- shared image byte ceiling and ordinary attachment count budget
- Electron main and sandboxed preload boundary

## Non Ownership Boundaries

- F03 does not own preview-page capture, browser recording, clipboard history, or image editing.
- F03 does not add a web-only screenshot implementation.
- F03 does not own composer draft storage, attachment compression, attachment count or byte ceilings, preview URLs, or provider upload conversion.

## Verification

- Availability tests cover platform gating, executable discovery, and adapter order.
- PNG tests cover signature, header, terminal marker, incomplete state, invalid state, and the exact image ceiling.
- Capture tests cover delayed output, changed clipboard, cancellation, fallback, child termination, timeout, and cleanup.
- IPC and preload tests cover capability absence, valid capture, malformed payload rejection, and distinct top-level capture and unchanged nested preview capture. Packaged output remains part of later installed acceptance.
- Composer tests cover capability absence, exact PNG conversion, shared admission, pending-image reservation, submission gating, cancellation, failure, single flight, unmount cleanup, and focus restoration.

## Reconciliation Rule

Keep desktop capture isolated behind the optional upstream bridge and route composer attachment only through the upstream image admission owner.

## Current Capability Contract

Only a strict successful availability probe exposes the optional top-level method. A missing, throwing or malformed probe leaves the capability absent. `preview.captureScreenshot` continues to mean preview-page capture. Main process validates complete PNG structure and the shared ten MiB ceiling; preload validates the bounded signature envelope before the composer converts one artifact to one ordinary image. No screenshot-specific storage or send queue is introduced.
