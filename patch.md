# Patch Guide

Status: current implementation index for the accepted local intake

This index describes the implemented fork responsibilities. The [intake ledger](.ledger/upstream-intake-program.md) and [preservation evidence](.ledger/upstream-intake-evidence.json) record the accepted local product gate, exact tested source and explicit runtime limits.

Review this guide and the relevant active specification before changing fork behavior. Update the active contract and this guide in the same completed change. Historical source and plans do not independently require replay.

Upstream is a read-only intake source. Exact origin is the only product repository and publication target. Follow the [reconciliation policy](governance/upstream_merge_policy.md) and [fork isolation policy](governance/fork_isolation_policy.md).

## Active Repository Responsibilities

[F18 protected onboarding and workstream ledgers](fork/F18-protected-onboarding-and-workstream-ledgers.md) owns fork-first documentation, clone authorization, privacy and the implementation ledger. [F19 delivery skills and Commit Effects](fork/F19-repository-delivery-skills-and-commit-effects.md) owns the local workflow and commit-effect record. The accepted intake evidence covers the runtime and client responsibilities indexed below.

The [retired-feature record](fork/retired-features.md) preserves the approved retirement decisions as history. It creates no active replay or compatibility obligation. Upstream ordinary sending, Markdown, mobile outbox, prompt stash, and source/PR review remain the intended surviving substrate; their integrated acceptance is recorded in the intake ledger.

## Persistence

[Fork persistence compatibility](fork/persistence-compatibility.md) owns migration lineage selection, retained historical cleanup and upstream continuation identities. Keep `Migrations.ts` mechanical and preserve the single upstream transactional runner. The current server passes historical migration, retained consumers, reopen and matching-old restore.

## Repository And Runtime Authority

[F06 exact-origin identity](fork/F06-exact-origin-repository-identity.md) owns origin selection, provider binding and mutation authorization. Current upstream Git and provider hosts call those owners, including startup and background automatic pull. Hosted URL selectors are bound to origin before CLI execution; GitHub qualified branch selectors retain their ordinary meaning.

[F01 desktop release identity](fork/F01-exact-origin-desktop-release.md) owns exact-origin update metadata, verified Linux descriptors bound to the full build revision and registry-free SSH runtime acquisition. [F20 origin server image](fork/F20-origin-server-image.md) owns private build context, origin image publication rules and operator-managed headless updates. Desktop-controlled updates remain available. The evidence index binds accepted installed artifacts and the actual local image runtime to the tested source.

The web update owner also controls inferred reconnect progress. Only desktop-managed capability may infer a lost update; unsupported runtimes retain deployment guidance, while actual running update progress survives transient descriptor loss.

The server image uses the frozen dependency graph's platform packages without globally forcing native compilation. Its exact Dockerfile policy remains enforced by the image workflow scanner. Local image verification and promotion share the same available digest-pinned Skopeo helper.

## External Admin

[F17 external Admin authority](fork/F17-settings-admin.md) owns persisted and signed portal authority, the six-route HTTP boundary, explicit enrollment, private revisioned lifecycle, exact connection teardown and pre42 backup. Standard clients retain pairing consumption and ordinary authentication; embedded access inventory and mutation UI are absent. The transport adapters register the shared authority services and recheck admission before WebSocket work. Joined transport, independent-runtime authority and current installed disable/re-enable proof pass within the recorded synthetic fixture limits.

## Global Board And Collective

[F25 environment-global Board](fork/F25-environment-global-board.md) owns trusted pseudonymous agent authorship, stable post ordering, revision conflicts, deliberate history and bounded replay. The Board subscription owner filters before buffering and the WebSocket host acquires its stream before querying a snapshot. Shared client owners project the global Board into the current right panel. Standard credentials may read and subscribe; owner correction requires access-write authority. Portal credentials gain no Board access.

The provider capability owner admits Board for Codex, Claude, Cursor, Grok and local OpenCode. Antigravity and unknown provider kinds receive no Board grant. Preview remains independently controlled. `TurnWritePolicy.ts` holds session-wide write denial while Plan work is pending, queued or running. Provider lifecycle adapters release that denial only when all admitted Plan work is definitively terminal. Ambiguous send failures and uncorrelated exits remain denied until credential revocation or replacement. Credential transitions cancel admitted local sends and await their finalizers before replacement, so delayed attachment reads or queued preparation cannot enter a new writable session. Normal sends remain concurrent. The registry can restore writes only for an already admitted Board credential. Provider adapters attach each MCP endpoint only with its matching capability.

[F28 Collective instructions](fork/F28-board-user-submit-liaison.md) owns the Codex root-thread instruction cadence and current-submit opt-out. It is a prompt contract whose actual participation depends on the provider; it does not guarantee durable exactly-once execution. Server-issued credentials remain the authority for Board tools. Joined source acceptance is tracked in the intake ledger.

## Retained Presentation And Client Adapters

[F02 Omarchy system theme](fork/F02-omarchy-system-theme.md) keeps coherent local observation and an exact-seed restrained transient palette through current semantic roles. Explicit appearance, preview and onboarding retain upstream precedence. No Omarchy preference or general theme generator is added.

[F03 desktop screenshot capture](fork/F03-desktop-screenshot-capture.md) exposes optional top-level desktop capture independently of upstream preview capture. The composer uses a scoped reservation shared with ordinary attachment admission, then transfers one validated PNG through the current image path.

[F04 context whitespace](fork/F04-composer-context-whitespace.md) preserves authored bytes when terminal, element or preview context is appended, including mixed upstream source review. The focused composition and display owner preserves generated ordering and removes only inserted separation. Ordinary and review-only trimming remains upstream behavior.

[F22 Mermaid rendering](fork/F22-serialized-mermaid-rendering.md) adds one fence adapter to upstream Markdown. A bounded serialized owner handles theme-sensitive rendering, stable semantic identity, retries and stale results across message, plan, file and PR surfaces. The retired document renderer and rendered-document review remain absent.

[F23 preview controls](fork/F23-preview-browser-controls.md) owns focused new, confirmed close and reopen actions, exact scoped runtime identity and ten-entry successful-close history. Current preview sessions, profiles and browser presentation remain upstream substrate. Optional exact zoom restoration consumes the existing normalized Manager operation.

These source adapters passed S5 source and visual acceptance. Their current host, visual and installed acceptance status belongs to the intake ledger. [Ordinary chat and draft appearance](fork/chat-and-draft-presentation.md) keeps the captured message hierarchy, centered draft, plan presentation, floating permission control, full-width checkout strip and composer geometry while consuming current upstream sending, attachments and Markdown.

## Linux And Hosted Thread

The server enforces F27 ticket consumption through the focused `WebSocketTicketAdmission.ts` owner inside its existing session store. A signed random nonce permits one admission attempt after current expiry and parent-authority checks. Pending tickets have a finite capacity, expire lazily and fail closed across restart or another runtime. Reusable enrollment remains unchanged; a new connection requests a fresh ticket.

[F16 official Linux launcher](fork/F16-official-linux-desktop-launcher.md) owns isolated standalone Code identity, verified launch admission, readiness withdrawal and transactional production topology. Selection occurs before bundled backend allocation. Trusted Code launcher submission consumes ordinary send admission; completion retry does not resend. Server lifecycle remains independent.

The desktop runtime and launcher select the same channel-specific handoff directory. Staging readiness cannot use production handoff state. F27 scoped external launches retain the requested working directory and default fresh launches to home; the hosted project owner opens an ordinary local draft in that primary project without sending its prefill. The staging desktop harness verifies these outcomes against real clients while preserving core Code and server identities.

[F27 T3 Thread](fork/F27-t3-thread.md) owns the separate hosted Electron shell, one process/window/profile/extraction per launch, protected exact-origin enrollment and staging-only activation. The web consumes the current full chat behind compact outer presentation. Main retries pending delivery after the main-frame loading flag clears and retains acknowledged staging across document reload; pending completion remains an explicit recovery state. Fresh one-use WSS tickets keep reusable credentials outside renderer state. The primary HTTP adapter preserves browser fetch invocation semantics while enforcing its exact-origin boundary. Successful Thread pairing resumes the discovered primary connection before chat navigation, so a ticket denial from before enrollment does not leave the launch waiting. Current source and installed acceptance status belongs to the intake ledger.

Thread enrollment binds the request origin and rejects redirects while accepting Electron's absent response URL metadata. Supplied foreign response metadata remains invalid.

## Verification

Source and runtime build-input changes require `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. Native mobile changes also require `pnpm lint:mobile`. Use synthetic state and keep client installation, production changes and publication within their explicit authorization.
