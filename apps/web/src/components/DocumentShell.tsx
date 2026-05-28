import { type ReactNode } from "react";

export function DocumentShell(props: {
  header: ReactNode;
  children: ReactNode;
  panelTab?: ReactNode;
}) {
  return (
    <div className="relative flex h-full min-w-0 flex-col bg-background text-foreground">
      {props.panelTab}
      <div className="border-b border-border">
        <div
          className={
            props.panelTab
              ? "flex h-12 items-center justify-between gap-2 py-0 pl-14 pr-4"
              : "flex h-12 items-center justify-between gap-2 px-4"
          }
        >
          {props.header}
        </div>
      </div>
      <div className="document-preview-shell relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {props.children}
      </div>
    </div>
  );
}
