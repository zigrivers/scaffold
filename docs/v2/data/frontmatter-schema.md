# Meta-Prompt Frontmatter Schema

**Phase**: 4 — Data Schemas
**Depends on**: [domain-models/08-prompt-frontmatter.md](../domain-models/08-prompt-frontmatter.md), [domain-models/15-assembly-engine.md](../domain-models/15-assembly-engine.md), [adrs/ADR-041-meta-prompt-architecture.md](../adrs/ADR-041-meta-prompt-architecture.md), [adrs/ADR-044-runtime-prompt-generation.md](../adrs/ADR-044-runtime-prompt-generation.md), [adrs/ADR-045-assembled-prompt-structure.md](../adrs/ADR-045-assembled-prompt-structure.md), [architecture/system-architecture.md](../architecture/system-architecture.md) §4a
**Last updated**: 2026-03-14
**Status**: draft

**Status: Transformed** — Frontmatter schema rewritten for meta-prompt architecture (ADR-041, ADR-045). Section targeting removed.

---

## Section 1: Overview

This document defines the formal data schema for YAML frontmatter in scaffold meta-prompt files. It is the Phase 4 normative reference that implementers use to build the Frontmatter Parser component (`src/core/frontmatter/parser.ts`).

### Meta-Prompt Frontmatter — Purpose

Meta-prompt frontmatter is **input metadata on meta-prompt files**. It lives at the top of every meta-prompt `.md` file in `pipeline/` between `---` delimiters. It tells the scaffold CLI what the step needs, what it produces, what knowledge base entries to load, and how to order it in the pipeline. Frontmatter is written by pipeline designers. It is consumed by the Assembly Engine at runtime.

### What Changed from the Original Frontmatter Schema

The meta-prompt architecture replaces the original prompt frontmatter with a simpler, more focused schema:

| Original Field | Disposition | Rationale |
|---------------|-------------|-----------|
| `description` | Kept (renamed purpose) | Now `description` — one-line purpose of the step |
| `produces` | Replaced by `outputs` | Same concept, clearer name for meta-prompt context |
| `depends-on` | Replaced by `dependencies` | Same concept, aligned with meta-prompt terminology |
| `phase` | Kept | Pipeline phase for ordering and display |
| `argument-hint` | Removed | User instructions replace argument hints (`--instructions` flag) |
| `reads` | Re-introduced ([ADR-050](../adrs/ADR-050-context-window-management.md), [ADR-053](../adrs/ADR-053-artifact-context-scope.md)) | Optional field declaring cross-cutting artifact references beyond the dependency chain. The Assembly Engine loads dependency-chain artifacts by default; `reads` extends this with explicitly declared cross-cutting references. |
| `artifact-schema` | Removed | Quality criteria in the meta-prompt body replace structural validation rules. AI validates against criteria rather than regex patterns. |
| `requires-capabilities` | Removed | Platform adapters are thin delivery wrappers; capability negotiation is unnecessary. |

### Tracking Comments — Still Separate

Tracking comments remain a separate concept from frontmatter. They are output metadata on produced artifacts (line 1 of generated files). For the tracking comment format, see [ADR-017](../adrs/ADR-017-tracking-comments-artifact-provenance.md).

---

## Section 2: Formal Schema Definition

The following JSON Schema defines the structure that parsed YAML frontmatter must satisfy. The Frontmatter Parser validates against this schema at build time (`scaffold run`) and on-demand (`scaffold validate`).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold.dev/schemas/meta-prompt-frontmatter.json",
  "title": "MetaPromptFrontmatter",
  "description": "YAML frontmatter schema for scaffold meta-prompt files. Validated at runtime by the Assembly Engine.",
  "type": "object",
  "required": ["name", "description", "phase", "order", "outputs"],
  "additionalProperties": true,
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "Step identifier matching the filename stem. Used as the canonical key in state tracking, dependency graphs, and CLI commands."
    },
    "description": {
      "type": "string",
      "maxLength": 200,
      "description": "One-line purpose of this pipeline step. Displayed in scaffold list, scaffold status, and scaffold info output."
    },
    "phase": {
      "type": "string",
      "enum": ["pre", "foundation", "environment", "integration", "modeling", "decisions", "architecture", "specification", "quality", "parity", "consolidation", "planning", "validation", "finalization", "build"],
      "description": "Pipeline phase identifier. 16 phases ordered by number: (0) vision, (1) pre, (2) foundation, (3) environment, (4) integration, (5) modeling, (6) decisions, (7) architecture, (8) specification, (9) quality, (10) parity, (11) consolidation, (12) planning, (13) validation, (14) finalization, (15) build. Canonical definitions in src/types/frontmatter.ts PHASES constant."
    },
    "order": {
      "type": "integer",
      "minimum": 1,
      "maximum": 1500,
      "description": "Unique step position used as the primary tiebreaker in Kahn's algorithm topological sort. Lower values are dequeued first when multiple steps have zero in-degree. Each step has a unique order value."
    },
    "dependencies": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Step name (kebab-case identifier matching another meta-prompt's name field)."
      },
      "uniqueItems": true,
      "default": [],
      "description": "Steps that must complete before this step can execute. The dependency graph is the authoritative execution ordering — Kahn's algorithm produces the topological sort."
    },
    "outputs": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[^\\\\*?]+$",
        "description": "File path relative to project root. Forward slashes only. No glob patterns."
      },
      "uniqueItems": true,
      "description": "Artifact file paths this step produces. Used for completion detection, step gating, and brownfield adoption."
    },
    "conditional": {
      "oneOf": [
        {
          "type": "string",
          "enum": ["if-needed"]
        },
        {
          "type": "null"
        }
      ],
      "default": null,
      "description": "When 'if-needed', the step is evaluated based on project signals during scaffold init. Steps marked conditional that are disabled are skipped during scaffold next and scaffold run but remain visible in scaffold list."
    },
    "knowledge-base": {
      "type": "array",
      "items": {
        "type": "string",
        "minLength": 1,
        "description": "Knowledge base entry name (e.g., 'system-architecture', 'review-domain-modeling'). Must resolve to a file in knowledge/."
      },
      "uniqueItems": true,
      "default": [],
      "description": "Knowledge base entries to load during assembly. The Assembly Engine loads the referenced knowledge documents and includes them in the assembled prompt."
    },
    "reads": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$",
        "description": "Step name whose output artifact should be loaded into context, even if not in the transitive dependency chain."
      },
      "uniqueItems": true,
      "default": [],
      "description": "Cross-cutting artifact references. Steps listed here contribute their output artifacts to the assembled prompt's context section, in addition to dependency-chain artifacts. See ADR-050 and ADR-053."
    }
  }
}
```

**Note on `required` fields**: Unlike the original frontmatter schema which had no required fields, meta-prompt frontmatter requires `name`, `description`, `phase`, `order`, and `outputs`. Every meta-prompt must declare its identity, purpose, phase, execution order, and what it produces.

**Note on `additionalProperties: true`**: Per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md), unknown fields produce warnings but do not cause validation failure. This supports forward compatibility.

---

## Section 3: Field Reference

### `name` (string)

Step identifier matching the filename stem.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | Yes |
| Pattern | `^[a-z][a-z0-9-]*$` (kebab-case) |
| Used by | State tracking (`state.json` keys), dependency resolution, CLI commands (`scaffold run <name>`), config.yml `custom.steps` keys |
| Error code | `FRONTMATTER_NAME_MISSING` (exit 1) when absent; `FRONTMATTER_NAME_INVALID` (exit 1) when not kebab-case |

**Example values**:
- `"create-prd"`
- `"system-architecture"`
- `"cross-phase-consistency"`

### `description` (string)

One-line purpose of this pipeline step.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | Yes |
| Max length | 200 characters (recommended: 80) |
| Used by | `scaffold list`, `scaffold info`, `scaffold status`, dashboard display |
| Error code | `FRONTMATTER_DESCRIPTION_MISSING` (exit 1) when absent |

**Example values**:
- `"Design and document system architecture"`
- `"Review domain models for completeness, consistency, and downstream readiness"`

### `phase` (string)

Pipeline phase for display grouping and ordering.

| Property | Value |
|----------|-------|
| Type | `string` |
| Required | Yes |
| Valid values | `"pre"`, `"foundation"`, `"environment"`, `"integration"`, `"modeling"`, `"decisions"`, `"architecture"`, `"specification"`, `"quality"`, `"stories"`, `"consolidation"`, `"planning"`, `"validation"`, `"finalization"` |
| Used by | `scaffold status` phase grouping, `scaffold list` display |
| Error code | `FRONTMATTER_PHASE_INVALID` (exit 1) when not a recognized phase identifier |
| Source of truth | `src/types/frontmatter.ts` `PHASES` constant |

**Note**: The phase is a display and grouping hint. It does not enforce execution constraints — the dependency graph is the authoritative execution ordering. The `order` field (not phase) is the primary tiebreaker within the topological sort.

**16 phases** (number → slug → display name):

| # | Slug | Display Name |
|---|------|-------------|
| 0 | `vision` | Product Vision |
| 1 | `pre` | Product Definition |
| 2 | `foundation` | Project Foundation |
| 3 | `environment` | Development Environment |
| 4 | `integration` | Testing Integration |
| 5 | `modeling` | Domain Modeling |
| 6 | `decisions` | Architecture Decisions |
| 7 | `architecture` | System Architecture |
| 8 | `specification` | Specifications |
| 9 | `quality` | Quality Gates |
| 10 | `parity` | Platform Parity |
| 11 | `consolidation` | Consolidation |
| 12 | `planning` | Planning |
| 13 | `validation` | Validation |
| 14 | `finalization` | Finalization |
| 15 | `build` | Build |

### `order` (integer)

Unique step position used as the primary tiebreaker in Kahn's algorithm.

| Property | Value |
|----------|-------|
| Type | `integer` |
| Required | Yes |
| Range | 1–36 |
| Uniqueness | Each step must have a unique `order` value across all meta-prompts |
| Used by | Kahn's algorithm tiebreaker (`order ASC, slug ASC`), `scaffold list` display ordering |
| Error code | `FRONTMATTER_ORDER_MISSING` (exit 1) when absent; `FRONTMATTER_ORDER_INVALID` (exit 1) when not an integer in 1–36; `FRONTMATTER_ORDER_DUPLICATE` (exit 1) when two meta-prompts share the same order value |

**Note**: The `order` field is more granular than `phase` — it provides a unique position for every step, ensuring fully deterministic ordering when multiple steps have zero in-degree during topological sort. Steps with lower `order` values are dequeued first, with alphabetical slug as the secondary tiebreaker.

**Example values**:
- `1` (create-prd — first step in the pipeline)
- `7` (domain-modeling)
- `30` (scope-creep-check — late validation step)

### `dependencies` (string[])

Steps that must complete before this step can execute.

| Property | Value |
|----------|-------|
| Type | `array` of `string` |
| Required | No |
| Default | `[]` (empty array) |
| Pattern | `^[a-z][a-z0-9-]*$` (kebab-case step names) |
| Uniqueness | Items must be unique |
| Used by | Dependency resolution (Kahn's algorithm topological sort) |
| Error code | `FRONTMATTER_DEPENDS_INVALID_SLUG` (exit 1) when an entry is not valid kebab-case; `DEP_TARGET_MISSING` (exit 2) when a name does not match any meta-prompt |

**Note**: Dependencies are now declared exclusively in meta-prompt frontmatter. The original system's union merge with manifest dependencies is no longer needed because methodology presets do not contain dependency declarations.

**Example values**:
- `["create-prd"]`
- `["adrs"]`
- `["domain-modeling", "adrs"]`

### `outputs` (string[])

Artifact file paths this step produces, relative to the project root.

| Property | Value |
|----------|-------|
| Type | `array` of `string` |
| Required | Yes |
| Uniqueness | Items must be unique |
| Path format | Forward slashes, relative to project root, no glob patterns |
| Used by | Completion detection, step gating, brownfield adoption (`scaffold adopt`) |
| Error code | `FRONTMATTER_OUTPUTS_MISSING` (exit 1) when absent or empty |

**Consumers of `outputs`**:
1. **State Manager** — copies `outputs` into `state.json` step entries for quick artifact lookup
2. **Completion detection** — checks that all `outputs` files exist on disk
3. **Step gating** — verifies predecessor step artifacts exist before allowing current step to run
4. **Brownfield/adopt** — scans `outputs` paths to map existing files to completed steps

**Example values**:
- `["docs/system-architecture.md"]`
- `["docs/prd.md"]`
- `["docs/domain-models/"]` (directory output)

### `conditional` (string | null)

Conditional evaluation flag for steps that may not apply to all projects.

| Property | Value |
|----------|-------|
| Type | `string` or `null` |
| Required | No |
| Default | `null` (step is always included when enabled) |
| Valid values | `"if-needed"`, `null` |
| Used by | Init wizard (for project signal detection), `scaffold next` (for skip logic), `scaffold list` (for display) |

**Conditional evaluation**:
1. During `scaffold init`, the wizard examines project signals (existing database files, API routes, frontend frameworks, `project.platforms` config) and pre-sets conditional steps to enabled or disabled in config.yml.
2. Users can always manually enable or disable conditional steps via config, regardless of what the wizard detected.
3. Conditional steps that are disabled are skipped during `scaffold next` and `scaffold run` but remain visible in `scaffold list` (marked as skipped).

**Example**: Phases 4, 5, 6 and their reviews are conditional (`"if-needed"`).

### `reads` (string[])

Cross-cutting artifact references beyond the dependency chain.

| Property | Value |
|----------|-------|
| Type | `array` of `string` |
| Required | No |
| Default | `[]` (empty — no cross-cutting references) |
| Pattern | `^[a-z][a-z0-9-]*$` (kebab-case step names) |
| Uniqueness | Items must be unique |
| Used by | Context Gatherer (assembly step 4), `scaffold validate` |
| Error code | `FRONTMATTER_READS_INVALID_STEP` (exit 1) when an entry does not match any meta-prompt's `name` field |
| ADR | [ADR-050](../adrs/ADR-050-context-window-management.md), [ADR-053](../adrs/ADR-053-artifact-context-scope.md) |

**Example values**:
- `["create-prd"]` (include the PRD artifact even if not a direct dependency)
- `["tech-stack", "coding-standards"]`

### `knowledge-base` (string[])

Knowledge base entries to load during assembly.

| Property | Value |
|----------|-------|
| Type | `array` of `string` |
| Required | No |
| Default | `[]` (no knowledge base entries loaded) |
| Uniqueness | Items must be unique |
| Resolution | Each entry resolves to a file in `knowledge/` directory (e.g., `"system-architecture"` -> `knowledge/core/system-architecture.md`) |
| Used by | Assembly Engine (loads knowledge documents into the assembled prompt) |
| Error code | `FRONTMATTER_KB_ENTRY_MISSING` (exit 1) when an entry does not resolve to a knowledge base file |

**Example values**:
- `["system-architecture"]`
- `["domain-modeling"]`
- `["review-methodology", "review-domain-modeling"]`

---

## Section 4: Cross-Schema References

Frontmatter fields reference and are referenced by data in other files across the scaffold system.

### Outbound References (frontmatter points to other data)

| Field | Target | Resolution Time | Validation |
|-------|--------|-----------------|------------|
| `dependencies[]` | Other meta-prompt `name` fields | Runtime (assembly) | Each name must match a meta-prompt in `pipeline/`. Failure: `DEP_TARGET_MISSING` (exit 2). |
| `outputs[]` | Filesystem paths at project root | Runtime | Files checked for existence during completion detection and step gating. |
| `knowledge-base[]` | Knowledge base entries in `knowledge/` | Runtime (assembly) | Each entry must resolve to a knowledge base file. Failure: `FRONTMATTER_KB_ENTRY_MISSING` (exit 1). |
| `reads[]` | Other meta-prompt `name` fields | Runtime (assembly) | Each name must match a meta-prompt in `pipeline/`. Failure: `FRONTMATTER_READS_INVALID_STEP` (exit 1). |

### Inbound References (other data points to frontmatter)

| Source | Field | How It Uses Frontmatter |
|--------|-------|------------------------|
| `methodology/<name>.yml` | `steps` | Step names in the preset must match meta-prompt `name` fields. |
| `config.yml` | `custom.steps` | Step names in custom config must match meta-prompt `name` fields. |
| `state.json` | `steps[name].outputs` | State Manager copies `outputs` from frontmatter into state entries. |
| `state.json` | `steps[name].status` | Completion detection checks `outputs` files on disk. |
| Assembly Engine | All fields | Loads frontmatter to determine dependencies, outputs, knowledge base entries, and conditional status. |

### Assembly Flow

The following diagram shows how frontmatter data flows through the Assembly Engine:

```
meta-prompt file (frontmatter)      methodology preset (enablement)
        |                                    |
        v                                    v
  Frontmatter Parser               Preset Loader
        |                                    |
        v                                    v
  ParsedFrontmatter     ─── merge ───>  Step Configuration
  (per-file validation)   (enabled? depth?)  (effective settings)
                                             |
                              ┌──────────────┼──────────────┐
                              v              v              v
                        Dependency      State Manager   Assembly
                        Resolver        (copies to      Engine
                        (reads          state.json)     (loads KB,
                        dependencies)                   builds prompt)
```

---

## Section 5: Version History and Migration

### No Version Field in Frontmatter

Meta-prompt frontmatter intentionally has **no `version` field**. This is consistent with the original design decision documented in [ADR-038](../adrs/ADR-038-prompt-versioning-deferred.md):

1. **The CLI version is the meta-prompt version** — built-in meta-prompts ship with the CLI and change together.
2. **Methodology versioning is handled at the methodology level** — [ADR-032](../adrs/ADR-032-methodology-versioning-bundled.md) defines methodology versions as bundled with the CLI.

### Schema Evolution Strategy

The frontmatter schema evolves via the **unknown-fields-as-warnings** pattern ([ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md)):

- **Adding a new field**: The new CLI version recognizes the field. Older CLI versions emit `FRONTMATTER_UNKNOWN_FIELD` warnings but continue processing.
- **Deprecating a field**: The CLI emits a deprecation warning when the field is present, suggesting the replacement.
- **Removing a field**: After a deprecation period, the CLI ignores the field (it becomes an unknown field, producing a warning).
- **Changing a field's type or semantics**: This is a breaking change gated behind a config schema version bump.

---

## Section 6: Serialization Details

### YAML Frontmatter Format

Frontmatter is embedded in markdown meta-prompt files using the standard YAML frontmatter convention:

```
---
<YAML content>
---

<markdown meta-prompt body>
```

**Position requirements**:

1. The opening `---` delimiter **must** appear on line 1 of the file.
2. The closing `---` delimiter must appear on its own line after the YAML content.
3. Both delimiters are exactly three hyphens (`---`), optionally followed by trailing whitespace.
4. The YAML content between delimiters is parsed as a YAML mapping (object).

**Encoding**: UTF-8. No BOM. Line endings may be LF or CRLF (the parser normalizes to LF before processing).

### YAML Conventions

Frontmatter uses standard YAML 1.2 syntax:

- **String quoting**: Optional for simple strings. Required when strings contain YAML-special characters.
- **Array syntax**: Both flow style (`[item1, item2]`) and block style (indented `- item` entries) are accepted.
- **Null values**: YAML `null`, `~`, or absent key all represent "field not present."
- **Boolean values**: YAML `true`/`false` only (YAML 1.2 strict booleans).
- **Comments**: YAML `#` comments within frontmatter are permitted and ignored by the parser.

### YAML Feature Restrictions

Consistent with config.yml and methodology presets, meta-prompt frontmatter MUST NOT use:
- YAML anchors (`&anchor`) and aliases (`*alias`)
- YAML tags (`!!type`)
- Multi-document streams (multiple `---` separators beyond the frontmatter delimiters)

### Key Naming Convention

All frontmatter keys use **kebab-case**: lowercase letters, digits, and hyphens.

| Frontmatter key | TypeScript property (after parsing) |
|-----------------|-------------------------------------|
| `name` | `name` |
| `description` | `description` |
| `phase` | `phase` |
| `order` | `order` |
| `dependencies` | `dependencies` |
| `outputs` | `outputs` |
| `conditional` | `conditional` |
| `knowledge-base` | `knowledgeBase` |
| `reads` | `reads` |

The Frontmatter Parser converts kebab-case YAML keys to camelCase TypeScript properties during parsing.

---

## Section 7: Validation Rules

Validation occurs at runtime during `scaffold run` and on-demand during `scaffold validate`.

### Structural Validation (per-file, no cross-file context)

These checks run on each meta-prompt file independently.

| Rule | Condition | Error Code | Severity | Exit Code | Message Template |
|------|-----------|------------|----------|-----------|-----------------|
| Frontmatter present | File starts with `---` on line 1 | `FRONTMATTER_MISSING` | Error | 1 | `{file} does not start with '---' on line 1. Add YAML frontmatter delimiters.` |
| Frontmatter closed | Opening `---` has matching closing `---` | `FRONTMATTER_UNCLOSED` | Error | 1 | `{file} has an opening '---' but no closing delimiter.` |
| Valid YAML | Content between delimiters parses as YAML mapping | `FRONTMATTER_YAML_ERROR` | Error | 1 | `{file} frontmatter is not valid YAML: {parse_error}.` |
| Name present | `name` field exists and is a non-empty kebab-case string | `FRONTMATTER_NAME_MISSING` | Error | 1 | `Meta-prompt {file} is missing required 'name' field.` |
| Name valid | `name` matches `^[a-z][a-z0-9-]*$` | `FRONTMATTER_NAME_INVALID` | Error | 1 | `Meta-prompt {file} name '{value}' is not valid kebab-case.` |
| Description present | `description` field exists and is a non-empty string | `FRONTMATTER_DESCRIPTION_MISSING` | Error | 1 | `Meta-prompt {file} is missing required 'description' field.` |
| Phase present | `phase` field exists | `FRONTMATTER_PHASE_INVALID` | Error | 1 | `Meta-prompt {file} is missing required 'phase' field.` |
| Phase valid | `phase` is a recognized phase identifier | `FRONTMATTER_PHASE_INVALID` | Error | 1 | `Meta-prompt {file} phase '{value}' is not a valid phase identifier.` |
| Order present | `order` field exists and is an integer | `FRONTMATTER_ORDER_MISSING` | Error | 1 | `Meta-prompt {file} is missing required 'order' field.` |
| Order valid | `order` is an integer in range 1–36 | `FRONTMATTER_ORDER_INVALID` | Error | 1 | `Meta-prompt {file} order '{value}' is not a valid integer in range 1–36.` |
| Outputs present | `outputs` field exists and is a non-empty array | `FRONTMATTER_OUTPUTS_MISSING` | Error | 1 | `Meta-prompt {file} is missing required 'outputs' field.` |
| `dependencies` type | If present, must be an array of kebab-case strings | `FRONTMATTER_DEPENDS_INVALID_SLUG` | Error | 1 | `{file} dependencies entry '{value}' is not valid kebab-case.` |
| `outputs` type | If present, must be an array of non-empty strings | `FRONTMATTER_YAML_ERROR` | Error | 1 | `{file} outputs must be an array of non-empty strings.` |
| `knowledge-base` type | If present, must be an array of non-empty strings | `FRONTMATTER_YAML_ERROR` | Error | 1 | `{file} knowledge-base must be an array of non-empty strings.` |
| `conditional` value | If present, must be `"if-needed"` or null | `FRONTMATTER_YAML_ERROR` | Error | 1 | `{file} conditional must be "if-needed" or null, got '{value}'.` |
| Unknown fields | Any key not in the known set | `FRONTMATTER_UNKNOWN_FIELD` | Warning | 0 | `Unknown field '{field}' in {file}. Possible typo, or from a newer scaffold version.` |
| `outputs` uniqueItems | No duplicate paths in `outputs` array | `FRONTMATTER_DUPLICATE_OUTPUTS` | Warning | 0 | `Duplicate path '{path}' in outputs array in {file}.` |

### Semantic Validation (cross-file, requires pipeline context)

These checks run after all meta-prompts are parsed and require knowledge of the full pipeline.

| Rule | Condition | Error Code | Severity | Exit Code | Message Template |
|------|-----------|------------|----------|-----------|-----------------|
| `dependencies` targets exist | Each name matches another meta-prompt's `name` field | `DEP_TARGET_MISSING` | Error | 2 | `{file} depends on '{name}' which does not exist in the pipeline.` |
| No self-dependency | A meta-prompt does not list its own name in `dependencies` | `DEP_SELF_REFERENCE` | Error | 1 | `{file} lists itself in dependencies. Self-dependencies are not allowed.` |
| No dependency cycles | The dependency graph is acyclic | `DEP_CYCLE_DETECTED` | Error | 1 | `Dependency cycle detected: {cycle_path}.` |
| `knowledge-base` entries exist | Each entry resolves to a file in `knowledge/` | `FRONTMATTER_KB_ENTRY_MISSING` | Error | 1 | `{file} references knowledge base entry '{entry}' which does not exist.` |
| `reads` targets exist | Each name matches another meta-prompt's `name` field | `FRONTMATTER_READS_INVALID_STEP` | Error | 1 | `{file} reads entry '{name}' does not exist in the pipeline.` |
| Name matches filename | `name` field matches the filename stem | `FRONTMATTER_NAME_MISMATCH` | Warning | 0 | `{file} name '{name}' does not match filename stem '{stem}'.` |
| `order` unique | No two meta-prompts share the same `order` value | `FRONTMATTER_ORDER_DUPLICATE` | Error | 1 | `Meta-prompts {file1} and {file2} both have order {value}. Each step must have a unique order.` |
| `outputs` path format | Paths must be relative, no `..` traversal, forward slashes only | `FRONTMATTER_PATH_FORMAT_INVALID` | Error | 1 | `Path '{path}' in outputs for {file} is invalid.` |

### Error Accumulation

Validation uses the **error accumulation pattern** ([ADR-040](../adrs/ADR-040-error-handling-philosophy.md)): all errors and warnings are collected across all meta-prompt files and reported together at the end.

---

## Section 8: Examples

### Minimal Meta-Prompt Frontmatter

A meta-prompt with only required fields:

```yaml
---
name: create-prd
description: Create a product requirements document
phase: "pre"
order: 1
outputs:
  - docs/prd.md
---
```

### Realistic Meta-Prompt Frontmatter

A typical meta-prompt with dependencies and knowledge base references:

```yaml
---
name: system-architecture
description: Design and document system architecture
phase: "architecture"
order: 11
dependencies:
  - adrs
outputs:
  - docs/system-architecture.md
knowledge-base:
  - system-architecture
---
```

### Conditional Meta-Prompt

A meta-prompt for a step that may not apply to all projects:

```yaml
---
name: database-schema
description: Design database schema from domain models
phase: "specification"
order: 13
dependencies:
  - system-architecture
outputs:
  - docs/database-schema.md
conditional: "if-needed"
knowledge-base:
  - database-design
---
```

### Review Meta-Prompt

A review step with multiple knowledge base entries:

```yaml
---
name: review-domain-modeling
description: Review domain models for completeness, consistency, and downstream readiness
phase: "modeling"
order: 8
dependencies:
  - domain-modeling
outputs:
  - docs/domain-models/review-findings.md
knowledge-base:
  - review-methodology
  - review-domain-modeling
---
```

### Validation Phase Meta-Prompt

A validation step that depends on all core phases completing:

```yaml
---
name: cross-phase-consistency
description: Audit consistency across all phases — naming, assumptions, data flows, interface contracts
phase: "validation"
order: 27
dependencies:
  - review-security
outputs:
  - docs/validation/cross-phase-consistency.md
knowledge-base:
  - cross-phase-consistency
---
```

### Invalid Examples (With Annotations)

**Missing required fields**:
```yaml
---
phase: "architecture"
outputs:
  - docs/architecture.md
---
```
Errors: `FRONTMATTER_NAME_MISSING`, `FRONTMATTER_DESCRIPTION_MISSING`, `FRONTMATTER_ORDER_MISSING` — meta-prompts must declare `name`, `description`, and `order`.

**Invalid dependency name**:
```yaml
---
name: system-architecture
description: Design system architecture
phase: "architecture"
dependencies:
  - Phase 02 ADRs
outputs:
  - docs/system-architecture.md
---
```
Error: `FRONTMATTER_DEPENDS_INVALID_SLUG` — dependency names must be kebab-case (`^[a-z][a-z0-9-]*$`).

**Unknown fields (warning, not error)**:
```yaml
---
name: create-prd
description: Create a product requirements document
phase: "pre"
outputs:
  - docs/prd.md
custom-field: some-value
requires-capabilities:
  - filesystem-write
---
```
Warnings: `FRONTMATTER_UNKNOWN_FIELD` for `custom-field` and `requires-capabilities`. These fields are not recognized in the meta-prompt schema. (Note: `reads` is a valid field — see §3.)

---

## Section 9: Interaction with Other State Files

### `config.yml`

- **`methodology`**: The methodology selection determines which preset loads, which determines which steps are enabled. Only enabled steps have their meta-prompt frontmatter parsed.
- **`custom.steps`**: Step names in the custom config block must match meta-prompt `name` fields.
- **`project.platforms`**: Project platform selections inform conditional step evaluation (`conditional: "if-needed"`).

### `state.json`

- **`steps[name].outputs`**: The State Manager copies the `outputs` array from frontmatter into each step's state entry for quick artifact lookup without re-parsing meta-prompt files.
- **`steps[name].status`**: Completion detection checks whether all `outputs` files exist on disk. The frontmatter `outputs` list is the source of truth for what constitutes "complete."
- **`in_progress.step`**: When a step transitions to `in_progress`, the State Manager records its name.

### `methodology/<name>.yml`

- **`steps`**: Step names in the preset must correspond to meta-prompt `name` fields. The preset controls whether a step is enabled; the meta-prompt carries all other metadata.

### `knowledge/`

- **`knowledge-base` entries**: Each entry in the `knowledge-base` array resolves to a knowledge base file. The Assembly Engine loads these files and includes their content in the assembled prompt.

### `decisions.jsonl`

- Decision entries reference steps by name, which corresponds to the meta-prompt `name` field.

### `lock.json`

- No direct interaction. The lock file tracks process-level execution state, not step-level metadata.

### Assembly Engine Output

- The Assembly Engine reads frontmatter to determine: which knowledge base entries to load, what artifacts to gather as context (from dependency outputs), and what depth level to apply (from config). The assembled prompt includes all of this along with the meta-prompt body.
