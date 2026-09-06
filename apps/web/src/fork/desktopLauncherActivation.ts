import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import type { DesktopLauncherActivation, EnvironmentId, ProjectId } from "@t3tools/contracts";

import {
  composerDraftHasUserContent,
  type ComposerThreadDraftState,
  type DraftId,
} from "../composerDraftStore";

export interface DesktopLauncherProjectTarget {
  readonly environmentId: EnvironmentId;
  readonly id: ProjectId;
  readonly workspaceRoot: string;
}

export type DesktopLauncherActivationOutcome =
  | "completed"
  | "completion-pending"
  | "draft-unavailable"
  | "invested-draft"
  | "queued"
  | "target-not-found";

interface PendingLauncherSubmit {
  readonly activationId: DesktopLauncherActivation["activationId"];
  readonly draftId: DraftId;
  readonly prompt: string;
  readonly complete: (activationId: DesktopLauncherActivation["activationId"]) => Promise<boolean>;
}

interface PendingLauncherCompletion {
  readonly activationId: DesktopLauncherActivation["activationId"];
  readonly complete: (activationId: DesktopLauncherActivation["activationId"]) => Promise<boolean>;
}

type LauncherSubmitter = (expectedPrompt: string) => Promise<void | boolean>;
export type DesktopLauncherSubmitState = "waiting" | "sending" | "refused" | "uncertain" | null;
export type DesktopLauncherSubmitReadiness = "ready" | "waiting" | "refused";
interface RegisteredLauncherSubmitter {
  readonly submit: LauncherSubmitter;
  readonly readiness: (expectedPrompt: string) => DesktopLauncherSubmitReadiness;
}

export function findPrimaryLauncherProject(
  projects: ReadonlyArray<EnvironmentProject>,
  primaryEnvironmentId: EnvironmentId,
  workspace: string,
): DesktopLauncherProjectTarget | null {
  const normalizedWorkspace = normalizeProjectPathForComparison(workspace);

  // Launcher input can select only an exact normalized project in the authenticated primary lane.
  const project = projects.find(
    (candidate) =>
      candidate.environmentId === primaryEnvironmentId &&
      normalizeProjectPathForComparison(candidate.workspaceRoot) === normalizedWorkspace,
  );

  return project ?? null;
}

export class DesktopLauncherActivationOwner {
  private takeStarted = false;
  private takePromise: Promise<DesktopLauncherActivationOutcome | null> | null = null;
  private pendingActivation: DesktopLauncherActivation | null = null;
  private stagePromise: Promise<DesktopLauncherActivationOutcome | null> | null = null;
  private blockedOutcome: DesktopLauncherActivationOutcome | null = null;
  private pendingSubmit: PendingLauncherSubmit | null = null;
  private pendingCompletion: PendingLauncherCompletion | null = null;
  private completionPromise: Promise<boolean> | null = null;
  private submitState: DesktopLauncherSubmitState = null;
  private readonly submitStateListeners = new Set<() => void>();
  private readonly submittersByDraftId = new Map<DraftId, RegisteredLauncherSubmitter>();

  readonly getSubmitState = (): DesktopLauncherSubmitState => this.submitState;
  readonly subscribeSubmitState = (listener: () => void): (() => void) => {
    this.submitStateListeners.add(listener);
    return () => {
      this.submitStateListeners.delete(listener);
    };
  };

  private setSubmitState(state: DesktopLauncherSubmitState): void {
    if (this.submitState === state) return;
    this.submitState = state;
    for (const listener of this.submitStateListeners) listener();
  }

  refreshSubmitter(draftId: DraftId): void {
    if (this.pendingSubmit?.draftId === draftId) this.dispatchPendingSubmit();
  }

  retrySubmit(): void {
    // Only a known pre-dispatch refusal is safe to retry. An uncertain send may already exist.
    if (this.submitState !== "refused") return;
    this.setSubmitState("waiting");
    this.dispatchPendingSubmit();
  }

  // A renderer lifetime gets one destructive take attempt, including under React remounts.
  async takeOnce(input: {
    readonly take: () => Promise<DesktopLauncherActivation | null>;
    readonly stage: (
      activation: DesktopLauncherActivation,
    ) => Promise<DesktopLauncherActivationOutcome>;
  }): Promise<DesktopLauncherActivationOutcome | null> {
    if (this.takeStarted) {
      await this.takePromise;
      await this.retryPendingCompletion();
      return this.blockedOutcome;
    }
    this.takeStarted = true;
    this.takePromise = (async () => {
      try {
        this.pendingActivation = await input.take();
        return await this.retryStaging(input.stage);
      } catch {
        return null;
      }
    })();
    return this.takePromise;
  }

  // Keep one destructive take in memory through auth/remounts. Failed opening retries only explicitly.
  retryStaging(
    stage: (activation: DesktopLauncherActivation) => Promise<DesktopLauncherActivationOutcome>,
  ): Promise<DesktopLauncherActivationOutcome | null> {
    if (this.stagePromise) return this.stagePromise;
    const activation = this.pendingActivation;
    if (!activation)
      return this.retryPendingCompletion().then((complete) =>
        complete ? null : "completion-pending",
      );
    this.stagePromise = Promise.resolve()
      .then(() => stage(activation))
      .catch(() => "draft-unavailable" as const)
      .then((outcome) => {
        if (outcome === "completed" || outcome === "completion-pending" || outcome === "queued") {
          this.pendingActivation = null;
          this.blockedOutcome = null;
        } else {
          this.blockedOutcome = outcome;
        }
        return outcome;
      })
      .finally(() => {
        this.stagePromise = null;
      });
    return this.stagePromise;
  }

  queueSubmit(input: PendingLauncherSubmit): boolean {
    if (this.pendingSubmit !== null) {
      return false;
    }
    this.pendingSubmit = input;
    this.setSubmitState("waiting");
    this.dispatchPendingSubmit();
    return true;
  }

  registerSubmitter(
    draftId: DraftId,
    submit: LauncherSubmitter,
    readiness: (expectedPrompt: string) => DesktopLauncherSubmitReadiness = () => "ready",
  ): () => void {
    const registered = { submit, readiness };
    this.submittersByDraftId.set(draftId, registered);
    this.dispatchPendingSubmit();
    void this.retryPendingCompletion();
    return () => {
      if (this.submittersByDraftId.get(draftId) === registered) {
        this.submittersByDraftId.delete(draftId);
      }
    };
  }

  async completeAdmittedSubmit(draftId: DraftId | null, admittedPrompt: string): Promise<void> {
    const pending = this.pendingSubmit;
    if (pending === null || pending.draftId !== draftId || pending.prompt !== admittedPrompt) {
      return;
    }
    this.pendingSubmit = null;
    this.setSubmitState(null);
    this.pendingCompletion = {
      activationId: pending.activationId,
      complete: pending.complete,
    };
    await this.retryPendingCompletion();
  }

  async completeOpenActivation(input: PendingLauncherCompletion): Promise<boolean> {
    if (this.pendingCompletion === null) {
      this.pendingCompletion = input;
    }
    return this.retryPendingCompletion();
  }

  retryPendingCompletion(): Promise<boolean> {
    if (this.completionPromise) return this.completionPromise;
    const pending = this.pendingCompletion;
    if (pending === null) return Promise.resolve(true);
    const completion = pending
      .complete(pending.activationId)
      .catch(() => false)
      .then((accepted) => {
        if (accepted && this.pendingCompletion === pending) {
          this.pendingCompletion = null;
        }
        return accepted;
      })
      .finally(() => {
        if (this.completionPromise === completion) {
          this.completionPromise = null;
        }
      });
    this.completionPromise = completion;
    return completion;
  }

  private dispatchPendingSubmit(): void {
    const pending = this.pendingSubmit;
    if (pending === null || this.submitState !== "waiting") return;
    const registered = this.submittersByDraftId.get(pending.draftId);
    if (!registered) return;
    const readiness = registered.readiness(pending.prompt);
    if (readiness === "waiting") return;
    if (readiness === "refused") {
      this.setSubmitState("refused");
      return;
    }

    // The first actual call consumes automatic dispatch permission, including across remounts.
    // Completion is authoritative; void or rejection without completion is never a retry signal.
    this.setSubmitState("sending");
    const attempt = async () => registered.submit(pending.prompt);
    void attempt()
      .then((result) => {
        if (this.pendingSubmit === pending)
          this.setSubmitState(result === false ? "refused" : "uncertain");
      })
      .catch(() => {
        if (this.pendingSubmit === pending) this.setSubmitState("uncertain");
      });
  }
}

export async function stageDesktopLauncherActivation(input: {
  readonly activation: DesktopLauncherActivation;
  readonly primaryEnvironmentId: EnvironmentId;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly openDraft: (
    project: DesktopLauncherProjectTarget,
  ) => Promise<{ readonly draftId: DraftId } | null>;
  readonly readDraft: (draftId: DraftId) => ComposerThreadDraftState | null;
  readonly setPrompt: (draftId: DraftId, prompt: string) => void;
  readonly owner: DesktopLauncherActivationOwner;
  readonly complete: (activationId: DesktopLauncherActivation["activationId"]) => Promise<boolean>;
}): Promise<DesktopLauncherActivationOutcome> {
  const project = findPrimaryLauncherProject(
    input.projects,
    input.primaryEnvironmentId,
    input.activation.workspace,
  );
  if (!project) {
    return "target-not-found";
  }

  const opened = await input.openDraft(project);
  if (!opened) {
    return "draft-unavailable";
  }

  const prompt = input.activation.prompt;
  if (prompt !== undefined) {
    if (composerDraftHasUserContent(input.readDraft(opened.draftId))) {
      return "invested-draft";
    }
    input.setPrompt(opened.draftId, prompt);
  }

  if (input.activation.action === "open") {
    return (await input.owner.completeOpenActivation({
      activationId: input.activation.activationId,
      complete: input.complete,
    }))
      ? "completed"
      : "completion-pending";
  }

  if (prompt === undefined) {
    return "draft-unavailable";
  }

  return input.owner.queueSubmit({
    activationId: input.activation.activationId,
    draftId: opened.draftId,
    prompt,
    complete: input.complete,
  })
    ? "queued"
    : "draft-unavailable";
}

export const desktopLauncherActivationOwner = new DesktopLauncherActivationOwner();
