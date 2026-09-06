import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { DesktopLauncherActivation, EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ComposerThreadDraftState, DraftId } from "../composerDraftStore";
import {
  DesktopLauncherActivationOwner,
  findPrimaryLauncherProject,
  stageDesktopLauncherActivation,
} from "./desktopLauncherActivation";

const PRIMARY_ENVIRONMENT_ID = EnvironmentId.make("primary");
const REMOTE_ENVIRONMENT_ID = EnvironmentId.make("remote");
const PROJECT_ID = ProjectId.make("project-one");
const DRAFT_ID = "draft-one" as DraftId;
const ACTIVATION_ID = "12345678-1234-4234-8234-1234567890ab";
const decodeActivation = Schema.decodeUnknownSync(DesktopLauncherActivation);

function project(
  environmentId: EnvironmentId,
  workspaceRoot: string,
  id = PROJECT_ID,
): EnvironmentProject {
  return {
    environmentId,
    id,
    title: "Project",
    workspaceRoot,
    repositoryIdentity: null,
    defaultModelSelection: null,
    defaultThreadEnvMode: null,
    faviconPath: null,
    scripts: [],
    createdAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
  };
}

function activation(action: "open" | "submit", prompt?: string): DesktopLauncherActivation {
  return decodeActivation({
    activationId: ACTIVATION_ID,
    contractVersion: 1,
    workspace: "/workspace/project/",
    action,
    ...(prompt === undefined ? {} : { prompt }),
  });
}

function investedDraft(): ComposerThreadDraftState {
  return {
    prompt: "Keep my work",
    images: [],
    files: [],
    nonPersistedImageIds: [],
    persistedAttachments: [],
    terminalContexts: [],
    elementContexts: [],
    previewAnnotations: [],
    reviewComments: [],
    modelSelectionByProvider: {},
    activeProvider: null,
    runtimeMode: null,
    interactionMode: null,
  };
}

describe("desktop launcher activation owner", () => {
  it("matches only the exact normalized workspace in the primary environment", () => {
    const remoteExact = project(REMOTE_ENVIRONMENT_ID, "/workspace/project");
    const primaryPrefix = project(
      PRIMARY_ENVIRONMENT_ID,
      "/workspace/project-copy",
      ProjectId.make("project-prefix"),
    );
    const primaryExact = project(PRIMARY_ENVIRONMENT_ID, "/workspace/project");

    expect(
      findPrimaryLauncherProject(
        [remoteExact, primaryPrefix, primaryExact],
        PRIMARY_ENVIRONMENT_ID,
        "/workspace/project/",
      ),
    ).toBe(primaryExact);
    expect(
      findPrimaryLauncherProject(
        [remoteExact, primaryPrefix],
        PRIMARY_ENVIRONMENT_ID,
        "/workspace/project/",
      ),
    ).toBeNull();
  });

  it("opens an ordinary draft, stages its optional prompt, then completes", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const events: string[] = [];

    await expect(
      stageDesktopLauncherActivation({
        activation: activation("open", "Inspect the renderer"),
        primaryEnvironmentId: PRIMARY_ENVIRONMENT_ID,
        projects: [project(PRIMARY_ENVIRONMENT_ID, "/workspace/project")],
        openDraft: async () => {
          events.push("open-draft");
          return { draftId: DRAFT_ID };
        },
        readDraft: () => null,
        setPrompt: (_draftId, prompt) => events.push(`prompt:${prompt}`),
        owner,
        complete: async () => {
          events.push("complete");
          return true;
        },
      }),
    ).resolves.toBe("completed");

    expect(events).toEqual(["open-draft", "prompt:Inspect the renderer", "complete"]);
  });

  it("does not overwrite or complete a draft invested during opening", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const setPrompt = vi.fn();
    const complete = vi.fn(async () => true);

    await expect(
      stageDesktopLauncherActivation({
        activation: activation("open", "Replacement"),
        primaryEnvironmentId: PRIMARY_ENVIRONMENT_ID,
        projects: [project(PRIMARY_ENVIRONMENT_ID, "/workspace/project")],
        openDraft: async () => ({ draftId: DRAFT_ID }),
        readDraft: investedDraft,
        setPrompt,
        owner,
        complete,
      }),
    ).resolves.toBe("invested-draft");

    expect(setPrompt).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("submits once through the matching mounted owner and completes after admission", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const events: string[] = [];
    const send = vi.fn(async () => {
      events.push("admitted");
      await owner.completeAdmittedSubmit(DRAFT_ID, "Run the focused tests");
      return true;
    });

    await expect(
      stageDesktopLauncherActivation({
        activation: activation("submit", "Run the focused tests"),
        primaryEnvironmentId: PRIMARY_ENVIRONMENT_ID,
        projects: [project(PRIMARY_ENVIRONMENT_ID, "/workspace/project")],
        openDraft: async () => ({ draftId: DRAFT_ID }),
        readDraft: () => null,
        setPrompt: (_draftId, prompt) => events.push(`prompt:${prompt}`),
        owner,
        complete: async (activationId) => {
          events.push(`complete:${activationId}`);
          return true;
        },
      }),
    ).resolves.toBe("queued");

    owner.registerSubmitter("other-draft" as DraftId, send);
    expect(send).not.toHaveBeenCalled();

    owner.registerSubmitter(DRAFT_ID, send);
    await vi.waitFor(() => expect(events).toContain(`complete:${ACTIVATION_ID}`));
    owner.registerSubmitter(DRAFT_ID, send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      "prompt:Run the focused tests",
      "admitted",
      `complete:${ACTIVATION_ID}`,
    ]);
  });

  it("retains a refused submit until a later ordinary admission completes it", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const complete = vi.fn(async () => true);
    const send = vi.fn(async () => false);

    await stageDesktopLauncherActivation({
      activation: activation("submit", "Keep the staged prompt"),
      primaryEnvironmentId: PRIMARY_ENVIRONMENT_ID,
      projects: [project(PRIMARY_ENVIRONMENT_ID, "/workspace/project")],
      openDraft: async () => ({ draftId: DRAFT_ID }),
      readDraft: () => null,
      setPrompt: vi.fn(),
      owner,
      complete,
    });

    owner.registerSubmitter(DRAFT_ID, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    expect(send).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();

    await owner.completeAdmittedSubmit(DRAFT_ID, "A user-edited prompt");

    expect(complete).not.toHaveBeenCalled();

    await owner.completeAdmittedSubmit(DRAFT_ID, "Keep the staged prompt");

    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(ACTIVATION_ID);
  });

  it("retains an exact admitted submit until main confirms completion", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const complete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    owner.queueSubmit({
      activationId: decodeActivation({
        activationId: ACTIVATION_ID,
        contractVersion: 1,
        workspace: "/workspace/project",
        action: "submit",
        prompt: "Keep the staged prompt",
      }).activationId,
      draftId: DRAFT_ID,
      prompt: "Keep the staged prompt",
      complete,
    });

    await owner.completeAdmittedSubmit(DRAFT_ID, "Keep the staged prompt");
    await owner.retryPendingCompletion();

    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("retries only open completion after a failed main acknowledgement", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const complete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(
      stageDesktopLauncherActivation({
        activation: activation("open", "Inspect the renderer"),
        primaryEnvironmentId: PRIMARY_ENVIRONMENT_ID,
        projects: [project(PRIMARY_ENVIRONMENT_ID, "/workspace/project")],
        openDraft: async () => ({ draftId: DRAFT_ID }),
        readDraft: () => null,
        setPrompt: vi.fn(),
        owner,
        complete,
      }),
    ).resolves.toBe("completion-pending");

    await expect(owner.retryPendingCompletion()).resolves.toBe(true);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("takes at most once even when the coordinator remounts", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const take = vi.fn(async () => activation("open"));
    const stage = vi.fn(async () => "completed" as const);

    await expect(owner.takeOnce({ take, stage })).resolves.toBe("completed");
    await expect(owner.takeOnce({ take, stage })).resolves.toBeNull();

    expect(take).toHaveBeenCalledTimes(1);
    expect(stage).toHaveBeenCalledTimes(1);
  });

  it("retains failed staging for explicit retry without taking again", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const take = vi.fn(async () => activation("open"));
    const stage = vi.fn(async () => {
      throw new Error("staging failed");
    });

    await expect(owner.takeOnce({ take, stage })).resolves.toBe("draft-unavailable");
    await expect(owner.takeOnce({ take, stage })).resolves.toBe("draft-unavailable");

    expect(take).toHaveBeenCalledTimes(1);
    expect(stage).toHaveBeenCalledTimes(1);
    await expect(owner.retryStaging(async () => "completed")).resolves.toBe("completed");
    expect(take).toHaveBeenCalledTimes(1);
  });
});

describe("launcher dispatch permission", () => {
  function pending(owner: DesktopLauncherActivationOwner) {
    owner.queueSubmit({
      activationId: activation("submit", "exact prompt").activationId,
      draftId: DRAFT_ID,
      prompt: "exact prompt",
      complete: async () => true,
    });
  }

  it("waits without attempting until the committed host reports readiness", async () => {
    const owner = new DesktopLauncherActivationOwner();
    let ready = false;
    const send = vi.fn(async () => {
      await owner.completeAdmittedSubmit(DRAFT_ID, "exact prompt");
    });
    owner.registerSubmitter(DRAFT_ID, send, () => (ready ? "ready" : "waiting"));
    pending(owner);
    owner.refreshSubmitter(DRAFT_ID);
    expect(send).not.toHaveBeenCalled();
    expect(owner.getSubmitState()).toBe("waiting");
    ready = true;
    owner.refreshSubmitter(DRAFT_ID);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(owner.getSubmitState()).toBeNull();
  });

  it("requires explicit recovery after a known pre-dispatch refusal", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const send = vi.fn(async () => false);
    owner.registerSubmitter(DRAFT_ID, send);
    pending(owner);
    await vi.waitFor(() => expect(owner.getSubmitState()).toBe("refused"));
    owner.refreshSubmitter(DRAFT_ID);
    owner.registerSubmitter(DRAFT_ID, send);
    expect(send).toHaveBeenCalledTimes(1);
    owner.retrySubmit();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  });

  it.each(["void", "rejected"])(
    "never blindly retries an uncertain %s send across remounts",
    async (result) => {
      const owner = new DesktopLauncherActivationOwner();
      const send = vi.fn(async () => {
        if (result === "rejected") throw new Error("connection lost after dispatch");
      });
      const unsubscribe = owner.registerSubmitter(DRAFT_ID, send);
      pending(owner);
      await vi.waitFor(() => expect(owner.getSubmitState()).toBe("uncertain"));
      unsubscribe();
      owner.registerSubmitter(DRAFT_ID, send);
      owner.refreshSubmitter(DRAFT_ID);
      owner.retrySubmit();
      await Promise.resolve();
      expect(send).toHaveBeenCalledTimes(1);
      expect(owner.getSubmitState()).toBe("uncertain");
      await owner.completeAdmittedSubmit(DRAFT_ID, "exact prompt");
      expect(owner.getSubmitState()).toBeNull();
    },
  );
});
