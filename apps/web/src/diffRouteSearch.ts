import { ThreadId, TurnId, type OrchestrationProposedPlanId } from "@t3tools/contracts";

export interface DiffRouteSearch {
  diff?: "1" | undefined;
  git?: "1" | undefined;
  files?: "1" | undefined;
  diffTurnId?: TurnId | undefined;
  diffFilePath?: string | undefined;
  docPath?: string | undefined;
  docExpanded?: "1" | undefined;
  planPreview?: "1" | undefined;
  planThreadId?: ThreadId | undefined;
  planId?: OrchestrationProposedPlanId | undefined;
}

function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<
  T,
  | "diff"
  | "git"
  | "files"
  | "diffTurnId"
  | "diffFilePath"
  | "docPath"
  | "docExpanded"
  | "planPreview"
  | "planThreadId"
  | "planId"
> {
  const {
    diff: _diff,
    git: _git,
    files: _files,
    diffTurnId: _diffTurnId,
    diffFilePath: _diffFilePath,
    docPath: _docPath,
    docExpanded: _docExpanded,
    planPreview: _planPreview,
    planThreadId: _planThreadId,
    planId: _planId,
    ...rest
  } = params;
  return rest as Omit<
    T,
    | "diff"
    | "git"
    | "files"
    | "diffTurnId"
    | "diffFilePath"
    | "docPath"
    | "docExpanded"
    | "planPreview"
    | "planThreadId"
    | "planId"
  >;
}

export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const planThreadIdRaw = normalizeSearchString(search.planThreadId);
  const planIdRaw = normalizeSearchString(search.planId);
  if (isDiffOpenValue(search.planPreview) && planThreadIdRaw && planIdRaw) {
    return {
      planPreview: "1",
      planThreadId: ThreadId.make(planThreadIdRaw),
      planId: planIdRaw as OrchestrationProposedPlanId,
    };
  }

  const git = isDiffOpenValue(search.git) ? "1" : undefined;
  if (git) {
    return { git };
  }

  const files = isDiffOpenValue(search.files) ? "1" : undefined;
  if (files) {
    const docPath = normalizeSearchString(search.docPath);
    const docExpanded = docPath && isDiffOpenValue(search.docExpanded) ? "1" : undefined;
    return {
      files,
      ...(docPath ? { docPath } : {}),
      ...(docExpanded ? { docExpanded } : {}),
    };
  }

  const diff = isDiffOpenValue(search.diff) ? "1" : undefined;
  const diffTurnIdRaw = diff ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.make(diffTurnIdRaw) : undefined;
  const diffFilePath = diff && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;

  return {
    ...(diff ? { diff } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
  };
}
