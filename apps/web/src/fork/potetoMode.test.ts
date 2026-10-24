import { describe, expect, it } from "vite-plus/test";
import type { ServerProviderSkill } from "@t3tools/contracts";
import {
  applyPotetoMode,
  potetoModeScope,
  potetoModeUnavailableReason,
  resolvePotetoModeSkill,
  potetoModeSubmissionError,
  togglePotetoModeSelection,
} from "./potetoMode";
import { createPotetoModeStore } from "./potetoModeStore";

const skill: ServerProviderSkill = {
  name: "poteto-mode",
  path: "/fixture/skills/poteto-mode/SKILL.md",
  enabled: true,
};
const selection = { instanceId: "codex-main", path: skill.path };

describe("F30 composer Poteto Mode owner", () => {
  it("replaces the composer host while owning toggle transitions and literal/edit bypass", () => {
    const input = {
      selection: null,
      instanceId: "codex-main",
      driver: "codex",
      skills: [skill],
      multipleModels: false,
    };
    const enabled = togglePotetoModeSelection(input);
    expect(enabled).toEqual(selection);
    expect(togglePotetoModeSelection({ ...input, selection: enabled, skills: [] })).toBeNull();
    expect(togglePotetoModeSelection({ ...input, skills: [] })).toBeNull();
    expect(togglePotetoModeSelection({ ...input, multipleModels: true })).toBeNull();
    const submission = {
      selection: enabled,
      unavailableReason: "Unavailable",
      text: "continue",
      answeringPendingInput: false,
      answeringApproval: false,
      editingQueuedMessage: false,
    };
    expect(potetoModeSubmissionError(submission)).toBe("Unavailable");
    expect(potetoModeSubmissionError({ ...submission, answeringPendingInput: true })).toBeNull();
    expect(potetoModeSubmissionError({ ...submission, answeringApproval: true })).toBeNull();
    expect(potetoModeSubmissionError({ ...submission, editingQueuedMessage: true })).toBeNull();
    expect(potetoModeSubmissionError({ ...submission, text: " /compact" })).toBeNull();
    expect(potetoModeSubmissionError({ ...submission, selection: null })).toBeNull();
  });
  it("repeats invocation across sends without consuming the selection or changing authored bytes", () => {
    expect(applyPotetoMode("Reproduce this\n\n  preserve spacing", selection)).toBe(
      "$poteto-mode\nReproduce this\n\n  preserve spacing",
    );
    expect(applyPotetoMode("continue", selection)).toBe("$poteto-mode\ncontinue");
    expect(applyPotetoMode("ordinary message", null)).toBe("ordinary message");
  });
  it("leaves commands and explicit invocations alone, with exact token matching", () => {
    expect(applyPotetoMode("  /compact", selection)).toBe("  /compact");
    expect(applyPotetoMode("$poteto-mode new task", selection)).toBe("$poteto-mode new task");
    expect(applyPotetoMode("Compare $poteto-mode-old", selection)).toBe(
      "$poteto-mode\nCompare $poteto-mode-old",
    );
  });
  it("fails closed for missing or replaced skills, provider changes and fanout", () => {
    expect(
      potetoModeUnavailableReason(selection, "codex-main", "codex", [skill], false),
    ).toBeNull();
    expect(potetoModeUnavailableReason(selection, "codex-main", "codex", [], false)).toContain(
      "unavailable",
    );
    expect(
      potetoModeUnavailableReason(
        selection,
        "codex-main",
        "codex",
        [{ ...skill, path: "/replacement" }],
        false,
      ),
    ).toContain("unavailable");
    expect(
      potetoModeUnavailableReason(selection, "codex-other", "codex", [skill], false),
    ).toContain("another provider");
    expect(potetoModeUnavailableReason(selection, "codex-main", "codex", [skill], true)).toContain(
      "single model",
    );
    expect(resolvePotetoModeSkill("claude", [skill])).toBeNull();
    expect(resolvePotetoModeSkill("codex", [{ ...skill, enabled: false }])).toBeNull();
    expect(resolvePotetoModeSkill("codex", [{ ...skill, userInvocationOnly: true }])).toBeNull();
    expect(resolvePotetoModeSkill("codex", [{ ...skill, userInvocable: false }])).toBeNull();
  });
  it("survives host replacement and reload, isolates environment and thread, and persists off", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    const scope = potetoModeScope("environment-one", "preallocated-thread");
    const draftHost = createPotetoModeStore(storage);
    draftHost.getState().setSelection(scope, selection);
    const replacementHost = createPotetoModeStore(storage);
    expect(
      applyPotetoMode("second turn", replacementHost.getState().selections[scope] ?? null),
    ).toBe("$poteto-mode\nsecond turn");
    expect(
      replacementHost.getState().selections[
        potetoModeScope("environment-two", "preallocated-thread")
      ],
    ).toBeUndefined();
    expect(
      replacementHost.getState().selections[potetoModeScope("environment-one", "different-thread")],
    ).toBeUndefined();
    replacementHost.getState().setSelection(scope, null);
    expect(createPotetoModeStore(storage).getState().selections[scope]).toBeUndefined();
  });
  it("rejects malformed persisted selections at the storage boundary", () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          state: { selections: { valid: selection, bad: { instanceId: 17, path: null } } },
          version: 0,
        }),
      setItem: () => {},
      removeItem: () => {},
    };
    expect(createPotetoModeStore(storage).getState().selections).toEqual({ valid: selection });
  });
});
