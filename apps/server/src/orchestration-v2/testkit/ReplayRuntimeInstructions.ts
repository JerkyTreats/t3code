import type { ProviderDriverKind, ProviderReplayTranscript } from "@t3tools/contracts";

import { buildRuntimeInstructions } from "@t3tools/provider-core/server/runtimeInstructions";

/** Adds current runtime context to legacy prompt expectations, keeping outbound matching exact. */
export function materializeReplayTranscriptRuntimeInstructions(
  transcript: ProviderReplayTranscript,
  runtime: { readonly driver: ProviderDriverKind; readonly model: string },
): ProviderReplayTranscript {
  if (runtime.driver === "muse") {
    // Upstream recordings address PR tools through the main MCP endpoint.
    // This fork admits those tools on the independent PR endpoint. Rebase only
    // that exact phrase in Muse's runtime block; all other bytes stay exact.
    const legacy =
      "</runtime_info>\n\n<pull_request_linking>\nWhen the t3-code MCP server exposes link_pull_request,";
    const current =
      "</runtime_info>\n\n<pull_request_linking>\nWhen the t3-code-pull-requests MCP server exposes link_pull_request,";
    return {
      ...transcript,
      entries: transcript.entries.map((entry) => {
        if (entry.type !== "expect_outbound") return entry;
        const frame = entry.frame;
        if (
          typeof frame !== "object" ||
          frame === null ||
          !("method" in frame) ||
          frame.method !== "turn/start" ||
          !("params" in frame) ||
          typeof frame.params !== "object" ||
          frame.params === null ||
          !("input" in frame.params) ||
          !Array.isArray(frame.params.input)
        )
          return entry;
        const input: ReadonlyArray<unknown> = frame.params.input;
        const first = input[0];
        if (
          typeof first !== "object" ||
          first === null ||
          !("type" in first) ||
          first.type !== "text" ||
          !("text" in first) ||
          typeof first.text !== "string" ||
          !first.text.startsWith("<runtime_info>") ||
          !first.text.includes(legacy)
        )
          return entry;
        return {
          ...entry,
          frame: {
            ...frame,
            params: {
              ...frame.params,
              input: [{ ...first, text: first.text.replace(legacy, current) }, ...input.slice(1)],
            },
          },
        };
      }),
    };
  }
  const harness =
    runtime.driver === "cursor"
      ? "Cursor"
      : runtime.driver === "grok"
        ? "Grok"
        : runtime.driver === "acpRegistry"
          ? "acpRegistry"
          : undefined;
  if (harness === undefined) return transcript;
  const instructions = buildRuntimeInstructions({ harness, model: runtime.model });

  return {
    ...transcript,
    entries: transcript.entries.map((entry) => {
      if (entry.type !== "expect_outbound") return entry;
      const frame = entry.frame;
      if (typeof frame !== "object" || frame === null) return entry;
      if (
        runtime.driver === "cursor" &&
        "type" in frame &&
        frame.type === "run.start" &&
        "message" in frame &&
        typeof frame.message === "string"
      ) {
        return frame.message.endsWith(instructions)
          ? entry
          : { ...entry, frame: { ...frame, message: `${frame.message}\n\n${instructions}` } };
      }
      if (
        "method" in frame &&
        frame.method === "session/prompt" &&
        "params" in frame &&
        typeof frame.params === "object" &&
        frame.params !== null &&
        "prompt" in frame.params &&
        Array.isArray(frame.params.prompt)
      ) {
        const prompt: ReadonlyArray<unknown> = frame.params.prompt;
        const lastPart = prompt.at(-1);
        if (
          typeof lastPart === "object" &&
          lastPart !== null &&
          "type" in lastPart &&
          lastPart.type === "text" &&
          "text" in lastPart &&
          lastPart.text === instructions
        ) {
          return entry;
        }
        return {
          ...entry,
          frame: {
            ...frame,
            params: { ...frame.params, prompt: [...prompt, { type: "text", text: instructions }] },
          },
        };
      }
      return entry;
    }),
  };
}
