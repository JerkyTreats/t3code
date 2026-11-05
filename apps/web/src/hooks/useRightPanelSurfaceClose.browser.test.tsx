import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../test/render";
import { selectThreadRightPanelState, useRightPanelStore } from "../rightPanelStore";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { useRightPanelSurfaceClose } from "./useRightPanelSurfaceClose";

const fixture = vi.hoisted(() => ({
  confirm: (_labels: readonly string[]): Promise<boolean> => Promise.resolve(false),
  allowed: new Set<string>(),
  sessions: new Map<string, string>(),
  deletedThreads: [] as string[],
  failClose: false,
  routeParams: {} as Record<string, string>,
}));
// F23 admits a close against the live chat route, read at action time.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useRouter: () => ({
    get state() {
      return { matches: [{ params: fixture.routeParams }] };
    },
  }),
}));
vi.mock("../components/preview/previewHostActions", () => ({
  isPreviewHostRouteCurrent: (
    threadRef: { environmentId: string; threadId: string } | null,
    params: Record<string, string | undefined>,
  ) =>
    threadRef !== null &&
    params.environmentId === threadRef.environmentId &&
    params.threadId === threadRef.threadId,
  confirmPreviewHostClose: (input: { close: () => Promise<boolean> }) => input.close(),
  closeConfirmedPreviewHostSurface: () => Promise.resolve(true),
}));
vi.mock("../lib/terminalCloseConfirm", () => ({
  confirmTerminalClose: (labels: readonly string[]) => fixture.confirm(labels),
}));
vi.mock("../previewStateStore", () => ({
  previewStateLifetimeIsCurrent: () => () => true,
  setActivePreviewTab: () => {},
}));
vi.mock("../state/session", () => ({
  useEnvironmentScope: (id: string) => fixture.allowed.has(id),
  readEnvironmentScope: (id: string) => fixture.allowed.has(id),
}));
vi.mock("../state/entities", () => ({
  useQuietThreadShell: () => null,
  useProject: () => null,
  readThreadShell: () => null,
}));
vi.mock("../state/terminalSessions", () => ({ useKnownTerminalSessions: () => null }));
vi.mock("../composerDraftStore", async () => {
  const Schema = await import("effect/Schema");
  return {
    useComposerDraftStore: () => null,
    DraftId: Schema.String.pipe(Schema.brand("DraftId")),
  };
});
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand:
    (_command: unknown, label: string) =>
    async (request: {
      environmentId: string;
      input: { threadId: string; terminalId?: string; data?: string };
    }) => {
      if (label === "side chat delete") {
        fixture.deletedThreads.push(`${request.environmentId}/${request.input.threadId}`);
        return { _tag: "Success" };
      }
      const key = `${request.environmentId}/${request.input.threadId}/${request.input.terminalId}`;
      if (label === "terminal close" && fixture.failClose) return { _tag: "Failure" };
      if (label === "terminal close" || label === "terminal write") fixture.sessions.delete(key);
      return { _tag: "Success" };
    },
}));
// The commands are replaced above; importing their runtime would connect a client.
vi.mock("../state/terminal", () => ({ terminalEnvironment: { open: {}, close: {}, write: {} } }));
vi.mock("../state/preview", () => ({ previewEnvironment: { close: {} } }));
vi.mock("../state/threads", () => ({ threadEnvironment: { delete: {} } }));
vi.mock("../state/shell", async () => {
  const { Atom } = await import("effect/reactivity");
  const state = Atom.make({ status: "connecting" });
  return { environmentShell: { stateValueAtom: () => state } };
});
// The fork's preview close path loads command modules that build schedulers at import.
vi.mock("@t3tools/client-runtime/state/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/client-runtime/state/runtime")>()),
  isAtomCommandInterrupted: () => false,
}));

function setup() {
  fixture.allowed = new Set(["environment-a", "environment-b"]);
  fixture.sessions = new Map();
  fixture.deletedThreads = [];
  fixture.failClose = false;
  useRightPanelStore.setState({ byThreadKey: {} });
  useTerminalUiStateStore.setState({ terminalUiStateByThreadKey: {} });
  const original: ScopedThreadRef = {
    environmentId: EnvironmentId.make("environment-a"),
    threadId: ThreadId.make("thread-a"),
  };
  const other: ScopedThreadRef = {
    environmentId: EnvironmentId.make("environment-b"),
    threadId: ThreadId.make("thread-b"),
  };
  fixture.routeParams = { environmentId: original.environmentId, threadId: original.threadId };
  for (const ref of [original, other]) {
    fixture.sessions.set(`${ref.environmentId}/${ref.threadId}/term-1`, "history to preserve");
    useRightPanelStore.getState().openTerminal(ref, "term-1");
  }
  const surface = selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, original)
    .surfaces[0]!;
  let resolve!: (confirmed: boolean) => void;
  const confirmation = new Promise<boolean>((done) => {
    resolve = done;
  });
  fixture.confirm = () => confirmation;
  function Harness({ threadRef }: { threadRef: ScopedThreadRef }) {
    const { closeSurface } = useRightPanelSurfaceClose({
      threadRef,
      terminalLabelsById: new Map(),
    });
    return <button onClick={() => closeSurface(surface)}>Close original terminal</button>;
  }
  return { original, other, Harness, resolve };
}

// The route still shows the original thread, so F23 admits the close there.
it.each([false, true])(
  "keeps a pending close on its original environment and thread, fallback=%s",
  async (failClose) => {
    const { original, other, Harness, resolve } = setup();
    fixture.failClose = failClose;
    await using screen = await render(<Harness threadRef={original} />);
    await screen.getByRole("button").click();
    await screen.rerender(<Harness threadRef={other} />);
    await act(async () => {
      resolve(true);
    });
    expect([...fixture.sessions]).toEqual([
      ["environment-b/thread-b/term-1", "history to preserve"],
    ]);
    const panels = useRightPanelStore.getState().byThreadKey;
    expect(selectThreadRightPanelState(panels, original).surfaces).toEqual([]);
    expect(selectThreadRightPanelState(panels, other).surfaces).toHaveLength(1);
  },
);

it.each(["cancel", "revoked"])(
  "leaves both sessions intact when confirmation is %s",
  async (outcome) => {
    const { original, other, Harness, resolve } = setup();
    await using screen = await render(<Harness threadRef={original} />);
    await screen.getByRole("button").click();
    await screen.rerender(<Harness threadRef={other} />);
    if (outcome === "revoked") fixture.allowed.delete(original.environmentId);
    await act(async () => {
      resolve(outcome !== "cancel");
    });
    expect(fixture.sessions.size).toBe(2);
    expect(
      useRightPanelStore.getState().byThreadKey[scopedThreadKey(other)]?.surfaces,
    ).toHaveLength(1);
  },
);

// F23 drops a pending close once the route shows another thread; upstream closed it anyway.
it("drops a pending close after the route moves to another thread", async () => {
  const { original, other, Harness, resolve } = setup();
  await using screen = await render(<Harness threadRef={original} />);
  await screen.getByRole("button").click();
  fixture.routeParams = { environmentId: other.environmentId, threadId: other.threadId };
  await screen.rerender(<Harness threadRef={other} />);
  await act(async () => {
    resolve(true);
  });
  expect(fixture.sessions.size).toBe(2);
  const panels = useRightPanelStore.getState().byThreadKey;
  expect(selectThreadRightPanelState(panels, original).surfaces).toHaveLength(1);
  expect(selectThreadRightPanelState(panels, other).surfaces).toHaveLength(1);
});

it("deletes an unused side chat on close", async () => {
  const { original } = setup();
  const sideChatId = ThreadId.make("side-chat-a");
  useRightPanelStore.getState().openSideChat(original, sideChatId);
  const sideChat = selectThreadRightPanelState(
    useRightPanelStore.getState().byThreadKey,
    original,
  ).surfaces.find((surface) => surface.kind === "side-chat")!;
  let closed: Promise<boolean> | undefined;
  function SideChatHarness() {
    const { closeSurface } = useRightPanelSurfaceClose({
      threadRef: original,
      terminalLabelsById: new Map(),
    });
    return (
      <button
        onClick={() => {
          closed = closeSurface(sideChat);
        }}
      >
        Close side chat
      </button>
    );
  }
  await using screen = await render(<SideChatHarness />);
  await screen.getByRole("button").click();
  expect(await closed).toBe(true);
  expect(fixture.deletedThreads).toEqual(["environment-a/side-chat-a"]);
  expect(
    selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, original).surfaces.some(
      (surface) => surface.kind === "side-chat",
    ),
  ).toBe(false);
});
