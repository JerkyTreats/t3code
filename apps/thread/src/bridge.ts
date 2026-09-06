export const THREAD_CLIENT_ACTIVATION_CHANNEL = "t3-thread:activation";
export const THREAD_CLIENT_ACTIVATION_COMPLETION_CHANNEL = "t3-thread:complete-activation";
export const THREAD_ENROLLMENT_SUBMISSION_CHANNEL = "t3-thread:submit-pairing-credential";

export type ThreadEnrollmentSubmissionResult =
  | { readonly status: "accepted" }
  | { readonly status: "rejected" }
  | { readonly status: "unavailable" };
