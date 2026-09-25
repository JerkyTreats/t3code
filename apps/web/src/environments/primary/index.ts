export {
  getPrimaryKnownEnvironment,
  resetPrimaryEnvironmentDescriptorForTests,
  resolveInitialPrimaryEnvironmentDescriptor,
  writePrimaryEnvironmentDescriptor,
} from "./context";

export {
  resolveInitialPrimaryEnvironmentDescriptor as ensurePrimaryEnvironmentReady,
  writePrimaryEnvironmentDescriptor as updatePrimaryEnvironmentDescriptor,
} from "./context";

export {
  fetchSessionState,
  isPrimaryEnvironmentPairingCredentialRejectedError,
  peekPairingTokenFromUrl,
  PrimaryEnvironmentPairingCredentialRejectedError,
  PrimaryEnvironmentRequestError,
  resolveInitialServerAuthGateState,
  stripPairingTokenFromUrl,
  submitServerAuthCredential,
  takePairingTokenFromUrl,
  __resetServerAuthBootstrapForTests,
} from "./auth";

export { usePrimarySessionState } from "./sessionState";

export {
  DesktopEnvironmentBootstrapIncompleteError,
  isDesktopEnvironmentBootstrapIncompleteError,
  isPrimaryEnvironmentProtocolUnsupportedError,
  isPrimaryEnvironmentUrlInvalidError,
  PrimaryEnvironmentProtocolUnsupportedError,
  PrimaryEnvironmentUrlInvalidError,
  readPrimaryEnvironmentTarget,
  resolvePrimaryEnvironmentHttpUrl,
  isLoopbackHostname,
  type PrimaryEnvironmentTarget,
} from "./target";
