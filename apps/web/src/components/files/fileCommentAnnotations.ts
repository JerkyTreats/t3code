import type { LineAnnotation, SelectedLineRange } from "@pierre/diffs";

export interface FileCommentAnnotationEntry {
  id: string;
  kind: "draft" | "comment";
  startLine: number;
  endLine: number;
  text: string;
}

export interface FileCommentAnnotationGroup {
  entries: FileCommentAnnotationEntry[];
}

export type FileCommentLineAnnotation = LineAnnotation<FileCommentAnnotationGroup>;

let fileCommentSequence = 0;

export function nextFileCommentId(): string {
  fileCommentSequence += 1;
  return `file-comment-${Date.now()}-${fileCommentSequence}`;
}

export function normalizeFileCommentRange(range: SelectedLineRange): {
  startLine: number;
  endLine: number;
} {
  return {
    startLine: Math.min(range.start, range.end),
    endLine: Math.max(range.start, range.end),
  };
}

export function formatFileCommentRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine} to L${endLine}`;
}

export function remapFileCommentAnnotations(
  annotations: ReadonlyArray<FileCommentLineAnnotation>,
): FileCommentLineAnnotation[] {
  return annotations.map((annotation) => ({
    ...annotation,
    metadata: {
      entries: annotation.metadata.entries.map((entry) => {
        const lineCount = entry.endLine - entry.startLine;
        return {
          ...entry,
          endLine: annotation.lineNumber,
          startLine: Math.max(1, annotation.lineNumber - lineCount),
        };
      }),
    },
  }));
}

export function restoreFileCommentAnnotations(
  comments: ReadonlyArray<{
    readonly id: string;
    readonly startIndex: number;
    readonly endIndex: number;
    readonly text: string;
  }>,
): FileCommentLineAnnotation[] {
  const annotationsByEndLine = new Map<number, FileCommentLineAnnotation>();
  for (const comment of comments) {
    const startLine = Math.max(1, Math.min(comment.startIndex, comment.endIndex) + 1);
    const endLine = Math.max(startLine, Math.max(comment.startIndex, comment.endIndex) + 1);
    const entry: FileCommentAnnotationEntry = {
      id: comment.id,
      kind: "comment",
      startLine,
      endLine,
      text: comment.text,
    };
    const existing = annotationsByEndLine.get(endLine);
    if (existing) {
      existing.metadata.entries.push(entry);
    } else {
      annotationsByEndLine.set(endLine, {
        lineNumber: endLine,
        metadata: { entries: [entry] },
      });
    }
  }
  return [...annotationsByEndLine.values()];
}
