# ADR-053: Artifact Context Scope

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 15

---

## Context

The assembly engine gathers "prior artifacts from completed steps" (Domain 15, Section 5, Algorithm 3). But should it include ALL completed artifacts or only the current step's dependency-chain artifacts? This directly affects context window usage. Related to ADR-050 (context window management).

## Decision

Dependency-chain artifacts by default, plus explicitly declared `reads` references in meta-prompt frontmatter:

1. **Dependency-chain artifacts** are included automatically — any step in the current step's transitive dependency chain contributes its output artifact to the context.
2. **Cross-cutting artifact references** are included when the meta-prompt declares them via the `reads` frontmatter field (e.g., `reads: [create-prd]` includes the PRD even if the current step doesn't transitively depend on create-prd).
3. **All other artifacts are excluded** — they are not loaded into the assembled prompt.

This is the companion decision to ADR-050 (context window management). ADR-050 establishes the `reads` field; this ADR specifies what the default artifact set is and how `reads` extends it.

## Rationale

Each meta-prompt already declares `dependencies` (which steps must complete first) and `knowledge-base` (which KB entries to load). Adding a `reads` field for cross-cutting artifact references completes the pattern — the meta-prompt fully specifies its own context needs. Dependency-chain artifacts are the natural default because most steps need their predecessors' output to build upon. The `reads` field handles exceptions: a review step that needs the PRD even though it doesn't depend directly on the create-prd step, or a testing strategy step that needs the architecture doc from a non-dependent branch of the pipeline.

## Alternatives Considered

1. **All completed artifacts** — Maximum context but doesn't scale. By Phase 5-6, the pipeline has produced 15-20 artifacts totaling 100k+ tokens. Including all of them crowds out the meta-prompt and knowledge base content. No way to prioritize what matters for the current step.
2. **Only direct dependency artifacts (no transitive, no reads)** — Too lean. A step may depend on step B, which depends on step A. If only B's artifact is included, A's context (which informed B) is lost. And cross-cutting references are impossible without adding false dependencies to the graph.
3. **Configurable per step via meta-prompt frontmatter** — Functionally equivalent to Option C but less precise in naming. "Configurable" implies arbitrary logic; `reads` is a specific, declarative field. Option C's `reads` field IS the configuration mechanism, so this option just describes the same thing with less clarity.

## Consequences

### Positive

- Lean context — only relevant artifacts loaded, preserving token budget for meta-prompt and KB content
- Explicit cross-cutting references via `reads` — no hidden dependencies
- Consistent with meta-prompt frontmatter pattern (`dependencies`, `knowledge-base`, `reads`)
- Context growth is predictable and bounded by declaration

### Negative

- Missing `reads` declaration = invisible artifact — if a meta-prompt needs a cross-cutting artifact but doesn't declare it, the AI lacks that context
- Requires meta-prompt authors to think about cross-cutting dependencies when authoring
- Transitive dependency chains can still be large for late-pipeline steps (mitigated by ADR-050's overall budget approach)

## Reversibility

Easily reversible. Switching to "all artifacts" (Option A) requires removing the filtering logic. Switching to "direct only" (Option B) requires removing `reads` support. No state migration — `reads` is a build-time declaration.

## Constraints and Compliance

- The context gatherer (T-015) MUST compute the transitive dependency chain for the current step
- The context gatherer MUST load artifacts from all steps in the transitive chain plus all `reads`-declared steps
- The assembly engine (T-017) MUST NOT load artifacts outside the dependency chain and `reads` list
- The `reads` field MUST accept step names (not file paths) and resolve them via the step registry
- The `scaffold validate` command MUST verify that `reads` entries reference valid step names (same validation as ADR-050)

## Related Decisions

- [ADR-050](ADR-050-context-window-management.md) — Context window management; establishes the `reads` field
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure (context section)
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 5, Algorithm 3
