import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  CommandId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";

const threadId = ThreadId.make("thread-settlement");
const now = "2026-07-29T00:00:00.000Z";

function readModel(
  settlement: {
    readonly settledOverride: "settled" | "active" | null;
    readonly settledAt: string | null;
    readonly updatedAt?: string;
  } = { settledOverride: null, settledAt: null },
): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    updatedAt: now,
    projects: [],
    threads: [
      {
        id: threadId,
        projectId: ProjectId.make("project-settlement"),
        title: "Settlement",
        modelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: now,
        updatedAt: settlement.updatedAt ?? now,
        archivedAt: null,
        settledOverride: settlement.settledOverride,
        settledAt: settlement.settledAt,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ],
  };
}

function eventsOf(
  decision:
    | Omit<OrchestrationEvent, "sequence">
    | ReadonlyArray<Omit<OrchestrationEvent, "sequence">>,
) {
  return Array.isArray(decision) ? decision : [decision];
}

function shellFor(
  model: OrchestrationReadModel,
  blockers: Partial<
    Pick<
      OrchestrationThreadShell,
      | "hasPendingApprovals"
      | "hasPendingUserInput"
      | "latestUserMessageAt"
      | "latestTurn"
      | "session"
    >
  > = {},
): OrchestrationThreadShell {
  const thread = model.threads[0];
  if (thread === undefined) {
    throw new Error("Expected settlement thread.");
  }
  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    latestTurn: blockers.latestTurn ?? thread.latestTurn,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    archivedAt: thread.archivedAt,
    settledOverride: thread.settledOverride,
    settledAt: thread.settledAt,
    session: blockers.session ?? thread.session,
    latestUserMessageAt: blockers.latestUserMessageAt ?? null,
    hasPendingApprovals: blockers.hasPendingApprovals ?? false,
    hasPendingUserInput: blockers.hasPendingUserInput ?? false,
    hasActionableProposedPlan: false,
    activePlanProgress: null,
    latestRuntimeActivityAt: null,
    statusSummaryUpdatedAt: null,
  };
}

it.layer(NodeServices.layer)("settled thread decisions", (it) => {
  it.effect("preserves the first accepted settlement timestamp on repeated settle", () =>
    Effect.gen(function* () {
      const initial = readModel();
      yield* TestClock.setTime(Date.parse("2026-07-29T00:10:00.000Z"));
      const first = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-first"),
          threadId,
          createdAt: "2026-07-29T00:01:00.000Z",
        },
        readModel: initial,
        settlementShell: shellFor(initial),
      });
      const firstEvent = eventsOf(first)[0];
      expect(firstEvent?.type).toBe("thread.settled");
      if (firstEvent?.type !== "thread.settled") {
        throw new Error("Expected thread.settled.");
      }
      expect(firstEvent.payload.settledAt).toBe("2026-07-29T00:10:00.000Z");

      const afterFirst = yield* projectEvent(initial, {
        ...firstEvent,
        sequence: 2,
      });
      yield* TestClock.setTime(Date.parse("2026-07-29T00:15:00.000Z"));
      const repeated = yield* decideOrchestrationCommand({
        command: {
          type: "thread.settle",
          commandId: CommandId.make("cmd-settle-repeated"),
          threadId,
          createdAt: "2026-07-29T00:05:00.000Z",
        },
        readModel: afterFirst,
        settlementShell: shellFor(afterFirst),
      });
      const repeatedEvent = eventsOf(repeated)[0];
      expect(repeatedEvent?.type).toBe("thread.settled");
      if (repeatedEvent?.type !== "thread.settled") {
        throw new Error("Expected repeated thread.settled.");
      }
      expect(repeatedEvent.payload.settledAt).toBe("2026-07-29T00:10:00.000Z");
      expect(repeatedEvent.payload.updatedAt).toBe("2026-07-29T00:10:00.000Z");
    }),
  );

  it.effect("emits an explicit user unsettle event", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-07-29T00:20:00.000Z"));
      const decision = yield* decideOrchestrationCommand({
        command: {
          type: "thread.unsettle",
          commandId: CommandId.make("cmd-unsettle-user"),
          threadId,
          reason: "user",
          createdAt: "2026-07-29T00:02:00.000Z",
        },
        readModel: readModel({
          settledOverride: "settled",
          settledAt: "2026-07-29T00:01:00.000Z",
        }),
      });
      const event = eventsOf(decision)[0];
      expect(event?.type).toBe("thread.unsettled");
      if (event?.type !== "thread.unsettled") {
        throw new Error("Expected thread.unsettled.");
      }
      expect(event.payload.reason).toBe("user");
      expect(event.payload.updatedAt).toBe("2026-07-29T00:20:00.000Z");
      expect(event.occurredAt).toBe("2026-07-29T00:20:00.000Z");
    }),
  );

  it.effect("preserves the update timestamp on repeated user unsettle", () =>
    Effect.gen(function* () {
      const decision = yield* decideOrchestrationCommand({
        command: {
          type: "thread.unsettle",
          commandId: CommandId.make("cmd-unsettle-user-repeated"),
          threadId,
          reason: "user",
          createdAt: "2026-07-29T00:05:00.000Z",
        },
        readModel: readModel({
          settledOverride: "active",
          settledAt: null,
          updatedAt: "2026-07-29T00:02:00.000Z",
        }),
      });
      const event = eventsOf(decision)[0];
      expect(event?.type).toBe("thread.unsettled");
      if (event?.type !== "thread.unsettled") {
        throw new Error("Expected repeated thread.unsettled.");
      }
      expect(event.payload.updatedAt).toBe("2026-07-29T00:02:00.000Z");
    }),
  );

  it.effect("rejects settlement for every active blocker", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-07-29T00:10:00.000Z"));
      const model = readModel();
      const blockers: ReadonlyArray<OrchestrationThreadShell> = [
        shellFor(model, { hasPendingApprovals: true }),
        shellFor(model, { hasPendingUserInput: true }),
        shellFor(model, {
          session: {
            threadId,
            status: "starting",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: "2026-07-29T00:09:00.000Z",
          },
        }),
        shellFor(model, {
          session: {
            threadId,
            status: "running",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: "2026-07-29T00:09:00.000Z",
          },
        }),
        shellFor(model, {
          latestUserMessageAt: "2026-07-29T00:09:00.000Z",
        }),
      ];

      for (const settlementShell of blockers) {
        const exit = yield* Effect.exit(
          decideOrchestrationCommand({
            command: {
              type: "thread.settle",
              commandId: CommandId.make("cmd-settle-blocked"),
              threadId,
              createdAt: "2026-07-29T00:00:00.000Z",
            },
            readModel: model,
            settlementShell,
          }),
        );
        expect(exit._tag).toBe("Failure");
      }
    }),
  );

  it.effect("appends an activity reset to every waking business decision", () =>
    Effect.gen(function* () {
      const commands: ReadonlyArray<OrchestrationCommand> = [
        {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd-wake-turn"),
          threadId,
          message: {
            messageId: MessageId.make("message-wake-turn"),
            role: "user",
            text: "wake",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          createdAt: "2026-07-29T00:03:00.000Z",
        },
        {
          type: "thread.session.set",
          commandId: CommandId.make("cmd-wake-session-starting"),
          threadId,
          session: {
            threadId,
            status: "starting",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: "2026-07-29T00:04:00.000Z",
          },
          createdAt: "2026-07-29T00:04:00.000Z",
        },
        {
          type: "thread.session.set",
          commandId: CommandId.make("cmd-wake-session-running"),
          threadId,
          session: {
            threadId,
            status: "running",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: "2026-07-29T00:05:00.000Z",
          },
          createdAt: "2026-07-29T00:05:00.000Z",
        },
        ...(["approval.requested", "user-input.requested"] as const).map(
          (kind, index): OrchestrationCommand => ({
            type: "thread.activity.append",
            commandId: CommandId.make(`cmd-wake-activity-${index}`),
            threadId,
            activity: {
              id: EventId.make(`activity-wake-${index}`),
              tone: "approval",
              kind,
              summary: "Input required",
              payload: {},
              turnId: null,
              createdAt: `2026-07-29T00:0${index + 6}:00.000Z`,
            },
            createdAt: `2026-07-29T00:0${index + 6}:00.000Z`,
          }),
        ),
      ];

      for (const command of commands) {
        const decision = yield* decideOrchestrationCommand({
          command,
          readModel: readModel({
            settledOverride: "settled",
            settledAt: "2026-07-29T00:01:00.000Z",
          }),
        });
        const events = eventsOf(decision);
        const reset = events[0];
        expect(reset?.type).toBe("thread.unsettled");
        if (reset?.type !== "thread.unsettled") {
          throw new Error(`Expected activity reset for ${command.type}.`);
        }
        expect(reset.payload.reason).toBe("activity");
      }
    }),
  );

  it.effect("does not emit activity reset when no persisted settlement state exists", () =>
    Effect.gen(function* () {
      const decision = yield* decideOrchestrationCommand({
        command: {
          type: "thread.session.set",
          commandId: CommandId.make("cmd-session-running-active"),
          threadId,
          session: {
            threadId,
            status: "running",
            providerName: "codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: "2026-07-29T00:05:00.000Z",
          },
          createdAt: "2026-07-29T00:05:00.000Z",
        },
        readModel: readModel(),
      });
      expect(eventsOf(decision).map((event) => event.type)).toEqual(["thread.session-set"]);
    }),
  );
});
