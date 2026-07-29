# F4 Composer Draft Autonomy And Composer Chrome

Date: 2026-06-02
Status: active

## Intent

The composer owns its local draft state and preserves rich draft behavior under fork specific chrome and affordances.

## Required Behavior

- Draft text, images, screenshots, attachments, terminal context chips, and local thread draft state remain under composer ownership until explicit user action changes them.
- Runtime access control and screenshot actions stay in the floating top action chrome.
- Rich draft controls remain available and are not flattened into a generic reference composer layout.
- Attachment previews and local persistence warnings remain visible when relevant.
- A global provider-agnostic prompt stash stores text and image attachments independently from any thread.
- Stashing succeeds only after durable persistence. A failed or memory-only write leaves the active draft intact.
- Restoring a stash entry writes its text and images into the active draft without changing provider instance, model selection, attachments outside the stash entry, terminal context chips, or rich mode.
- Stash entries are bounded and oversized or unreadable images are reported without losing restorable text.
- Provider-scoped legacy stash queues migrate once into the global queue. The legacy payload is deleted only after the complete converted queue is durably persisted.
- Legacy migration is atomic. Partial conversion, decode failure, quota failure, or storage unavailability leaves the legacy payload intact and does not publish a partial global queue.

## Owner Modules

Current owner modules:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/fork/composerRichDraft.ts`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/chat/ComposerTopActions.tsx`
- `apps/web/src/components/chat/ComposerRichDraftToolbar.tsx`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/lib/composerPathSearchState.ts`
- `packages/client-runtime/src/state/composerPathSearch.ts`

Planned owner modules:

- `apps/web/src/components/chat/ComposerStashBadge.tsx`
- `apps/web/src/components/chat/ComposerStashMenu.tsx`
- `apps/web/src/promptStashStore.ts`
- `apps/web/src/lib/stashImageCompression.ts`

## Fork Seams

- composer screenshot helper
- composer rich draft helper
- composer draft store
- composer chrome integration
- global prompt stash store
- prompt stash image normalization
- atomic legacy stash migration

## One Shot Origin Rebuild Notes

- Identify the current origin draft owner before wiring fork controls.
- Port draft survival behavior before visual chrome so tests can catch ownership regressions.
- Keep screenshot, runtime access, and rich draft controls attached to the active composer, not a parent route draft shadow.
- Preserve local persistence warnings and attachment previews during layout changes.
- Build the provider-agnostic stash beside the active draft store and keep provider or model state outside its schema.
- Convert all decodable legacy queues in memory, persist the complete global queue, verify that write, and only then remove the legacy key.
- Keep the active draft unchanged unless stash persistence is durable.

## Origin Rebuild Rule

- Rebuild composer improvements only from origin-owned changes into the fork layout and ownership model.
- Adopt client-runtime path search behavior only through origin-owned changes that preserve active draft ownership.
- Reject origin composer simplifications that remove fork specific draft affordances or move ownership away from the active draft.

## Verification

- Draft text and attachments survive nearby UI interactions.
- Runtime access and screenshot controls remain in the fork chrome position.
- Rich draft controls remain present when enabled and formatting actions update the active draft.
- Enter behavior remains correct for rich draft mode and standard prompt mode.
- Stash persistence failure leaves the draft untouched.
- Stash restore transfers text and images without changing provider instance or model selection.
- Bounded storage and image failure paths preserve restorable text and show accurate warnings.
- A valid legacy provider-scoped payload migrates once with deterministic ordering and no duplicate entries.
- Failed legacy conversion or persistence retains the legacy payload and leaves the global queue unchanged.

## Compatibility Checks

- Persisted local draft keys remain compatible or receive a migration.
- Provider and model selection changes do not clear draft state.
- Prompt stash persistence remains compatible with storage-constrained browser and desktop contexts.
- Provider instance identity never enters the global stash schema.
