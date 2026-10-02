# F04 Composer Context Whitespace

Date: 2026-09-05
Status: active

## Intent

Preserve exact user-authored prompt whitespace when helper-owned rich context blocks are appended for sending.

## Required Behavior

- Terminal, selected element and preview annotation composition preserve authored prompt bytes before appending generated context.
- When retained context accompanies upstream source review, the final composition owner consumes upstream review serialization as an opaque suffix without trimming the authored prefix.
- Ordinary and review-only composition retain upstream trimming. Retired rendered-document comments create no preservation obligation.
- An empty prompt produces only the helper-owned context block.
- A whitespace-only prompt remains intact ahead of the helper-owned separator and context block.
- Helpers that expose prompt extraction remove only the two-newline separator they inserted.
- User-authored text that resembles a helper marker round trips without stealing bytes from the prompt.
- Terminal and selected element extraction select the final helper-owned block when earlier user content contains complete or incomplete marker-like text.

## Durable Owners

- `apps/web/src/fork/promptContextWhitespace.ts` owns exact generated separation.
- `apps/web/src/fork/chatPromptContext.ts` owns retained-context detection, authored-byte normalization, effort-prefix preservation, and contextual plan follow-up composition.
- Its `formatReferencedChatPrompt` adapter preserves authored bytes around upstream Claude effort prefixes for retained context in v2 dispatch and queued edits.
- `apps/web/src/lib/terminalContext.ts`, `elementContext.ts` and `previewAnnotation.ts` keep their focused format and extraction decisions.

## Upstream Sensitive Adapters

- `apps/web/src/components/ChatView.tsx` supplies the current raw prompt and context collections to composition.
- V2 queued messages are server-owned runs. `ChatView.tsx` passes structured context and authored text through the same focused owner for dispatch, queued edits, and plan follow-ups; no client queue sender is restored.
- `packages/shared/src/composerContextLegacySend.ts` and `composerContextLegacy.ts` preserve the authored prefix around generated legacy context for older servers. The reader removes at most the two generated separator newlines; historical text without separator provenance cannot recover already discarded bytes.
- `apps/web/src/lib/composerContextRecords.ts` resolves structured context and upgrades retained legacy blocks for display. `MessagesTimeline.tsx` consumes the current v2 item projection and renders the authored body and context chips alongside upstream review.

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

- Focused helper tests prove empty, whitespace-only, leading, trailing, and mixed whitespace behavior.
- Terminal and selected element tests prove complete and incomplete same-tag marker collisions preserve the exact user prompt.
- Preview annotation tests prove extraction removes only helper-owned separation.
- Mixed source-review tests prove exact prompt bytes remain ahead of unchanged upstream review serialization.
- `chatPromptContext.test.ts` covers context-free and review-only trimming, exact retained bytes, Claude effort prefixes, structured context detection, and contextual plan follow-ups. Legacy reader tests retain marker and generated-separator coverage.
- `MessagesTimeline.test.tsx` covers mixed context display. `MermaidHostIntegration.test.tsx` sends a v2 visible user item through the current projection and timeline with exact authored text and structured review context.

## Reconciliation Rule

Accept upstream composer draft, stash, attachment, provider, and failure-recovery ownership. Preserve the narrow retained-context byte boundary and display projection. Keep upstream source-review models and serialization unchanged. Inline terminal placeholders still materialize as their intended labels before composition.
