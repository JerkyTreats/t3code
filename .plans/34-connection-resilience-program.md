# Connection Resilience Program Ledger

Date: 2026-07-12
Status: implementation complete, rollout pending

## Objective

Make T3 Code usable and state-durable through repeated connection loss, identify and fix the root causes of the leviathan connection churn, replace noisy diagnostics with actionable lifecycle evidence, and prevent the Electron black-screen failure after idle time.

## Source Plan

The source is the user incident report from 2026-07-11 covering four outcomes:

- composer and prompt flow remain usable during connection loss
- reconnect restores authoritative thread, task, plan, and latest activity state
- the full client to front door to server to Codex lifecycle is measurable and reliable
- connection diagnostics and Electron idle behavior expose and recover from real failures

## Program Branch

`fix/connection-resilience`

## Commit Policy

Use focused conventional commits under `governance/commit_policy.md`. Never write to the `upstream` remote. Ask before any push. Production and cluster work remains read-only until a reviewed Git change is ready and push approval is explicit.

## Phase Inventory

| ID | Summary | Status | Dependencies | Write Scope | Owner |
| --- | --- | --- | --- | --- | --- |
| P0 | Build the evidence model and baseline the incident | complete | none | this ledger and read-only analysis | orchestrator and explorers |
| P1 | Add transport lifecycle telemetry and durable diagnostics | complete | P0 | shared contracts, client runtime, server, diagnostics UI | completed |
| P2 | Keep drafting and queued prompt intent usable during disconnect | complete | P0 and shared contract decisions | web composer and client runtime | completed |
| P3 | Reconcile authoritative thread and activity state after reconnect | complete | P0 and P1 | client runtime, server replay, web projections | completed |
| P4 | Correct front door and server WebSocket lifetime defects | ready for rollout | P0 | infra source of truth and server transport | completed locally |
| P5 | Prevent and recover from Electron idle black screens | complete | P0 and P1 | desktop shell and web lifecycle | completed |
| P6 | Add duress tests, operational measurements, and runbooks | complete | P1 through P5 | tests, scripts, and docs | completed |

## Dependency Graph

- `P1 -> P0` because telemetry fields must represent observed failure modes
- `P2 -> P0` because offline behavior must preserve current prompt semantics
- `P3 -> P1` because reconciliation needs connection epochs and replay evidence
- `P3 -> P0` because state ownership must be proven before changing replay
- `P4 -> P0` because front door changes require correlated live evidence
- `P5 -> P1` because idle recovery needs structured renderer and transport signals
- `P6 -> P1` through `P5` because duress coverage validates the integrated behavior

## Wave Plan

- Wave zero: parallel read-only forensics across local logs, T3 runtime code, and front door infrastructure
- Wave one: shared lifecycle contracts and measurement points, followed by independently safe transport and desktop fixes
- Wave two: composer durability and reconnect reconciliation after shared contracts land
- Wave three: diagnostics experience, duress harness, runbook, and full program review

## Agent Strength Plan

The available orchestration surface did not expose an agent strength selector. Review agents therefore received narrow, domain-specific packets and no claim was made that model strength was tuned. Maximum-strength fanout was not required for the bounded client, server, and front door review lanes.

The reusable `phased-program-delivery` and `solo-vertical-delivery` skills now require the lowest reliably capable strength per lane, reserve maximum strength for ambiguous synthesis and boundary work, and record selector availability plus escalation rationale in their ledgers and packets.

## Shared Contract Decisions

- A socket attempt is observable before readiness and retains one stable attempt identity through its terminal outcome.
- A queued send must persist its stable command and message identities before the durable draft is cleared.
- Shell and thread subscriptions use subscribe-first snapshot, replay, live sequencing with sequence deduplication.
- Diagnostics record structured state transitions, lifetimes, close evidence, replay fanout, replay byte estimates, and renderer lifecycle without payload text.
- Legacy thread sync remains supported, but normal chat may never mount detail subscriptions proportional to project history.

## Wave Execution Log

### Wave Zero

- Ready items: P0
- Parallelization decision: three read-only lanes are independent
- Workers launched: local log forensics, runtime lifecycle audit, front door lifecycle audit
- Commands run: branch creation, worktree inventory, local data inventory
- Early evidence: `state.sqlite` is about 1.4 GB and `server.trace.ndjson` rotated through roughly 100 MB of recent files within a short window
- Commits accepted: none yet
- Conflicts: none
- Next ready set: pending evidence synthesis

### Evidence Synthesis

- The active project has 104 threads holding about 247 MB of projected activity JSON.
- Normal `ChatView` mounts project management activity atoms for every active project thread, producing exactly 104 legacy thread subscriptions per connection epoch.
- The rolling Caddy window showed 178 successful WebSocket upgrades, about 48.3 GB sent server to client, and only about 19.5 MB sent client to server.
- 163 sockets both sent more than 250 MB and closed within 30 seconds. The common shape was about 270 to 290 MB in 15 to 16 seconds.
- Effect RPC pings every five seconds. Renderer overload misses pong handling and ends the session after the observed cadence.
- Five Electron V8 OOM crashes were found. The 2026-07-11 crash occurred at 08:04:29 PDT with about 3.55 GB of live old-space data, exit code 133, and a recorded core dump.
- Caddy sustained long healthy sockets, used about 27 MiB during the storm, and has no 15 second lifetime timeout. The giant object is the server replay, not the request.
- A separate cluster DNS incident caused 17 asset request 502 responses at 2026-07-10 12:15:01 PDT. No WebSocket 502 was found.
- Caddy logs currently retain the full short-lived `wsTicket` query value. This is a security and diagnostics hygiene defect.
- The live server process predates current on-disk V2 thread sync code and advertises server version 0.0.27 while the working branch is replaying 0.0.28.
- The local infra checkout is behind live Argo source, and the local `dns-operator` checkout is stale and contains unrelated user changes. Front door writes are deferred until a clean current source worktree is prepared.

### Evidence Sources and Reproduction

The database measurements came from the live local server database at `~/.t3/userdata/state.sqlite`. The thread count and byte totals are moving snapshots because this server remains active. Use read-only SQLite mode:

```sh
du -h ~/.t3/userdata/state.sqlite

sqlite3 -readonly ~/.t3/userdata/state.sqlite "
SELECT 'threads', COUNT(*) FROM projection_threads
UNION ALL
SELECT 'active_threads', COUNT(*) FROM projection_threads
WHERE deleted_at IS NULL AND archived_at IS NULL
UNION ALL
SELECT 'event_payload_bytes', COALESCE(SUM(length(payload_json)), 0)
FROM orchestration_events
UNION ALL
SELECT 'activity_payload_bytes', COALESCE(SUM(length(payload_json)), 0)
FROM projection_thread_activities;
"

sqlite3 -readonly ~/.t3/userdata/state.sqlite "
SELECT p.workspace_root,
       COUNT(DISTINCT t.thread_id) AS active_threads,
       COALESCE(SUM(length(a.payload_json)), 0) AS activity_payload_bytes
FROM projection_projects p
JOIN projection_threads t ON t.project_id = p.project_id
LEFT JOIN projection_thread_activities a ON a.thread_id = t.thread_id
WHERE p.deleted_at IS NULL
  AND t.deleted_at IS NULL
  AND t.archived_at IS NULL
GROUP BY p.project_id
ORDER BY activity_payload_bytes DESC;
"

sqlite3 -readonly ~/.t3/userdata/state.sqlite "
SELECT name, SUM(pgsize) AS bytes
FROM dbstat
GROUP BY name
ORDER BY bytes DESC
LIMIT 20;
"
```

The subscription fanout came from the rotated local server traces at `~/.t3/userdata/logs/server.trace.ndjson*`. This query groups completed legacy subscription spans by connection trace and exposes the largest reconnect fanouts without printing payload data:

```sh
jq -rs '
  [.[] | select(.name == "ws.rpc.orchestration.subscribeThread")]
  | group_by(.traceId)
  | map({trace_id: .[0].traceId, subscriptions: length})
  | sort_by(.subscriptions)
  | reverse
  | .[:20]
' ~/.t3/userdata/logs/server.trace.ndjson*
```

The Caddy measurements came from the then-live `dns-operator-system` Caddy pod log over a rolling 24 hour window. The recorded 178 upgrades and byte totals are snapshot evidence and will change as pod logs rotate. This aggregate command emits no request URI or ticket value:

```sh
kubectl -n dns-operator-system logs deploy/dns-operator-caddy --since=24h \
  | sed -n 's/^[^{]*//p' \
  | jq -s '
    [.[]
      | select(.request.host == "t3code.internal.jerkytreats.dev")
      | select(((.request.uri // "") | startswith("/ws")))
      | select(.status == 101)]
    | {
        upgrades: length,
        server_to_client_bytes: (map(.size) | add // 0),
        client_to_server_bytes: (map(.bytes_read) | add // 0),
        over_250_mb: (map(select(.size > 250000000)) | length),
        under_30_seconds: (map(select(.duration < 30)) | length),
        both: (map(select(.size > 250000000 and .duration < 30)) | length),
        max_duration_seconds: (map(.duration) | max // 0)
      }
  '
```

Electron crash provenance came from systemd coredumps for the repository Electron executable. The July 11 incident is coredump `1516337`. The V8 heap figures came from the renderer fatal output retained with the incident logs:

```sh
coredumpctl list --no-pager | rg '/home/jerkytreats/t3code/.*/electron'
coredumpctl info 1516337 --no-pager
rg -n -i 'heap limit|allocation failed|out of memory|render-process-gone' \
  ~/.cache/t3code-latest.log ~/.t3/userdata/logs
```

### Wave One

- Ready items: replay amplification fix, pre-ready connection diagnostics, race-free shell sync, Electron renderer recovery
- Parallelization decision: write scopes are disjoint across web project state, client runtime, server subscriptions, and desktop window lifecycle
- Worktrees: `connection-replay`, `connection-diagnostics`, `connection-shell-race`
- Central implementation: guarded Electron renderer recovery and lifecycle logging
- Central commit: `25bc630d5`
- Focused desktop gates: all 52 desktop test files passed with 346 tests, desktop typecheck passed with suggestions only
- Next ready set: durable web outbox, provider intent recovery, diagnostics UI, route recovery, duress tests

### Wave Two

- Normal chat now uses project shell state and mounts detail state only for the active thread.
- Prompt sends for existing threads persist text, attachment data, stable message identity, and stable command identity in IndexedDB before clearing the composer.
- The always-mounted outbox coordinator retries ambiguous transport outcomes after reconnect and relies on durable server command receipts for idempotency.
- Accepted provider turn-start intents are enumerated from durable projections during server startup after the live event stream is acquired.
- Shell stream materialization failures terminate the subscription instead of silently consuming a sequence and leaving stale state.
- Thread routes render explicit waiting, failure, and missing-thread recovery states instead of an empty black surface.

### Wave Three

- Connection diagnostics now preserve pre-ready failed opens, socket attempt duration, connection lifetime, probe outcomes, close evidence, and sanitized error details.
- The connection flight recorder classifies stable, recovered, degraded, flapping, and offline states and retains 256 sanitized lifecycle events across renderer restarts.
- Electron reloads after abnormal renderer exit, cancels stale recovery after a successful load, and backs off repeated crashes from 250 milliseconds to 16 seconds.
- The dns operator renders a Caddy filter encoder that redacts `wsTicket` from access logs and pins the Caddy runtime to `2.11.2`.
- The matching GitOps override is committed locally, but no branch was pushed and no cluster rollout occurred.

## Gate Evidence

| Gate | Command | Result | Date | Notes |
| --- | --- | --- | --- | --- |
| Worktree baseline | `git status --short --branch` | pass | 2026-07-11 | source worktree was clean before branch creation |
| Desktop format | `pnpm fmt` | pass | 2026-07-11 | formatted full repository |
| Desktop tests | `pnpm --filter @t3tools/desktop test -- DesktopWindow.test.ts` | pass | 2026-07-11 | 52 files and 346 tests passed |
| Desktop typecheck | `pnpm --filter @t3tools/desktop typecheck` | pass | 2026-07-11 | exit zero with pre-existing suggestions |
| Outbox suites | web, client runtime, and mobile package tests | pass | 2026-07-12 | 165 web files, 38 runtime files, and 63 mobile files passed during focused integration |
| Focused server recovery | provider reactor and shell subscription tests | pass | 2026-07-12 | accepted startup intent and projection failure paths passed |
| Focused desktop recovery | `DesktopWindow.test.ts` | pass | 2026-07-12 | 12 tests passed |
| Caddy validation | Caddy adapt with `2.11.2` | pass | 2026-07-12 | redacting bootstrap configuration adapted and validated |
| dns operator checks | `make check-commit` | pass | 2026-07-12 | generation, format, vet, lint, and unit suites passed |
| dns operator end to end | `make test-e2e` | pass | 2026-07-12 | two Kubernetes Kind specs passed and cluster cleanup completed |
| T3 format | `pnpm fmt` | pass | 2026-07-12 | full repository formatted |
| T3 lint | `pnpm lint` | pass | 2026-07-12 | zero errors and six pre-existing unused directive warnings |
| T3 typecheck | `pnpm typecheck` | pass | 2026-07-12 | all 15 workspace tasks passed |
| T3 tests | `pnpm test` | pass | 2026-07-12 | all workspace suites passed, including 167 web files with 1393 tests and 168 server files with 1432 tests |
| Mobile native static check | `pnpm lint:mobile` | pass | 2026-07-12 | source inventory passed, optional native linters were unavailable |

## Review Findings

- Wave one review found offline imperative typing, remote action gating, shell materialization, and renderer recovery races. Each finding was corrected before full gates.
- Client durability review found terminal outbox blockage, deleted-thread outbox retention, and crash backoff reset defects. Explicit retry and discard actions, authoritative orphan cleanup, and a 60 second stability reset close them.
- Server lifecycle review found overwritten pending starts and abandoned startup scans. Pending starts are now an idempotent FIFO queue, matched materialization removes only one entry, and failed scans retry without swallowing interruption.
- Diagnostics review found stale event races, missing persistent counters and probes, and incomplete credential redaction. Monotonic state updates, version two recorder snapshots, structured probes, and expanded sanitizer coverage close them.
- Front door review confirmed Caddy configuration validity and found only the shared sanitizer gap plus evidence precision. Sanitizer coverage and reproducible command provenance are now recorded.
- All final review findings are closed and the complete repository gates pass.

## Phase Completion Matrix

| Phase | Implementation Evidence | Test Evidence | Review Status | Status |
| --- | --- | --- | --- | --- |
| P0 | local logs, SQLite, Caddy, Kubernetes, process, and coredump evidence | repeatable measurement commands recorded | evidence synthesized | complete |
| P1 | connection runtime diagnostics and persistent flight recorder | focused and full repository gates pass | findings closed | complete |
| P2 | durable IndexedDB outbox and reconnect retry coordinator | web, runtime, mobile, and full gates pass | findings closed | complete |
| P3 | shell-first project state, active detail only, race-free replay, explicit route recovery | focused and full gates pass | findings closed | complete |
| P4 | Caddy redaction, exact image pin, shell failure propagation | Caddy validation, dns operator checks, Kubernetes end to end, and T3 gates pass | findings closed | ready for rollout |
| P5 | guarded reload, cancellation, and bounded backoff | desktop focused and full gates pass | findings closed | complete |
| P6 | incident evidence, lifecycle metrics, duress tests, and this ledger | all required gates pass | findings closed | complete |

## Risks and Exceptions

- No production mutation, Argo push, cluster restart, or infrastructure push is authorized yet.
- The local database is unusually large and must be queried conservatively.
- Existing user worktrees belong to the user and will not be modified or removed.
- The visible symptom may combine transport churn, state replay load, trace amplification, and renderer lifecycle failures.

## Final Reconciliation

- T3 Code commits are present on `fix/connection-resilience` and no push has occurred.
- dns operator commit `d83680f` is present on `fix/caddy-access-log-redaction` and no push has occurred.
- GitOps commit `3396ad7` is present on `fix/t3code-caddy-pin` and no push has occurred.
- The live T3 process still requires a controlled rebuild and restart to replace the old `0.0.27` runtime and release retained heap from the replay storm.
- The dns operator redaction needs a published operator release before the GitOps rollout can consume it.
