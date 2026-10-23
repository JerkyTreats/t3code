import type { MermaidConfig, RenderResult } from "mermaid";

import {
  getDefaultMermaidThemeSnapshot,
  normalizeMermaidThemePalette,
  type MermaidAppearance,
  type MermaidThemePalette,
} from "./mermaidTheme";

export const MERMAID_CONFIG_REVISION = 2;
export const MAX_SERIALIZED_MERMAID_WORK = 32;

type MermaidLibrary = Pick<typeof import("mermaid").default, "initialize" | "render">;

export interface MermaidRenderRequest {
  readonly id: string;
  readonly code: string;
  readonly theme: MermaidAppearance;
  readonly palette: MermaidThemePalette;
}

export type MermaidLibraryLoader = () => Promise<MermaidLibrary>;

export function createRetryableMermaidLibraryLoader(
  importLibrary: () => Promise<{ readonly default: MermaidLibrary }>,
): MermaidLibraryLoader {
  let importPromise: Promise<MermaidLibrary> | null = null;
  return () => {
    importPromise ??= importLibrary()
      .then((module) => module.default)
      .catch((error: unknown) => {
        importPromise = null;
        throw error;
      });
    return importPromise;
  };
}

const loadMermaid = createRetryableMermaidLibraryLoader(() => import("mermaid"));

export function createMermaidConfig(
  theme: MermaidAppearance,
  palette: MermaidThemePalette = getDefaultMermaidThemeSnapshot(theme).palette,
): MermaidConfig {
  const normalizedPalette = normalizeMermaidThemePalette(palette, theme);
  return {
    startOnLoad: false,
    securityLevel: "strict",
    secure: ["securityLevel", "startOnLoad", "maxTextSize", "suppressErrorRendering"],
    suppressErrorRendering: true,
    theme: "base",
    look: "neo",
    htmlLabels: false,
    fontFamily: normalizedPalette.fontFamily,
    themeVariables: {
      background: normalizedPalette.background,
      mainBkg: normalizedPalette.surface,
      primaryColor: normalizedPalette.surfaceRaised,
      primaryBorderColor: normalizedPalette.border,
      primaryTextColor: normalizedPalette.foreground,
      secondaryColor: normalizedPalette.accentSurface,
      secondaryBorderColor: normalizedPalette.accent,
      secondaryTextColor: normalizedPalette.accentSurfaceForeground,
      tertiaryColor: normalizedPalette.muted,
      tertiaryBorderColor: normalizedPalette.border,
      tertiaryTextColor: normalizedPalette.mutedForeground,
      lineColor: normalizedPalette.mutedForeground,
      textColor: normalizedPalette.foreground,
      titleColor: normalizedPalette.foreground,
      nodeTextColor: normalizedPalette.foreground,
      edgeLabelBackground: normalizedPalette.background,
      clusterBkg: normalizedPalette.surface,
      clusterBorder: normalizedPalette.border,
      noteBkgColor: normalizedPalette.warningSurface,
      noteTextColor: normalizedPalette.warningForeground,
      noteBorderColor: normalizedPalette.warning,
    },
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
    },
    sequence: {
      useMaxWidth: true,
    },
    gantt: {
      useMaxWidth: true,
    },
    journey: {
      useMaxWidth: true,
    },
    timeline: {
      useMaxWidth: true,
    },
    mindmap: {
      useMaxWidth: true,
    },
  };
}

export function createSerializedMermaidRenderer(
  loadLibrary: MermaidLibraryLoader,
): (request: MermaidRenderRequest) => Promise<RenderResult> {
  // Mermaid configuration is global, so initialization and render must share
  // one failure-safe queue across every surface and effective palette.
  let settledTail: Promise<void> = Promise.resolve();
  let admittedWork = 0;

  return (request) => {
    if (admittedWork >= MAX_SERIALIZED_MERMAID_WORK) {
      return Promise.reject(new Error("Mermaid serialized work limit reached."));
    }
    admittedWork += 1;
    const immutableRequest = {
      ...request,
      palette: Object.freeze(normalizeMermaidThemePalette(request.palette, request.theme)),
    };
    const render = settledTail.then(async () => {
      const mermaid = await loadLibrary();
      mermaid.initialize(createMermaidConfig(immutableRequest.theme, immutableRequest.palette));
      return mermaid.render(immutableRequest.id, immutableRequest.code);
    });
    settledTail = render.then(
      () => undefined,
      () => undefined,
    );
    return render.finally(() => {
      admittedWork -= 1;
    });
  };
}

export const renderMermaidDiagram = createSerializedMermaidRenderer(loadMermaid);
