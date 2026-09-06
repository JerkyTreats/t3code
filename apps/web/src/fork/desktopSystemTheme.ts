import {
  DesktopSystemThemeSchema,
  type DesktopBridge,
  type DesktopSystemTheme,
  type DesktopTheme,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { projectOmarchySystemTheme } from "./omarchySystemTheme";

type LocalThemeBridge = Pick<DesktopBridge, "getSystemTheme" | "onSystemTheme">;
const isTheme = Schema.is(DesktopSystemThemeSchema);

/** A local source controls system appearance only after its palette is usable. */
export function localSystemDark(theme: DesktopSystemTheme | null, fallback: boolean): boolean {
  return theme ? theme.mode === "dark" : fallback;
}

export function localDesktopTheme(
  theme: DesktopSystemTheme | null,
  requested: DesktopTheme,
): DesktopTheme {
  return requested === "system" && theme ? theme.mode : requested;
}

/** Owns initial/change ordering and disposal for one shared useTheme subscription. */
export function observeDesktopSystemTheme(
  bridge: LocalThemeBridge | undefined,
  onChange: (theme: DesktopSystemTheme | null) => void,
): () => void {
  if (!bridge?.getSystemTheme || !bridge.onSystemTheme) return () => {};
  let active = true;
  let eventVersion = 0;
  let signature: string | null = null;
  const publish = (value: unknown): void => {
    if (!active) return;
    if (
      value !== null &&
      (!isTheme(value) ||
        projectOmarchySystemTheme({
          theme: value,
          appearanceMode: "system",
          themePreference: "system",
          themeHalves: null,
        }) === null)
    )
      return;
    const next =
      value === null
        ? null
        : JSON.stringify([
            value.name,
            value.mode,
            Object.entries(value.colors).sort(([a], [b]) => a.localeCompare(b)),
          ]);
    if (next === signature) return;
    signature = next;
    onChange(value);
  };
  const initialVersion = eventVersion;
  let stop: () => void;
  try {
    // Subscribe before the initial fetch: a push wins even if that fetch resolves later.
    stop = bridge.onSystemTheme((value) => {
      eventVersion += 1;
      publish(value);
    });
  } catch {
    return () => {};
  }
  void Promise.resolve()
    .then(() => (active ? bridge.getSystemTheme!() : null))
    .then(
      (value) => {
        if (active && eventVersion === initialVersion) publish(value);
      },
      () => {
        if (active && eventVersion === initialVersion) publish(null);
      },
    );
  return () => {
    if (!active) return;
    active = false;
    try {
      stop();
    } catch {
      // A failed optional bridge teardown must not retain local palette state.
    }
    if (signature !== null) onChange(null);
  };
}
