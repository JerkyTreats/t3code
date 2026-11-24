import type { AgentFeedbackMode } from "@t3tools/contracts";

/**
 * Fork override of upstream agent feedback (`fe9c98c98f`): reports go to upstream T3 telemetry,
 * and nothing from this fork may be sent upstream. Every reader of the `agentFeedback` setting
 * that decides storage, delivery, tool listing or agent guidance uses this mode, so a stored
 * `auto` or `on-request` value behaves as off. The setting and migration stay for schema parity.
 */
export const forkAgentFeedbackMode = (_configured?: AgentFeedbackMode): AgentFeedbackMode => "off";
