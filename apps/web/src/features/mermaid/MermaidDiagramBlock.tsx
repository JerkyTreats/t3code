import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { RenderResult } from "mermaid";

import {
  getCachedMermaidRender,
  getOrCreateMermaidRender,
  mermaidRenderCacheKey,
} from "./mermaidRenderCache";
import { MERMAID_CONFIG_REVISION, renderMermaidDiagram } from "./mermaidRenderer";
import { usePreserveScrollOnMermaidResize } from "./mermaidScrollStability";
import { useMermaidThemeSnapshot } from "./mermaidTheme";

const MERMAID_FENCE_LANGUAGES = new Set(["mermaid", "mmd"]);

type MermaidRenderState =
  | { status: "loading"; cacheKey: string | null }
  | {
      status: "rendered";
      cacheKey: string;
      result: RenderResult;
    }
  | { status: "error"; cacheKey: string; message: string };

export function isMermaidFenceLanguage(language: string): boolean {
  return MERMAID_FENCE_LANGUAGES.has(language.toLowerCase());
}

function formatRenderErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "The diagram could not be rendered.";
}

export function MermaidDiagramBlock(props: {
  readonly surfaceId: string;
  readonly sourceStart: number | "unknown";
  readonly sourceEnd: number | "unknown";
  readonly code: string;
  readonly fallback: ReactNode;
  readonly theme: "light" | "dark";
  readonly isStreaming: boolean;
}) {
  const reactId = useId();
  const renderSequenceRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLElement>(null);
  const themeSnapshot = useMermaidThemeSnapshot(props.theme);
  const renderIdPrefix = useMemo(
    () => `chat-mermaid-${reactId.replaceAll(/[^a-zA-Z0-9_-]/g, "")}`,
    [reactId],
  );
  const cacheKey = useMemo(
    () =>
      mermaidRenderCacheKey({
        surfaceId: props.surfaceId,
        sourceStart: props.sourceStart,
        sourceEnd: props.sourceEnd,
        code: props.code,
        theme: props.theme,
        paletteKey: themeSnapshot.key,
        configRevision: MERMAID_CONFIG_REVISION,
      }),
    [
      props.code,
      props.sourceEnd,
      props.sourceStart,
      props.surfaceId,
      props.theme,
      themeSnapshot.key,
    ],
  );
  const [renderState, setRenderState] = useState<MermaidRenderState>({
    status: "loading",
    cacheKey: null,
  });
  const [retryGeneration, setRetryGeneration] = useState(0);
  const cachedRender = props.isStreaming ? null : getCachedMermaidRender(cacheKey);
  const currentResult =
    cachedRender ??
    (renderState.status === "rendered" && renderState.cacheKey === cacheKey
      ? renderState.result
      : null);

  usePreserveScrollOnMermaidResize(figureRef);

  useEffect(() => {
    if (props.isStreaming || getCachedMermaidRender(cacheKey)) return;

    let cancelled = false;
    const renderId = `${renderIdPrefix}-${renderSequenceRef.current}-${retryGeneration}`;
    renderSequenceRef.current += 1;

    void getOrCreateMermaidRender(cacheKey, () =>
      renderMermaidDiagram({
        id: renderId,
        code: props.code,
        theme: props.theme,
        palette: themeSnapshot.palette,
      }),
    ).then(
      (result) => {
        if (cancelled) return;
        setRenderState({ status: "rendered", cacheKey, result });
      },
      (error) => {
        if (cancelled) return;
        setRenderState({ status: "error", cacheKey, message: formatRenderErrorMessage(error) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [
    cacheKey,
    props.code,
    props.isStreaming,
    props.theme,
    renderIdPrefix,
    retryGeneration,
    themeSnapshot.palette,
  ]);

  useEffect(() => {
    if (!currentResult) return;
    const container = containerRef.current;
    if (!container) return;
    currentResult.bindFunctions?.(container);
  }, [currentResult]);

  const hasCurrentError =
    !props.isStreaming && renderState.status === "error" && renderState.cacheKey === cacheKey;

  if (hasCurrentError) {
    return (
      <div className="chat-markdown-mermaid-error">
        <div className="chat-markdown-mermaid-error-copy">
          <strong>Diagram render failed</strong>
          <span>{renderState.message}</span>
          <button
            type="button"
            aria-label="Retry Mermaid diagram"
            className="w-fit text-xs font-medium text-primary underline underline-offset-2"
            onClick={() => {
              setRenderState({ status: "loading", cacheKey });
              setRetryGeneration((generation) => generation + 1);
            }}
          >
            Retry
          </button>
        </div>
        {props.fallback}
      </div>
    );
  }

  return (
    <figure ref={figureRef} className="chat-markdown-mermaid" aria-label="Rendered Mermaid diagram">
      <div
        ref={containerRef}
        className="chat-markdown-mermaid-viewport"
        dangerouslySetInnerHTML={currentResult ? { __html: currentResult.svg } : undefined}
      />
      {!currentResult ? (
        <div className="chat-markdown-mermaid-loading" role="status">
          {props.isStreaming ? "Waiting for diagram..." : "Rendering diagram..."}
        </div>
      ) : null}
    </figure>
  );
}
