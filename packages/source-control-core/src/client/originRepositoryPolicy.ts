import type { ChangeRequestLink } from "@t3tools/shared/changeRequestUrl";
import { isSshRemoteUrl } from "@t3tools/shared/sourceControl";
import { normalizeGitRemoteMutationTarget } from "@t3tools/shared/git";
import type { ChangeRequestProjectIdentity } from "./definition.ts";

/** Azure aliases retain every scope segment and never discard an HTTP port. */
function exactRepositoryTarget(value: string): string {
  return normalizeGitRemoteMutationTarget(value)
    .replace(
      /^(?:ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com)\/v3\/([^/]+)\/([^/]+)\/([^/]+)$/u,
      "dev.azure.com/$1/$2/_git/$3",
    )
    .replace(
      /^([^.]+)\.visualstudio\.com\/(?:defaultcollection\/)?([^/]+)\/_git\/([^/]+)$/u,
      "dev.azure.com/$1/$2/_git/$3",
    );
}

/** Admit a link only when it names the checkout's literal origin repository. */
export function exactOriginContainsChangeRequest(
  identity: ChangeRequestProjectIdentity,
  link: ChangeRequestLink,
): boolean {
  if (identity.locator?.remoteName !== "origin") return false;
  const linked = exactRepositoryTarget(`${link.authority ?? link.host}/${link.repository}`);
  const remote = exactRepositoryTarget(identity.locator.remoteUrl);
  if (isSshRemoteUrl(identity.locator.remoteUrl) && identity.webUrl) {
    try {
      const web = new URL(identity.webUrl);
      if ((web.protocol !== "http:" && web.protocol !== "https:") || web.username || web.password)
        return false;
      const webTarget = exactRepositoryTarget(identity.webUrl);
      const remoteParts = remote.split("/");
      const webParts = webTarget.split("/");
      const sameAzureTarget = remoteParts[0] === "dev.azure.com" && remote === webTarget;
      const sameRepository =
        remoteParts[0]?.split(":")[0] === web.hostname.toLowerCase() &&
        webParts
          .slice(1)
          .join("/")
          .endsWith(`/${remoteParts.slice(1).join("/")}`);
      const directRepository =
        remoteParts[0]?.split(":")[0] === web.hostname.toLowerCase() &&
        webParts.slice(1).join("/") === remoteParts.slice(1).join("/");
      return (sameAzureTarget || sameRepository || directRepository) && webTarget === linked;
    } catch {
      return false;
    }
  }
  return remote.length > 0 && remote === linked;
}

/** A hosted URL used by a checkout fetch retains its HTTP authority before admission. */
export function exactOriginContainsPullUrl(remoteUrl: string, pullUrl: string): boolean {
  try {
    const url = new URL(pullUrl);
    const match =
      /^(.*)(?:\/pull\/|\/-\/merge_requests\/|\/pulls\/|\/pull-requests\/|\/pullrequest\/)\d+(?:\/.*)?$/iu.exec(
        url.pathname,
      );
    if (
      !match?.[1] ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    )
      return false;
    return exactOriginContainsChangeRequest(
      { canonicalKey: "", locator: { source: "git-remote", remoteName: "origin", remoteUrl } },
      { host: url.hostname, authority: url.host, repository: match[1].slice(1), number: 1 },
    );
  } catch {
    return false;
  }
}
