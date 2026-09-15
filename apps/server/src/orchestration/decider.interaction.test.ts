import {
  AuthClientId,
  CommandId,
  InteractionId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";
import { projectEvent } from "./projector.ts";

const NOW = "2026-09-14T18:00:00.000Z";
const THREAD_ID = ThreadId.make("thread-interaction");
const INTERACTION_ID = InteractionId.make("interaction-wallpaper");
const ANCHOR_TURN_ID = TurnId.make("turn-anchor");
const ACTOR_CLIENT_ID = AuthClientId.make("client-actor");

function makeReadModel(): OrchestrationReadModel {
  return {
    snapshotSequence: 7,
    projects: [],
    threads: [
      {
        id: THREAD_ID,
        projectId: ProjectId.make("project-interaction"),
        title: "Interaction thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
        messages: [
          {
            id: MessageId.make("message-anchor"),
            role: "assistant",
            text: "Please interact with the wallpaper.",
            turnId: ANCHOR_TURN_ID,
            streaming: false,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        proposedPlans: [],
        activities: [],
        interactions: [],
        checkpoints: [],
        session: null,
      },
    ],
    updatedAt: NOW,
  };
}

function decideAndProject(readModel: OrchestrationReadModel, command: OrchestrationCommand) {
  return Effect.gen(function* () {
    const planned = yield* decideOrchestrationCommand({ readModel, command });
    const events = Array.isArray(planned) ? planned : [planned];
    let next = readModel;
    for (const event of events) {
      next = yield* projectEvent(next, {
        ...event,
        sequence: next.snapshotSequence + 1,
      } as OrchestrationEvent);
    }
    return { readModel: next, events };
  });
}

function createCommand(): Extract<OrchestrationCommand, { type: "interaction.create" }> {
  return {
    type: "interaction.create",
    commandId: CommandId.make("interaction-create"),
    operationId: CommandId.make("interaction-create"),
    interactionId: INTERACTION_ID,
    threadId: THREAD_ID,
    anchorTurnId: ANCHOR_TURN_ID,
    capabilityId: "wallpaper.interaction.lab.v1",
    actorClientId: ACTOR_CLIENT_ID,
    requestRef: "request-1",
    requestRevision: "revision-1",
    requestDigest: "digest-1",
    conditionRevision: "condition-1",
    inputProvenance: "synthetic",
    display: { title: "Synthetic input test", summary: "Select the highlighted region." },
    createdAt: NOW,
  };
}

it.layer(NodeServices.layer)("interaction resource decider", (it) => {
  it.effect("owns the durable lifecycle and admits one canonical continuation", () =>
    Effect.gen(function* () {
      let state = makeReadModel();
      state = (yield* decideAndProject(state, createCommand())).readModel;
      let resource = state.threads[0]!.interactions![0]!;
      expect(resource.createdSequence).toBe(8);
      expect(resource.request.inputProvenance).toBe("synthetic");

      state = (yield* decideAndProject(state, {
        type: "interaction.presentation.set",
        commandId: CommandId.make("presentation-ready"),
        threadId: THREAD_ID,
        interactionId: INTERACTION_ID,
        resourceRevision: resource.revision,
        presentationRevision: 1,
        ownerClientId: "client-1",
        state: "ready",
        lastFrameSequence: "1",
        droppedFrames: 0,
        createdAt: NOW,
      })).readModel;
      resource = state.threads[0]!.interactions![0]!;

      state = (yield* decideAndProject(state, {
        type: "interaction.engage",
        commandId: CommandId.make("engage"),
        threadId: THREAD_ID,
        interactionId: INTERACTION_ID,
        resourceRevision: resource.revision,
        presentationRevision: 1,
        ownerClientId: "client-1",
        createdAt: NOW,
      })).readModel;
      resource = state.threads[0]!.interactions![0]!;
      expect(resource.engagement).toMatchObject({ state: "engaged", epoch: 1 });

      state = (yield* decideAndProject(state, {
        type: "interaction.disengage",
        commandId: CommandId.make("disengage"),
        threadId: THREAD_ID,
        interactionId: INTERACTION_ID,
        resourceRevision: resource.revision,
        ownerClientId: "client-1",
        createdAt: NOW,
      })).readModel;
      resource = state.threads[0]!.interactions![0]!;

      state = (yield* decideAndProject(state, {
        type: "interaction.resolve",
        commandId: CommandId.make("resolve"),
        operationId: CommandId.make("resolve"),
        threadId: THREAD_ID,
        interactionId: INTERACTION_ID,
        actorClientId: ACTOR_CLIENT_ID,
        requestRef: "request-1",
        requestRevision: "revision-1",
        requestDigest: "digest-1",
        conditionRevision: "condition-1",
        resourceRevision: resource.revision,
        ownerOperationId: "owner-operation-1",
        ownerReceiptId: "owner-receipt-1",
        disposition: "satisfied",
        observation: {
          engagementEpoch: 1,
          sourceSequenceStart: "18446744073709551614",
          sourceSequenceEnd: "18446744073709551615",
          nativeTimeStartNs: "9007199254740992",
          nativeTimeEndNs: "9007199254740993",
          timingBasis: "native-monotonic-v1",
          provenanceClass: "synthetic",
        },
        evidence: {
          ref: "evidence-1",
          digest: "sha256:evidence",
          byteCount: 42,
          mediaType: "application/json",
        },
        summary: "The requested input was observed.",
        createdAt: NOW,
      })).readModel;
      resource = state.threads[0]!.interactions![0]!;
      expect(resource.lifecycle.state).toBe("resolved");
      expect(resource.evidence?.sourceSequenceEnd).toBe("18446744073709551615");
      expect(resource.continuation).toMatchObject({ state: "pending" });

      const resolutionRevision = resource.revision;
      state = (yield* decideAndProject(state, {
        type: "interaction.continuation.admit",
        commandId: CommandId.make("continuation-admit"),
        threadId: THREAD_ID,
        interactionId: INTERACTION_ID,
        resolutionRevision,
        createdAt: NOW,
      })).readModel;
      resource = state.threads[0]!.interactions![0]!;
      expect(resource.continuation).toEqual({
        state: "admitted",
        continuationId: "continuation-admit",
        resolutionRevision,
      });
    }),
  );

  it.effect("rejects lease overwrite and mismatched owner provenance", () =>
    Effect.gen(function* () {
      let state = (yield* decideAndProject(makeReadModel(), createCommand())).readModel;
      let resource = state.threads[0]!.interactions![0]!;
      state = (yield* decideAndProject(state, {
        type: "interaction.presentation.set",
        commandId: CommandId.make("presentation-ready-2"),
        threadId: THREAD_ID,
        interactionId: INTERACTION_ID,
        resourceRevision: resource.revision,
        presentationRevision: 1,
        ownerClientId: "client-owner",
        state: "ready",
        lastFrameSequence: "1",
        droppedFrames: 0,
        createdAt: NOW,
      })).readModel;
      resource = state.threads[0]!.interactions![0]!;
      state = (yield* decideAndProject(state, {
        type: "interaction.engage",
        commandId: CommandId.make("engage-owner"),
        threadId: THREAD_ID,
        interactionId: INTERACTION_ID,
        resourceRevision: resource.revision,
        presentationRevision: 1,
        ownerClientId: "client-owner",
        createdAt: NOW,
      })).readModel;
      resource = state.threads[0]!.interactions![0]!;

      const overwrite = yield* decideOrchestrationCommand({
        readModel: state,
        command: {
          type: "interaction.engage",
          commandId: CommandId.make("engage-other"),
          threadId: THREAD_ID,
          interactionId: INTERACTION_ID,
          resourceRevision: resource.revision,
          presentationRevision: 1,
          ownerClientId: "client-other",
          createdAt: NOW,
        },
      }).pipe(Effect.flip);
      expect(overwrite._tag).toBe("OrchestrationCommandInvariantError");

      const wrongProvenance = yield* decideOrchestrationCommand({
        readModel: state,
        command: {
          type: "interaction.resolve",
          commandId: CommandId.make("resolve-wrong-provenance"),
          operationId: CommandId.make("resolve-wrong-provenance"),
          threadId: THREAD_ID,
          interactionId: INTERACTION_ID,
          actorClientId: ACTOR_CLIENT_ID,
          requestRef: "request-1",
          requestRevision: "revision-1",
          requestDigest: "digest-1",
          conditionRevision: "condition-1",
          resourceRevision: resource.revision,
          ownerOperationId: "owner-operation-2",
          ownerReceiptId: "owner-receipt-2",
          disposition: "failed",
          observation: {
            engagementEpoch: 1,
            sourceSequenceStart: "1",
            sourceSequenceEnd: "2",
            nativeTimeStartNs: "3",
            nativeTimeEndNs: "4",
            timingBasis: "native-monotonic-v1",
            provenanceClass: "physical",
          },
          evidence: null,
          summary: "Rejected mismatch.",
          createdAt: NOW,
        },
      }).pipe(Effect.flip);
      expect(wrongProvenance._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("lets a human turn reclaim admitted work but blocks a submitting race", () =>
    Effect.gen(function* () {
      const base = makeReadModel();
      const admitted = {
        ...base,
        threads: [
          {
            ...base.threads[0]!,
            interactions: [
              {
                id: INTERACTION_ID,
                threadId: THREAD_ID,
                revision: 5,
                anchorTurnId: ANCHOR_TURN_ID,
                createdSequence: 1,
                capabilityId: "wallpaper.interaction.lab.v1" as const,
                createdByClientId: ACTOR_CLIENT_ID,
                request: {
                  ref: "request-1",
                  revision: "revision-1",
                  digest: "digest-1",
                  conditionRevision: "condition-1",
                  inputProvenance: "synthetic" as const,
                },
                display: { title: "Synthetic input test", summary: "Select a region." },
                lifecycle: { state: "resolved" as const, ownerReceiptId: "receipt-1" },
                presentation: {
                  state: "stopped" as const,
                  presentationRevision: 1,
                  lastFrameSequence: "1",
                  droppedFrames: 0,
                },
                engagement: { state: "disengaged" as const, latestEpoch: 1 },
                evidence: null,
                resolution: {
                  ownerOperationId: "owner-operation-1",
                  ownerReceiptId: "receipt-1",
                  summary: "Resolved",
                  timingBasis: "native-monotonic-v1",
                  provenanceClass: "synthetic" as const,
                  resolvedByClientId: ACTOR_CLIENT_ID,
                },
                continuation: {
                  state: "admitted" as const,
                  continuationId: CommandId.make("continuation-1"),
                  resolutionRevision: 4,
                },
                createdAt: NOW,
                updatedAt: NOW,
              },
            ],
          },
        ],
      } satisfies OrchestrationReadModel;
      const humanCommand = {
        type: "thread.turn.start" as const,
        commandId: CommandId.make("human-turn"),
        threadId: THREAD_ID,
        runtimeMode: "full-access" as const,
        interactionMode: "default" as const,
        message: {
          messageId: MessageId.make("human-message"),
          role: "user" as const,
          text: "I am taking over.",
          attachments: [],
        },
        createdAt: NOW,
      };
      const humanEvents = yield* decideOrchestrationCommand({
        readModel: admitted,
        command: humanCommand,
      });
      expect(
        (Array.isArray(humanEvents) ? humanEvents : [humanEvents]).map((event) => event.type),
      ).toEqual(["thread.activity-appended", "thread.message-sent", "thread.turn-start-requested"]);

      const submitting = {
        ...admitted,
        threads: [
          {
            ...admitted.threads[0]!,
            interactions: admitted.threads[0]!.interactions!.map((resource) => ({
              ...resource,
              continuation: {
                state: "submitting" as const,
                continuationId: CommandId.make("continuation-1"),
                resolutionRevision: 4,
              },
            })),
          },
        ],
      } satisfies OrchestrationReadModel;
      const raced = yield* decideOrchestrationCommand({
        readModel: submitting,
        command: humanCommand,
      }).pipe(Effect.flip);
      expect(raced._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});
