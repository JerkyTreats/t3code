import type { ScopedThreadRef } from "@t3tools/contracts";
import { PanelRightIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { documentMarkdownLinkCwd, extractDocumentMarkdownOutline } from "~/documentMarkdown";
import { cn } from "~/lib/utils";

import ChatMarkdown from "./ChatMarkdown";
import { Button } from "./ui/button";

const SANITIZED_DOCUMENT_HEADING_PREFIX = "user-content-";

function findDocumentOutlineTarget(root: HTMLElement, id: string): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ??
    root.querySelector<HTMLElement>(`#${CSS.escape(`${SANITIZED_DOCUMENT_HEADING_PREFIX}${id}`)}`)
  );
}

export function DocumentMarkdownRenderer(props: {
  filePath: string;
  markdown: string;
  workspaceCwd: string | undefined;
  threadRef?: ScopedThreadRef | undefined;
  showSourceFooter?: boolean;
  onOpenFileInEditor?: (relativePath: string) => void;
  onTaskListChange?: ((input: { markerOffset: number; checked: boolean }) => void) | undefined;
}) {
  const outline = useMemo(() => extractDocumentMarkdownOutline(props.markdown), [props.markdown]);
  const markdownLinkCwd = useMemo(
    () => documentMarkdownLinkCwd(props.workspaceCwd, props.filePath),
    [props.filePath, props.workspaceCwd],
  );
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(true);

  const navigateToOutlineItem = (id: string) => {
    const shell = shellRef.current;
    if (shell) {
      findDocumentOutlineTarget(shell, id)?.scrollIntoView({ block: "start" });
    }
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <div ref={shellRef} className="document-markdown-shell min-h-0 flex-1 overflow-auto">
      <div
        className="document-markdown-layout mx-auto grid min-h-full w-full max-w-6xl grid-cols-1 gap-4 px-3 py-3 sm:gap-5 sm:px-5 sm:py-5"
        data-outline-open={outlineOpen}
      >
        {outline.length > 1 ? (
          <details className="document-markdown-outline-menu">
            <summary>Outline</summary>
            <nav aria-label="Outline">
              {outline.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(item.level > 2 && "ps-5", item.level > 3 && "ps-7")}
                  onClick={(event) => {
                    navigateToOutlineItem(item.id);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  {item.title}
                </button>
              ))}
            </nav>
          </details>
        ) : null}
        <article className="document-markdown-article min-w-0">
          {outline.length > 1 ? (
            <button
              type="button"
              className="document-markdown-outline-toggle"
              aria-label={outlineOpen ? "Hide outline" : "Show outline"}
              aria-pressed={outlineOpen}
              title={outlineOpen ? "Hide outline" : "Show outline"}
              onClick={() => setOutlineOpen((open) => !open)}
            >
              <PanelRightIcon className="size-3.5" />
            </button>
          ) : null}
          <ChatMarkdown
            text={props.markdown}
            cwd={markdownLinkCwd}
            workspaceRoot={props.workspaceCwd}
            threadRef={props.threadRef}
            isStreaming={false}
            documentMode
            onTaskListChange={props.onTaskListChange}
            className="document-markdown-content"
          />
          {props.showSourceFooter !== false && props.onOpenFileInEditor ? (
            <div className="mt-8 border-t border-border/60 pt-4 text-xs text-muted-foreground/75">
              <button
                type="button"
                className="underline underline-offset-4 transition-colors hover:text-foreground"
                onClick={() => props.onOpenFileInEditor?.(props.filePath)}
              >
                Open source in editor
              </button>
            </div>
          ) : null}
        </article>
        {outline.length > 1 ? (
          <nav className="document-markdown-outline min-w-0" aria-label="Outline">
            <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted-foreground/55 uppercase">
              Outline
            </p>
            <div className="space-y-0.5">
              {outline.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-auto min-h-7 w-full justify-start px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground",
                    item.level > 2 && "ps-4",
                    item.level > 3 && "ps-6",
                  )}
                  onClick={() => navigateToOutlineItem(item.id)}
                >
                  <span className="truncate">{item.title}</span>
                </Button>
              ))}
            </div>
          </nav>
        ) : null}
      </div>
    </div>
  );
}
