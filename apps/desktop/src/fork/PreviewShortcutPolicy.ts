import type { DesktopPreviewBrowserAction } from "@t3tools/contracts";

/** Exact platform chords are fork policy; the guest host only contains and routes their effects. */
const PREVIEW_BROWSER_SHORTCUTS: ReadonlyArray<{
  readonly action: DesktopPreviewBrowserAction;
  readonly key: string;
  readonly shift: boolean;
}> = Object.freeze([
  { action: "preview.new", key: "t", shift: false },
  { action: "preview.close", key: "w", shift: false },
  { action: "preview.reopenClosed", key: "t", shift: true },
  { action: "preview.focusUrl", key: "l", shift: false },
]);

export const isPreviewRefreshShortcut = (
  input: Electron.Input,
  platform: NodeJS.Platform,
): boolean =>
  input.type === "keyDown" &&
  input.key.toLowerCase() === "r" &&
  input.meta === (platform === "darwin") &&
  input.control === (platform !== "darwin") &&
  !input.shift &&
  !input.alt;

export const previewBrowserActionForShortcut = (
  input: Electron.Input,
  platform: NodeJS.Platform,
): DesktopPreviewBrowserAction | null => {
  if (input.type !== "keyDown" || input.alt) return null;
  const useMeta = platform === "darwin";
  if (input.meta !== useMeta || input.control === useMeta) return null;
  return (
    PREVIEW_BROWSER_SHORTCUTS.find(
      (shortcut) => shortcut.key === input.key.toLowerCase() && shortcut.shift === input.shift,
    )?.action ?? null
  );
};
