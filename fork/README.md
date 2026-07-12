# Fork Feature Specs

Date: 2026-06-02
Status: active

## Intent

This directory defines fork owned feature contracts for the T3 Code fork.

Some specs protect local desktop integration lanes, including Omarchy where it provides host capability.

Other specs protect broader fork product behavior that is not limited to one desktop integration.

`patch.md` is the authoritative index. Each file here defines one feature in enough detail for an upstream rebuild to replay the behavior without depending on old branch shape.

## How To Use

- Start from `patch.md`.
- Open every affected feature spec before upstream sync, merge, rebuild, or divergence work.
- Rebuild product behavior from the required behavior and one shot rebuild notes before copying old implementation shape.
- Record the owner module or fork seam that restores each behavior.
- Verify every listed outcome before marking the feature restored.

## Spec Shape

Each feature spec uses this shape:

- intent
- required behavior
- owner modules
- fork seams
- one shot rebuild notes
- upstream replay rule
- verification
- compatibility checks where needed

## Replay Rule

Feature specs are outcome contracts. They should name current modules, but future rebuilds may use different files when upstream architecture changes.

When module names change, update the spec in the same change as the implementation.
