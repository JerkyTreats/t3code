import { assert, describe, it } from "vite-plus/test";

import { evaluateDesktopSmokeResult } from "./smoke-test.mjs";

describe("desktop smoke result", () => {
  it("passes only when the observation window ends a healthy process", () => {
    assert.deepEqual(
      evaluateDesktopSmokeResult({ output: "ready", code: null, timedOut: true }),
      [],
    );
  });

  it("rejects early exits even with status zero", () => {
    assert.include(
      evaluateDesktopSmokeResult({ output: "", code: 0, timedOut: false }),
      "Desktop exited before the smoke observation window completed",
    );
  });

  it("rejects nonzero exits and fatal output", () => {
    const failures = evaluateDesktopSmokeResult({
      output: "Uncaught TypeError",
      code: 1,
      timedOut: false,
    });
    assert.include(failures, "Uncaught TypeError");
    assert.include(failures, "Desktop exited with status 1");
  });

  it("rejects a preload that Electron cannot evaluate", () => {
    const failures = evaluateDesktopSmokeResult({
      output: "Unable to load preload script: /app/preload.cjs",
      code: null,
      timedOut: true,
    });
    assert.include(failures, "Unable to load preload script");
  });
});
