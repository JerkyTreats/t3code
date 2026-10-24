import { DesktopLauncherActivation, EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { act, render, stubGlobal, type Screen } from "../../../test/render";
import type { DraftId } from "../../composerDraftStore";
import type { DesktopLauncherActivationOwner as DesktopLauncherActivationOwnerType } from "../../fork/desktopLauncherActivation";

const host = vi.hoisted(() => ({
  primary: null as { environmentId: string } | null,
  projects: [] as unknown[],
  status: "bootstrapping",
  statusListeners: new Set<() => void>(),
  setStatus(status: string) {
    host.status = status;
    for (const listener of host.statusListeners) listener();
  },
  openDraft: vi.fn(),
}));
// Subscribed like the real atom hook: compiled parents skip rerendering unchanged children.
vi.mock(import("@effect/atom-react"), async (original) => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    host.statusListeners.add(listener);
    return () => host.statusListeners.delete(listener);
  };
  return {
    ...(await original()),
    useAtomValue: (() => ({
      status: useSyncExternalStore(subscribe, () => host.status),
    })) as never,
  };
});
vi.mock("../../state/environments", () => ({ usePrimaryEnvironment: () => host.primary }));
vi.mock("../../state/entities", () => ({ useProjects: () => host.projects }));
vi.mock("../../state/shell", () => ({ environmentShell: { stateValueAtom: () => null } }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => host.openDraft }));

import { useComposerDraftStore } from "../../composerDraftStore";
import { DesktopLauncherActivationOwner } from "../../fork/desktopLauncherActivation";
import {
  DesktopLauncherActivationCoordinator,
  useDesktopLauncherSubmitAdmission,
} from "./DesktopLauncherActivationCoordinator";

const decodeActivation = Schema.decodeUnknownSync(DesktopLauncherActivation);
const ACTIVATION_ID = decodeActivation({
  activationId: "12345678-1234-4234-8234-1234567890ab",
  contractVersion: 1,
  workspace: "/workspace/project",
  action: "submit",
  prompt: "Send once",
}).activationId;

async function clickOnlyButton(screen: Screen) {
  const buttons = screen.container.querySelectorAll("button");
  expect(buttons).toHaveLength(1);
  await act(async () => buttons[0]!.click());
}

function SubmitHost(props: {
  readonly owner: DesktopLauncherActivationOwnerType;
  readonly draftId: DraftId | null;
  readonly onSend: () => Promise<boolean>;
}) {
  useDesktopLauncherSubmitAdmission(
    props.draftId,
    props.onSend,
    () => ({
      prompt: props.draftId
        ? (useComposerDraftStore.getState().getComposerDraft(props.draftId)?.prompt ?? "")
        : "",
      ready: true,
    }),
    props.owner,
  );
  return null;
}

describe("DesktopLauncherActivationCoordinator ChatView admission seam", () => {
  it("routes one pending activation only to the matching mounted draft", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const matchingDraftId = "matching-draft" as DraftId;
    useComposerDraftStore.getState().setPrompt(matchingDraftId, "Send once");
    const complete = vi.fn(async () => true);
    const onSend = vi.fn(async () => {
      await owner.completeAdmittedSubmit(matchingDraftId, "Send once");
      return true;
    });
    owner.queueSubmit({
      activationId: ACTIVATION_ID,
      draftId: matchingDraftId,
      prompt: "Send once",
      complete,
    });

    await using renderer = await render(
      <SubmitHost owner={owner} draftId={"other-draft" as DraftId} onSend={onSend} />,
      { router: false },
    );
    expect(onSend).not.toHaveBeenCalled();

    await renderer!.rerender(
      <SubmitHost owner={owner} draftId={matchingDraftId} onSend={onSend} />,
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith(ACTIVATION_ID));

    await renderer!.rerender(
      <SubmitHost owner={owner} draftId={matchingDraftId} onSend={onSend} />,
    );

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });
});

describe("actual launcher coordinator host", () => {
  it("waits through auth and bootstrap, retains unavailable projects, retries explicitly and stages byte-exact text", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const prompt = "  Byte exact\n\ttext  ";
    const draftId = "host-activation-draft" as DraftId;
    const activation = decodeActivation({
      activationId: ACTIVATION_ID,
      contractVersion: 1,
      workspace: "/workspace/project",
      action: "open",
      prompt,
    });
    const take = vi.fn(async () => activation);
    const complete = vi.fn(async () => true);
    using _bridge = stubGlobal("desktopBridge", {
      takeLauncherActivation: take,
      completeLauncherActivation: complete,
    });
    host.primary = null;
    host.projects = [];
    host.status = "bootstrapping";
    host.openDraft.mockResolvedValue({ draftId });
    let renderer: Screen | undefined;
    try {
      renderer = await render(<DesktopLauncherActivationCoordinator owner={owner} />, {
        router: false,
      });
      expect(take).not.toHaveBeenCalled();
      host.primary = { environmentId: EnvironmentId.make("primary") };
      await renderer!.rerender(<DesktopLauncherActivationCoordinator owner={owner} />);
      expect(take).not.toHaveBeenCalled();
      await act(async () => host.setStatus("live"));
      expect(take).toHaveBeenCalledTimes(1);
      expect(host.openDraft).not.toHaveBeenCalled();
      expect(renderer!.container.querySelector('[role="status"]')?.textContent).toContain(
        "waiting for its project",
      );
      await renderer![Symbol.asyncDispose]();
      host.projects = [
        {
          environmentId: EnvironmentId.make("primary"),
          id: ProjectId.make("project"),
          workspaceRoot: "/workspace/project",
        },
      ];
      renderer = await render(<DesktopLauncherActivationCoordinator owner={owner} />, {
        router: false,
      });
      expect(host.openDraft).not.toHaveBeenCalled();
      await clickOnlyButton(renderer!);
      expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe(prompt);
      expect(complete).toHaveBeenCalledWith({ activationId: ACTIVATION_ID });
      expect(take).toHaveBeenCalledTimes(1);
      expect(host.openDraft).toHaveBeenCalledTimes(1);
    } finally {
      await renderer?.[Symbol.asyncDispose]();
    }
  });

  it("does not submit a launcher draft edited before ChatView mounts", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const draftId = "edited-launcher-draft" as DraftId;
    const complete = vi.fn(async () => true);
    const onSend = vi.fn(async () => true);
    owner.queueSubmit({ activationId: ACTIVATION_ID, draftId, prompt: "original", complete });
    useComposerDraftStore.getState().setPrompt(draftId, "user edited");
    let renderer: Screen | undefined;
    renderer = await render(<SubmitHost owner={owner} draftId={draftId} onSend={onSend} />, {
      router: false,
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    await renderer![Symbol.asyncDispose]();
  });
});

describe("committed composer admission timing", () => {
  it("waits when staging reuses an empty mounted draft and sends exact committed bytes once", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const draftId = "reused-mounted-empty-draft" as DraftId;
    const prompt = "  requested\n\ttext  ";
    useComposerDraftStore.getState().setPrompt(draftId, "");
    const attempts: string[] = [];
    const complete = vi.fn(async () => true);
    function Composer({
      promptRef,
      notify,
    }: {
      promptRef: { current: string };
      notify: () => void;
    }) {
      const draft = useComposerDraftStore((state) => state.getComposerDraft(draftId));
      useEffect(() => {
        promptRef.current = draft?.prompt ?? "";
      }, [draft?.prompt, promptRef]);
      useEffect(() => {
        notify();
      });
      return null;
    }
    function CurrentHost({ busy = false }: { busy?: boolean }) {
      const promptRef = useRef("");
      const notify = useDesktopLauncherSubmitAdmission(
        draftId,
        async () => {
          attempts.push(promptRef.current);
          if (busy || !promptRef.current.trim()) return false;
          await owner.completeAdmittedSubmit(draftId, promptRef.current);
        },
        () => ({ prompt: promptRef.current, ready: !busy }),
        owner,
      );
      return <Composer promptRef={promptRef} notify={notify} />;
    }
    let renderer: Screen | undefined;
    try {
      renderer = await render(<CurrentHost busy />, { router: false });
      await act(async () => {
        useComposerDraftStore.getState().setPrompt(draftId, prompt);
        owner.queueSubmit({ activationId: ACTIVATION_ID, draftId, prompt, complete });
        expect(attempts).toEqual([]);
      });
      expect(attempts).toEqual([]);
      expect(owner.getSubmitState()).toBe("waiting");
      await renderer!.rerender(<CurrentHost />);
      expect(attempts).toEqual([prompt]);
      expect(complete).toHaveBeenCalledOnce();
      await renderer!.rerender(<CurrentHost />);
      expect(attempts).toEqual([prompt]);
    } finally {
      await renderer?.[Symbol.asyncDispose]();
    }
  });

  it("observes child-only readiness changes through the committed-context notification", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const draftId = "child-ready-draft" as DraftId;
    const prompt = "send after provider readiness";
    useComposerDraftStore.getState().setPrompt(draftId, prompt);
    const attempts = vi.fn(async () => {
      await owner.completeAdmittedSubmit(draftId, prompt);
    });
    let enableProvider: (() => void) | undefined;
    let parentRenders = 0;
    function Composer({
      context,
      notify,
    }: {
      context: RefObject<{ prompt: string; ready: boolean }>;
      notify: () => void;
    }) {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        enableProvider = () => setReady(true);
      }, []);
      useImperativeHandle(context, () => ({ prompt, ready }), [ready]);
      useEffect(() => {
        notify();
      });
      return null;
    }
    function CurrentHost() {
      parentRenders++;
      const context = useRef({ prompt: "", ready: false });
      const notify = useDesktopLauncherSubmitAdmission(
        draftId,
        attempts,
        () => context.current,
        owner,
      );
      return <Composer context={context} notify={notify} />;
    }
    let renderer: Screen | undefined;
    try {
      renderer = await render(<CurrentHost />, { router: false });
      await act(async () => {
        owner.queueSubmit({
          activationId: ACTIVATION_ID,
          draftId,
          prompt,
          complete: async () => true,
        });
      });
      expect(attempts).not.toHaveBeenCalled();
      const initialParentRenders = parentRenders;
      await act(async () => {
        enableProvider!();
      });
      expect(attempts).toHaveBeenCalledOnce();
      expect(parentRenders).toBe(initialParentRenders);
    } finally {
      await renderer?.[Symbol.asyncDispose]();
    }
  });
});

describe("launcher refusal recovery surface", () => {
  it.each(["refused", "uncertain"] as const)(
    "exposes safe recovery for %s without automatic replay",
    async (state) => {
      const owner = new DesktopLauncherActivationOwner();
      const draftId = "recovery-surface-draft" as DraftId;
      const prompt = "preserve this prompt";
      useComposerDraftStore.getState().setPrompt(draftId, prompt);
      const send = vi.fn(async () => (state === "refused" ? false : undefined));
      const complete = vi.fn(async () => true);
      owner.registerSubmitter(draftId, send);
      host.primary = { environmentId: EnvironmentId.make("primary") };
      host.status = "bootstrapping";
      using _bridge = stubGlobal("desktopBridge", {});
      let renderer: Screen | undefined;
      try {
        renderer = await render(<DesktopLauncherActivationCoordinator owner={owner} />, {
          router: false,
        });
        await act(async () => {
          owner.queueSubmit({ activationId: ACTIVATION_ID, draftId, prompt, complete });
        });
        expect(owner.getSubmitState()).toBe(state);
        expect(renderer!.container.querySelector('[role="status"]')).not.toBeNull();
        await renderer!.rerender(<DesktopLauncherActivationCoordinator owner={owner} />);
        expect(send).toHaveBeenCalledTimes(1);
        expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe(prompt);
        expect(complete).not.toHaveBeenCalled();
        if (state === "refused") {
          await clickOnlyButton(renderer!);
          expect(send).toHaveBeenCalledTimes(2);
        } else {
          expect(renderer!.container.querySelectorAll("button")).toHaveLength(0);
        }
      } finally {
        await renderer?.[Symbol.asyncDispose]();
      }
    },
  );
});
