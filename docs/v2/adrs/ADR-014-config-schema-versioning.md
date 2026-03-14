# ADR-014: Config Schema — YAML with Integer Versioning and Migration

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 06
**Phase**: 2 — Architecture Decision Records

---

## Context

`.scaffold/config.yml` stores per-project configuration that drives every other Scaffold v2 subsystem: methodology selection, mixin values for each axis, platform targets, project traits, and extra prompts. The config is the first gate in the `scaffold build` pipeline — before prompt resolution, mixin injection, or platform adapters can operate, the config must be valid.

Four interrelated design choices shape the config system: the file format (YAML vs. JSON vs. TOML), the versioning strategy (how to handle schema evolution across CLI releases), the validation approach (when and how errors are caught), and error recovery for typos (how to help users who misspell configuration values).

Domain 06 (Config Schema & Validation System) defines the complete validation pipeline, the fuzzy matching algorithm, the incompatibility detection system, and the migration strategy. The config schema versioning question is identified as an ADR CANDIDATE in domain 06.

## Decision

Four interrelated decisions govern `.scaffold/config.yml`:

1. **YAML format**: Config uses YAML with the `.yml` extension.
2. **Integer versioning**: The config includes a `version` field (integer, starting at 1). Breaking schema changes increment the version. The CLI auto-migrates forward when it encounters an older version.
3. **Three-tier validation**: Validation follows the pipeline defined in domain 06, Section 5: structural/type checks, then manifest reference resolution, then incompatibility warnings.
4. **Fuzzy matching for typo correction**: When a config value doesn't match any valid option, the CLI computes Levenshtein distance against all valid options and suggests matches within distance 2.

## Rationale

**YAML over JSON or TOML**: YAML supports comments, which are essential for a configuration file that users edit by hand. A methodology author can annotate axis values with explanations; a team lead can add notes about why a particular mixin was chosen. JSON does not support comments (JSONC/JSON5 exist but are non-standard). YAML is also more readable for nested structures — no closing braces, no mandatory quoting of keys. TOML supports comments but is less familiar to the target user base (web developers using Node.js) and has fewer mature npm parsers.

**Integer versioning over semver or no versioning**: Config schema changes are infrequent and binary — either the old config works with the new CLI or it doesn't. Semver introduces unnecessary granularity (what would a "patch" version of a config schema mean?). No versioning is dangerous: a breaking change in config schema would silently produce wrong behavior when an old config is loaded by a new CLI. Integer versioning is simple: if `config.version < CLI_EXPECTED_VERSION`, run migrations sequentially (v1 to v2 to v3). Forward-only — no downgrades.

**Three-tier validation**: Catching errors early and in a useful order improves the developer experience. Structural validation (type checks, required fields) catches obvious problems first. Manifest reference validation (does every prompt reference resolve?) catches configuration that is syntactically valid but semantically broken. Incompatibility warnings (agent-mode:manual + git-workflow:full-pr) catch subtle conflicts that might not surface until deep into the pipeline. Domain 06, Section 5 defines this pipeline in detail.

**Fuzzy matching**: Typos in config values are common (e.g., "clasic" instead of "classic" for methodology). Without correction, the error message is "invalid value 'clasic'" — the user must search documentation for valid options. With fuzzy matching, the message becomes "invalid value 'clasic' — did you mean 'classic'? Valid options: classic, classic-lite, lean" — immediately actionable. Levenshtein distance 2 catches common single-character errors (transposition, insertion, deletion, substitution) without producing false matches on completely different strings.

## Alternatives Considered

### JSON format

- **Description**: Use `.scaffold/config.json` with standard JSON format.
- **Pros**: Native to Node.js (`JSON.parse()`). Strict syntax prevents ambiguity. No external parser dependency.
- **Cons**: No comments — users cannot annotate their configuration choices. More verbose than YAML for nested structures (mandatory braces, commas, quoted keys). Less human-friendly for a file that users edit directly.

### TOML format

- **Description**: Use `.scaffold/config.toml` with TOML format.
- **Pros**: Supports comments. Explicit typing (strings vs. integers vs. booleans are unambiguous). Clean table syntax for nested structures.
- **Cons**: Less familiar to web developers — TOML is more common in Rust and Go ecosystems. Fewer mature npm parsers than YAML. Nested structures beyond two levels become awkward with `[section.subsection]` syntax.

### Semver on config schema

- **Description**: Use semantic versioning (e.g., `version: "1.2.3"`) for the config schema.
- **Pros**: More granular migration targeting. Distinguishes breaking vs. non-breaking config changes.
- **Cons**: Overkill for config — minor/patch versions have no clear semantic meaning for a configuration file. Confuses users who may think the config version should match the CLI version. Adds complexity to the migration system (must handle partial version bumps).

### No versioning

- **Description**: No `version` field in config. The CLI always interprets config using its current schema.
- **Pros**: Simplest possible approach. No migration system needed.
- **Cons**: Breaking schema changes silently produce wrong behavior. A renamed field is ignored without error. A removed field is silently dropped. Users have no way to know their config is outdated. The failure mode is "pipeline produces wrong output" — the worst kind of bug because it's silent.

### Compatibility matrix (instead of linear versioning)

- **Description**: Define a matrix of CLI versions and config features they support.
- **Pros**: Allows fine-grained feature detection. Doesn't force linear migration path.
- **Cons**: Complex to maintain — every new feature interaction must be added to the matrix. Hard to reason about — users can't answer "is my config compatible?" without consulting the matrix. Migration logic becomes a graph traversal instead of a simple sequential pipeline.

## Consequences

### Positive
- Comments in YAML enable self-documenting configuration — teams can explain their choices inline
- Integer versioning enables safe, automatic, forward-only migration when the CLI is updated
- Three-tier validation catches errors early with clear, actionable messages at each tier
- Fuzzy matching turns cryptic "invalid value" errors into helpful "did you mean?" suggestions
- Incompatibility warnings alert users to problematic combinations before they cause downstream issues

### Negative
- YAML's indentation sensitivity can cause subtle errors (a misplaced indent changes the structure silently in some cases)
- Migration system must be maintained — every breaking schema change requires a migration function that transforms the old format to the new one
- Fuzzy matching with Levenshtein distance 2 may produce false suggestions for very short values (a 3-character value has many strings within distance 2)
- Incompatibility detection as warnings (not errors) means users can ignore them and proceed with problematic combinations

### Neutral
- The `js-yaml` npm package is a well-maintained dependency but adds to the dependency tree
- Minor CLI updates that add new optional config fields (with defaults) do not increment the config version — this keeps migrations rare but means "version 1" configs may have different shapes depending on when they were created

## Constraints and Compliance

- Config MUST be YAML with the `.yml` extension at the path `.scaffold/config.yml`
- Config MUST include a `version` field (integer, starting at 1)
- Migrations MUST be forward-only — no downgrade path (v1 to v2 to v3, never v3 to v2)
- `scaffold build` MUST auto-run migration if the config version is older than the CLI expects
- Validation MUST happen at build time (during `scaffold build`), not at runtime during prompt execution
- Fuzzy matching MUST use Levenshtein distance with a threshold of 2
- Incompatibility issues MUST be surfaced as warnings, not errors — the build proceeds but the user is informed
- See [ADR-006](ADR-006-mixin-injection-over-templating.md) for mixin injection error handling, including unresolved marker treatment
- See domain 06, Section 5 for the complete validation pipeline specification
- See domain 06, Section 3 for the full config schema type definitions

## Related Decisions

- [ADR-004](ADR-004-methodology-as-top-level-organizer.md) — Methodology selection is a top-level config field
- [ADR-016](ADR-016-methodology-manifest-format.md) — Methodology manifests referenced by config
- [ADR-027](ADR-027-init-wizard-smart-suggestion.md) — Init wizard produces the config schema as its output
- Domain 06 ([06-config-validation.md](../domain-models/06-config-validation.md)) — Full config schema and validation system specification
