#!/usr/bin/env node
import * as NodeProcess from "node:process";

import {
  parseThreadStartupHarnessArguments,
  runThreadStartupHarness,
} from "./lib/thread-startup-harness.mjs";

async function main() {
  const options = parseThreadStartupHarnessArguments(NodeProcess.argv.slice(2));
  const result = await runThreadStartupHarness(options);
  NodeProcess.stdout.write(
    `${JSON.stringify({
      success: result.summary.failedRuns === 0,
      runs: result.summary.successfulRuns,
      p50Ms: result.summary.total?.p50Ms ?? null,
      p95Ms: result.summary.total?.p95Ms ?? null,
      outputDirectory: result.outputDirectory,
    })}\n`,
  );
  if (result.summary.failedRuns > 0) process.exitCode = 1;
}

main().catch((cause) => {
  NodeProcess.stderr.write(
    `${cause instanceof Error ? cause.message : "T3 Thread startup harness failed."}\n`,
  );
  process.exitCode = 1;
});
