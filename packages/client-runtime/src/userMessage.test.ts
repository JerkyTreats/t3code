import { ScheduledTaskId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveUserMessagePresentation } from "./userMessage.ts";

describe("resolveUserMessagePresentation", () => {
  const legacyText = "[Triggered by schedule task: Daily audit]\n\nCheck for crashes.\n";

  it("removes attribution from legacy scheduled prompts", () => {
    expect(
      resolveUserMessagePresentation({ role: "user", createdBy: "agent", text: legacyText }),
    ).toEqual({
      text: "Check for crashes.\n",
      attribution: "automation",
      scheduledTaskId: undefined,
    });
  });

  it("uses task metadata without changing the prompt", () => {
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        scheduledTaskId: ScheduledTaskId.make("task-1"),
        text: legacyText,
      }),
    ).toEqual({ text: legacyText, attribution: "automation", scheduledTaskId: "task-1" });
  });

  it("preserves user-written and assistant-quoted schedule headers", () => {
    for (const message of [
      { role: "user", createdBy: "user" as const },
      { role: "user" },
      { role: "assistant", createdBy: "agent" as const },
    ]) {
      expect(resolveUserMessagePresentation({ ...message, text: legacyText })).toEqual({
        text: legacyText,
        attribution: null,
        scheduledTaskId: undefined,
      });
    }
  });

  it("leaves other agent prompts and embedded headers intact", () => {
    for (const text of [
      "Review this area",
      `Quoted prompt:\n${legacyText}`,
      "[Triggered by schedule task: Daily audit]",
    ]) {
      expect(resolveUserMessagePresentation({ role: "user", createdBy: "agent", text })).toEqual({
        text,
        attribution: "agent",
        scheduledTaskId: undefined,
      });
    }
  });

  it("attributes older server-sent restart continuations to T3 Code, not another agent", () => {
    const text = "Note: the T3 server restarted.";
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        creationSource: "server",
        text,
      }),
    ).toMatchObject({ attribution: "t3code" });
    for (const creationSource of ["mcp", "provider"] as const) {
      expect(
        resolveUserMessagePresentation({ role: "user", createdBy: "agent", creationSource, text }),
      ).toMatchObject({ attribution: "agent" });
    }
  });

  it("recovers the triggering automation from older scheduler message ids", () => {
    for (const trigger of ["scheduled", "manual"]) {
      expect(
        resolveUserMessagePresentation({
          id: `scheduled-task-message:task:daily-audit:1788661140000:${trigger}`,
          role: "user",
          createdBy: "user",
          text: legacyText,
        }),
      ).toEqual({
        text: "Check for crashes.\n",
        attribution: "automation",
        scheduledTaskId: "task:daily-audit",
      });
    }
  });
});

describe("Poteto invocation presentation", () => {
  it("keeps current sender attribution while hiding invocation in every user return", () => {
    const text = "$poteto-mode\n  Preserve spacing\n";
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        creationSource: "server",
        text,
      }),
    ).toEqual({ text: "  Preserve spacing\n", attribution: "t3code", scheduledTaskId: undefined });
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        creationSource: "mcp",
        text,
      }).attribution,
    ).toBe("agent");
    expect(
      resolveUserMessagePresentation({
        role: "user",
        scheduledTaskId: ScheduledTaskId.make("synthetic-task"),
        text,
      }),
    ).toEqual({
      text: "  Preserve spacing\n",
      attribution: "automation",
      scheduledTaskId: "synthetic-task",
    });
    expect(
      resolveUserMessagePresentation({
        role: "user",
        createdBy: "agent",
        text: `[Triggered by schedule task: Synthetic]\n\n${text}`,
      }),
    ).toEqual({
      text: "  Preserve spacing\n",
      attribution: "automation",
      scheduledTaskId: undefined,
    });
  });
  it.each([
    ["$poteto-mode\nFix the button", "Fix the button"],
    ["$poteto-mode\r\nFix the button", "Fix the button"],
    ["$poteto-mode\n  Keep spacing\n", "  Keep spacing\n"],
    ["Explain $poteto-mode", "Explain $poteto-mode"],
    ["$poteto-mode", "$poteto-mode"],
    ["$poteto-mode\n", "$poteto-mode\n"],
    ["$poteto-mode-extra\nHello", "$poteto-mode-extra\nHello"],
  ])("presents %j without changing authored content", (text, expected) => {
    expect(resolveUserMessagePresentation({ role: "user", text }).text).toBe(expected);
    expect(resolveUserMessagePresentation({ role: "assistant", text }).text).toBe(text);
  });
});
