# F06 Exact Origin Repository Identity

Status: active

Product repository identity, status, ref lists, hosted targets and publication resolve exact `origin`. Missing origin fails closed. Generic Git diagnostics and local reconciliation remain available without making other remotes product authority.

## Protected Decisions

- `F06.identity` selects literal origin fetch identity and origin refs. `originOnlySourceControlPolicy.ts` owns remote and tracking selection. `sourceControlContextPolicy.ts` owns provider context and origin-derived pull request repository selectors. `RepositoryIdentityResolver.ts`, `GitManager.ts`, `GitVcsDriverCore.ts` and the provider registry adapt current upstream caches and Git parsing to these decisions.
- `F06.git-mutation` names origin explicitly for product pull and push. `originGitPolicy.ts` owns fetch and push URL agreement, port-sensitive identity, requested remote refusal and push redirect refusal. The current driver retains branch alias handling, base preservation, caches, submodules and local Git mechanics after authorization. Non-origin local tracking cannot select a product pull request association.
- `F06.hosted-mutation` validates live origin against projected identity before permission or mutation calls. `OriginRepositoryMutationAuthority.ts` owns that revalidation, including all effective fetch and push URLs and current branch or global push redirects. `sourceControlContextPolicy.ts` owns context binding and change request creation authorization. `PullRequestService.ts` adapts current provider, permission, cache and invalidation flows without changing upstream action results or optional fields.
- `F06.provider-target` binds hosted calls to origin host, port and repository. `originHostedProviderPolicy.ts`, `AzureDevOpsRepositoryTarget.ts` and `GitLabRepositoryTarget.ts` own provider targets and membership validation. `originReviewThreadPolicy.ts` owns the GitHub thread relationship query and refusal before mutation. Provider and CLI modules perform explicit transport calls and retain current parsing, draft state, timestamps and optional auto-merge fields.
- `F06.publication` validates the selected provider endpoint, existing remote conflicts, effective origin URLs, redirect settings and both returned clone targets before add or push. `originRepositoryPublicationPolicy.ts` owns these decisions. `SourceControlRepositoryService.ts` retains destination handling and the create, lookup, add and push sequence. Empty repositories retain the upstream `remote_added` result.

## Owner Boundaries

Server fork owners reside under `apps/server/src/fork/`. The provider target parsers reside under `apps/server/src/sourceControl/`.

`packages/shared/src/git.ts` keeps canonical grouping separate from mutation normalization. Canonical grouping intentionally omits ports. Mutation comparison preserves non-default ports and accepts equivalent common Git URL transports.

`packages/contracts/src/pullRequest.ts` retains the shared `pullRequestHostOf` compatibility helper used by server and clients. An exact origin locator supplies the host and explicit port. Legacy or malformed locator data falls back to the canonical host, then provider kind. That display grouping fallback does not authorize a provider mutation or replace the required exact origin selector.

`packages/contracts/src/sourceControl.ts` requires an explicit provider endpoint for lookup and publication and permits it for provider-based clone. Project creation clients and the publication wizard supply the selected authenticated endpoint. Shared project operations own lookup request preparation. The web and mobile components remain adapters around their current flows.

## Non Ownership Boundaries

F06 does not own provider authentication, response parsing, permission semantics, UI presentation, ordinary worktree mechanics, submodule algorithms or the upstream cache lifecycle. Cross-repository head metadata returned by the bound origin provider remains supported. Arbitrary local non-origin refs and tracking cannot choose a product head association. Generic local reconciliation may inspect or fetch other remotes without publishing their identity as product state.

Passing origin validation does not itself authorize publication or a hosted mutation.

## Evidence

- `originOnlySourceControlPolicy.test.ts` and `sourceControlContextPolicy.test.ts` execute literal selection, absent-origin refusal and replacement registry binding with zero provider calls after failed authorization.
- `originGitPolicy.test.ts` executes URL agreement, port separation and redirect refusal through a replacement command host. `GitVcsDriverCore.test.ts` exercises the current real driver, explicit origin mutations, branch base and alias mechanics, origin status and ref filtering.
- `OriginRepositoryMutationAuthority.test.ts` exercises stale identity, missing origin, all push targets and both redirect sources. `PullRequestService.test.ts` verifies authorization before permission or provider calls, including custom-port hosts.
- `originHostedProviderPolicy.test.ts`, provider CLI tests and target parser tests assert explicit GitHub, GitLab, Azure and Bitbucket endpoints. GitHub public-host selectors also include the host, preventing environment defaults from changing authority. The focused `originChangeRequestSelector` owner validates PR and MR URL host, port and repository against origin, then reduces matching URLs to numeric selectors before view or checkout because CLI URL selectors override `--repo`. Foreign and malformed URLs fail before any CLI call. Ordinary branch and numeric selectors retain their existing interpretation, including GitHub `owner:branch` selectors within the selected origin repository.
- `originReviewThreadPolicy.test.ts` bypasses the historical CLI host and proves mutation follows membership validation. `GitHubPullRequestCli.test.ts` proves the actual relationship query and refusal for thread identifiers outside the origin pull request.
- `originRepositoryPublicationPolicy.test.ts` runs a replacement publication host and asserts zero external calls after failed requested remote, matching remote, effective fetch, push URL or redirect preflight. `SourceControlRepositoryService.test.ts` covers the actual service sequence and returned clone target validation.
- `originAutoPull.test.ts` calls both startup automatic pull and status-broadcaster automatic pull through the real current Git driver with temporary local repositories. Origin tracking accepts the pending update. Upstream tracking leaves the local branch unchanged even when origin has the same pending update. No hosted mutations occur during these proofs.
- Shared Git, pull request contracts, source-control contracts and client project operation tests cover port normalization and explicit endpoint plumbing.

## Reconciliation

Replay decisions at these owner boundaries and adapt the current upstream hosts. Preserve current cache, alias, default-field and return-value mechanics where origin authority permits them. Full repository gates and the controlling intake record determine release readiness.
