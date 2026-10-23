// @effect-diagnostics nodeBuiltinImport:off -- This test owns disposable file descriptor fixtures.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { expect, it } from "vite-plus/test";

import { isThreadRendererStartupMark, ThreadStartupTraceChannel } from "./startupTrace.ts";

it("writes bounded first-occurrence marks only when tracing is enabled", () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "thread-startup-trace-"));
  const output = NodePath.join(root, "trace.ndjson");
  const fd = NodeFS.openSync(output, "w");
  try {
    const channel = new ThreadStartupTraceChannel({ T3_THREAD_STARTUP_TRACE: "1" }, fd);
    channel.mark("electron", "electron.ready");
    channel.mark("electron", "electron.ready");
    channel.mark("renderer", "renderer.composer-inputable");
    channel.close();
    const events = NodeFS.readFileSync(output, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.map((event) => [event.source, event.name])).toEqual([
      ["electron", "electron.ready"],
      ["renderer", "renderer.composer-inputable"],
    ]);
    expect(
      events.every((event) => event.contractVersion === 1 && Number.isFinite(event.atMs)),
    ).toBe(true);
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

it("accepts only the fixed renderer milestone vocabulary", () => {
  expect(isThreadRendererStartupMark("renderer.composer-inputable")).toBe(true);
  expect(isThreadRendererStartupMark("renderer.secret-value")).toBe(false);
  expect(isThreadRendererStartupMark({ name: "renderer.composer-inputable" })).toBe(false);
});
