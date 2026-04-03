# ADR-004: Methodology as Top-Level Organizer

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 01, 06, 14
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 organizes prompts into a structured pipeline that guides developers through project setup. The pipeline includes choices along multiple dimensions: task tracking (Beads, GitHub Issues, Linear, none), TDD approach (strict, flexible, none), git workflow (trunk-based, gitflow, worktrees), interaction style, and more. These dimensions are called "axes" and each axis has multiple "mixin" options.

The architectural question is: what is the primary organizational principle for the pipeline? Three approaches were considered:

1. **Methodology-first**: Users choose a methodology (e.g., "deep", "mvp") that defines the pipeline shape — phases, prompt ordering, dependencies, and axis defaults. Axes are customization points within the methodology.
2. **Axis-first**: Users independently select options for each axis. The pipeline shape emerges from the combination of selections.
3. **Profile-based**: Predefined bundles of axis selections (e.g., "solo-strict", "team-agile") that users choose from, with limited customization.

This decision affects the init wizard flow (domain 14), config validation (domain 06), and prompt resolution (domain 01).

## Decision

**Methodologies serve as the top-level organizational principle.** Each methodology defines its own pipeline shape — the number and names of phases, prompt ordering within phases, inter-prompt dependencies, and which axes are available with their defaults and valid options. Axes are mixin selection points WITHIN a chosen methodology, not independent top-level choices.

Concretely:
- `.scaffold/config.yml` specifies exactly one methodology (e.g., `methodology: deep`)
- The methodology's manifest file defines the pipeline structure: phases, prompt ordering, dependency graph, and axis configuration (which axes exist, their defaults, and their valid options)
- Users customize by selecting mixin values for the methodology's declared axes (e.g., `task-tracking: github-issues` within the `deep` methodology)
- The init wizard (domain 14) suggests a methodology based on project analysis, then asks axis-level questions within that methodology's constraints

## Rationale

- **Methodologies are coherent philosophies, not mix-and-match parts**: A methodology represents an opinionated workflow — "deep" includes 7 phases, task tracking via Beads, multi-agent parallel execution, and comprehensive documentation. "mvp" might have 4 phases and skip multi-agent setup. These are fundamentally different workflows, not just different values on the same axes. Mixing phases from "deep" with the simplified flow of "mvp" produces an incoherent pipeline with missing dependencies and orphaned prompts.

- **Different methodologies have fundamentally different pipeline shapes**: Deep has phases 0-7 with specific prompt ordering and dependency constraints documented in the Setup Order table. A hypothetical "rapid" methodology might compress this into 3 phases with different prompts entirely. The phase structure is not a parameter — it is a defining characteristic of the methodology. Domain 01, Section 3 (Resolution Rules) shows how the methodology manifest controls prompt ordering and dependency resolution.

- **Axis-first leads to combinatorial explosion**: With 5 axes and 3-5 options each, there are hundreds of combinations. Many are invalid — for example, multi-agent workflows require task tracking (you cannot coordinate agents without a shared task queue). Validating all combinations is intractable. Methodology-first lets the methodology author declare which combinations are valid upfront.

- **Users think in methodologies, not axes**: The init wizard (domain 14, Section 3) asks "how do you want to work?" — a methodology question. Within that answer, it asks about specific tools and preferences — axis questions. This matches how developers think about workflow: "I want a comprehensive, team-oriented setup" (methodology) then "I want to use GitHub Issues instead of Beads" (axis customization).

- **Methodology authors control the full experience**: A methodology author can ensure that all prompts, phases, dependencies, and mixin defaults work together coherently. With axis-first, no single author owns the overall experience — coherence depends on every axis option being compatible with every other, which cannot be guaranteed.

## Alternatives Considered

### Axis-first (pick tools independently)

- **Description**: Users independently select options for each axis (task-tracking, tdd, git-workflow, interaction-style, etc.). The pipeline shape is computed from the combination of selections. No explicit methodology concept.
- **Pros**: Maximum flexibility — users can create any combination. No need to define or maintain methodology manifests. Simple mental model: "pick what you want for each category."
- **Cons**: Invalid combinations are possible and hard to detect (e.g., multi-agent without task tracking, worktree git-workflow without multi-agent). No coherent pipeline ordering — who defines the phases and prompt sequence if no methodology owns it? User must understand all axis interactions to make informed choices. Combinatorial explosion makes testing infeasible. No single author owns the overall experience, so nobody can guarantee coherence. Domain 06 (config validation) would need complex cross-axis constraint rules that grow quadratically with new axes.

### Profile-based (predefined axis bundles)

- **Description**: Offer a set of predefined profiles like "solo-strict" (strict TDD, trunk-based git, no task tracking) or "team-agile" (Beads, flexible TDD, worktree git, multi-agent). Users pick a profile, with limited or no customization.
- **Pros**: Simple selection — just pick a profile name. Guaranteed coherence within each profile. Easy to test (finite number of profiles).
- **Cons**: Limited customization — what if a user wants "team-agile" but with GitHub Issues instead of Beads? Either the profile system must support overrides (becoming methodology + axes in disguise) or users are stuck with the predefined bundle. Profiles proliferate as new combinations are requested. Adding a new axis requires updating every profile. Profiles don't define pipeline shape (phases, ordering) — they're just axis value bundles, so the pipeline structure question remains unanswered.

### Flat prompt list (no organizational principle)

- **Description**: All prompts are listed in a single ordered sequence with optional skip/include flags. No methodologies, no axes, no phases. Users enable or disable individual prompts.
- **Pros**: Simplest possible model. No abstraction to learn. Users see exactly what they get.
- **Cons**: No coherent workflow — users must understand every prompt and its dependencies to make informed skip decisions. No dependency management — skipping a prompt that others depend on breaks the pipeline silently. No mixin injection — each prompt must contain all variants inline, leading to conditional spaghetti. This is essentially v1's model, which v2 is designed to improve upon.

## Consequences

**Note:** The mixin axis mechanism described in some constraints below was superseded by ADR-043 (depth scale). The core principle — methodology as the top-level organizer — remains in effect. Customization is now via depth levels (1-5) and per-step enable/disable, not mixin axes.

### Positive
- Coherent workflows — methodology authors define and test the full pipeline experience end-to-end
- Clear pipeline ordering — phases, prompt sequence, and dependencies are defined in the methodology manifest, not emergent from axis combinations
- Simpler config validation — domain 06 validates axis selections against the methodology's declared constraints, not against a global cross-axis compatibility matrix
- Init wizard flow is natural — pick a methodology first, then customize within its constraints (domain 14, Section 3)
- New methodologies can be added independently — a new methodology is a new manifest + prompts, not a modification to existing logic

### Negative
- Less flexibility than axis-first — users cannot freely mix phases or prompts across methodologies. A user who wants "deep phases 0-3 then rapid phases 4-5" must create a custom methodology
- New methodology creation is non-trivial — the methodology author must define phases, prompt ordering, dependencies, axis defaults, and valid axis values. This is intentional (coherence requires authorial control) but raises the bar for community contributions
- Users may feel constrained if no built-in methodology matches their workflow — the escape hatch is creating a custom methodology, which requires understanding the manifest format (see ADR-016)

### Neutral
- *(Post-ADR-043: depth levels and per-step enable/disable provide meaningful customization within a methodology's constraints, replacing the earlier mixin axis mechanism.)*
- The number of built-in methodologies affects user experience — too few and users feel constrained, too many and selection is overwhelming. Initial v2 ships with 2-3 methodologies (deep, mvp, and potentially a rapid/minimal option)

## Constraints and Compliance

- `.scaffold/config.yml` MUST specify exactly one methodology — multi-methodology configurations are not supported
- Methodology manifests MUST define phases, prompt ordering, dependency overrides, and customization options. *(Post-ADR-043: customization is via depth levels 1-5 and per-step enable/disable, replacing the earlier axis declarations.)* See ADR-016 for the manifest schema
- ~~Mixin selections in config.yml MUST be validated against the chosen methodology's declared axes — selecting an axis or value not declared by the methodology is a validation error (domain 06)~~ *Superseded by ADR-043: customization is now depth level (1-5) and per-step enable/disable. Config validation (domain 06) validates depth and step overrides against the methodology manifest.*
- The init wizard MUST suggest a methodology based on project analysis before asking customization questions (domain 14, Section 3, SmartSuggestion pipeline). *(Post-ADR-043: wizard asks about depth level and step overrides rather than axis selections.)*
- Prompt resolution (domain 01) MUST use the methodology manifest as the authoritative source for pipeline shape — it MUST NOT derive pipeline structure from axis selections or other config fields
- Adding a new methodology MUST NOT require changes to core CLI code — the CLI discovers methodologies by reading manifest files from the methodologies directory

## Related Decisions

- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Prompt resolution system (implements methodology-driven resolution from domain 01)
- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Mixin injection (axes are the customization mechanism within methodologies)
- [ADR-016](ADR-016-methodology-manifest-format.md) — Methodology manifest format (defines the structure methodology authors must follow)
- [ADR-027](ADR-027-init-wizard-smart-suggestion.md) — Init wizard methodology suggestion (how the wizard recommends a methodology)
- Domain 01 ([01-prompt-resolution.md](../domain-models/01-prompt-resolution.md)) — Layered prompt resolution driven by methodology manifests
- Domain 06 ([06-config-validation.md](../domain-models/06-config-validation.md)) — Config validation including methodology-axis compatibility checks
- Domain 14 ([14-init-wizard.md](../domain-models/14-init-wizard.md)) — Init wizard flow with methodology-first question ordering
