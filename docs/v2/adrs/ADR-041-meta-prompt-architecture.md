# ADR-041: Meta-Prompt Architecture Over Hard-Coded Prompts

**Status**: accepted
**Date**: 2026-03-14
**Deciders**: v2 spec, meta-prompt architecture design
**Domain(s)**: 01 (retired), 04 (retired), 12 (retired)
**Phase**: 2 — Architecture Decision Records
**Supersedes**: ADR-005, ADR-006, ADR-007, ADR-008, ADR-023, ADR-035, ADR-037

---

## Context

Scaffold v1 maintains 29+ hard-coded prompts in a monolithic `prompts.md` file. Each prompt contains detailed execution instructions, domain expertise, tool-specific commands, and formatting requirements — all tightly coupled into a single block of text. Adding a new methodology or updating domain knowledge requires editing every affected prompt individually.

The v2 design initially proposed a three-layer prompt resolution system (base/override/extension) with mixin injection, abstract task verb markers, and methodology manifests. While this modularized the pipeline, it introduced significant architectural complexity — six source layer types, a three-location lookup chain, mixin marker syntax, subsection targeting, and phrase-level tool mapping — without addressing the fundamental problem: domain expertise was still embedded in static prompt text.

Two insights motivate this decision:

1. **AI can generate contextual prompts at runtime.** Instead of maintaining detailed hard-coded prompts that attempt to cover every scenario, we can declare the *intent* of each step and let the AI generate the appropriate working prompt based on project context, methodology depth, and user instructions. The AI already understands how to write good prompts — it just needs to know what the step should accomplish.

2. **Separation of intent from expertise.** Hard-coded prompts conflate two concerns: what the step should do (intent) and what domain knowledge is needed to do it well (expertise). Separating these allows each to evolve independently.

## Decision

Replace the hard-coded prompt pipeline with a **meta-prompt architecture** consisting of three components:

1. **Meta-prompts** (one per pipeline step, 30-80 lines each): Compact declarations of step intent — purpose, inputs, outputs, quality criteria, and methodology-scaling guidance. Meta-prompts do NOT contain the actual prompt text the AI executes; they describe what the step should accomplish.

2. **Knowledge base** (topic-organized domain expertise): Comprehensive markdown documents covering domain expertise — what makes a good architecture document, how to review an API contract, common failure modes in database schema design, etc. Meta-prompts reference knowledge base entries by name.

3. **Runtime assembly**: At execution time, the CLI assembles a single prompt from meta-prompt + knowledge base entries + project context (prior artifacts, config, state) + user instructions. The AI receives this assembled prompt, generates a working prompt tailored to the specific project and methodology depth, and executes it.

This replaces the v2 three-layer resolution system (ADR-005), mixin injection (ADR-006), mixin markers (ADR-007), abstract task verbs (ADR-008), phrase-level tool mapping (ADR-023), non-recursive injection constraints (ADR-035), and task verb global scope (ADR-037). Those mechanisms are no longer needed because the AI adapts natively to project context, tool availability, and methodology requirements without requiring static marker systems or injection pipelines.

## Rationale

**Hard-coded prompts are a maintenance liability.** Every prompt embeds domain knowledge, tool-specific commands, formatting instructions, and conditional logic. When domain understanding improves (e.g., a better approach to architecture reviews), the improvement must be manually propagated to every affected prompt. With meta-prompts, domain knowledge lives in the knowledge base and automatically applies to every step that references it.

**The v2 layering system solved the wrong problem.** Three-layer resolution, mixin injection, and abstract task verbs are mechanisms for composing static text. They add architectural complexity (six source layer types, three-location lookup, marker syntax, injection passes) to achieve what AI does naturally: adapt output to context. The meta-prompt approach eliminates this entire class of complexity.

**AI capabilities make static prompt text unnecessary.** Modern AI models can generate high-quality, context-appropriate prompts from a declaration of intent plus domain expertise. The model does not need every sentence spelled out — it needs to know the goal, the inputs, the expected outputs, and what "good" looks like. This is precisely what a meta-prompt provides.

**Bounded non-determinism is an acceptable trade-off.** Meta-prompts introduce non-determinism — the same step may produce slightly different working prompts on different runs. This is bounded by the meta-prompt's quality criteria and the knowledge base's domain expertise, which together constrain the output space. The trade-off is acceptable because the alternative (deterministic hard-coded prompts) sacrifices adaptability and imposes a high maintenance burden for marginal reproducibility benefits.

## Alternatives Considered

### Keep Hard-Coded Prompts (v1 Status Quo)

- **Description**: Continue maintaining all prompt text directly in `prompts.md` and `commands/` files.
- **Pros**: Fully deterministic — same prompt text every time. No runtime assembly complexity. Users can read exactly what will be sent to the AI.
- **Cons**: 29+ prompts to maintain. Domain knowledge duplicated across prompts. Adding a new methodology requires writing every prompt from scratch. Updates to domain understanding must be propagated manually. Does not scale.

### Three-Layer Resolution with Mixins (v2 Original Design)

- **Description**: Base prompts, methodology overrides/extensions, and user customizations composed via mixin injection with abstract task verb markers (ADRs 005-008, 023, 035, 037).
- **Pros**: Deterministic composition. Modular — knowledge in mixins, execution in base prompts. Methodology-specific behavior via overrides.
- **Cons**: High architectural complexity (six source layers, injection passes, marker syntax, subsection targeting). Mixin maintenance burden approaches prompt maintenance burden. Still embeds domain knowledge in static text — just in more files. Combinatorial explosion across methodologies and mixin axes.

### Template-Based Prompt Generation (Build-Time)

- **Description**: Use a template engine (Handlebars, Jinja) to generate prompts at build time from templates + variables.
- **Pros**: Deterministic output. Familiar templating patterns. Variables can encode methodology differences.
- **Cons**: Templates still embed domain knowledge in static text. Template conditionals for methodology scaling become complex. Does not leverage AI's ability to adapt — uses 1990s-era text composition for a problem AI solves natively.

## Consequences

### Positive
- Dramatically reduces maintenance burden — 36 meta-prompts (30-80 lines each) replace 29+ hard-coded prompts (200-500 lines each)
- Domain knowledge is separated, reusable, and independently improvable via the knowledge base
- New methodologies require only depth-scale configuration, not new prompt text
- Each step naturally adapts to project context — no conditional logic or branching in prompt text
- Eliminates the entire v2 layering/injection/marker architecture (ADRs 005-008, 023, 035, 037)

### Negative
- Introduces bounded non-determinism — the same step may produce slightly different working prompts across runs
- Knowledge base quality becomes a critical success factor — poor domain expertise produces poor prompts regardless of meta-prompt quality
- Debugging requires understanding the assembly pipeline — users cannot simply read a single file to see what the AI will receive
- Runtime assembly adds latency compared to reading pre-built prompts

### Neutral
- Pipeline step inventory (which steps exist and their dependencies) is unchanged from v2 — only the mechanism for producing prompts changes
- The `commands/` directory continues to exist as thin wrappers that trigger assembly, maintaining plugin compatibility
- Users can still inspect the assembled prompt via CLI flags for transparency

## Reversibility

Effectively irreversible. Reverting would require reimplementing the three-layer resolution system, mixin injection mechanics, and build-time assembly — the systems this decision explicitly eliminates. All downstream ADRs (042-046), domain models (15, 16), and the assembly engine depend on this decision.

## Constraints and Compliance

- Meta-prompts MUST NOT contain actual prompt text — they declare intent (purpose, inputs, outputs, criteria, scaling guidance)
- Meta-prompts MUST NOT contain tool-specific commands (no `bd create`, no `gh issue`, no shell commands)
- Meta-prompts MUST include methodology scaling guidance with specific direction for depth 1 and depth 5 output
- Knowledge base entries MUST be topic-organized (not step-organized) to prevent duplication
- Knowledge base entries MUST be methodology-independent — depth scaling is the meta-prompt's concern
- The assembled prompt MUST include all components: system framing, meta-prompt content, knowledge base entries, project context, methodology/depth settings, and user instructions
- Retired domain models (01, 04, 12) MUST be marked as superseded, not deleted

## Related Decisions

- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Superseded; three-layer resolution replaced by meta-prompt + knowledge base
- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Superseded; mixin injection unnecessary with AI-native adaptation
- [ADR-007](ADR-007-mixin-markers-subsection-targeting.md) — Superseded; marker syntax eliminated
- [ADR-008](ADR-008-abstract-task-verbs.md) — Superseded; task verbs unnecessary with AI tool awareness
- [ADR-023](ADR-023-phrase-level-tool-mapping.md) — Superseded; phrase-level mapping replaced by AI-native tool selection
- [ADR-035](ADR-035-non-recursive-injection.md) — Superseded; injection constraints no longer applicable
- [ADR-037](ADR-037-task-verb-global-scope.md) — Superseded; task verb scope no longer applicable
- [ADR-042](ADR-042-knowledge-base-domain-expertise.md) — Knowledge base design (companion decision)
- [ADR-044](ADR-044-runtime-prompt-generation.md) — Runtime assembly mechanism (companion decision)
- [ADR-045](ADR-045-assembled-prompt-structure.md) — Assembled prompt structure (companion decision)
- Domain 15 ([15-assembly-engine.md](../domain-models/15-assembly-engine.md)) — Runtime assembly engine implementing the meta-prompt architecture
- Domain 16 ([16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md)) — Methodology and depth resolution system
