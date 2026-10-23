#!/usr/bin/env node
import * as NodeProcess from "node:process";

import { parseHarnessArguments, readHarnessConfig } from "./lib/staging-thread-harness-config.mjs";
import { runStagingThreadHarness } from "./lib/staging-thread-harness-runtime.mjs";

async function main() {
  const options = parseHarnessArguments(NodeProcess.argv.slice(2));
  const config = await readHarnessConfig(options.configPath);
  const result = await runStagingThreadHarness(config, options.outputDirectory);
  NodeProcess.stdout.write(
    `${JSON.stringify({ success: result.summary.success, stage: result.summary.stage })}\n`,
  );
  if (!result.summary.success) process.exitCode = 1;
}

main().catch(() => {
  NodeProcess.stderr.write("T3 Thread staging harness failed before evidence could be written.\n");
  process.exitCode = 1;
});
