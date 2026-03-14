# ADR-011: Frontmatter Depends-On Union Semantics

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 01, 02, 08
**Phase**: 2 — Architecture Decision Records

---

## Context

> **Architecture update:** This ADR was written for the original three-layer prompt resolution system (domain 01). The meta-prompt architecture (ADR-041) eliminated custom prompts, extension prompts, and methodology manifest dependency sections. However, the core decision — union semantics for `depends-on` — remains valid for meta-prompt frontmatter (domain 08): meta-prompts declare dependencies in frontmatter, and the assembly engine (domain 15) uses these for prerequisite checking. The merge question now applies if users create project-local meta-prompt overrides.

In Scaffold v2, dependencies between prompts can be declared in two places: the methodology manifest's `dependencies` section and individual prompt frontmatter `depends-on` fields. When a custom prompt (project-level or user-level override) declares its own `depends-on`, the system must decide whether those dependencies **replace** or **merge with** the built-in prompt's dependencies.

This is flagged as an ADR CANDIDATE in three domain models:
- Domain 01, Section 10, Recommendation 7: "Frontmatter `depends-on` merge strategy (union vs. replace)"
- Domain 02, Section 10, Recommendation 5: "Dependency union vs. replacement for custom prompts"
- Domain 08, Section 10, Recommendation 4: "Emit warning for extension prompts without `depends-on`"

The stakes are significant. If a custom prompt can remove built-in dependencies, it may allow a prompt to execute before its prerequisite artifacts exist, breaking the pipeline. If it cannot remove dependencies, advanced users lose the ability to simplify the dependency graph for their use case.

A related question is how other frontmatter fields (description, phase, produces, reads, artifact-schema, requires-capabilities) should behave when a custom prompt provides them.

## Decision

**Union semantics for `depends-on`**: When both a built-in prompt and a custom prompt declare `depends-on`, the effective dependencies are the set union of both lists. Custom prompts can ADD dependencies but cannot REMOVE built-in dependencies.

**Replace semantics for all other frontmatter fields**: When a custom prompt declares `description`, `phase`, `produces`, `reads`, `artifact-schema`, or `requires-capabilities`, the custom value replaces the built-in value entirely.

This asymmetry is intentional: `depends-on` is safety-critical (removing a dependency can break the pipeline by allowing a prompt to run before its prerequisites), while other fields are not (replacing a description or produces list affects display and validation but does not break execution ordering).

No `depends-on-override` or `depends-on-replace` escape hatch is provided. Custom prompts cannot simplify the dependency graph — only extend it.

**Extension prompts without `depends-on`**: Extension prompts that declare no `depends-on` in frontmatter and have no manifest dependency entry float to position 1 in their phase. Since this is almost never intentional, the system emits a warning (domain 08, Section 10, Recommendation 4).

## Rationale

- **Safety-first for dependency integrity**: A custom prompt that removes a dependency like `create-prd -> tech-stack` would allow `tech-stack` to execute without the PRD existing. The agent running `tech-stack` would receive an empty or missing predecessor artifact, producing garbage output. Union semantics prevent this class of error entirely. The cost — inability to simplify the graph — is low because the dependency graph is typically well-designed by methodology authors and rarely needs simplification (domain 02, Section 10, ADR CANDIDATE 5).
- **Asymmetry matches risk profile**: Replacing `description` affects what users see in `scaffold list`. Replacing `produces` affects completion detection. Replacing `artifact-schema` affects validation strictness. None of these can break the pipeline's execution ordering. But removing a dependency edge can cause a prompt to execute out of order with missing inputs. The asymmetry between union (for the safety-critical field) and replace (for non-critical fields) matches the risk profile of each field type (domain 01, Section 8, MQ2).
- **No escape hatch reduces complexity**: A `depends-on-replace` field would add a new frontmatter key, new merge logic, new validation rules, and a new decision point for every custom prompt author. For the rare case where a user genuinely needs to remove a dependency, they can create a methodology fork or modify the manifest directly. The simplicity of "depends-on is always additive" is worth the loss of an edge-case escape hatch (domain 01, Section 10, ADR CANDIDATE 7).
- **Warning for floating extensions catches common mistakes**: An extension prompt in Phase 3 with no dependencies would be eligible to run immediately (position 1 in its phase), likely before the prompts that produce its required inputs. The warning catches this at validation time (scaffold validate) rather than allowing a confusing runtime failure (domain 08, Section 10, Recommendation 4).

## Alternatives Considered

### Replace Semantics (Custom Overrides Built-In Deps Entirely)
- **Description**: When a custom prompt declares `depends-on`, it completely replaces the built-in prompt's dependencies. The built-in dependencies are discarded.
- **Pros**: Full control for advanced users. If a methodology's dependency graph is overly constrained for a specific project, the user can simplify it.
- **Cons**: Dangerous for novice users who may not understand the full dependency graph. A custom prompt that declares `depends-on: []` (empty) would remove all dependencies, potentially allowing it to run first in the pipeline. Even experienced users may accidentally omit a critical dependency. The failure mode is not an error — it is a prompt executing with missing inputs, producing subtly wrong output.

### Union with `depends-on-replace` Escape Hatch
- **Description**: Default to union semantics, but provide a `depends-on-replace` frontmatter field that, when present, uses replace semantics instead. Union is the safe default; replace is opt-in.
- **Pros**: Covers both the common case (safe union) and the advanced case (intentional replacement). The escape hatch is explicit, so accidental usage is unlikely.
- **Cons**: Adds complexity to the frontmatter schema, the merge algorithm, and the documentation. Prompt authors must learn when to use `depends-on` (additive) vs. `depends-on-replace` (destructive). The merge algorithm must handle the case where both fields are present. In practice, the need to remove built-in dependencies is rare enough that the added complexity is not justified.

### No Frontmatter Dependencies (Manifest Only)
- **Description**: Only the methodology manifest can declare dependencies. Frontmatter `depends-on` is not supported. Custom and extra prompts must rely on manifest dependencies or have none.
- **Pros**: Single source of truth for dependencies. No merge logic needed. Methodology authors have complete control over the dependency graph.
- **Cons**: Custom prompts and extra-prompts cannot declare their own dependencies. An extra prompt that needs to run after `create-prd` has no way to express this requirement without modifying the manifest. This defeats the purpose of the `extra-prompts` feature, which is designed to let users add prompts without editing methodology internals.

## Consequences

### Positive
- Pipeline dependency integrity is preserved regardless of custom prompt contents — it is impossible for a customization to break the execution ordering by removing dependencies
- Simple mental model: "custom prompts can add requirements but never remove them"
- Extra-prompts can declare their own dependencies, integrating cleanly into the existing dependency graph
- The warning for floating extension prompts catches a common authoring mistake at build time

### Negative
- Custom prompts cannot simplify the dependency graph. A user who believes `tech-stack` does not actually need `create-prd` as a prerequisite in their project has no mechanism to remove that edge without forking the methodology
- The asymmetry between `depends-on` (union) and other fields (replace) is a non-obvious rule that must be documented clearly. Users who expect uniform behavior may be surprised that changing `depends-on: [a, b]` in a custom prompt adds to rather than replaces the built-in's `depends-on: [c, d]`
- No escape hatch means the rare legitimate use case of dependency removal requires a methodology fork

### Neutral
- The merged `depends-on` set is deduplicated (set union, not list concatenation). If both the built-in and the custom prompt declare `depends-on: [create-prd]`, the effective set contains `create-prd` once. No duplicate edge handling is needed in the dependency graph.

## Constraints and Compliance

- The resolution algorithm MUST merge `depends-on` using set union when both a built-in prompt and a custom prompt declare dependencies (domain 02, Section 5 (dependency graph construction))
- Custom prompts MUST NOT be able to remove built-in dependencies through any frontmatter mechanism
- For all frontmatter fields other than `depends-on`, custom values MUST replace built-in values entirely (domain 08 (meta-prompt frontmatter schema))
- Extension prompts without `depends-on` in frontmatter and no manifest dependency entry MUST emit a warning at validation time (scaffold validate) (domain 08, Section 10, Recommendation 4)
- Extra prompts' `depends-on` fields are included in the dependency graph directly — they have no built-in equivalent to merge with (domain 08 (meta-prompt frontmatter schema))
- Implementers MUST NOT add `depends-on-replace`, `depends-on-override`, or any similar escape hatch field to the frontmatter schema
- The `DependencyEdge.source` field MUST track whether each edge came from `manifest`, `frontmatter`, or `both`, enabling diagnostics about why a dependency exists (domain 02, Section 3)
- Non-`depends-on` array fields (`produces`, `reads`, `artifact-schema`) use REPLACE strategy when a custom prompt provides them — the custom values completely replace the base values with no merging. Only `depends-on` receives union semantics.

## Related Decisions

- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Three-layer resolution that triggers frontmatter merging
- [ADR-009](ADR-009-kahns-algorithm-dependency-resolution.md) — Dependency sorting that consumes the merged dependency graph
- ADR-015 — Frontmatter schema defining the fields subject to these merge rules
- Domain 08 ([08-prompt-frontmatter.md](../domain-models/08-prompt-frontmatter.md)) — Meta-prompt frontmatter schema defining depends-on field
- Domain 02 ([02-dependency-resolution.md](../domain-models/02-dependency-resolution.md)) — Dependency graph construction from merged dependencies
