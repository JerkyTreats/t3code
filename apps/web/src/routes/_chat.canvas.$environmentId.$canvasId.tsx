import { EnvironmentId, WorkspaceCanvasId, isWorkspaceCanvasId } from "@t3tools/contracts";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { WorkspaceCanvasView } from "../fork/WorkspaceCanvasView";

function WorkspaceCanvasRouteComponent() {
  const { environmentId, canvasId } = Route.useParams();
  return (
    <WorkspaceCanvasView
      environmentId={EnvironmentId.make(environmentId)}
      canvasId={WorkspaceCanvasId.make(canvasId)}
    />
  );
}

export const Route = createFileRoute("/_chat/canvas/$environmentId/$canvasId")({
  beforeLoad: ({ params }) => {
    if (!isWorkspaceCanvasId(params.canvasId)) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: WorkspaceCanvasRouteComponent,
});
