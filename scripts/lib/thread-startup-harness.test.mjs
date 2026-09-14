import { expect, it } from "vite-plus/test";

import {
  createStartupTraceParser,
  parseGraphicalEnvironment,
  parseThreadStartupHarnessArguments,
  processBelongsToStartupLaunch,
  startupDesktopActionArguments,
  summarizeStartupRuns,
  validateStartupEvent,
} from "./thread-startup-harness.mjs";

function event(name, atMs, source = "electron") {
  return { contractVersion: 1, source, name, atMs };
}

it("parses split trace lines and rejects unknown payloads", () => {
  const events = [];
  const parser = createStartupTraceParser((value) => events.push(value));
  const line = `${JSON.stringify(event("electron.ready", 123))}\n`;
  parser.push(line.slice(0, 10));
  parser.push(line.slice(10));
  parser.finish();
  expect(events).toEqual([event("electron.ready", 123)]);
  expect(() => validateStartupEvent(event("renderer.private-value", 124, "renderer"))).toThrow(
    "trace-invalid",
  );
});

it("imports only graphical session variables from the user manager", () => {
  expect(
    parseGraphicalEnvironment(
      "DISPLAY=:0\nWAYLAND_DISPLAY=wayland-1\nDBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus\nHYPRLAND_INSTANCE_SIGNATURE=sig\nXDG_RUNTIME_DIR=/run/user/1000\nPRIVATE_TOKEN=secret\n",
    ),
  ).toEqual({
    DISPLAY: ":0",
    WAYLAND_DISPLAY: "wayland-1",
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
    HYPRLAND_INSTANCE_SIGNATURE: "sig",
    XDG_RUNTIME_DIR: "/run/user/1000",
  });
});

it("summarizes total latency and ranks contiguous component costs", () => {
  const names = [
    "harness.started",
    "launcher.started",
    "launcher.activation-read",
    "launcher.spawn-started",
    "launcher.release-verified",
    "launcher.child-spawned",
    "electron.module-evaluated",
    "electron.activation-read",
    "electron.ready",
    "electron.window-created",
    "electron.load-started",
    "renderer.preload-evaluated",
    "renderer.dom-content-loaded",
    "electron.dom-ready",
    "electron.load-finished",
    "electron.activation-sent",
    "renderer.activation-received",
    "renderer.composer-mounted",
    "renderer.composer-editable",
    "renderer.composer-enabled",
    "renderer.composer-prepared",
    "renderer.composer-visible",
    "renderer.composer-inputable",
  ];
  const run = (scale) => ({
    success: true,
    events: names.map((name, index) =>
      event(name, 1_000 + index * scale, name.startsWith("renderer.") ? "renderer" : "electron"),
    ),
  });
  const summary = summarizeStartupRuns([run(10), run(20), { success: false, events: [] }]);
  expect(summary).toMatchObject({ requestedRuns: 3, successfulRuns: 2, failedRuns: 1 });
  expect(summary.total).toMatchObject({ samples: 2, p50Ms: 220, p95Ms: 440 });
  expect(summary.segments).toHaveLength(names.length - 1);
});

it("accepts installed defaults or one explicit artifact and origin pair", () => {
  expect(parseThreadStartupHarnessArguments([])).toEqual({
    runs: 5,
    timeoutMs: 15000,
    channel: "production",
  });
  expect(
    parseThreadStartupHarnessArguments([
      "--artifact",
      "/tmp/T3-Thread.AppImage",
      "--server-url",
      "https://example.test",
      "--runs",
      "3",
      "--workspace",
      "4",
    ]),
  ).toMatchObject({ runs: 3, artifactPath: "/tmp/T3-Thread.AppImage", workspace: 4 });
  expect(() => parseThreadStartupHarnessArguments(["--artifact", "/tmp/app"])).toThrow(
    "supplied together",
  );
});

it("builds bounded Hyprland workspace isolation actions", () => {
  expect(startupDesktopActionArguments("move", { workspace: 4, address: "0xab12" })).toEqual([
    "dispatch",
    'hl.dsp.window.move({workspace="4",window="address:0xab12",follow=false})',
  ]);
  expect(() =>
    startupDesktopActionArguments("move", { workspace: 4, address: '0xab12"});danger()' }),
  ).toThrow("workspace-isolation-failed");
  expect(() => parseThreadStartupHarnessArguments(["--workspace", "0"])).toThrow(
    "Workspace must be",
  );
});

it("accepts only a compositor process owned by the exact launch tree", () => {
  const parents = new Map([
    [30, 20],
    [20, 10],
    [40, 1],
  ]);
  const stat = (pid) => `${pid} (T3 Thread worker) S ${parents.get(pid) ?? 1} 0 0 0`;
  expect(processBelongsToStartupLaunch(30, 10, stat)).toBe(true);
  expect(processBelongsToStartupLaunch(40, 10, stat)).toBe(false);
  expect(processBelongsToStartupLaunch(30, 11, stat)).toBe(false);
});
