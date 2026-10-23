# Principles

This index supplies routing cues, not a replacement for an available principle leaf. Read a named leaf in full from the active catalog before applying or citing it. If a leaf is absent, use the self-contained cue here and identify that evidence limit rather than claiming a leaf read.

- **Laziness Protocol**, `principle-laziness-protocol`. Refactoring and abstraction choices. Prefer deletion and the smallest change that actually solves the goal.
- **Foundational Thinking**, `principle-foundational-thinking`. Core types, structures and concurrent actors. Choose data shape and ownership before logic.
- **Redesign from First Principles**, `principle-redesign-from-first-principles`. A new requirement changes foundational assumptions. Reconsider the design, then choose a scoped change rather than accumulated bolt-ons.
- **Attack the Premise**, `principle-attack-the-premise`. Repeated fixes based on one premise fail the same check. Gather evidence that distinguishes the shared assumption from competing explanations.
- **Subtract Before You Add**, `principle-subtract-before-you-add`. Sequencing a refactor or addition. Remove in-scope dead paths and redundancy before building on the simpler base.
- **Minimize Reader Load**, `principle-minimize-reader-load`. Hard-to-trace code. Reduce hidden state and unnecessary layers between a question and its answer.
- **Outcome-Oriented Execution**, `principle-outcome-oriented-execution`. A planned rewrite or migration. Converge on the verified target; avoid throwaway compatibility work without a real obligation.
- **Experience First**, `principle-experience-first`. Product and scope tradeoffs. Choose polished user outcomes over implementation convenience.
- **Exhaust the Design Space**, `principle-exhaust-the-design-space`. Novel costly interaction or architectural choices. Compare genuinely competing prototypes before committing.
- **Build the Lever**, `principle-build-the-lever`. Repeated or bulk work. Build a repeatable tool when it improves reliability and reviewability.
- **Model the Domain**, `principle-model-the-domain`. Stateful or branch-heavy logic. Represent the domain in types and structures rather than repeating shape assumptions.
- **Boundary Discipline**, `principle-boundary-discipline`. Validation and external integration. Validate untrusted data at boundaries; retain internal checks that enforce actual invariants.
- **Type System Discipline**, `principle-type-system-discipline`. Types and signatures. Make illegal states unrepresentable and distinguish semantic values.
- **Make Operations Idempotent**, `principle-make-operations-idempotent`. Retries and partial prior runs. Design transitions that converge despite crashes and restarts.
- **Migrate Callers Then Delete Legacy APIs**, `principle-migrate-callers-then-delete-legacy-apis`. An internal API migration with controlled callers. Migrate every caller and remove the old path when external compatibility is not required.
- **Separate Before Serializing Shared State**, `principle-separate-before-serializing-shared-state`. Concurrent writers. Eliminate unnecessary sharing before introducing serialization.
- **Prove It Works**, `principle-prove-it-works`. Before declaring completion. Exercise the relevant real artifact and inspect its actual result.
- **Fix Root Causes**, `principle-fix-root-causes`. Debugging. Reproduce the defect and trace the mechanism rather than hiding symptoms.
- **Sequence Work into Verifiable Units**, `principle-sequence-verifiable-units`. Multi-step migrations and sweeps. Finish each small unit with a meaningful check before advancing.
- **Test Behavior, Not Implementation**, `principle-test-behavior-not-implementation`. Test design and review. Use observable results and independent expectations that can catch a real defect.
- **Explain the Number**, `principle-explain-the-number`. A measured performance or evaluation claim. Identify the limiter, actual work, correctness, noise and end-to-end relevance.
- **Guard the Context Window**, `principle-guard-the-context-window`. Large output, repeated reads and long tasks. Use bounded reads and evidence summaries; delegate only within the current grant.
- **Never Block on the Human**, `principle-never-block-on-the-human`. Routine reversible decisions. Proceed inside the authorized scope; ask only for materially missing decisions or required gates.
- **Encode Lessons in Structure**, `principle-encode-lessons-in-structure`. A recurring correction. Prefer an enforceable structural check over repeating a prose reminder.
