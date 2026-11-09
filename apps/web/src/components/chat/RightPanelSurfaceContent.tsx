import type {
  EditorId,
  EnvironmentId,
  PreviewAnnotationPayload,
  ProjectId,
  ResolvedKeybindingsConfig,
  ScopedThreadRef,
  ThreadLinkedPullRequest,
  ThreadPullRequestLink,
} from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { lazy, Suspense } from "react";
import SideChatPane from "./SideChatPane";
import type { ComposerImageAttachment, DraftId } from "../../composerDraftStore";
import type { ShortcutMatchContext } from "../../keybindings";
import type { SideChatParentPanel } from "../../lib/sideChatPane";
import { type RightPanelSurface, useRightPanelStore } from "../../rightPanelStore";
import {
  PersistentThreadTerminalPanel,
  type PersistentThreadTerminalPanelProps,
} from "../PersistentThreadTerminals";
import { pullRequestPanelContext } from "../pullRequest/pullRequestDetail.logic";
import { PullRequestDetailPanel } from "../pullRequest/PullRequestDetailPanel";
import { PullRequestDetailGhost } from "../pullRequest/PullRequestGhosts";
import { PullRequestsUnavailableState } from "../pullRequest/PullRequestsUnavailableState";
import { ThreadPullRequestsPanel } from "../pullRequest/ThreadPullRequestsPanel";
import { CanvasCardTerminal } from "../../fork/CanvasCardTerminal";
import type { PanelSurfaceCard } from "../../fork/canvasSurfaceCards";

const PreviewPanel = lazy(() =>
  import("../preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);
const DiffPanel = lazy(() => import("../DiffPanel"));
const DevicePanel = lazy(() =>
  import("../device/DevicePanel").then((module) => ({ default: module.DevicePanel })),
);
const FilePreviewPanel = lazy(() => import("../files/FilePreviewPanel"));

type RightPanelTerminalProps = Omit<
  PersistentThreadTerminalPanelProps,
  "visible" | "threadRef" | "surface"
>;

interface RightPanelPullRequestProps {
  readonly capabilityKnown: boolean;
  readonly supported: boolean;
  readonly projectId: ProjectId | null;
  readonly pullRequests: ReadonlyArray<ThreadPullRequestLink>;
  readonly linkedPullRequest: ThreadLinkedPullRequest | null;
  readonly branchPullRequest: ThreadLinkedPullRequest | null | undefined;
  readonly onBack: (() => void) | undefined;
}

interface RightPanelFileProps {
  readonly projectId?: ProjectId | undefined;
  readonly projectName: string | null;
  readonly workspaceRoot: string | undefined;
  readonly availableEditors: ReadonlyArray<EditorId>;
  readonly pendingSurfaceIds: ReadonlySet<string>;
  readonly onOpenFile: (relativePath: string) => void;
  readonly onPendingChange: (relativePath: string, pending: boolean) => void;
}

export function RightPanelSurfaceContent(props: {
  readonly surface: RightPanelSurface | null;
  readonly activeSurfaceId: string | null;
  readonly threadRef: ScopedThreadRef;
  readonly environmentId: EnvironmentId;
  readonly visible: boolean;
  readonly composerDraftTarget: ScopedThreadRef | DraftId;
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly configuredPreviewUrls: ReadonlyArray<string>;
  readonly workspaceMutationId: string | null;
  readonly getShortcutContext: () => ShortcutMatchContext;
  readonly onSendAnnotation: (
    annotation: PreviewAnnotationPayload,
    image: ComposerImageAttachment | null,
  ) => void;
  readonly onCloseSurface: (surface: RightPanelSurface) => void;
  readonly terminal: RightPanelTerminalProps;
  readonly pullRequest: RightPanelPullRequestProps;
  readonly files: RightPanelFileProps;
  readonly sideChatParentPanel: SideChatParentPanel;
  /**
   * Set when the surface runs in a canvas card rather than the panel. The panel keys its tab
   * state by surface id, which a card shares, so these call sites use the card's own actions.
   */
  readonly card?: PanelSurfaceCard | undefined;
}) {
  const { surface, threadRef, visible, onCloseSurface, card } = props;
  if (surface === null) return null;
  switch (surface.kind) {
    case "preview":
      return (
        <Suspense fallback={null}>
          <PreviewPanel
            mode="embedded"
            threadRef={threadRef}
            tabId={surface.resourceId}
            configuredUrls={props.configuredPreviewUrls}
            visible={visible}
            onSendAnnotation={props.onSendAnnotation}
          />
        </Suspense>
      );
    case "terminal":
      if (card) {
        const {
          onSplitTerminal: _split,
          onSplitTerminalVertical: _splitVertical,
          onNewTerminal: _new,
          onActiveTerminalChange: _activate,
          onCloseTerminal: _close,
          ...terminal
        } = props.terminal;
        return (
          <CanvasCardTerminal
            {...terminal}
            visible={visible}
            threadRef={threadRef}
            surface={surface}
            card={card}
          />
        );
      }
      return (
        <PersistentThreadTerminalPanel
          {...props.terminal}
          visible={visible}
          threadRef={threadRef}
          surface={surface}
        />
      );
    case "diff":
      return (
        <Suspense fallback={null}>
          <DiffPanel
            key={scopedThreadKey(threadRef)}
            mode="embedded"
            composerDraftTarget={props.composerDraftTarget}
            workspaceMutationId={props.workspaceMutationId}
            visible={visible}
          />
        </Suspense>
      );
    case "pull-request": {
      const pullRequest = props.pullRequest;
      if (!pullRequest.capabilityKnown) return <PullRequestDetailGhost />;
      if (!pullRequest.supported) {
        return (
          <PullRequestsUnavailableState
            title="Pull requests unavailable"
            error="Update this environment's T3 Code server to browse pull requests."
          />
        );
      }
      return (
        <PullRequestDetailPanel
          getShortcutContext={props.getShortcutContext}
          shortcutsEnabled={!card && visible && props.activeSurfaceId === surface.id}
          key={`${scopedThreadKey(threadRef)}:${surface.id}`}
          environmentId={props.environmentId}
          onSelectPullRequest={(reference) => {
            if (card) {
              card.show({
                kind: "pull-request",
                projectId: reference.projectId,
                repository: reference.repository,
                number: reference.number,
                ...(reference.host ? { host: reference.host } : {}),
              });
              return;
            }
            useRightPanelStore.getState().openPullRequest(threadRef, {
              projectId: reference.projectId,
              repository: reference.repository,
              number: reference.number,
              ...(reference.host ? { host: reference.host } : {}),
            });
          }}
          threadRef={threadRef}
          reference={{
            projectId: surface.projectId as ProjectId,
            ...(surface.host ? { host: surface.host } : {}),
            repository: surface.repository,
            number: surface.number,
          }}
          initialTab={surface.detailTab ?? "summary"}
          onTabChange={
            card
              ? undefined
              : (tab) => {
                  useRightPanelStore.getState().setPullRequestDetailTab(threadRef, surface.id, tab);
                }
          }
          context={pullRequestPanelContext(
            {
              projectId: pullRequest.projectId,
              pullRequests: pullRequest.pullRequests,
              linkedPullRequest: pullRequest.linkedPullRequest,
              branchPullRequest: pullRequest.branchPullRequest,
            },
            surface,
          )}
          composerDraftTarget={props.composerDraftTarget}
          onBack={card ? undefined : pullRequest.onBack}
        />
      );
    }
    case "pull-requests":
      return <ThreadPullRequestsPanel threadRef={threadRef} />;
    case "side-chat":
      // Not lazy: revealing a suspended tiptap editor tears down its view and crashes the composer.
      return (
        <SideChatPane
          key={surface.id}
          parentRef={threadRef}
          threadId={surface.threadId}
          parentPanel={props.sideChatParentPanel}
          onClose={() => (card ? card.close() : onCloseSurface(surface))}
        />
      );
    case "device":
      return (
        <Suspense fallback={null}>
          <DevicePanel
            mode="embedded"
            threadRef={threadRef}
            key={surface.id}
            surface={surface}
            visible={visible}
            card={card}
            onDismissSetup={() => {
              if (card) {
                card.close();
                return;
              }
              props.onCloseSurface(surface);
              useRightPanelStore.getState().show(threadRef);
            }}
          />
        </Suspense>
      );
    case "files":
    case "file": {
      const files = props.files;
      const attachment = surface.kind === "file" ? surface.attachment : undefined;
      if (!attachment && (files.projectName === null || !files.workspaceRoot)) return null;
      return (
        <Suspense fallback={null}>
          <FilePreviewPanel
            key={`${props.environmentId}:${
              attachment ? `attachment:${attachment.id}` : files.workspaceRoot
            }`}
            environmentId={props.environmentId}
            cwd={files.workspaceRoot ?? ""}
            projectName={files.projectName ?? ""}
            projectId={files.projectId}
            threadRef={threadRef}
            composerDraftTarget={props.composerDraftTarget}
            keybindings={props.keybindings}
            availableEditors={files.availableEditors}
            openInShortcutEnabled={!card && visible}
            relativePath={surface.kind === "file" ? surface.relativePath : null}
            {...(attachment ? { attachment } : {})}
            revealLine={surface.kind === "file" ? (surface.revealLine ?? null) : null}
            revealRequestId={surface.kind === "file" ? surface.revealRequestId : 0}
            onOpenFile={
              card ? (relativePath) => card.show({ kind: "file", relativePath }) : files.onOpenFile
            }
            onNavigateFolder={(relativePath, folderTrail, keepSource) => {
              if (card) {
                const trail = folderTrail === relativePath ? {} : { folderTrail };
                const target =
                  relativePath === ""
                    ? { kind: "files" as const, ...trail }
                    : { kind: "file" as const, relativePath, ...trail };
                if (keepSource) card.place(target);
                else card.show(target);
                return;
              }
              useRightPanelStore
                .getState()
                .navigateFolder(threadRef, surface.id, relativePath, folderTrail, keepSource);
            }}
            folderTrail={surface.folderTrail}
            onPendingChange={files.onPendingChange}
            selectedFilePending={surface.kind === "file" && files.pendingSurfaceIds.has(surface.id)}
            workspaceMutationId={props.workspaceMutationId}
          />
        </Suspense>
      );
    }
  }
}
