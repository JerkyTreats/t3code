import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";

export const FAILURE_STAGES = new Set([
  "config",
  "inputs",
  "desktop-preflight",
  "protected-baseline",
  "server-probe",
  "fresh-launch",
  "pairing",
  "crash-launch",
  "project-launch",
  "concurrency",
  "native-input",
  "graceful-close",
  "crash-isolation",
  "cleanup",
]);

export function sha256Text(value) {
  return NodeCrypto.createHash("sha256").update(value).digest("hex");
}

export function createMetricTimeline(now = () => performance.now()) {
  const started = now();
  const marks = new Map([["spawn", started]]);
  return {
    mark(name) {
      if (marks.has(name)) throw new Error("metric-mark-duplicate");
      const value = now();
      const prior = [...marks.values()].at(-1);
      if (value < prior) throw new Error("metric-clock-not-monotonic");
      marks.set(name, value);
    },
    elapsed(name) {
      if (!marks.has(name)) throw new Error("metric-mark-missing");
      return Math.round(marks.get(name) - started);
    },
    has(name) {
      return marks.has(name);
    },
    publicResult(thresholds) {
      const mapping = {
        window: "windowMs",
        ack: "ackMs",
        connected: "connectedMs",
        usable: "usableMs",
        input: "inputMs",
        close: "closeMs",
        crash: "crashMs",
      };
      return Object.fromEntries(
        Object.entries(mapping)
          .filter(([mark]) => marks.has(mark))
          .map(([mark, key]) => {
            const elapsedMs = Math.round(marks.get(mark) - started);
            return [
              mark,
              {
                elapsedMs,
                thresholdMs: thresholds[key],
                withinBudget: elapsedMs <= thresholds[key],
              },
            ];
          }),
      );
    },
  };
}

export function sanitizeFailure(stage, cause) {
  const boundedStage = FAILURE_STAGES.has(stage) ? stage : "inputs";
  const known = new Set([
    "artifact-verification-failed",
    "cdp-unavailable",
    "desktop-locked",
    "desktop-lock-state-unavailable",
    "cleanup-deadline-exceeded",
    "core-code-draft-unobserved",
    "composer-mismatch",
    "core-code-not-usable",
    "database-observation-failed",
    "native-focus-failed",
    "no-send-frame-observed",
    "pairing-required",
    "primary-session-not-authenticated",
    "primary-websocket-not-connected",
    "project-scope-mismatch",
    "protected-process-changed",
    "protected-service-changed",
    "server-probe-failed",
    "signal-target-not-owned",
    "window-identity-mismatch",
  ]);
  return {
    stage: boundedStage,
    code: known.has(cause?.message) ? cause.message : "bounded-runtime-failure",
    message: "A bounded harness assertion failed. Inspect the private diagnostics file.",
  };
}

export async function writeEvidence(outputDirectory, summary, diagnostics) {
  const publicPath = `${outputDirectory}/summary.json`;
  const privatePath = `${outputDirectory}/diagnostics.json`;
  await NodeFSP.writeFile(publicPath, `${JSON.stringify(summary, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await NodeFSP.writeFile(privatePath, `${JSON.stringify(diagnostics, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await Promise.all([NodeFSP.chmod(publicPath, 0o600), NodeFSP.chmod(privatePath, 0o600)]);
  return { publicPath, privatePath };
}
