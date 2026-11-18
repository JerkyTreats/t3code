import { useAtomSet } from "@effect/atom-react";
import { EnvironmentId, type PageStateDocument, ThreadId } from "@t3tools/contracts";
import { injectHtmlRenderBootstrap } from "@t3tools/shared/htmlRender";
import { AsyncResult, Atom } from "effect/reactivity";
import { userEvent } from "vite-plus/test/browser";
import { expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import { HtmlRenderDocument } from "../components/files/BrowserDocumentFrame";
import { pageStateDocument } from "../state/pageState";

const testState = vi.hoisted(() => ({ write: vi.fn() }));

// One synthetic document stands in for the server's follow; the write command is a spy.
vi.mock(import("../state/pageState"), async () => {
  const { AsyncResult, Atom } = await import("effect/reactivity");
  const document = Atom.make(
    AsyncResult.success<PageStateDocument>({
      key: "workflow",
      value: { stage: "Research" },
      revision: 1,
      updatedBy: "agent",
    }),
  );
  const allowed = Atom.make(true);
  return {
    pageStateDocument: () => document,
    pageStateWrite: { permissionAtom: () => allowed },
  } as never;
});
vi.mock(import("../state/use-atom-command"), () => ({ useAtomCommand: () => testState.write }));

function setup() {
  testState.write
    .mockReset()
    .mockResolvedValue(AsyncResult.success({ key: "workflow", revision: 2 }));
}

const threadRef = {
  environmentId: EnvironmentId.make("environment-page-state-test"),
  threadId: ThreadId.make("thread-page-state-test"),
};

// The page renders from t3.state and saves the reader's step back with merge.
const page = injectHtmlRenderBootstrap(`<!doctype html><html><head></head><body><script>
  var load = Math.random();
  try {
    t3.state.subscribe("constructor", function () {});
    parent.postMessage({ type: "prototype-key", ok: true }, "*");
  } catch (error) {
    parent.postMessage({ type: "prototype-key", ok: false }, "*");
  }
  t3.state.subscribe("workflow", function (value, revision) {
    parent.postMessage({ type: "rendered", stage: value.stage, revision: revision, load: load }, "*");
    if (value.stage === "Research") {
      t3.state.merge("workflow", { stage: "Design" }, { expectedRevision: revision }).then(function (saved) {
        parent.postMessage({ type: "saved", revision: saved }, "*");
      });
    }
  });
</script></body></html>`);

// Stands in for the server pushing the agent's next write.
function NextWrite() {
  const set = useAtomSet(
    pageStateDocument({
      environmentId: threadRef.environmentId,
      input: { ...threadRef, key: "workflow" },
    }) as Atom.Writable<AsyncResult.AsyncResult<PageStateDocument>>,
  );
  return (
    <button
      type="button"
      onClick={() =>
        set(AsyncResult.success({ key: "workflow", value: { stage: "Verification" }, revision: 3 }))
      }
    >
      Next write
    </button>
  );
}

it("serves t3.state to a page: values flow in without a reload, and its writes save as the reader's", async () => {
  setup();
  const src = URL.createObjectURL(new Blob([page], { type: "text/html" }));
  using _url = { [Symbol.dispose]: () => URL.revokeObjectURL(src) };
  const messages: Array<Record<string, unknown>> = [];
  const listening = new AbortController();
  using _listening = { [Symbol.dispose]: () => listening.abort() };
  window.addEventListener("message", (event) => messages.push(event.data), {
    signal: listening.signal,
  });
  await using screen = await render(
    <>
      <NextWrite />
      <HtmlRenderDocument src={src} title="Workflow" threadRef={threadRef} />
    </>,
  );
  const frame = screen.container.querySelector("iframe");

  await vi.waitFor(() => expect(messages).toContainEqual({ type: "saved", revision: 2 }));
  expect(testState.write).toHaveBeenCalledWith({
    environmentId: threadRef.environmentId,
    input: {
      threadId: threadRef.threadId,
      key: "workflow",
      merge: { stage: "Design" },
      expectedRevision: 1,
    },
  });
  const first = messages.find((message) => message.type === "rendered");

  await userEvent.click(screen.getByRole("button", { name: "Next write" }));
  await vi.waitFor(() =>
    expect(messages).toContainEqual({
      type: "rendered",
      stage: "Verification",
      revision: 3,
      load: first?.load,
    }),
  );
  expect(screen.container.querySelector("iframe")).toBe(frame);
  expect(messages).toContainEqual({ type: "prototype-key", ok: true });
});

it("answers a page with no thread at once: reads unavailable, writes refused", async () => {
  setup();
  const lone = injectHtmlRenderBootstrap(`<!doctype html><html><head></head><body><script>
    function report(kind) {
      return function (error) { parent.postMessage({ type: kind, code: error.code }, "*"); };
    }
    t3.state.get("workflow").then(null, report("get"));
    t3.state.set("workflow", 1).then(null, report("set"));
  </script></body></html>`);
  const src = URL.createObjectURL(new Blob([lone], { type: "text/html" }));
  using _url = { [Symbol.dispose]: () => URL.revokeObjectURL(src) };
  const messages: Array<Record<string, unknown>> = [];
  const listening = new AbortController();
  using _listening = { [Symbol.dispose]: () => listening.abort() };
  window.addEventListener("message", (event) => messages.push(event.data), {
    signal: listening.signal,
  });
  await using _screen = await render(<HtmlRenderDocument src={src} title="Lone" />);

  await vi.waitFor(() => {
    expect(messages).toContainEqual({ type: "get", code: "unavailable" });
    expect(messages).toContainEqual({ type: "set", code: "unavailable" });
  });
  expect(testState.write).not.toHaveBeenCalled();
});
