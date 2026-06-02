# F11 Source Control Provider Lane And Publish Workflow

Date: 2026-06-02
Status: active

## Intent

Source control support exposes GitHub, GitLab, Azure DevOps, and Bitbucket through one provider lane while preserving fork Git workflow guardrails.

## Required Behavior

- Source control discovery reports real provider readiness for GitHub, GitLab, Azure DevOps, and Bitbucket.
- Repository lookup, clone, and publish are exposed through additive source control RPC and native API capabilities.
- Sidebar add project supports local path and clone remote modes, with provider clone lookup using SSH by default and raw Git URL clone bypassing provider lookup.
- Git panel publish is the publish surface for repositories without an origin remote.
- Publish creates the remote repository, ensures the requested remote, and pushes to the actual remote returned by remote wiring.
- Empty local repositories create and wire the remote but return `remote_added` without pushing.
- GitHub issue UI remains GitHub only.
- Pull request and merge request workflows resolve through the repository provider when available, while GitHub CLI fallback remains available for GitHub and unknown provider cases.
- Fork promotion, worktree, cross repository, and protected default branch behavior from `F6` and `F7` remains authoritative.

## Owner Modules

- `packages/contracts/src/rpc.ts`
- `packages/contracts/src/ipc.ts`
- `apps/server/src/sourceControl`
- `apps/server/src/git/Layers/GitCore.ts`
- `apps/server/src/git/Layers/GitHubCli.ts`
- `apps/server/src/git/Layers/GitManager.ts`
- `apps/server/src/server.ts`
- `apps/server/src/ws.ts`
- `apps/web/src/lib/sourceControlReactQuery.ts`
- `apps/web/src/wsRpcClient.ts`
- `apps/web/src/wsNativeApi.ts`
- `apps/web/src/forkNativeApiAdapter.ts`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/GitActionsControl.tsx`
- `apps/web/src/sourceControlPresentation.ts`

## Fork Seams

- source control provider registry
- source control repository service
- source control context policy
- Git provider lane UI
- native API and RPC capability adapters

## One Shot Rebuild Notes

- Restore source control contracts before server and web wiring.
- Keep provider discovery and publish behavior provider neutral.
- Keep GitHub issue UI scoped to GitHub until parity exists.
- Preserve fork Git workflow rules from `F6` and `F7` during publish and pull request work.
- Verify empty repository publish separately from publish with commits.

## Upstream Intake Rule

- Adapt upstream source control changes through the provider registry and repository service instead of adding provider specific UI paths.
- Preserve fork Git workflow semantics when upstream behavior conflicts with promotion, worktree, protected branch, or fork identity behavior.
- Reject upstream changes that make GitHub issues appear provider neutral before non GitHub issue parity exists.

## Verification

- Source control provider registry, repository service, provider CLI and API, GitCore, GitManager, server, and web native and RPC tests pass.
- Publishing with commits pushes to the remote returned by `ensureRemote`.
- Publishing an empty repository returns `remote_added`.
- Sidebar clone by provider and raw Git URL both create projects at the cloned cwd.
- Git panel publish remains hidden or disabled when source control capability is unavailable.

## Compatibility Checks

- Source control RPC and IPC methods remain additive.
- Existing GitHub workflows keep their fork first identity behavior.
- Raw Git URL clone bypasses provider lookup.
