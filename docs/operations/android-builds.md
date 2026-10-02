# Local Android builds

The canonical local Android artifact root is
`${XDG_DATA_HOME:-$HOME/.local/share}/t3code-android`. This is the accepted
local sideload build location, independent of Google Play and EAS publication.

| Path                               | Purpose                                       |
| ---------------------------------- | --------------------------------------------- |
| `current/T3-Code.apk`              | Current verified APK for installation         |
| `current/manifest.json`            | Identity and verification record for that APK |
| `artifacts/<sha256>/T3-Code.apk`   | Retained, immutable APK bytes                 |
| `artifacts/<sha256>/manifest.json` | Matching build metadata                       |

`current` is a symlink to an artifact directory. Promote a candidate only after
verification by atomically replacing that symlink. Retain previous artifacts
for explicit rollback. Do not use a Gradle output directory as the stable
download location or overwrite an accepted artifact.

## Build a self-contained APK

Use a separate clean detached worktree at the selected committed revision.
Require Node and pnpm versions from the root package, JDK 17, and the Android
SDK needed by the generated native project. Set `JAVA_HOME` and `ANDROID_HOME`
to the installed toolchains. Do not copy private environment files or service
state into the build checkout.

From the build worktree:

```sh
pnpm install --frozen-lockfile
CI=1 APP_VARIANT=production T3CODE_MOBILE_UPDATES_ENABLED=0 NODE_ENV=production \
  pnpm --filter @t3tools/mobile exec expo prebuild --clean --platform android
cd apps/mobile/android
CI=1 APP_VARIANT=production T3CODE_MOBILE_UPDATES_ENABLED=0 NODE_ENV=production \
  ./gradlew :app:assembleRelease --no-daemon
```

The APK is generated at `app/build/outputs/apk/release/app-release.apk`.
This production variant embeds its JavaScript bundle and does not need Metro.
Disabling OTA updates keeps the installed code tied to the accepted source
revision. Keep the native architecture list explicit in the manifest; the
default build includes every architecture declared by the generated project.

The current local Release configuration uses the project's debug signing key.
Record its certificate fingerprint and preserve that signer for compatible
updates. A Release task alone does not make an APK store-signed.

## Verify and accept the artifact

1. Require the build worktree to remain clean and record its full commit and
   exact-origin repository identity.
2. Use the SDK's `apksigner verify --verbose --print-certs` and `zipalign -c`
   checks. Inspect the APK with `aapt` to confirm `com.t3tools.t3code`, its
   version name and code, and its native architectures.
3. Require the APK to contain the bundled JavaScript and require its compiled
   `expo.modules.updates.ENABLED` metadata to be false.
4. Calculate the APK's SHA-256. Create a new `artifacts/<sha256>` directory
   containing a physical `T3-Code.apk` file and `manifest.json`. Include the
   artifact hash, full commit, clean-source status, package ID, version name
   and code, production variant, native architectures, signing certificate
   SHA-256, signing mode, disabled OTA status, verification results, and build
   time. Keep local paths, credentials, and private service details out of
   portable metadata.
5. Recalculate the installed file's hash and require it to match the manifest.
   If an artifact directory already exists, verify it rather than replacing
   its contents. Atomically point `current` at the accepted directory.

Artifact verification does not prove on-device behavior. Install or launch on
a device only when requested. Use [mobile verification](../../.agents/skills/test-t3-mobile/SKILL.md)
for a requested device acceptance pass, with isolated backend state. Building
an APK does not authorize EAS submission, store publication, or public hosting.

## Host library collision

If the native linker selects the host's `/usr/lib/libonig.so`, keep Android
dependency libraries ahead of host libraries. Do not replace the Android
library with a host binary or edit the application source to bypass the link.
Use a build-local Gradle init script outside the checkout:

```groovy
allprojects { project ->
    project.plugins.withId('com.android.application') {
        project.android.defaultConfig.externalNativeBuild.cmake.arguments.add(
            '-DCMAKE_IGNORE_PATH=/usr/lib;/usr/lib64;/usr/local/lib;/lib;/lib64'
        )
    }
}
```

Pass its path with `--init-script` to the Release task. Confirm that each
architecture's active CMake cache resolves `ONIG_LIB` to the dependency's
matching Android `jniLibs` directory. Record this build configuration in the
accepted manifest. Do not promote a failed native build.
