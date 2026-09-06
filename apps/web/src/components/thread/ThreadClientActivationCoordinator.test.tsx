import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { ThreadAppActivation } from "@t3tools/contracts/threadAppActivation";
import type { ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { DraftId } from "../../composerDraftStore";
import { createThreadClientActivationOwner } from "../../fork/threadClientActivation";
import type { ThreadClientActivationHostProps } from "./ThreadClientActivationCoordinator";

process.env.NODE_ENV = "development";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const React = await import("react");
const TestRenderer = await import("react-test-renderer");
const {
  ThreadClientActivationHost,
  resolveThreadClientDraftDisposition,
  selectThreadClientActivationProject,
} = await import("./ThreadClientActivationCoordinator");

const primaryEnvironmentId = EnvironmentId.make("primary");
const projectRef = scopeProjectRef(primaryEnvironmentId, ProjectId.make("project-1"));
const draftId = "draft-from-handler" as DraftId;
const threadId = ThreadId.make("thread-from-handler");
const activation: ThreadAppActivation = {
  contractVersion: 1,
  launchId: "12345678-1234-4234-8234-123456789abc",
  draft: "\n  exact launch bytes  \n",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function hostProps(
  overrides: Partial<ThreadClientActivationHostProps> = {},
): ThreadClientActivationHostProps {
  return {
    bridge: undefined,
    finishOpen: vi.fn(),
    inspectDraft: vi.fn((): "available" => "available"),
    openDraft: vi.fn(async () => ({ draftId, threadId })),
    owner: createThreadClientActivationOwner(),
    primaryEnvironmentId,
    projectRef,
    shellLive: true,
    stageDraft: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Thread client activation coordinator host", () => {
  it("retains requested scope across auth and opens the resolved project with local workspace options", async () => {
    const owner = createThreadClientActivationOwner();
    const scopedActivation = { ...activation, workingDirectory: "/workspace/requested" };
    owner.admit(scopedActivation);
    const resolving = deferred<typeof projectRef>();
    const resolveProject = vi.fn(() => resolving.promise);
    const openDraft = vi.fn(async () => ({ draftId, threadId }));
    const inspectDraft = vi.fn((): "available" => "available");
    const finishOpen = vi.fn();
    const stageDraft = vi.fn();
    const props = hostProps({
      owner,
      projectRef: null,
      resolveProject,
      openDraft,
      inspectDraft,
      finishOpen,
      stageDraft,
    });
    let renderer!: ReactTestRenderer;
    await React.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ThreadClientActivationHost, { ...props, shellLive: false }),
      );
    });
    expect(resolveProject).not.toHaveBeenCalled();
    await React.act(async () => renderer.unmount());
    await React.act(async () => {
      renderer = TestRenderer.create(React.createElement(ThreadClientActivationHost, props));
    });
    expect(resolveProject).toHaveBeenCalledWith(scopedActivation.workingDirectory);
    expect(openDraft).not.toHaveBeenCalled();
    await React.act(async () => resolving.resolve(projectRef));
    expect(openDraft).toHaveBeenCalledWith(projectRef, {
      envMode: "local",
      branch: null,
      worktreePath: null,
      startFromOrigin: false,
    });
    expect(inspectDraft).toHaveBeenCalledWith(draftId, projectRef);
    expect(finishOpen).toHaveBeenCalledWith({ draftId, threadId }, projectRef);
    expect(stageDraft).toHaveBeenCalledWith(draftId, scopedActivation.draft);
    expect(owner.read()).toMatchObject({ activation: scopedActivation });
    await React.act(async () => renderer.unmount());
  });

  it("fails a scoped resolution visibly and preserves invested content after retry", async () => {
    const owner = createThreadClientActivationOwner();
    owner.admit({ ...activation, workingDirectory: "/workspace/requested" });
    const resolveProject = vi
      .fn()
      .mockRejectedValueOnce(new Error("The directory is unavailable."))
      .mockResolvedValueOnce(projectRef);
    const openDraft = vi.fn(async () => ({ draftId, threadId }));
    const stageDraft = vi.fn();
    let renderer!: ReactTestRenderer;
    await React.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          ThreadClientActivationHost,
          hostProps({
            owner,
            resolveProject,
            openDraft,
            stageDraft,
            inspectDraft: () => "authored",
          }),
        ),
      );
    });
    expect(owner.read()).toMatchObject({ phase: "failed" });
    expect(openDraft).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain("The directory is unavailable.");
    await React.act(async () => renderer.root.findByType("button").props.onClick());
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(stageDraft).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain("contains your work");
    await React.act(async () => renderer.unmount());
  });

  it("rejects a scoped project returned from a different environment", async () => {
    const owner = createThreadClientActivationOwner();
    owner.admit({ ...activation, workingDirectory: "/workspace/requested" });
    const openDraft = vi.fn(async () => ({ draftId, threadId }));
    let renderer!: ReactTestRenderer;
    await React.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          ThreadClientActivationHost,
          hostProps({
            owner,
            openDraft,
            resolveProject: async () => ({
              ...projectRef,
              environmentId: EnvironmentId.make("remote"),
            }),
          }),
        ),
      );
    });
    expect(owner.read()).toMatchObject({ phase: "failed" });
    expect(openDraft).not.toHaveBeenCalled();
    await React.act(async () => renderer.unmount());
  });

  it("selects the current primary scoped project by shared activity order", () => {
    const remoteEnvironmentId = EnvironmentId.make("remote");
    const olderPrimaryId = ProjectId.make("primary-older");
    const newerPrimaryId = ProjectId.make("primary-newer");
    const projects = [
      {
        environmentId: remoteEnvironmentId,
        id: ProjectId.make("remote-newest"),
        title: "Remote newest",
        updatedAt: "2026-09-05T03:00:00.000Z",
      },
      {
        environmentId: primaryEnvironmentId,
        id: olderPrimaryId,
        title: "Primary older",
        updatedAt: "2026-09-05T01:00:00.000Z",
      },
      {
        environmentId: primaryEnvironmentId,
        id: newerPrimaryId,
        title: "Primary newer",
        updatedAt: "2026-09-05T02:00:00.000Z",
      },
    ] as unknown as EnvironmentProject[];

    expect(selectThreadClientActivationProject(primaryEnvironmentId, projects, [])).toEqual(
      scopeProjectRef(primaryEnvironmentId, newerPrimaryId),
    );
  });

  it("stages only a returned draft that still belongs to the selected project", () => {
    expect(
      resolveThreadClientDraftDisposition(
        projectRef,
        { environmentId: primaryEnvironmentId, projectId: projectRef.projectId },
        false,
      ),
    ).toBe("available");
    expect(
      resolveThreadClientDraftDisposition(
        projectRef,
        { environmentId: primaryEnvironmentId, projectId: projectRef.projectId },
        true,
      ),
    ).toBe("authored");
    expect(resolveThreadClientDraftDisposition(projectRef, null, false)).toBe("missing");
    expect(
      resolveThreadClientDraftDisposition(
        projectRef,
        { environmentId: EnvironmentId.make("remote"), projectId: projectRef.projectId },
        false,
      ),
    ).toBe("missing");
  });

  it("waits visibly for a project, offers Add project, then opens when one appears", async () => {
    const owner = createThreadClientActivationOwner();
    owner.admit(activation);
    const dispatchEvent = vi.fn();
    const openDraft = vi.fn(async () => ({ draftId, threadId }));
    const stageDraft = vi.fn();
    const baseProps = hostProps({ openDraft, owner, stageDraft });
    vi.stubGlobal("window", { dispatchEvent });
    let renderer!: ReactTestRenderer;

    await React.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ThreadClientActivationHost, {
          ...baseProps,
          projectRef: null,
          shellLive: false,
        }),
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Waiting for the primary environment");

    await React.act(async () => {
      renderer.update(
        React.createElement(ThreadClientActivationHost, {
          ...baseProps,
          projectRef: null,
          shellLive: true,
        }),
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Add a project to continue");
    const button = renderer.root.findByType("button");
    await React.act(async () => button.props.onClick());
    expect(dispatchEvent).toHaveBeenCalledTimes(1);

    await React.act(async () => {
      renderer.update(
        React.createElement(ThreadClientActivationHost, {
          ...baseProps,
          projectRef,
          shellLive: true,
        }),
      );
    });
    expect(openDraft).toHaveBeenCalledWith(projectRef);
    expect(stageDraft).toHaveBeenCalledWith(draftId, activation.draft);

    await React.act(async () => renderer.unmount());
  });

  it("finishes an in-flight open across unmount and deduplicates replay after remount", async () => {
    const owner = createThreadClientActivationOwner();
    const opening = deferred<{ draftId: DraftId; threadId: ThreadId } | null>();
    const openDraft = vi.fn(() => opening.promise);
    const stageDraft = vi.fn();
    const completeActivation = vi.fn(async () => true);
    const subscribe = vi.fn((listener: (value: ThreadAppActivation) => void) => {
      listener(activation);
      return vi.fn();
    });
    const props = hostProps({
      bridge: { completeActivation, subscribe },
      openDraft,
      owner,
      stageDraft,
    });
    let renderer!: ReactTestRenderer;

    await React.act(async () => {
      renderer = TestRenderer.create(React.createElement(ThreadClientActivationHost, props));
    });
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("Opening your launch message");

    await React.act(async () => renderer.unmount());
    opening.resolve({ draftId, threadId });
    await React.act(async () => opening.promise);

    expect(stageDraft).toHaveBeenCalledWith(draftId, activation.draft);
    expect(completeActivation).toHaveBeenCalledWith({
      contractVersion: 1,
      launchId: activation.launchId,
    });
    expect(owner.read()).toMatchObject({ phase: "completed" });

    await React.act(async () => {
      renderer = TestRenderer.create(React.createElement(ThreadClientActivationHost, props));
    });
    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(renderer.toJSON()).toBeNull();
    await React.act(async () => renderer.unmount());
  });

  it("offers explicit receipt retry without opening or staging again", async () => {
    const owner = createThreadClientActivationOwner();
    const completeActivation = vi
      .fn<(completion: { contractVersion: 1; launchId: string }) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const openDraft = vi.fn(async () => ({ draftId, threadId }));
    const stageDraft = vi.fn();
    owner.admit(activation);
    let renderer!: ReactTestRenderer;

    await React.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(
          ThreadClientActivationHost,
          hostProps({
            bridge: { completeActivation, subscribe: vi.fn(() => vi.fn()) },
            openDraft,
            owner,
            stageDraft,
          }),
        ),
      );
    });
    expect(owner.read()).toMatchObject({ phase: "receipt-pending" });
    expect(JSON.stringify(renderer.toJSON())).toContain("Launch message needs confirmation");

    await React.act(async () => renderer.root.findByType("button").props.onClick());

    expect(owner.read()).toMatchObject({ phase: "completed" });
    expect(openDraft).toHaveBeenCalledTimes(1);
    expect(stageDraft).toHaveBeenCalledTimes(1);
    expect(completeActivation).toHaveBeenCalledTimes(2);
    await React.act(async () => renderer.unmount());
  });

  it("keeps a failed open visible until retry is requested", async () => {
    const owner = createThreadClientActivationOwner();
    owner.admit(activation);
    await owner.attempt({
      completeActivation: undefined,
      finishOpen: vi.fn(),
      inspectDraft: vi.fn((): "available" => "available"),
      openDraft: vi.fn(async () => null),
      stageDraft: vi.fn(),
    });
    const openDraft = vi.fn(async () => ({ draftId, threadId }));
    let renderer!: ReactTestRenderer;

    await React.act(async () => {
      renderer = TestRenderer.create(
        React.createElement(ThreadClientActivationHost, hostProps({ openDraft, owner })),
      );
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Couldn’t open the launch message");
    expect(openDraft).not.toHaveBeenCalled();

    await React.act(async () => renderer.root.findByType("button").props.onClick());
    expect(openDraft).toHaveBeenCalledTimes(1);
    await React.act(async () => renderer.unmount());
  });
});
