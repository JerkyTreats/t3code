import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  createMetricTimeline,
  sanitizeFailure,
  writeEvidence,
} from "./staging-thread-harness-evidence.mjs";

const roots = [];
afterEach(async () =>
  Promise.all(roots.splice(0).map((root) => NodeFSP.rm(root, { recursive: true, force: true }))),
);

describe("staging Thread evidence", () => {
  it("keeps launcher ACK distinct from connected and usable readiness", () => {
    let time = 0;
    const timeline = createMetricTimeline(() => time);
    time = 20;
    timeline.mark("window");
    time = 30;
    timeline.mark("ack");
    expect(timeline.has("connected")).toBe(false);
    time = 80;
    timeline.mark("connected");
    expect(timeline.has("usable")).toBe(false);
    time = 120;
    timeline.mark("usable");
    expect(
      timeline.publicResult({
        windowMs: 25,
        ackMs: 25,
        connectedMs: 100,
        usableMs: 100,
        inputMs: 100,
      }),
    ).toEqual({
      window: { elapsedMs: 20, thresholdMs: 25, withinBudget: true },
      ack: { elapsedMs: 30, thresholdMs: 25, withinBudget: false },
      connected: { elapsedMs: 80, thresholdMs: 100, withinBudget: true },
      usable: { elapsedMs: 120, thresholdMs: 100, withinBudget: false },
    });
  });

  it("maps arbitrary errors to bounded public failure output", async () => {
    const secret = "credential-and-private-origin";
    const failure = sanitizeFailure("pairing", new Error(secret));
    expect(JSON.stringify(failure)).not.toContain(secret);
    expect(failure).toMatchObject({ stage: "pairing", code: "bounded-runtime-failure" });
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "thread-harness-evidence-"));
    roots.push(root);
    await writeEvidence(root, { success: false, failure }, { success: false, stage: "pairing" });
    expect(JSON.parse(await NodeFSP.readFile(NodePath.join(root, "summary.json"), "utf8"))).toEqual(
      { success: false, failure },
    );
    expect((await NodeFSP.stat(NodePath.join(root, "diagnostics.json"))).mode & 0o777).toBe(0o600);
  });
});
