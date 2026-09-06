import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { McpCapability } from "./McpInvocationContext.ts";
import {
  getMcpProviderServerAttachments,
  type McpProviderSessionConfig,
} from "./McpProviderSession.ts";

const session: McpProviderSessionConfig = {
  environmentId: EnvironmentId.make("test-environment"),
  threadId: ThreadId.make("test-thread"),
  providerSessionId: "test-session",
  providerInstanceId: ProviderInstanceId.make("custom-codex-instance"),
  capabilities: new Set(),
  authorizationHeader: "Bearer synthetic-token",
};

describe("provider toolkit attachment admission", () => {
  it("requires both admission and an endpoint independently for each toolkit", () => {
    for (const board of [false, true]) {
      for (const preview of [false, true]) {
        for (const boardEndpoint of [undefined, "http://localhost/mcp"]) {
          for (const previewEndpoint of [undefined, "http://localhost/mcp/preview"]) {
            const capabilities = new Set<McpCapability>();
            if (board) capabilities.add("board");
            if (preview) capabilities.add("preview");
            const attachments = getMcpProviderServerAttachments({
              ...session,
              capabilities,
              boardEndpoint,
              previewEndpoint,
            });
            expect(attachments.map((entry) => entry.name)).toEqual([
              ...(board && boardEndpoint ? ["t3-code"] : []),
              ...(preview && previewEndpoint ? ["t3-code-preview"] : []),
            ]);
            for (const attachment of attachments) {
              expect(attachment.endpoint).toBe(
                attachment.name === "t3-code" ? boardEndpoint : previewEndpoint,
              );
              expect(attachment.authorizationHeader).toBe(session.authorizationHeader);
            }
          }
        }
      }
    }
  });

  it("does not treat write-only admission as Board read admission", () => {
    expect(
      getMcpProviderServerAttachments({
        ...session,
        capabilities: new Set(["board-write"]),
        boardEndpoint: "http://localhost/mcp",
      }),
    ).toEqual([]);
  });
});
