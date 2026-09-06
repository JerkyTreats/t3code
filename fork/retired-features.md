# Retired Fork Features

Date: 2026-09-05
Status: historical
Authority: none

## Intent

Record fork feature retirement decisions without creating a current product contract, compatibility promise, verification requirement, reconciliation input, or preservation obligation.

| Feature | Former title                                                    | Retirement reason                                                                       | Upstream disposition                                                                                                         |
| ------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| F5      | Git surface isolation from draft ownership                      | The custom surface and ownership overlay no longer justify fork complexity.             | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F7      | Local branch, worktree, and promotion workflow                  | The custom promotion workflow no longer justifies fork complexity.                      | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F8      | Plan aware sidebar, settled lifecycle, and activity status cues | Generic sidebar and settlement behavior now carry the retained product needs.           | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F10     | Codex model and binary selection                                | Upstream provider discovery and launch behavior now carry the retained product needs.   | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F11     | Source control provider lane and publish workflow               | Generic source-control substrate now carries the retained product needs.                | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F12     | Provider instance identity seam                                 | Generic provider-instance runtime behavior now carries the retained product needs.      | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F13     | Connect and managed relay lifecycle                             | Connect and relay behavior no longer requires a fork preservation contract.             | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F14     | Unified project context and inference dashboard                 | The custom project and inference surfaces no longer justify fork complexity.            | No fork replay or override. Accept current upstream behavior or absence during future reconciliation.                        |
| F26     | Collective resident runtime                                     | Runtime, quota, fanout, and swarm behavior are excluded from the accepted product line. | Preserve historical Board provenance and deployed migration journals only. Do not restore runtime behavior.                  |
| F09     | Document Markdown and plan preview                              | The user accepted upstream rendered Markdown and retired the custom renderer.           | Accept upstream Markdown. Mermaid has its own retained F22 responsibility.                                                   |
| F15     | Durable web turn outbox                                         | The user explicitly retired the fork web outbox during upstream intake.                 | Accept ordinary upstream sending. Mobile outbox and prompt stash remain upstream-owned.                                      |
| F21     | Markdown document review                                        | The user dropped inline commenting for now.                                             | Remove rendered-document commenting and its exclusive draft/send state. Ordinary source and PR review remain upstream-owned. |
| F24     | Composer activity shelf                                         | Outbox-specific presentation retires with F15.                                          | Retained plan appearance belongs to the chat presentation outcome; no queue shelf is restored.                               |

These intake decisions do not authorize replay of the historical implementations. Source and product acceptance are tracked in the active intake ledger. Previously pending web outbox work requires an explicit disposition in the old client before that client's cutover; this record does not resend, acknowledge, delete or inspect any live work.
