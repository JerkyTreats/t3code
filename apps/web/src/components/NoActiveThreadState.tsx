import type { EnvironmentThreadSyncStatus } from "@t3tools/client-runtime/state/threads";
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { SidebarInset } from "./ui/sidebar";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";

export function synchronizationCopy(syncStatus: EnvironmentThreadSyncStatus): {
  readonly header: string;
  readonly title: string;
  readonly description: string;
} {
  switch (syncStatus.phase) {
    case "waiting":
      return {
        header: "Waiting for connection",
        title: "Waiting for the environment",
        description: "Thread history will load when the environment reconnects.",
      };
    case "subscribing":
      return {
        header: "Loading thread",
        title: "Loading thread history",
        description: "Waiting for the initial thread snapshot.",
      };
    case "hydrating":
      return {
        header: "Loading thread",
        title: "Hydrating thread history",
        description: `${syncStatus.deferredPayloadCount} deferred activity ${syncStatus.deferredPayloadCount === 1 ? "payload is" : "payloads are"} loading.`,
      };
    case "error":
      return {
        header: "Thread unavailable",
        title: "Could not load thread history",
        description: syncStatus.error ?? "The thread subscription failed.",
      };
    case "live":
      return {
        header: "No active thread",
        title: "Pick a thread to continue",
        description: "Select an existing thread or create a new one to get started.",
      };
  }
}

export function NoActiveThreadState({
  syncStatus = null,
}: {
  readonly syncStatus?: EnvironmentThreadSyncStatus | null;
}) {
  const copy = syncStatus ? synchronizationCopy(syncStatus) : null;
  const isSynchronizing = syncStatus !== null && syncStatus.phase !== "live";
  const isError = syncStatus?.phase === "error";

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header
          className={cn(
            "border-b border-border px-3 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
            isElectron ? "workspace-topbar drag-region" : "workspace-topbar",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          {isElectron ? (
            <span className="text-xs text-muted-foreground/50 wco:pr-[var(--workspace-native-controls-inset)]">
              {copy?.header ?? "No active thread"}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                {copy?.header ?? "No active thread"}
              </span>
            </div>
          )}
        </header>

        <Empty className="flex-1">
          <div className="w-full max-w-lg px-8 py-12">
            <EmptyHeader className="max-w-none">
              {isSynchronizing ? (
                isError ? (
                  <CircleAlertIcon className="mx-auto size-5 text-destructive" />
                ) : (
                  <LoaderCircleIcon className="mx-auto size-5 animate-spin text-muted-foreground" />
                )
              ) : null}
              <EmptyTitle className="text-xl text-foreground">
                {copy?.title ?? "Pick a thread to continue"}
              </EmptyTitle>
              <EmptyDescription className="mt-2 text-sm text-muted-foreground/78">
                {copy?.description ??
                  "Select an existing thread or create a new one to get started."}
              </EmptyDescription>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
