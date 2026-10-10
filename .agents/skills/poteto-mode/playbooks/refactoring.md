# Refactoring

Structure changes while an independently observable behavior contract stays fixed.

1. Ground the current behavior and pin it with an existing fixture, characterization test, baseline replay or equivalence harness before moving structure.
2. Name the missing data shape and target ownership. Use design review for a changed interface or costly boundary decision.
3. Subtract dead paths and unnecessary layers within scope, then make the smallest structural move that reaches the target.
4. Move in checked units; migrate every controlled caller and remove the old API when no external compatibility obligation remains.
5. Run the behavior pin after each unit and prove equivalence on the actual artifact, not just through lint or type checking.
6. Review whether the result lowers reader load and deliver the new structure, preserved contract and equivalence evidence.

A newly discovered feature or defect is a separate change. Keep externally required compatibility, and explain it. Delegate mechanical edits with exact paths and invariants when that buys review separation within the grant.
