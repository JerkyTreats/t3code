import { OrchestratorMcpFailure, PageStateDocument, PageStateKey } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadCanvasStore from "../../../canvas/ThreadCanvasStore.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as PageStateStore from "../../../pageState/PageStateStore.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

// This affects only the caller's thread, not its workspace, so read-only sandboxes and plan mode may use it.
const PageStateTool = Tool.make("page_state", {
  description:
    "This thread's page state: JSON documents by key that pages read with t3.state.subscribe(key, (value, revision) => ...) or t3.state.get(key) and edit with t3.state.set(key, value) or t3.state.merge(key, patch), each with an optional {expectedRevision}. No arguments lists them; key alone returns one; set replaces it; merge applies an RFC 7386 patch (null removes a key).",
  parameters: Schema.Struct({
    key: Schema.optional(PageStateKey),
    set: Schema.optional(Schema.Json),
    merge: Schema.optional(Schema.Json),
    expectedRevision: Schema.optional(Schema.Int).annotate({
      description: "Write only at this revision; 0 means unwritten.",
    }),
    reveal: Schema.optional(Schema.Boolean).annotate({
      description: "Bring canvas html cards whose stateKeys name this key beside the latest turn.",
    }),
  }),
  success: Schema.Struct({
    documents: Schema.optional(
      Schema.Array(
        Schema.Struct({
          key: Schema.String,
          revision: Schema.Int,
          updatedBy: Schema.optional(Schema.Literals(["agent", "user"])),
        }),
      ),
    ),
    document: Schema.optional(PageStateDocument),
    revision: Schema.optional(Schema.Int),
    revealed: Schema.optional(Schema.Array(Schema.String)),
  }),
  failure: OrchestratorMcpFailure,
  failureMode: "return",
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ThreadCanvasStore.ThreadCanvasStore,
    PageStateStore.PageStateStore,
  ],
})
  .annotate(Tool.Title, "Page state")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false)
  .annotate(Tool.OpenWorld, false);

export const PageStateToolkit = Toolkit.make(PageStateTool);
