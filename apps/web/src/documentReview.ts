const DOCUMENT_REVIEW_START_LINE_ATTRIBUTE = "data-document-review-start-line";
const DOCUMENT_REVIEW_END_LINE_ATTRIBUTE = "data-document-review-end-line";

const REVIEWABLE_DOCUMENT_TAGS = new Set([
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ol",
  "p",
  "pre",
  "table",
  "ul",
]);

interface DocumentReviewPosition {
  readonly start?: { readonly line?: number | undefined } | undefined;
  readonly end?: { readonly line?: number | undefined } | undefined;
}

interface DocumentReviewHastNode {
  readonly type?: string | undefined;
  readonly tagName?: string | undefined;
  readonly position?: DocumentReviewPosition | undefined;
  properties?: Record<string, unknown> | undefined;
  readonly children?: DocumentReviewHastNode[] | undefined;
}

export interface DocumentReviewRange {
  readonly startLine: number;
  readonly endLine: number;
}

export interface DocumentReviewAnnotation extends DocumentReviewRange {
  readonly id: string;
  readonly kind: "draft" | "comment";
  readonly rangeLabel: string;
  readonly text: string;
}

export interface DocumentReviewController {
  readonly annotations: ReadonlyArray<DocumentReviewAnnotation>;
  readonly reviewActive: boolean;
  readonly submitDisabled: boolean;
  readonly onStartComment: (range: DocumentReviewRange) => void;
  readonly onCancelComment: (commentId: string) => void;
  readonly onAddToReview: (commentId: string, text: string) => void;
  readonly onSubmitComment: (commentId: string, text: string) => Promise<boolean>;
  readonly onDeleteComment: (commentId: string) => void;
}

function positiveLine(value: unknown): number | null {
  const line = typeof value === "string" ? Number(value) : value;
  return typeof line === "number" && Number.isSafeInteger(line) && line > 0 ? line : null;
}

function markReviewableNode(node: DocumentReviewHastNode): void {
  const startLine = positiveLine(node.position?.start?.line);
  const endLine = positiveLine(node.position?.end?.line);
  if (startLine === null || endLine === null) return;
  node.properties = {
    ...node.properties,
    [DOCUMENT_REVIEW_START_LINE_ATTRIBUTE]: Math.min(startLine, endLine),
    [DOCUMENT_REVIEW_END_LINE_ATTRIBUTE]: Math.max(startLine, endLine),
  };
}

export function markDocumentReviewBlocks(tree: DocumentReviewHastNode): void {
  for (const node of tree.children ?? []) {
    if (node.type !== "element" || !node.tagName || !REVIEWABLE_DOCUMENT_TAGS.has(node.tagName)) {
      continue;
    }
    markReviewableNode(node);
  }
}

export function rehypeDocumentReviewBlocks() {
  return (tree: DocumentReviewHastNode) => markDocumentReviewBlocks(tree);
}

export function readDocumentReviewRange(node: unknown): DocumentReviewRange | null {
  if (!node || typeof node !== "object" || !("properties" in node)) return null;
  const properties = (node as DocumentReviewHastNode).properties;
  const startLine = positiveLine(properties?.[DOCUMENT_REVIEW_START_LINE_ATTRIBUTE]);
  const endLine = positiveLine(properties?.[DOCUMENT_REVIEW_END_LINE_ATTRIBUTE]);
  return startLine === null || endLine === null ? null : { startLine, endLine };
}

export function formatDocumentReviewRange(range: DocumentReviewRange): string {
  return range.startLine === range.endLine
    ? `L${range.startLine}`
    : `L${range.startLine} to L${range.endLine}`;
}
