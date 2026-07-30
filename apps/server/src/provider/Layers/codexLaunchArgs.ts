import { tokenizeCliArgs } from "@t3tools/shared/cliArgs";

export const T3CODE_CODEX_LAUNCH_ARGS_ENV = "T3CODE_CODEX_LAUNCH_ARGS";

export function resolveCodexLaunchArgs(
  launchArgs?: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return environment[T3CODE_CODEX_LAUNCH_ARGS_ENV]?.trim() || launchArgs?.trim() || "";
}

export function codexLaunchArgv(launchArgs?: string): ReadonlyArray<string> {
  return tokenizeCliArgs(launchArgs);
}

export function codexAppServerArgs(launchArgs?: string): ReadonlyArray<string> {
  return [...codexLaunchArgv(launchArgs), "app-server"];
}

export function codexExecLaunchArgs(launchArgs?: string): ReadonlyArray<string> {
  return codexLaunchArgv(launchArgs);
}

export function codexSessionAppServerArgs(
  appServerArgs: ReadonlyArray<string> | undefined,
  launchArgs: string | undefined,
): ReadonlyArray<string> {
  return [...codexAppServerArgs(launchArgs), ...(appServerArgs ?? [])];
}
