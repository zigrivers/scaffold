# config.yml Schema

**Phase**: 4 — Data Schemas
**Depends on**: [domain-models/06-config-validation.md](../domain-models/06-config-validation.md), [domain-models/16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md), [adrs/ADR-014-config-schema-versioning.md](../adrs/ADR-014-config-schema-versioning.md), [adrs/ADR-033-forward-compatibility-unknown-fields.md](../adrs/ADR-033-forward-compatibility-unknown-fields.md), [adrs/ADR-043-depth-scale.md](../adrs/ADR-043-depth-scale.md), [adrs/ADR-047-user-instruction-three-layer-precedence.md](../adrs/ADR-047-user-instruction-three-layer-precedence.md), [adrs/ADR-049-methodology-changeable-mid-pipeline.md](../adrs/ADR-049-methodology-changeable-mid-pipeline.md), [architecture/system-architecture.md](../architecture/system-architecture.md) §5
**Last updated**: 2026-03-14
**Status**: draft

**Status: Transformed** — Config schema updated per meta-prompt architecture (ADR-041, ADR-043). Mixin axes eliminated. Methodology + depth replaces mixin configuration.

---

## Section 1: Overview

`.scaffold/config.yml` is the project configuration file for Scaffold v2. It is the first file read during `scaffold run` and the single source of truth for project-level settings that drive every other subsystem: meta-prompt assembly, methodology selection, depth configuration, platform adapter selection, optional step filtering, and pipeline state initialization.

**Lifecycle**: Created by `scaffold init` (the Init Wizard), editable by hand, read by every CLI command. Committed to git and shared across team members.

**Write strategy**: Atomic (temp + rename). When scaffold modifies the config (via `scaffold init` or hand-edit), it rewrites the entire file atomically: write to `.scaffold/config.yml.tmp`, then `fs.rename()` to `.scaffold/config.yml`. Unknown fields are preserved during write-back per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md).

**Consumers**: Config Loader, Assembly Engine, State Manager, Validator, Dashboard Generator, Init Wizard (for re-configuration), `scaffold run`.

**Max expected size**: ~3 KB (30-60 lines for a typical configuration).

**Git status**: Committed. The config represents the team's project choices and must be version-controlled. `scaffold reset` deletes `state.json` and `decisions.jsonl` but preserves `config.yml` — resetting pipeline progress does not erase project configuration.

---

## Section 2: Formal Schema Definition

The following JSON Schema (draft 2020-12) defines the structure that the parsed YAML must conform to. This schema is applied to the in-memory object after YAML parsing, not to the raw YAML text.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold-cli.dev/schemas/config-v2.json",
  "title": "Scaffold Config v2",
  "description": "Schema for .scaffold/config.yml — per-project configuration for Scaffold v2 with meta-prompt architecture.",
  "type": "object",
  "required": ["version", "methodology", "platforms"],
  "additionalProperties": true,
  "properties": {
    "version": {
      "type": "integer",
      "const": 2,
      "description": "Schema version number. Version 2 introduces meta-prompt architecture with methodology + depth replacing mixin axes."
    },
    "methodology": {
      "type": "string",
      "enum": ["deep", "mvp", "custom"],
      "description": "The selected methodology preset. 'deep' activates all steps at depth 5. 'mvp' activates minimal steps at depth 1. 'custom' allows per-step enablement and depth overrides."
    },
    "custom": {
      "type": "object",
      "description": "Custom methodology configuration. Only used when methodology is 'custom'. Ignored for 'deep' and 'mvp'.",
      "properties": {
        "default_depth": {
          "type": "integer",
          "minimum": 1,
          "maximum": 5,
          "description": "Default depth level for steps that do not have an explicit depth override. Scale: 1 (MVP floor) through 5 (deep ceiling)."
        },
        "steps": {
          "type": "object",
          "description": "Per-step overrides. Keys are step names (e.g., 'create-prd', 'phase-03-system-architecture'). Steps not listed inherit the methodology preset defaults.",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "enabled": {
                "type": "boolean",
                "description": "Whether this step is active in the pipeline."
              },
              "depth": {
                "type": "integer",
                "minimum": 1,
                "maximum": 5,
                "description": "Depth level for this step. Overrides default_depth."
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false
    },
    "platforms": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "enum": ["claude-code", "codex"]
      },
      "description": "Platform adapters to generate output for. At least one must be specified. The Universal adapter always runs regardless of this list."
    },
    "project": {
      "type": "object",
      "description": "Project characteristics used for conditional step filtering and brownfield/greenfield behavior. Defaults to empty (greenfield, no traits) when omitted.",
      "additionalProperties": true,
      "properties": {
        "name": {
          "type": "string",
          "minLength": 1,
          "description": "Human-readable project name. Displayed in dashboard and CLI output."
        },
        "platforms": {
          "type": "array",
          "uniqueItems": true,
          "items": {
            "type": "string",
            "enum": ["web", "mobile", "desktop"]
          },
          "default": [],
          "description": "Target platforms for the project being scaffolded. Informs conditional step evaluation (database? API? UI?)."
        }
      }
    }
  }
}
```

**Note on `additionalProperties: true`**: The top-level object and the `project` object allow additional properties. Per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md), unknown fields produce warnings (not errors) and are preserved in memory and on write-back.

---

## Section 3: Field Reference

### Top-Level Fields

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `version` | integer | Yes | — | Must be `2` | Schema version number. Version 2 for meta-prompt architecture. |
| `methodology` | string | Yes | — | `deep`, `mvp`, or `custom` | Selected methodology preset. |
| `custom` | object | No | — | Only meaningful when `methodology: custom`. See Custom sub-table. | Custom methodology configuration with per-step depth and enablement. |
| `platforms` | string[] | Yes | — | At least 1 item. Values: `claude-code`, `codex`. No duplicates. | Platform adapters to generate output for. |
| `project` | object | No | `{}` | See Project sub-table. | Project characteristics for conditional step filtering. |

### Custom Fields

| Field | Type | Required | Default | Constraints | Description |
|-------|------|----------|---------|-------------|-------------|
| `default_depth` | integer | No | `3` | 1-5 | Default depth level for steps without explicit depth override. |
| `steps` | object | No | `{}` | Keys are step names. Values are `{ enabled: bool, depth?: 1-5 }`. | Per-step overrides for enablement and depth. |

### Project Fields

| Field | Type | Required | Default | Valid Values | Description |
|-------|------|----------|---------|-------------|-------------|
| `name` | string | No | — | Non-empty string | Human-readable project name. |
| `platforms` | string[] | No | `[]` | `web`, `mobile`, `desktop` | Target platforms for the project being scaffolded. Informs conditional step evaluation. |
| *(custom fields)* | any | No | — | — | Additional custom fields are allowed. Unknown fields produce warnings. |

### Depth Scale (1-5)

| Level | Name | Description |
|-------|------|-------------|
| 1 | MVP floor | Minimum viable artifact. Core decisions only, no alternatives analysis, brief rationale. |
| 2 | Lean | Key trade-offs noted but not explored in depth. |
| 3 | Balanced | Solid documentation. Alternatives considered for major decisions. Team-onboardable. |
| 4 | Thorough | Thorough analysis. Edge cases, risk assessment, detailed rationale. |
| 5 | Deep ceiling | Comprehensive. Full evaluation matrices, domain modeling, gap analysis, migration paths, operational considerations. |

---

## Section 4: Cross-Schema References

Every value in `config.yml` that references an external resource must resolve at runtime. Validation checks these references.

| Config Field | Referenced Resource | Resolution Path | Error Code if Missing |
|-------------|--------------------|-----------------|-----------------------|
| `methodology` | Methodology preset file | `methodology/<value>.yml` | `FIELD_INVALID_METHODOLOGY` |
| `custom.steps.<step>` | Pipeline step | `pipeline/<step>.md` (meta-prompt file) | `FIELD_INVALID_STEP` |
| `platforms[]` (each entry) | Platform adapter registration | Adapter registry in `src/adapters/` | `FIELD_INVALID_PLATFORM` |
| `project.platforms[]` (each entry) | Project platform registry | Hardcoded valid list: `web`, `mobile`, `desktop` | `FIELD_INVALID_PROJECT_PLATFORM` |

### Cross-File Consistency

| config.yml Field | Must Match | In File | Disagreement Handling |
|-----------------|-----------|---------|----------------------|
| `methodology` | `methodology` field | `.scaffold/state.json` | Warn: steps in state that no longer appear in resolved pipeline become orphaned entries (preserved, not deleted). New steps added as `pending`. |
| `version` | CLI's `currentVersion` | Hardcoded in CLI source | Auto-migrate forward if config version < CLI version. Error `MIGRATE_VERSION_TOO_NEW` if config version > CLI version. |

---

## Section 5: Version History and Migration

### Version Policy

- The `version` field is an integer starting at `1` ([ADR-014](../adrs/ADR-014-config-schema-versioning.md)).
- Only **breaking changes** increment the version. A breaking change is one where existing valid configs would become invalid, fields change meaning, fields are removed, or field types change.
- Adding new optional fields with defaults does **not** increment the version.
- Migrations are **forward-only**: v1 to v2, never backward. There is no downgrade path.
- `scaffold run` auto-migrates when it detects a config version older than the CLI expects. The user is shown a diff and asked to confirm before the migrated config is written to disk.

### Version Registry

| Version | Introduced In | Description | Breaking Changes |
|---------|--------------|-------------|-----------------|
| 1 | v2.0.0 (pre-meta-prompt) | Initial schema with mixin axes. | *(initial version)* |
| 2 | v2.1.0 | Meta-prompt architecture. Mixin axes removed. Methodology enum (`deep`, `mvp`, `custom`) + `custom` block with `default_depth` and per-step overrides. | `mixins` removed. `methodology` changed from free-form string to enum. `custom` block added. |

### Migration: v1 to v2

The v1-to-v2 migration:
1. Removes the `mixins` object entirely.
2. Changes `methodology` from a free-form string to one of `deep`, `mvp`, or `custom`. If the v1 methodology name does not map to a v2 preset, defaults to `custom`.
3. Sets `version` to `2`.
4. Preserves `platforms`, `project`, and any unknown fields.

### Migration Flow

```
scaffold run reads config.yml
  |
  v
version field present?
  |-- No --> Assume pre-v1 (version 0), start migration chain from 0
  |-- Yes --> version == currentVersion?
                |-- Yes --> Proceed to validation
                |-- No --> version > currentVersion?
                             |-- Yes --> Error: MIGRATE_VERSION_TOO_NEW
                             |-- No --> Chain migrations: v_config -> v_config+1 -> ... -> v_current
                                          |-- All succeed? --> Show diff, ask confirmation
                                          |                      |-- Confirmed --> Write migrated config, proceed
                                          |                      |-- Declined --> Abort
                                          |-- Any fails? --> Error: MIGRATE_FAILED
```

### Migration Function Contract

Each migration is a `ConfigMigration` object:

```typescript
interface ConfigMigration {
  fromVersion: number;                // Version this migration upgrades FROM
  toVersion: number;                  // Always fromVersion + 1
  description: string;                // Human-readable changelog
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
}
```

Migration functions:
- Receive the raw parsed config object (not a typed `ScaffoldConfig`).
- Must return a valid config object at `toVersion`.
- Must preserve unknown fields (per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md)).
- Must update the `version` field to `toVersion`.
- May throw `MigrationError` if the config cannot be migrated (produces `MIGRATE_FAILED`).

Migrations are registered in a `MigrationRegistry` indexed by `fromVersion` for O(1) lookup. The CLI chains them sequentially.

---

## Section 6: Serialization Details

### YAML Format

`config.yml` uses YAML 1.2 with the `.yml` extension (not `.yaml`), per [ADR-014](../adrs/ADR-014-config-schema-versioning.md).

### Allowed YAML Features

| Feature | Allowed | Notes |
|---------|---------|-------|
| Comments (`#`) | Yes | Human-editable file. Comments are encouraged for documenting choices. |
| Block scalars (`\|`, `>`) | Yes | Rarely needed in config, but valid YAML. |
| Flow sequences (`[a, b]`) | Yes | Common for `platforms` arrays. |
| Flow mappings (`{a: 1}`) | Yes | Used in `custom.steps` for compact step overrides. |
| Quoted strings (`"..."`, `'...'`) | Yes | Necessary when values contain special characters. |
| Null values (`~`, `null`) | Yes | Treated as absent/empty for required fields. Triggers `FIELD_EMPTY_VALUE`. |
| Boolean values (`true`/`false`) | Yes | Used for `custom.steps.<step>.enabled`. |

### Prohibited YAML Features

| Feature | Prohibited | Enforcement | Rationale |
|---------|-----------|-------------|-----------|
| Anchors (`&name`) | Yes | YAML parser configured to reject | Anchors add complexity with no benefit in a config file. |
| Aliases (`*name`) | Yes | YAML parser configured to reject | Aliases reference anchors; same rationale. |
| Multi-document streams (`---` separator) | Yes | Only first document parsed; additional documents ignored with warning | Config is a single document. |
| Tags (`!type`) | Yes | YAML parser configured to reject custom tags | Custom type coercion is not needed. |

### Encoding and Line Endings

- **Encoding**: UTF-8. No BOM support.
- **Line endings**: LF (Unix-style) for scaffold-written files. Read tolerance for CRLF in user-edited files.
- **Trailing newline**: Scaffold always writes a trailing newline after the last line.

### Comment Preservation

When scaffold reads `config.yml`, modifies a field, and writes it back, **comments are preserved on a best-effort basis**. The YAML library used (`js-yaml`) does not natively preserve comments in round-trip mode, so scaffold uses a custom write strategy that:

1. Reads the raw YAML text.
2. Parses it into an object.
3. Applies modifications to the object.
4. Serializes the object back to YAML.
5. Attempts to preserve comment positions by matching structural lines.

In practice, comments on their own lines are reliably preserved. Inline comments (after a value on the same line) may be lost during write-back.

### Indentation

Scaffold writes YAML with 2-space indentation and no trailing spaces. User-edited files with different indentation are accepted (YAML is indentation-sensitive but the indent width is flexible).

### Write Atomicity

config.yml uses atomic writes (temp file + rename), the same strategy as state.json. This is critical because config.yml is a committed file that may be read by concurrent processes (e.g., `scaffold run` in one terminal while `scaffold status` runs in another).

- Write path: write to `.scaffold/config.yml.tmp`, then rename to `.scaffold/config.yml`
- Crash recovery: if `.scaffold/config.yml.tmp` exists on startup, delete it (failed write)
- A missing config.yml after a confirmed `scaffold init` indicates a crash during init — re-run `scaffold init`

---

## Section 7: Validation Rules

Validation runs in a strict pipeline order during `scaffold run` and `scaffold validate`. The pipeline short-circuits on fatal structural errors but accumulates all non-fatal errors before returning, per [ADR-040](../adrs/ADR-040-error-handling-philosophy.md).

### Validation Pipeline Phases

| Phase | Name | Prerequisites | Short-Circuits On Failure | Description |
|-------|------|--------------|--------------------------|-------------|
| 1 | File Existence & Parsing | None | Yes | File exists, is non-empty, is valid YAML, parses to a mapping. |
| 2 | Version Check & Migration | Phase 1 | Yes | Version field present, not too new, auto-migrate if old. |
| 3 | Structural Validation | Phase 2 | Yes | Required fields present, correct types, non-empty values. |
| 4 | Unknown Field Detection | Phase 3 | No (warnings only) | Unrecognized keys produce warnings. |
| 5 | Value Validation | Phase 3 | No (accumulates) | Methodology value, platform names, step names validated against installed resources. |
| 6 | Incompatible Combinations | Phase 5 | No (warnings only) | Cross-field combination checks. |

### Error Codes — Structural (Phase 1)

| Code | Severity | Trigger | Message Template |
|------|----------|---------|-----------------|
| `CONFIG_MISSING` | error | `.scaffold/config.yml` does not exist | `Config file not found at .scaffold/config.yml. Run "scaffold init" to create one.` |
| `CONFIG_EMPTY` | error | File exists but is empty or whitespace-only | `Config file .scaffold/config.yml is empty. Run "scaffold init" to regenerate, or add config content manually.` |
| `CONFIG_PARSE_ERROR` | error | YAML syntax error | `Config file .scaffold/config.yml has invalid YAML syntax at line {line}: {parseError}` |
| `CONFIG_NOT_OBJECT` | error | Parsed YAML is a scalar, array, or null | `Config file .scaffold/config.yml must be a YAML mapping (key: value), not a {actualType}.` |
| `CONFIG_UNKNOWN_FIELD` | warning | Unrecognized top-level key | `Unknown field "{field}" in config. {suggestion}. Known fields: version, methodology, custom, platforms, project.` |

### Error Codes — Version Migration (Phase 2)

| Code | Severity | Trigger | Message Template |
|------|----------|---------|-----------------|
| `MIGRATE_VERSION_TOO_NEW` | error | Config version > CLI's currentVersion | `Config version {version} is newer than this CLI supports (max: {currentVersion}). Update scaffold: npm update -g @scaffold-cli/scaffold` |
| `MIGRATE_VERSION_MISSING` | error | No `version` field (auto-recoverable: assumes version 0) | `Config is missing the "version" field. Assuming pre-v1 format and attempting migration.` |
| `MIGRATE_FAILED` | error | Migration function throws or produces invalid output | `Failed to migrate config from version {from} to {to}: {error}. Manually update your config to match the current schema.` |

### Error Codes — Required Fields (Phase 3)

| Code | Severity | Trigger | Message Template |
|------|----------|---------|-----------------|
| `FIELD_MISSING` | error | Required field (`version`, `methodology`, `platforms`) absent | `Required field "{field}" is missing from config.` |
| `FIELD_WRONG_TYPE` | error | Field has wrong YAML type | `Field "{field}" must be a {expectedType}, got {actualType}.` |
| `FIELD_EMPTY_VALUE` | error | Required field is empty string, null, or empty array | `Field "{field}" must not be empty.` |

### Error Codes — Value Validation (Phase 5)

| Code | Severity | Trigger | Message Template |
|------|----------|---------|-----------------|
| `FIELD_INVALID_METHODOLOGY` | error | `methodology` is not `deep`, `mvp`, or `custom` | `Methodology "{value}" not recognized. Valid options: deep, mvp, custom.` |
| `FIELD_INVALID_PLATFORM` | error | `platforms` entry does not match any registered adapter | `Platform "{value}" not recognized. {suggestion}. Valid options: {validOptions}.` |
| `FIELD_INVALID_PROJECT_PLATFORM` | error | `project.platforms` entry is not `web`, `mobile`, or `desktop` | `Project platform "{value}" not recognized. Valid options: web, mobile, desktop.` |
| `FIELD_INVALID_VERSION` | error | `version` is not a positive integer | `Config version must be a positive integer, got "{value}".` |
| `FIELD_INVALID_DEPTH` | error | `custom.default_depth` or `custom.steps.<step>.depth` is not 1-5 | `Depth value {value} is out of range. Must be between 1 and 5.` |
| `FIELD_INVALID_STEP` | error | Key in `custom.steps` does not match any known pipeline step | `Step "{value}" not recognized. {suggestion}. Valid steps: {validSteps}.` |
| `FIELD_DUPLICATE_PLATFORM` | warning | Same platform listed more than once | `Duplicate platform "{value}" in platforms list. Duplicates are ignored.` |

### Error Codes — Incompatible Combinations (Phase 6)

All incompatible combinations are **warnings**, not errors, per [ADR-040](../adrs/ADR-040-error-handling-philosophy.md). Users may have valid reasons for these configurations.

| Code | Combination | Message Summary |
|------|------------|----------------|
| `COMBO_CUSTOM_NO_STEPS` | `methodology: custom` + empty `custom.steps` | Custom methodology with no step overrides is equivalent to 'deep' at depth 3. Consider using 'deep' instead. |
| `COMBO_CUSTOM_WITHOUT_BLOCK` | `methodology: custom` + no `custom` block | Custom methodology selected but no custom configuration provided. All steps will run at default depth 3. |

### Fuzzy Matching

When any string value fails validation, the system computes Levenshtein distance against all valid options for that field. If the closest match is within distance 2, the error message includes a "Did you mean?" suggestion. The `{suggestion}` placeholder in message templates expands to either `Did you mean "{match}"?` or an empty string if no close match exists.

Fuzzy matching applies to: `methodology`, `platforms` entries, and `custom.steps` step names.

---

## Section 8: Examples

### Minimal Valid Config

The smallest valid `config.yml`. Uses only required fields.

```yaml
version: 2
methodology: deep
platforms:
  - claude-code
```

### Realistic Config — Deep Methodology

A typical project configuration with comments and optional fields.

```yaml
# Project: acme-web-app
# Created by scaffold init on 2026-03-14
version: 2

methodology: deep

platforms:
  - claude-code
  - codex

project:
  name: "Acme Web App"
  platforms:
    - web
    - mobile
```

### Realistic Config — MVP Methodology

A lean project configuration for getting to implementation fast.

```yaml
version: 2
methodology: mvp
platforms:
  - claude-code

project:
  name: "Weekend Hack"
  platforms:
    - web
```

### Realistic Config — Custom Methodology

A custom methodology with per-step depth and enablement overrides.

```yaml
version: 2

methodology: custom

custom:
  default_depth: 3
  steps:
    create-prd:
      enabled: true
      depth: 4
    review-prd:
      enabled: true
    innovate-prd:
      enabled: false
    phase-03-system-architecture:
      enabled: true
      depth: 2
    phase-07-implementation-tasks:
      enabled: true
      depth: 4
    # Steps not listed inherit defaults from custom-defaults.yml

platforms:
  - claude-code

project:
  name: "My Side Project"
  platforms:
    - web
```

### Invalid Config — Annotated

Each error is annotated with the validation error code that would fire.

```yaml
# ERROR: FIELD_MISSING — 'version' field is absent

methodology: deap              # ERROR: FIELD_INVALID_METHODOLOGY
                               # (Levenshtein distance 1 from "deep")
                               # Suggestion: Did you mean "deep"?

custom:
  default_depth: 7             # ERROR: FIELD_INVALID_DEPTH
                               # (must be 1-5)
  steps:
    nonexistent-step:          # ERROR: FIELD_INVALID_STEP
      enabled: true

platforms: []                  # ERROR: FIELD_EMPTY_VALUE
                               # platforms must have at least one entry

unknownField: something        # WARNING: CONFIG_UNKNOWN_FIELD
                               # Unknown fields produce warnings, not errors
```

---

## Section 9: Interaction with Other State Files

### Files Written by the Same Producer

`config.yml` is written by the Init Wizard (`scaffold init`).

| Command | Also Writes | Relationship |
|---------|------------|-------------|
| `scaffold init` | `.scaffold/state.json`, `.scaffold/decisions.jsonl` | State is initialized based on the step set resolved from config methodology. Decisions log is created empty. |

### Files That Read config.yml

| Consumer | What It Reads | Purpose |
|----------|--------------|---------|
| Config Loader | Entire file | Parse, validate, migrate, return typed `ScaffoldConfig` object |
| Assembly Engine | `methodology`, `custom`, `project` | Determine which steps are active, depth level per step, load methodology preset |
| Platform Adapters | `platforms` | Determine which adapters run |
| State Manager | `methodology` | Initialize state with the correct step set; detect methodology changes |
| Validator | Entire file | Run full validation pipeline, report errors and warnings |
| Dashboard Generator | `methodology`, `platforms`, `project` | Display project configuration in the HTML dashboard |

### Consistency Relationships

| config.yml | Related File | Consistency Rule | Disagreement Resolution |
|-----------|-------------|-----------------|------------------------|
| `methodology` | `state.json` `.methodology` | Must match | Orphaned state entries preserved; new steps added as `pending`. `scaffold validate` warns. |
| `methodology` | `methodology/<name>.yml` | Preset file must exist | `FIELD_INVALID_METHODOLOGY` error at validation time |
| `platforms[]` | Adapter registry | Adapter must be registered | `FIELD_INVALID_PLATFORM` error at validation time |

### Configuration Precedence

`config.yml` sits at layer 2 of the three-layer configuration precedence chain:

1. **CLI flags** (highest) — e.g., `--instructions "..."` overrides per-step instructions ([ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md))
2. **`.scaffold/config.yml`** — project-level settings, shared across team
3. **Methodology preset defaults** (lowest) — fallback values from `methodology/<name>.yml`

When `config.yml` does not specify a value for an optional field, the system falls through to methodology preset defaults. For required fields (`version`, `methodology`, `platforms`), no fallback exists — the field must be present.

### User Instructions Directory

User instructions live outside `config.yml` in a dedicated directory ([ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md)):

- **`.scaffold/instructions/global.md`** — applies to all steps (team-shared, git-committed)
- **`.scaffold/instructions/<step-name>.md`** — applies to one specific step
- **`--instructions "..."`** (CLI flag) — applies to current invocation only (ephemeral)

The Assembly Engine loads these at runtime. They are not part of `config.yml` but interact with the config through the depth and methodology settings: the assembled prompt combines config-driven depth/methodology with instruction-driven customization.

### Methodology Changeability

The `methodology` field in `config.yml` can be changed at any time ([ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)). When `config.yml` methodology differs from `state.json` methodology (the init-time value), the State Manager:

1. Preserves all completed steps (no rollback).
2. Keeps orphaned state entries for steps no longer in the new methodology.
3. Adds new steps from the new methodology as `pending`.
4. Re-resolves pending steps with the new methodology's depth and enablement configuration.
5. Emits `PSM_METHODOLOGY_MISMATCH` warning.

### Reset Behavior

`scaffold reset` deletes `state.json` and `decisions.jsonl` but **preserves** `config.yml`. The rationale: config represents the user's project choices (methodology, depth, platforms); resetting pipeline progress should not erase those choices. To fully reconfigure, the user runs `scaffold init` again (which overwrites the existing config after confirmation).
