# ADR-050: Context Window Management Strategy

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 15

---

## Context

As projects progress through the pipeline, the assembly engine accumulates artifacts in the project context section. By phase 7+ the assembled prompt may include PRD, gap analysis, domain models, ADRs, architecture docs, database schema, API contracts, and UX specs — potentially exceeding AI context limits. Domain 15, Section 10, Open Question 1 flags this as must-resolve.

## Decision

Meta-prompts declare which prior artifacts they need via a `reads` frontmatter field, combined with dependency-chain defaults:

1. **Dependency-chain artifacts** are included automatically — if step B depends on step A, step A's output artifact is in B's context by default.
2. **Cross-cutting artifacts** are included only when the meta-prompt explicitly lists them in its `reads` field (e.g., `reads: [create-prd, define-architecture]`).
3. **No implicit "include everything"** — artifacts not in the dependency chain or `reads` list are not loaded.

This extends the existing meta-prompt frontmatter pattern: `dependencies` declares execution order, `knowledge-base` declares KB entries, and `reads` declares artifact context. The meta-prompt fully specifies its own context needs.

## Rationale

The meta-prompt `knowledge-base` frontmatter field already scopes which KB entries are loaded per step. Extending this pattern with a `reads` field for artifact context is consistent with the meta-prompt architecture (ADR-041). Dependency-chain artifacts are included by default because they are the most likely to be relevant (a step's direct predecessors produced the artifacts it's building on). Explicit `reads` declarations handle cross-cutting references (e.g., a review step that needs the PRD even though it doesn't depend directly on the create-prd step). This satisfies the 500ms assembly budget (NF-001) by loading only what's declared, not everything.

## Alternatives Considered

1. **Include all artifacts, error if context exceeds limit** — Simple but doesn't scale. By Phase 4-5 the combined artifacts can exceed 200k tokens. Fails hard instead of degrading gracefully. Forces the assembly engine to count tokens and handle overflow — complexity that belongs in authoring, not runtime.
2. **Include only dependency-chain artifacts** — Lean but misses cross-cutting context. A review step may need the PRD even though it only directly depends on the architecture step. No way to declare these cross-cutting needs without modifying the dependency graph (which would create false execution dependencies).
3. **Truncate or summarize older artifacts to fit within a budget** — Introduces lossy compression that the assembly engine shouldn't own. Summarization quality is unpredictable and model-dependent. The assembly engine would need to decide what to cut — a content judgment it's not equipped to make.

## Consequences

### Positive

- Explicit control — meta-prompt authors declare exactly what context each step needs
- Predictable token usage — assembly engine loads a known set of artifacts
- Meta-prompt is self-describing — `reads` + `dependencies` + `knowledge-base` fully specify context
- Satisfies 500ms assembly budget by avoiding "load everything" approaches

### Negative

- Meta-prompt authors must think about which artifacts to declare in `reads`
- Undeclared artifacts are invisible to the AI — omitting a `reads` entry means the AI lacks that context
- New frontmatter field (`reads`) to validate in the build pipeline
- Initial authoring overhead to audit all 32 meta-prompts and set correct `reads` lists

## Reversibility

Easily reversible. Removing the `reads` field would fall back to dependency-chain-only context (Option B). Switching to "include all" (Option A) is also straightforward. No data migration needed — `reads` is a build-time declaration, not runtime state.

## Constraints and Compliance

- The frontmatter schema (ADR-045) MUST be extended to include an optional `reads` field (array of step names)
- The context gatherer (T-015) MUST load dependency-chain artifacts by default and `reads`-declared artifacts additionally
- The assembly engine (T-017) MUST NOT load artifacts that are neither in the dependency chain nor declared in `reads`
- The `scaffold validate` command MUST verify that `reads` references point to valid step names
- Meta-prompt authors MUST audit cross-cutting context needs when authoring new meta-prompts

## Related Decisions

- [ADR-041](ADR-041-meta-prompt-architecture.md) — Meta-prompt architecture; frontmatter pattern
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly that constructs the prompt
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure (context section)
- [ADR-053](ADR-053-artifact-context-scope.md) — Companion decision: artifact context scope
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Section 10, Open Question 1
