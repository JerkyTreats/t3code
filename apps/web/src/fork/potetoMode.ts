import type { ServerProviderSkill } from "@t3tools/contracts";

export interface PotetoModeSelection {
  instanceId: string;
  path: string;
}

export function potetoModeScope(environmentId: string, threadId: string): string {
  return JSON.stringify([environmentId, threadId]);
}

export function resolvePotetoModeSkill(
  driver: string,
  skills: readonly ServerProviderSkill[],
): ServerProviderSkill | null {
  if (driver !== "codex") return null;
  return (
    skills.find(
      (skill) =>
        skill.name === "poteto-mode" &&
        skill.enabled &&
        skill.userInvocable !== false &&
        skill.userInvocationOnly !== true,
    ) ?? null
  );
}

export function potetoModeUnavailableReason(
  selection: PotetoModeSelection | null,
  instanceId: string,
  driver: string,
  skills: readonly ServerProviderSkill[],
  multipleModels: boolean,
): string | null {
  if (multipleModels)
    return selection
      ? "Poteto Mode needs a single model. Turn it off or select one model."
      : "Select a single model to turn on Poteto Mode.";
  if (driver !== "codex")
    return selection
      ? "Poteto Mode currently needs Codex. Switch providers or turn it off."
      : "Select Codex to turn on Poteto Mode.";
  if (selection && selection.instanceId !== instanceId) {
    return "Poteto Mode belongs to another provider. Switch back or turn it off.";
  }
  const skill = resolvePotetoModeSkill(driver, skills);
  if (!skill || (selection && selection.path !== skill.path)) {
    return selection
      ? "Poteto Mode skill is unavailable. Restore the skill or turn it off."
      : "The poteto-mode skill must be enabled for this workspace.";
  }
  return null;
}

export function isPotetoModeCommand(text: string): boolean {
  return /^\s*\//.test(text);
}

export function potetoModeSubmissionError(input: {
  selection: PotetoModeSelection | null;
  unavailableReason: string | null;
  text: string;
  answeringPendingInput: boolean;
  editingQueuedMessage: boolean;
}): string | null {
  return input.selection &&
    !input.answeringPendingInput &&
    !input.editingQueuedMessage &&
    !isPotetoModeCommand(input.text)
    ? input.unavailableReason
    : null;
}

export function togglePotetoModeSelection(input: {
  selection: PotetoModeSelection | null;
  instanceId: string;
  driver: string;
  skills: readonly ServerProviderSkill[];
  multipleModels: boolean;
}): PotetoModeSelection | null {
  if (input.selection) return null;
  if (
    potetoModeUnavailableReason(
      null,
      input.instanceId,
      input.driver,
      input.skills,
      input.multipleModels,
    )
  )
    return null;
  const skill = resolvePotetoModeSkill(input.driver, input.skills);
  return skill ? { instanceId: input.instanceId, path: skill.path } : null;
}

/** Invoke the installed workflow before context and effort formatting. */
export function applyPotetoMode(text: string, selection: PotetoModeSelection | null): string {
  if (!selection || isPotetoModeCommand(text)) return text;
  if (text.split(/\s+/u).includes("$poteto-mode")) return text;
  return `$poteto-mode\n${text}`;
}
