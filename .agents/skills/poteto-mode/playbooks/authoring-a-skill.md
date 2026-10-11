# Authoring a skill

The deliverable is reusable agent guidance that changes future decisions without expanding authority.

1. Read the available skill-creator and writing-for-agents instructions, then identify concrete requests and outcomes the skill must support.
2. Keep the entrypoint short and route conditional detail to reachable references; use available native tools and actual catalog entries.
3. For community-derived material, pin source and revision, inspect the complete selected instructions and supporting code, and record hashes and security findings before installation.
4. Validate frontmatter, relative references, resource reachability, scripts if any, and preservation of the user's permissions and constraints.
5. Review representative requests and counterexamples, recording whether validation is static or an actual model execution.
6. Deliver the skill, provenance, invocation and known evidence limits; install or publish only where the user authorized it.

Keep one source of truth per rule. Repeated mistakes belong in types, architecture, lint, tests or runtime checks when those mechanisms can enforce them. A skill edit uncovered during feature work is an independently reviewable change.
