# Visual parity

A frozen visual baseline defines the target. Agree the comparison tolerance before modifying the implementation.

1. Capture the relevant baseline states, viewport, data, theme, fonts and comparison tolerance before the migration.
2. Freeze the reference and harness so an implementation cannot pass by weakening the comparison.
3. Change one component or shared primitive at a time, preserving the baseline's observable behavior.
4. Drive each changed state on the matching authorized surface and compare the images through the frozen harness.
5. Investigate every unexplained delta, rerun after the fix, and report per-state results and remaining gaps.

For strict pixel parity, the tolerance is zero except explicitly accepted rendering noise. A questionable baseline needs a decision, not a silent rewrite. Browser and native mobile are different surfaces and need their own drivers. Never call a screenshot-only check an interaction pass.
