import { ProviderDriverKind, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatOutgoingPrompt, snapshotComposerSend } from "../components/ChatView.logic";

// Host-replacement evidence for F04 and F30 through upstream's single send formatter.
const codex = ProviderDriverKind.make("codex");
const selection = { instanceId: "codex", path: "/skills/poteto-mode/SKILL.md" };
const format = (input: Partial<Parameters<typeof formatOutgoingPrompt>[0]> & { text: string }) =>
  formatOutgoingPrompt({ provider: codex, model: null, models: [], effort: null, ...input });

describe("outgoing prompt seam", () => {
  it("keeps upstream trimming without retained context or a mode", () => {
    expect(format({ text: "  ordinary\n" })).toBe("ordinary");
  });

  it("preserves authored bytes when structured context travels beside the message", () => {
    expect(format({ text: " \n keep  \n\t", hasRetainedContext: true })).toBe(" \n keep  \n\t");
  });

  it("invokes Poteto Mode once before context and effort formatting", () => {
    expect(format({ text: "goal", potetoMode: selection })).toBe("$poteto-mode\ngoal");
    expect(format({ text: "$poteto-mode goal", potetoMode: selection })).toBe("$poteto-mode goal");
    expect(format({ text: "/compact", potetoMode: selection })).toBe("/compact");
    expect(format({ text: "  goal ", potetoMode: selection, hasRetainedContext: true })).toBe(
      "$poteto-mode\n  goal ",
    );
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
