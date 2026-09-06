# F27 T3 Thread Hosted Client

Date: 2026-09-05
Status: implemented source, installed acceptance pending

## Protected Outcome

T3 Thread is an independent Electron shell around the full hosted T3 Code chat. Every launch owns one process, one window, a unique writable Chromium profile and a private extraction directory. Code, Thread and the server retain independent lifetimes. Thread starts no backend or cross-process broker.

## Protected Decisions

| Decision | Current product outcome                                                                   | Durable owner and focused evidence                                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F27-D1   | Retain the accepted narrow chat presentation using current shared chat                    | `ThreadClientHeader.tsx`, `threadClientSurface.ts`, ordinary chat presentation owners; header and surface source tests; compact visual acceptance remains pending installed proof |
| F27-D2   | One independently packaged AppImage process, window, profile and extraction per launch    | Thread `main.ts`, `window.ts`, `thread-launcher.mjs`; architecture, window and launcher tests                                                                                     |
| F27-D3   | Load the hosted HTTPS client and compact surface                                          | Thread `window.ts`, web `threadTransport.ts`; exact target and redirect tests                                                                                                     |
| F27-D4   | Compact outer shell retains full current ChatView, timeline, composer and controls        | `threadClientSurface.ts`, `ThreadClientHeader.tsx`; surface/header and coordinator host tests                                                                                     |
| F27-D5   | Open a normal primary-project draft and stage optional exact text without sending         | `fork/threadClientActivation.ts`; owner and actual coordinator tests                                                                                                              |
| F27-D6   | Each process has private Chromium state and independently authenticates                   | Thread `window.ts`, `enrollment.ts`; profile allocation and enrollment tests                                                                                                      |
| F27-D7   | Preserve direct, crash-draft, zero-byte and fd3 launch admission                          | Shared activation decoder, Thread `activation.ts`, `thread-launcher.mjs`; conformance, byte and readiness tests                                                                   |
| F27-D8   | No Thread singleton or activation forwarding                                              | Thread `main.ts` and launcher; actual main composition and concurrent launcher tests                                                                                              |
| F27-D9   | Explicit credential-free HTTPS server target, including explicit validation override      | Thread `window.ts`, launcher and topology owners; target and install tests                                                                                                        |
| F27-D10  | The independent server remains the only backend                                           | Thread `main.ts`; composition and lifecycle tests                                                                                                                                 |
| F27-D11  | V1 activation and current hosted state replace the retired broker and renderer            | Contracts and lightweight decoder, `threadClientActivation.ts`; shared conformance and hosted staging tests                                                                       |
| F27-D12  | Ordinary client launch never signals or forwards to another client                        | Independent Thread main/launcher and Code standalone owners; lifecycle and launcher tests                                                                                         |
| F27-D13  | Client installation and lifecycle never mutate the server lifecycle                       | Topology installer and native bootstrap owners; transaction and protected-server tests                                                                                            |
| F27-D14  | Later launches reuse protected exact-origin Thread enrollment without exposing its bearer | Thread `enrollment.ts`, web `threadTransport.ts` and `threadAuth.ts`; protected storage, bounded exchange, origin and fresh ticket tests                                          |

The approved outbox and queue-shelf retirement removes those historical parts of F27-D4. Current upstream sending, state, Markdown and controls supply the full chat. F22 adds Mermaid through the current Markdown fence boundary. No copied renderer, alternate message model or durable activation queue is restored.

## Ownership And Host Replacement

The Thread package owns process policy, protected enrollment, window admission and launch receipts. Its sandboxed preload exposes one bounded activation subscription, one-way pairing submission and identity-only completion. It contains no reusable bearer or encryption authority. Contracts remain schema-only. The shared decoder executes the same conformance vectors without loading the contracts runtime into preload.

The hosted `threadClientActivation.ts` owner retains one validated launch through authentication remounts, chooses a project only in the primary environment, protects invested drafts and stages exact optional prompt bytes. `ThreadClientActivationCoordinator.tsx` maps current shell state and `useNewThreadHandler` into that owner. Missing shell or project, failed opening and unavailable completion remain visible and recoverable. Retry after failed opening is explicit. Receipt retry after staging does not open another draft or overwrite later authored content.

`threadClientSurface.ts` separates compact presentation from actual bridge ownership of launch navigation. Query or session markers may choose presentation but never authorize protected transport. Current root, index and chat routes and ChatView only compose those decisions. Thread bypasses the first-run wizard and initial automatic navigation while retaining the current command palette, sidebar context, full chat and composer. Ordinary clients keep their upstream bootstrap behavior.

`threadTransport.ts` binds primary HTTP and WSS to the admitted document HTTPS origin before baked or saved targets. Its fetch omits cookies, rejects redirects, checks target drift and returns no renderer bearer. `threadAuth.ts` submits pairing through the one-way bridge and rechecks the actual session. The optional primary ticket capability requests a fresh one-use ticket for every connection attempt. Current platform, HTTP and shared resolver hosts consume this capability and fail without a bearer or cookie fallback after its failure.

Focused owner tests execute policy without historical broad hosts. Main composition, preload, coordinator, primary auth and resolver tests exercise current adapter boundaries. Exact immutable conflict roles and fresh review receipts belong to the intake ledger; path names alone provide no preservation credit.

## Enrollment And Completion Boundaries

Enrollment is one operating-system-encrypted V1 record per exact HTTPS origin under the Thread application data directory. Linux plain-text fallback is rejected. Main bounds pairing input and token response, rejects redirects, validates expiry on every use and injects the bearer only into exact-origin API requests. It strips prior Authorization headers before selecting a target.

Compatible encrypted records remain readable. Only the actual server-issued portal grant determines managed-device class; local record versions, browser labels and pairing text do not establish management. Historical unclassified credentials require explicit portal re-enrollment for managed-device authority. Concurrent successful enrollment writes replace the record atomically. Later launches read the latest complete record; already-open windows keep their admitted credential until expiry or their own re-enrollment. Separate simultaneous grants can create separate server devices. No automatic live convergence is promised.

V1 readiness acknowledges the exact launch identity after the admitted URL loads. It does not prove authentication, socket connection or draft staging. After staging, the renderer sends an identity-only completion receipt. Main validates the current window, main frame, exact origin and launch ID before retaining completion for that process. Matching duplicate receipts are idempotent. Acknowledged activation does not replay after document reload. Reload during an unacknowledged handoff may replay pending activation; no distributed exactly-once claim is made for that failure window.

## Artifact And Installation Boundaries

`scripts/linux-thread-release-artifact.mjs` binds fixed Thread identity, exact source repository, clean source commit, architecture, artifact digest and launcher digest. Thread has no updater metadata or updater. `build-thread-artifact.mjs` rejects dirty or wrong-origin source before mutation and rechecks source identity after build. Hosted web and server identities are recorded separately from the shell artifact.

`thread-launcher.mjs` supervises the actual AppImage and private extraction cleanup. `install-linux-thread.mjs` verifies bytes and ownership before managed writes. The production topology installer composes Code, Thread and native bootstrap with transactional rollback. Explicit disposable smoke roots and launch targets keep validation separate from installation into an existing environment.

## Compatibility And Evidence

V1 activation accepts only exact keys, a lowercase UUID v4, at most 64 KiB UTF-8 envelope and optional at most 32 KiB UTF-8 draft without NUL. Internal empty draft remains valid; zero-byte external input omits draft. Retired broker, adapter RPC, custom renderer and outbox are not active compatibility surfaces. Persistence lineage remains under the dedicated compatibility specification.

Source tests cover these owners and adapters. Packed checks supplement actual preload execution. Installed acceptance still requires clean-build artifacts, real protected storage, portal-managed enrollment, fresh HTTPS session and WSS transport, two independent Thread processes plus Code, byte-exact staged drafts, acknowledged reload and close/crash isolation against synthetic state. The intake ledger records source and installed acceptance separately. No source test or readiness ACK alone establishes installed acceptance.
