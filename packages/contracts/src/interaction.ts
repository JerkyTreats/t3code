import * as Schema from "effect/Schema";

import {
  AuthClientId,
  CommandId,
  IsoDateTime,
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas.ts";

const BoundedText = TrimmedNonEmptyString.check(Schema.isMaxLength(512));
const Digest = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export const InteractionDecimalU64 = Schema.String.check(
  Schema.isPattern(/^(0|[1-9][0-9]{0,19})$/),
);

export const InteractionId = TrimmedNonEmptyString.pipe(Schema.brand("InteractionId"));
export type InteractionId = typeof InteractionId.Type;

export const InteractionCapabilityId = Schema.Literal("wallpaper.interaction.lab.v1");
export type InteractionCapabilityId = typeof InteractionCapabilityId.Type;

export const InteractionEvidence = Schema.Struct({
  ref: BoundedText,
  digest: Digest,
  byteCount: NonNegativeInt,
  mediaType: BoundedText,
  sourceSequenceStart: InteractionDecimalU64,
  sourceSequenceEnd: InteractionDecimalU64,
  nativeTimeStartNs: InteractionDecimalU64,
  nativeTimeEndNs: InteractionDecimalU64,
});
export type InteractionEvidence = typeof InteractionEvidence.Type;

export const InteractionResource = Schema.Struct({
  id: InteractionId,
  threadId: ThreadId,
  revision: NonNegativeInt,
  anchorTurnId: TurnId,
  createdSequence: NonNegativeInt,
  capabilityId: InteractionCapabilityId,
  createdByClientId: AuthClientId,
  request: Schema.Struct({
    ref: BoundedText,
    revision: BoundedText,
    digest: Digest,
    conditionRevision: BoundedText,
    inputProvenance: Schema.Literals(["synthetic", "physical"]),
  }),
  display: Schema.Struct({
    title: BoundedText,
    summary: BoundedText,
  }),
  lifecycle: Schema.Union([
    Schema.Struct({ state: Schema.Literal("open") }),
    Schema.Struct({ state: Schema.Literal("resolved"), ownerReceiptId: BoundedText }),
    Schema.Struct({ state: Schema.Literal("failed"), ownerReceiptId: BoundedText }),
    Schema.Struct({
      state: Schema.Literal("cancelled"),
      reason: Schema.Literals(["user", "thread-deleted"]),
    }),
    Schema.Struct({ state: Schema.Literal("expired") }),
  ]),
  presentation: Schema.Struct({
    state: Schema.Literals(["unavailable", "starting", "ready", "stopped", "failed"]),
    ownerClientId: Schema.optional(Schema.NullOr(BoundedText)),
    presentationRevision: NonNegativeInt,
    lastFrameSequence: Schema.NullOr(InteractionDecimalU64),
    droppedFrames: NonNegativeInt,
  }),
  engagement: Schema.Union([
    Schema.Struct({ state: Schema.Literal("disengaged"), latestEpoch: NonNegativeInt }),
    Schema.Struct({
      state: Schema.Literal("engaged"),
      epoch: NonNegativeInt,
      ownerClientId: BoundedText,
      presentationRevision: NonNegativeInt,
    }),
  ]),
  evidence: Schema.NullOr(InteractionEvidence),
  resolution: Schema.NullOr(
    Schema.Struct({
      ownerOperationId: BoundedText,
      ownerReceiptId: BoundedText,
      summary: BoundedText,
      timingBasis: BoundedText,
      provenanceClass: Schema.Literals(["synthetic", "physical"]),
      resolvedByClientId: AuthClientId,
    }),
  ),
  continuation: Schema.Union([
    Schema.Struct({ state: Schema.Literal("none") }),
    Schema.Struct({ state: Schema.Literal("pending"), resolutionRevision: NonNegativeInt }),
    Schema.Struct({
      state: Schema.Literal("admitted"),
      continuationId: CommandId,
      resolutionRevision: NonNegativeInt,
    }),
    Schema.Struct({
      state: Schema.Literal("submitting"),
      continuationId: CommandId,
      resolutionRevision: NonNegativeInt,
    }),
    Schema.Struct({
      state: Schema.Literal("started"),
      continuationId: CommandId,
      resolutionRevision: NonNegativeInt,
      turnId: TurnId,
    }),
    Schema.Struct({
      state: Schema.Literal("ambiguous"),
      continuationId: CommandId,
      resolutionRevision: NonNegativeInt,
    }),
    Schema.Struct({
      state: Schema.Literal("failed"),
      continuationId: CommandId,
      resolutionRevision: NonNegativeInt,
    }),
  ]),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type InteractionResource = typeof InteractionResource.Type;

export const InteractionCreateInput = Schema.Struct({
  operationId: CommandId,
  interactionId: InteractionId,
  threadId: ThreadId,
  anchorTurnId: TurnId,
  capabilityId: InteractionCapabilityId,
  requestRef: BoundedText,
  requestRevision: BoundedText,
  requestDigest: Digest,
  conditionRevision: BoundedText,
  inputProvenance: Schema.Literals(["synthetic", "physical"]),
  display: Schema.Struct({ title: BoundedText, summary: BoundedText }),
});
export type InteractionCreateInput = typeof InteractionCreateInput.Type;

export const InteractionObservation = Schema.Struct({
  engagementEpoch: NonNegativeInt,
  sourceSequenceStart: InteractionDecimalU64,
  sourceSequenceEnd: InteractionDecimalU64,
  nativeTimeStartNs: InteractionDecimalU64,
  nativeTimeEndNs: InteractionDecimalU64,
  timingBasis: BoundedText,
  provenanceClass: Schema.Literals(["synthetic", "physical"]),
});
export type InteractionObservation = typeof InteractionObservation.Type;

export const InteractionResolveInput = Schema.Struct({
  operationId: CommandId,
  threadId: ThreadId,
  requestRef: BoundedText,
  requestRevision: BoundedText,
  requestDigest: Digest,
  conditionRevision: BoundedText,
  resourceRevision: NonNegativeInt,
  ownerOperationId: BoundedText,
  ownerReceiptId: BoundedText,
  disposition: Schema.Literals(["satisfied", "failed"]),
  observation: InteractionObservation,
  evidence: Schema.NullOr(
    Schema.Struct({
      ref: BoundedText,
      digest: Digest,
      byteCount: NonNegativeInt,
      mediaType: BoundedText,
    }),
  ),
  summary: BoundedText,
});
export type InteractionResolveInput = typeof InteractionResolveInput.Type;

export const InteractionMutationResult = Schema.Struct({
  sequence: NonNegativeInt,
  resource: InteractionResource,
});
export type InteractionMutationResult = typeof InteractionMutationResult.Type;

export const InteractionGetResult = Schema.Struct({
  snapshotSequence: NonNegativeInt,
  resource: InteractionResource,
});
export type InteractionGetResult = typeof InteractionGetResult.Type;

export const InteractionCreateCommand = Schema.Struct({
  ...InteractionCreateInput.fields,
  type: Schema.Literal("interaction.create"),
  commandId: CommandId,
  actorClientId: AuthClientId,
  createdAt: IsoDateTime,
});

export const InteractionPresentationSetCommand = Schema.Struct({
  type: Schema.Literal("interaction.presentation.set"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  resourceRevision: NonNegativeInt,
  presentationRevision: NonNegativeInt,
  ownerClientId: BoundedText,
  state: Schema.Literals(["starting", "ready", "stopped", "failed"]),
  lastFrameSequence: Schema.NullOr(InteractionDecimalU64),
  droppedFrames: NonNegativeInt,
  createdAt: IsoDateTime,
});

export const InteractionEngageCommand = Schema.Struct({
  type: Schema.Literal("interaction.engage"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  resourceRevision: NonNegativeInt,
  presentationRevision: NonNegativeInt,
  ownerClientId: BoundedText,
  createdAt: IsoDateTime,
});

export const InteractionDisengageCommand = Schema.Struct({
  type: Schema.Literal("interaction.disengage"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  resourceRevision: NonNegativeInt,
  ownerClientId: BoundedText,
  createdAt: IsoDateTime,
});

export const InteractionCancelCommand = Schema.Struct({
  type: Schema.Literal("interaction.cancel"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  resourceRevision: NonNegativeInt,
  reason: Schema.Literals(["user", "thread-deleted"]),
  createdAt: IsoDateTime,
});

export const InteractionResolveCommand = Schema.Struct({
  ...InteractionResolveInput.fields,
  type: Schema.Literal("interaction.resolve"),
  commandId: CommandId,
  interactionId: InteractionId,
  actorClientId: AuthClientId,
  createdAt: IsoDateTime,
});

export const InteractionContinuationAdmitCommand = Schema.Struct({
  type: Schema.Literal("interaction.continuation.admit"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  resolutionRevision: NonNegativeInt,
  createdAt: IsoDateTime,
});

export const InteractionContinuationStateCommand = Schema.Struct({
  type: Schema.Literal("interaction.continuation.state"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  continuationId: CommandId,
  state: Schema.Literals(["submitting", "ambiguous", "failed"]),
  createdAt: IsoDateTime,
});

export const InteractionContinuationStartedCommand = Schema.Struct({
  type: Schema.Literal("interaction.continuation.started"),
  commandId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  continuationId: CommandId,
  turnId: TurnId,
  createdAt: IsoDateTime,
});

export const InteractionCommand = Schema.Union([
  InteractionCreateCommand,
  InteractionPresentationSetCommand,
  InteractionEngageCommand,
  InteractionDisengageCommand,
  InteractionCancelCommand,
  InteractionResolveCommand,
  InteractionContinuationAdmitCommand,
  InteractionContinuationStateCommand,
  InteractionContinuationStartedCommand,
]);
export type InteractionCommand = typeof InteractionCommand.Type;

export const InteractionClientActionInput = Schema.Struct({
  operationId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  resourceRevision: NonNegativeInt,
  presentationRevision: Schema.optional(NonNegativeInt),
});
export type InteractionClientActionInput = typeof InteractionClientActionInput.Type;

export const InteractionPresentationActionInput = Schema.Struct({
  operationId: CommandId,
  threadId: ThreadId,
  interactionId: InteractionId,
  resourceRevision: NonNegativeInt,
  presentationRevision: NonNegativeInt,
  state: Schema.Literals(["starting", "ready", "stopped", "failed"]),
  lastFrameSequence: Schema.NullOr(InteractionDecimalU64),
  droppedFrames: NonNegativeInt,
});
export type InteractionPresentationActionInput = typeof InteractionPresentationActionInput.Type;

export const InteractionClientActionResult = Schema.Struct({
  sequence: NonNegativeInt,
});
export type InteractionClientActionResult = typeof InteractionClientActionResult.Type;

export const InteractionEngageResult = Schema.Struct({
  sequence: NonNegativeInt,
  resourceRevision: NonNegativeInt,
  ownerClientId: BoundedText,
  engagementEpoch: NonNegativeInt,
});
export type InteractionEngageResult = typeof InteractionEngageResult.Type;

export const InteractionResourceActivityPayload = Schema.Struct({
  resource: InteractionResource,
});

export function isInteractionResourceActivityKind(kind: string): boolean {
  return kind === "interaction.resource.changed";
}
