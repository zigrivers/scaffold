# manifest.yml Schema (Methodology Preset)

**Phase**: 4 — Data Schemas
**Depends on**: [domain-models/06-config-validation.md](../domain-models/06-config-validation.md), [domain-models/16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md), [adrs/ADR-041-meta-prompt-architecture.md](../adrs/ADR-041-meta-prompt-architecture.md), [adrs/ADR-043-depth-scale.md](../adrs/ADR-043-depth-scale.md), [architecture/system-architecture.md](../architecture/system-architecture.md) §3c
**Last updated**: 2026-03-14
**Status**: draft

**Status: Transformed** — Methodology manifest simplified per meta-prompt architecture (ADR-041, ADR-043). Three-layer prompt references and mixin axes eliminated. Presets now define step enablement and depth.

---

## Section 1: Overview

`manifest.yml` (now called a **methodology preset**) defines the step configuration for a scaffold methodology. Each preset is a YAML file in `methodology/` that declares which pipeline steps are enabled or disabled and at what default depth.

In the meta-prompt architecture, methodology presets are dramatically simpler than the original manifest format. They no longer contain phases, prompt references (base:/override:/ext:), dependency graphs, or mixin axis defaults. Dependencies are declared in meta-prompt frontmatter. Step ordering is determined by Kahn's algorithm over those frontmatter dependencies. The preset's only job is to declare step enablement and depth.

**File location**: `methodology/<name>.yml` (built-in: `deep.yml`, `mvp.yml`, `custom-defaults.yml`).

**Consumers**:
- **Config Loader / Validator** (domain 06) reads the preset to validate that `config.yml` references a real methodology.
- **Assembly Engine** reads the preset to determine which steps are enabled and the default depth for the methodology.
- **Init Wizard** (domain 14) reads the preset to present methodology information to the user and populate `config.yml`.
- **CLI commands** (`scaffold status`, `scaffold list`) read the preset to determine which steps to display.

**Lifecycle**: A preset is authored by a methodology designer, validated at `scaffold run` and `scaffold validate` time, and read (but never written) by the CLI. The CLI never modifies preset files.

**Key design decisions governing this schema**:
- [ADR-032](../adrs/ADR-032-methodology-versioning-bundled.md): Built-in presets have no `version` field; versioning is bundled with the CLI
- [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md): Unknown fields produce warnings, not errors, and are preserved

---

## Section 2: Formal Schema Definition

The following JSON Schema describes the structure of a parsed methodology preset YAML file.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold.dev/schemas/methodology-preset.json",
  "title": "Methodology Preset",
  "description": "Defines step enablement and default depth for a scaffold methodology.",
  "type": "object",
  "required": ["name", "description", "default_depth", "steps"],
  "additionalProperties": true,
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable display name for the methodology (e.g., 'Deep Domain Modeling', 'MVP')."
    },
    "description": {
      "type": "string",
      "minLength": 1,
      "description": "Short human-readable description of the methodology's purpose and target use case."
    },
    "default_depth": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "Default depth level (1-5) applied to all enabled steps unless overridden in config.yml custom block."
    },
    "steps": {
      "type": "object",
      "description": "Map of step names to step configuration. Keys are step identifiers matching meta-prompt file names in pipeline/.",
      "additionalProperties": {
        "$ref": "#/$defs/StepConfig"
      }
    }
  },
  "$defs": {
    "StepConfig": {
      "type": "object",
      "required": ["enabled"],
      "additionalProperties": false,
      "properties": {
        "enabled": {
          "type": "boolean",
          "description": "Whether this step is active in the pipeline for this methodology."
        },
        "conditional": {
          "type": "string",
          "enum": ["if-needed"],
          "description": "When set to 'if-needed', the step is evaluated based on project signals (existing database files, API routes, frontend frameworks, project.platforms config). Steps that are conditional and disabled are skipped but remain visible in scaffold list."
        }
      }
    }
  }
}
```

**Note on `additionalProperties: true` at root level**: Per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md), unknown top-level fields produce warnings but are preserved and do not cause validation failure.

---

## Section 3: Field Reference

### Top-Level Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | `string` | Yes | -- | Human-readable methodology display name. Shown in `scaffold list`, `scaffold status`, and the init wizard. Must be non-empty. |
| `description` | `string` | Yes | -- | Short description of the methodology. Shown in `scaffold init` when the user selects a methodology. Must be non-empty. |
| `default_depth` | `integer` | Yes | -- | Default depth level (1-5) for all enabled steps in this methodology. |
| `steps` | `Record<string, StepConfig>` | Yes | -- | Map of step names to step configurations. Must include all 32 pipeline steps. |

### StepConfig Object

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enabled` | `boolean` | Yes | -- | Whether this step is active in the pipeline. |
| `conditional` | `string` | No | (absent) | When `"if-needed"`, step is evaluated based on project signals during `scaffold init`. Only applicable to phases 4, 5, 6 and their review steps. |

---

## Section 4: Cross-Schema References

The preset connects to the pipeline meta-prompts and config.yml.

### 4.1 Step Names to Meta-Prompts

Every key in the `steps` object must correspond to a meta-prompt file in `pipeline/`:

| Step Name Pattern | Filesystem Path Template |
|-------------------|--------------------------|
| `create-prd` | `pipeline/pre/create-prd.md` |
| `prd-gap-analysis` | `pipeline/pre/prd-gap-analysis.md` |
| `phase-NN-*` | `pipeline/phase-NN-*.md` |
| `phase-NNa-*` | `pipeline/phase-NNa-*.md` |
| `cross-phase-consistency` | `pipeline/validation/cross-phase-consistency.md` |
| `apply-fixes-and-freeze` | `pipeline/finalization/apply-fixes-and-freeze.md` |

**Validation**: Every step name must resolve to an existing meta-prompt file. Missing files produce `PRESET_INVALID_STEP` errors at validation time.

### 4.2 Relationship to config.yml

| Direction | Relationship |
|-----------|-------------|
| config references preset | `config.methodology` selects which preset to load. |
| preset provides defaults | The preset's `default_depth` and step enablement serve as defaults that `config.custom` can override. |
| config overrides preset | When `methodology: custom`, the `custom.steps` block in config.yml overrides individual step settings from the `custom-defaults.yml` preset. |

### 4.3 Dependencies (Not in Preset)

Dependencies between steps are **not** declared in the methodology preset. They are declared in meta-prompt frontmatter (`dependencies` field). The Assembly Engine and Dependency Resolver read dependencies from meta-prompt frontmatter, not from the preset.

This is a key simplification from the original manifest format, which declared a full dependency graph. With meta-prompt architecture, each meta-prompt carries its own dependency declarations, and the preset only controls enablement and depth.

---

## Section 5: Version History and Migration

### Current Version

The preset format does not have an independent schema version. Built-in presets are versioned with the CLI ([ADR-032](../adrs/ADR-032-methodology-versioning-bundled.md)).

### Format Evolution

| CLI Version | Preset Changes | Migration |
|-------------|---------------|-----------|
| v2.1.0 | Initial preset format with `name`, `description`, `default_depth`, `steps` | N/A — initial release |

### Migration Strategy

Because built-in presets are bundled with the CLI and updated atomically with CLI releases, there is no separate migration path for built-in presets. They always match the CLI's expected format.

**Forward compatibility**: An older CLI encountering a newer preset (with unknown fields) will warn but continue processing. A newer CLI encountering an older preset (missing new optional fields) will use defaults or skip the missing feature.

---

## Section 6: Serialization Details

### File Format

- **Format**: YAML 1.2
- **Encoding**: UTF-8, no BOM
- **Filename**: `<methodology-name>.yml` (e.g., `deep.yml`, `mvp.yml`, `custom-defaults.yml`)
- **Location**: `methodology/`
- **Line endings**: LF. Readers must tolerate CRLF for cross-platform compatibility
- **Maximum file size**: Estimated <5 KB
- **Indentation**: 2-space YAML indentation (convention, not enforced)

### YAML Restrictions

The following YAML features are prohibited in preset files, consistent with the restrictions applied to `config.yml` and meta-prompt frontmatter:

| Feature | Prohibited | Reason |
|---------|-----------|--------|
| **Anchors and aliases** (`&anchor` / `*alias`) | Yes | Complicates static analysis. |
| **Multi-document streams** (`---` / `...` separators) | Yes | A preset is a single document. |
| **Tags** (`!!str`, `!!int`, custom tags) | Yes | Scaffold uses implicit YAML typing only. |
| **Complex mapping keys** (non-scalar keys) | Yes | All mapping keys must be scalar strings. |

### YAML Typing Conventions

| Field | YAML Type | Notes |
|-------|-----------|-------|
| `name` | Bare string or quoted string | Bare is preferred unless name contains special YAML characters. |
| `description` | Quoted string or literal block scalar | Use quotes for single-line. |
| `default_depth` | Integer | Bare integer (1-5). |
| `steps` | Mapping of string to mapping | Keys are step names; values are `{ enabled: bool }` or `{ enabled: bool, conditional: "if-needed" }`. |

### Step Config Serialization

Step configs use YAML flow style for compactness:

```yaml
steps:
  create-prd: { enabled: true }
  prd-gap-analysis: { enabled: true }
  phase-04-database-schema: { enabled: true, conditional: "if-needed" }
```

Block style is also valid but less conventional for this file:

```yaml
steps:
  create-prd:
    enabled: true
  prd-gap-analysis:
    enabled: true
```

---

## Section 7: Validation Rules

Validation occurs at two points: `scaffold run` (mandatory) and `scaffold validate` (advisory).

### 7.1 Structural Validation (Schema Compliance)

| Rule ID | Severity | Condition | Error Code | Message Template |
|---------|----------|-----------|------------|-----------------|
| S1 | Error | File is missing or empty | `PRESET_MISSING` | `Methodology preset not found at {path}. Ensure methodology/{name}.yml exists.` |
| S2 | Error | File is not valid YAML | `PRESET_PARSE_ERROR` | `Failed to parse {path}: {parse_error}. Check YAML syntax.` |
| S3 | Error | Parsed YAML is not a mapping | `PRESET_PARSE_ERROR` | `{path} must be a YAML mapping, got {actual_type}.` |
| S4 | Error | Required field `name` is missing or empty | `PRESET_PARSE_ERROR` | `Preset {path} missing required field 'name'.` |
| S5 | Error | Required field `description` is missing or empty | `PRESET_PARSE_ERROR` | `Preset {path} missing required field 'description'.` |
| S6 | Error | Required field `default_depth` is missing or not 1-5 | `PRESET_PARSE_ERROR` | `Preset {path} missing or invalid 'default_depth' (must be integer 1-5).` |
| S7 | Error | Required field `steps` is missing or not an object | `PRESET_PARSE_ERROR` | `Preset {path} missing required field 'steps' (must be an object).` |
| S8 | Warning | An unknown top-level field is present | *(per ADR-033)* | `Unknown field '{field}' in preset {path}. Field will be preserved but not consumed.` |

### 7.2 Semantic Validation (Cross-Reference Integrity)

| Rule ID | Severity | Condition | Error Code | Message Template |
|---------|----------|-----------|------------|-----------------|
| R1 | Error | A step name does not match any meta-prompt in `pipeline/` | `PRESET_INVALID_STEP` | `Step '{step}' in preset {path} does not match any meta-prompt in pipeline/.` |
| R2 | Warning | A meta-prompt exists in `pipeline/` but is not listed in `steps` | `PRESET_MISSING_STEP` | `Meta-prompt '{step}' exists in pipeline/ but is not listed in preset {path}.` |
| R3 | Error | `conditional` value is not `"if-needed"` | `PRESET_PARSE_ERROR` | `Step '{step}' conditional value must be "if-needed", got '{value}'.` |
| R4 | Error | `default_depth` is outside range 1-5 | `PRESET_PARSE_ERROR` | `Preset {path} default_depth {value} is outside valid range 1-5.` |

---

## Section 8: Examples

### 8.1 Deep Domain Modeling Preset

All steps enabled at maximum depth. This is the actual content of `methodology/deep.yml`:

```yaml
# methodology/deep.yml
name: Deep Domain Modeling
description: Comprehensive documentation for complex systems — full analysis at every phase
default_depth: 5

steps:
  create-prd: { enabled: true }
  prd-gap-analysis: { enabled: true }
  phase-01-domain-modeling: { enabled: true }
  phase-01a-review-domain-modeling: { enabled: true }
  phase-02-adrs: { enabled: true }
  phase-02a-review-adrs: { enabled: true }
  phase-03-system-architecture: { enabled: true }
  phase-03a-review-architecture: { enabled: true }
  phase-04-database-schema: { enabled: true, conditional: "if-needed" }
  phase-04a-review-database: { enabled: true, conditional: "if-needed" }
  phase-05-api-contracts: { enabled: true, conditional: "if-needed" }
  phase-05a-review-api: { enabled: true, conditional: "if-needed" }
  phase-06-ux-spec: { enabled: true, conditional: "if-needed" }
  phase-06a-review-ux: { enabled: true, conditional: "if-needed" }
  phase-07-implementation-tasks: { enabled: true }
  phase-07a-review-tasks: { enabled: true }
  phase-08-testing-strategy: { enabled: true }
  phase-08a-review-testing: { enabled: true }
  phase-09-operations: { enabled: true }
  phase-09a-review-operations: { enabled: true }
  phase-10-security: { enabled: true }
  phase-10a-review-security: { enabled: true }
  cross-phase-consistency: { enabled: true }
  traceability-matrix: { enabled: true }
  decision-completeness: { enabled: true }
  critical-path-walkthrough: { enabled: true }
  implementability-dry-run: { enabled: true }
  dependency-graph-validation: { enabled: true }
  scope-creep-check: { enabled: true }
  apply-fixes-and-freeze: { enabled: true }
  developer-onboarding-guide: { enabled: true }
  implementation-playbook: { enabled: true }
```

### 8.2 MVP Preset

Minimal steps at depth 1 for fast time-to-implementation:

```yaml
# methodology/mvp.yml
name: MVP
description: Get to code fast with minimal ceremony
default_depth: 1

steps:
  create-prd: { enabled: true }
  prd-gap-analysis: { enabled: false }
  phase-01-domain-modeling: { enabled: false }
  phase-01a-review-domain-modeling: { enabled: false }
  phase-02-adrs: { enabled: false }
  phase-02a-review-adrs: { enabled: false }
  phase-03-system-architecture: { enabled: false }
  phase-03a-review-architecture: { enabled: false }
  phase-04-database-schema: { enabled: false }
  phase-04a-review-database: { enabled: false }
  phase-05-api-contracts: { enabled: false }
  phase-05a-review-api: { enabled: false }
  phase-06-ux-spec: { enabled: false }
  phase-06a-review-ux: { enabled: false }
  phase-07-implementation-tasks: { enabled: true }
  phase-07a-review-tasks: { enabled: false }
  phase-08-testing-strategy: { enabled: true }
  phase-08a-review-testing: { enabled: false }
  phase-09-operations: { enabled: false }
  phase-09a-review-operations: { enabled: false }
  phase-10-security: { enabled: false }
  phase-10a-review-security: { enabled: false }
  cross-phase-consistency: { enabled: false }
  traceability-matrix: { enabled: false }
  decision-completeness: { enabled: false }
  critical-path-walkthrough: { enabled: false }
  implementability-dry-run: { enabled: false }
  dependency-graph-validation: { enabled: false }
  scope-creep-check: { enabled: false }
  apply-fixes-and-freeze: { enabled: false }
  developer-onboarding-guide: { enabled: false }
  implementation-playbook: { enabled: true }
```

### 8.3 Custom Defaults Preset

All steps enabled at depth 3 — user overrides individual steps via `config.yml` `custom` block:

```yaml
# methodology/custom-defaults.yml
name: Custom
description: Choose which steps to include and how deep to go
default_depth: 3

# All steps enabled by default at depth 3 — user overrides individual steps
steps:
  create-prd: { enabled: true }
  prd-gap-analysis: { enabled: true }
  phase-01-domain-modeling: { enabled: true }
  phase-01a-review-domain-modeling: { enabled: true }
  # ... (all 32 steps listed with enabled: true)
  # conditional steps include: conditional: "if-needed"
```

### 8.4 Invalid Preset (with Annotations)

```yaml
# INVALID: missing 'default_depth' field
name: Bad Preset
description: Demonstrates validation errors.

steps:
  nonexistent-step: { enabled: true }     # ERROR: PRESET_INVALID_STEP
  create-prd: { enabled: "yes" }          # ERROR: enabled must be boolean
  phase-04-database-schema:
    enabled: true
    conditional: "always"                  # ERROR: conditional must be "if-needed"
```

---

## Section 9: Interaction with Other State Files

### 9.1 config.yml

| Direction | Relationship |
|-----------|-------------|
| config references preset | `config.methodology` selects which preset to load (`deep` -> `methodology/deep.yml`). |
| preset provides defaults | The preset's `default_depth` and step enablement serve as the baseline configuration. |
| config can override preset | When `methodology: custom`, the `custom` block in config.yml overrides individual step enablement and depth from the `custom-defaults.yml` preset. |

### 9.2 Meta-Prompt Frontmatter (pipeline/*.md)

| Direction | Relationship |
|-----------|-------------|
| preset references meta-prompts | Step names in `steps` must correspond to meta-prompt files in `pipeline/`. |
| meta-prompts carry dependencies | Dependencies between steps are declared in meta-prompt frontmatter, not in the preset. The preset only controls enablement. |
| meta-prompts carry outputs | Output artifact paths are declared in meta-prompt frontmatter (`outputs` field), not in the preset. |

### 9.3 state.json

| Direction | Relationship |
|-----------|-------------|
| state.json keys from preset | Step names from the preset (filtered to enabled steps) become keys in `state.json`'s step status map. |
| preset change invalidates state | If a preset changes (CLI upgrade) such that step names differ, `scaffold run` detects the mismatch and prompts the user to handle orphaned or new state entries. |

### 9.4 Assembly Engine

| Direction | Relationship |
|-----------|-------------|
| engine reads preset | The Assembly Engine loads the preset to determine which steps are active and the default depth level. |
| engine reads config override | For `custom` methodology, the engine merges preset defaults with `config.custom` overrides to produce the effective step configuration. |

### 9.5 No Longer Relevant

The following relationships from the original manifest format no longer apply:

- **Mixin defaults and axes**: Eliminated. AI adapts natively from config + instructions.
- **Prompt references (base:/override:/ext:)**: Eliminated. Meta-prompts in `pipeline/` replace the three-layer resolution system.
- **Dependency graph in manifest**: Eliminated. Dependencies live in meta-prompt frontmatter.
- **Phase grouping in manifest**: Eliminated. Phase information comes from meta-prompt frontmatter's `phase` field.

---

*End of methodology preset schema document.*
