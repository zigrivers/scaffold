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

---

## Resolution Recommendation (added by traceability gap analysis)

**Recommended decision:** Option (D) — Let the meta-prompt declare which prior artifacts it needs via a `reads` frontmatter field, combined with dependency-chain defaults from Option (B).

**Rationale:** The meta-prompt `knowledge-base` frontmatter field already scopes which KB entries are loaded per step. Extending this pattern with a `reads` field for artifact context is consistent with the meta-prompt architecture (ADR-041). Dependency-chain artifacts are included by default (they're the most likely to be relevant), and explicit `reads` declarations handle cross-cutting references. This satisfies the 500ms assembly budget (NF-001) by loading only what's declared, not everything. Option (A) risks blowing context limits in later phases; Option (C) introduces lossy summarization complexity that the assembly engine shouldn't own.

**Impact if unresolved:** The assembly engine (T-017) must decide what context to gather. Without this ADR, the context gatherer (T-015) has no spec for artifact scoping — implementers will make ad-hoc choices that may not scale past Phase 3.

**Blocking tasks:** T-015 (context gatherer), T-017 (assembly engine orchestrator)

**Recommended resolution timing:** Before starting T-015 (Phase 2). This is architecturally load-bearing — resolve early.
