import { assert, describe, it } from "@effect/vitest";
import { ProviderDriverKind, type ProviderReplayTranscript } from "@t3tools/contracts";
import { materializeReplayTranscriptRuntimeInstructions } from "./ReplayRuntimeInstructions.ts";

const legacy =
  "<runtime_info>Recorded model and effort.</runtime_info>\n\n<pull_request_linking>\nWhen the t3-code MCP server exposes link_pull_request, preserve every remaining instruction.\n</pull_request_linking>";
const current = legacy.replace("the t3-code MCP server", "the t3-code-pull-requests MCP server");
const runtime = { driver: ProviderDriverKind.make("muse"), model: "muse-model" };
const transcript = (text: string, method = "turn/start"): ProviderReplayTranscript => ({
  provider: "muse",
  protocol: "muse.msp-jsonl",
  version: "1.4.2",
  scenario: "runtime-namespace",
  entries: [
    {
      type: "expect_outbound",
      label: "turn/start",
      frame: {
        jsonrpc: "2.0",
        id: 3,
        method,
        params: {
          sessionId: "recorded-session",
          commandId: "recorded-command",
          reasoningEffort: "high",
          workspaceRoots: ["<workspace>"],
          input: [
            { type: "text", text },
            { type: "text", text: legacy },
          ],
        },
      },
    },
    {
      type: "emit_inbound",
      frame: { method: "turn/completed", params: { text: legacy } },
    },
  ],
});

describe("Muse replay runtime instruction namespace", () => {
  it("rebases only the designated PR endpoint phrase while retaining exact request content", () => {
    const recorded = transcript(legacy);
    const result = materializeReplayTranscriptRuntimeInstructions(recorded, runtime);
    assert.deepEqual(result, transcript(current));
    assert.deepEqual(recorded, transcript(legacy));
    assert.deepEqual(materializeReplayTranscriptRuntimeInstructions(result, runtime), result);
  });

  it("leaves user text, other methods, missing runtime markers, and unrelated drivers untouched", () => {
    for (const recorded of [
      transcript("User text naming the t3-code MCP server exposes link_pull_request"),
      transcript(legacy, "other/method"),
      transcript(legacy.replace("<runtime_info>", "")),
      transcript(legacy.replace("link_pull_request", "different_tool")),
    ]) {
      assert.deepEqual(materializeReplayTranscriptRuntimeInstructions(recorded, runtime), recorded);
    }
    const recorded = transcript(legacy);
    assert.deepEqual(
      materializeReplayTranscriptRuntimeInstructions(recorded, {
        ...runtime,
        driver: ProviderDriverKind.make("codex"),
      }),
      recorded,
    );
  });
});
