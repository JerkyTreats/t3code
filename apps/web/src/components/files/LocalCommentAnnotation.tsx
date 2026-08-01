import { ArrowUp, LoaderCircle, MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

interface LocalCommentAnnotationProps {
  kind: "draft" | "comment";
  reviewActive: boolean;
  rangeLabel: string;
  text: string;
  onCancel: () => void;
  onAddToReview: (text: string) => void;
  onSubmitComment: (text: string) => Promise<boolean>;
  onDelete: () => void;
  submitDisabled?: boolean;
}

export function LocalCommentAnnotation({
  kind,
  reviewActive,
  rangeLabel,
  text: savedText,
  onCancel,
  onAddToReview,
  onSubmitComment,
  onDelete,
  submitDisabled = false,
}: LocalCommentAnnotationProps) {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedText = text.trim();
  const submitComment = async () => {
    if (!trimmedText || submitDisabled || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmitComment(trimmedText);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (kind === "comment") {
    return (
      <div
        data-file-comment-annotation
        className="mx-3 my-2 rounded-xl border border-border/70 bg-background p-3 shadow-sm"
        contentEditable={false}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium">Local comment</span>
          <span className="ml-auto text-[11px] text-muted-foreground">{rangeLabel}</span>
          <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {savedText}
        </p>
      </div>
    );
  }

  return (
    <div
      data-file-comment-annotation
      className="mx-3 my-2 rounded-xl border border-border/70 bg-background p-3 shadow-lg"
      contentEditable={false}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <MessageCircle className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Local comment</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">Comment on lines {rangeLabel}</div>
      <Textarea
        autoFocus
        className="mt-3"
        size="sm"
        value={text}
        placeholder="Request change"
        aria-label={`Comment on lines ${rangeLabel}`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && trimmedText) {
            event.preventDefault();
            if (reviewActive) {
              onAddToReview(trimmedText);
            } else {
              void submitComment();
            }
          }
        }}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={isSubmitting} onClick={onCancel}>
          Cancel
        </Button>
        {reviewActive ? (
          <Button
            size="sm"
            disabled={!trimmedText || isSubmitting}
            onClick={() => onAddToReview(trimmedText)}
          >
            Add to review
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!trimmedText || isSubmitting}
              onClick={() => onAddToReview(trimmedText)}
            >
              Start review
            </Button>
            <Button
              size="icon-sm"
              aria-label="Send comment now"
              title="Send comment now"
              disabled={!trimmedText || submitDisabled || isSubmitting}
              onClick={() => void submitComment()}
            >
              {isSubmitting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <ArrowUp className="size-4" aria-hidden />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
