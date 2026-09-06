import { useAtomValue } from "@effect/atom-react";
import {
  EMPTY_ENVIRONMENT_BOARD_STATE,
  requestBoardRetry,
  requestOlderBoardPage,
} from "@t3tools/client-runtime/state/board";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthAccessWriteScope,
  type BoardGetHistoryInput,
  type BoardHistoryPage,
  type BoardPost,
  type BoardReviseInput,
  type EnvironmentId,
  type AuthSessionState,
  OrchestrationBoardRevisionError,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/unstable/reactivity";
import { AlertTriangle, History, Pencil, Radio, RotateCw } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { boardEnvironment } from "~/state/board";
import { useEnvironmentSessionState } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";

export const BOARD_GLOBAL_COPY = "Spans every project and thread in this environment.";

export function boardPostsNewestFirst(posts: ReadonlyArray<BoardPost>): ReadonlyArray<BoardPost> {
  return posts.toReversed();
}

export function boardTargetAttentionLabel(target: string): string {
  return `Attention ${target}`;
}

export function boardSourcePrimaryLabel(source: BoardPost["source"]): string {
  return source.kind === "collective-expedition" ? source.residentId : source.threadId;
}

export function boardSourceScopeLabel(source: BoardPost["source"]): string {
  return source.kind === "collective-expedition"
    ? `Expedition ${source.expeditionId}`
    : `Project ${source.projectId}`;
}

export function canEditBoardPosts(
  session: Pick<AuthSessionState, "authenticated" | "scopes"> | null,
): boolean {
  return session?.authenticated === true && session.scopes?.includes(AuthAccessWriteScope) === true;
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? "Unknown time"
    : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message.trim() : fallback;
}

function keyedTargets(targets: ReadonlyArray<string>) {
  const occurrences = new Map<string, number>();
  return targets.map((value) => {
    const occurrence = occurrences.get(value) ?? 0;
    occurrences.set(value, occurrence + 1);
    return { key: `${value}:${occurrence}`, value };
  });
}

const isBoardRevisionError = Schema.is(OrchestrationBoardRevisionError);

export type BoardRevisionSubmitOutcome =
  | { readonly kind: "success"; readonly post: BoardPost }
  | {
      readonly kind: "conflict";
      readonly message: string;
      readonly actualRevision: number | null;
      readonly currentPost: BoardPost | null;
    }
  | { readonly kind: "error"; readonly message: string };

export function classifyBoardRevisionFailure(error: unknown): BoardRevisionSubmitOutcome {
  if (isBoardRevisionError(error) && error.reason === "conflict") {
    return {
      kind: "conflict",
      message: error.message,
      actualRevision: error.actualRevision ?? null,
      currentPost: error.currentPost ?? null,
    };
  }
  return {
    kind: "error",
    message: errorMessage(error, "Could not save this Board correction."),
  };
}

interface BoardPostCardProps {
  readonly post: BoardPost;
  readonly canEdit: boolean;
  readonly onRevise: (input: BoardReviseInput) => Promise<BoardRevisionSubmitOutcome>;
  readonly onGetHistory: (input: BoardGetHistoryInput) => Promise<BoardHistoryPage>;
}

export function BoardPostCard({ post, canEdit, onRevise, onGetHistory }: BoardPostCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [draftTargets, setDraftTargets] = useState<
    ReadonlyArray<{ readonly key: number; readonly value: string }>
  >([]);
  const [expectedRevision, setExpectedRevision] = useState(post.revision);
  const [saving, setSaving] = useState(false);
  const [editOutcome, setEditOutcome] = useState<BoardRevisionSubmitOutcome | null>(null);
  const [history, setHistory] = useState<BoardHistoryPage | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [confirmedPost, setConfirmedPost] = useState<BoardPost | null>(null);
  const nextTargetKey = useRef(0);
  const editButton = useRef<HTMLButtonElement | null>(null);
  const visiblePost =
    confirmedPost !== null && confirmedPost.updatedSequence > post.updatedSequence
      ? confirmedPost
      : post;

  const targetDrafts = (targets: ReadonlyArray<string>) =>
    targets.map((value) => ({ key: nextTargetKey.current++, value }));

  const closeEditing = () => {
    setEditing(false);
    queueMicrotask(() => editButton.current?.focus());
  };

  const startEditing = () => {
    setDraftBody(visiblePost.body);
    setDraftTargets(targetDrafts(visiblePost.targets));
    setExpectedRevision(visiblePost.revision);
    setEditOutcome(null);
    setEditing(true);
  };

  const save = async () => {
    if (!draftBody.trim() || saving) return;
    setSaving(true);
    setEditOutcome(null);
    const outcome = await onRevise({
      postId: visiblePost.id,
      expectedRevision,
      body: draftBody,
      targets: draftTargets.map((target) => target.value),
    });
    setSaving(false);
    if (outcome.kind === "success") {
      setConfirmedPost(outcome.post);
      closeEditing();
      return;
    }
    // Conflict handling deliberately leaves both draft fields untouched.
    setEditOutcome(outcome);
  };

  const toggleHistory = async () => {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    if (history?.currentRevision === visiblePost.revision || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await onGetHistory({ postId: visiblePost.id, limit: 50 }));
    } catch (error) {
      setHistoryError(errorMessage(error, "Could not load revision history."));
    } finally {
      setHistoryLoading(false);
    }
  };

  const conflict = editOutcome?.kind === "conflict" ? editOutcome : null;

  return (
    <article className="border border-border/60 bg-card px-3 py-2.5 dark:bg-card/50">
      <div className="flex min-w-0 items-center gap-2 font-mono text-[.65rem] text-muted-foreground">
        <span className="truncate text-foreground/85">{visiblePost.author.providerInstanceId}</span>
        <span aria-hidden className="text-border">
          /
        </span>
        <span className="truncate">{boardSourcePrimaryLabel(visiblePost.source)}</span>
        {visiblePost.revision > 1 ? (
          <span className="border border-info/30 bg-info/5 px-1 text-[.58rem] uppercase tracking-[0.06em] text-info">
            {visiblePost.lastEditor.kind === "environment-owner"
              ? "Owner correction"
              : "Agent correction"}
            {" · v"}
            {visiblePost.revision}
          </span>
        ) : null}
        <time className="ml-auto shrink-0 tabular-nums" dateTime={visiblePost.updatedAt}>
          {formatTime(visiblePost.updatedAt)}
        </time>
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <label className="block font-mono text-[.62rem] uppercase tracking-[0.08em] text-muted-foreground">
            Correct post
            <Textarea
              aria-label="Edit Board post body"
              className="mt-1"
              size="sm"
              value={draftBody}
              onChange={(event) => setDraftBody(event.target.value)}
            />
          </label>
          <fieldset className="space-y-1">
            <legend className="font-mono text-[.62rem] uppercase tracking-[0.08em] text-muted-foreground">
              Attention targets
            </legend>
            {draftTargets.map((target, index) => (
              <div key={target.key} className="flex gap-1">
                <input
                  aria-label={`Edit Board attention target ${index + 1}`}
                  className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 font-sans text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={target.value}
                  onChange={(event) =>
                    setDraftTargets((current) =>
                      current.map((entry) =>
                        entry.key === target.key
                          ? { ...entry, value: event.currentTarget.value }
                          : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="xs"
                  variant="ghost-muted"
                  onClick={() =>
                    setDraftTargets((current) =>
                      current.filter((entry) => entry.key !== target.key),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              onClick={() =>
                setDraftTargets((current) => [
                  ...current,
                  { key: nextTargetKey.current++, value: "" },
                ])
              }
            >
              Add target
            </Button>
          </fieldset>
          {editOutcome !== null && editOutcome.kind !== "success" ? (
            <div
              role="alert"
              className="border-l-2 border-destructive/70 bg-destructive/5 px-2 py-1.5 text-xs"
            >
              <p>{editOutcome.message}</p>
              {conflict !== null ? (
                <>
                  <p className="mt-1 text-muted-foreground">Your draft is preserved.</p>
                  {conflict.currentPost !== null ? (
                    <div className="mt-1.5 border border-border/60 bg-background/70 p-2">
                      <p className="font-mono text-[.6rem] uppercase text-muted-foreground">
                        Current v{conflict.currentPost.revision}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                        {conflict.currentPost.body}
                      </p>
                      <p className="mt-1 text-muted-foreground">
                        Targets: {conflict.currentPost.targets.join(" · ") || "none"}
                      </p>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="mt-2"
                        onClick={() => {
                          setExpectedRevision(conflict.currentPost!.revision);
                          setEditOutcome(null);
                        }}
                      >
                        Keep draft against latest
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              disabled={saving}
              onClick={closeEditing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={
                saving ||
                !draftBody.trim() ||
                draftTargets.some((target) => target.value.trim().length === 0)
              }
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save correction"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/95">
          {visiblePost.body}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="font-mono text-[.6rem] uppercase tracking-[0.08em] text-muted-foreground">
          {boardSourceScopeLabel(visiblePost.source)}
        </span>
        {keyedTargets(visiblePost.targets).map((target) => (
          <span
            key={target.key}
            className={cn(
              "border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[.6rem] text-muted-foreground",
            )}
          >
            {boardTargetAttentionLabel(target.value)}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1">
          {visiblePost.revision > 1 ? (
            <Button
              type="button"
              size="micro"
              variant="ghost-muted"
              aria-expanded={historyOpen}
              onClick={() => void toggleHistory()}
            >
              <History aria-hidden className="size-3" />
              History
            </Button>
          ) : null}
          {canEdit && !editing ? (
            <Button
              ref={editButton}
              type="button"
              size="micro"
              variant="ghost-muted"
              onClick={startEditing}
            >
              <Pencil aria-hidden className="size-3" />
              Edit
            </Button>
          ) : null}
        </span>
      </div>

      {historyOpen ? (
        <section
          aria-label="Board post revision history"
          className="mt-2 border-t border-border/50 pt-2"
        >
          {historyLoading ? (
            <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
              Loading history…
            </p>
          ) : null}
          {historyError !== null ? (
            <p role="alert" className="text-xs text-destructive-foreground">
              {historyError}
            </p>
          ) : null}
          {history?.revisions.map((revision) => (
            <div key={revision.revision} className="border-l border-border/70 py-1 pl-2 text-xs">
              <div className="flex gap-2 font-mono text-[.6rem] uppercase text-muted-foreground">
                <span>v{revision.revision}</span>
                <span>{revision.editor.kind === "environment-owner" ? "Owner" : "Agent"}</span>
                <time dateTime={revision.editedAt}>{formatTime(revision.editedAt)}</time>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-foreground/85">{revision.body}</p>
              <p className="mt-0.5 text-muted-foreground">
                Targets: {revision.targets.join(" · ") || "none"}
              </p>
            </div>
          ))}
          {history?.beforeRevision !== null && history?.beforeRevision !== undefined ? (
            <p className="mt-1 text-[.65rem] text-muted-foreground">
              Older revisions are outside this bounded view.
            </p>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

export function BoardPanel({ environmentId }: { environmentId: EnvironmentId }) {
  const result = useAtomValue(boardEnvironment.stateAtom(environmentId));
  const state = Option.getOrElse(AsyncResult.value(result), () => EMPTY_ENVIRONMENT_BOARD_STATE);
  const session = useEnvironmentSessionState(environmentId);
  const canEdit = canEditBoardPosts(session.data);
  const revisePost = useAtomCommand(boardEnvironment.revisePost, {
    reportFailure: false,
    reportDefect: false,
  });
  const getPostHistory = useAtomCommand(boardEnvironment.getPostHistory, {
    reportFailure: false,
    reportDefect: false,
  });
  const waiting = state.status === "empty" || state.status === "synchronizing";
  const visiblePosts = boardPostsNewestFirst(state.posts);

  const onRevise = useCallback(
    async (input: BoardReviseInput): Promise<BoardRevisionSubmitOutcome> => {
      const outcome = await revisePost({ environmentId, input });
      return outcome._tag === "Success"
        ? { kind: "success", post: outcome.value }
        : classifyBoardRevisionFailure(squashAtomCommandFailure(outcome));
    },
    [environmentId, revisePost],
  );

  const onGetHistory = useCallback(
    async (input: BoardGetHistoryInput): Promise<BoardHistoryPage> => {
      const outcome = await getPostHistory({ environmentId, input });
      if (outcome._tag === "Success") return outcome.value;
      throw squashAtomCommandFailure(outcome);
    },
    [environmentId, getPostHistory],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="border-b border-border/60 bg-muted/15 px-3 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[.68rem] font-medium uppercase tracking-[0.12em] text-foreground">
          <Radio aria-hidden className="size-3.5 text-info" />
          Environment Board
          <span className="ml-auto text-[.6rem] font-normal tracking-[0.08em] text-muted-foreground">
            {canEdit ? "Owner editable" : "Read only"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-muted-foreground">{BOARD_GLOBAL_COPY}</p>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-2.5">
          {state.status === "failed" ? (
            <div
              role="alert"
              className="border-l-2 border-destructive/70 bg-destructive/5 px-3 py-2 text-xs text-destructive-foreground"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle aria-hidden className="mt-0.5 size-3 shrink-0" />
                <span>{state.error ?? "Could not synchronize the Board."}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost-muted"
                className="mt-1.5 h-6 px-1.5 font-mono text-[.65rem]"
                onClick={() => requestBoardRetry(environmentId)}
              >
                <RotateCw aria-hidden className="size-3" />
                Retry
              </Button>
            </div>
          ) : null}
          {waiting && state.posts.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              Loading environment posts…
            </div>
          ) : null}
          {state.status === "live" && state.posts.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              No posts have been published to this environment yet.
            </div>
          ) : null}
          {visiblePosts.map((post) => (
            <BoardPostCard
              key={post.id}
              post={post}
              canEdit={canEdit}
              onRevise={onRevise}
              onGetHistory={onGetHistory}
            />
          ))}
        </div>
      </ScrollArea>
      {state.beforeCursor !== null ? (
        <div className="border-t border-border/60 p-2">
          <Button
            type="button"
            size="sm"
            variant="ghost-muted"
            className="w-full font-mono text-[.68rem]"
            disabled={state.loadingOlder || state.refreshingHead || state.needsHeadRefresh}
            onClick={() => requestOlderBoardPage(environmentId)}
          >
            {state.loadingOlder ? "Loading older posts…" : "Load older posts"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
