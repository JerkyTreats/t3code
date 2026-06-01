import ChatMarkdown from "./ChatMarkdown";

export function DocumentMarkdownRenderer(props: {
  filePath: string;
  markdown: string;
  workspaceCwd: string | undefined;
  showSourceFooter?: boolean;
  onOpenFileInEditor?: (relativePath: string) => void;
}) {
  return (
    <div className="h-full min-h-0 overflow-auto">
      <div className="mx-auto min-h-full max-w-[860px] px-4 py-4">
        <article className="document-markdown rounded-lg border border-border/60 bg-card/55 p-5 shadow-[0_24px_80px_-48px_color-mix(in_srgb,var(--foreground)_42%,transparent)] sm:p-7">
          <ChatMarkdown text={props.markdown} cwd={props.workspaceCwd} isStreaming={false} />
          {props.showSourceFooter !== false && props.onOpenFileInEditor ? (
            <div className="mt-8 border-t border-border/60 pt-4 text-xs text-muted-foreground/75">
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => props.onOpenFileInEditor?.(props.filePath)}
              >
                Open source in editor
              </button>
            </div>
          ) : null}
        </article>
      </div>
    </div>
  );
}
