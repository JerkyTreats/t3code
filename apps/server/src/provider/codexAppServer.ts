import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import type { ServerProviderModel, ServerProviderSkill } from "@t3tools/contracts";
import type { ModelCapabilities } from "@t3tools/contracts";
import { readCodexAccountSnapshot, type CodexAccountSnapshot } from "./codexAccount.ts";

interface JsonRpcProbeResponse {
  readonly id?: unknown;
  readonly result?: unknown;
  readonly error?: {
    readonly message?: unknown;
  };
}

export interface CodexAppServerSnapshot {
  readonly account: CodexAccountSnapshot;
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly skills: ReadonlyArray<ServerProviderSkill>;
}

const DEFAULT_CODEX_MODEL_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [
    { value: "xhigh", label: "Extra High" },
    { value: "high", label: "High", isDefault: true },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ],
  supportsFastMode: true,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function formatModelName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) =>
      part.length <= 3 ? part.toUpperCase() : `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
    )
    .join("-");
}

function parseCodexModelList(response: unknown): ReadonlyArray<ServerProviderModel> {
  const data = asObject(response)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const models: ServerProviderModel[] = [];
  const seen = new Set<string>();
  for (const entry of data) {
    const record = asObject(entry);
    const slug = asString(record?.id) ?? asString(record?.model);
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    models.push({
      slug,
      name: asString(record?.displayName) ?? formatModelName(slug),
      isCustom: false,
      capabilities: DEFAULT_CODEX_MODEL_CAPABILITIES,
    });
  }

  return models;
}

function parseCodexSkillList(response: unknown, cwd: string): ReadonlyArray<ServerProviderSkill> {
  const data = asObject(response)?.data;
  if (!Array.isArray(data)) {
    return [];
  }

  const skillEntries = data
    .map((entry) => asObject(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);
  const matchingEntry = skillEntries.find((entry) => asString(entry.cwd) === cwd);
  const rawSkills =
    matchingEntry && Array.isArray(matchingEntry.skills)
      ? matchingEntry.skills
      : skillEntries.flatMap((entry) => (Array.isArray(entry.skills) ? entry.skills : []));

  const skills: ServerProviderSkill[] = [];
  const seen = new Set<string>();
  for (const rawSkill of rawSkills) {
    const skill = asObject(rawSkill);
    if (!skill) {
      continue;
    }
    const name = asString(skill?.name);
    const path = asString(skill?.path);
    if (!name || !path || seen.has(name)) {
      continue;
    }
    seen.add(name);

    const interfaceMetadata = asObject(skill.interface);
    const description = asString(skill.description);
    const scope = asString(skill.scope);
    const displayName = asString(interfaceMetadata?.displayName);
    const shortDescription =
      asString(skill.shortDescription) ?? asString(interfaceMetadata?.shortDescription);

    skills.push({
      name,
      path,
      enabled: typeof skill.enabled === "boolean" ? skill.enabled : true,
      ...(description ? { description } : {}),
      ...(scope ? { scope } : {}),
      ...(displayName ? { displayName } : {}),
      ...(shortDescription ? { shortDescription } : {}),
    });
  }

  return skills;
}

function readErrorMessage(response: JsonRpcProbeResponse): string | undefined {
  return typeof response.error?.message === "string" ? response.error.message : undefined;
}

export function buildCodexInitializeParams(input?: { readonly clientVersion?: string | null }) {
  return {
    clientInfo: {
      name: "t3code_desktop",
      title: "T3 Code Desktop",
      version: input?.clientVersion ?? "0.1.0",
    },
    capabilities: {
      experimentalApi: true,
    },
  } as const;
}

export function killCodexChildProcess(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall through to direct kill when taskkill is unavailable.
    }
  }

  child.kill();
}

export async function probeCodexAccount(input: {
  readonly binaryPath: string;
  readonly clientVersion?: string | null;
  readonly homePath?: string;
  readonly signal?: AbortSignal;
}): Promise<CodexAccountSnapshot> {
  return (await probeCodexAppServerSnapshot(input)).account;
}

export async function probeCodexAppServerSnapshot(input: {
  readonly binaryPath: string;
  readonly clientVersion?: string | null;
  readonly homePath?: string;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
}): Promise<CodexAppServerSnapshot> {
  return await new Promise((resolve, reject) => {
    const child = spawn(input.binaryPath, ["app-server"], {
      env: {
        ...process.env,
        ...(input.homePath ? { CODEX_HOME: input.homePath } : {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    const output = readline.createInterface({ input: child.stdout });

    let completed = false;
    let accountSnapshot: CodexAccountSnapshot | undefined;
    let skills: ReadonlyArray<ServerProviderSkill> = [];
    const cwd = input.cwd ?? process.cwd();

    const cleanup = () => {
      output.removeAllListeners();
      output.close();
      child.removeAllListeners();
      if (!child.killed) {
        killCodexChildProcess(child);
      }
    };

    const finish = (callback: () => void) => {
      if (completed) return;
      completed = true;
      cleanup();
      callback();
    };

    const fail = (error: unknown) =>
      finish(() =>
        reject(
          error instanceof Error
            ? error
            : new Error(`Codex account probe failed: ${String(error)}.`),
        ),
      );

    if (input.signal?.aborted) {
      fail(new Error("Codex account probe aborted."));
      return;
    }
    input.signal?.addEventListener("abort", () => fail(new Error("Codex account probe aborted.")));

    const writeMessage = (message: unknown) => {
      if (!child.stdin.writable) {
        fail(new Error("Cannot write to codex app-server stdin."));
        return;
      }

      child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    output.on("line", (line) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        fail(new Error("Received invalid JSON from codex app-server during account probe."));
        return;
      }

      if (!parsed || typeof parsed !== "object") {
        return;
      }

      const response = parsed as JsonRpcProbeResponse;
      if (response.id === 3) {
        if (readErrorMessage(response)) {
          skills = [];
        } else {
          skills = parseCodexSkillList(response.result, cwd);
        }
        writeMessage({ id: 4, method: "model/list", params: {} });
        return;
      }

      if (response.id === 4) {
        const account = accountSnapshot;
        if (!account) {
          return;
        }

        if (readErrorMessage(response)) {
          finish(() => resolve({ account, models: [], skills }));
          return;
        }

        finish(() =>
          resolve({
            account,
            models: parseCodexModelList(response.result),
            skills,
          }),
        );
        return;
      }

      if (response.id === 1) {
        const errorMessage = readErrorMessage(response);
        if (errorMessage) {
          fail(new Error(`initialize failed: ${errorMessage}`));
          return;
        }

        writeMessage({ method: "initialized" });
        writeMessage({ id: 2, method: "account/read", params: {} });
        return;
      }

      if (response.id === 2) {
        const errorMessage = readErrorMessage(response);
        if (errorMessage) {
          fail(new Error(`account/read failed: ${errorMessage}`));
          return;
        }

        accountSnapshot = readCodexAccountSnapshot(response.result);
        writeMessage({ id: 3, method: "skills/list", params: { cwds: [cwd] } });
      }
    });

    child.once("error", fail);
    child.once("exit", (code, signal) => {
      if (completed) return;
      fail(
        new Error(
          `codex app-server exited before probe completed (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        ),
      );
    });

    writeMessage({
      id: 1,
      method: "initialize",
      params: buildCodexInitializeParams(
        input.clientVersion !== undefined ? { clientVersion: input.clientVersion } : undefined,
      ),
    });
  });
}
