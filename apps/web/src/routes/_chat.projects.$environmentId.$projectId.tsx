import { createFileRoute } from "@tanstack/react-router";

import { ProjectManagementRouteView } from "~/components/project-management/ProjectManagementRoute";
import {
  parseProjectManagementRouteTarget,
  projectManagementRouteSearch,
} from "~/project-management/projectManagementRoute";
import { SidebarInset } from "~/components/ui/sidebar";

function ProjectManagementRouteComponent() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const target = parseProjectManagementRouteTarget({
    environmentId: params.environmentId,
    projectId: params.projectId,
    view: search.view,
  });

  return (
    <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground md:h-dvh">
      <ProjectManagementRouteView target={target} />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/projects/$environmentId/$projectId")({
  validateSearch: (search) => projectManagementRouteSearch(search.view),
  component: ProjectManagementRouteComponent,
});
