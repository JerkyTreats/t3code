# F23 Electron Preview Browser Controls

Date: 2026-09-05
Status: active

## Intent

Give a focused Electron preview pane normal browser tab controls without allowing those shortcuts to reload or close the T3 Code window.

## Required Behavior

- `mod+t` opens a new preview browser tab only while preview owns focus.
- `mod+r` reloads the active preview page only while preview owns focus.
- `mod+l` focuses and selects the preview address field only while preview owns focus.
- `mod+w` closes the active preview tab only while preview owns focus.
- `mod+shift+t` reopens the most recently closed preview tab only while preview owns focus.
- The modifier resolves to Ctrl on Linux and Windows and Cmd on macOS.
- Guest browser controls are prevented synchronously inside the guest input boundary.
- Guest new, close, reopen, and address actions cross into the renderer as typed actions, never as reinjected keyboard input.
- Every guest action carries the exact runtime tab identifier and is rejected when its thread, server epoch, active server tab, or focus state no longer matches.
- Guest reload acts directly on the preview page and never reaches the application reload accelerator.
- Guest close never reaches the native Electron window close accelerator.
- Closed history is memory only, scoped per thread, last in first out, and bounded to ten successful user closes.
- Overlapping closes retain user initiation order even when server responses complete out of order. Confirmed close advances session and panel state before awaiting the server, so a second action closes the next tab while replies remain pending. Failed close restores its surface.
- Failed open restores the original history entry at its prior order. Navigation after dispatch does not mask a successful open as failure: original-thread presentation is restored while current route admission separately controls focus.
- A tab that opens but cannot restore its viewport remains visible and consumes the history entry rather than becoming an orphan or duplicate.
- Reopen restores an empty idle tab or the last URL, captured profileId, viewport, zoom factor and color scheme, independently of changed user defaults.
- Reopen never serializes page runtime state, complete browser history, credentials, or storage.
- Closing the final live preview leaves one explicit idle browser surface and focuses its address field.
- Server driven and lifecycle driven destruction do not enter closed history.

## Durable Owners

- `apps/desktop/src/fork/PreviewShortcutPolicy.ts`
- `apps/web/src/components/preview/previewHostActions.ts`
- `apps/web/src/fork/previewTabHistory.ts`
- `apps/web/src/components/preview/closePreviewSession.ts`
- `apps/web/src/components/preview/reopenClosedPreviewSession.ts`
- `apps/web/src/components/preview/closeFocusedPreviewSurface.ts`
- `apps/web/src/components/preview/previewActionBus.ts`

## Upstream Sensitive Adapters

- `apps/web/src/previewStateStore.ts`

- `apps/desktop/src/preview/Manager.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/ipc/channels.ts`
- `apps/desktop/src/ipc/methods/preview.ts`
- `apps/web/src/routes/_chat.tsx`
- `apps/web/src/components/chat/useRightPanelActions.ts` hosts focused new, close and reopen through `usePreviewHostActions`
- `apps/web/src/hooks/useRightPanelSurfaceClose.ts` routes confirmed preview closes through the closed-history owner
- `apps/web/src/components/ReopenClosedViewShortcut.tsx`
- `apps/web/src/browser/ElectronBrowserHost.tsx`
- `apps/web/src/browser/HostedBrowserWebview.tsx`
- `apps/web/src/browser/desktopTabLifetime.ts`
- `apps/web/src/components/preview/PreviewView.tsx`
- `packages/contracts/src/ipc.ts`
- `packages/contracts/src/keybindings.ts`
- `packages/shared/src/keybindings.ts`

## Upstream Substrate

- preview session open, resize, refresh, and close commands
- preview focus detection and right panel surfaces
- Electron guest lifecycle and tab state projection
- preview URL field, viewport, zoom, and color controls
- shared keybinding resolution and conditional contexts

## Non Ownership Boundaries

- F23 does not own preview automation, annotation, recording, picture in picture, cookies, cache, or developer tools.
- F23 does not add persisted browser state or a general browser history service.
- F23 does not change native window close or application reload policy outside focused preview input.
- F23 does not change browser controls in the web build when an Electron guest is absent.

## Verification

- Contract tests accept the three added commands and finite positive restoration zoom; the existing Manager owner normalizes zoom to its supported range.
- Keybinding tests prove every browser command requires preview focus.
- Manager tests prove exact platform chords, synchronous guest prevention, direct preview reload, typed action dispatch, and zero keyboard reinjection for close.
- Action routing tests prove exact runtime identity, active server tab, current server epoch, and focus are required.
- Rapid close tests prove two actions before renderer rerender close two distinct active tabs exactly once.
- Store tests prove per thread isolation, user initiation order, pending failure rollback, and ten successful retained entries.
- Reopen tests prove URL, idle state, viewport, zoom, color, failure rollback, and resize failure visibility.
- Desktop presentation tests prove lease readiness, late restoration, bounded retry, and no fallback reset of ordinary tabs.
- Upstream moved component tests to the real-browser harness. `HostedBrowserWebview.restoration.browser.test.tsx`, `previewHostIntegration.browser.test.tsx` and the native-focus case in `ReopenClosedViewShortcut.browser.test.tsx` carry the host proof; `previewRuntime.native.test.ts`, `previewStateStore.test.ts`, `closePreviewSession.test.ts` and `desktopTabLifetime.test.ts` carry the owner proof.
- Joined format, lint, typecheck and tests pass on the integrated candidate. Installed desktop acceptance remains a separate intake ledger obligation.

## Reconciliation Rule

Retain upstream preview sessions, focus mechanics, panel surfaces, and browser presentation controls. Preserve only the narrow focused browser command owner, deterministic ephemeral closed history, exact runtime identity checks, and native accelerator containment.

## Restoration Compatibility

New guest leases capture presentation before asynchronous settings reads. If an opened event creates a guest before the open mutation result, the current `preview.setZoomFactor` method restores through the existing normalized Manager zoom operation after lease and registration readiness. Identity is rechecked before subsequent writes and consumption. The current upstream bridge requires that setter and shares it with server-driven presentation. No keyboard synthesis, alternate zoom ladder or page-state persistence is introduced.

Current browser hosts retain upstream authorization scopes and server-tab identity while adapting fork restoration. Chat hosts admit preview actions against the live route through `isPreviewHostRouteCurrent`, read at action time, so `ChatView` carries no F23 state. The surface-close hook resolves whether every requested surface closed, and no longer subscribes to the thread's preview state. Upstream's unchanged-list fast path in `reconcilePreviewServerSessions` stays, except when a pending restoration names a tab missing from the list. Native rendering of the primary's server tabs requires the optional `desktopBrowser` environment capability. The right-panel store retains upstream close revisions. Focused preview reopen consumes the F23 thread-local history; the upstream global reopen shortcut skips preview focus and retains nonbrowser reopening. No persisted global browser history replaces the bounded F23 history.

Focused protected browser chords take precedence over generic configured host shortcut forwarding. Unfocused guest input cannot reload the preview or emit preview actions. Current Manager tests exercise shortcut collisions and focus rejection.
