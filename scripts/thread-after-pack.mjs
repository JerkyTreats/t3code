import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

export default async function removeAppImageNoSandboxFallback(context) {
  if (context.electronPlatformName !== "linux") return;
  const executable = NodePath.join(context.appOutDir, "t3-thread");
  const electron = NodePath.join(context.appOutDir, "t3-thread-electron");
  await NodeFSP.rename(executable, electron);
  await NodeFSP.writeFile(
    executable,
    `#!/usr/bin/env bash
set -e
root="$(cd -- "$(dirname -- "$0")" && pwd)"
args=()
for arg in "$@"; do
  if [[ "$arg" != "--no-sandbox" ]]; then
    args+=("$arg")
  fi
done
if [[ "\${T3_THREAD_STDOUT_READY:-}" != "1" ]]; then
  echo "T3 Thread requires its standalone launcher." >&2
  exit 1
fi
exec 1>/dev/null
unset T3_THREAD_STDOUT_READY
exec "$root/t3-thread-electron" "\${args[@]}"
`,
    { mode: 0o755 },
  );
}
