# ADR-043: Depth Scale (1-5) Over Methodology-Specific Prompt Variants

**Status**: accepted
**Date**: 2026-03-14
**Deciders**: v2 spec, meta-prompt architecture design
**Domain(s)**: 01 (retired), 06
**Phase**: 2 — Architecture Decision Records
**Supersedes**: ADR-016

---

## Context

Scaffold must support different levels of documentation rigor for different project types. A solo hackathon project and a complex enterprise system should go through fundamentally different levels of preparation. The v2 design addressed this through methodology manifests (ADR-016) that define per-methodology pipeline shapes — which prompts are included, what phases they belong to, what axis defaults apply, and which prompts are conditional on project traits.

The methodology manifest approach creates a combinatorial maintenance problem. Each methodology (classic, classic-lite, lean, etc.) requires its own manifest with its own prompt overrides and extensions. Adding a new pipeline step requires updating every methodology manifest. Adding a new methodology requires writing overrides and extensions for every step. The interaction between methodology manifests, mixin axes, and project traits creates a configuration surface that is difficult to reason about and expensive to maintain.

The meta-prompt architecture (ADR-041) eliminates hard-coded prompt variants. The remaining question is: how does a user control the depth and rigor of output across the pipeline?

## Decision

Replace methodology-specific prompt variants with a **depth scale from 1 to 5** that controls output rigor at each pipeline step. Each meta-prompt defines concrete scaling guidance for how its output should differ across the depth range.

**Depth levels:**

- **1 (MVP floor):** Minimum viable artifact. Core decisions only, no alternatives analysis, brief rationale. Just enough to start building without ambiguity.
- **2:** Key trade-offs noted but not explored in depth. Slightly more structure than depth 1.
- **3 (Balanced):** Solid documentation. Alternatives considered for major decisions. Team-onboardable output.
- **4:** Thorough analysis. Edge cases, risk assessment, detailed rationale.
- **5 (Deep ceiling):** Comprehensive. Full evaluation matrices, domain modeling, gap analysis, migration paths, operational considerations.

**Three methodology presets:**

- **Deep Domain Modeling:** All pipeline steps active, depth 5 at every step. For teams building complex or long-lived systems.
- **MVP:** Minimal step subset active (create-prd, testing strategy, implementation tasks, implementation playbook), depth 1. For solo developers, hackathons, proofs of concept.
- **Custom:** User chooses which steps are active and sets depth per step (or accepts a default depth). For everyone else.

**Scaling guidance in meta-prompts:** Each meta-prompt's "Methodology Scaling" section provides specific guidance for `deep` (depth 5) and `mvp` (depth 1) output, plus interpolation guidance for intermediate depths. This is not generic ("write more" vs. "write less") — it specifies what content sections to include or omit, what level of analysis to perform, and what artifacts to produce at each depth level.

**Configuration:**

```yaml
# .scaffold/config.yml
methodology: deep | mvp | custom
custom:
  default_depth: 3
  steps:
    create-prd:
      enabled: true
      depth: 4
    system-architecture:
      enabled: true
      depth: 2
```

## Rationale

**A single axis (depth) replaces combinatorial methodology variants.** Instead of N methodologies times M steps equals N*M prompt variants, there is one meta-prompt per step with a depth parameter. Adding a new step requires one meta-prompt with scaling guidance. Adding a new "methodology" is just a preset configuration — no new content to write.

**Concrete scaling guidance prevents "just write less" degeneracy.** The risk with a depth scale is that it becomes a vague instruction to produce more or less content. By requiring each meta-prompt to specify concrete differences between depth 1 and depth 5 output (e.g., "at depth 1, list core components only; at depth 5, include component diagrams, data flow diagrams, module structure with file-level detail, state management design, extension point inventory, deployment topology"), the scaling is meaningful and produces genuinely different outputs at different depths.

**Presets make common choices easy.** Most users will choose Deep or MVP. The depth scale and custom configuration exist for the minority who want fine-grained control. The three-preset model avoids choice paralysis while preserving flexibility.

**Methodology is changeable.** Starting at MVP does not lock the user in. They can re-run any step at a higher depth, enable previously skipped steps, or switch methodology entirely. The pipeline state tracks what is completed; re-running at a higher depth triggers update mode.

## Alternatives Considered

### Methodology Manifests with Override/Extension System (v2 Original)

- **Description**: Each methodology defines a YAML manifest with prompt overrides, extensions, phase assignments, axis defaults, and conditional prompt inclusion (ADR-016).
- **Pros**: Full control over per-methodology pipeline shape. Can define entirely different prompt text per methodology.
- **Cons**: Combinatorial maintenance — N methodologies times M steps. Adding steps or methodologies requires cross-cutting updates. Manifest syntax is complex (overrides, extensions, conditional inclusion, axis defaults). With meta-prompts replacing hard-coded prompts, methodology manifests have nothing to override — the mechanism addresses a problem that no longer exists.

### Binary Methodology (Full vs. Lite)

- **Description**: Two modes only — full pipeline at maximum depth, or minimal pipeline at minimum depth.
- **Pros**: Simplest possible model. No depth scale to explain. Clear choice: do you want thorough documentation or not?
- **Cons**: No middle ground. Many projects need more than MVP but less than full-depth enterprise documentation. Depth 3 (balanced, team-onboardable) is a common and valuable operating point that binary methodology cannot express.

### Per-Step Toggle Only (No Depth Scale)

- **Description**: Users choose which steps to run but all steps produce maximum-depth output.
- **Pros**: Simpler configuration — just enable/disable per step. No scaling guidance needed in meta-prompts.
- **Cons**: An MVP user who enables system architecture gets a 20-page enterprise architecture document when they needed a 2-page overview. The depth at which a step is executed matters as much as whether it runs at all. Toggle-only forces all-or-nothing per step.

## Consequences

### Positive
- Single meta-prompt per pipeline step regardless of methodology — no per-methodology variants
- Adding a new "methodology" is a YAML preset, not a content-authoring task
- Users can mix depths across steps (e.g., deep PRD, shallow architecture) for project-appropriate documentation
- Methodology is changeable mid-pipeline — users are not locked into their initial choice
- Presets cover common use cases (Deep, MVP) while Custom handles everything else

### Negative
- Scaling guidance in meta-prompts must be specific enough to produce meaningful output differences — generic guidance degrades the system
- Five levels may be more granularity than most users need — in practice, depths 1, 3, and 5 may see the most use
- AI must interpret depth scaling guidance correctly — unclear guidance may produce similar output across depth levels
- The "interpolation" between depth 1 and depth 5 for intermediate levels (2, 3, 4) requires judgment from both the meta-prompt author and the AI

### Neutral
- Methodology presets are YAML files (`methodology/deep.yml`, `methodology/mvp.yml`, `methodology/custom-defaults.yml`) — simple configuration, no code
- Conditional steps (`conditional: "if-needed"` for database, API, UX phases) are orthogonal to depth — a step can be conditional regardless of its depth setting
- The depth scale replaces mixin axes as the primary customization mechanism — simpler but less granular

## Constraints and Compliance

- Every meta-prompt MUST include a "Methodology Scaling" section with specific guidance for `deep` (depth 5) and `mvp` (depth 1) output
- Scaling guidance MUST be concrete — it must specify what content sections, analysis depth, or artifacts differ between depth levels, not just "more" or "less"
- Methodology presets MUST specify `default_depth` and per-step `enabled` status
- The `custom` methodology MUST support per-step depth overrides and a `default_depth` for steps not explicitly configured
- Changing methodology mid-pipeline MUST NOT invalidate completed steps — re-running at a different depth triggers update mode
- ADR-016 (methodology manifest format) is superseded by this decision

## Related Decisions

- [ADR-016](ADR-016-methodology-manifest-format.md) — Superseded; methodology manifests replaced by depth scale + presets
- [ADR-041](ADR-041-meta-prompt-architecture.md) — Meta-prompt architecture that depth scaling operates within
- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology as top-level organizer (principle preserved, mechanism amended by this ADR)
- [ADR-014](ADR-014-config-schema-versioning.md) — Config schema that carries methodology and depth settings
- Domain 16 ([16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md)) — Resolution logic for depth precedence (preset default < custom default < per-step override)
