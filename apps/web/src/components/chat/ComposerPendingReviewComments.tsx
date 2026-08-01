import { MessageCircle, X } from "lucide-react";

import {
  COMPOSER_INLINE_CHIP_CLASS_NAME,
  COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
  COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { ReviewCommentContext } from "~/reviewCommentContext";
import { cn } from "~/lib/utils";

interface ComposerPendingReviewCommentsProps {
  comments: ReadonlyArray<ReviewCommentContext>;
  active: boolean;
  onRemove: (commentId: string) => void;
  onCancelReview: () => void;
  onSubmitReview: () => void;
  submitDisabled: boolean;
  className?: string;
}

export function ComposerPendingReviewComments({
  comments,
  active,
  onRemove,
  onCancelReview,
  onSubmitReview,
  submitDisabled,
  className,
}: ComposerPendingReviewCommentsProps) {
  if (!active && comments.length === 0) return null;

  return (
    <div
      className={cn("rounded-xl border border-border/70 bg-background/72 p-3", className)}
      data-composer-review-session="true"
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="size-4 text-muted-foreground" />
        <span className="text-xs font-semibold">Review in progress</span>
        <span className="text-xs text-muted-foreground" data-review-submission-status>
          {comments.length} {comments.length === 1 ? "comment" : "comments"} not submitted
        </span>
      </div>
      {comments.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {comments.map((comment) => {
            const label = `${comment.filePath} ${comment.rangeLabel}`;
            return (
              <Tooltip key={comment.id}>
                <TooltipTrigger
                  render={
                    <span className={cn(COMPOSER_INLINE_CHIP_CLASS_NAME, "pr-1")}>
                      <MessageCircle
                        className={cn(COMPOSER_INLINE_CHIP_ICON_CLASS_NAME, "size-3.5")}
                      />
                      <span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
                      <button
                        type="button"
                        aria-label={`Remove comment on ${label}`}
                        className={COMPOSER_INLINE_CHIP_DISMISS_BUTTON_CLASS_NAME}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onRemove(comment.id);
                        }}
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  }
                />
                <TooltipPopup side="top" className="max-w-96 whitespace-pre-wrap leading-tight">
                  {comment.text}
                </TooltipPopup>
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Add a local comment from a code or rendered Markdown file, then submit the review here.
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelReview}>
          Cancel review
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={submitDisabled || comments.length === 0}
          onClick={onSubmitReview}
        >
          Submit review{comments.length > 0 ? ` (${comments.length})` : ""}
        </Button>
      </div>
    </div>
  );
}
