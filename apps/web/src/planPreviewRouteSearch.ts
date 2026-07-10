import { ThreadId, type OrchestrationProposedPlanId } from "@t3tools/contracts";

export interface PlanPreviewRouteSearch {
  planPreview?: "1" | undefined;
  planThreadId?: ThreadId | undefined;
  planId?: OrchestrationProposedPlanId | undefined;
}

export const PLAN_PREVIEW_ROUTE_SEARCH_KEYS: Array<keyof PlanPreviewRouteSearch> = [
  "planPreview",
  "planThreadId",
  "planId",
];

function isOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parsePlanPreviewRouteSearch(
  search: Record<string, unknown>,
): PlanPreviewRouteSearch {
  const planId = normalizeSearchString(search.planId) as OrchestrationProposedPlanId | undefined;
  if (!isOpenValue(search.planPreview) || !planId) {
    return {};
  }

  const planThreadId = normalizeSearchString(search.planThreadId);
  return {
    planPreview: "1",
    planId,
    ...(planThreadId ? { planThreadId: ThreadId.make(planThreadId) } : {}),
  };
}

export function clearPlanPreviewRouteSearch<T extends Record<string, unknown>>(
  search: T,
): Omit<T, keyof PlanPreviewRouteSearch> & Record<keyof PlanPreviewRouteSearch, undefined> {
  const {
    planPreview: _planPreview,
    planThreadId: _planThreadId,
    planId: _planId,
    ...rest
  } = search;
  return {
    ...rest,
    planPreview: undefined,
    planThreadId: undefined,
    planId: undefined,
  };
}
