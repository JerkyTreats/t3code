// @effect-diagnostics nodeBuiltinImport:off - This repository contract test verifies owner paths on disk.
import { describe, expect, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import {
  FORK_FEATURE_CONTRACTS,
  FORK_FEATURE_IDS,
  getForkFeatureContract,
  type ForkVerificationLevel,
} from "./forkVerification.ts";

describe("fork verification contracts", () => {
  it("covers every protected fork feature exactly once", () => {
    const ids = FORK_FEATURE_CONTRACTS.map((feature) => feature.id);

    expect(ids).toEqual(FORK_FEATURE_IDS);
    expect(new Set(ids).size).toBe(FORK_FEATURE_IDS.length);
  });

  it("defines outcome scenarios with owners and verification levels", () => {
    for (const feature of FORK_FEATURE_CONTRACTS) {
      expect(feature.title.length).toBeGreaterThan(0);
      expect(feature.ownerModules.length).toBeGreaterThan(0);
      expect(feature.scenarios.length).toBeGreaterThanOrEqual(2);

      for (const scenario of feature.scenarios) {
        expect(scenario.id.startsWith(feature.id.toLowerCase())).toBe(true);
        expect(scenario.outcome.length).toBeGreaterThan(20);
        expect(scenario.levels.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps scenario ids globally unique", () => {
    const scenarioIds = FORK_FEATURE_CONTRACTS.flatMap((feature) =>
      feature.scenarios.map((scenario) => scenario.id),
    );

    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
  });

  it("references owner modules that exist in the repository", () => {
    const repositoryRoot = NodePath.resolve(import.meta.dirname, "../../..");

    for (const feature of FORK_FEATURE_CONTRACTS) {
      for (const ownerModule of feature.ownerModules) {
        expect(NodeFS.existsSync(NodePath.join(repositoryRoot, ownerModule)), ownerModule).toBe(
          true,
        );
      }
    }
  });

  it("marks every feature with an automated verification path", () => {
    const automatedLevels = new Set<ForkVerificationLevel>(["unit", "integration", "browser"]);

    for (const feature of FORK_FEATURE_CONTRACTS) {
      expect(
        feature.scenarios.some((scenario) =>
          scenario.levels.some((level) => automatedLevels.has(level)),
        ),
      ).toBe(true);
    }
  });

  it("looks up contracts by feature id", () => {
    expect(getForkFeatureContract("F4").title).toBe("Composer draft autonomy and chrome");
  });
});
