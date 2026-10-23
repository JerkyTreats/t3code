import type { ThreadAppActivation } from "@t3tools/contracts/threadAppActivation";
import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { DraftId } from "../composerDraftStore";
import {
  createThreadClientActivationOwner,
  type ThreadClientActivationAttempt,
} from "./threadClientActivation";

const activation: ThreadAppActivation = {
  contractVersion: 1,
  launchId: "12345678-1234-4234-8234-123456789abc",
  draft: "  preserve these bytes  \n",
  workingDirectory: "/workspace/requested",
};
const draftId = "draft-returned" as DraftId;
const threadId = ThreadId.make("thread-returned");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function attempt(
  overrides: Partial<ThreadClientActivationAttempt> = {},
): ThreadClientActivationAttempt {
  return {
    openDraft: vi.fn(async () => ({ draftId, threadId })),
    inspectDraft: vi.fn((): "available" => "available"),
    stageDraft: vi.fn(),
    finishOpen: vi.fn(),
    completeActivation: vi.fn(async () => true),
    ...overrides,
  };
}

describe("Thread client activation owner", () => {
  it("admits one validated launch and bounds replay to that exact identity and payload", () => {
    const owner = createThreadClientActivationOwner();
    const updates = vi.fn();
    const unsubscribe = owner.subscribe(updates);

    expect(owner.admit({ nope: true })).toBe("rejected");
    expect(owner.admit(activation)).toBe("accepted");
    expect(owner.admit({ ...activation })).toBe("duplicate");
    expect(owner.admit({ ...activation, draft: "conflict" })).toBe("rejected");
    expect(owner.admit({ ...activation, workingDirectory: "/workspace/other" })).toBe("rejected");
    expect(owner.admit({ ...activation, launchId: "87654321-4321-4321-8321-cba987654321" })).toBe(
      "rejected",
    );
    expect(owner.read()).toEqual({ phase: "waiting", activation });
    expect(updates).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("snapshots admitted bytes so an untrusted caller cannot mutate pending work", async () => {
    const owner = createThreadClientActivationOwner();
    const input = { ...activation };
    owner.admit(input);
    input.draft = "mutated after admission";
    input.workingDirectory = "/workspace/mutated";
    const dependencies = attempt();

    await owner.attempt(dependencies);

    expect(dependencies.stageDraft).toHaveBeenCalledWith(draftId, activation.draft);
    expect(owner.read()).toMatchObject({ activation });
  });

  it("keeps one opening claim across overlapping renders and completes exact-byte staging", async () => {
    const owner = createThreadClientActivationOwner();
    const opened = deferred<{ draftId: DraftId; threadId: ThreadId } | null>();
    const dependencies = attempt({ openDraft: vi.fn(() => opened.promise) });
    owner.admit(activation);

    const first = owner.attempt(dependencies);
    const overlap = owner.attempt(dependencies);
    expect(overlap).toBe(first);
    expect(dependencies.openDraft).toHaveBeenCalledTimes(1);

    const differentThreadId = ThreadId.make("thread-different");
    opened.resolve({ draftId, threadId: differentThreadId });
    await first;

    expect(dependencies.stageDraft).toHaveBeenCalledWith(draftId, activation.draft);
    expect(dependencies.finishOpen).toHaveBeenCalledWith({
      draftId,
      threadId: differentThreadId,
    });
    expect(owner.read()).toEqual({ phase: "completed", activation });
    expect(dependencies.completeActivation).toHaveBeenCalledWith({
      contractVersion: 1,
      launchId: activation.launchId,
    });
    expect(owner.admit(activation)).toBe("duplicate");
    expect(owner.attempt(dependencies)).toBeNull();
  });

  it("retains null and rejected opens until an explicit retry", async () => {
    const owner = createThreadClientActivationOwner();
    const rejected = attempt({ openDraft: vi.fn(async () => null) });
    owner.admit(activation);

    await owner.attempt(rejected);
    expect(owner.read()).toMatchObject({ phase: "failed", activation });
    expect(owner.admit(activation)).toBe("duplicate");
    expect(owner.attempt(rejected)).toBeNull();
    expect(rejected.openDraft).toHaveBeenCalledTimes(1);

    expect(owner.retryOpen()).toBe(true);
    const accepted = attempt();
    await owner.attempt(accepted);
    expect(owner.read()).toEqual({ phase: "completed", activation });
  });

  it("turns a rejected promise into visible retry state without an unhandled rejection", async () => {
    const owner = createThreadClientActivationOwner();
    owner.admit(activation);

    await owner.attempt(
      attempt({
        openDraft: vi.fn(async () => {
          throw new Error("The environment disconnected.");
        }),
      }),
    );

    expect(owner.read()).toMatchObject({
      phase: "failed",
      message: "The environment disconnected.",
    });
  });

  it("preserves later authored content and stages the launch after retry opens a fresh draft", async () => {
    const owner = createThreadClientActivationOwner();
    const authoredAttempt = attempt({ inspectDraft: vi.fn((): "authored" => "authored") });
    owner.admit(activation);

    await owner.attempt(authoredAttempt);
    expect(authoredAttempt.stageDraft).not.toHaveBeenCalled();
    expect(owner.read()).toMatchObject({ phase: "failed" });

    const freshDraftId = "draft-fresh" as DraftId;
    owner.retryOpen();
    const freshAttempt = attempt({
      openDraft: vi.fn(async () => ({
        draftId: freshDraftId,
        threadId: ThreadId.make("thread-fresh"),
      })),
    });
    await owner.attempt(freshAttempt);

    expect(freshAttempt.stageDraft).toHaveBeenCalledWith(freshDraftId, activation.draft);
    expect(owner.read()).toMatchObject({ phase: "completed" });
  });

  it("opens omitted and empty drafts without inventing send or default behavior", async () => {
    for (const draft of [undefined, ""] as const) {
      const owner = createThreadClientActivationOwner();
      const dependencies = attempt();
      const next =
        draft === undefined
          ? { contractVersion: activation.contractVersion, launchId: activation.launchId }
          : { ...activation, draft };
      expect(owner.admit(next)).toBe("accepted");

      await owner.attempt(dependencies);

      if (draft === undefined) expect(dependencies.stageDraft).not.toHaveBeenCalled();
      else expect(dependencies.stageDraft).toHaveBeenCalledWith(draftId, "");
      expect(owner.read()).toMatchObject({ phase: "completed" });
    }
  });

  it("retries only the completion receipt after the draft is staged", async () => {
    const owner = createThreadClientActivationOwner();
    const unavailable = vi.fn(async () => false);
    const dependencies = attempt({ completeActivation: unavailable });
    owner.admit(activation);

    await owner.attempt(dependencies);
    expect(owner.read()).toMatchObject({ phase: "receipt-pending", activation });
    expect(dependencies.openDraft).toHaveBeenCalledTimes(1);
    expect(dependencies.stageDraft).toHaveBeenCalledTimes(1);

    const acknowledge = vi.fn(async () => true);
    await owner.retryCompletion(acknowledge);

    expect(acknowledge).toHaveBeenCalledWith({
      contractVersion: 1,
      launchId: activation.launchId,
    });
    expect(dependencies.openDraft).toHaveBeenCalledTimes(1);
    expect(dependencies.stageDraft).toHaveBeenCalledTimes(1);
    expect(owner.read()).toEqual({ phase: "completed", activation });
  });
});

it("does not acknowledge a fresh scoped launch whose opened draft disappeared", async () => {
  const owner = createThreadClientActivationOwner();
  owner.admit({
    contractVersion: 1,
    launchId: activation.launchId,
    workingDirectory: "/workspace/requested",
  });
  const dependencies = attempt({ inspectDraft: vi.fn((): "missing" => "missing") });
  await owner.attempt(dependencies);
  expect(owner.read()).toMatchObject({ phase: "failed" });
  expect(dependencies.completeActivation).not.toHaveBeenCalled();
});
