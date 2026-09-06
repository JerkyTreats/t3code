import { decodeThreadAppActivationCompletion } from "./threadAppActivation.ts";
import { describe, expect, it } from "vite-plus/test";
import {
  decodeThreadAppActivation as decode,
  parseThreadAppActivation,
} from "./threadAppActivation.ts";
import cases from "../../contracts/test-fixtures/thread-app-activation.json" with { type: "json" };
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
  it("bounds the serialized envelope before JSON parsing", () => {
    const text = JSON.stringify(base);
    expect(parseThreadAppActivation(text)).toEqual(base);
    expect(parseThreadAppActivation(text + " ".repeat(64 * 1024 - text.length))).toEqual(base);
    expect(() => parseThreadAppActivation(text + " ".repeat(64 * 1024))).toThrow();
  });
});

it("completion decoder matches the identity-only schema", () => {
  expect(decodeThreadAppActivationCompletion(base)).toEqual(base);
  for (const entry of cases.filter((entry) => !entry.valid))
    expect(() => decodeThreadAppActivationCompletion(entry.value)).toThrow();
  expect(() => decodeThreadAppActivationCompletion({ ...base, draft: "" })).toThrow();
  expect(() => decodeThreadAppActivationCompletion({ ...base, ready: true })).toThrow();
});
