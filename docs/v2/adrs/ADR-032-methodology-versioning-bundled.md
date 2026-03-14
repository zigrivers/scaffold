# ADR-032: Methodology Versioning Bundled with CLI

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec (Resolved Design Questions)
**Domain(s)**: 06, 16
**Phase**: 2 — Architecture Decision Records

---

## Context

Built-in methodologies evolve with the CLI — new prompts are added, phases are reorganized, dependencies are updated, and mixin options change. The question is whether methodologies should have independent version numbers with their own upgrade paths, or whether they should be bundled with the CLI version.

Independent versioning would enable users to pin a methodology version and upgrade it separately from the CLI. Bundled versioning means a CLI upgrade may change methodology content — prompts, phases, and dependencies could differ between CLI versions.

This decision is closely related to the community marketplace deferral (ADR-031): independent methodology versioning becomes more important when third-party methodologies exist, since those methodologies evolve on a different cadence than the CLI.

## Decision

Methodology versioning is bundled with the CLI. Built-in methodologies do not have independent version numbers. The CLI version implicitly versions all built-in methodologies. This decision may be revisited when community or third-party methodologies emerge.

Concretely:
- Built-in methodology manifests do not contain a `version` field
- When a user upgrades the CLI, built-in methodology content may change (new prompts, reorganized phases, updated dependencies)
- These changes are documented in the CLI changelog, not in per-methodology changelogs
- Custom/local methodologies (in `.scaffold/methodologies/` or via npm packages) are not versioned by scaffold — the user manages their versions via git or npm

## Rationale

**Simpler for Phase 1-3**: Independent methodology versioning requires a version field in manifests, a compatibility matrix (which methodology versions work with which CLI versions), migration logic (what to do when a methodology version changes), and version pinning in config (so users can hold a methodology version while upgrading the CLI). Bundled versioning eliminates all of this — one version to track, one upgrade path, one changelog.

**Fewer moving parts**: With bundled versioning, `npm update scaffold` upgrades everything — CLI code, built-in prompts, and methodology definitions. Users don't need to separately upgrade methodologies or check compatibility. The upgrade experience is: read the changelog, run the update, continue working.

**Built-in methodologies are tightly coupled to the CLI**: The CLI's prompt resolution engine, mixin injection system, and state management all assume specific manifest fields and prompt structures. When the CLI changes how it processes manifests (e.g., adding a new frontmatter field), built-in methodologies must be updated simultaneously. Independent versioning would create version skew where a methodology is "compatible" with a CLI version but doesn't use its new features.

**CLI updates changing methodology content is expected**: The whole point of CLI updates is to improve the pipeline — better prompts, better phase organization, better defaults. Users expect improvements when they upgrade. Documenting methodology changes in the CLI changelog makes these improvements visible without requiring users to manage a separate upgrade.

**Third-party methodologies are a future concern**: When community methodologies emerge (ADR-031), their authors will naturally version their work via npm semver or git tags. The methodology loading system already supports npm packages, which have built-in versioning. Adding a `version` field to manifests and compatibility constraints is a future enhancement that does not need to be designed now.

## Alternatives Considered

### Independent Methodology Versioning

- **Description**: Each methodology has its own version number (e.g., `classic v2.1.0`). The CLI declares which methodology versions it supports. Users pin methodology versions in config.
- **Pros**: Clear compatibility matrix — users know exactly which methodology version they are using. Safe upgrades — upgrading the CLI doesn't change methodology behavior until the user explicitly upgrades the methodology. Enables methodology authors to iterate independently of CLI releases.
- **Cons**: Version proliferation — users must track CLI version AND methodology version. Migration matrix complexity — every CLI version must declare compatibility with every methodology version. Pinned versions create stale pipelines (user on methodology v1 while v3 is current). Overkill for Phase 1-3 when all methodologies are built-in and tightly coupled to the CLI.

### Semantic Versioning on Methodologies

- **Description**: Each methodology uses semver (e.g., `classic 1.2.3`) with breaking changes in major, new prompts in minor, and bug fixes in patch.
- **Pros**: Communicates the nature of changes clearly. Users can adopt minor/patch updates with confidence and evaluate major updates carefully.
- **Cons**: Semver granularity is overkill for a bundled methodology — what constitutes a "patch" vs. "minor" change in a methodology? Is a rewording of a prompt a patch or a minor? Is adding an optional prompt a minor or a major? The semantic boundaries are unclear for pipeline configurations. Requires maintaining semver discipline for each methodology independently.

### Lock Methodology Version in Config

- **Description**: `.scaffold/config.yml` includes a `methodology-version` field that pins the methodology to a specific version. CLI upgrades don't change methodology behavior until the user updates this field.
- **Pros**: Stability — the pipeline behaves identically until the user explicitly changes it. Reproducibility — two users with the same config get the same pipeline.
- **Cons**: Requires version pinning management (what happens when the pin is very old?). Requires migration tooling (how to upgrade from methodology v1 to v3). Creates stale pipelines by default — users who never update the pin miss improvements. The init wizard must choose a version to pin, adding complexity to the already 22-state wizard flow.

## Consequences

### Positive
- One version to track — the CLI version is the only version number users need to know
- One upgrade path — `npm update scaffold` upgrades everything, including methodology content
- No migration matrix — no need to track which methodology versions work with which CLI versions
- Simpler config — no `methodology-version` field to manage or explain

### Negative
- CLI upgrades may change methodology behavior unexpectedly — a user's pipeline could produce different output after a CLI update (mitigated by documenting methodology changes in the changelog)
- No version pinning — users who need pipeline stability must pin the entire CLI version, not just the methodology
- Third-party methodology authors cannot declare compatibility constraints against the CLI (until a future enhancement adds this)

### Neutral
- Custom/local methodologies manage their own versions via git or npm — scaffold does not impose versioning on user-created methodologies
- When third-party methodologies emerge, adding a `version` field to the manifest format is a backward-compatible change — existing manifests without a version field are treated as "bundled with CLI"

## Constraints and Compliance

- Built-in methodologies MUST NOT have independent version numbers — no `version` field in built-in methodology manifests
- CLI upgrades MAY change methodology content — these changes MUST be documented in the CLI changelog
- Custom methodologies MUST NOT be versioned by scaffold — users manage their own versions via git or npm
- Methodology manifest format (ADR-016) SHOULD accommodate a future optional `version` field for third-party methodologies — do not design the manifest in a way that precludes adding versioning later
- The `version` field in `.scaffold/config.yml` refers to the config schema version (ADR-014), not the methodology version — these are separate concepts

## Related Decisions

- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology as the organizing principle whose versioning this ADR governs
- [ADR-014](ADR-014-config-schema-versioning.md) — Config schema versioning (separate from methodology versioning)
- [ADR-031](ADR-031-community-marketplace-deferred.md) — Marketplace deferral that makes independent versioning less urgent
- Domain 01 ([01-prompt-resolution.md](../domain-models/01-prompt-resolution.md)) — Prompt resolution that loads methodologies and depends on their content
