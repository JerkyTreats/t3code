import { describe, expect, it, vi } from "vite-plus/test";

import {
  parseProcStat,
  processBelongsToLaunch,
  signalExactCapturedProcess,
  signalExactOwnedProcess,
} from "./staging-thread-harness-process.mjs";

function stat(pid, parentPid, group, startTicks) {
  const values = [
    "S",
    String(parentPid),
    String(group),
    String(group),
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    String(startTicks),
  ];
  return `${pid} (process with spaces) ${values.join(" ")}`;
}

describe("staging Thread process ownership", () => {
  it("parses proc stat with a parenthesized command", () => {
    expect(parseProcStat(stat(20, 10, 10, 999))).toMatchObject({
      pid: 20,
      parentPid: 10,
      group: 10,
      startTicks: "999",
    });
  });

  it("admits only an exact live launch group or ancestry", () => {
    const rows = [
      parseProcStat(stat(10, 1, 10, 100)),
      parseProcStat(stat(20, 10, 10, 200)),
      parseProcStat(stat(30, 1, 30, 300)),
    ];
    expect(
      processBelongsToLaunch({ pid: 20, startTicks: "200" }, { pid: 10, startTicks: "100" }, rows),
    ).toBe(true);
    expect(
      processBelongsToLaunch({ pid: 30, startTicks: "300" }, { pid: 10, startTicks: "100" }, rows),
    ).toBe(false);
    expect(
      processBelongsToLaunch(
        { pid: 20, startTicks: "stale" },
        { pid: 10, startTicks: "100" },
        rows,
      ),
    ).toBe(false);
  });

  it("signals only the exact identity after ownership is proven", () => {
    const files = new Map([
      ["/proc/10/stat", stat(10, 1, 10, 100)],
      ["/proc/20/stat", stat(20, 10, 10, 200)],
    ]);
    const fileSystem = { readFileSync: (path) => files.get(path) };
    const signal = vi.fn();
    expect(
      signalExactOwnedProcess(
        {
          target: { pid: 20, startTicks: "200" },
          launch: { pid: 10, startTicks: "100" },
          signal: "SIGKILL",
          rows: [...files.values()].map(parseProcStat),
        },
        { fileSystem, signal },
      ),
    ).toBe(true);
    expect(signal).toHaveBeenCalledWith(20, "SIGKILL");
    expect(() =>
      signalExactOwnedProcess(
        {
          target: { pid: 20, startTicks: "200" },
          launch: { pid: 30, startTicks: "300" },
          signal: "SIGKILL",
          rows: [...files.values()].map(parseProcStat),
        },
        { fileSystem, signal },
      ),
    ).toThrow("signal-target-not-owned");
  });

  it("signals a captured descendant after its launch leader exits", () => {
    const files = new Map([["/proc/20/stat", stat(20, 1, 10, 200)]]);
    const signal = vi.fn();
    expect(
      signalExactCapturedProcess(
        {
          target: { pid: 20, startTicks: "200" },
          captured: new Map([[20, "200"]]),
          signal: "SIGKILL",
        },
        { fileSystem: { readFileSync: (path) => files.get(path) }, signal },
      ),
    ).toBe(true);
    expect(signal).toHaveBeenCalledWith(20, "SIGKILL");
  });
});
