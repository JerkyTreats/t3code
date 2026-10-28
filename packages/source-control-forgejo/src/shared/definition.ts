import { SourceControlProviderKind } from "@t3tools/contracts";
import {
  changeRequestUrlBelow,
  type ChangeRequestHostIdentity,
  defineSourceControl,
  parseChangeRequestPath,
  projectChangeRequestHost,
  remoteWebOrigin,
} from "@t3tools/source-control-core/shared/definition";
import { exactOriginContainsChangeRequest } from "@t3tools/source-control-core/shared/fork/originRepositoryPolicy";
import { icon } from "./icon.ts";

const CHECKOUT_COMMAND = /^tea\s+(?:pr|pulls)\s+checkout\s+(.+)$/i;
const CHANGE_REQUEST_REFERENCE =
  /^https?:\/\/[^/\s]+\/(?:[^/\s]+\/)+[^/\s]+\/pulls\/(\d+)(?:[/?#].*)?$/i;

// Forgejo and Gitea run on any hostname, possibly mounted below a path.
const CHANGE_REQUEST_PATH = /^\/([^/]+(?:\/[^/]+)+)\/pulls\/(\d+)(?:\/|$)/u;

const KIND = SourceControlProviderKind.make("forgejo");

const changeRequestHeadRef = (number: number) => `refs/pull/${number}/head`;

/** A server's identity includes its port, which only an HTTP remote names. */
function changeRequestHost(identity: ChangeRequestHostIdentity): string {
  try {
    const remote = new URL(identity?.locator?.remoteUrl ?? "");
    if (remote.protocol === "http:" || remote.protocol === "https:") {
      return remote.host.toLowerCase();
    }
  } catch {
    // SSH remotes do not name the web server.
  }
  return projectChangeRequestHost(identity, KIND);
}

export const definition = defineSourceControl({
  kind: KIND,
  label: "Forgejo",
  pickerLabel: "Forgejo / Gitea",
  icon,
  searchKeywords: ["gitea", "tea", "codeberg"],
  changeRequest: {
    shortLabel: "PR",
    shortLabelWithArticle: "a PR",
    singular: "pull request",
    plural: "pull requests",
  },
  repositoryPathHint: "owner/repo",
  // Codeberg is the public Forgejo; any other server is self-hosted.
  publicHost: "codeberg.org",
  publishDescription: "Your signed-in server",
  publishHost: (signedInHost) => signedInHost ?? "your server",
  newRepositoryOwner: (account) => (account ? { owner: account } : null),
  defaultCloneTransport: "https",
  // The server's resolved web URL wins; otherwise an HTTP remote on the same host names the
  // origin, which may carry a port. SSH remotes say nothing about the web origin.
  changeRequestUrl: ({ host, repository, number, remoteUrl, webUrl }) =>
    webUrl
      ? changeRequestUrlBelow(webUrl, `pulls/${number}`)
      : `${remoteWebOrigin(host, remoteUrl)}/${repository}/pulls/${number}`,
  // A server's identity includes its port, so the link carries it.
  parseChangeRequestUrl: (url) => {
    const link = parseChangeRequestPath(url, CHANGE_REQUEST_PATH);
    return link === null ? null : { ...link, authority: url.host.toLowerCase() };
  },
  changeRequestUrlFromReferenceAutolink: () => null,
  changeRequestActions: new Set(["merge", "close", "reopen", "update-branch"] as const),
  // Neither `fj` nor `tea` checks out by number.
  checkoutCommand: ({ number, repositoryUrl }) =>
    repositoryUrl
      ? `git fetch '${repositoryUrl.replaceAll("'", "'\\''")}' ${changeRequestHeadRef(number)} && git checkout -B pulls/${number} FETCH_HEAD`
      : null,
  changeRequestCloseCommand: /\b(?:tea\s+(?:pr|pulls)|fj\s+pr)\s+(?:merge|close)\b/u,
  authorProfileUrl: () => null,
  // Forgejo refuses a change request review without a summary, even with inline comments.
  reviewSummaryRequired: (verdict) => verdict === "request-changes",
  checkoutCommandArgument: (input) => CHECKOUT_COMMAND.exec(input)?.[1]?.trim() ?? null,
  isChangeRequestReference: (url) => CHANGE_REQUEST_REFERENCE.test(url),
  checkoutChangeRequestHost: () => null,
  changeRequestHeadRef,
  recognizeRemote: ({ remoteUrl, host, hostname }) =>
    hostname === "codeberg.org" ||
    hostname.split(".").includes("forgejo") ||
    hostname.split(".").includes("gitea")
      ? {
          kind: KIND,
          name: "Forgejo",
          baseUrl: /^https?:/iu.test(remoteUrl) ? new URL(remoteUrl).origin : `https://${host}`,
        }
      : null,
  changeRequestHost,
  // Fork F06: membership admission requires the exact origin locator.
  isChangeRequestInRepository: exactOriginContainsChangeRequest,
  canReadChangeRequestOnHost: exactOriginContainsChangeRequest,
});
