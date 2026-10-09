# Threads from older T3 Code versions

On your first V2 launch, T3 Code copies the V1 database, `state.sqlite`, into `statev2.sqlite`
in the same data directory and migrates the copy. Your threads appear automatically, with full
transcripts imported as needed. You do not need to run an import command.

Stop the V1 server before starting V2 against the same data directory. Keep only one writable
server active for that environment. The first copy includes authentication and access grants as
well as conversation data. Later revocations, pairings, permission changes, and conversations do
not synchronize between the two databases. Settings, attachment files, and workspace files may
still be shared, so separate database names do not make concurrent operation safe.

Opening V2 again resumes its existing history without refreshing the V1 snapshot. Before a
rollback, stop V2 and preserve its current data. Reconcile access grants and revoked credentials
with the database the older runtime will use before reopening access. A rollback can otherwise
restore credentials that were revoked after cutover. New V2 conversations do not appear in V1.

The V2 desktop app uses a separate browser profile, so browser cookies and caches do not carry
over from V1. You may need to sign in again to websites opened inside the app. On its first launch,
the V2 desktop app copies stashed prompts, unsent drafts, layout, and theme from V1. Anything you
change in V2 afterwards stays in V2.

The migrated thread keeps its title, project, provider and model selection, permission and
interaction modes, branch or worktree, archive state, settlement state, snooze and pin state, and
linked pull request. T3 Code also brings over user and assistant messages, their timestamps, and
supported attachments. Large histories may appear in stages while the server imports transcripts.

The migration does not recreate the old provider's live session. It also does not convert old run
records, checkpoints and diffs, tool activity, approval history, or proposed plan history into the
new format. These items may be absent from a migrated timeline even though the conversation text is
present.

## Continuing a migrated thread

The first new message starts a fresh provider session. T3 Code selects intact user and assistant
messages using the same [handoff budget](./portable-handoffs.md) as a provider switch. Omitted text
remains in the thread and can be retrieved by the agent. The migration retains its separate
32,000-character recovery excerpt; neither that excerpt nor the handoff replaces the full imported
transcript.

Before continuing a long or important thread, read the recent transcript and include any older
requirements the agent still needs in your next message. Starting a new thread and pasting a short
handoff is also a good choice when the old conversation contains conflicting instructions.

## Keeping a recovery copy

T3 Code does not currently have a whole-thread export command. Before a major server update, stop
the server and copy its `userdata` directory to a safe location. The default is
`~/.t3/userdata`; a server started with `--home-dir <path>` uses `<path>/userdata`.

If a migrated transcript is missing from the app, keep that copy unchanged. You can inspect the
old transcript without starting a server against it:

```sh
sqlite3 -readonly /path/to/recovery-copy/state.sqlite
```

At the SQLite prompt, list recent legacy threads:

```sql
.headers on
.mode tabs
SELECT thread_id, title, updated_at
FROM projection_threads
ORDER BY updated_at DESC;
```

Then print one transcript, replacing `<thread-id>` with the value from the first query:

```sql
SELECT role, text, created_at
FROM projection_thread_messages
WHERE thread_id = '<thread-id>'
  AND role IN ('user', 'assistant')
ORDER BY created_at, message_id;
```

Open only the copied database. Do not edit it or point a newer or older server at your recovery
copy. If the affected environment is remote, make and inspect the copy on the machine that runs
that environment.
