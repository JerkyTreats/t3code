import type { ClientSurface } from "@t3tools/contracts";

export type SidebarView = "projects" | "threads";

export function isThreadInSidebarView(
  thread: { readonly creationSurface?: ClientSurface | undefined },
  view: SidebarView,
): boolean {
  return view === "threads"
    ? thread.creationSurface === "thread"
    : thread.creationSurface !== "thread";
}

export function sidebarViewShowsDrafts(view: SidebarView): boolean {
  return view === "projects";
}
