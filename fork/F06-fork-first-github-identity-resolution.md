# F6 Origin Only GitHub Target Resolution

Date: 2026-06-02
Status: active

## Intent

GitHub change request mutations resolve to `origin` so repository, branch, and pull request targets cannot drift to `upstream` or another remote.

## Required Behavior

- Pull request lookup, default branch lookup, and creation use the repository identified by `origin`.
- GitHub CLI pull request creation supplies an explicit repository argument derived from `origin`.
- A missing origin, an unsupported origin provider, or a non-origin branch tracking target fails before a pull request is created.
- Read-only inspection may identify other remotes without changing the origin mutation target.

## Owner Modules

- `apps/server/src/sourceControl/GitHubCli.ts`
- `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`
- `apps/server/src/fork/sourceControlContextPolicy.ts`
- `apps/server/src/git/GitManager.ts`

## Fork Seams

- Origin-only GitHub target policy
- Git manager repository context resolution
- source control context policy

## One Shot Rebuild Notes

- Restore origin-only target resolution before pull request actions.
- Test origin, upstream, and missing-origin combinations.
- Keep read-only remote discovery separate from mutation target selection.
- Do not let provider-neutral wiring fall back to upstream for a pull request target.

## Origin Rebuild Rule

- Rebuild source control behavior only from origin owned changes.
- Reject integration behavior that selects upstream as a GitHub repository, base, head, or write target.

## Verification

- Pull request actions target the origin repository explicitly.
- A branch that tracks a non-origin remote cannot create a pull request until it is published to origin.
- Source control provider context cannot overwrite the origin target for a mutation.

## Compatibility Checks

- Read-only head remote inspection must not mutate the origin target.
- GitHub pull request commands keep the selected origin repository explicit.
