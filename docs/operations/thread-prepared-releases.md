# Thread prepared releases

The Linux Thread installer expands release code before publishing its existing content-addressed release pointer. The standalone launcher verifies the artifact and prepared code on every launch. It starts a fresh Electron process with independent writable profile, activation, draft and server authentication. No resident daemon is required.

For a disposable direct artifact, prepare before timing:

```sh
node scripts/thread-launcher.mjs --prepare /workspace/candidate/T3-Thread.AppImage
```

Preparation lives beside the physical artifact under `.t3-thread-releases/<artifact-sha256>`. The artifact's directory must be owned by the current user and must not be group- or world-writable. Normal launch can prepare a missing release once through the same owner. A direct artifact on read-only media needs installation into an owned release directory before use.

The prepared inventory binds file bytes, modes, kinds and relative links to the source artifact digest. Added, removed or changed code and escaping links fail verification. The local manifest is integrity evidence under the trusted-user filesystem boundary, not a separate signature authority. Release descriptor verification remains the installer's source-provenance boundary.

Preparation uses private staging and publishes only after verification. Concurrent preparers may converge on one verified winner. A failed preparation removes only its unpublished staging directory. A changed artifact produces another content identity; existing code is not overwritten beneath open clients.

The doctor reports `prepared-release:invalid` when published code fails verification. Launch and reinstall against a damaged existing release fail closed instead of repairing it in place. Preserve the damaged release for diagnosis and publish a newly verified release through the installer. Do not remove prepared versions while clients may still be using them. Automatic release garbage collection is not implemented.

This changes executable-code lifetime, not IPC, WebSocket contracts, browser state, server state, model selection or credential ownership. The independent Code application's AppImage lifecycle is unchanged.
