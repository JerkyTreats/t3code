import {
  PlanId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { createModelSelection } from "@t3tools/shared/model";
import { createRef, type Ref, useImperativeHandle } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { environmentId } from "../../../test/fixtures/chatComposer";

// Send-path evidence for F30-D7: which composer sends invoke Poteto Mode, and which bypass it.
const mocks = vi.hoisted(() => ({
  commands: [] as Array<{ command: unknown; input: unknown }>,
}));
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));
vi.mock(import("../../state/use-orchestration-command"), async (original) => ({
  ...(await original()),
  useOrchestrationCommand: ((command: unknown) => async (input: unknown) => {
    mocks.commands.push({ command, input });
    return { _tag: "Success", value: undefined };
  }) as never,
}));
vi.mock(import("../../hooks/useSettings"), async (original) => ({
  ...(await original()),
  useClientSettingsHydrated: () => true,
  useEnvironmentSettings: ((_environmentId: unknown, select: (settings: unknown) => unknown) =>
    select(DEFAULT_UNIFIED_SETTINGS)) as never,
}));
vi.mock(import("../../hooks/useHandleNewThread"), async (original) => ({
  ...(await original()),
  useNewThreadHandler: (() => vi.fn()) as never,
}));
vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useNavigate: (() => async () => {}) as never,
}));
vi.mock(import("../ChatView.logic"), async (original) => ({
  ...(await original()),
  waitForStartedServerThread: async () => true,
}));

import type { ChatComposerHandle } from "./ChatComposer";
import { useComposerSend } from "./useComposerSend";
import { useImplementPlanInNewThread } from "./useProposedPlanSend";
import { potetoModeScope } from "../../fork/potetoMode";
import { usePotetoModeStore } from "../../fork/potetoModeStore";
import { threadEnvironment } from "../../state/threads";

const selection = { instanceId: "codex", path: "/fixture/skills/poteto-mode/SKILL.md" };
const createdAt = "2026-01-01T00:00:00.000Z";
const approvalId = RuntimeRequestId.make("synthetic-approval");
const approval = {
  requestId: approvalId,
  requestKind: "command" as const,
  createdAt,
  responseCapability: "live" as const,
  supportsFeedback: true,
};
const plan = {
  id: PlanId.make("synthetic-plan"),
  createdAt,
  updatedAt: createdAt,
  runId: null,
  planMarkdown: "# Synthetic plan\n\n- Step one",
  status: "active" as const,
};
const project = {
  id: ProjectId.make("synthetic-project"),
  environmentId,
  workspaceRoot: "/synthetic/project",
} as EnvironmentProject;
const success = async () => ({ _tag: "Success" as const, value: undefined });

let threadSequence = 0;
function syntheticThread() {
  const id = ThreadId.make(`poteto-send-${++threadSequence}`);
  return {
    id,
    environmentId,
    title: "Synthetic thread",
    createdAt,
    worktreePath: null,
    activeProviderThreadId: null,
  } as unknown as EnvironmentThreadShell;
}

function composerHandle(
  prompt: { current: string },
  overrides: Partial<ReturnType<ChatComposerHandle["getSendContext"]>> = {},
) {
  const validateProviderInput = vi.fn((_input: string) => true);
  const handle = {
    getSendContext: () => ({
      answeringPendingUserInput: false,
      prompt: prompt.current,
      images: [],
      files: [],
      terminalContexts: [],
      previewAnnotations: [],
      reviewComments: [],
      threadContexts: [],
      potetoMode: selection,
      selectedPromptEffort: null,
      selectedModelOptionsForDispatch: undefined,
      selectedModelSelection: createModelSelection(ProviderInstanceId.make("codex"), "test"),
      multipleModelSelections: null,
      providerAvailable: true,
      submissionReady: true,
      selectedProvider: ProviderDriverKind.make("codex"),
      selectedModel: "test",
      selectedProviderModels: [],
      interactionMode: "default" as const,
      interactionModeEnabled: true,
      shownPendingApprovalIds: [],
      ...overrides,
    }),
    validateProviderInput,
    resetCursorState: vi.fn(),
    hasPendingAttachments: () => false,
  };
  return { handle: handle as unknown as ChatComposerHandle, validateProviderInput };
}

type SendInput = Parameters<typeof useComposerSend>[0];

function sendInput(text: string, overrides: Partial<SendInput> = {}) {
  const thread = syntheticThread();
  const promptRef = { current: text };
  const routeThreadKey = `${environmentId}:${thread.id}`;
  const { handle, validateProviderInput } = composerHandle(promptRef);
  const input = {
    environmentId,
    routeThreadKey,
    currentRouteThreadKeyRef: { current: routeThreadKey },
    draftId: null,
    draftThread: null,
    activeThread: thread,
    activeThreadKey: routeThreadKey,
    activeThreadBranch: null,
    activeProject: project,
    activeProjectDefaultModelSelection: null,
    activeProposedPlan: null,
    activeMessageCount: 1,
    isServerThread: true,
    isLocalDraftThread: false,
    isGitRepo: false,
    phase: "ready",
    runtimeMode: "full-access",
    sendEnvMode: "local",
    startFromOrigin: false,
    localCheckoutBranchMismatch: null,
    logicalProjectEnvironments: [],
    providerInstanceEntries: [],
    composerRef: { current: handle },
    composerDraftTarget: { environmentId, threadId: thread.id },
    promptRef,
    composerImagesRef: { current: [] },
    composerFilesRef: { current: [] },
    composerTerminalContextsRef: { current: [] },
    feedbackUploadsInFlightRef: { current: new Set<string>() },
    queuedRunEdit: { isEditing: false, saveEdit: vi.fn() },
    isConnecting: false,
    isRevertingCheckpoint: false,
    threadDetailLoading: false,
    activeEnvironmentUnavailable: false,
    isSendBusy: false,
    sendQueuesBehindSetup: false,
    isDraftHeroState: false,
    panelAnimationsActive: false,
    panelAnimationDurationMs: 0,
    keepFullHistory: false,
    resumeCompactionTokens: null,
    showPlanFollowUpPrompt: false,
    usageLimitsKey: null,
    usageLimitsOffered: false,
    openUsageLimits: () => false,
    clearUsageLimitsFor: vi.fn(),
    needsLoadBalancing: false,
    loadBalancing: { pending: false },
    readPendingEnvironmentChange: () => null,
    pendingApprovals: [],
    respondingRequestIds: [],
    activePendingProgress: null,
    onAdvanceActivePendingUserInput: vi.fn(),
    onRespondToApproval: vi.fn(success),
    beginLocalDispatch: vi.fn(),
    resetLocalDispatch: vi.fn(),
    beginWorktreeSetup: vi.fn(),
    captureDraftHeroComposerRect: vi.fn(),
    setDockedDraftHeroThreadKey: vi.fn(),
    setSetupQueueSendThreadKey: vi.fn(),
    setOptimisticUserMessages: vi.fn(),
    setFeedbackSubmissionsByThreadKey: vi.fn(),
    setThreadError: vi.fn(),
    setKeepFullHistory: vi.fn(),
    anchorNewTurn: vi.fn(),
    acknowledgeActiveThreadWoke: vi.fn(),
    handleInteractionModeChange: vi.fn(),
    handleNewThreadInActiveProject: vi.fn(),
    persistThreadSettingsForNextTurn: vi.fn(success),
    ...overrides,
  } as unknown as SendInput;
  return { input, validateProviderInput };
}

function setup() {
  mocks.commands.length = 0;
  usePotetoModeStore.setState({ selections: {} });
  return {
    [Symbol.dispose]() {
      usePotetoModeStore.setState({ selections: {} });
      vi.restoreAllMocks();
    },
  };
}

// Mounts a hook and exposes its result through a ref, for calling outside render.
function HookHost<T>({ ref, use }: { ref: Ref<T>; use: () => T }) {
  const value = use();
  useImperativeHandle(ref, () => value);
  return null;
}

async function send(input: SendInput) {
  const host = createRef<ReturnType<typeof useComposerSend>>();
  await using _screen = await render(<HookHost ref={host} use={() => useComposerSend(input)} />);
  await act(() => host.current!.onSend());
}

function startedTurnTexts() {
  return mocks.commands
    .filter((entry) => entry.command === threadEnvironment.startTurn)
    .map((entry) => (entry.input as { input: { message: { text: string } } }).input.message.text);
}

describe("Poteto Mode composer send paths", () => {
  it("invokes the workflow once on a normal provider turn", async () => {
    using _fixture = setup();
    const { input, validateProviderInput } = sendInput("Ship the fix");
    await send(input);
    expect(startedTurnTexts()).toEqual(["$poteto-mode\nShip the fix"]);
    expect(validateProviderInput).toHaveBeenCalledWith("$poteto-mode\nShip the fix");
  });

  it.each(["$poteto-mode Ship the fix", "/review the diff"])(
    "leaves %s unchanged",
    async (text) => {
      using _fixture = setup();
      const { input } = sendInput(text);
      await send(input);
      expect(startedTurnTexts()).toEqual([text]);
    },
  );

  it("answers a pending question without invoking the workflow", async () => {
    using _fixture = setup();
    const { input } = sendInput("Literal answer", {
      activePendingProgress: {} as SendInput["activePendingProgress"],
    });
    const { handle } = composerHandle(input.promptRef, { answeringPendingUserInput: true });
    await send({ ...input, composerRef: { current: handle } });
    expect(input.onAdvanceActivePendingUserInput).toHaveBeenCalledOnce();
    expect(startedTurnTexts()).toEqual([]);
  });

  it("saves a queued-message edit with the authored text", async () => {
    using _fixture = setup();
    const saveEdit = vi.fn();
    const { input } = sendInput("Edited queued text", {
      queuedRunEdit: { isEditing: true, saveEdit } as unknown as SendInput["queuedRunEdit"],
    });
    await send(input);
    expect(saveEdit).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "Edited queued text" }),
      input.setThreadError,
    );
    expect(startedTurnTexts()).toEqual([]);
  });

  it("sends approval feedback with the authored text and validates it uninjected", async () => {
    using _fixture = setup();
    const { input, validateProviderInput } = sendInput("Use the other file", {
      pendingApprovals: [approval],
    });
    const { handle, validateProviderInput: validate } = composerHandle(input.promptRef, {
      shownPendingApprovalIds: [approvalId],
    });
    await send({ ...input, composerRef: { current: handle } });
    expect(input.onRespondToApproval).toHaveBeenCalledWith(
      approvalId,
      "decline",
      "Use the other file",
    );
    expect(validate).toHaveBeenCalledWith("Use the other file");
    expect(validateProviderInput).not.toHaveBeenCalled();
    expect(startedTurnTexts()).toEqual([]);
  });

  it("invokes the workflow on a plan follow-up", async () => {
    using _fixture = setup();
    const { input } = sendInput("Refine step one", {
      showPlanFollowUpPrompt: true,
      activeProposedPlan: plan,
    });
    await send(input);
    const [text] = startedTurnTexts();
    expect(text?.startsWith("$poteto-mode\n")).toBe(true);
    expect(text).toContain("Refine step one");
  });
});

describe("Poteto Mode plan implementation thread", () => {
  it("invokes the workflow and carries the selection to the new thread", async () => {
    using _fixture = setup();
    const { input: base } = sendInput("");
    const host = createRef<() => Promise<void>>();
    const useImplement = () =>
      useImplementPlanInNewThread({
        environmentId,
        routeThreadKey: base.routeThreadKey,
        activeThread: base.activeThread,
        activeThreadBranch: null,
        activeProposedPlan: plan,
        isServerThread: true,
        isSendBusy: false,
        isConnecting: false,
        composerRef: base.composerRef,
        beginLocalDispatch: vi.fn(),
        resetLocalDispatch: vi.fn(),
        activeProject: project,
        activeEnvironmentUnavailable: false,
        defaultRuntimeMode: "full-access",
      });
    await using _screen = await render(<HookHost ref={host} use={useImplement} />);
    await act(() => host.current!());
    const created = mocks.commands.find((entry) => entry.command === threadEnvironment.create)!;
    const nextThreadId = (created.input as { input: { threadId: ThreadId } }).input.threadId;
    expect(nextThreadId).not.toBe(base.activeThread!.id);
    const [text] = startedTurnTexts();
    expect(text?.startsWith("$poteto-mode\n")).toBe(true);
    expect(text).toContain("Synthetic plan");
    expect(
      usePotetoModeStore.getState().selections[potetoModeScope(environmentId, nextThreadId)],
    ).toEqual(selection);
  });
});
