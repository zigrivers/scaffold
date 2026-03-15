# ADR-053: Artifact Context Scope

**Status:** proposed
**Date:** 2026-03-14
**Deciders:** TBD
**Domain(s):** 15

---

## Context

The assembly engine gathers "prior artifacts from completed steps" (Domain 15, Section 5, Algorithm 3). But should it include ALL completed artifacts or only the current step's dependency-chain artifacts? This directly affects context window usage. Related to ADR-050 (context window management).

## Options

- **(A)** All completed artifacts (maximum context, maximum size)
- **(B)** Only direct dependency artifacts (lean but may miss cross-cutting context)
- **(C)** Dependency artifacts plus any artifacts the meta-prompt explicitly references via a `reads` frontmatter field
- **(D)** Configurable per step via meta-prompt frontmatter

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

- [ADR-050](ADR-050-context-window-management.md) — Context window management (related constraint)
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure (context section)
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 5, Algorithm 3

---

## Resolution Recommendation (added by traceability gap analysis)

**Recommended decision:** Option (C) — Dependency artifacts plus explicitly declared `reads` references in meta-prompt frontmatter.

**Rationale:** This is the natural companion to ADR-050's recommended Option (D). Each meta-prompt already declares `dependencies` (which steps must complete first) and `knowledge-base` (which KB entries to load). Adding a `reads` field for cross-cutting artifact references completes the pattern — the meta-prompt fully specifies its own context needs. Dependency-chain artifacts are the default (most steps need their predecessors' output), and `reads` handles the exceptions (e.g., a review step that needs the PRD even though it doesn't depend directly on the create-prd step). Option (A) doesn't scale past Phase 3. Option (D) is functionally the same as (C) but less precise in naming.

**Impact if unresolved:** Same as ADR-050 — the context gatherer (T-015) and assembly engine (T-017) have no spec for which artifacts to load. These ADRs should be resolved together.

**Blocking tasks:** T-015 (context gatherer), T-017 (assembly engine orchestrator)

**Recommended resolution timing:** Resolve together with ADR-050 before starting T-015 (Phase 2).
