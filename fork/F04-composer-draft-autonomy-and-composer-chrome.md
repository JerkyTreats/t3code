# F4 Composer Draft Autonomy And Composer Chrome

Date: 2026-06-02
Status: active

## Intent

The composer owns its local draft state and preserves rich draft behavior under fork specific chrome and affordances.

## Required Behavior

- Draft text, images, screenshots, attachments, terminal context chips, and local thread draft state remain under composer ownership until explicit user action changes them.
- Runtime access control and screenshot actions stay in the floating top action chrome.
- Rich draft controls remain available and are not flattened into a generic upstream composer layout.
- Attachment previews and local persistence warnings remain visible when relevant.

## Owner Modules

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/fork/composerRichDraft.ts`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/chat/ComposerRichDraftToolbar.tsx`
- `apps/web/src/composerDraftStore.ts`

## Fork Seams

- composer screenshot helper
- composer rich draft helper
- composer draft store
- composer chrome integration

## One Shot Rebuild Notes

- Identify the current upstream draft owner before wiring fork controls.
- Port draft survival behavior before visual chrome so tests can catch ownership regressions.
- Keep screenshot, runtime access, and rich draft controls attached to the active composer, not a parent route draft shadow.
- Preserve local persistence warnings and attachment previews during layout changes.

## Upstream Replay Rule

- Replay upstream composer improvements into the fork layout and ownership model.
- Override upstream composer simplifications that remove fork specific draft affordances or move ownership away from the active draft.

## Verification

- Draft text and attachments survive nearby UI interactions.
- Runtime access and screenshot controls remain in the fork chrome position.
- Rich draft controls remain present when enabled and formatting actions update the active draft.
- Enter behavior remains correct for rich draft mode and standard prompt mode.

## Compatibility Checks

- Persisted local draft keys remain compatible or receive a migration.
- Provider and model selection changes do not clear draft state.
