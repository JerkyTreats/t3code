# F4 Composer Draft Autonomy And Composer Chrome

Date: 2026-07-30
Status: active

## Intent

The composer owns its local draft state and preserves rich draft behavior under fork specific chrome and affordances.

## Required Behavior

- Draft text, images, screenshots, attachments, terminal context chips, and local thread draft state remain under composer ownership until explicit user action changes them.
- Runtime access control and screenshot actions stay in the floating top action chrome.
- Rich draft controls remain available and are not flattened into a generic reference composer layout.
- Missing provider snapshots and transient provider errors do not erase explicit provider instance or model intent.
- A true no-provider state disables new dispatch without clearing prompt text or attachments.
- Attachment previews and local persistence warnings remain visible when relevant.
- A global provider-agnostic prompt stash stores text and image attachments independently from any thread.
- Stash and restore preserve exact prompt text, including leading whitespace, trailing whitespace, and whitespace-only prompts.
- Stashing succeeds only after durable persistence. A failed or memory-only write leaves the active draft intact.
- Restoring a stash entry writes its text and images into the active draft without changing provider instance, model selection, attachments outside the stash entry, terminal context chips, or rich mode.
- The global stash holds at most 20 entries and evicts the oldest entry only after the replacement queue is durably persisted.
- Each normalized image data URL is limited to 1,300,000 characters.
- Each entry is limited to 2,700,000 total attachment data URL characters. Attachments are admitted in draft order and later images that exceed the remaining budget are reported as dropped without losing restorable text.
- Provider-scoped legacy stash queues migrate once into the global queue. The legacy payload is deleted only after the complete converted queue is durably persisted.
- Legacy migration is atomic. Partial conversion, decode failure, quota failure, or storage unavailability leaves the legacy payload intact and does not publish a partial global queue.
- Legacy queues merge newest valid `createdAt` first. Invalid timestamps follow valid timestamps. Ties resolve by provider scope key, original queue index, then entry id.
- Duplicate legacy entry ids retain the first entry under that ordering.
- Migration strips provider instance and model fields, caps the merged queue at 20 entries, and treats the discarded tail as oldest-first eviction.
- Image finalization reports an explicit saved, missing entry, dropped, or persistence failure outcome.
- Images that finish after their stash entry is restored or deleted are named in a visible warning.
- The stash menu uses one focused listbox with active-descendant navigation, Enter restore, Delete removal, and one focus-restoring close path.
- Inline file review sessions remain in composer-owned draft state until the user cancels or submits them.
- The first inline comment offers separate `Start review` and immediate-send actions. An active review changes the queued action to `Add to review`.
- The composer review tray identifies comments as not submitted, shows the pending count, and owns the explicit cancel and submit-review actions.
- Sending one inline comment immediately does not consume or clear unrelated composer text, attachments, terminal context, element context, preview annotations, or queued review comments.

## Owner Modules

Current owner modules:

- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/fork/composerScreenshot.ts`
- `apps/web/src/fork/composerRichDraft.ts`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/chat/ComposerTopActions.tsx`
- `apps/web/src/components/chat/ComposerRichDraftToolbar.tsx`
- `apps/web/src/composerDraftStore.ts`
- `apps/web/src/promptStashPolicy.ts`
- `apps/web/src/promptStashText.ts`
- `apps/web/src/promptStashFinalization.ts`
- `apps/web/src/promptStashStore.ts`
- `apps/web/src/lib/stashImageCompression.ts`
- `apps/web/src/components/chat/ComposerStashBadge.tsx`
- `apps/web/src/components/chat/ComposerStashMenu.tsx`
- `apps/web/src/components/chat/ComposerPendingReviewComments.tsx`
- `apps/web/src/components/files/LocalCommentAnnotation.tsx`
- `apps/web/src/reviewCommentContext.ts`
- `apps/web/src/components/chat/composerStashMenuKeyboard.ts`
- `apps/web/src/components/chat/composerStashMenuFocus.ts`
- `apps/web/src/lib/composerPathSearchState.ts`
- `packages/client-runtime/src/state/composerPathSearch.ts`
- `packages/contracts/src/keybindings.ts`
- `packages/shared/src/keybindings.ts`

## Fork Seams

- composer screenshot helper
- composer rich draft helper
- composer draft store
- composer chrome integration
- global prompt stash store
- prompt stash image normalization
- atomic legacy stash migration
- composer stash keybinding contract

## One Shot Origin Rebuild Notes

- Identify the current origin draft owner before wiring fork controls.
- Port draft survival behavior before visual chrome so tests can catch ownership regressions.
- Keep screenshot, runtime access, and rich draft controls attached to the active composer, not a parent route draft shadow.
- Preserve local persistence warnings and attachment previews during layout changes.
- Build the provider-agnostic stash beside the active draft store and keep provider or model state outside its schema.
- Convert all decodable legacy queues in memory, persist the complete global queue, verify that write, and only then remove the legacy key.
- Apply the specified migration ordering, de-duplication, field stripping, and cap before the single durable write.
- Keep the active draft unchanged unless stash persistence is durable.
- Keep isolated inline comment dispatch separate from normal composer submission so unrelated draft content remains owned by the composer.
- Keep explicit provider and model intent outside the local no-provider presentation state.
- Keep exact stash budgets in one neutral policy module shared by persistence and image normalization.
- Treat an existing global payload plus a remaining legacy payload as an interrupted migration.
- Merge missing legacy ids into the global queue before verified persistence and legacy deletion.

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
- Image finalization races and persistence failures never claim unavailable images can be recovered from the stash.
- A valid legacy provider-scoped payload migrates once with deterministic ordering and no duplicate entries.
- Entry, image, and attachment budgets enforce the exact documented limits and evict only the oldest persisted entry.
- Failed legacy conversion or persistence retains the legacy payload and leaves the global queue unchanged.
- An interrupted migration with both storage keys preserves every unique entry within the global cap.
- Starting a review queues the first comment and changes later inline actions to `Add to review`.
- Immediate-send dispatches only the selected inline comment and leaves unrelated composer content intact.
- The review tray clearly distinguishes pending comments and exposes one cancel path and one submit path.

## Compatibility Checks

- Persisted local draft keys remain compatible or receive a migration.
- Provider and model selection changes do not clear draft state.
- Disconnect, reconnect, and late provider hydration do not replace explicit custom instance intent.
- Prompt stash persistence remains compatible with storage-constrained browser and desktop contexts.
- Provider instance identity never enters the global stash schema.
- Persisted review mode and comments remain compatible across navigation, source/rendered Markdown toggles, reconnects, and application restarts.
