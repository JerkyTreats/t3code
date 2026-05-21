import { useMemo } from "react";
import { DEFAULT_MODEL_BY_PROVIDER, type ProviderKind } from "@t3tools/contracts";
import {
  DEFAULT_UNIFIED_SETTINGS,
  type UnifiedSettings,
  type ServerSettingsPatch,
} from "@t3tools/contracts/settings";
import { normalizeModelSlug } from "@t3tools/shared/model";
import { useSettings, useUpdateSettings } from "./hooks/useSettings";

type LegacyAppSettings = UnifiedSettings & {
  customCodexModels: string[];
  customClaudeModels: string[];
  codexBinaryPath: string;
  codexHomePath: string;
  claudeBinaryPath: string;
  textGenerationModel: string | null;
};

function toLegacySettings(settings: UnifiedSettings): LegacyAppSettings {
  return {
    ...settings,
    customCodexModels: [...settings.providers.codex.customModels],
    customClaudeModels: [...settings.providers.claudeAgent.customModels],
    codexBinaryPath: settings.providers.codex.binaryPath,
    codexHomePath: settings.providers.codex.homePath,
    claudeBinaryPath: settings.providers.claudeAgent.binaryPath,
    textGenerationModel: settings.textGenerationModelSelection.model,
  };
}

export function useAppSettings() {
  const settings = useSettings();
  const { updateSettings, resetSettings } = useUpdateSettings();

  return {
    settings: useMemo(() => toLegacySettings(settings), [settings]),
    defaults: toLegacySettings(DEFAULT_UNIFIED_SETTINGS),
    updateSettings: (patch: Partial<LegacyAppSettings>) => {
      const nextPatch: Record<string, unknown> = {};

      if ("enableAssistantStreaming" in patch) {
        nextPatch.enableAssistantStreaming = patch.enableAssistantStreaming;
      }
      if ("defaultThreadEnvMode" in patch) {
        nextPatch.defaultThreadEnvMode = patch.defaultThreadEnvMode;
      }
      if ("confirmThreadDelete" in patch) {
        nextPatch.confirmThreadDelete = patch.confirmThreadDelete;
      }
      if ("autoOpenPlanSidebar" in patch) {
        nextPatch.autoOpenPlanSidebar = patch.autoOpenPlanSidebar;
      }
      if ("diffWordWrap" in patch) {
        nextPatch.diffWordWrap = patch.diffWordWrap;
      }
      if ("diffIgnoreWhitespace" in patch) {
        nextPatch.diffIgnoreWhitespace = patch.diffIgnoreWhitespace;
      }
      if ("sidebarProjectSortOrder" in patch) {
        nextPatch.sidebarProjectSortOrder = patch.sidebarProjectSortOrder;
      }
      if ("sidebarThreadSortOrder" in patch) {
        nextPatch.sidebarThreadSortOrder = patch.sidebarThreadSortOrder;
      }
      if ("timestampFormat" in patch) {
        nextPatch.timestampFormat = patch.timestampFormat;
      }

      const providerPatch: Record<string, unknown> = {};

      if ("customCodexModels" in patch || "codexBinaryPath" in patch || "codexHomePath" in patch) {
        providerPatch.codex = {
          ...(patch.customCodexModels ? { customModels: patch.customCodexModels } : {}),
          ...(typeof patch.codexBinaryPath === "string"
            ? { binaryPath: patch.codexBinaryPath }
            : {}),
          ...(typeof patch.codexHomePath === "string" ? { homePath: patch.codexHomePath } : {}),
        };
      }

      if ("customClaudeModels" in patch || "claudeBinaryPath" in patch) {
        providerPatch.claudeAgent = {
          ...(patch.customClaudeModels ? { customModels: patch.customClaudeModels } : {}),
          ...(typeof patch.claudeBinaryPath === "string"
            ? { binaryPath: patch.claudeBinaryPath }
            : {}),
        };
      }

      if (typeof patch.textGenerationModel === "string" && patch.textGenerationModel.trim()) {
        nextPatch.textGenerationModelSelection = {
          ...settings.textGenerationModelSelection,
          model: patch.textGenerationModel,
        };
      }

      if (Object.keys(providerPatch).length > 0) {
        nextPatch.providers = providerPatch;
      }

      updateSettings(nextPatch as Partial<UnifiedSettings> & ServerSettingsPatch);
    },
    resetSettings,
  };
}

export function getCustomModelsByProvider(
  settings: LegacyAppSettings,
): Record<ProviderKind, string[]> {
  return {
    codex: settings.customCodexModels,
    claudeAgent: settings.customClaudeModels,
    cursor: [],
    opencode: [],
  };
}

export function getCustomModelOptionsByProvider(
  settings: LegacyAppSettings,
): Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>> {
  const buildOptions = (provider: ProviderKind, customModels: string[]) => {
    const defaultModel = DEFAULT_MODEL_BY_PROVIDER[provider];
    const seen = new Set<string>();
    const values = [defaultModel, ...customModels].flatMap((value) => {
      const normalized = normalizeModelSlug(value, provider);
      if (!normalized || seen.has(normalized)) {
        return [];
      }
      seen.add(normalized);
      return [{ slug: normalized, name: normalized }];
    });
    return values;
  };

  return {
    codex: buildOptions("codex", settings.customCodexModels),
    claudeAgent: buildOptions("claudeAgent", settings.customClaudeModels),
    cursor: [],
    opencode: [],
  };
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  customModelsByProvider: Record<ProviderKind, ReadonlyArray<string>>,
  selectedModel: string | null | undefined,
): string {
  const normalized = normalizeModelSlug(selectedModel, provider);
  if (!normalized) {
    return DEFAULT_MODEL_BY_PROVIDER[provider];
  }
  const customModels = customModelsByProvider[provider] ?? [];
  return customModels.includes(normalized) || normalized === DEFAULT_MODEL_BY_PROVIDER[provider]
    ? normalized
    : normalized;
}

export function getProviderStartOptions(settings: LegacyAppSettings) {
  const codex = {
    ...(settings.codexBinaryPath.trim().length > 0 ? { binaryPath: settings.codexBinaryPath } : {}),
    ...(settings.codexHomePath.trim().length > 0 ? { homePath: settings.codexHomePath } : {}),
  };
  const claudeAgent =
    settings.claudeBinaryPath.trim().length > 0 ? { binaryPath: settings.claudeBinaryPath } : {};

  if (Object.keys(codex).length === 0 && Object.keys(claudeAgent).length === 0) {
    return undefined;
  }

  return {
    ...(Object.keys(codex).length > 0 ? { codex } : {}),
    ...(Object.keys(claudeAgent).length > 0 ? { claudeAgent } : {}),
  };
}
