import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  ThreadAppActivation,
  ThreadAppReadyAck,
  ThreadAppActivationCompletion,
} from "./threadAppActivation.ts";
import cases from "../test-fixtures/thread-app-activation.json" with { type: "json" };
const decode = Schema.decodeUnknownSync(ThreadAppActivation);
const ack = Schema.decodeUnknownSync(ThreadAppReadyAck);
const base = { contractVersion: 1, launchId: "12345678-1234-4234-8234-123456789abc" };
describe("Thread activation executable admission", () => {
  for (const entry of cases)
    it(entry.name, () => {
      if (entry.valid) expect(decode(entry.value)).toEqual(entry.value);
      else expect(() => decode(entry.value)).toThrow();
    });
  it("uses UTF-8 bytes and preserves authored input at the limit", () => {
    const draft = "é".repeat(16 * 1024);
    expect(decode({ ...base, draft }).draft).toBe(draft);
    expect(() => decode({ ...base, draft: draft + "a" })).toThrow();
    expect(() => decode({ ...base, draft: undefined })).toThrow();
  });
  it("readiness acknowledges only a loaded launch", () => {
    expect(ack({ ...base, ready: true }).ready).toBe(true);
    expect(() => ack({ ...base, ready: true, authenticated: true })).toThrow();
  });
});

const complete = Schema.decodeUnknownSync(ThreadAppActivationCompletion);
it("completion carries only the admitted launch identity", () => {
  expect(complete(base)).toEqual(base);
  for (const entry of cases.filter((entry) => !entry.valid))
    expect(() => complete(entry.value)).toThrow();
  expect(() => complete({ ...base, draft: "text" })).toThrow();
  expect(() => complete({ ...base, ready: true })).toThrow();
});

it("bounds working directories by UTF-8 bytes without changing their text", () => {
  const workingDirectory = "/" + "é".repeat(2047) + "x";
  expect(decode({ ...base, workingDirectory }).workingDirectory).toBe(workingDirectory);
  expect(() => decode({ ...base, workingDirectory: workingDirectory + "x" })).toThrow();
  expect(() => decode({ ...base, workingDirectory: undefined })).toThrow();
});
