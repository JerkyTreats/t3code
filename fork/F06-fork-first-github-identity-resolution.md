# F6 Fork First GitHub Identity Resolution

Date: 2026-06-02
Status: active

## Intent

GitHub context resolves to the fork remote first so repo, issue, and panel actions follow fork ownership by default.

## Required Behavior

- User facing GitHub repository context resolves to the fork remote before upstream.
- Issue and pull request context preserve fork first identity.
- Cross repository head handling may add remotes for pull request heads without replacing fork first default identity.

## Owner Modules

- `apps/server/src/git/Layers/GitHubCli.ts`
- `apps/server/src/git/Layers/GitManager.ts`

## Fork Seams

- GitHub identity policy
- Git manager repository context resolution
- source control context policy

## One Shot Rebuild Notes

- Restore identity policy before issue, pull request, and panel actions.
- Test remote combinations with fork, upstream, origin, and cross repository head remotes.
- Keep fallback behavior explicit when a fork remote cannot be found.
- Do not let provider neutral source control wiring replace the GitHub fork default.

## Upstream Intake Rule

- Adapt upstream GitHub integration changes at the fork identity seam.
- Reject upstream behavior that silently redirects user facing GitHub actions to upstream by default.

## Verification

- Repo context, issue flows, and GitHub panel actions target the fork repository by default.
- Pull request prep preserves fork first remote identity while still supporting cross repository heads.
- Source control provider context does not overwrite the fork first default for GitHub.

## Compatibility Checks

- Added pull request head remotes must not mutate default repository identity.
- GitHub issue links remain attached to the intended fork repository.
