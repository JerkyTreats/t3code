import { VoiceReplyTracker } from "@t3tools/client-runtime/voice-output";

export const mobileVoiceReplies = new VoiceReplyTracker();
type Submission = {
  readonly environmentId: string;
  readonly threadId: string;
  readonly messageId: string;
  readonly createdAt: string;
};
const localSubmissions = new Map<string, Submission>();
const submissionKey = (input: Pick<Submission, "environmentId" | "threadId" | "messageId">) =>
  JSON.stringify([input.environmentId, input.threadId, input.messageId]);

// Outbox persistence survives app restarts. Auto-play eligibility deliberately
// does not, and leaving a thread removes eligibility even before dispatch.
export function markLocalVoiceSubmission(input: Submission) {
  localSubmissions.set(submissionKey(input), input);
}

export function registerQueuedVoiceSubmission(input: Submission) {
  if (localSubmissions.has(submissionKey(input))) mobileVoiceReplies.register(input);
}

export function finishLocalVoiceSubmission(input: Submission) {
  localSubmissions.delete(submissionKey(input));
}

export async function prepareQueuedVoiceSubmission(
  input: {
    readonly submission: Submission;
    readonly responseStyle: "voice" | "text";
    readonly destination: "current-thread" | "background-creation";
  },
  stopPlayback: () => Promise<void> = stopMobileVoicePlayback,
) {
  // Arm before shutdown yields so leaving or disabling voice during shutdown
  // remains terminal. Offline creations navigate away from their future thread
  // and retain the response style without becoming eligible for auto-play.
  if (input.responseStyle === "voice" && input.destination === "current-thread") {
    markLocalVoiceSubmission(input.submission);
  } else {
    finishLocalVoiceSubmission(input.submission);
  }
  try {
    await stopPlayback();
  } catch (error) {
    finishLocalVoiceSubmission(input.submission);
    throw error;
  }
  return input.responseStyle;
}

export function clearMobileVoiceThread(environmentId: string, threadId: string) {
  mobileVoiceReplies.clearThread(environmentId, threadId);
  for (const [key, input] of localSubmissions) {
    if (input.environmentId === environmentId && input.threadId === threadId)
      localSubmissions.delete(key);
  }
}

export function clearMobileVoiceReplies() {
  mobileVoiceReplies.clear();
  localSubmissions.clear();
}

let stopCurrent: (() => Promise<void>) | null = null;
let releasing = Promise.resolve();

export function ownVoicePlayback(stop: () => Promise<void>) {
  stopCurrent = stop;
  return () => {
    if (stopCurrent === stop) {
      releasing = stop().catch(() => undefined);
      stopCurrent = null;
    }
  };
}

export async function stopMobileVoicePlayback() {
  await stopCurrent?.();
  await releasing;
}
