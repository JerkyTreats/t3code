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
    "Read or write this thread's page state: named JSON documents that pages from html_render and canvas html cards read live with t3.state and the user edits through them. Write a page once to render from t3.state, then change its data here: open pages update in place. Delegated tasks share their delegator's state. No arguments lists documents; key alone returns one; set replaces it; merge applies an RFC 7386 merge patch (null removes a key). expectedRevision refuses to overwrite a newer edit.",
  parameters: Schema.Struct({
    key: Schema.optional(PageStateKey),
    set: Schema.optional(Schema.Json).annotate({ description: "The document's whole new value." }),
    merge: Schema.optional(Schema.Json).annotate({
      description: "Merged into the current value, such as {rows:{api:{stage:'Verification'}}}.",
    }),
    expectedRevision: Schema.optional(Schema.Int).annotate({
      description: "Write only if the document is at this revision; 0 means not written yet.",
    }),
    reveal: Schema.optional(Schema.Boolean).annotate({
      description:
        "After writing, bring canvas html cards whose stateKeys name this key beside the latest turn.",
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
