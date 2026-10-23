import { DesktopLauncherActivation, EnvironmentId, ProjectId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vite-plus/test";

import type { DraftId } from "../../composerDraftStore";
import type { DesktopLauncherActivationOwner as DesktopLauncherActivationOwnerType } from "../../fork/desktopLauncherActivation";

const host = vi.hoisted(() => ({
  primary: null as { environmentId: string } | null,
  projects: [] as unknown[],
  status: "bootstrapping",
  openDraft: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => ({ status: host.status }) }));
vi.mock("../../state/environments", () => ({ usePrimaryEnvironment: () => host.primary }));
vi.mock("../../state/entities", () => ({ useProjects: () => host.projects }));
vi.mock("../../state/shell", () => ({ environmentShell: { stateValueAtom: () => null } }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => host.openDraft }));

process.env.NODE_ENV = "development";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const React = await import("react");
const { useComposerDraftStore } = await import("../../composerDraftStore");
const TestRenderer = await import("react-test-renderer");
const { DesktopLauncherActivationOwner } = await import("../../fork/desktopLauncherActivation");
const { useDesktopLauncherSubmitAdmission, DesktopLauncherActivationCoordinator } =
  await import("./DesktopLauncherActivationCoordinator");
const decodeActivation = Schema.decodeUnknownSync(DesktopLauncherActivation);
const ACTIVATION_ID = decodeActivation({
  activationId: "12345678-1234-4234-8234-1234567890ab",
  contractVersion: 1,
  workspace: "/workspace/project",
  action: "submit",
  prompt: "Send once",
}).activationId;

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

    let renderer: ReactTestRenderer | undefined;
    await React.act(async () => {
      renderer = TestRenderer.create(
        <SubmitHost owner={owner} draftId={"other-draft" as DraftId} onSend={onSend} />,
      );
    });
    expect(onSend).not.toHaveBeenCalled();

    await React.act(async () => {
      renderer!.update(<SubmitHost owner={owner} draftId={matchingDraftId} onSend={onSend} />);
    });
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith(ACTIVATION_ID));

    await React.act(async () => {
      renderer!.update(<SubmitHost owner={owner} draftId={matchingDraftId} onSend={onSend} />);
    });

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
    vi.stubGlobal("window", {
      desktopBridge: { takeLauncherActivation: take, completeLauncherActivation: complete },
    });
    host.primary = null;
    host.projects = [];
    host.status = "bootstrapping";
    host.openDraft.mockResolvedValue({ draftId });
    let renderer: ReactTestRenderer | undefined;
    try {
      await React.act(async () => {
        renderer = TestRenderer.create(<DesktopLauncherActivationCoordinator owner={owner} />);
      });
      expect(take).not.toHaveBeenCalled();
      host.primary = { environmentId: EnvironmentId.make("primary") };
      await React.act(async () => {
        renderer!.update(<DesktopLauncherActivationCoordinator owner={owner} />);
      });
      expect(take).not.toHaveBeenCalled();
      host.status = "live";
      await React.act(async () => {
        renderer!.update(<DesktopLauncherActivationCoordinator owner={owner} />);
      });
      expect(take).toHaveBeenCalledTimes(1);
      expect(host.openDraft).not.toHaveBeenCalled();
      expect(
        renderer!.root.findByProps({ role: "status" }).findByType("span").children.join(""),
      ).toContain("waiting for its project");
      await React.act(async () => {
        renderer!.unmount();
      });
      host.projects = [
        {
          environmentId: EnvironmentId.make("primary"),
          id: ProjectId.make("project"),
          workspaceRoot: "/workspace/project",
        },
      ];
      await React.act(async () => {
        renderer = TestRenderer.create(<DesktopLauncherActivationCoordinator owner={owner} />);
      });
      expect(host.openDraft).not.toHaveBeenCalled();
      await React.act(async () => {
        renderer!.root.findByType("button").props.onClick();
      });
      expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe(prompt);
      expect(complete).toHaveBeenCalledWith({ activationId: ACTIVATION_ID });
      expect(take).toHaveBeenCalledTimes(1);
      expect(host.openDraft).toHaveBeenCalledTimes(1);
    } finally {
      await React.act(async () => {
        renderer?.unmount();
      });
      vi.unstubAllGlobals();
    }
  });

  it("does not submit a launcher draft edited before ChatView mounts", async () => {
    const owner = new DesktopLauncherActivationOwner();
    const draftId = "edited-launcher-draft" as DraftId;
    const complete = vi.fn(async () => true);
    const onSend = vi.fn(async () => true);
    owner.queueSubmit({ activationId: ACTIVATION_ID, draftId, prompt: "original", complete });
    useComposerDraftStore.getState().setPrompt(draftId, "user edited");
    let renderer: ReactTestRenderer | undefined;
    await React.act(async () => {
      renderer = TestRenderer.create(
        <SubmitHost owner={owner} draftId={draftId} onSend={onSend} />,
      );
    });
    expect(onSend).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    await React.act(async () => {
      renderer!.unmount();
    });
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
      React.useEffect(() => {
        promptRef.current = draft?.prompt ?? "";
      }, [draft?.prompt, promptRef]);
      React.useEffect(() => {
        notify();
      });
      return null;
    }
    function CurrentHost({ busy = false }: { busy?: boolean }) {
      const promptRef = React.useRef("");
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
    let renderer: ReactTestRenderer | undefined;
    try {
      await React.act(async () => {
        renderer = TestRenderer.create(<CurrentHost busy />);
      });
      await React.act(async () => {
        useComposerDraftStore.getState().setPrompt(draftId, prompt);
        owner.queueSubmit({ activationId: ACTIVATION_ID, draftId, prompt, complete });
        expect(attempts).toEqual([]);
      });
      expect(attempts).toEqual([]);
      expect(owner.getSubmitState()).toBe("waiting");
      await React.act(async () => {
        renderer!.update(<CurrentHost />);
      });
      expect(attempts).toEqual([prompt]);
      expect(complete).toHaveBeenCalledOnce();
      await React.act(async () => {
        renderer!.update(<CurrentHost />);
      });
      expect(attempts).toEqual([prompt]);
    } finally {
      await React.act(async () => renderer?.unmount());
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
      context: React.RefObject<{ prompt: string; ready: boolean }>;
      notify: () => void;
    }) {
      const [ready, setReady] = React.useState(false);
      React.useEffect(() => {
        enableProvider = () => setReady(true);
      }, []);
      React.useImperativeHandle(context, () => ({ prompt, ready }), [ready]);
      React.useEffect(() => {
        notify();
      });
      return null;
    }
    function CurrentHost() {
      parentRenders++;
      const context = React.useRef({ prompt: "", ready: false });
      const notify = useDesktopLauncherSubmitAdmission(
        draftId,
        attempts,
        () => context.current,
        owner,
      );
      return <Composer context={context} notify={notify} />;
    }
    let renderer: ReactTestRenderer | undefined;
    try {
      await React.act(async () => {
        renderer = TestRenderer.create(<CurrentHost />);
      });
      await React.act(async () => {
        owner.queueSubmit({
          activationId: ACTIVATION_ID,
          draftId,
          prompt,
          complete: async () => true,
        });
      });
      expect(attempts).not.toHaveBeenCalled();
      const initialParentRenders = parentRenders;
      await React.act(async () => {
        enableProvider!();
      });
      expect(attempts).toHaveBeenCalledOnce();
      expect(parentRenders).toBe(initialParentRenders);
    } finally {
      await React.act(async () => renderer?.unmount());
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
      vi.stubGlobal("window", { desktopBridge: {} });
      let renderer: ReactTestRenderer | undefined;
      try {
        await React.act(async () => {
          renderer = TestRenderer.create(<DesktopLauncherActivationCoordinator owner={owner} />);
        });
        await React.act(async () => {
          owner.queueSubmit({ activationId: ACTIVATION_ID, draftId, prompt, complete });
        });
        expect(owner.getSubmitState()).toBe(state);
        expect(renderer!.root.findByProps({ role: "status" })).toBeDefined();
        await React.act(async () => {
          renderer!.update(<DesktopLauncherActivationCoordinator owner={owner} />);
        });
        expect(send).toHaveBeenCalledTimes(1);
        expect(useComposerDraftStore.getState().getComposerDraft(draftId)?.prompt).toBe(prompt);
        expect(complete).not.toHaveBeenCalled();
        if (state === "refused") {
          await React.act(async () => {
            renderer!.root.findByType("button").props.onClick();
          });
          expect(send).toHaveBeenCalledTimes(2);
        } else {
          expect(renderer!.root.findAllByType("button")).toHaveLength(0);
        }
      } finally {
        await React.act(async () => renderer?.unmount());
        vi.unstubAllGlobals();
      }
    },
  );
});
