import { describe, expect, it, vi } from "vite-plus/test";
import { ComposerAttachmentAdmission } from "./composerAttachmentAdmission";

it("shares the eight-slot budget and transfers without a zero-count window", () => {
  const changed = vi.fn();
  const admission = new ComposerAttachmentAdmission(changed);
  admission.activate("environment:thread");
  const capture = admission.reserve("environment:thread", 6)!;
  const paste = admission.reserve("environment:thread", 6)!;
  expect(admission.reserve("environment:thread", 6)).toBeNull();
  expect(admission.transfer(capture)).toBe(true);
  expect(admission.transfer(capture)).toBe(false);
  expect(changed.mock.calls.map(([state]) => [state.pending])).toEqual([[1], [2]]);
  admission.release(capture);
  admission.release(capture);
  expect(admission.pending).toBe(1);
  admission.release(paste);
  expect(changed.mock.calls.map(([state]) => [state.pending])).toEqual([[1], [2], [1], [0]]);
});

describe("scoped destination lifecycle", () => {
  it("invalidates old tokens even when returning to the same scope", () => {
    const admission = new ComposerAttachmentAdmission();
    admission.activate("one:thread");
    const old = admission.reserve("one:thread", 0)!;
    admission.activate("two:thread");
    admission.activate("one:thread");
    const fresh = admission.reserve("one:thread", 0)!;
    expect(admission.isCurrent(old)).toBe(false);
    expect(admission.transfer(old)).toBe(false);
    admission.release(old);
    expect(admission.pending).toBe(1);
    expect(admission.isCurrent(fresh)).toBe(true);
    admission.dispose();
    expect(admission.pending).toBe(0);
    expect(admission.isCurrent(fresh)).toBe(false);
    expect(admission.reserve("one:thread", 0)).toBeNull();
  });
});

it("revalidates a live destination before native work and each late admission", async () => {
  const admission = new ComposerAttachmentAdmission();
  let scope = "first-project";
  admission.activate(scope, () => scope);
  let complete!: (file: File) => void;
  const capture = vi.fn(
    () =>
      new Promise<File>((resolve) => {
        complete = resolve;
      }),
  );
  const admit = vi.fn(async () => {});
  const reportError = vi.fn();
  const running = admission.captureScreenshot({ scope, occupied: 0, capture, admit, reportError });
  scope = "second-project";
  complete(new File(["png"], "capture.png"));
  await running;
  expect(admit).not.toHaveBeenCalled();
  expect(admission.pending).toBe(0);
  await admission.captureScreenshot({
    scope: "first-project",
    occupied: 0,
    capture,
    admit,
    reportError,
  });
  expect(capture).toHaveBeenCalledOnce();
  expect(reportError).not.toHaveBeenCalled();
});

it("keeps single flight after disposal until the native operation settles", async () => {
  const admission = new ComposerAttachmentAdmission();
  admission.activate("first");
  let complete!: (value: null) => void;
  const capture = vi.fn(
    () =>
      new Promise<null>((resolve) => {
        complete = resolve;
      }),
  );
  const admit = vi.fn(async () => {});
  const reportError = vi.fn();
  const running = admission.captureScreenshot({
    scope: "first",
    occupied: 0,
    capture,
    admit,
    reportError,
  });
  admission.activate("second");
  expect(admission.pending).toBe(0);
  await admission.captureScreenshot({ scope: "second", occupied: 0, capture, admit, reportError });
  expect(capture).toHaveBeenCalledOnce();
  complete(null);
  await running;
  capture.mockResolvedValue(null);
  await admission.captureScreenshot({ scope: "second", occupied: 0, capture, admit, reportError });
  expect(capture).toHaveBeenCalledTimes(2);
});
