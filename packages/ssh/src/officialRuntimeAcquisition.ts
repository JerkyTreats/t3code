export const OFFICIAL_REMOTE_T3_MISSING_MESSAGE =
  "Remote host is missing the t3 CLI on PATH. Install this fork on the remote host before connecting over SSH.";

export type OfficialRuntimeAcquisition =
  | {
      readonly kind: "explicit-node-entry";
      readonly nodeScriptPath: string;
    }
  | {
      readonly kind: "preinstalled-t3";
    };

/** Select only an explicit development entry or a preinstalled official runtime. */
export function officialRuntimeAcquisition(
  nodeScriptPath?: string | null,
): OfficialRuntimeAcquisition {
  const normalizedPath = nodeScriptPath?.trim();
  return normalizedPath
    ? { kind: "explicit-node-entry", nodeScriptPath: normalizedPath }
    : { kind: "preinstalled-t3" };
}

function shellSingleQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export const OFFICIAL_REMOTE_T3_RUNNER_SCRIPT = `#!/bin/sh
set -eu
@@T3_NODE_ENV_SCRIPT@@
ensure_remote_node_path || true
T3_NODE_SCRIPT_PATH=@@T3_NODE_SCRIPT_PATH@@
if [ -n "$T3_NODE_SCRIPT_PATH" ]; then
  if ! command -v node >/dev/null 2>&1; then
    printf 'Remote host is missing node on PATH. Install Node or configure a supported version manager for non-interactive shells.\\n' >&2
    exit 1
  fi
  exec node "$T3_NODE_SCRIPT_PATH" "$@"
fi
if command -v t3 >/dev/null 2>&1; then
  exec t3 "$@"
fi
printf '${OFFICIAL_REMOTE_T3_MISSING_MESSAGE}\\n' >&2
exit 1
`;

/**
 * Build the executable acquisition boundary. The caller supplies only remote
 * Node discovery mechanics; this owner selects and enforces allowed T3 bytes.
 */
export function buildOfficialRemoteT3RunnerScript(input: {
  readonly nodeEnvironmentScript: string;
  readonly nodeScriptPath?: string | null;
}): string {
  const acquisition = officialRuntimeAcquisition(input.nodeScriptPath);
  const nodeScriptPath =
    acquisition.kind === "explicit-node-entry" ? acquisition.nodeScriptPath : "";
  return OFFICIAL_REMOTE_T3_RUNNER_SCRIPT.replaceAll(
    "@@T3_NODE_ENV_SCRIPT@@",
    input.nodeEnvironmentScript.replace(/\n+$/u, ""),
  )
    .replaceAll("@@T3_NODE_SCRIPT_PATH@@", shellSingleQuote(nodeScriptPath))
    .replace(/\n+$/u, "");
}
