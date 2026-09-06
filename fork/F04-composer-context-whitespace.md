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
- `apps/web/src/fork/chatPromptContext.ts` owns retained-context composition and reverse display projection.
- `apps/web/src/lib/terminalContext.ts`, `elementContext.ts` and `previewAnnotation.ts` keep their focused format and extraction decisions.

## Upstream Sensitive Adapters

- `apps/web/src/components/ChatView.tsx` supplies the current raw prompt and context collections to composition.
- `apps/web/src/components/chat/MessagesTimeline.tsx` renders the projected authored body and chips alongside upstream source-review segments.

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
- `chatPromptContext.test.ts` proves context-free and review-only trimming, exact element-only, preview-only, terminal-only and mixed-context bytes, reverse projection, complete and incomplete marker collisions and stable helper ordering.
- `MessagesTimeline.test.tsx` exercises retained context chips and upstream review together through the actual current timeline.

## Reconciliation Rule

Accept upstream composer draft, stash, attachment, provider, and failure-recovery ownership. Preserve the narrow retained-context byte boundary and display projection. Keep upstream source-review models and serialization unchanged. Inline terminal placeholders still materialize as their intended labels before composition.
