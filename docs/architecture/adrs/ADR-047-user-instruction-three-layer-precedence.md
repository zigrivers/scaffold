# ADR-047: User Instruction Three-Layer Precedence

**Status:** accepted
**Date:** 2026-03-14
**Deciders:** PRD, domain modeling phase 1
**Domain(s):** 09, 15

---

## Context

The assembly engine needs to incorporate user customization without forking meta-prompts or knowledge base entries. Users need customization at different scopes: project-wide conventions (e.g., "we use hexagonal architecture"), step-specific guidance (e.g., "for domain modeling, focus on the billing bounded context"), and one-off adjustments (e.g., "skip mobile considerations for this run"). The question is how many layers, where they live, and what happens on conflict.

## Decision

Three layers with later-overrides-earlier precedence:

1. **Global** (`.scaffold/instructions/global.md`) — applies to all steps, persistent, committed to git
2. **Per-step** (`.scaffold/instructions/<step-name>.md`) — applies to one step, persistent, committed to git
3. **Inline** (`--instructions "..."` flag) — applies to one invocation, ephemeral

Assembly order: meta-prompt + KB + context + global instructions + per-step instructions + inline instructions. On conflict, later layers win (inline > per-step > global).

All layers are optional — missing files are silently skipped. The instructions directory (`.scaffold/instructions/`) is created by `scaffold init`.

**Semantics note:** "Override" means semantic priority, not deletion. All three instruction layers are included in the assembled prompt's Instructions section with clear provenance labels (e.g., "Global instructions:", "Per-step instructions:", "Inline instructions:"). The AI interprets later layers as taking precedence when instructions conflict. When instructions are complementary (not conflicting), all layers apply.

## Rationale

Three layers match three natural scopes (project, step, invocation). Later-overrides-earlier is the simplest mental model and matches CSS/config cascade conventions. Making all layers optional means users pay zero cost until they need customization. Git-committed instruction files enable team sharing.

## Alternatives Considered

1. **Single instruction file** — Too coarse; can't customize per step.
2. **Config-embedded instructions** — Mixes concerns; config is for structure, instructions are for content.
3. **Environment variables** — Poor ergonomics for multi-line markdown guidance.
4. **Frontmatter-embedded instructions in meta-prompts** — Couples user customization to scaffold-maintained files.

## Consequences

### Positive

- Zero-cost opt-in — users who don't need instructions pay nothing
- Team-shareable via git-committed instruction files
- Per-step precision for targeted guidance
- Inline flag for experimentation without persistent files

### Negative

- Three files to manage for power users
- File-based instructions can't be conditional (always included when present)
- No validation of instruction content (free-form markdown)

## Reversibility

Easily reversible. Instruction files are purely additive — removing support would just ignore the files. No data migration needed.

## Constraints and Compliance

- Assembly engine (domain 15) MUST load instructions in the specified precedence order
- The instructions section of the assembled prompt (ADR-045, section 6) MUST present all three layers with clear separation so the AI knows which layer each instruction came from
- Missing instruction files MUST be silently skipped (not errors)
- The `--instructions` flag MUST NOT persist — it is ephemeral by design

## Related Decisions

- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure; instructions section
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly; instructions loaded at runtime
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Assembly engine; Algorithm 5: user instruction resolution
- PRD §10 — User instructions specification
