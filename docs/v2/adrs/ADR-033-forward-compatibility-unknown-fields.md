# ADR-033: Forward Compatibility — Unknown Fields as Warnings

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec, domain modeling phase 1
**Domain(s)**: 06, 08
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold configuration files (`config.yml`), prompt frontmatter (YAML headers in `.md` files), and methodology manifests (`manifest.yml`) all have defined schemas with known fields. As scaffold evolves, new fields will be added to these schemas — a v2.3 CLI might introduce a `parallelism` field in config.yml that v2.1 does not recognize. Additionally, users working on the same project may run different CLI versions (a team member on v2.1 opens a project configured by a colleague on v2.3).

The question is: what should a scaffold CLI do when it encounters a field it does not recognize in any of these schema-validated files?

Three behaviors are possible: treat unknown fields as errors (strict validation), silently ignore them, or emit warnings while continuing to operate. The choice affects forward compatibility (older CLI reading newer config), typo detection (catching `dependson` when the user meant `depends-on`), and the upgrade experience (whether users can adopt new features incrementally without forcing all team members to upgrade simultaneously).

Domain 06 (Config Validation) defines the validation pipeline for `config.yml`, including schema version checking and field validation. Domain 08 (Prompt Frontmatter) defines the frontmatter schema and its validation rules during `scaffold build` and `scaffold validate`.

## Decision

Unknown fields in `config.yml`, prompt frontmatter, and methodology manifests produce warnings, not errors. The scaffold CLI logs each unknown field with its location (file path and field path), continues processing, and exits with code 0 (success) unless other actual errors are present. The warning message includes the field name, a suggestion to check for typos, and a note that the field may be from a newer scaffold version.

Specifically:
- **config.yml**: Unknown top-level keys and unknown nested keys within known sections produce warnings. The unknown fields are preserved in memory during processing (not stripped) so that writing config back to disk does not lose them.
- **Prompt frontmatter**: Unknown fields produce warnings during `scaffold build` and `scaffold validate`. The unknown fields are passed through to the built prompt without modification.
- **Methodology manifests**: Unknown fields in `manifest.yml` produce warnings during methodology loading. The manifest is still considered valid if all required fields are present.

The warning format is standardized: `warning: unknown field "<field>" in <file>:<path> (possible typo, or from a newer scaffold version)`.

## Rationale

**Config files are shared across teams with different CLI versions**: In a team of five developers, one may upgrade to the latest scaffold CLI while others remain on an older version. If the upgrader runs `scaffold init` or edits `config.yml` and the new CLI writes a field that older CLIs don't recognize, strict validation would break the project for every other team member. This is unacceptable — config files checked into version control should not become version-coupled landmines.

**Silent ignore hides typos**: The most common reason a user writes an unknown field is a typo — `dependson` instead of `depends-on`, `methodoogy` instead of `methodology`, `platfroms` instead of `platforms`. Silently ignoring unknown fields would let these typos pass without any feedback, causing the user to wonder why their configuration change had no effect. This is a poor debugging experience. Warnings surface the typo immediately while not blocking the user's workflow.

**Warnings are the established pattern in the ecosystem**: Package managers (npm, pip), linters (ESLint), and build tools (webpack) all use warnings for unrecognized configuration. Users are trained to notice warnings and investigate them. The pattern is well understood and does not require documentation to explain.

**Preserving unknown fields prevents data loss**: When scaffold reads `config.yml`, modifies a known field, and writes it back, preserving unknown fields ensures that a newer CLI's fields are not lost. This is critical for round-trip compatibility — a v2.1 CLI editing a v2.3-created config should not strip the `parallelism` field just because it doesn't know about it.

## Alternatives Considered

### Strict Validation — Unknown Fields Are Errors

- **Description**: Any field not in the schema is treated as a validation error. `scaffold validate` and `scaffold build` exit with code 1. The user must remove the unknown field before proceeding.
- **Pros**: Catches typos immediately and unambiguously. Schema is always the single source of truth. No ambiguity about whether a field is being used.
- **Cons**: Breaks forward compatibility entirely. An older CLI cannot read config files created by a newer CLI. Teams must upgrade in lockstep. Users who want to experiment with future features cannot add fields to their config without breaking their current CLI. This is the behavior that motivated this ADR — strict validation was considered and rejected because of the lockstep upgrade requirement.

### Silent Ignore — Unknown Fields Dropped Without Feedback

- **Description**: Unknown fields are silently ignored during validation and stripped from the in-memory representation. No warnings, no errors. Processing continues as if the field did not exist.
- **Pros**: Maximum forward compatibility — any config file works with any CLI version. Simplest implementation (skip unknown fields during parsing).
- **Cons**: Typos are invisible. A user who writes `dependson` instead of `depends-on` will see no feedback and spend time debugging why their dependency is not working. This is the most common failure mode in practice and the strongest argument against silent ignore. Additionally, if the CLI writes config back to disk after silent ignore, the unknown fields are lost — breaking the round-trip guarantee for newer CLI versions' fields.

### Configurable Strictness Level

- **Description**: A CLI flag or config option (`validation.unknownFields: error | warn | ignore`) lets users choose the behavior per project.
- **Pros**: Flexible — strict teams can enforce strict validation, relaxed teams can use warnings or ignore.
- **Cons**: Adds a meta-configuration decision that users must understand before they can use scaffold. The default behavior still needs to be defined, and the choice of default is the same decision this ADR makes. The flexibility adds complexity without solving the core problem — the default needs to be right for most users.

## Consequences

### Positive
- Older scaffold CLI versions can read and process config files created by newer versions without breaking — forward compatibility is maintained
- Typos in field names are surfaced immediately via warnings, enabling quick correction
- Round-trip preservation of unknown fields means newer CLI features' config values are not lost when an older CLI edits the file
- Teams can upgrade scaffold CLI versions independently without coordinating upgrades across all members

### Negative
- Warnings may be ignored by users who are accustomed to dismissing warnings, meaning typos could persist unnoticed for some time
- The warning message must distinguish between "this is probably a typo" and "this is probably from a newer version" — both cases produce the same warning, which may confuse users who know they are on the latest version (and therefore the field is likely a typo, not a newer feature)
- Preserving unknown fields in memory and during write-back adds implementation complexity compared to simply ignoring them

### Neutral
- The `scaffold validate` command reports unknown fields as warnings in its output, alongside errors — the user sees a mixed report that requires them to distinguish between actionable errors and advisory warnings
- Exit codes are not affected by warnings alone — `scaffold validate` exits 0 if only warnings are present, which means CI pipelines treating any non-zero exit as failure will pass even with unknown fields

## Constraints and Compliance

- Unknown fields in `config.yml`, prompt frontmatter, and methodology manifests MUST produce warnings, not errors
- The warning message MUST include the field name, the file path, the field path within the file, and a note that the field may be from a newer version or a typo
- Unknown fields MUST be preserved in memory during processing — they MUST NOT be stripped from the parsed representation
- When writing config back to disk (e.g., after `scaffold init` modifies a value), unknown fields MUST be preserved in the output file
- `scaffold validate` MUST exit with code 0 if only warnings (including unknown field warnings) are present and no errors exist
- The warning format MUST follow the CLI output contract (ADR-025) for structured warning output
- Unknown fields MUST NOT affect the processing of known fields — the presence of an unknown field MUST NOT change the behavior of any known field's validation or interpretation

## Related Decisions

- [ADR-014](ADR-014-config-schema-versioning.md) — Config schema versioning; unknown fields interact with schema version negotiation
- [ADR-015](ADR-015-prompt-frontmatter-schema.md) — Frontmatter schema defines the known fields against which unknown fields are detected
- [ADR-016](ADR-016-methodology-manifest-format.md) — Manifest format defines the known fields for methodology manifests
- [ADR-025](ADR-025-cli-output-contract.md) — CLI output contract defines the warning format and exit code semantics
- Domain 06 ([06-config-validation.md](../domain-models/06-config-validation.md)) — Full config validation pipeline including unknown field handling
- Domain 08 ([08-prompt-frontmatter.md](../domain-models/08-prompt-frontmatter.md)) — Frontmatter schema and validation rules
