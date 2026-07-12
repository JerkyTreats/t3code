import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  type EnvironmentThreadSyncStatus,
  WAITING_ENVIRONMENT_THREAD_SYNC_STATUS,
} from "@t3tools/client-runtime/state/threads";
import type { OrchestrationProposedPlanId, ThreadId } from "@t3tools/contracts";
import { projectScriptCwd } from "@t3tools/shared/projectScripts";
import { createFileRoute, retainSearchParams, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";

import ChatView from "../components/ChatView";
import { NoActiveThreadState } from "../components/NoActiveThreadState";
import { PlanConversationDocument } from "../components/PlanConversationDocument";
import { threadHasStarted } from "../components/ChatView.logic";
import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../composerDraftStore";
import {
  clearPlanPreviewRouteSearch,
  parsePlanPreviewRouteSearch,
  PLAN_PREVIEW_ROUTE_SEARCH_KEYS,
  type PlanPreviewRouteSearch,
} from "../planPreviewRouteSearch";
import { resolveThreadRouteRef } from "../threadRoutes";
import { SidebarInset } from "~/components/ui/sidebar";
import {
  useEnvironmentThreadRefs,
  useProject,
  useThreadDetail,
  useThreadShell,
} from "../state/entities";
import { useEnvironmentQuery } from "../state/query";
import { environmentShell } from "../state/shell";
import type { LatestProposedPlanState } from "../session-logic";
import type { ProposedPlan } from "../types";

interface OpenPlanPreviewInput {
  planThreadId: ThreadId;
  planId: OrchestrationProposedPlanId;
}

function toLatestProposedPlanState(proposedPlan: ProposedPlan): LatestProposedPlanState {
  return {
    id: proposedPlan.id,
    createdAt: proposedPlan.createdAt,
    updatedAt: proposedPlan.updatedAt,
    turnId: proposedPlan.turnId,
    planMarkdown: proposedPlan.planMarkdown,
    implementedAt: proposedPlan.implementedAt,
    implementationThreadId: proposedPlan.implementationThreadId,
  };
}

function ChatThreadRouteView() {
  const navigate = useNavigate();
  const threadRef = Route.useParams({
    select: (params) => resolveThreadRouteRef(params),
  });
  const search = Route.useSearch();
  const shell = useEnvironmentQuery(
    threadRef === null ? null : environmentShell.stateAtom(threadRef.environmentId),
  );
  const serverThreadShell = useThreadShell(threadRef);
  const serverThreadDetail = useThreadDetail(threadRef);
  const environmentThreadRefs = useEnvironmentThreadRefs(threadRef?.environmentId ?? null);
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const threadExists = serverThreadShell !== null || serverThreadDetail !== null;
  const environmentHasServerThreads = environmentThreadRefs.length > 0;
  const draftThreadExists = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) !== null : false,
  );
  const draftThread = useComposerDraftStore((store) =>
    threadRef ? store.getDraftThreadByRef(threadRef) : null,
  );
  const environmentHasDraftThreads = useComposerDraftStore((store) => {
    if (!threadRef) {
      return false;
    }
    return store.hasDraftThreadsInEnvironment(threadRef.environmentId);
  });
  const routeThreadExists = threadExists || draftThreadExists;
  const serverThreadStarted = threadHasStarted(serverThreadDetail);
  const environmentHasAnyThreads = environmentHasServerThreads || environmentHasDraftThreads;
  const planPreviewThreadRef = useMemo(() => {
    if (!threadRef || search.planPreview !== "1" || !search.planId) {
      return null;
    }
    return {
      environmentId: threadRef.environmentId,
      threadId: search.planThreadId ?? threadRef.threadId,
    };
  }, [search.planId, search.planPreview, search.planThreadId, threadRef]);
  const planPreviewThread = useThreadDetail(planPreviewThreadRef);
  const planPreviewProject = useProject(
    planPreviewThread
      ? scopeProjectRef(planPreviewThread.environmentId, planPreviewThread.projectId)
      : null,
  );
  const planPreviewPlan = useMemo(() => {
    if (search.planPreview !== "1" || !search.planId) {
      return null;
    }
    const plan =
      planPreviewThread?.proposedPlans.find((entry) => entry.id === search.planId) ?? null;
    return plan ? toLatestProposedPlanState(plan) : null;
  }, [planPreviewThread?.proposedPlans, search.planId, search.planPreview]);
  const planPreviewWorkspaceCwd = useMemo(
    () =>
      planPreviewProject && planPreviewThread
        ? projectScriptCwd({
            project: { cwd: planPreviewProject.workspaceRoot },
            worktreePath: planPreviewThread.worktreePath,
          })
        : undefined,
    [planPreviewProject, planPreviewThread],
  );
  const planPreviewOpen = search.planPreview === "1" && Boolean(search.planId);

  const openPlanPreview = useCallback(
    (input: OpenPlanPreviewInput) => {
      if (!threadRef) {
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId: threadRef.environmentId,
          threadId: threadRef.threadId,
        },
        search: (previous) => ({
          ...clearPlanPreviewRouteSearch(previous),
          planPreview: "1" as const,
          planThreadId: input.planThreadId,
          planId: input.planId,
        }),
      });
    },
    [navigate, threadRef],
  );

  const closePlanPreview = useCallback(() => {
    if (!threadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: {
        environmentId: threadRef.environmentId,
        threadId: threadRef.threadId,
      },
      search: (previous) => clearPlanPreviewRouteSearch(previous),
    });
  }, [navigate, threadRef]);

  useEffect(() => {
    if (!threadRef || !bootstrapComplete) {
      return;
    }

    if (!routeThreadExists && environmentHasAnyThreads) {
      void navigate({ to: "/", replace: true });
    }
  }, [bootstrapComplete, environmentHasAnyThreads, navigate, routeThreadExists, threadRef]);

  useEffect(() => {
    if (!threadRef || !serverThreadStarted || !draftThread) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread, serverThreadStarted, threadRef]);

  if (!threadRef) {
    return <NoActiveThreadState />;
  }
  if (!bootstrapComplete) {
    const syncStatus: EnvironmentThreadSyncStatus = shell.error
      ? {
          ...WAITING_ENVIRONMENT_THREAD_SYNC_STATUS,
          phase: "error",
          error: shell.error,
        }
      : WAITING_ENVIRONMENT_THREAD_SYNC_STATUS;
    return <NoActiveThreadState syncStatus={syncStatus} />;
  }
  if (!routeThreadExists) {
    return <NoActiveThreadState />;
  }

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      {planPreviewOpen ? (
        <PlanConversationDocument
          environmentId={threadRef.environmentId}
          proposedPlan={planPreviewPlan}
          workspaceCwd={planPreviewWorkspaceCwd}
          threadRef={planPreviewThreadRef ?? threadRef}
          onCollapse={closePlanPreview}
        />
      ) : (
        <ChatView
          environmentId={threadRef.environmentId}
          threadId={threadRef.threadId}
          onOpenProposedPlanPreview={openPlanPreview}
          routeKind="server"
        />
      )}
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/$environmentId/$threadId")({
  validateSearch: (search) => parsePlanPreviewRouteSearch(search),
  search: {
    middlewares: [retainSearchParams<PlanPreviewRouteSearch>(PLAN_PREVIEW_ROUTE_SEARCH_KEYS)],
  },
  component: ChatThreadRouteView,
});
