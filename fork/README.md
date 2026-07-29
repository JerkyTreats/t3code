# Fork Feature Specs

Date: 2026-06-02
Status: active

## Intent

This directory defines fork owned feature contracts for the T3 Code fork.

Some specs protect local desktop integration lanes, including Omarchy where it provides host capability.

Other specs protect broader fork product behavior that is not limited to one desktop integration.

`patch.md` is the authoritative index. Each file here defines one feature in enough detail for an origin rebuild to restore the behavior without depending on old branch shape.

## How To Use

- Start from `patch.md`.
- Open every affected feature spec before origin rebuild or divergence work.
- Rebuild product behavior from the required behavior and one shot origin rebuild notes before copying old implementation shape.
- Record the owner module or fork seam that restores each behavior.
- Verify every listed outcome before marking the feature restored.

## Spec Shape

Each feature spec uses this shape:

- intent
- required behavior
- owner modules
- fork seams
- one shot origin rebuild notes
- origin rebuild rule
- verification
- compatibility checks where needed

## Origin Rebuild Rule

Feature specs are outcome contracts. They should name current modules, but future origin rebuilds may use different files when origin architecture changes.

When module names change, update the spec in the same change as the implementation.
