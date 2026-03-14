# ADR-050: Context Window Management Strategy

**Status:** proposed
**Date:** 2026-03-14
**Deciders:** TBD
**Domain(s):** 15

---

## Context

As projects progress through the pipeline, the assembly engine accumulates artifacts in the project context section. By phase 7+ the assembled prompt may include PRD, gap analysis, domain models, ADRs, architecture docs, database schema, API contracts, and UX specs — potentially exceeding AI context limits. Domain 15, Section 10, Open Question 1 flags this as must-resolve.

## Options

- **(A)** Include all artifacts, error if context exceeds limit
- **(B)** Include only dependency-chain artifacts (what the current step depends on)
- **(C)** Truncate/summarize older artifacts to fit within a budget
- **(D)** Let the meta-prompt declare which prior artifacts it needs via a `reads` frontmatter field

**Domain 15 recommendation:** Open — needs analysis of typical assembled prompt sizes across the full 32-step pipeline.

## Decision

TBD

## Rationale

TBD

## Alternatives Considered

TBD — see Options above for candidates.

## Consequences

TBD

## Constraints and Compliance

TBD

## Related Decisions

- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly that constructs the prompt
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure (context section)
- [ADR-053](ADR-053-artifact-context-scope.md) — Related: which artifacts to include
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 10, Open Question 1
