# Project activity ordering

Project activity order advances on a user-authored prompt or a published final
assistant response. Commentary, streaming text, tools, automatic wake prompts,
and general thread updates do not move a project. Thread creation remains the
initial anchor. Creation and manual sorting keep their existing behavior.

`project-activity.order` is owned by
`packages/client-runtime/src/state/projectActivity.ts`. The owner takes shell
timestamps and returns a sortable timestamp without using mutable update time.
Web sidebar and landing project groups consume it through the private project
timestamp helper in `Sidebar.logic.ts`, which upstream no longer exports;
the desktop shell shares that client. Mobile home project scopes consume the
same owner through `homeThreadList.ts`.

The upstream shell contract, projection queries, and client presentation models
are substrate for the optional `latestPublishedResponseAt` scalar. The server
retains the newest published response across later runs without loading message
bodies into the shell. Its in-memory and SQL projections agree. Codex retains
its native response phase in conversation messages. For providers without a
response phase, a non-streaming assistant message becomes eligible after its
run completes. Empty responses are excluded. Historical messages use the same
completed-run fallback. Migration 85 adds the ordered assistant-message index
used by shell reads; existing messages and runtime state are not rewritten.

Older servers without authored-prompt metadata use their available user-message
timestamp. They cannot provide final-response activity until upgraded. Thread
ordering, lifecycle, unread state, provider execution, and settings are outside
this decision.

`projectActivity.test.ts` directly verifies publication, authored prompts,
background activity, initial anchors, and older shells. `Sidebar.logic.test.ts`
and `homeThreadList.test.ts` exercise the web and mobile adapters with synthetic
shells. `ProjectionStore.test.ts` compares persisted shell reads with an
independently reconstructed projection through commentary, streaming,
publication, later updates, and providers without phase metadata.
`CodexAdapterV2.test.ts` verifies native phase preservation. The direct owner
tests bypass the sidebar host and provide host-replacement evidence.
