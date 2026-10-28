import { isSshRemoteUrl } from "@t3tools/shared/sourceControl";
import { normalizeGitRemoteMutationTarget } from "@t3tools/shared/git";
import type {
  ChangeRequestHostIdentity,
  ChangeRequestLink,
  ChangeRequestProjectIdentity,
  ParsedChangeRequest,
} from "../definition.ts";

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

/**
 * The host a project's change requests are keyed and listed under when its exact origin locator
 * names one. An HTTP origin keeps a non-default port because it is part of the provider target,
 * which the broader canonical grouping key omits. Null leaves the upstream canonical-key fallback.
 */
export function exactOriginChangeRequestHost(identity: ChangeRequestHostIdentity): string | null {
  const remoteUrl =
    identity?.canonicalKey !== undefined && identity.locator?.remoteName === "origin"
      ? identity.locator.remoteUrl.trim()
      : "";
  if (remoteUrl.length === 0) return null;
  const scpHost = /^[^@\s]+@([^:/\s]+):/u.exec(remoteUrl)?.[1];
  if (scpHost) return scpHost.toLowerCase();
  try {
    const remote = new URL(remoteUrl);
    const host =
      remote.protocol === "http:" || remote.protocol === "https:" ? remote.host : remote.hostname;
    return host.trim().length > 0 ? host.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** A non-default port stays part of a parsed link's exact target on every host. */
export function withOriginPortAuthority<Link extends ChangeRequestLink>(
  link: Link,
  url: URL,
): Link {
  return link.authority !== undefined || url.port === ""
    ? link
    : { ...link, authority: url.host.toLowerCase() };
}

/**
 * Whether a cached change request URL may be painted for a reference host. Display matching
 * accepts the exact port authority and, where the provider itself has no port authority, its
 * portless host, which an SSH origin keys by. It never admits a link or authorizes a mutation.
 */
export function changeRequestMatchesDisplayHost(
  parsed: ParsedChangeRequest,
  url: string,
  host: string,
): boolean {
  const expected = host.toLowerCase();
  if ((parsed.link.authority ?? parsed.link.host) === expected) return true;
  if (parsed.link.host.toLowerCase() !== expected) return false;
  try {
    return parsed.definition.parseChangeRequestUrl(new URL(url))?.authority === undefined;
  } catch {
    return false;
  }
}
