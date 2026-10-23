import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import {
  SourceControlRepositoryLookupInput,
  SourceControlPublishRepositoryInput,
  SourceControlCloneRepositoryInput,
} from "./sourceControl.ts";

const decodeLookup = Schema.decodeUnknownSync(SourceControlRepositoryLookupInput);
const decodePublication = Schema.decodeUnknownSync(SourceControlPublishRepositoryInput);
const decodeClone = Schema.decodeUnknownSync(SourceControlCloneRepositoryInput);

describe("explicit provider endpoints", () => {
  it("requires an endpoint for lookup and publication", () => {
    expect(() =>
      decodeLookup({
        provider: "github",
        repository: "acme/web",
      }),
    ).toThrow();
    expect(() =>
      decodePublication({
        cwd: "/fixture",
        provider: "github",
        repository: "acme/web",
        visibility: "private",
      }),
    ).toThrow();
    expect(
      decodeLookup({
        provider: "github",
        providerBaseUrl: "https://git.example.test:8443",
        repository: "acme/web",
      }).providerBaseUrl,
    ).toBe("https://git.example.test:8443");
  });
  it("retains direct URL clone input without a provider endpoint", () => {
    expect(
      decodeClone({
        remoteUrl: "https://git.example.test/acme/web.git",
        destinationPath: "/fixture/web",
      }).remoteUrl,
    ).toBe("https://git.example.test/acme/web.git");
  });
});
