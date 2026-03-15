# ADR-016: Methodology Manifest YAML Format

**Status**: superseded (by [ADR-043](ADR-043-depth-scale.md))
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 01, 02
**Phase**: 2 — Architecture Decision Records

---

## Context

Each methodology (e.g., "deep", "mvp", "lean") needs a machine-readable definition that specifies its pipeline shape: which prompts are included, what order they execute in, what phases they belong to, what dependencies exist between them, what axis defaults apply, and which prompts are conditional on project traits. The manifest is the methodology's blueprint — it controls the full pipeline that `scaffold build` produces.

The manifest interacts with two other metadata sources: prompt frontmatter (`depends-on` field, ADR-015) provides per-prompt dependency declarations, and the project config (`config.yml`, ADR-014) provides user-selected axis values and project traits. The manifest must integrate with both without creating conflicting sources of truth.

Domain 01 (Prompt Resolution), Section 5, defines the core resolution algorithms for how prompts are selected and layered. Domain 02 (Dependency Resolution), Section 5, defines the topological sort algorithm that computes the ordered execution list from dependencies declared in both the manifest and frontmatter. The manifest is the primary input to both domains.

## Decision

Methodology manifests use **YAML format** with explicit phase definitions, dependency declarations, prompt-to-phase assignments, axis defaults, and conditional prompt inclusion based on project traits. Dependencies declared in the manifest are **merged with frontmatter dependencies** using union semantics (ADR-011).

**Key manifest contents**:
- **Phases**: Ordered list of named phases (e.g., Phase 0: Prerequisites, Phase 1: Foundation, Phase 2: Architecture)
- **Prompt assignments**: Each prompt is assigned to a phase, with optional conditions tied to project traits (e.g., `expo-setup` only included when `platform: mobile` trait is present)
- **Dependency declarations**: Supplementary dependencies between prompts that aren't declared in frontmatter (methodology-specific ordering constraints)
- **Axis defaults**: Default mixin value for each axis the methodology supports (e.g., `agent-mode: single`, `git-workflow: simple-push`) — used when the user doesn't specify a value in config
- **Optional prompt conditions**: Mapping of project traits to prompts that should be included/excluded

**Key design points**:
- The manifest is the methodology's definition — it controls the full pipeline shape
- Dependencies in the manifest supplement frontmatter `depends-on` (union semantics — the effective dependency set is the union of both sources)
- Orphaned dependencies (referencing non-existent prompts, e.g., from a removed optional prompt) are ignored during resolution and flagged by `scaffold validate`
- Manifest validation occurs at build time: every prompt reference must resolve to an actual prompt file, and circular dependencies are detected and rejected
- Conditional prompts use a declarative trait-matching syntax, not arbitrary code

## Rationale

**YAML over JSON or JavaScript**: YAML supports comments, which are essential for methodology authors documenting their pipeline design choices. A manifest author can explain why a particular dependency exists, why a prompt is conditional, or why an axis default was chosen. JSON lacks comments entirely. JavaScript/TypeScript manifests would support programmatic logic but introduce security concerns (arbitrary code execution during `scaffold build`) and make static validation impossible.

**Explicit phase definitions over implicit ordering**: Phases provide a human-readable grouping that helps users understand pipeline progress ("you're in Phase 2: Architecture"). Without explicit phases, the pipeline is a flat list of prompts — users can't gauge how far along they are or what comes next at a conceptual level. Phases also enable parallel execution within a phase when dependencies allow.

**Union semantics for dependencies**: A prompt's frontmatter may declare `depends-on: [tech-stack]` because it always needs the tech stack decisions. A methodology manifest may add an additional dependency `user-stories -> product-brief` that only applies in the "deep" methodology. Union semantics means both sources contribute to the effective dependency graph without conflicting — the implementation collects all declared dependencies from all sources. This is specified in ADR-011.

**Declarative conditions over arbitrary code**: Conditional prompt inclusion (`expo-setup` only when `platform: mobile`) uses a declarative syntax that can be statically analyzed. The CLI can determine the full pipeline shape at build time without executing any user code. Arbitrary JavaScript conditions would make static analysis impossible and introduce security risks.

## Alternatives Considered

### JSON manifest

- **Description**: Use JSON for methodology manifest files.
- **Pros**: Strict parsing — no YAML-specific gotchas (indentation sensitivity, implicit typing). Native to Node.js.
- **Cons**: No comments — methodology authors cannot document their design choices inline. More verbose than YAML for the nested structures that manifests contain (phases → prompts → conditions). Inconsistent with config.yml and prompt frontmatter which both use YAML (ADR-014, ADR-015).

### JavaScript/TypeScript manifest

- **Description**: Use a JavaScript module that exports the manifest as an object, allowing computed values and programmatic conditions.
- **Pros**: Full programming language for conditions. Can import shared utilities. Type safety with TypeScript.
- **Cons**: Security concerns — `scaffold build` would execute arbitrary user code. Static validation impossible — can't determine the pipeline shape without running the code. Harder for non-programmers (methodology authors may not be developers). Build-time behavior depends on runtime environment.

### No manifest (convention-based)

- **Description**: Infer the pipeline from directory structure (e.g., `prompts/phase-0/`, `prompts/phase-1/`) and frontmatter dependencies only.
- **Pros**: Zero configuration for methodology authors. No manifest file to maintain.
- **Cons**: No way to declare methodology-specific dependencies (only frontmatter deps). No axis defaults. No conditional prompts based on traits. Directory naming conventions are fragile and hard to validate. Different methodologies can't share the same prompt files with different orderings.

## Consequences

### Positive
- Methodology authors have a single, self-documenting file that fully defines their pipeline
- Static validation at build time catches broken references and circular dependencies before any prompts execute
- Union semantics allow prompts and manifests to contribute dependencies independently, reducing coupling
- Conditional prompts based on project traits enable a single methodology to serve multiple project types without separate manifest variants
- Axis defaults ensure every axis has a value even when users don't configure one

### Negative
- Manifest maintenance is required — adding, removing, or reordering prompts requires manifest updates in addition to prompt file changes
- Union semantics mean dependencies come from two sources (frontmatter and manifest), which can make it harder to understand why a particular ordering exists
- **Orphaned dependency risk**: If a methodology removes an optional prompt but fails to clean its dependency edges from the manifest, dependent prompts will execute before their logical prerequisites. The only detection mechanism is `scaffold validate`, which is advisory. A prompt executing against stale or missing predecessor output will produce subtly wrong artifacts with no error signal.

### Neutral
- YAML format is consistent with config.yml and frontmatter, establishing YAML as the universal human-edited format in the scaffold ecosystem
- Conditional prompt syntax must be defined precisely enough for static analysis but flexible enough for real project trait combinations

## Constraints and Compliance

- Manifests MUST be YAML format
- Every prompt reference in a manifest MUST resolve to an actual prompt file — unresolvable references are build-time errors
- Circular dependencies MUST be detected and rejected at build time with a clear error message identifying the cycle
- Axis defaults MUST be provided for every axis the methodology declares
- Manifest dependencies are merged with frontmatter dependencies using union semantics (ADR-011)
- Orphaned dependencies (referencing non-existent prompts) MUST be ignored during resolution and flagged by `scaffold validate`
- Conditional prompt conditions MUST be declarative (trait-matching), not arbitrary code
- See domain 01, Section 5 (core resolution algorithms) for prompt resolution rules and domain 02, Section 8, MQ2 (optional prompt exclusion effects on dependents) for the dependency resolution algorithm's handling of excluded optional prompts

## Related Decisions

- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology as the top-level organizing principle
- [ADR-005](ADR-005-three-layer-prompt-resolution.md) — Prompt resolution layers (base, override, extension)
- [ADR-009](ADR-009-kahns-algorithm-dependency-resolution.md) — Dependency ordering algorithm
- [ADR-011](ADR-011-depends-on-union-semantics.md) — Union semantics for merging frontmatter and manifest dependencies
- [ADR-014](ADR-014-config-schema-versioning.md) — Config schema that references methodology manifests
- [ADR-015](ADR-015-prompt-frontmatter-schema.md) — Frontmatter provides per-prompt metadata merged with manifest
- Domain 01 ([01-prompt-resolution.md](../domain-models/01-prompt-resolution.md)) — Prompt resolution specification
- Domain 02 ([02-dependency-resolution.md](../domain-models/02-dependency-resolution.md)) — Dependency resolution specification
