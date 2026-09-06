import * as Schema from "effect/Schema";

import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const DesktopLauncherContractVersion = Schema.Literal(1);
export type DesktopLauncherContractVersion = typeof DesktopLauncherContractVersion.Type;

const DesktopLauncherArtifactSha256 = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));
const DesktopLauncherCommitHash = Schema.String.check(Schema.isPattern(/^[0-9a-f]{7,40}$/));
const DesktopLauncherBootId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
);
const DesktopLauncherHandoffToken = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));
const DesktopLauncherProductAppId = TrimmedNonEmptyString.check(Schema.isMaxLength(255));
const DesktopLauncherUserServiceName = TrimmedNonEmptyString.check(Schema.isMaxLength(255));
const DesktopLauncherLinuxWmClass = TrimmedNonEmptyString.check(Schema.isMaxLength(255));
const DesktopLauncherArtifactPath = TrimmedNonEmptyString.check(Schema.isMaxLength(4_096));
const DesktopLauncherVersion = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
const DesktopLauncherGeneration = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
export const DESKTOP_LAUNCHER_WORKSPACE_MAX_CHARS = 4_096;
export const DESKTOP_LAUNCHER_PROMPT_MAX_CHARS = 65_536;
const DesktopLauncherActivationId = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
);
const DesktopLauncherWorkspace = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(DESKTOP_LAUNCHER_WORKSPACE_MAX_CHARS),
  Schema.isPattern(/^\//u),
  Schema.makeFilter((workspace) => !workspace.includes("\0") || "Workspace must not contain NUL."),
);
const DesktopLauncherPrompt = Schema.String.check(
  Schema.isNonEmpty(),
  Schema.isMaxLength(DESKTOP_LAUNCHER_PROMPT_MAX_CHARS),
  Schema.makeFilter((prompt) => !prompt.includes("\0") || "Prompt must not contain NUL."),
);

export const DesktopLauncherActivationRequest = Schema.Struct({
  contractVersion: DesktopLauncherContractVersion,
  workspace: DesktopLauncherWorkspace,
  action: Schema.Literals(["open", "submit"]),
  prompt: Schema.optionalKey(DesktopLauncherPrompt),
})
  .check(
    Schema.makeFilter(
      (activation) =>
        activation.action !== "submit" ||
        activation.prompt !== undefined ||
        "Submit activation requires a prompt.",
    ),
  )
  .annotate({ parseOptions: { onExcessProperty: "error" } });
export type DesktopLauncherActivationRequest = typeof DesktopLauncherActivationRequest.Type;

export const DesktopLauncherActivation = Schema.Struct({
  activationId: DesktopLauncherActivationId,
  contractVersion: DesktopLauncherContractVersion,
  workspace: DesktopLauncherWorkspace,
  action: Schema.Literals(["open", "submit"]),
  prompt: Schema.optionalKey(DesktopLauncherPrompt),
})
  .check(
    Schema.makeFilter(
      (activation) =>
        activation.action !== "submit" ||
        activation.prompt !== undefined ||
        "Submit activation requires a prompt.",
    ),
  )
  .annotate({ parseOptions: { onExcessProperty: "error" } });
export type DesktopLauncherActivation = typeof DesktopLauncherActivation.Type;

export const DesktopLauncherActivationCompletion = Schema.Struct({
  activationId: DesktopLauncherActivationId,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type DesktopLauncherActivationCompletion = typeof DesktopLauncherActivationCompletion.Type;

export const DesktopLauncherArtifactManifest = Schema.Struct({
  contractVersion: DesktopLauncherContractVersion,
  productAppId: DesktopLauncherProductAppId,
  userServiceName: DesktopLauncherUserServiceName,
  linuxWmClass: DesktopLauncherLinuxWmClass,
  artifactPath: DesktopLauncherArtifactPath,
  artifactSha256: DesktopLauncherArtifactSha256,
  version: DesktopLauncherVersion,
  commitHash: DesktopLauncherCommitHash,
  architecture: Schema.Literals(["x64", "arm64"]),
});
export type DesktopLauncherArtifactManifest = typeof DesktopLauncherArtifactManifest.Type;

export const DesktopLauncherReadiness = Schema.Struct({
  contractVersion: DesktopLauncherContractVersion,
  productAppId: DesktopLauncherProductAppId,
  generation: DesktopLauncherGeneration,
  artifactSha256: DesktopLauncherArtifactSha256,
  version: DesktopLauncherVersion,
  commitHash: DesktopLauncherCommitHash,
  desktopMainPid: PositiveInt,
  bootId: DesktopLauncherBootId,
  desktopMainProcessStartTicks: PositiveInt,
  backendReady: Schema.Literal(true),
  rendererReady: Schema.Literal(true),
});
export type DesktopLauncherReadiness = typeof DesktopLauncherReadiness.Type;

export const DesktopLauncherHandoffRequest = Schema.Struct({
  contractVersion: DesktopLauncherContractVersion,
  productAppId: DesktopLauncherProductAppId,
  generation: DesktopLauncherGeneration,
  token: DesktopLauncherHandoffToken,
  artifactSha256: DesktopLauncherArtifactSha256,
  requesterPid: PositiveInt,
  requesterBootId: DesktopLauncherBootId,
  requesterStartTicks: PositiveInt,
  activation: Schema.optionalKey(DesktopLauncherActivation),
});
export type DesktopLauncherHandoffRequest = typeof DesktopLauncherHandoffRequest.Type;

export const DesktopLauncherHandoffAck = Schema.Struct({
  contractVersion: DesktopLauncherContractVersion,
  productAppId: DesktopLauncherProductAppId,
  generation: DesktopLauncherGeneration,
  token: DesktopLauncherHandoffToken,
  primaryPid: PositiveInt,
  primaryBootId: DesktopLauncherBootId,
  primaryStartTicks: PositiveInt,
  accepted: Schema.Literal(true),
});
export type DesktopLauncherHandoffAck = typeof DesktopLauncherHandoffAck.Type;
