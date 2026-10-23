# F22 Visibility-Gated Mermaid Rendering

Date: 2026-09-05
Amended: 2026-10-23 (user decision UD-2026-10-23-1)
Status: active

## Intent

Render Mermaid fences predictably across concurrent Markdown surfaces, streaming updates, theme changes, failures, and scroll movement, using the upstream `pele` renderer.

## Decision History

The 2026-10-23 intake accepted upstream's `pele` renderer and dropped the `mermaid` dependency. Pele renders synchronously into a mounted element, loads each diagram type lazily and colors diagrams through CSS variables bound to semantic theme roles. Global Mermaid configuration and render serialization (F22.D3) retired with the library. The semantic SVG cache, palette conversion, document color observer and per-surface host identities retired because pele output no longer depends on resolved colors or asynchronous render admission.

## Required Behavior

- `mermaid` and `mmd` fences load pele, and each diagram type, only when first needed. KaTeX loads only for diagrams containing math.
- Completed diagrams mount only after their fence enters the visible scroll area. A remounted fence is gated again; it reserves the last rendered height of the same source while pending.
- Remembered heights are bounded by entry count and memory and keyed by exact source.
- Diagram colors follow semantic theme roles through CSS variables, so same-mode palette changes, including transient Omarchy changes, recolor rendered diagrams without another render.
- Failed renderer and diagram-type loads remain retryable. Render errors show the source and reset when the source or theme changes.
- Streaming code remains the highlighted source until the fence closes.
- An unmounted or replaced diagram is destroyed before its successor mounts, so stale output cannot replace newer output.
- A diagram whose height changes above the viewport corrects the scroll position; diagrams in view and live-edge following are left alone.
- Diagrams stay behind the upstream Markdown fence seam with its source toggle, image expansion and find reveal.

## Durable Owners

- `apps/web/src/features/mermaid/mermaidFence.ts` selects the diagram fence languages.
- `apps/web/src/features/mermaid/MermaidVisibleDiagram.tsx` owns visibility gating, height reservation and scroll stability around the upstream diagram.
- `apps/web/src/features/mermaid/mermaidDiagramHeights.ts` owns the bounded height cache.
- `apps/web/src/features/mermaid/mermaidScrollStability.ts` owns the scroll correction decision.

## Upstream Sensitive Adapters

- `apps/web/src/components/ChatMarkdown.tsx` routes fences selected by `mermaidFence.ts` to the upstream fence component.
- `apps/web/src/components/chat/MarkdownMermaidCodeBlock.tsx` wraps the upstream diagram in `MermaidVisibleDiagram`.

## Upstream Substrate

- `apps/web/src/components/chat/MermaidDiagram.tsx`: pele loading, sanitization, math, expansion and load retry
- the `.pele` semantic color variables in `apps/web/src/index.css`
- Markdown fenced-code dispatch, source toggle and find reveal
- message, plan, file, attachment and pull-request Markdown hosts

## Non Ownership Boundaries

- F22 does not replace the general Markdown renderer, syntax highlighter or pele.
- F22 does not allocate review state for ordinary diagrams.
- F22 does not persist rendered SVG or renderer state.
- F22 adds no host-specific identity to Markdown surfaces.

## Verification

- `mermaidFence.test.ts` covers fence languages, exact-source height retention, unusable sizes, the entry bound and lazy pele and KaTeX imports.
- `MermaidVisibleDiagram.browser.test.tsx` covers deferral until scrolled into view, gated remount with reserved height, real pele output following a live semantic color change, and scroll correction for a diagram above the viewport.
- `mermaidScrollStability.test.ts` covers the scroll correction decision.
- `ChatMarkdown.browser.test.tsx` covers routing `mermaid`, `mmd` and `MMD` fences to the diagram block, other fences staying code, and an open streaming fence staying source until it closes.
- `MarkdownMermaidCodeBlock.browser.test.tsx` mounts the fence block with the visibility gate over a stubbed pele and covers the source toggle, find reveal, image expansion, streaming source, diagram-type load retry, render-error reset on source change, crash reset on source or theme change, and destroy-before-remount of a replaced diagram.
- Production build evidence that pele stays split from the initial web runtime belongs to the joined intake gate.

## Reconciliation Rule

Keep pele behind the upstream fence seam and keep visibility gating, height reservation and scroll stability in the owner wrapper. Accept upstream renderer, sanitization and loading changes.
