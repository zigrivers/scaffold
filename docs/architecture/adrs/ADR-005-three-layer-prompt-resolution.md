# ADR-005: Three-Layer Prompt Resolution with Customization Precedence

**Status**: superseded (by [ADR-041](ADR-041-meta-prompt-architecture.md))
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 01
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 introduces a modular architecture where prompts can originate from three distinct sources: the CLI's built-in prompt library (base prompts, methodology overrides, methodology extensions), methodology-specific overrides and extensions, and user customizations at the project or user level. The system must define how these layers interact, which takes precedence when multiple layers provide the same prompt, and how frontmatter metadata merges across layers.

The core tension is between flexibility (allowing users to customize any prompt) and safety (preventing customizations from accidentally breaking the pipeline by removing critical dependencies or producing prompts that lack required frontmatter fields). Domain model 01 (Layered Prompt Resolution System) explored this design space extensively, identifying six distinct source layer types and a three-location lookup chain.

Additionally, users need the ability to add entirely new prompts to the pipeline via `extra-prompts` in `config.yml`. These must coexist with the customization layer without creating slug collisions or ambiguous resolution paths.

## Decision

Implement a three-layer prompt resolution system with strict customization precedence:

1. **Base layer**: Built-in prompts shipped with the CLI (base prompts shared across methodologies, methodology overrides, and methodology extensions).
2. **Methodology layer**: Overrides and extensions declared in the methodology manifest that replace or augment base prompts.
3. **Customization layer**: User-provided prompts that override built-in prompts, with project-level taking precedence over user-level.

The precedence chain for any given prompt slug is: **project-custom** (`.scaffold/prompts/`) > **user-custom** (`~/.scaffold/prompts/`) > **built-in** (resolved via methodology manifest). First match wins.

Customizations MUST have a corresponding built-in prompt to override. Prompts that exist only as customizations (no built-in equivalent) must use the `extra-prompts` mechanism in `config.yml` instead. Extra prompts cannot share a slug with any manifest prompt — collisions produce a `RESOLUTION_DUPLICATE_SLUG` error.

Override prompts are complete file-level replacements of the base prompt — the override file's content replaces the base file's content entirely. There is no content-level merging between the override and base prompt bodies. Frontmatter fields follow their respective merge strategies (union for `depends-on`, replace for everything else — see ADR-011).

Six source layer types are tracked in the resolved prompt record: `base`, `override`, `ext`, `project-custom`, `user-custom`, and `extra`.

## Rationale

- **Safety through required built-in existence**: Customizations always have a built-in to fall back on for frontmatter defaults and dependency declarations. This ensures the dependency graph and pipeline structure remain derivable even if a custom prompt omits frontmatter fields (domain 01, Section 8, Mandatory Question 2). Without this constraint, a standalone customization with missing `depends-on` would silently break pipeline ordering.
- **Three locations, not arbitrary depths**: Three lookup locations (project directory, user home directory, CLI built-ins) map to three real-world use cases: project-specific overrides shared via version control, personal preferences applied across all projects, and the default behavior. More layers would add complexity without corresponding use cases.
- **Extra-prompts as a separate mechanism**: Standalone custom prompts (those with no built-in equivalent) are conceptually different from overrides — they add to the pipeline rather than replacing something. Using `extra-prompts` in `config.yml` makes this distinction explicit and prevents accidental slug collisions that would silently shadow a built-in prompt.
- **Determinism**: Given identical inputs (config, manifest, file system), resolution always produces the same output. The precedence chain is a simple first-match lookup with no ambiguity (domain 01, Section 9, Key Property 1).

## Alternatives Considered

### Single-Layer (Built-In Only)
- **Description**: No customization mechanism. Users must fork the entire prompt library to make changes.
- **Pros**: Simplest implementation. No precedence logic, no frontmatter merging, no customization edge cases.
- **Cons**: Forces users to maintain a full fork for any customization, making upgrades painful. Does not support team-specific or project-specific prompt tailoring, which is a core v2 requirement for the "Team Lead" persona (Jordan).

### Two-Layer (Built-In + Project Override)
- **Description**: Only project-level customizations in `.scaffold/prompts/`. No user-level customization directory.
- **Pros**: Simpler precedence chain. All customizations are version-controlled with the project.
- **Cons**: No mechanism for personal preferences that span projects (e.g., a user who always wants a modified `coding-standards` prompt). The "Solo AI-First Developer" persona (Alex) benefits from user-level customizations that apply across all scaffolded projects.

### Arbitrary Layers (N Override Directories)
- **Description**: Allow any number of override directories configured in a chain (e.g., organization-level, team-level, project-level).
- **Pros**: Maximum flexibility for complex organizational structures.
- **Cons**: Precedence becomes harder to reason about. Debugging "which file actually got used?" becomes an investigation. Frontmatter merging across N layers introduces combinatorial complexity. The three-layer design covers all identified use cases without this complexity.

### Allow Standalone Customizations Without Built-In
- **Description**: Custom prompts in `.scaffold/prompts/` or `~/.scaffold/prompts/` can exist without a corresponding built-in. They would be treated as additions to the pipeline.
- **Pros**: Simpler for users who want to add a prompt without touching `config.yml`.
- **Cons**: Creates ambiguity — is a custom prompt an override or an addition? Without the built-in, there is no base frontmatter for defaults, no base `depends-on` for union merging, and no phase assignment from the manifest. The `extra-prompts` mechanism exists precisely for this case and makes the intent explicit.

## Consequences

### Positive
- Users can customize any built-in prompt at the project or user level without forking the prompt library
- Project-level customizations are version-controlled and shared across team members
- User-level customizations provide personal preferences across all projects
- Extra-prompts provide a clean mechanism for adding new prompts without slug collision risk
- The source layer is recorded in each resolved prompt, enabling clear diagnostics ("this prompt came from .scaffold/prompts/tech-stack.md, overriding base:tech-stack")

### Negative
- Customizations that need to exist without a built-in must use the separate `extra-prompts` mechanism, which requires editing `config.yml`
- Three file system lookups per prompt slug during resolution (project, user, built-in), though this is fast since paths are directly constructed, not searched
- Users may be confused by the distinction between customizations (override an existing prompt) and extra-prompts (add a new prompt)

### Neutral
- Frontmatter merging rules differ by field: `depends-on` uses union semantics (see ADR-011), all other fields use replacement semantics. This asymmetry is intentional but must be clearly documented.

## Constraints and Compliance

- Customization files MUST correspond to a built-in prompt with the same slug. A customization for a non-existent built-in produces error `RESOLUTION_CUSTOMIZATION_NO_BUILTIN`.
- Extra prompts MUST NOT share a slug with any manifest prompt. Collisions produce error `RESOLUTION_DUPLICATE_SLUG` (domain 01, Section 6, Edge Case 13).
- The resolution algorithm MUST check the three locations in order: `.scaffold/prompts/<slug>.md`, `~/.scaffold/prompts/<slug>.md`, built-in path. First match wins.
- The `sourceLayer` field on `ResolvedPrompt` MUST accurately reflect which layer provided the content (domain 01, Section 3, Entity Model).
- Extra prompts that omit `phase` in frontmatter default to phase 7 (Implementation). Extra prompts that omit `depends-on` participate in dependency resolution with no prerequisites (domain 01, Section 8, MQ4).
- Unknown traits referenced in optional prompt conditions evaluate to false, causing the prompt to be excluded. This prevents undefined traits from silently including prompts.
- Implementers MUST NOT allow customizations to silently shadow extra-prompts or vice versa — slug uniqueness is enforced across all layers.

## Related Decisions

- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology manifest structure that defines the built-in prompt set
- [ADR-006](ADR-006-mixin-injection-over-templating.md) — Mixin injection processes prompts after resolution, regardless of source layer
- [ADR-011](ADR-011-depends-on-union-semantics.md) — Union semantics for `depends-on` when custom prompts add dependencies
- ADR-015 — Frontmatter schema defining the fields that are merged across layers
- Domain 01 ([01-prompt-resolution.md](../domain-models/01-prompt-resolution.md)) — Full resolution algorithm, precedence chain, and edge cases
