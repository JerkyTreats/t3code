# F30 Poteto Mode Workflow

Date: 2026-10-10
Status: local workflow and composer spike

## Intent and protected decisions

Concern F30-C1 is an arbitrary user goal routed through pstack-style rigor in T3 Code, without a Cursor runtime.

- F30-D1: `$poteto-mode` plus a goal selects one of 23 adapted guide playbooks or a bespoke fallback. Follow-ups retain the active goal; new task rematches; an explicit exit ends the mode.
- F30-D2: The matched playbook's steps become the visible plan. Skipped steps and unavailable proof remain explicit. Planning, diagnosis, status and audit requests retain their stated scope.
- F30-D3: T3's live capability catalog, delegated task IDs, terminal delivery, parent-owned PR watches and explicitly authorized schedules replace Cursor-specific machinery.
- F30-D4: Real-artifact evidence supports completion. Independent review has an exact patch identity. Long runs retain a bounded decision trail outside the repository.
- F30-D5: Community-derived instructions preserve existing user grants, fork rules and workspace isolation. They do not grant publication, deletion, dependency installation or recurring provider work.
- F30-D6: A compact P toggle in the shared chat composer persists the selected Poteto skill identity per environment and preallocated thread ID on this client. Sending, clearing draft content, draft promotion and reload preserve the choice. Turning off removes it. Other threads and environments start off.
- F30-D7: Normal provider turns invoke `$poteto-mode` once before existing context and effort formatting. Explicit invocations and leading slash commands remain unchanged. Literal question answers, approvals and queued-message edits bypass this injection. Plan follow-ups use the mode; a new plan implementation thread inherits it.
- F30-D8: The toggle uses native button semantics, a stable accessible name, pressed state, a check mark, existing composer tokens and focus rings, keyboard activation, and existing coarse pointer targets. Missing or replaced skills and provider changes fail closed for normal sends; off remains reachable. This spike supports Codex and one model at a time.

## Durable owner and integration boundary

The owner is `.agents/skills/poteto-mode/`. `SKILL.md` owns routing and task continuity. `playbooks/` owns per-outcome steps. `references/t3-runtime.md` owns the T3 mapping; the other references own principle cues, design and review procedures, and decision trails.

`apps/web/src/fork/potetoMode.ts` owns skill eligibility, provider and identity failures, scope keys and idempotent invocation. `potetoModeStore.ts` owns client-local persisted on/off state and validates restored storage. `PotetoModeControl.tsx` owns the P presentation and toggle interaction. `ChatComposer.tsx` mechanically maps the selected catalog, draft scope, validation and toolbar into those owners; `ChatView.tsx` routes the captured selection through existing send formatting and copies it when creating a plan implementation thread. Existing composer controls, native skill discovery and browser storage are substrate.

The web app, Electron desktop and Thread client share this composer. Native mobile has a separate composer and is outside this bounded spike. Codex supports native dollar invocation; Claude, Cursor, Grok, OpenCode and Antigravity remain unavailable in this toggle until their invocation contracts are adapted. Local, hosted, remote and tunnel web clients use the selected environment's catalog; no server address is embedded. Mode state stays on this client and does not synchronize between devices. Multi-model draft fanout requires turning it off.

There is no provider wire change or system-prompt injector. The reviewed global skill snapshot provides invocation outside this checkout and is not part of the app bundle. The toggle cannot enable an absent skill and does not install provider plugins. The unchanged community-derived bundle retains its existing security lock.

## Provenance and review

The source is official `cursor/plugins`, pstack at commit `d73344bee8cf22e53b9d5f4cf5749d38ba38c174`, under MIT. This is a rewritten T3 adaptation, not unchanged upstream bytes. [The source lock](F30-poteto-mode-source-lock.json) records the complete reviewed bundle hashes, source scope, findings and checks. No upstream executable helpers, dependencies, agents, installers or automation packs are included.

The adaptation removes blanket external-action grants, unconditional PR creation, hard-coded model names, force cleanup and reset shortcuts. It protects unrelated work and task-scopes history reads. T3's native tool contracts remain authoritative.

## Verification and limits

Focused frontmatter validation and file-graph checks pass. All 23 guide routes plus the fallback resolve to bounded numbered procedures, and every workflow reference is reachable. Fourteen representative routing cases received manual review, including no-edit, plan-only, continuation, new task, explicit pause, unattended continuation, status-only, shipping and audit boundaries. Installed files match the recorded hashes.

No workflow compliance evaluation or independent judge ran. Static validation proves packaging and inspected instruction intent; it does not prove LLM compliance, persistent runtime lifecycle, uninterrupted autonomous work or behavior in every provider. The first user goal is the behavioral spike. The composer adds source changes and therefore requires the full repository gates. Owner tests replace the historical host while retaining invocation and persisted choices. Actual composer tests click the P, clear and remount the draft, disable the choice, and exercise unavailable skill and command validation. An isolated headless browser pass verified on/off persistence, keyboard operation, narrow layout and the actual outgoing invocation. A test-only websocket interceptor prevented the final synthetic turn from reaching the provider; an earlier synthetic turn was interrupted after a missed intercept. Model workflow compliance remains unevaluated.

## Reconciliation rule

Preserve the explicit invocation, route, proof contract and composer decisions through the declared owners and thin adapters. Refresh T3 mappings against the active tool contracts when upstream changes. Review and lock any changed community-derived bytes before making an updated snapshot available. Do not turn this skill into an automatic policy for unrelated tasks.
