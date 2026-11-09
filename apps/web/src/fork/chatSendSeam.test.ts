import { ProviderDriverKind, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatOutgoingPrompt, snapshotComposerSend } from "../components/ChatView.logic";

// Host-replacement evidence for F04 through upstream's single send formatter.
const codex = ProviderDriverKind.make("codex");
const format = (input: Partial<Parameters<typeof formatOutgoingPrompt>[0]> & { text: string }) =>
  formatOutgoingPrompt({ provider: codex, model: null, models: [], effort: null, ...input });

describe("outgoing prompt seam", () => {
  it("keeps upstream trimming without retained context", () => {
    expect(format({ text: "  ordinary\n" })).toBe("ordinary");
  });

  it("preserves authored bytes when structured context travels beside the message", () => {
    expect(format({ text: " \n keep  \n\t", hasRetainedContext: true })).toBe(" \n keep  \n\t");
  });
});

describe("composer send snapshot", () => {
  const threadId = ThreadId.make("thread-synthetic");
  const terminal = {
    id: "ctx-live",
    threadId,
    terminalId: "default",
    terminalLabel: "Terminal 1",
    lineStart: 1,
    lineEnd: 1,
    text: "pnpm test",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  const base = {
    images: [],
    files: [],
    previewAnnotations: [],
    reviewComments: [],
    threadContexts: [],
    environmentContexts: [],
  };

  it("trims an ordinary prompt", () => {
    const snapshot = snapshotComposerSend({
      ...base,
      prompt: "  hi \n",
      terminalContexts: [],
      sendableTerminalContexts: [],
    });
    expect(snapshot).toMatchObject({ messageText: "hi", hasRetainedContext: false });
  });

  it("keeps whitespace-only and padded prompts intact beside terminal context", () => {
    const snapshot = snapshotComposerSend({
      ...base,
      prompt: " \n\t ",
      terminalContexts: [terminal],
      sendableTerminalContexts: [terminal],
    });
    expect(snapshot).toMatchObject({ messageText: " \n\t ", hasRetainedContext: true });
  });
});
