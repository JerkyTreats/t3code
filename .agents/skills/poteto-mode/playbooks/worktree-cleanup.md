# Worktree cleanup

An audit is read-only. Reclaiming storage needs an authorized exact candidate set.

1. Inventory actual worktrees, branch refs, disk use, dirty and untracked files, merge state and relevant T3 workspace bindings.
2. Classify candidates as active, uncommitted, ambiguous or confirmed unused and recoverable, with evidence for every classification.
3. Cross-check task-owned branches, running processes and known thread bindings; a missing binding is not proof that a tree is unused.
4. Present the concrete candidate set and losses before any removal not already explicitly authorized, retaining ambiguous or uncommitted work.
5. Remove only approved exact paths through the repository's normal worktree mechanism and preserve refs or backups required by the grant.
6. Re-list the worktrees and compare disk usage, reporting what was reclaimed and why each held candidate remains.

The skill supplies no force-delete authority. Avoid force removal and recursive deletion as a cleanup shortcut. Scope caches, simulators and other directories separately. Do not inspect live T3 userdata or unrelated transcripts to prove liveness. An audit request never silently becomes a prune request.
