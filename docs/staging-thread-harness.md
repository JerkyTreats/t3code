# Staging Thread desktop harness

This harness exercises the installed T3 Thread AppImage against one explicit staging HTTPS origin. It uses the real staging entry adapter and verified launcher. It never submits a provider turn.

The run covers a fresh home launch, a synthetic crash style prefill, an explicit project launch, concurrent private profiles and extraction roots, exact composer text, native Wayland typing, independent graceful close, independent crash, and protected Code and server invariance. Launcher acknowledgement, authenticated session, primary WebSocket connection, usable composer, and native input have separate timing marks. A read only staging database observation proves that the turn projection and the `thread.turn-start-requested` plus `thread.message-sent` event high water mark remain unchanged across the whole run.

## Prerequisites

Run from an unlocked Omarchy Hyprland desktop session with `hyprctl` and `wtype` available at their standard system paths. The staging AppImage, release descriptor, launcher, entry adapter, entry config, and staging SQLite database must already exist. The entry config must be an owned physical mode `0600` file. Its origin, artifact paths, launcher path, and state directory must exactly match the harness config. The database is opened read only and no row content is retained.

The harness reads the Omarchy shell secure lock state before any client launch or desktop operation. A locked session reports `desktop-locked`; missing or malformed lock state reports `desktop-lock-state-unavailable`. Unlock through the normal desktop lock screen before retrying. The harness never unlocks the session. It rechecks the lock before native input and workspace changes.

Create the harness state and output directories ahead of time as owned physical mode `0700` directories. The state directory must remain separate from normal user state. The harness preserves inherited Wayland, D-Bus, keyring, `HOME`, and `CODEX_HOME` values while the staging entry redirects XDG state into the dedicated state directory.

A fresh state needs a valid one use pairing credential. Pass it through `pairingCredentialFd` where practical. A protected mode `0600` `pairingCredentialFile` is also accepted. Later launches reuse the encrypted enrollment for the exact configured origin. The credential is never written to evidence.

## Configuration

This neutral example shows the complete required shape. Replace every path and process identity privately. Keep the origin credential free.

```json
{
  "contractVersion": 1,
  "stagingOrigin": "https://staging.example.test",
  "stagingDatabasePath": "/private/staging-state.sqlite",
  "artifactPath": "/opt/t3-thread-staging/T3-Thread.AppImage",
  "descriptorPath": "/opt/t3-thread-staging/T3-Thread.AppImage.release.json",
  "launcherPath": "/opt/t3-thread-staging/t3-thread-launcher.mjs",
  "entryAdapterPath": "/workspace/project/scripts/staging-thread-entry.mjs",
  "entryConfigPath": "/private/thread-entry.json",
  "stateDirectory": "/private/t3code-thread-staging",
  "homeWorkingDirectory": "/home/example",
  "projectWorkingDirectory": "/workspace/project",
  "syntheticCrashDraft": "Inspect this synthetic crash before sending.",
  "nativeTypeSentinel": " native-input-check",
  "concurrentWindows": 3,
  "thresholds": {
    "windowMs": 15000,
    "ackMs": 20000,
    "connectedMs": 30000,
    "usableMs": 30000,
    "inputMs": 5000,
    "closeMs": 5000,
    "crashMs": 5000
  },
  "codeReadinessPath": "/run/user/1000/t3code-desktop-staging/ready.json",
  "codeCdpPort": 9223,
  "protectedProcesses": [{ "label": "staging-server", "pid": 1234, "startTicks": "567890" }],
  "protectedServices": ["t3code-staging.service"],
  "hyprland": {
    "threadClass": "t3-thread-staging",
    "defaultWorkspace": 4,
    "projectWorkspace": 5
  },
  "pairingCredentialFd": 3,
  "captureScreenshots": false
}
```

The default and crash cases must use the reserved staging client workspace. The project case may use a separate reserved wallpaper workspace. The harness matches each window with its captured Electron PID and configured class before moving the exact Hyprland address. It uses the current Lua dispatcher interface and restores the initial workspace and focused address after native input and cleanup while the session remains unlocked. A lock acquired during the run prevents restoration and is reported as a failed check.

Set `codeCdpPort` to the loopback debugging port of the protected staging Code window to include full Code usability evidence. The harness verifies that its browser PID and start ticks match the configured readiness receipt, its exact staging session is authenticated, its composer text is actually observable and remains byte-identical, and no turn send frame appears while Thread close and crash cases run. A collapsed composer must be expanded before the run; absence of its text cannot prove draft preservation. It disconnects from Code without sending `Browser.close`.

## Run

```sh
node scripts/staging-thread-harness.mjs \
  --config /private/thread-harness.json \
  --output-dir /private/thread-harness-result \
  3</private/pairing-credential
```

The empty output directory receives mode `0600` `summary.json` and `diagnostics.json`. The summary contains bounded checks and timing results without origin, paths, process IDs, drafts, or credentials. Diagnostics are private and include scoped process identities, draft byte counts, draft hashes, and failure categories. Partial runs retain attempted case counts and completed timing milestones. Graceful close has a deadline; cleanup can then signal only captured exact process identities and still write failure evidence.

## Evidence limits

A successful run proves actual AppImage and launcher use, exact staging authentication and primary WSS, project scoped draft selection, byte exact prefills, no observed provider send frame, native input isolation, concurrent profile and extraction isolation, close and crash isolation, startup timing, and configured protected runtime invariance.

The crash draft remains synthetic input supplied through the real staging entry adapter. A separate packaged Omarchy prompt-producer check must establish the source of that exact text. This is distinct from clicking a live crash notification. The harness does not crash an unrelated application, mutate production, install artifacts, verify wallpaper rendering, or send a provider request. Timing budget breaches are reported as evidence and do not erase otherwise valid functional observations.
