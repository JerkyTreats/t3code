# Upstream Product Surfacing Catchup `v0.0.15 -> v0.0.21`

## Goal

Close the remaining product surfacing gaps found during the `v0.0.15 -> v0.0.21` audit.

This is not a full upstream merge plan.

The target is to make upstream product features that were already accepted in the intake notes reachable and coherent in the current fork UI and runtime.

## Audit Result

Most release line features are already surfaced through fork shaped product paths.

Confirmed surfaced areas:

- auth bootstrap, pairing, saved environments, desktop readiness, and backend port selection
- desktop screenshot capture and active draft attachment
- project rename, add project, local folder browse, project favicon, and project setup scripts
- per thread changed file expansion state
- assistant message copy and proposed plan copy
- proposed plan fullscreen preview and workspace save actions
- markdown file link handling and protected document rendering
- responsive plan sidebar and narrow shell behavior
- Git status streaming, worktree setup, branch operations, promotion, and fork first GitHub seams
- Cursor ACP provider settings, status discovery, model picker support, and runtime adapter
- `v0.0.19 -> v0.0.20` settings guard through schema backed settings hydration

Remaining product surfacing gaps:

- generic upstream command palette is absent
- logical project grouping is absent
- OpenCode is exposed in settings, model selection, and the provider runtime

## Non Goals

- Do not replace the fork shell wholesale.
- Do not remove existing sidebar add project, Git panel, file panel, or composer slash command flows.
- Do not weaken fork first GitHub identity, guarded promotion, or worktree cleanup.
- Do not move composer draft ownership out of the composer.
- Do not regress screenshot attach, plan preview, or protected markdown rendering.

## Lane 1 Command Palette Product Surface

Status:

- `implemented`

Upstream source range:

- `v0.0.17 -> v0.0.19`

Relevant intake note:

- `.plans/23-upstream-intake-v0.0.17-to-v0.0.19.md`

Current state:

- filesystem browse RPC substrate exists through project directory and search APIs
- folder browse is surfaced through the sidebar add project flow
- file exploration is surfaced through the project file panel
- keybinding file access is surfaced in settings
- composer slash commands are surfaced in the composer menu
- no generic `CommandPalette` component or `commandPaletteStore` exists

Required product outcome:

- add a fork shaped command palette that gives users a single keyboard reachable action surface
- include actions that are already safe and implemented in product code
- preserve current primary flows as first class surfaces

Initial command set:

- create new thread
- add local project
- clone remote project
- open project folder picker when desktop bridge supports it
- switch to an existing thread
- open current project files panel
- open Git panel for the active thread
- open plan panel when a plan exists
- open settings
- open keybindings file

Implementation notes:

- prefer a small `commandPaletteStore` for open state and query state
- mount the palette in the route shell where global shortcuts already land
- reuse existing NativeApi and orchestration actions instead of duplicating business logic
- keep command execution side effects outside composer draft state
- add empty and unavailable states for commands that require a selected project or thread
- add `commandPalette.toggle` to keybinding schemas and default it to `mod+shift+p`
- bridge add project, clone remote, and folder picker commands into existing sidebar project creation UI through an intent store
- keep command derivation in a pure logic module with deterministic filtering and disabled reasons
- share preferred editor opening between settings, root keybinding warnings, and the command palette

Acceptance:

- a keyboard shortcut opens the palette from the main app shell
- palette actions do not clear or mutate the active composer draft unless the selected command explicitly sends composer content
- palette can navigate to settings and existing threads
- palette can invoke current add project and panel routes without hiding existing sidebar controls
- command labels and disabled reasons are deterministic
- tests cover command derivation, disabled commands, routing commands, and draft preservation

## Lane 2 Logical Project Grouping

Status:

- `implemented`

Upstream source range:

- `v0.0.17 -> v0.0.19`
- `v0.0.19 -> v0.0.20`

Relevant intake notes:

- `.plans/23-upstream-intake-v0.0.17-to-v0.0.19.md`
- `.plans/24-upstream-intake-v0.0.19-to-v0.0.20.md`

Current state:

- sidebar project sort and thread sort settings exist
- project expansion state exists
- project context menu supports rename, path copy, and removal
- no `logicalProject`, `sidebarProjectGrouping`, or `environmentGrouping` stack exists
- current saved environment support exists but sidebar grouping does not use an upstream logical grouping model

Required product outcome:

- add logical project grouping data helpers and settings in a fork shaped way
- keep the current sidebar rendering model unless a direct UI change is needed
- make grouped project presentation preserve plan cues and fork first repository identity

Implementation notes:

- add shared grouping helpers before changing sidebar rendering
- normalize grouping from project cwd and environment metadata
- hydrate missing grouping settings safely through existing settings schema defaults
- keep existing project ids and thread ids authoritative
- do not infer GitHub identity from a grouped project label
- add grouped project tests before UI changes
- add `sidebarProjectGrouping` and `environmentGrouping` client settings with default `none`
- add logical root grouping for concrete project rows while preserving per project actions
- keep manual drag sorting active only when grouping is disabled
- update `patch.md` for the fork protected sidebar cue expectations

Acceptance:

- projects with the same logical root can be grouped without losing individual project context
- plan progress, active thread state, and diff access remain visible in grouped project rendering
- missing or legacy grouping settings hydrate to defaults
- saved remote environments do not collide with local project grouping
- grouped projects preserve current rename and removal behavior for concrete projects
- tests cover grouping derivation, settings hydration, sidebar presentation, and fork identity preservation

## Lane 3 OpenCode Runtime Reachability

Status:

- `implemented`

Upstream source range:

- `v0.0.20 -> v0.0.21`

Relevant intake note:

- `.plans/25-upstream-intake-v0.0.20-to-v0.0.21.md`

Current state:

- OpenCode provider settings exist
- OpenCode provider status and model discovery exist
- OpenCode appears in model picker options
- OpenCode provider snapshots are included in the provider registry
- OpenCode is registered in the provider adapter registry
- selecting OpenCode starts an ACP backed provider session through `opencode acp`
- OpenCode sessions emit canonical provider runtime events through the shared ACP event mapping

Required product outcome:

- make OpenCode runtime sessions start, stop, recover, and stream through the same provider service path as other selectable providers
- keep OpenCode selectable because runtime support now exists

Implemented:

- added `OpenCodeAdapter` and `OpenCodeAdapterLive`
- added `OpenCodeAcpSupport` for `opencode acp --cwd <cwd>` spawning and model application
- allowed the shared ACP runtime to skip `authenticate` for providers such as OpenCode whose current ACP server advertises auth but returns `Authentication not implemented`
- registered OpenCode in `ProviderAdapterRegistryLive` and the server provider layer
- added runtime tests for OpenCode ACP start and prompt event projection
- updated adapter registry tests so OpenCode is included in the default registered provider set

Acceptance:

- selectable providers and runtime adapters agree on OpenCode availability
- starting an OpenCode thread uses the registered ACP adapter
- provider instance routing includes OpenCode because runtime support exists
- provider adapter tests cover OpenCode session start, route spawn args, and runtime event projection

## Cross Lane Verification

Run before closing the catchup work:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- targeted tests for command palette derivation
- targeted tests for logical project grouping
- targeted tests for OpenCode provider runtime or disabled selection behavior
- browser coverage for composer draft preservation around command palette actions

Manual verification:

- open command palette with a non empty composer draft and run a navigation command
- verify the draft is still present
- group projects and confirm plan status cues remain visible
- select OpenCode only when runtime support is available
- start a Cursor session as a regression check for ACP routing
- verify Git panel actions still use fork first repository identity

## Suggested Implementation Order

1. Fix OpenCode runtime reachability or explicitly disable selection.
2. Add command palette substrate and minimal command set.
3. Add logical project grouping helpers and settings hydration.
4. Adapt sidebar grouping presentation after helper tests pass.
5. Run full verification and update the upstream intake notes with the final parity outcome.

## Done Criteria

- every remaining accepted upstream product feature from `v0.0.15 -> v0.0.21` is either surfaced in the product or explicitly documented as intentionally deferred
- OpenCode is no longer half selectable
- command palette exists or the intake note is revised to reject it explicitly
- logical project grouping exists or the intake note is revised to reject it explicitly
- all required checks pass
