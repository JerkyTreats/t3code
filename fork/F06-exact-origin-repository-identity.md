# F06 Exact Origin Repository Identity

Status: active

Product repository identity, status, ref lists, hosted targets and publication resolve exact `origin`. Missing origin fails closed. Generic Git diagnostics and local reconciliation remain available without making other remotes product authority.

## Protected Decisions

- `F06.D1` (`F06.identity`) selects literal origin fetch identity and origin refs. `originOnlySourceControlPolicy.ts` owns remote and tracking selection. `sourceControlContextPolicy.ts` owns provider context and origin-derived pull request repository selectors. `RepositoryIdentityResolver.ts`, `GitManager.ts`, `GitVcsDriverCore.ts` and the provider registry adapt current upstream caches and Git parsing to these decisions.
- `F06.D2` (`F06.git-mutation`) names origin explicitly for product pull and push. `originGitPolicy.ts` owns fetch and push URL agreement, port-sensitive identity, requested remote refusal and push redirect refusal. The current driver retains branch alias handling, base preservation, caches, submodules and local Git mechanics after authorization. Non-origin local tracking cannot select a product pull request association.
- `F06.D3` (`F06.hosted-mutation`) validates live origin against projected identity before permission or mutation calls. `OriginRepositoryMutationAuthority.ts` owns that revalidation, including all effective fetch and push URLs and current branch or global push redirects. `sourceControlContextPolicy.ts` owns context binding and change request creation authorization. `PullRequestService.ts` adapts current provider, permission, cache and invalidation flows without changing upstream action results or optional fields.
- `F06.D4` (`F06.provider-target`) binds hosted calls to origin host, port and repository. `originHostedProviderPolicy.ts`, `AzureDevOpsRepositoryTarget.ts` and `GitLabRepositoryTarget.ts` own provider targets and membership validation. The hosted provider owner also selects bound Bitbucket origin context or literal local origin and refuses missing or mismatched hosts; `BitbucketApi.ts` performs requested remote inspection and translates the decision into its existing errors. `originReviewThreadPolicy.ts` owns the GitHub thread relationship query and refusal before mutation. Provider and CLI modules perform explicit transport calls and retain current parsing, draft state, timestamps and optional auto-merge fields. Pull request source-branch deletion writes only when the head repository is the origin repository; `isOriginHeadRepository` in `originHostedProviderPolicy.ts` refuses a branch in another repository before any mutation, and the GitHub adapter reports it as a foreign-repository refusal. The action is offered only when GitHub reports the head branch inside the origin repository; `offersOriginSourceBranchDeletion` owns that rule.
- `F06.D5` (`F06.publication`) validates the selected provider endpoint, existing remote conflicts, effective origin URLs, redirect settings and both returned clone targets before add or push. `originRepositoryPublicationPolicy.ts` owns these decisions. `SourceControlRepositoryService.ts` retains destination handling and the create, lookup, add and push sequence. Empty repositories retain the upstream `remote_added` result.

- `F06.D6` (client membership) admits a change request link for a registered provider only when it names the checkout's exact origin locator, preserving host, port and repository identity. `packages/source-control-core/src/client/originRepositoryPolicy.ts` owns admission; each provider client `definition.ts` delegates both repository membership and host-read admission to it.
- `F06.D7` (explicit endpoint and port identity) requires an explicit provider endpoint for lookup and publication and keeps mutation comparison port-sensitive separately from display grouping. `packages/client-runtime/src/fork/sourceControlEndpoint.ts` owns endpoint selection; `normalizeGitRemoteMutationTarget` in `packages/shared/src/git.ts` owns mutation normalization; `parseChangeRequestUrl` retains a non-default port as link authority.

## Upstream Remote Selection Paths

The 2026-10-23 intake approved origin-only behavior for upstream paths that select or mutate through other remotes. Each path calls an F06 owner and carries focused evidence:

- New-thread and worktree base branches fetch and resolve only literal origin refs. A base qualified with another remote fails closed instead of becoming product state (`F06.D1`).
- Pull request base selection from `t3-merge-base-ref`, remote-qualified `gh-merge-base` and per-branch configuration accepts only origin refs. `GH_REPO` and `gh-resolved` configuration never select the hosted repository (`F06.D1`, `F06.D4`).
- Configured diff bases and default branch totals compare only against origin refs (`F06.D1`).
- Pull recovery after a ref-lock failure retries against literal origin (`F06.D2`).
- Review-guide generation fetches literal origin rather than a remote discovered by fetch URL (`F06.D3`).
- MCP pull request link and watch tools reject a pull request URL outside the exact origin repository before it becomes linked or watched thread state (`F06.D3`).
- Forgejo merge requests host-side source-branch deletion only when the head branch is inside the origin repository (`F06.D4`).
- GitCafe reviewer and label mutations resolve the origin target before any request (`F06.D4`).
- Repository creation and HTTPS clone retry validate both returned clone targets before add, push or clone (`F06.D5`).

## Owner Boundaries

Server orchestration owners reside under `apps/server/src/fork/`. Package-safe hosted target and review-thread owners, including Azure and GitLab target parsers, reside under `packages/source-control-core/src/server/fork/`. Current provider packages consume those owners directly rather than importing server application code.

`packages/source-control-core/src/client/originRepositoryPolicy.ts` owns client membership admission for registered providers. Admission requires an exact origin locator and preserves host, port and repository identity. An SSH locator may use a related web URL only when its host and repository relationship agree. Provider definitions retain their registry presentation and link mechanics.

`packages/shared/src/git.ts` keeps display grouping separate from mutation normalization. Mutation comparison preserves non-default ports and accepts equivalent common Git URL transports. `canonicalRepositoryKey` in `packages/shared/src/sourceControl.ts` normalizes Azure aliases; it does not remove an explicit port from its input. Protected membership uses exact target normalization rather than treating display grouping as authority.

`packages/contracts/src/pullRequest.ts` retains the shared `pullRequestHostOf` compatibility helper used by server and clients. An exact origin locator supplies the host and explicit port. Legacy or malformed locator data falls back to the canonical host, then provider kind. That display grouping fallback does not authorize a provider mutation or replace the required exact origin selector.

`packages/contracts/src/sourceControl.ts` requires an explicit provider endpoint for lookup and publication and permits it for provider-based clone. Project creation clients and the publication wizard supply the selected authenticated endpoint. `packages/client-runtime/src/fork/sourceControlEndpoint.ts` owns authenticated endpoint selection and lookup request preparation, including full Azure selectors. Shared project operations forward the selected target. The web and mobile components remain adapters around their current flows.

`originProviderRefinementContext` in `sourceControlContextPolicy.ts` binds caller provider hints to
the live origin remote, preserving transport and port identity before registry refinement.
`originCreatedPullRequestKey` validates a newly created native URL against origin before linking it
to the thread. The Azure path compares the full organization, project, and repository target;
foreign URLs and mismatched numbers do not become linked product state.

## Current Batched Read Boundary

`apps/server/src/pullRequest/PullRequestService.ts` retains upstream repository batching,
per-repository cursors, cached reads, and individual fallback after a batched read fails. The
origin-derived project selector binds every repository before the batch is formed. Batching does
not grant mutation authority: `requireMutationProject` separately revalidates current origin
through `OriginRepositoryMutationAuthority` before permission or provider mutation calls.

New provider hosts, including GitCafe, use the same explicit origin target. Published branch discovery considers literal origin only. Review-guide generation revalidates live origin through `OriginRepositoryMutationAuthority` before fetching its diff or invoking the model; its fetch names literal origin.

## Non Ownership Boundaries

F06 does not own provider authentication, response parsing, permission semantics, UI presentation, ordinary worktree mechanics, submodule algorithms or the upstream cache lifecycle. Cross-repository head metadata returned by the bound origin provider remains supported. Arbitrary local non-origin refs and tracking cannot choose a product head association. Generic local reconciliation may inspect or fetch other remotes without publishing their identity as product state.

Passing origin validation does not itself authorize publication or a hosted mutation.

## Evidence

- `originOnlySourceControlPolicy.test.ts` and `sourceControlContextPolicy.test.ts` execute literal selection, absent-origin refusal and replacement registry binding with zero provider calls after failed authorization.
- `originGitPolicy.test.ts` executes URL agreement, port separation and redirect refusal through a replacement command host. `GitVcsDriverCore.test.ts` exercises the current real driver, explicit origin mutations, branch base and alias mechanics, origin status and ref filtering.
- `OriginRepositoryMutationAuthority.test.ts` exercises stale identity, missing origin, all push targets and both redirect sources. `PullRequestService.test.ts` verifies authorization before permission or provider calls, including custom-port hosts. Label and host-backed viewed-file writes execute the actual authority against changed repository and port fixtures, producing zero provider mutations on refusal and retaining the admitted origin locator on success. GitLab and Azure viewed-file and file-revision read fixtures retain the exact origin locator and custom port without hosted-mutation admission. Environment-backed viewed-file bookkeeping and read caching retain their upstream behavior.
- `originHostedProviderPolicy.test.ts`, provider CLI tests and target parser tests assert explicit GitHub, GitLab, Azure, Bitbucket and Forgejo endpoints. GitHub public-host selectors also include the host, preventing environment defaults from changing authority. The focused `originChangeRequestSelector` owner validates PR and MR URL host, port and repository against origin, then reduces matching URLs to numeric selectors before view or checkout because CLI URL selectors override `--repo`. Foreign and malformed URLs fail before any CLI call. Forgejo accepts matching pull views such as files and commits while retaining origin host, port, mount path and repository binding. Linked-source-control URLs and file-revision or stack reads carry the same origin target. Ordinary branch and numeric selectors retain their existing interpretation, including GitHub `owner:branch` selectors within the selected origin repository.
- `originReviewThreadPolicy.test.ts` bypasses the historical CLI host and proves mutation follows membership validation. `GitHubPullRequestApi.test.ts` proves the actual relationship query and refusal for thread identifiers outside the origin pull request.
- `originRepositoryPublicationPolicy.test.ts` runs a replacement publication host and asserts zero external calls after failed requested remote, matching remote, effective fetch, push URL or redirect preflight. `SourceControlRepositoryService.test.ts` covers the actual service sequence and returned clone target validation.
- `originAutoPull.test.ts` calls both startup automatic pull and status-broadcaster automatic pull through the real current Git driver with temporary local repositories. Startup also checks the configured branch remote is literal origin before invoking the pull. Origin tracking accepts the pending update. Upstream tracking leaves the local branch unchanged even when origin has the same pending update. No hosted mutations occur during these proofs.
- Shared Git, pull request contracts, source-control contracts and client project operation tests cover port normalization and explicit endpoint plumbing.
- Upstream remote selection paths: `GitVcsDriverCore.test.ts` proves a non-origin worktree base is not fetched, configured and default-branch comparison bases stay on origin, and non-origin upstreams are refused for pull and push. `WorktreeMcpService.test.ts` proves a handoff starts from fetched origin and stays local for another remote. `GitManager.test.ts` proves `gh-merge-base` and `t3-merge-base-ref` cannot select a non-origin base. `PullRequestReviewGuideService.test.ts` refuses a renamed remote that matches the identity URL. `handlers.test.ts` refuses foreign and port-mismatched link and watch targets with zero dispatched commands. `ForgejoSourceControlProvider.test.ts` never requests source-branch deletion outside origin. `GitCafePullRequestProvider.test.ts` refuses reviewer and label mutations outside origin. `SourceControlRepositoryService.test.ts` and `originRepositoryPublicationPolicy.test.ts` refuse an HTTPS clone retry that leaves the validated target.
- Evidence formerly held in upstream-deleted provider tests lives in fork-owned `packages/source-control-azure-devops/src/server/fork/AzureDevOpsOriginTarget.test.ts` and `packages/source-control-bitbucket/src/server/fork/bitbucketOriginBinding.test.ts`. The GitHub review-thread relationship query is the typed `originReviewThread.graphql` document.

## Reconciliation

Replay decisions at these owner boundaries and adapt the current upstream hosts. Preserve current cache, alias, default-field and return-value mechanics where origin authority permits them. Full repository gates and the controlling intake record determine release readiness.
