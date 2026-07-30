# F9 Plan Markdown Preview And Document Markdown Rendering Behavior

Date: 2026-06-02
Status: active

## Intent

Plan review, project document preview, and markdown presentation preserve fork specific preview flows, navigation behavior, and readability guarantees instead of falling back to a narrower generic reference surface.

## Required Behavior

- Proposed plans can open into a fullscreen in memory markdown preview without requiring a workspace file write first.
- Plan preview keeps plan specific actions such as copy, download, and explicit save to workspace.
- Plan preview keeps route driven return behavior so the user can move back to chat cleanly.
- Chat markdown, plan preview markdown, and project document markdown all preserve horizontal overflow handling for wide tables and code blocks.
- Document markdown owns a richer rendering surface than chat markdown, including stable heading ids, local heading anchors, code copy controls, syntax highlighting, safe raw HTML support for document oriented tags, and readable document typography.
- Mermaid fenced code blocks render as diagrams in document preview surfaces, with a readable failure state that can expose source when rendering fails.
- Markdown image links in document previews resolve through the document asset pipeline when possible and support image preview or lightbox behavior without breaking external image links.
- Plan preview and project document links keep fork specific navigation behavior for workspace paths, local anchors, and external links.
- Workspace relative links navigate within the document preview or files preview route instead of forcing an editor open when an in app preview target exists.
- Relative links inside nested document files resolve from the document directory while preserving workspace relative metadata from the workspace root.
- External links open through the native shell or supported local API boundary instead of being treated as workspace paths.
- Local hash links scroll to the matching generated heading anchor inside the current document preview.
- The document renderer can hide the source footer when the preview is virtual rather than backed by a real workspace file.
- Project files preview remains part of this feature area because it is the primary in app consumer of document markdown navigation, document preview routing, image resolution, and source file open behavior.
- Document outline affordances remain available when a document preview exposes heading structure.
- Inline code becomes a file link only when the candidate has strong path evidence and its normalized target remains inside the current workspace root.
- Inline code path resolution uses the document directory as cwd while retaining the workspace root as the containment and preview metadata boundary.
- Fenced code, existing markdown links and references, URLs, hosts, commands, globs, bare refs, malformed targets, and workspace escapes remain plain code.
- Inline file links preserve line and column metadata, duplicate basename parent suffixes, copy behavior, preferred editor behavior, and eligible in app preview behavior.
- Known local dotted directories such as `.plans` and `conf.d` remain linkable without requiring an explicit relative prefix while arbitrary dotted host shaped roots remain plain code.
- Only source ranges parsed as standalone markdown inline code can link, so user authored raw HTML attributes cannot opt into linkification or create nested anchors.
- Raw anchor slash syntax follows HTML non-void element semantics and keeps suppressing inline linkification until the matching close tag.
- Markdown project files without a line target default to rendered document mode, with source available as an explicit per-file choice.
- Code files remain code previews and never enter rendered document mode.
- Line-qualified Markdown links enter source mode so file-link reveals can clamp and center the requested line while clearing stale highlights from earlier reveals.
- Diff virtualization keeps a stable selection key and uses the measured header height of `33`, top padding of `0`, bottom padding of `8`, and item gap of `8`.

## Owner Modules

- `apps/web/src/components/ChatMarkdown.tsx`
- `apps/web/src/components/DocumentMarkdownRenderer.tsx`
- `apps/web/src/components/PlanConversationDocument.tsx`
- `apps/web/src/components/files/FilePreviewPanel.tsx`
- `apps/web/src/components/files/fileLineReveal.ts`
- `apps/web/src/components/files/filePreviewMode.ts`
- `apps/web/src/components/DiffPanel.tsx`
- `apps/web/src/components/chat/ProposedPlanCard.tsx`
- `apps/web/src/components/PlanSidebar.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/planPreviewRouteSearch.ts`
- `apps/web/src/documentMarkdown.ts`
- `apps/web/src/lib/diffRendering.ts`
- `apps/web/src/markdown-links.ts`
- `apps/web/src/routes/_chat.$environmentId.$threadId.tsx`
- `apps/web/src/index.css`

## Fork Seams

- document markdown renderer
- markdown link resolver
- file preview panel adapter
- plan conversation document surface
- file preview surfaces
- markdown overflow CSS

## One Shot Origin Rebuild Notes

- Restore markdown link classification before preview route wiring.
- Preserve separate document-link cwd and workspace-root metadata when rebuilding document preview wiring.
- Restore route search state before adding fullscreen preview UI.
- Keep plan preview virtual when no workspace file exists.
- Rebuild document markdown as a richer document surface, not as chat markdown reuse.
- Verify file preview links from chat messages, files panel, and project document previews.
- Keep code file preview behavior distinct from rendered markdown document behavior.
- Rebuild inline code file links through the shared markdown link resolver and keep workspace containment fail closed.
- Derive standalone inline code source ranges from the CommonMark AST and match rendered code nodes against them so custom rendering cannot mistake fenced code, indented code, linked code labels, or user authored raw HTML for linkable file references.

## Origin Rebuild Rule

- Rebuild markdown and document preview changes only from origin-owned changes under the fork plan preview contract.
- Preserve the richer document markdown renderer when origin changes chat markdown internals.
- Preserve route based document preview navigation when origin changes diff, files, plan, or chat route search state.
- Reject origin changes that remove fullscreen in memory plan preview, remove in app project document preview, regress plan or document navigation, remove document outline behavior, disable Mermaid or image preview support, or reintroduce clipped markdown content in protected surfaces.

## Verification

- A proposed plan can open in fullscreen markdown preview from the timeline card and the plan sidebar.
- Returning from fullscreen plan preview restores the chat route without forcing a workspace write.
- Wide markdown tables and code blocks remain horizontally scrollable instead of stretching or clipping the layout in chat markdown, plan preview, and project document preview.
- Workspace path links, local heading links, and external links keep the expected fork navigation behavior in plan preview and markdown document surfaces.
- Relative markdown links can navigate between in app document previews without opening an external editor when a preview route is available.
- Nested document-relative links keep correct workspace relative paths for file panel and preview routing.
- Local heading links scroll to generated heading anchors inside the current document preview.
- Mermaid fenced code renders a diagram or a readable source backed failure state.
- Markdown images in document previews resolve through the asset pipeline and can open in a preview or lightbox when available.
- Document outline entries reflect rendered heading structure and navigate to the selected heading.
- Virtual plan preview hides source file footer while real project document previews keep source open behavior available.
- Code file preview links from chat open the code preview surface and do not render as broken markdown.
- Workspace-contained inline code paths render as file links from chat and nested document previews.
- Ambiguous inline code and targets outside the workspace remain plain code.
- Inline code file links retain line and column labels and disambiguate duplicate basenames by parent suffix.
- Blockquote and list nested fenced code does not contribute hidden paths to duplicate basename disambiguation.
- Raw HTML code markers and code nested inside multiline raw anchors remain non-linkable, including anchors written with slash syntax.
- Markdown project files without a line target open in rendered document mode unless the user explicitly selects source for that file.
- Code files keep the code preview surface.
- Line-qualified Markdown links open source, and repeated file-link reveals center the clamped target line and remove stale highlight state.
- Diff selection remains stable while virtual measurements retain header height `33`, top padding `0`, bottom padding `8`, and item gap `8`.

## Compatibility Checks

- Route search state stays backward compatible or redirects safely.
- External links stay behind native shell or supported local API boundaries.
- Preview routes do not force editor opens when in app preview is available.
