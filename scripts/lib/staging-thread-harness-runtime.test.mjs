import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  assertDesktopUnlocked,
  withDeadline,
  observeCodeDraft,
  matchesProjectScopeObservation,
  desktopActionArguments,
  noSendSnapshot,
  readinessIdentity,
} from "./staging-thread-harness-runtime.mjs";

import { readProcessIdentity } from "./staging-thread-harness-process.mjs";

const roots = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true, force: true }))),
);

describe("staging Thread runtime evidence", () => {
  it("uses current Lua dispatchers with bounded workspace and window arguments", () => {
    expect(desktopActionArguments("move", { workspace: 5, address: "0xab12" })).toEqual([
      "dispatch",
      'hl.dsp.window.move({workspace="5",window="address:0xab12",follow=false})',
    ]);
    expect(desktopActionArguments("focus", { address: "0xab12" })).toEqual([
      "dispatch",
      'hl.dsp.focus({window="address:0xab12"})',
    ]);
    expect(() => desktopActionArguments("focus", { address: '0xab12"});danger()' })).toThrow(
      "native-focus-failed",
    );
    expect(() => desktopActionArguments("workspace", { workspace: -1 })).toThrow(
      "native-focus-failed",
    );
  });

  it("accepts numeric Code readiness start ticks and rejects a recycled process identity", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-harness-ready-"));
    roots.push(root);
    const filePath = NodePath.join(root, "ready.json");
    const current = readProcessIdentity(process.pid);
    const receipt = {
      desktopMainPid: current.pid,
      desktopMainProcessStartTicks: Number(current.startTicks),
    };
    await NodeFSP.writeFile(filePath, JSON.stringify(receipt));
    expect(readinessIdentity(filePath).desktopMainProcessStartTicks).toBe(
      Number(current.startTicks),
    );
    await NodeFSP.writeFile(
      filePath,
      JSON.stringify({ ...receipt, desktopMainProcessStartTicks: Number(current.startTicks) + 1 }),
    );
    expect(() => readinessIdentity(filePath)).toThrow("protected-process-changed");
  });

  it("binds the active draft route to its persisted environment and exact project", () => {
    const project = {
      id: "project-one",
      environmentId: "environment-one",
      workspaceRoot: "/workspace/project",
    };
    const observation = {
      routeDraftId: "draft-one",
      projects: [project],
      persistedDrafts: JSON.stringify({
        state: {
          draftThreadsByThreadKey: {
            "draft-one": { projectId: project.id, environmentId: project.environmentId },
          },
        },
        version: 5,
      }),
    };
    expect(matchesProjectScopeObservation(observation, project.workspaceRoot)).toBe(true);
    expect(
      matchesProjectScopeObservation(
        { ...observation, routeDraftId: "draft-other" },
        project.workspaceRoot,
      ),
    ).toBe(false);
    expect(matchesProjectScopeObservation(observation, "/workspace/other")).toBe(false);
  });

  it("observes real staging send admission event types from a read only database", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-harness-db-"));
    roots.push(root);
    const databasePath = NodePath.join(root, "state.sqlite");
    const database = new NodeSqlite.DatabaseSync(databasePath);
    database.exec(
      "CREATE TABLE projection_turns (row_id INTEGER PRIMARY KEY); CREATE TABLE orchestration_events (sequence INTEGER PRIMARY KEY, event_type TEXT NOT NULL)",
    );
    database.exec(
      "INSERT INTO projection_turns DEFAULT VALUES; INSERT INTO orchestration_events (sequence, event_type) VALUES (10, 'thread.turn-start-requested'), (11, 'thread.message-sent'), (12, 'thread.created')",
    );
    database.close();
    expect(noSendSnapshot(databasePath)).toEqual({
      projectionTurns: 1,
      sendAdmissionEvents: 2,
      highWater: 11,
    });
  });
});

describe("native desktop admission and cleanup", () => {
  it("requires a positively unlocked Omarchy session", async () => {
    await expect(
      assertDesktopUnlocked(async () => ({ stdout: "false\n" })),
    ).resolves.toBeUndefined();
    await expect(assertDesktopUnlocked(async () => ({ stdout: "true\n" }))).rejects.toThrow(
      "desktop-locked",
    );
    await expect(assertDesktopUnlocked(async () => ({ stdout: "" }))).rejects.toThrow(
      "desktop-lock-state-unavailable",
    );
    await expect(
      assertDesktopUnlocked(async () => {
        throw new Error("unavailable");
      }),
    ).rejects.toThrow("desktop-lock-state-unavailable");
  });

  it("bounds an unresponsive close so signal fallback can proceed", async () => {
    let fallback = false;
    await withDeadline(() => new Promise(() => {}), 10).catch(() => {
      fallback = true;
    });
    expect(fallback).toBe(true);
    await expect(withDeadline(() => Promise.resolve("closed"), 100)).resolves.toBe("closed");
  });

  it("requires observed Code draft text and detects changed bytes", () => {
    const probe = {};
    expect(() => observeCodeDraft(probe, null)).toThrow("core-code-draft-unobserved");
    expect(probe.composerFingerprint).toBeUndefined();
    observeCodeDraft(probe, "draft ");
    observeCodeDraft(probe, "draft ");
    expect(probe.composerObservations).toBe(2);
    expect(() => observeCodeDraft(probe, "draft")).toThrow("core-code-not-usable");
  });
});
