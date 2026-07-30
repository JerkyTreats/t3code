import type { LatestProposedPlanState } from "~/session-logic";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  downloadPlanAsTextFile: vi.fn(),
  toastAdd: vi.fn(),
  writeProjectFile: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: <T,>(initialValue: T | (() => T)) => [
      typeof initialValue === "function" ? (initialValue as () => T)() : initialValue,
      vi.fn<(value: SetStateAction<T>) => void>(),
    ],
  };
});

vi.mock("~/proposedPlan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/proposedPlan")>();
  return {
    ...actual,
    downloadPlanAsTextFile: testState.downloadPlanAsTextFile,
  };
});

vi.mock("~/state/projects", () => ({
  projectEnvironment: { writeFile: Symbol("writeFile") },
}));

vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: () => testState.writeProjectFile,
}));

vi.mock("./ui/toast", () => ({
  stackedThreadToast: (input: unknown) => input,
  toastManager: { add: testState.toastAdd },
}));

import { PlanConversationDocument } from "./PlanConversationDocument";

type TestElement = ReactElement<Record<string, unknown>>;

const proposedPlan = {
  id: "plan:thread-one:turn:turn-one",
  createdAt: "2026-07-30T12:00:00.000Z",
  updatedAt: "2026-07-30T12:00:00.000Z",
  turnId: null,
  planMarkdown: "# Durable Preview\n\n## Scope\n\n- preserve virtual state\n",
  implementedAt: null,
  implementationThreadId: null,
} as LatestProposedPlanState;

function collectElements(node: ReactNode, elements: TestElement[] = []): TestElement[] {
  if (!isValidElement(node)) return elements;
  const element = node as TestElement;
  elements.push(element);
  Children.forEach(element.props.children as ReactNode, (child) => {
    collectElements(child, elements);
  });
  return elements;
}

function findElement(tree: ReactNode, predicate: (element: TestElement) => boolean): TestElement {
  const element = collectElements(tree).find(predicate);
  if (!element) {
    throw new Error("Expected plan preview element was not found");
  }
  return element;
}

function findAction(tree: ReactNode, label: string): TestElement {
  return findElement(
    tree,
    (element) =>
      element.props["aria-label"] === label ||
      (typeof element.props.children === "string" && element.props.children === label),
  );
}

function invokeClick(element: TestElement): void {
  const onClick = element.props.onClick;
  if (typeof onClick !== "function") {
    throw new Error("Expected plan preview action to preserve its click handler");
  }
  onClick();
}

function expandTopLevelFunction(element: ReactElement): ReactElement {
  if (typeof element.type !== "function") return element;
  const component = element.type as (props: unknown) => ReactElement;
  return component(element.props);
}

function collectText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  const element = node as TestElement;
  return Children.toArray(element.props.children as ReactNode)
    .map(collectText)
    .join("");
}

function renderPlan(input?: {
  onCollapse?: () => void;
  proposedPlan?: LatestProposedPlanState | null;
  workspaceCwd?: string | undefined;
}): ReactElement {
  return PlanConversationDocument({
    environmentId: "local" as never,
    proposedPlan: input?.proposedPlan === undefined ? proposedPlan : input.proposedPlan,
    workspaceCwd: input && "workspaceCwd" in input ? input.workspaceCwd : "/workspace/project",
    onCollapse: input?.onCollapse ?? vi.fn(),
  });
}

beforeEach(() => {
  testState.downloadPlanAsTextFile.mockReset();
  testState.toastAdd.mockReset();
  testState.writeProjectFile.mockReset();
  testState.writeProjectFile.mockResolvedValue({
    _tag: "Success",
    value: { relativePath: "durable-preview.md" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanConversationDocument interactions", () => {
  it("copies and downloads the normalized in-memory plan payload", () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const tree = renderPlan();

    invokeClick(findAction(tree, "Copy plan"));
    invokeClick(findAction(tree, "Download as markdown"));

    const expectedContents = "# Durable Preview\n\n## Scope\n\n- preserve virtual state\n";
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expectedContents);
    expect(testState.downloadPlanAsTextFile).toHaveBeenCalledExactlyOnceWith(
      "durable-preview.md",
      expectedContents,
    );
  });

  it("saves only through the explicit workspace action with the concrete target", () => {
    const tree = renderPlan();

    invokeClick(findAction(tree, "Save to workspace"));

    expect(testState.writeProjectFile).toHaveBeenCalledExactlyOnceWith({
      environmentId: "local",
      input: {
        cwd: "/workspace/project",
        relativePath: "durable-preview.md",
        contents: "# Durable Preview\n\n## Scope\n\n- preserve virtual state\n",
      },
    });
  });

  it("keeps save disabled and side-effect free without a workspace", () => {
    const tree = renderPlan({ workspaceCwd: undefined });
    const saveAction = findAction(tree, "Save to workspace");

    expect(saveAction.props.disabled).toBe(true);
    invokeClick(saveAction);
    expect(testState.writeProjectFile).not.toHaveBeenCalled();
  });

  it("routes both return and close actions through the supplied collapse callback", () => {
    const onCollapse = vi.fn();
    const tree = renderPlan({ onCollapse });

    invokeClick(findAction(tree, "Return to chat"));
    invokeClick(findAction(tree, "Close preview"));

    expect(onCollapse).toHaveBeenCalledTimes(2);
  });

  it("passes virtual plan content to the document renderer with no source footer", () => {
    const tree = renderPlan();
    const documentRenderer = findElement(
      tree,
      (element) =>
        element.props.filePath === "durable-preview.md" &&
        typeof element.props.markdown === "string",
    );

    expect(documentRenderer.props).toMatchObject({
      filePath: "durable-preview.md",
      markdown: "## Scope\n\n- preserve virtual state",
      workspaceCwd: "/workspace/project",
      showSourceFooter: false,
    });
  });

  it("returns a safe missing state with working route-return actions", () => {
    const onCollapse = vi.fn();
    const missingTree = expandTopLevelFunction(renderPlan({ onCollapse, proposedPlan: null }));
    const text = collectText(missingTree);

    expect(text).toContain("Plan preview unavailable");
    expect(text).toContain("Plan not found");
    for (const returnAction of collectElements(missingTree).filter(
      (element) => element.props.onClick === onCollapse,
    )) {
      invokeClick(returnAction);
    }
    expect(onCollapse).toHaveBeenCalledTimes(2);
    expect(
      collectElements(missingTree).some(
        (element) => element.props.filePath === "durable-preview.md",
      ),
    ).toBe(false);
  });
});
