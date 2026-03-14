# ADR-042: Knowledge Base as Domain Expertise Layer

**Status**: accepted
**Date**: 2026-03-14
**Deciders**: v2 spec, meta-prompt architecture design
**Domain(s)**: 01 (retired), 12 (retired)
**Phase**: 2 — Architecture Decision Records
**Supersedes**: none

---

## Context

In scaffold v1, domain expertise is embedded directly in hard-coded prompt text. Each prompt contains both execution instructions ("read the PRD, then produce an architecture document") and domain knowledge ("a good architecture document covers component design, data flows, module structure, extension points..."). This coupling means:

1. **Domain knowledge is duplicated.** Multiple prompts need to know what makes a good architecture document — the creation prompt, the review prompt, and the validation prompt all contain overlapping expertise about architecture quality.

2. **Expertise improvements require multi-file edits.** When understanding of a domain improves (e.g., learning that architecture reviews should check for diagram/prose drift), every prompt that touches that domain must be updated individually.

3. **Methodology coupling.** Domain knowledge about "what good looks like" is universal, but it gets entangled with methodology-specific instructions about how much depth to apply.

The v2 mixin system (ADR-006) attempted to address duplication by extracting shared content into injectable mixins, but mixins are still static text fragments that must be manually maintained and composed via marker syntax — they move the problem without solving it.

The meta-prompt architecture (ADR-041) separates step intent from domain expertise. This ADR defines how domain expertise is organized and managed as an independent layer.

## Decision

Create a **knowledge base** of topic-organized domain expertise documents (32 markdown files) that serve as the domain expertise layer for the meta-prompt architecture. Meta-prompts reference knowledge base entries by name in their frontmatter, and the CLI loads referenced entries during prompt assembly.

**Organization principles:**

1. **Topic-organized, not step-organized.** A knowledge entry like `core/system-architecture.md` covers system architecture expertise comprehensively. It gets referenced by the system architecture meta-prompt, the architecture review meta-prompt, and potentially the cross-phase consistency validation meta-prompt. No duplication across entries.

2. **Methodology-independent.** Entries describe what "good" looks like in general — patterns, pitfalls, evaluation criteria, failure modes. They do not specify how much depth to apply; that is the meta-prompt's concern via its methodology scaling section.

3. **Independently maintainable.** Improving a knowledge base entry automatically improves every meta-prompt that references it, without any changes to meta-prompts themselves.

**Knowledge base structure (4 categories, 32 documents):**

- **Core domain expertise (10):** Domain modeling, ADR craft, system architecture, database design, API design, UX specification, task decomposition, testing strategy, operations/runbook, security review.
- **Phase-specific review expertise (11):** Review methodology (shared process), plus one review document per artifact type encoding specific failure modes — domain model reviews, ADR reviews, architecture reviews, database reviews, API reviews, UX reviews, task reviews, testing reviews, operations reviews, security reviews.
- **Validation expertise (7):** Cross-phase consistency, traceability, decision completeness, critical path analysis, implementability review, dependency validation, scope management.
- **Product and finalization expertise (4):** PRD craft, gap analysis, developer onboarding, implementation playbook.

**Entry format:** Each entry has YAML frontmatter (`name`, `description`, `topics`) followed by markdown content organized into sections covering expertise, patterns, pitfalls, and evaluation criteria relevant to the topic.

**What goes in vs. stays out:**
- **In:** Domain expertise, quality patterns, common pitfalls, evaluation frameworks, failure modes, best practices.
- **Out:** Project-specific context (comes from artifacts at runtime), tool-specific commands (AI handles natively), scaffold's own architectural decisions (stay in ADRs), execution instructions (belong in meta-prompts).

## Rationale

**Topic organization prevents duplication.** Step-organized knowledge (one document per pipeline step) would duplicate expertise across creation and review steps. For example, "what makes a good architecture document" would appear in both the architecture creation knowledge and the architecture review knowledge. Topic organization means the architecture expertise lives in one place and is referenced by both meta-prompts.

**Methodology independence enables reuse.** If a knowledge entry includes methodology-specific instructions ("for MVP, skip the data flow diagrams"), it becomes coupled to the methodology system and must be updated when methodologies change. Keeping entries methodology-independent means the same expertise applies whether the user is running at depth 1 or depth 5 — the meta-prompt's scaling guidance determines how much of the expertise to apply.

**Independent maintainability is the primary value proposition.** The highest-leverage improvement to scaffold's output quality is improving the domain expertise that informs prompt generation. Knowledge base entries can be improved by domain experts, by learning from user feedback, or by incorporating new best practices — all without touching meta-prompts or pipeline configuration.

**Separate review knowledge entries encode artifact-specific failure modes.** Generic review checklists miss the specific ways each artifact type fails. Architecture documents fail differently than API contracts — architecture reviews need to check for diagram/prose drift and ADR constraint compliance, while API reviews need to check for idempotency gaps and error contract completeness. Separate review entries for each artifact type enable targeted, high-quality reviews (see ADR-046).

## Alternatives Considered

### Inline Domain Knowledge in Meta-Prompts

- **Description**: Include domain expertise directly in each meta-prompt, making meta-prompts larger (150-300 lines) but self-contained.
- **Pros**: Each meta-prompt is self-contained — no external references to resolve. Simpler assembly pipeline. Easier to understand what a single step will produce.
- **Cons**: Domain knowledge duplicated across creation and review meta-prompts. Expertise updates require editing multiple meta-prompts. Meta-prompts become large enough that the boundary between intent declaration and domain expertise blurs. Essentially recreates the v1 problem at a slightly smaller scale.

### Step-Organized Knowledge (One Document Per Step)

- **Description**: Create a knowledge document for each pipeline step rather than organizing by topic.
- **Pros**: Clear 1:1 mapping between meta-prompt and knowledge document. No ambiguity about which knowledge supports which step.
- **Cons**: Duplicates expertise across creation and review steps. System architecture knowledge appears in both `phase-03-knowledge.md` and `phase-03a-review-knowledge.md`. Updates must be synchronized. As pipeline steps are added or reorganized, knowledge documents must follow — coupling knowledge organization to pipeline structure.

### Knowledge Embedded in Methodology Presets

- **Description**: Include domain expertise in methodology preset files, varying expertise by methodology tier.
- **Pros**: Expertise naturally scales with methodology — MVP gets shorter knowledge, deep gets comprehensive knowledge.
- **Cons**: Conflates methodology configuration (which steps, what depth) with domain expertise (what good looks like). Three copies of every knowledge entry (one per methodology). Domain expertise is universal — what makes a good architecture document does not change based on methodology; only how much detail to produce changes.

## Consequences

### Positive
- Domain expertise is reusable across pipeline steps — write once, reference from multiple meta-prompts
- Improving a knowledge entry automatically improves every step that references it
- Expertise can be maintained by domain experts without understanding meta-prompt syntax or pipeline configuration
- Topic organization eliminates cross-step duplication of domain knowledge
- Knowledge base serves as a standalone domain expertise reference, valuable beyond scaffold

### Negative
- 32 documents to author — this is the highest-effort part of the meta-prompt architecture implementation
- Knowledge base quality directly determines output quality — incomplete or shallow entries produce mediocre prompts regardless of meta-prompt quality
- Multiple meta-prompts referencing the same entry creates a non-obvious coupling — changes to a knowledge entry affect all referencing steps, which could introduce regressions
- Topic boundaries require judgment — some expertise spans topics (e.g., security considerations in API design) and the organization must handle cross-cutting concerns

### Neutral
- Knowledge base entries are pure markdown with minimal frontmatter — no new tooling required to author or maintain them
- The knowledge base directory structure (`knowledge/core/`, `knowledge/review/`, `knowledge/validation/`, `knowledge/product/`, `knowledge/finalization/`) mirrors the pipeline structure loosely but is not coupled to it
- Source material for initial knowledge base content comes from existing v1 prompts (domain knowledge extraction), retired v2 domain models, and new expertise documents

## Constraints and Compliance

- Knowledge base entries MUST be organized by topic, not by pipeline step
- Knowledge base entries MUST NOT contain methodology-specific depth instructions — depth scaling belongs in meta-prompts
- Knowledge base entries MUST NOT contain tool-specific commands or execution instructions
- Knowledge base entries MUST NOT contain project-specific context — they describe universal domain expertise
- Each knowledge base entry MUST have YAML frontmatter with `name`, `description`, and `topics` fields
- Review knowledge entries MUST encode artifact-specific failure modes, not generic checklists (see ADR-046)
- Meta-prompts MUST reference knowledge base entries by name in their `knowledge-base` frontmatter field

## Related Decisions

- [ADR-041](ADR-041-meta-prompt-architecture.md) — Meta-prompt architecture that this knowledge base supports
- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Mixin injection (superseded by ADR-041); knowledge base replaces mixins as the shared content mechanism
- [ADR-046](ADR-046-phase-specific-review-criteria.md) — Phase-specific review criteria encoded in review knowledge entries
- [ADR-045](ADR-045-assembled-prompt-structure.md) — How knowledge base entries are positioned in the assembled prompt
