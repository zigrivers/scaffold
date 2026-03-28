# ADR-046: Phase-Specific Review Criteria Over Generic Review Template

**Status**: accepted
**Date**: 2026-03-14
**Deciders**: v2 spec, meta-prompt architecture design
**Domain(s)**: All review phases (1a-10a)
**Phase**: 2 — Architecture Decision Records
**Supersedes**: none

---

## Context

The scaffold pipeline includes review phases after each documentation phase (1a through 10a). Each review phase examines the artifacts produced by its corresponding creation phase — domain models, ADRs, system architecture, database schema, API contracts, UX specification, implementation tasks, testing strategy, operations runbook, and security documentation.

A common approach to reviews is a **generic review template**: a shared checklist of questions ("Is this document complete? Are there inconsistencies? Does it align with prior artifacts?") applied identically to every artifact type. This approach is simple to maintain — one template instead of ten — but produces shallow reviews that miss artifact-specific failure modes.

Each documentation artifact type has **distinct failure modes** that a generic checklist cannot target:

- **Domain models** fail through bounded context boundary leaks, missing aggregates, entity vs. value object misclassification, incomplete domain event flows, invariant gaps, and ubiquitous language inconsistencies.
- **Architecture documents** fail through domain coverage gaps in components, ADR constraint violations, data flow orphans, module structure ambiguity, state management inconsistencies, and diagram/prose drift.
- **API contracts** fail through operation coverage gaps vs. domain model, error contract incompleteness, auth/authz coverage gaps, versioning inconsistency with ADRs, payload shape misalignment with domain entities, and idempotency gaps.
- **Database schemas** fail through entity coverage gaps from domain models, normalization vs. access pattern mismatches, index coverage gaps for known queries, migration safety issues, and referential integrity vs. domain invariant conflicts.

A review that checks "Is this document complete?" will not catch diagram/prose drift in an architecture document or idempotency gaps in an API contract. These are artifact-specific failure modes that require artifact-specific review criteria.

## Decision

Each review phase (1a through 10a) has its **own meta-prompt AND its own knowledge base entry** encoding failure modes specific to that artifact type. Reviews are not parameterized from a shared template — each review is independently authored to target the known failure modes of its specific artifact type.

**Per-review-phase artifacts:**

| Review Phase | Meta-Prompt | Knowledge Base Entry |
|---|---|---|
| 1a: Domain Modeling Review | `pipeline/modeling/review-domain-modeling.md` | `knowledge/review/review-domain-modeling.md` |
| 2a: ADR Review | `pipeline/decisions/review-adrs.md` | `knowledge/review/review-adr.md` |
| 3a: Architecture Review | `pipeline/architecture/review-architecture.md` | `knowledge/review/review-system-architecture.md` |
| 4a: Database Review | `pipeline/specification/review-database.md` | `knowledge/review/review-database-design.md` |
| 5a: API Review | `pipeline/specification/review-api.md` | `knowledge/review/review-api-design.md` |
| 6a: UX Review | `pipeline/specification/review-ux.md` | `knowledge/review/review-ux-specification.md` |
| 7a: Task Review | `pipeline/planning/review-tasks.md` | `knowledge/review/review-implementation-tasks.md` |
| 8a: Testing Review | `pipeline/quality/review-testing.md` | `knowledge/review/review-testing-strategy.md` |
| 9a: Operations Review | `pipeline/quality/review-operations.md` | `knowledge/review/review-operations.md` |
| 10a: Security Review | `pipeline/quality/review-security.md` | `knowledge/review/review-security.md` |

**Additionally**, a shared `knowledge/review/review-methodology.md` entry encodes the review process itself — how to structure multi-pass reviews, prioritize findings, write fix plans, re-validate after fixes. This is shared process knowledge, not shared review content. Each review meta-prompt references both its artifact-specific review knowledge entry and the shared review methodology entry.

**Review process (encoded in each review meta-prompt):**

1. Re-read all artifacts from the phase
2. Check against quality criteria from the phase's creation meta-prompt
3. Check cross-references to prior phases' artifacts
4. Run failure-mode-specific passes from the knowledge base entry
5. Identify gaps, inconsistencies, and ambiguities
6. Produce a prioritized issues list
7. Create a fix plan
8. Execute fixes
9. Re-validate

**What each review knowledge base entry contains:**

- Multi-pass review structure specific to this artifact type (which passes, in what order)
- Specific failure modes with detection heuristics (how to spot the problem)
- Cross-reference checks specific to this artifact's dependencies (e.g., architecture review checks every domain model entity appears in a component)
- Common quality gaps at each depth level
- Fix patterns for common issues

## Rationale

**Artifact-specific failure modes require artifact-specific reviews.** A domain model review that checks for bounded context boundary leaks, missing aggregates, and entity vs. value object misclassification will catch real problems that a generic "Is this document complete?" review will miss. The value of a review is directly proportional to how specifically it targets the known failure modes of the artifact being reviewed.

**The review process is shared; the review content is not.** All reviews follow the same process: read artifacts, check criteria, run failure-mode passes, identify issues, prioritize, fix, re-validate. This process is encoded in the shared `review-methodology.md` knowledge entry. But the specific failure modes, detection heuristics, and cross-reference checks are unique to each artifact type. Separating shared process from specific content avoids duplication of the process while enabling specificity of the content.

**10 review meta-prompts + 11 knowledge entries is the correct granularity.** The alternative — fewer reviews with broader scope — would dilute the specificity that makes reviews valuable. The alternative — more granular sub-reviews — would add pipeline steps without proportional quality improvement. One review per creation phase, each with its own failure-mode knowledge, is the natural unit of review granularity.

**Depth scaling applies to reviews too.** At depth 1 (MVP), a review might only check the most critical failure modes. At depth 5 (deep), a review runs all passes including edge case detection, cross-phase consistency checks, and downstream readiness validation. The meta-prompt's methodology scaling section controls this per-review-phase.

## Alternatives Considered

### Generic Review Template (Shared Across All Phases)

- **Description**: A single review meta-prompt and a single review knowledge entry, parameterized by the artifact type being reviewed. The same checklist ("completeness, consistency, alignment, clarity") applies to every artifact.
- **Pros**: One meta-prompt and one knowledge entry to maintain instead of ten + eleven. Simple to understand and implement. Consistent review structure across all phases.
- **Cons**: Generic checklists miss artifact-specific failure modes. "Is this document complete?" does not catch diagram/prose drift, idempotency gaps, bounded context boundary leaks, or any of the specific ways each artifact type fails. Reviews become shallow validation rather than deep quality assurance. The entire value proposition of the review phases is undermined.

### Partial Specialization (Generic Template + Artifact-Specific Addenda)

- **Description**: A generic review template meta-prompt that loads a shared review checklist plus an artifact-specific addendum with additional failure modes.
- **Pros**: Shared review structure reduces duplication. Artifact-specific addenda provide targeted checks. Middle ground between full generalization and full specialization.
- **Cons**: The "shared" portion of the review is actually the process (how to review), not the content (what to check) — and the process is already shared via `review-methodology.md`. The addendum approach creates an artificial split between "generic checks" and "specific checks" when in practice all checks are specific to the artifact type. What is a "generic" check for an API contract vs. a database schema? Completeness means different things for each. The addendum approach adds layering complexity without clear benefit over independent review entries.

### Review Phases Merged with Creation Phases

- **Description**: Instead of separate review steps, include review criteria in each creation meta-prompt so the AI self-reviews during creation.
- **Pros**: Eliminates 10 pipeline steps. Faster pipeline execution. No separate review pass.
- **Cons**: Self-review during creation is less rigorous than independent review — the AI that produced the artifact has the same blind spots when reviewing it. Separate review steps can incorporate context from later phases (e.g., reviewing architecture after seeing implementation tasks). The pipeline's review phases exist specifically because independent review catches issues that in-context self-review misses.

## Consequences

### Positive
- Each review targets the known failure modes of its specific artifact type — dramatically higher review quality than generic checklists
- Reviews catch real problems: diagram/prose drift, bounded context boundary leaks, idempotency gaps, entity coverage gaps, and other artifact-specific issues
- Shared review methodology prevents process duplication while allowing content specialization
- Depth scaling applies to reviews — MVP reviews check critical failure modes only, deep reviews run comprehensive multi-pass analysis
- Review knowledge entries serve as artifact quality reference documents, valuable for manual reviews as well

### Negative
- 10 review meta-prompts + 11 review knowledge entries is a significant authoring and maintenance commitment
- Changes to the review process require updating the shared `review-methodology.md` entry — but artifact-specific changes only affect one entry
- Review knowledge entries must be kept current as understanding of failure modes evolves — stale failure mode lists produce stale reviews
- The pipeline includes 10 review steps, which adds time and cost — each review is an AI invocation that consumes tokens and produces output

### Neutral
- Review steps are subject to the same depth scaling as creation steps — at MVP depth, reviews are lightweight; at deep depth, reviews are comprehensive
- Conditional phases (database, API, UX) have conditional review phases — if the creation phase is skipped, the review phase is also skipped
- Review knowledge entries are structured similarly to core knowledge entries (YAML frontmatter + markdown body) — no special format required
- The review process (read, check, identify, prioritize, fix, re-validate) is consistent across all review phases — only the specific checks vary

## Constraints and Compliance

- Each review phase (1a through 10a) MUST have its own meta-prompt in `pipeline/`
- Each review phase MUST have a corresponding knowledge base entry in `knowledge/review/` encoding artifact-specific failure modes
- Review knowledge entries MUST include specific failure modes with detection heuristics — not generic quality checklists
- Every review meta-prompt MUST reference both its artifact-specific review knowledge entry AND the shared `knowledge/review/review-methodology.md` entry
- Review knowledge entries MUST include cross-reference checks specific to the artifact's dependencies on prior phases
- The shared `review-methodology.md` entry MUST cover review process only (multi-pass structure, prioritization, fix plans, re-validation) — not artifact-specific content
- Review meta-prompts MUST include methodology scaling guidance — specifying which failure-mode passes to include at each depth level

## Related Decisions

- [ADR-041](ADR-041-meta-prompt-architecture.md) — Meta-prompt architecture that review meta-prompts operate within
- [ADR-042](ADR-042-knowledge-base-domain-expertise.md) — Knowledge base that houses review expertise entries
- [ADR-043](ADR-043-depth-scale.md) — Depth scale that controls review thoroughness
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure for review step assembly
