import { GitPullRequestIcon } from "lucide-react";
import type { ElementType } from "react";
import type {
  SourceControlProviderInfo,
  SourceControlProviderKind,
  SourceControlProviderDiscoveryItem,
} from "@t3tools/contracts";
export {
  DEFAULT_CHANGE_REQUEST_TERMINOLOGY,
  formatChangeRequestAction,
  formatCreateChangeRequestPhrase,
  getChangeRequestTerminology,
  resolveChangeRequestPresentation,
  type ChangeRequestPresentation,
  type ChangeRequestTerminology,
} from "@t3tools/shared/sourceControl";
import {
  resolveChangeRequestPresentation,
  resolveChangeRequestPresentationForKind,
} from "@t3tools/shared/sourceControl";

import { GitHubIcon } from "./components/Icons";

export interface SourceControlPresentation {
  readonly providerName: string;
  readonly Icon: ElementType<{ className?: string }>;
}

function iconForKind(kind: SourceControlProviderKind): ElementType<{ className?: string }> {
  switch (kind) {
    case "github":
      return GitHubIcon;
    case "gitlab":
      return GitPullRequestIcon;
    case "azure-devops":
      return GitPullRequestIcon;
    case "bitbucket":
      return GitPullRequestIcon;
    case "unknown":
      return GitPullRequestIcon;
  }
}

export function getSourceControlPresentation(
  provider: SourceControlProviderInfo | null | undefined,
): SourceControlPresentation {
  const presentation = resolveChangeRequestPresentation(provider);
  return {
    providerName: provider?.name || presentation.providerName,
    Icon: iconForKind(provider?.kind ?? "github"),
  };
}

export function getSourceControlPresentationForKind(
  kind: SourceControlProviderKind,
): SourceControlPresentation {
  const presentation = resolveChangeRequestPresentationForKind(kind);
  return {
    providerName: presentation.providerName,
    Icon: iconForKind(kind),
  };
}

export function getSourceControlDiscoveryItemPresentation(
  item: Pick<SourceControlProviderDiscoveryItem, "kind" | "label">,
): SourceControlPresentation {
  const presentation = getSourceControlPresentationForKind(item.kind);
  return {
    providerName: item.label || presentation.providerName,
    Icon: presentation.Icon,
  };
}
