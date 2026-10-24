import { SourceControlProviderKind } from "@t3tools/contracts";
import {
  defineSourceControlClient,
  isChangeRequestPath,
} from "@t3tools/source-control-core/client/definition";
import { exactOriginContainsChangeRequest } from "@t3tools/source-control-core/client/originRepositoryPolicy";

const CHECKOUT_COMMAND = /^tea\s+(?:pr|pulls)\s+checkout\s+(.+)$/i;
const CHANGE_REQUEST_REFERENCE =
  /^https?:\/\/[^/\s]+\/(?:[^/\s]+\/)+[^/\s]+\/pulls\/(\d+)(?:[/?#].*)?$/i;

const KIND = SourceControlProviderKind.make("forgejo");

export const definition = defineSourceControlClient({
  kind: KIND,
  label: "Forgejo",
  pickerLabel: "Forgejo / Gitea",
  icon: "forgejo",
  changeRequest: { shortLabel: "PR", singular: "pull request" },
  repositoryPathHint: "owner/repo",
  // Forgejo and Gitea are self-hosted, so no hostname names them.
  publicHost: null,
  publishDescription: "Your signed-in server",
  publishHost: (signedInHost) => signedInHost ?? "your server",
  newRepositoryOwner: (account) => (account ? { owner: account } : null),
  defaultCloneTransport: "https",
  // The server's resolved web URL wins; otherwise an HTTP remote on the same host names the
  // origin, which may carry a port. SSH remotes say nothing about the web origin.
  changeRequestUrl: ({ host, repository, number, remoteUrl, webUrl }) => {
    if (webUrl) return `${webUrl.replace(/\/+$/, "")}/pulls/${number}`;
    try {
      const remote = new URL(remoteUrl ?? "");
      if (
        (remote.protocol === "http:" || remote.protocol === "https:") &&
        (remote.hostname.toLowerCase() === host.toLowerCase() ||
          remote.host.toLowerCase() === host.toLowerCase())
      ) {
        return `${remote.origin}/${repository}/pulls/${number}`;
      }
    } catch {}
    return `https://${host}/${repository}/pulls/${number}`;
  },
  changeRequestActions: new Set(["merge", "close", "reopen", "update-branch"] as const),
  // Neither `fj` nor `tea` checks out by number, so fetch the pull ref from the repository itself.
  checkoutCommand: ({ number, repositoryUrl }) =>
    repositoryUrl
      ? `git fetch '${repositoryUrl.replaceAll("'", "'\\''")}' refs/pull/${number}/head && git checkout -B pulls/${number} FETCH_HEAD`
      : null,
  authorProfileUrl: () => null,
  // Forgejo refuses a change request review without a summary, even with inline comments.
  referenceAutolinkRepositoryUrl: () => null,
  reviewSummaryRequired: (verdict) => verdict === "request-changes",
  checkoutCommandArgument: (input) => CHECKOUT_COMMAND.exec(input)?.[1]?.trim() ?? null,
  isChangeRequestReference: (url) => CHANGE_REQUEST_REFERENCE.test(url),
  changeRequestUrlHost: (url) => url.host,
  checkoutChangeRequestHost: () => null,
  // Fork F06: membership admission requires the exact origin locator.
  isChangeRequestInRepository: exactOriginContainsChangeRequest,
  canReadChangeRequestOnHost: exactOriginContainsChangeRequest,
  isChangeRequestUrl: (url) => isChangeRequestPath(url, "/pulls/"),
});
