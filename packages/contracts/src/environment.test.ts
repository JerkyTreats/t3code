import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ExecutionEnvironmentDescriptor } from "./environment.ts";

const decodeDescriptor = Schema.decodeUnknownSync(ExecutionEnvironmentDescriptor);

describe("ExecutionEnvironmentDescriptor", () => {
  it("defaults settlement support off for legacy environments", () => {
    const descriptor = decodeDescriptor({
      environmentId: "environment-legacy",
      label: "Legacy",
      platform: {
        os: "linux",
        arch: "x64",
      },
      serverVersion: "0.0.29",
      capabilities: {
        repositoryIdentity: true,
      },
    });

    expect(descriptor.capabilities.threadSettlement).toBe(false);
  });
});
