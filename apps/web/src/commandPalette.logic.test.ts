import { assert, describe, it } from "vitest";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project, type Thread } from "./types";
import {
  deriveCommandPaletteGroups,
  filterCommandPaletteGroups,
  normalizeCommandPaletteQuery,
  type CommandPaletteSnapshot,
} from "./commandPalette.logic";
import {
  MessageId,
  OrchestrationProposedPlanId,
  ProjectId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

function project(input: Partial<Project> & Pick<Project, "id" | "name" | "cwd">): Project {
  return {
    defaultModelSelection: null,
    scripts: [],
    ...input,
  };
}

function thread(input: Partial<Thread> & Pick<Thread, "id" | "projectId" | "title">): Thread {
  return {
    codexThreadId: null,
    modelSelection: { provider: "codex", model: "gpt-5.2-codex" },
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    messages: [],
    proposedPlans: [],
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    latestTurn: null,
    branch: null,
    worktreePath: null,
    turnDiffSummaries: [],
    activities: [],
    ...input,
  };
}

function snapshot(input: Partial<CommandPaletteSnapshot> = {}): CommandPaletteSnapshot {
  return {
    projects: [],
    threads: [],
    projectOrder: [],
    activeThreadId: null,
    activeProjectId: null,
    keybindingsConfigPath: null,
    folderPickerAvailable: false,
    ...input,
  };
}

function allCommands(input: CommandPaletteSnapshot) {
  return deriveCommandPaletteGroups(input).flatMap((group) => group.commands);
}

describe("deriveCommandPaletteGroups", () => {
  it("keeps workspace and settings commands with no projects", () => {
    const commands = allCommands(snapshot());

    assert.isUndefined(
      commands.find((command) => command.id === "project.addLocal")?.disabledReason,
    );
    assert.isUndefined(
      commands.find((command) => command.id === "project.cloneRemote")?.disabledReason,
    );
    assert.equal(
      commands.find((command) => command.id === "project.pickFolder")?.disabledReason,
      "Folder picker is only available in the desktop app",
    );
    assert.isUndefined(commands.find((command) => command.id === "settings.open")?.disabledReason);
    assert.equal(
      commands.find((command) => command.id === "settings.keybindings")?.disabledReason,
      "Keybindings path is not ready",
    );
  });

  it("disables thread creation with no projects", () => {
    const commands = allCommands(snapshot());

    assert.equal(
      commands.find((command) => command.id === "thread.new")?.disabledReason,
      "Add a project before creating a thread",
    );
    assert.equal(
      commands.find((command) => command.id === "thread.newLocal")?.disabledReason,
      "Add a project before creating a thread",
    );
  });

  it("sorts threads and excludes archived threads", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const first = thread({
      id: ThreadId.makeUnsafe("thread-first"),
      projectId,
      title: "First",
      messages: [
        {
          id: MessageId.makeUnsafe("message-first"),
          role: "user",
          text: "first",
          createdAt: "2026-01-03T00:00:00.000Z",
          streaming: false,
        },
      ],
    });
    const second = thread({
      id: ThreadId.makeUnsafe("thread-second"),
      projectId,
      title: "Second",
      updatedAt: "2026-01-04T00:00:00.000Z",
    });
    const archived = thread({
      id: ThreadId.makeUnsafe("thread-archived"),
      projectId,
      title: "Archived",
      archivedAt: "2026-01-05T00:00:00.000Z",
    });

    const commands = allCommands(
      snapshot({
        projects: [project({ id: projectId, name: "App", cwd: "/repo/app" })],
        threads: [second, archived, first],
      }),
    ).filter((command) => command.kind === "switchThread");

    assert.deepEqual(
      commands.map((command) => command.label),
      ["First", "Second"],
    );
  });

  it("orders projects by UI project order", () => {
    const projectA = project({
      id: ProjectId.makeUnsafe("project-a"),
      name: "A",
      cwd: "/repo/a",
    });
    const projectB = project({
      id: ProjectId.makeUnsafe("project-b"),
      name: "B",
      cwd: "/repo/b",
    });

    const commands = allCommands(
      snapshot({
        projects: [projectA, projectB],
        projectOrder: [projectB.id, projectA.id],
      }),
    ).filter((command) => command.kind === "openProject");

    assert.deepEqual(
      commands.map((command) => command.label),
      ["B", "A"],
    );
  });

  it("enables panel commands with an active thread", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const activeThread = thread({
      id: ThreadId.makeUnsafe("thread-active"),
      projectId,
      title: "Active",
    });

    const commands = allCommands(
      snapshot({
        projects: [project({ id: projectId, name: "App", cwd: "/repo/app" })],
        threads: [activeThread],
        activeThreadId: activeThread.id,
      }),
    );

    assert.isUndefined(commands.find((command) => command.id === "panel.files")?.disabledReason);
    assert.isUndefined(commands.find((command) => command.id === "panel.git")?.disabledReason);
  });

  it("enables plan command and uses source plan thread id", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const sourceThreadId = ThreadId.makeUnsafe("thread-source");
    const planId = "plan-1" as OrchestrationProposedPlanId;
    const activeThread = thread({
      id: ThreadId.makeUnsafe("thread-active"),
      projectId,
      title: "Active",
      latestTurn: {
        turnId: TurnId.makeUnsafe("turn-1"),
        state: "completed",
        requestedAt: "2026-01-01T00:00:00.000Z",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:01:00.000Z",
        assistantMessageId: null,
        sourceProposedPlan: {
          threadId: sourceThreadId,
          planId,
        },
      },
      proposedPlans: [
        {
          id: planId,
          turnId: TurnId.makeUnsafe("turn-1"),
          planMarkdown: "plan",
          implementedAt: null,
          implementationThreadId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const planCommand = allCommands(
      snapshot({
        projects: [project({ id: projectId, name: "App", cwd: "/repo/app" })],
        threads: [activeThread],
        activeThreadId: activeThread.id,
      }),
    ).find((command) => command.id === "panel.plan");

    assert.isUndefined(planCommand?.disabledReason);
    assert.equal(planCommand?.planThreadId, sourceThreadId);
    assert.equal(planCommand?.planId, planId);
  });
});

describe("filterCommandPaletteGroups", () => {
  it("normalizes query tokens", () => {
    assert.deepEqual(normalizeCommandPaletteQuery("  Open   Git  "), ["open", "git"]);
  });

  it("filters across label and metadata while preserving stable order", () => {
    const projectId = ProjectId.makeUnsafe("project-1");
    const groups = deriveCommandPaletteGroups(
      snapshot({
        projects: [project({ id: projectId, name: "Backend", cwd: "/repo/backend" })],
        keybindingsConfigPath: "/tmp/keybindings.json",
      }),
    );

    const projectMatches = filterCommandPaletteGroups(groups, "repo backend").flatMap(
      (group) => group.commands,
    );
    assert.deepEqual(
      projectMatches.map((command) => command.id),
      [`project.open.${projectId}`],
    );

    const openMatches = filterCommandPaletteGroups(groups, "settings open").flatMap(
      (group) => group.commands,
    );
    assert.deepEqual(
      openMatches.map((command) => command.id),
      ["settings.open", "settings.keybindings"],
    );
  });
});
