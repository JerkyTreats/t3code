import { describe, expect, it } from "vite-plus/test";

import { parseCliArgs, tokenizeCliArgs } from "./cliArgs.ts";

describe("tokenizeCliArgs", () => {
  it("preserves quoted values and escaped spaces", () => {
    expect(
      tokenizeCliArgs(
        String.raw`--config model="gpt 5" --enable foo\ bar --config=profile='work profile'`,
      ),
    ).toEqual(["--config", "model=gpt 5", "--enable", "foo bar", "--config=profile=work profile"]);
  });

  it("preserves literal backslashes in path values", () => {
    expect(
      tokenizeCliArgs(String.raw`--config cacheDir=C:\Users\me --config "quoted=C:\Users\me"`),
    ).toEqual([
      "--config",
      String.raw`cacheDir=C:\Users\me`,
      "--config",
      String.raw`quoted=C:\Users\me`,
    ]);
  });
});

describe("parseCliArgs", () => {
  it("returns empty result for empty string", () => {
    expect(parseCliArgs("")).toEqual({ flags: {}, positionals: [] });
  });

  it("returns empty result for whitespace-only string", () => {
    expect(parseCliArgs("   ")).toEqual({ flags: {}, positionals: [] });
  });

  it("returns empty result for empty array", () => {
    expect(parseCliArgs([])).toEqual({ flags: {}, positionals: [] });
  });

  it("parses a boolean flag", () => {
    expect(parseCliArgs("--chrome")).toEqual({
      flags: { chrome: null },
      positionals: [],
    });
  });

  it("parses multiple boolean flags", () => {
    expect(parseCliArgs("--chrome --verbose")).toEqual({
      flags: { chrome: null, verbose: null },
      positionals: [],
    });
  });

  it("parses a flag with a value", () => {
    expect(parseCliArgs("--effort high")).toEqual({
      flags: { effort: "high" },
      positionals: [],
    });
  });

  it("parses mixed boolean and valued flags", () => {
    expect(parseCliArgs("--chrome --effort high --debug")).toEqual({
      flags: { chrome: null, effort: "high", debug: null },
      positionals: [],
    });
  });

  it("parses model names", () => {
    expect(parseCliArgs("--model claude-sonnet-4-6")).toEqual({
      flags: { model: "claude-sonnet-4-6" },
      positionals: [],
    });
  });

  it("parses a prompt flag with an unquoted value", () => {
    expect(parseCliArgs("--append-system-prompt always-think-step-by-step --chrome")).toEqual({
      flags: { "append-system-prompt": "always-think-step-by-step", chrome: null },
      positionals: [],
    });
  });

  it("parses quoted values through the shared tokenizer", () => {
    expect(parseCliArgs(`--append-system-prompt "always think step by step" --chrome`)).toEqual({
      flags: { "append-system-prompt": "always think step by step", chrome: null },
      positionals: [],
    });
  });

  it("parses numeric values", () => {
    expect(parseCliArgs("--chrome --max-budget-usd 5.00")).toEqual({
      flags: { chrome: null, "max-budget-usd": "5.00" },
      positionals: [],
    });
  });

  it("parses equals syntax", () => {
    expect(parseCliArgs("--effort=high")).toEqual({
      flags: { effort: "high" },
      positionals: [],
    });
  });

  it("mixes equals syntax with boolean flags", () => {
    expect(parseCliArgs("--chrome --model=claude-sonnet-4-6 --debug")).toEqual({
      flags: { chrome: null, model: "claude-sonnet-4-6", debug: null },
      positionals: [],
    });
  });

  it("collects positional arguments", () => {
    expect(parseCliArgs("1.2.3")).toEqual({
      flags: {},
      positionals: ["1.2.3"],
    });
  });

  it("collects positionals mixed with flags", () => {
    expect(parseCliArgs(["1.2.3", "--root", "/path", "--github-output"])).toEqual({
      flags: { root: "/path", "github-output": null },
      positionals: ["1.2.3"],
    });
  });

  it("handles extra whitespace", () => {
    expect(parseCliArgs("  --chrome   --verbose  ")).toEqual({
      flags: { chrome: null, verbose: null },
      positionals: [],
    });
  });

  it("ignores a bare double dash", () => {
    expect(parseCliArgs("--")).toEqual({ flags: {}, positionals: [] });
  });

  it("does not let a known boolean flag consume the next token", () => {
    expect(parseCliArgs(["--github-output", "1.2.3"], { booleanFlags: ["github-output"] })).toEqual(
      {
        flags: { "github-output": null },
        positionals: ["1.2.3"],
      },
    );
  });

  it("lets an ordinary flag consume the next token", () => {
    expect(parseCliArgs(["--root", "/path", "1.2.3"], { booleanFlags: ["github-output"] })).toEqual(
      {
        flags: { root: "/path" },
        positionals: ["1.2.3"],
      },
    );
  });

  it("mixes known boolean flags, valued flags, and positionals", () => {
    expect(
      parseCliArgs(["--github-output", "--root", "/path", "1.2.3"], {
        booleanFlags: ["github-output"],
      }),
    ).toEqual({
      flags: { "github-output": null, root: "/path" },
      positionals: ["1.2.3"],
    });
  });
});
