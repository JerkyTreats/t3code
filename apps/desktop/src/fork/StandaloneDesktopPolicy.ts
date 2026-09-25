import type { DesktopAppBranding } from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

export interface StandaloneDesktopInput {
  readonly platform: NodeJS.Platform;
  readonly isPackaged: boolean;
  readonly isDevelopment: boolean;
  readonly homeDirectory: string;
  readonly baseDir: string;
  readonly appDataDirectory: string;
  readonly path: Path.Path;
  readonly serverUrl: Option.Option<URL>;
  readonly legacyServerUrl: Option.Option<URL>;
  readonly displayName: Option.Option<string>;
  readonly xdgConfigHome: Option.Option<string>;
  readonly xdgDataHome: Option.Option<string>;
  readonly configuredBackendPort: Option.Option<number>;
  readonly disableAutoUpdate: boolean;
}

export interface StandaloneDesktopIdentity {
  readonly serverUrl: URL;
  readonly displayName: "T3 Code" | "T3 Code (Staging)";
  readonly linuxDesktopEntryName: string;
  readonly linuxWmClass: string;
}

const managedLinuxIdentities = {
  production: {
    displayName: "T3 Code",
    profile: "t3code-production",
    linuxDesktopEntryName: "t3code.desktop",
    linuxWmClass: "t3code",
  },
  staging: {
    displayName: "T3 Code (Staging)",
    profile: "t3code-staging",
    linuxDesktopEntryName: "t3code-staging.desktop",
    linuxWmClass: "t3code-staging",
  },
} as const;

export function resolveEarlyManagedLinuxIdentity(
  env: NodeJS.ProcessEnv,
  isDevelopment: boolean,
): Pick<StandaloneDesktopIdentity, "linuxDesktopEntryName" | "linuxWmClass"> | null {
  if (isDevelopment) return null;
  const channel = env.T3CODE_DESKTOP_CHANNEL?.trim();
  const identity =
    channel === "production"
      ? managedLinuxIdentities.production
      : channel === "staging"
        ? managedLinuxIdentities.staging
        : null;
  return identity !== null && env.T3CODE_DESKTOP_DISPLAY_NAME?.trim() === identity.displayName
    ? identity
    : null;
}

const invalidIdentity = () =>
  new Config.ConfigError(
    new Schema.SchemaError(
      new SchemaIssue.InvalidValue({
        message:
          "Standalone desktop requires a complete isolated packaged Linux identity and a credential-free HTTPS origin.",
      }),
    ),
  );

// This is the sole selection authority. A partial identity never falls back to a local server.
export const resolveStandaloneDesktopIdentity = Effect.fn("desktop.standalone.resolveIdentity")(
  function* (input: StandaloneDesktopInput) {
    if (
      Option.isNone(input.serverUrl) &&
      Option.isNone(input.legacyServerUrl) &&
      Option.isNone(input.displayName)
    ) {
      return Option.none<StandaloneDesktopIdentity>();
    }
    const url = Option.getOrNull(Option.orElse(input.serverUrl, () => input.legacyServerUrl));
    const displayName = Option.getOrNull(input.displayName);
    const identity =
      displayName === "T3 Code (Staging)"
        ? managedLinuxIdentities.staging
        : managedLinuxIdentities.production;
    const profile = identity.profile;
    const dataHome = Option.getOrElse(input.xdgDataHome, () =>
      input.path.join(input.homeDirectory, ".local", "share"),
    );
    if (
      (Option.isSome(input.serverUrl) && Option.isSome(input.legacyServerUrl)) ||
      (displayName !== "T3 Code" && displayName !== "T3 Code (Staging)") ||
      !input.isPackaged ||
      input.platform !== "linux" ||
      input.isDevelopment ||
      input.baseDir !== input.path.join(dataHome, profile, "state") ||
      !input.path.isAbsolute(dataHome) ||
      Option.isNone(input.xdgConfigHome) ||
      input.appDataDirectory !== input.xdgConfigHome.value ||
      input.path.resolve(input.appDataDirectory) !== input.appDataDirectory ||
      input.path.basename(input.appDataDirectory) !== profile ||
      Option.isSome(input.configuredBackendPort) ||
      !input.disableAutoUpdate ||
      url === null ||
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    )
      return yield* Effect.fail(invalidIdentity());
    return Option.some({
      serverUrl: url,
      displayName: identity.displayName,
      linuxDesktopEntryName: identity.linuxDesktopEntryName,
      linuxWmClass: identity.linuxWmClass,
    } satisfies StandaloneDesktopIdentity);
  },
);

export function isStandaloneDesktop(environment: {
  readonly standaloneServerUrl?: Option.Option<URL>;
}): boolean {
  return Option.isSome(environment.standaloneServerUrl ?? Option.none());
}

export function standaloneDesktopBranding(
  identity: StandaloneDesktopIdentity,
  fallback: DesktopAppBranding,
): DesktopAppBranding {
  return {
    ...fallback,
    displayName: identity.displayName,
    stageLabel: identity.displayName === "T3 Code (Staging)" ? "Staging" : fallback.stageLabel,
  };
}

export function resolveDesktopApplicationUrl(
  input: { readonly isDevelopment: boolean; readonly standaloneServerUrl?: Option.Option<URL> },
  localUrl: string,
): string {
  return Option.match(input.standaloneServerUrl ?? Option.none<URL>(), {
    onNone: () => localUrl,
    onSome: (url) => url.href,
  });
}
