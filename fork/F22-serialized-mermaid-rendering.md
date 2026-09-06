# F22 Serialized Mermaid Rendering

Date: 2026-09-05
Status: active

## Intent

Render Mermaid fences safely and predictably across concurrent Markdown surfaces, streaming updates, theme changes, failures, and scroll movement.

## Required Behavior

- `mermaid` and `mmd` fences load Mermaid only when first needed.
- Global Mermaid configuration and render work are serialized.
- Pending work and completed semantic cache entries are bounded.
- Cache identity includes exact source, normalized effective semantic colors, source offsets and stable owner-level surface identity. Modern literal colors use the existing theme color converter; composed CSS colors resolve through the live document before conversion to Mermaid-compatible hex with alpha preserved. Invalid values fall back independently by semantic role.
- Same-mode palette updates, including transient Omarchy changes, invalidate rendered colors through one shared document observer with final-subscriber cleanup.
- Failed dynamic imports and renders remain retryable.
- Streaming code remains a source-backed placeholder until complete.
- Stale generations cannot replace newer output.
- Successful render corrects scroll position only when needed.

## Durable Owners

- `apps/web/src/features/mermaid/mermaidRenderer.ts`
- `apps/web/src/features/mermaid/mermaidRenderCache.ts`
- `apps/web/src/features/mermaid/MermaidDiagramBlock.tsx`
- `apps/web/src/features/mermaid/mermaidScrollStability.ts`
- `apps/web/src/features/mermaid/mermaidTheme.ts`

## Upstream Sensitive Adapters

- `apps/web/src/components/ChatMarkdown.tsx`
- `apps/web/src/components/chat/MessagesTimeline.tsx`
- `apps/web/src/components/chat/ProposedPlanCard.tsx`
- `apps/web/src/components/pullRequest/PullRequestMarkdown.tsx` and its description, comment, review-thread, timeline and editor hosts
- `apps/web/src/components/files/FileMarkdownPreview.tsx`
- `apps/web/src/features/mermaid/mermaid.css` and its import in `apps/web/src/index.css`

## Upstream Substrate

- Markdown fenced-code dispatch
- theme state and semantic colors
- message and pull-request surface identity

## Non Ownership Boundaries

- F22 does not replace the general Markdown renderer or syntax highlighter.
- F22 does not allocate review state for ordinary diagrams.
- F22 does not persist rendered SVG or Mermaid runtime state.

## Verification

- renderer tests cover lazy import, import retry, serialization, theme identity, stale generations, bounded pending work, cache eviction, failure source, and scroll correction.
- Host integration tests cover streaming completion, stable message, plan, file and pull-request identities, source offsets, exact current code-block fallback and coexistence with upstream source/PR review.
- production build evidence proves Mermaid remains split from the initial web runtime.

## Reconciliation Rule

Keep Mermaid behind the current Markdown fence adapter and preserve the isolated serialized renderer and bounded semantic cache.

## Current Fence Contract

`ChatMarkdown` delegates only `mermaid` and `mmd` fences. Other languages and fallback source use its existing Markdown code block. Known hosts supply semantic identity; standalone callers receive a stable React instance fallback. The owner uses strict Mermaid rendering and bounds serialized work and caches. It does not restore F09 document rendering, F21 rendered-document review or their CSS variants. The dependency is pinned to accepted origin Mermaid `11.16.1`; final build evidence belongs to the joined intake gate.
