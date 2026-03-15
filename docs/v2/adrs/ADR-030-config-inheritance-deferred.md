# ADR-030: Config Inheritance Deferred

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 06
**Phase**: 2 — Architecture Decision Records

---

## Context

Users working on multiple scaffold projects may want global defaults (`~/.scaffold/defaults.yml`) that apply to all projects, overridden by project-specific `.scaffold/config.yml`. This would enable team-wide or personal default methodologies, mixin preferences, and platform selections without repeating them in every project.

For example, a developer who always uses `methodology: deep`, `task-tracking: github-issues`, and `tdd: strict` would define these once in their global defaults and only override per-project when needed. A team lead could distribute a shared defaults file that standardizes methodology choices across the organization.

However, config inheritance introduces complexity in merge semantics, conflict resolution, and debugging — users need to understand which config source contributed which value, and tooling needs to surface this provenance clearly.

## Decision

Config inheritance is explicitly deferred from Phase 1-3 scope. Per-project `.scaffold/config.yml` is the only configuration source. No `~/.scaffold/defaults.yml` support is implemented.

This is a conscious scope decision, not a rejection of the feature. The design of `.scaffold/config.yml` should not make future inheritance impossible, but Phase 1-3 implementations must not depend on or assume inheritance exists.

## Rationale

**The most important use case is already covered**: Per-project configuration handles the core workflow — a user runs `scaffold init`, the wizard generates a config, and that config drives the pipeline. Every project has its own config with its own choices. This is the 90% case.

**Inheritance adds debugging complexity**: When a value comes from `~/.scaffold/defaults.yml` but is overridden by `.scaffold/config.yml`, users must understand the merge precedence to debug unexpected behavior. "Where did this value come from?" is a question that config inheritance makes harder to answer. Error messages must report the source of each value, validation must handle merged configs, and the wizard must show which values are inherited vs. project-specific.

**Merge semantics are non-trivial**: Should nested objects be deep-merged or shallow-replaced? If global defaults define `mixins: { task-tracking: beads }` and the project config defines `mixins: { tdd: strict }`, does the result include both, or does the project config replace the entire `mixins` object? Every merge strategy has edge cases that confuse users.

**Not critical for launch**: Config inheritance is a convenience feature — it saves users from repeating config values across projects. The wizard's smart suggestion algorithm (ADR-027) already reduces the effort of configuring each project. The marginal benefit of inheritance over smart defaults does not justify the Phase 1-3 implementation cost.

**Local prompt customization is separate**: The ability to customize prompts via `~/.scaffold/prompts/` (local methodology/prompt lookup) is a different feature from config inheritance and works independently. Prompt customization does not require config inheritance.

## Alternatives Considered

### Implement Now

- **Description**: Build `~/.scaffold/defaults.yml` support in Phase 1, with deep merge and provenance tracking.
- **Pros**: Better UX for users with multiple projects. Teams can standardize defaults without per-project configuration. Feature is available from launch.
- **Cons**: Scope creep — adds merge logic, provenance tracking, debugging tools, and documentation. Delays Phase 1 delivery. The feature can be added later without breaking existing configs (additive change).

### Environment Variables as Defaults

- **Description**: Allow environment variables (e.g., `SCAFFOLD_METHODOLOGY=deep`) to serve as defaults, overridden by config file values.
- **Pros**: Familiar pattern for developers. Works with existing shell profile infrastructure. No new file format to define.
- **Cons**: Invisible configuration — environment variables are not visible in the project directory, making it hard to understand why a project behaves a certain way. Nested values (mixins, platforms) are awkward to express as environment variables. Hard to document the full set of supported variables and their mapping to config fields.

### Never Implement (Per-Project Only Forever)

- **Description**: Permanently commit to per-project config as the only configuration source. No global defaults ever.
- **Pros**: Simplest possible model. Every project is fully self-contained. No provenance ambiguity.
- **Cons**: Users who work on many projects must repeat configuration choices. Organizations cannot standardize defaults without distributing config templates out-of-band. As the user base grows, this friction will increase.

## Consequences

### Positive
- Phase 1-3 implementation is simpler — no merge logic, no provenance tracking, no debugging tools for inheritance
- Every project's configuration is fully self-contained in `.scaffold/config.yml` — no hidden configuration from other sources
- Debugging is straightforward — the config file is the single source of truth

### Negative
- Users with multiple projects must configure each project independently (mitigated by the init wizard's smart suggestions)
- Teams cannot distribute default preferences through scaffold's config system — they must use external tooling (shared scripts, documentation, or template repos)

### Neutral
- The deferral is explicitly documented — future implementers know this was a conscious decision, not an oversight
- The config schema (ADR-014) is designed to be additive — adding inheritance later would add a merge step before validation, not change the config format itself

## Constraints and Compliance

- Phase 1-3 implementations MUST NOT assume config inheritance exists — no code should check `~/.scaffold/defaults.yml` or any parent directory for config files
- Config loading MUST read only `.scaffold/config.yml` — no parent directory traversal, no home directory lookup
- Config schema design SHOULD accommodate future inheritance — do not make design choices that would prevent adding inheritance later (e.g., do not use config fields that would conflict with a `defaults` or `extends` field)
- The init wizard SHOULD provide good defaults via smart suggestion (ADR-027) to mitigate the absence of global defaults

## Related Decisions

- [ADR-014](ADR-014-config-schema-versioning.md) — Config schema that would be the target of inheritance
- [ADR-027](ADR-027-init-wizard-smart-suggestion.md) — Smart suggestions partially mitigate the need for global defaults
