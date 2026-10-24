# F04 Composer Context Whitespace

Date: 2026-09-05
Status: active

## Intent

Preserve exact user-authored prompt whitespace when helper-owned rich context blocks are appended for sending.

## Required Behavior

- Terminal, selected element and preview annotation composition preserve authored prompt bytes before appending generated context.
- When retained context accompanies upstream source review, the final composition owner consumes upstream review serialization as an opaque suffix without trimming the authored prefix.
- Upstream timeline find wrappers consume the same exact-byte body and structured-context projection. Ordinary and review-only composition retain upstream trimming. Retired rendered-document comments create no preservation obligation.
- An empty prompt produces only the helper-owned context block.
- A whitespace-only prompt remains intact ahead of the helper-owned separator and context block.
- Helpers that expose prompt extraction remove only the two-newline separator they inserted.
- User-authored text that resembles a helper marker round trips without stealing bytes from the prompt.
- Terminal and selected element extraction select the final helper-owned block when earlier user content contains complete or incomplete marker-like text.

## Durable Owners

- `apps/web/src/fork/chatPromptContext.ts` owns retained-context detection, authored-byte normalization, effort-prefix preservation, and contextual plan follow-up composition.
- Its `formatReferencedChatPrompt` adapter preserves authored bytes around upstream Claude effort prefixes for retained context in v2 dispatch and queued edits.
- Current upstream sends context as structured records beside inline references, so the former trailing-block helpers in `terminalContext.ts`, `elementContext.ts` and `previewAnnotation.ts` and the separate separator owner are retired; legacy trailing blocks are composed and read only by the shared legacy adapters below.

## Upstream Sensitive Adapters

- `apps/web/src/components/ChatView.logic.ts` hosts upstream's single send formatter `formatOutgoingPrompt` and send snapshot; both call the focused owner when terminal or preview context is retained.
- V2 queued messages are server-owned runs. `useComposerSend.ts`, `chatViewSend.ts`, `useProposedPlanSend.ts` and `useQueuedRunEdit.ts` pass structured context and authored text through the same focused owner for dispatch, multiple-model sends, queued edits, and plan follow-ups; no client queue sender is restored.
- `packages/shared/src/composerContextLegacySend.ts` and `composerContextLegacy.ts` preserve the authored prefix around generated legacy context for older servers. The reader removes at most the two generated separator newlines; historical text without separator provenance cannot recover already discarded bytes. Terminal and selected element blocks are read only when they open on their own line and their body crosses no later same-tag opener, so the final helper block is selected and earlier marker-like text stays authored.
- `apps/web/src/lib/composerContextRecords.ts` resolves structured context and upgrades retained legacy blocks for display. `TimelineUserMessageRow.tsx` renders the authored body and `UserMessageContextChips.tsx` the context chips alongside upstream review from the current v2 item projection.

## Upstream Substrate

- composer draft ownership and persistence
- prompt stash mechanics
- provider intent
- attachment budgets and rich draft state
- send failure recovery

## Non Ownership Boundaries

- F04 does not own draft persistence, prompt stash storage, rich composer state, provider selection, or attachment budgets.
- F04 does not change stash save or restore whitespace behavior.
- F04 does not add composer chrome, screenshot attachment, or a parallel composer state owner.

## Verification

- `chatPromptContext.test.ts` covers empty, whitespace-only, leading, trailing, and mixed whitespace composition, context-free and review-only trimming, exact retained bytes, Claude effort prefixes, structured context detection, and contextual plan follow-ups.
- `chatSendSeam.test.ts` covers the upstream formatter and send snapshot with and without retained context.
- `packages/shared/src/composerContextLegacySend.test.ts` proves the legacy composer keeps whitespace-only and padded prompts ahead of the generated separator and context blocks.
- `packages/shared/src/composerContextLegacy.test.ts` proves terminal, selected element and preview annotation extraction removes only the generated separator, and that complete inline, incomplete and stray-closer marker-like text before a terminal or selected element block stays authored text while the final helper block becomes the chip. Repeated identical legacy blocks still all peel, matching upstream.
- `composerContextRecords.test.ts` covers structured and upgraded legacy context resolution.
- `fork/timelineMessagePresentation.browser.test.tsx` mounts the timeline with mixed terminal, selected element, preview annotation and upstream review context, and feeds a v2 `user_message` item through `deriveTimelineEntriesFromVisibleTurnItems` to prove the rendered body keeps authored whitespace and no generated block leaks.

## Reconciliation Rule

Accept upstream composer draft, stash, attachment, provider, and failure-recovery ownership. Preserve the narrow retained-context byte boundary and display projection. Keep upstream source-review models and serialization unchanged. Inline terminal placeholders still materialize as their intended labels before composition.
