export type ProductStageLabel = "Alpha" | "Dev" | "Nightly";
export type ProductReleaseChannel = "latest" | "nightly";

export const PRODUCT_BASE_NAME = "T3 Code";
export const PRODUCT_PACKAGE_DESCRIPTION = "T3 Code desktop build";

export const PRODUCT_TECHNICAL_IDENTITY = {
  appId: "com.t3tools.t3code",
  developmentAppId: "com.t3tools.t3code.dev",
  linuxExecutableName: "t3code",
  linuxDesktopEntryName: "t3code.desktop",
  developmentLinuxDesktopEntryName: "t3code-dev.desktop",
  linuxWmClass: "t3code",
  developmentLinuxWmClass: "t3code-dev",
  userDataDirName: "t3code",
  developmentUserDataDirName: "t3code-dev",
  artifactNameTemplate: "T3-Code-${version}-${arch}.${ext}",
} as const;

export function formatProductDisplayName(stageLabel: ProductStageLabel): string {
  return `${PRODUCT_BASE_NAME} (${stageLabel})`;
}

export function resolveProductStageLabel(input: {
  readonly isDevelopment: boolean;
  readonly isNightly: boolean;
}): ProductStageLabel {
  if (input.isDevelopment) {
    return "Dev";
  }

  return input.isNightly ? "Nightly" : "Alpha";
}

export function formatStableReleaseName(version: string): string {
  return `${PRODUCT_BASE_NAME} v${version}`;
}

export function formatNightlyReleaseName(version: string, shortSha: string): string {
  return `${PRODUCT_BASE_NAME} Nightly ${version} (${shortSha})`;
}

export function resolveProductReleaseDescription(channel: ProductReleaseChannel): string {
  return channel === "nightly"
    ? `A new ${PRODUCT_BASE_NAME} prerelease is available for nightly testers.`
    : `A new ${PRODUCT_BASE_NAME} latest release is available.`;
}
