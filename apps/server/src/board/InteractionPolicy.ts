import type { ProviderInteractionMode } from "@t3tools/contracts";

export type BoardCollectiveInstructionProfile = "writable" | "read-only";

export interface BoardInteractionPolicy {
  readonly boardWriteEnabled: boolean;
  readonly collectiveInstructionProfile: BoardCollectiveInstructionProfile;
}

const DEFAULT_BOARD_INTERACTION_POLICY = {
  boardWriteEnabled: true,
  collectiveInstructionProfile: "writable",
} as const satisfies BoardInteractionPolicy;

const PLAN_BOARD_INTERACTION_POLICY = {
  boardWriteEnabled: false,
  collectiveInstructionProfile: "read-only",
} as const satisfies BoardInteractionPolicy;

/**
 * Keep live Board authority and the model-facing Collective claim on the same
 * interaction-mode profile so instructions cannot advertise writes that the
 * credential rejects, or permit writes while the instructions claim read-only.
 */
export function resolveBoardInteractionPolicy(
  interactionMode: ProviderInteractionMode | undefined,
): BoardInteractionPolicy {
  return interactionMode === "plan"
    ? PLAN_BOARD_INTERACTION_POLICY
    : DEFAULT_BOARD_INTERACTION_POLICY;
}
