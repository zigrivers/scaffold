# state.json Schema

**Phase**: 4 — Data Schemas
**Depends on**: [domain-models/03-pipeline-state-machine.md](../domain-models/03-pipeline-state-machine.md), [domain-models/15-assembly-engine.md](../domain-models/15-assembly-engine.md), [domain-models/16-methodology-depth-resolution.md](../domain-models/16-methodology-depth-resolution.md), [adrs/ADR-012-state-file-design.md](../adrs/ADR-012-state-file-design.md), [adrs/ADR-018-completion-detection-crash-recovery.md](../adrs/ADR-018-completion-detection-crash-recovery.md), [adrs/ADR-043-depth-scale.md](../adrs/ADR-043-depth-scale.md), [adrs/ADR-048-update-mode-diff-over-regeneration.md](../adrs/ADR-048-update-mode-diff-over-regeneration.md), [adrs/ADR-049-methodology-changeable-mid-pipeline.md](../adrs/ADR-049-methodology-changeable-mid-pipeline.md), [architecture/system-architecture.md](../architecture/system-architecture.md) §5
**Last updated**: 2026-03-14
**Status**: draft

---

## Section 1: Overview

`.scaffold/state.json` is the pipeline state machine's persistence file. It records which prompts have been completed, which were skipped, which are pending, and which (if any) was interrupted mid-execution. Every CLI command that reads or mutates pipeline progress operates on this file.

| Property | Value |
|----------|-------|
| **File location** | `.scaffold/state.json` (relative to project root) |
| **Created by** | `scaffold init` — State Manager initializes from dependency order |
| **Deleted by** | `scaffold reset` |
| **Written by** | State Manager (via `scaffold run`, `scaffold skip`, `scaffold init`, `scaffold reset`, crash recovery) |
| **Read by** | State Manager, Dashboard Generator, CLI Shell (`resume`, `status`, `next`, `skip`, `dashboard`, `validate`) |
| **Git status** | Committed — MUST NOT appear in `.gitignore` |
| **Write strategy** | Atomic: write to `.scaffold/state.json.tmp`, then `fs.rename()` to `.scaffold/state.json` |
| **Max expected size** | ~20 KB (25-prompt pipeline with full metadata per entry) |
| **Format** | JSON (UTF-8, no BOM) |
| **Schema version** | 1 (current) |

### Governing decisions

| ADR | What it governs |
|-----|-----------------|
| [ADR-012](../adrs/ADR-012-state-file-design.md) | Map-keyed structure, git-committed, atomic writes |
| [ADR-018](../adrs/ADR-018-completion-detection-crash-recovery.md) | Dual completion detection, `in_progress` crash recovery |
| [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md) | Unknown fields produce warnings, not errors; preserved on write-back |
| [ADR-043](../adrs/ADR-043-depth-scale.md) | Depth level (1-5) recorded per completed step |
| [ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md) | Update mode detection: re-running completed steps uses diff-based updates |
| [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md) | Methodology changeable mid-pipeline: completed steps preserved, pending re-resolved |

### Design rationale summary

- **Map-keyed** (not array): Two agents completing different prompts in separate worktrees produce non-overlapping diff hunks that merge cleanly in git.
- **Git-committed** (not gitignored): New sessions can resume where the previous session left off; team members see each other's progress.
- **Atomic writes** (temp + rename): A crash during write cannot corrupt the file — it is always either the old valid version or the new valid version.

---

## Section 2: Formal Schema Definition

JSON Schema draft 2020-12 for `.scaffold/state.json`.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold.dev/schemas/state.json",
  "title": "Pipeline State",
  "description": "Pipeline state machine persistence file. Tracks per-prompt status, in-progress execution, and cached eligibility.",
  "type": "object",
  "required": [
    "schema-version",
    "scaffold-version",
    "methodology",
    "init_methodology",
    "config_methodology",
    "init-mode",
    "created",
    "in_progress",
    "prompts",
    "next_eligible",
    "extra-prompts"
  ],
  "additionalProperties": true,
  "properties": {
    "schema-version": {
      "type": "integer",
      "const": 1,
      "description": "Schema version for forward/backward compatibility. CLI refuses to operate if this does not match its expected version."
    },
    "scaffold-version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$",
      "description": "Semver version of the scaffold CLI that created this state file. Informational — used for debugging, not for gating.",
      "examples": ["2.0.0", "2.1.3"]
    },
    "methodology": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "The methodology active when this state file was initialized. Copied from config.yml at init time. If config.yml methodology changes later, completed steps are preserved, orphaned entries are kept (not deleted), and pending steps are re-resolved against the new methodology (ADR-049). The methodology field in state.json records the original init-time value; config.yml is the source of truth for the current methodology.",
      "examples": ["deep", "mvp", "custom"]
    },
    "init_methodology": {
      "type": "string",
      "enum": ["deep", "mvp", "custom"],
      "description": "Methodology selected at scaffold init time. Set once during initialization, never updated. Used with config_methodology to detect methodology changes (ADR-054)."
    },
    "config_methodology": {
      "type": "string",
      "enum": ["deep", "mvp", "custom"],
      "description": "Current methodology from config.yml, copied into state on every scaffold run invocation. Compared against init_methodology to detect methodology changes (ADR-054)."
    },
    "init-mode": {
      "type": "string",
      "enum": ["greenfield", "brownfield", "v1-migration"],
      "description": "How the state file was initialized. greenfield = fresh project, all prompts start pending. brownfield = existing codebase, some prompts pre-completed via artifact scan. v1-migration = v1 project detected, completed prompts inferred from v1 artifacts."
    },
    "created": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when state.json was first created by scaffold init."
    },
    "in_progress": {
      "oneOf": [
        { "$ref": "#/$defs/InProgressRecord" },
        { "type": "null" }
      ],
      "description": "Tracks the currently executing prompt. null when no prompt is in progress. Non-null indicates either active execution or a crashed session that needs recovery."
    },
    "prompts": {
      "type": "object",
      "description": "Map of prompt slug to prompt state entry. Every prompt in the resolved pipeline has an entry. Keys are kebab-case prompt slugs.",
      "additionalProperties": {
        "$ref": "#/$defs/PromptStateEntry"
      },
      "propertyNames": {
        "pattern": "^[a-z][a-z0-9-]*$"
      },
      "minProperties": 1
    },
    "next_eligible": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9-]*$"
      },
      "uniqueItems": true,
      "description": "Cached list of prompt slugs eligible to run next. Recomputed on every state mutation by combining the dependency graph with current prompt statuses. This is a derived convenience field — it can always be recomputed from prompts + dependency graph."
    },
    "extra-prompts": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/ExtraPromptEntry"
      },
      "description": "User-added custom prompts not part of the resolved methodology manifest. Appended after manifest prompts; may have dependencies on manifest prompts."
    }
  },
  "$defs": {
    "PromptStatus": {
      "type": "string",
      "enum": ["pending", "in_progress", "completed", "skipped"],
      "description": "Valid prompt lifecycle statuses. No other values are permitted."
    },
    "PromptSource": {
      "type": "string",
      "enum": ["pipeline", "extra"],
      "description": "Where a step was loaded from. pipeline = standard meta-prompt from pipeline/ directory, extra = user-added custom prompt via extra-prompts config. (Note: the original values 'base', 'override', 'ext' from the three-layer prompt resolution system are superseded by ADR-041. Meta-prompt architecture uses a single pipeline/ directory.)"
    },
    "PromptStateEntry": {
      "type": "object",
      "required": ["status", "source"],
      "additionalProperties": false,
      "properties": {
        "status": {
          "$ref": "#/$defs/PromptStatus"
        },
        "source": {
          "$ref": "#/$defs/PromptSource"
        },
        "at": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp. Meaning varies by status: pending = absent, in_progress = when execution started, completed = when completion was recorded, skipped = when the skip was recorded."
        },
        "produces": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Expected output file paths, copied from prompt frontmatter. Relative to project root. Used for completion detection."
        },
        "artifacts_verified": {
          "type": "boolean",
          "description": "Whether all produces artifacts have been verified to exist on disk. Only meaningful when status is completed.",
          "default": false
        },
        "completed_by": {
          "type": "string",
          "description": "Identity of the user/agent who completed or skipped this prompt. Set when status transitions to completed or skipped. For auto-detected completions: 'scaffold-adopt', 'v1-migration', or 'state-recovery'."
        },
        "reason": {
          "type": "string",
          "description": "Human-readable reason for skipping. Only present when status is skipped."
        },
        "depth": {
          "type": "integer",
          "minimum": 1,
          "maximum": 5,
          "description": "Depth level (1-5) at which this step was executed. Recorded when status transitions to completed. Used for update mode detection (ADR-048) and depth change warnings (ADR-049). Scale: 1 (MVP floor) through 5 (deep ceiling)."
        }
      },
      "allOf": [
        {
          "if": {
            "properties": { "status": { "const": "completed" } }
          },
          "then": {
            "required": ["status", "source", "at", "completed_by", "depth"]
          }
        },
        {
          "if": {
            "properties": { "status": { "const": "skipped" } }
          },
          "then": {
            "required": ["status", "source", "at", "completed_by", "reason"]
          }
        },
        {
          "if": {
            "properties": { "status": { "const": "in_progress" } }
          },
          "then": {
            "required": ["status", "source", "at"]
          }
        },
        {
          "if": {
            "properties": { "status": { "const": "pending" } }
          },
          "then": {
            "required": ["status", "source"]
          }
        }
      ]
    },
    "InProgressRecord": {
      "type": "object",
      "required": ["prompt", "started", "partial_artifacts", "actor"],
      "additionalProperties": false,
      "properties": {
        "prompt": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$",
          "description": "Slug of the prompt currently executing. Must be a key in the prompts map."
        },
        "started": {
          "type": "string",
          "format": "date-time",
          "description": "ISO 8601 timestamp when execution started."
        },
        "partial_artifacts": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Paths of artifacts from the produces list that have been detected on disk during the current execution. Empty array at the start of execution. Updated periodically during long-running prompts."
        },
        "actor": {
          "type": "string",
          "description": "Identity of the user/agent running this prompt. Used for attribution and lock coordination."
        }
      }
    },
    "ExtraPromptEntry": {
      "type": "object",
      "required": ["slug", "path"],
      "additionalProperties": false,
      "properties": {
        "slug": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$",
          "description": "Unique slug for the custom prompt. Must not collide with manifest prompt slugs."
        },
        "path": {
          "type": "string",
          "description": "Path to the prompt file, relative to project root."
        },
        "depends-on": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Optional dependencies on manifest prompts or other extra prompts."
        },
        "phase": {
          "type": "integer",
          "minimum": 0,
          "maximum": 20,
          "description": "Phase number for display grouping."
        }
      }
    }
  }
}
```

> **Note on schema-version:** The state file schema version is `1` (the initial version for v2). This is distinct from the config.yml `version: 2` field. State schema version increments only when the state file structure has breaking changes. Task descriptions referencing `schema_version: 2` should read `schema-version: 1`.

---

## Section 3: Field Reference

### Top-level fields

| Field | Type | Required | Default | Constraints | Description | Consumers |
|-------|------|----------|---------|-------------|-------------|-----------|
| `schema-version` | `integer` | Yes | — | Must equal `1` | Schema version for compatibility gating. CLI refuses to operate on mismatched versions. | State Manager (version check on load) |
| `scaffold-version` | `string` | Yes | — | Semver format (`N.N.N`). Pattern permits leading zeros; scaffold versions never use them. | CLI version that created the file. Informational only. | Debugging, `scaffold status` display |
| `methodology` | `string` | Yes | — | kebab-case (`[a-z][a-z0-9-]*`) | Methodology name at init time. Records the original choice; `config.yml` is the source of truth for the *current* methodology ([ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)). | State Manager (methodology change detection), Dashboard Generator |
| `init_methodology` | `string` | Yes | — | One of: `deep`, `mvp`, `custom` | Methodology selected at `scaffold init` time. Set once during initialization, never updated. Used with `config_methodology` to detect methodology changes ([ADR-054](../adrs/ADR-054-state-methodology-tracking.md)). | Methodology Resolver (change detection) |
| `config_methodology` | `string` | Yes | — | One of: `deep`, `mvp`, `custom` | Current methodology from `config.yml`, copied into state on every `scaffold run` invocation. Compared against `init_methodology` to detect methodology changes ([ADR-054](../adrs/ADR-054-state-methodology-tracking.md)). | Methodology Resolver (change detection), `scaffold status` |
| `init-mode` | `string` | Yes | — | One of: `greenfield`, `brownfield`, `v1-migration` | How state was initialized. Recorded for auditability. | `scaffold status` display, Dashboard Generator |
| `created` | `string` | Yes | — | ISO 8601 date-time | When state.json was first created. | `scaffold status` display |
| `in_progress` | `InProgressRecord \| null` | Yes | `null` | At most one; see InProgressRecord | Currently executing prompt or `null`. Non-null triggers crash recovery on resume. | State Manager (crash detection), `scaffold status` |
| `prompts` | `Record<string, PromptStateEntry>` | Yes | — | At least 1 entry; keys are kebab-case prompt slugs | Map of every prompt in the resolved pipeline to its state entry. | State Manager (all operations), Dashboard Generator, `scaffold status`, `scaffold validate` |
| `next_eligible` | `string[]` | Yes | `[]` | Unique items; each must be a key in `prompts` | Cached eligible prompt list. Derived field — recomputed on every mutation. | `scaffold next`, `scaffold run`, Dashboard Generator |
| `extra-prompts` | `ExtraPromptEntry[]` | Yes | `[]` | — | User-added custom prompts not in the methodology manifest. | State Manager (initialization), Dependency Resolver |

### PromptStateEntry fields

| Field | Type | Required | Default | Constraints | Description | Consumers |
|-------|------|----------|---------|-------------|-------------|-----------|
| `status` | `string` | Yes | `"pending"` | One of: `pending`, `in_progress`, `completed`, `skipped` | Current lifecycle status. See state transition rules in domain model 03. | State Manager, Dashboard Generator, `scaffold status`, `scaffold validate` |
| `source` | `string` | Yes | — | One of: `pipeline`, `extra` | Where the step was loaded from. `pipeline` = standard meta-prompt from `pipeline/` directory. `extra` = user-added custom prompt. (Supersedes the original `base`/`override`/`ext` values from the three-layer resolution system — [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md).) | `scaffold status` display |
| `at` | `string` | Conditional | — | ISO 8601 date-time. Required when status is `completed`, `skipped`, or `in_progress`. Absent when `pending`. | Timestamp whose meaning varies by status: execution start (in_progress), completion (completed), or skip (skipped). | `scaffold status`, Dashboard Generator, crash recovery (staleness detection) |
| `produces` | `string[]` | No | `[]` | File paths relative to project root | Expected output file paths from prompt frontmatter. Used for artifact-based completion detection. | State Manager (dual completion detection), `scaffold validate` |
| `artifacts_verified` | `boolean` | No | `false` | Only meaningful when status is `completed` | Whether all `produces` artifacts have been verified to exist on disk. | `scaffold validate`, Dashboard Generator |
| `completed_by` | `string` | Conditional | — | Required when status is `completed` or `skipped` | Identity of the actor (user, agent, or system). System values: `scaffold-adopt`, `v1-migration`, `state-recovery`. | `scaffold status` display, crash recovery analysis |
| `reason` | `string` | Conditional | — | Only present when status is `skipped` | Required when status is `skipped`. Human-readable explanation for why the prompt was skipped. | `scaffold status` display, Dashboard Generator |
| `depth` | `integer` | Conditional | — | 1-5. Required when status is `completed`. | Depth level at which this step was executed ([ADR-043](../adrs/ADR-043-depth-scale.md)). Recorded at completion time. Used by update mode detection ([ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md)) to determine if depth changed, and by methodology change warnings ([ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)) to flag steps completed at a different depth than the current config. | Assembly Engine (update mode), `scaffold status`, `scaffold validate` |

### InProgressRecord fields

| Field | Type | Required | Default | Constraints | Description | Consumers |
|-------|------|----------|---------|-------------|-------------|-----------|
| `prompt` | `string` | Yes | — | kebab-case; must be a key in `prompts` map | Slug of the prompt currently executing. | Crash recovery, State Manager |
| `started` | `string` | Yes | — | ISO 8601 date-time | When execution started. Used for staleness detection during crash recovery. | Crash recovery, `scaffold status` |
| `partial_artifacts` | `string[]` | Yes | `[]` | Each must be a path from the prompt's `produces` list | Artifacts detected on disk during current execution. Empty at start, updated periodically. | Crash recovery (determines partial vs. no progress) |
| `actor` | `string` | Yes | — | — | Identity of the user/agent running this prompt. | Crash recovery reporting, lock coordination |

### ExtraPromptEntry fields

| Field | Type | Required | Default | Constraints | Description | Consumers |
|-------|------|----------|---------|-------------|-------------|-----------|
| `slug` | `string` | Yes | — | kebab-case; must not collide with manifest prompt slugs | Unique identifier for the custom prompt. | State Manager, Dependency Resolver |
| `path` | `string` | Yes | — | Relative to project root | Path to the prompt file. | Build system, prompt resolution |
| `depends-on` | `string[]` | No | `[]` | Each must be a valid prompt slug (manifest or extra) | Dependencies on other prompts. | Dependency Resolver |
| `phase` | `integer` | No | — | 0-20 | Phase number for display grouping. | Dashboard Generator |

---

## Section 4: Cross-Schema References

| Field | References | Target Schema | Constraint | Validated By |
|-------|-----------|---------------|------------|--------------|
| `methodology` | `methodology` field in `.scaffold/config.yml` | [config-yml-schema.md](config-yml-schema.md) | Must match exactly. Mismatch produces `PSM_METHODOLOGY_MISMATCH` error. | State Manager on load |
| `prompts.{key}` | Resolved prompt set from `manifest.yml` + config `extra-prompts` | [manifest-yml-schema.md](manifest-yml-schema.md) | Every key must exist in the resolved prompt set at time of state initialization. Orphaned keys (from methodology change) are preserved but ignored. | `scaffold validate` (warning: orphaned entries) |
| `prompts.{key}.produces[]` | `produces` field in prompt frontmatter YAML | [frontmatter-schema.md](frontmatter-schema.md) | Copied verbatim from frontmatter at init time. Paths are relative to project root. | State Manager (dual completion detection checks file existence at these paths) |
| `prompts.{key}.source` | Source of step: `pipeline` (meta-prompt from `pipeline/` directory) or `extra` (user-added custom prompt) | [frontmatter-schema.md](frontmatter-schema.md) | Must reflect actual source. | State Manager at initialization |
| `in_progress.prompt` | A key in the `prompts` map | (self) | Must be a valid key in `prompts`. If the referenced key is missing, state is corrupt. | State Manager on load |
| `next_eligible[]` items | Keys in the `prompts` map | (self) | Every slug must be a key in `prompts` with status `pending` and all dependencies satisfied. | State Manager (recomputed on mutation; stale values are harmless) |
| `extra-prompts[].slug` | May appear as a key in `prompts` | (self) | If the extra prompt was included in the resolved pipeline, it has a corresponding `prompts` entry. | State Manager at initialization |
| `extra-prompts[].depends-on[]` | Prompt slugs (manifest or extra) | [manifest-yml-schema.md](manifest-yml-schema.md), (self) | Each referenced slug must exist in the resolved prompt set. | Dependency Resolver |
| (external) `decisions.jsonl` `prompt` field | Keys in the `prompts` map | [decisions-jsonl-schema.md](decisions-jsonl-schema.md) | Decision entries reference prompt slugs. Orphaned references (prompt removed by methodology change) produce `DECISION_UNKNOWN_PROMPT` warning. | `scaffold validate` |
| (file-level) | Lock coordination | [lock-json-schema.md](lock-json-schema.md) | Lock must be acquired before state mutation | Lock Manager (runtime) |
| `prompts.*.artifacts_verified` | Tracking comments on artifacts | [secondary-formats.md](secondary-formats.md) | Dual completion detection checks artifact line 1 | `scaffold validate` |

---

## Section 5: Version History and Migration

### Current version

| Property | Value |
|----------|-------|
| `schema-version` | `1` |
| Introduced in | scaffold v2.0.0 |
| Status | Active |

### What constitutes a breaking change

A schema change is **breaking** if any of the following apply:

1. A required field is added (older CLIs would produce files that newer CLIs reject)
2. A required field is removed or renamed
3. A field's type changes (e.g., `string` to `number`)
4. An enum gains a value that older CLIs would encounter but not understand (e.g., a new `status` value)
5. The semantics of an existing field change in a way that alters behavior

A schema change is **non-breaking** if:

1. A new optional field is added (forward compatibility: older CLIs ignore it per ADR-033)
2. A new valid value is added to an enum that older CLIs never produce
3. The description or documentation of a field changes without altering behavior

### Migration rules

1. **Version check on load**: The State Manager reads `schema-version` before processing any other field. If the version does not match the CLI's expected version, it emits `PSM_SCHEMA_VERSION_MISMATCH` and exits with code 3.
2. **No automatic migration**: There is no migration code in v1. When a future v2 schema is introduced, the CLI will include a migration function `migrateV1toV2()` that transforms the file in place (atomically).
3. **Migration is idempotent**: Running migration on an already-migrated file produces no changes.
4. **Backup before migration**: The CLI writes a backup to `.scaffold/state.json.v{old}.bak` before performing migration.
5. **schema-version bump**: Migration updates `schema-version` to the new value. `scaffold-version` is updated to the current CLI version.

### Migration note: `init_methodology` and `config_methodology`

Existing state files created before the introduction of `init_methodology` and `config_methodology` ([ADR-054](../adrs/ADR-054-state-methodology-tracking.md)) will not contain these fields. During migration, both fields should default to the value of the existing `methodology` field. This preserves the assumption that no methodology change has occurred for pre-existing state files.

### Forward compatibility (ADR-033)

- Unknown fields in `state.json` produce warnings, not errors.
- Unknown fields are preserved in the in-memory representation during processing.
- When writing state back to disk, unknown fields are preserved in the output.
- This allows a v2.3 CLI to add fields that a v2.1 CLI will carry forward without data loss.

---

## Section 6: Serialization Details

| Property | Specification |
|----------|---------------|
| **Encoding** | UTF-8, no BOM |
| **Line endings** | LF (`\n`). The file is JSON; line endings within string values are escaped as `\n`. |
| **Trailing newline** | Yes — a single `\n` after the closing `}`. Prevents "no newline at end of file" git warnings. |
| **Indentation** | 2 spaces. Produced by `JSON.stringify(state, null, 2)`. |
| **Key ordering** | Top-level keys in declaration order (schema-version, scaffold-version, methodology, init-mode, created, in_progress, prompts, next_eligible, extra-prompts). Prompt keys within `prompts` in manifest dependency order (the topological sort order from domain 02). No runtime sorting — order is preserved from initialization. |
| **Max file size** | ~20 KB for a 25-prompt pipeline with full metadata per entry. ~100 KB upper bound for pathological cases (many extra prompts, long reason strings). |
| **Atomicity** | All writes use the temp-file-then-rename pattern: (1) serialize to JSON string, (2) write to `.scaffold/state.json.tmp`, (3) `fs.rename('.scaffold/state.json.tmp', '.scaffold/state.json')`. `fs.rename()` is atomic on POSIX systems (single inode operation). The temp file and target file must be on the same filesystem — `.scaffold/` being a subdirectory of the project naturally satisfies this. |
| **Concurrent writes** | Within a single worktree, the Lock Manager (domain 13) prevents concurrent state mutations. Across worktrees, each has its own `.scaffold/state.json`. Across machines (same branch), git merge handles reconciliation — the map-keyed structure ensures non-overlapping diff hunks for different prompts. |
| **NFS / network filesystems** | Not supported. Atomic rename may not be atomic on NFS. |

---

## Section 7: Validation Rules

### Structural rules (parse-time)

Checked when `state.json` is first loaded. Failure at this level means the file cannot be used at all.

| ID | Rule | Error Code | Message Template | `scaffold validate` |
|----|------|-----------|-----------------|---------------------|
| S1 | File contains valid JSON | `STATE_PARSE_ERROR` | `state.json contains invalid JSON: {parse_error}` | Yes |
| S2 | Root value is an object | `STATE_PARSE_ERROR` | `state.json root must be an object, got {type}` | Yes |
| S3 | `schema-version` is present and is an integer | `STATE_VERSION_MISMATCH` | `state.json missing or invalid schema-version` | Yes |
| S4 | `schema-version` equals the CLI's expected version | `STATE_VERSION_MISMATCH` | `state.json schema version {found} does not match CLI expectation {expected}. Run 'scaffold update' to get a compatible CLI version.` | Yes |
| S5 | All required top-level fields are present | `STATE_CORRUPTED` | `state.json missing required field: {field}` | Yes |
| S6 | `prompts` is a non-empty object | `STATE_CORRUPTED` | `state.json prompts must be a non-empty object` | Yes |
| S7 | Every `prompts` value has a valid `status` field | `STATE_CORRUPTED` | `Prompt '{slug}' has invalid status '{value}'. Valid: pending, in_progress, completed, skipped` | Yes |
| S8 | `in_progress` is either `null` or a valid InProgressRecord | `STATE_CORRUPTED` | `state.json in_progress is malformed: {details}` | Yes |
| S9 | `next_eligible` is an array of strings | `STATE_CORRUPTED` | `state.json next_eligible must be an array of strings` | Yes |
| S10 | `init-mode` is one of the three valid values | `STATE_CORRUPTED` | `state.json init-mode '{value}' is invalid. Valid: greenfield, brownfield, v1-migration` | Yes |
| S11 | Prompt keys match kebab-case pattern | `STATE_CORRUPTED` | `Prompt key '{key}' is not valid kebab-case` | Yes |
| S12 | `created` is a valid ISO 8601 date-time string | `STATE_CORRUPTED` | `state.json created '{value}' is not valid ISO 8601` | Yes |

### Semantic rules (validate-time)

Checked during `scaffold validate` and opportunistically during `scaffold run`. Failure at this level produces warnings or errors depending on severity.

| ID | Rule | Error Code | Severity | Message Template | `scaffold validate` |
|----|------|-----------|----------|-----------------|---------------------|
| V1 | `methodology` in state.json differs from `config.yml` `methodology` (methodology changed mid-pipeline per [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)) | `PSM_METHODOLOGY_MISMATCH` | warning | `Methodology changed: state.json was initialized with '{state_method}', config.yml now says '{config_method}'. Completed steps preserved. Orphaned entries kept. Pending steps re-resolved against new methodology.` | Yes |
| V2 | If `in_progress` is non-null, `in_progress.prompt` must be a key in `prompts` | `STATE_CORRUPTED` | error | `in_progress references unknown prompt '{slug}'` | Yes |
| V3 | If `in_progress` is non-null, exactly one prompt must have status `in_progress` | `STATE_CORRUPTED` | error | `in_progress is set but no prompt has status 'in_progress' (or multiple do)` | Yes |
| V4 | If `in_progress` is non-null, the prompt it references must have status `in_progress` | `STATE_CORRUPTED` | error | `in_progress references prompt '{slug}' but its status is '{status}'` | Yes |
| V5 | At most one prompt has status `in_progress` across the entire `prompts` map | `STATE_CORRUPTED` | error | `Multiple prompts have status 'in_progress': {slugs}` | Yes |
| V6 | Every slug in `next_eligible` must be a key in `prompts` with status `pending` | `STATE_STALE_NEXT_ELIGIBLE` | warning | `next_eligible contains '{slug}' which is not a pending prompt. Cache will be recomputed.` | Yes |
| V7 | Completed prompts must have `at` and `completed_by` set | `STATE_INCOMPLETE_COMPLETION` | warning | `Prompt '{slug}' is marked completed but is missing {field}. The completion may be from a crashed session.` | Yes |
| V8 | Skipped prompts must have `at`, `completed_by`, and `reason` set | `STATE_INCOMPLETE_SKIP` | warning | `Prompt '{slug}' is marked skipped but is missing {field}.` | Yes |
| V9 | Every prompt key in `prompts` should exist in the resolved prompt set | (orphaned entry) | warning | `Prompt '{slug}' in state.json is not in the resolved pipeline (methodology may have changed)` | Yes |
| V10 | Completed prompts with `artifacts_verified: true` should have all `produces` files on disk | `PSM_STATE_WITHOUT_ARTIFACTS` | warning | `Prompt '{slug}' is marked completed but {count} artifact(s) are missing: {paths}. Consider re-running with 'scaffold run --from {slug}'.` | Yes |
| V11 | Pending prompts whose `produces` artifacts all exist on disk should be flagged | `PSM_ARTIFACTS_WITHOUT_STATE` | warning | `Prompt '{slug}' has all expected artifacts but status is '{status}'. Marking as completed.` | Yes |
| V12 | Artifacts that exist but are zero bytes should be flagged | `PSM_ZERO_BYTE_ARTIFACT` | warning | `Artifact '{path}' exists but is zero bytes. It may be corrupt or incomplete.` | Yes |
| V13 | `in_progress.started` timestamp should not be unreasonably old (>24 hours) | `PSM_CRASH_DETECTED` | warning | `Previous session crashed during '{slug}' (started {timestamp}). in_progress record is {hours}h old.` | Yes |
| V14 | `extra-prompts[].slug` must not collide with any key in `prompts` that came from the manifest | (slug collision) | error | `Extra prompt slug '{slug}' collides with manifest prompt` | Yes |
| V15 | Unknown top-level fields | (forward compatibility) | warning | `warning: unknown field "{field}" in .scaffold/state.json (possible typo, or from a newer scaffold version)` | Yes |
| V16 | Skipped prompts must have a `reason` field | `STATE_MISSING_SKIP_REASON` | error | `Prompt '{key}' has status 'skipped' but no reason. Use 'scaffold skip <prompt> --reason <text>' to provide one.` | Yes |
| V17 | `produces` paths must be relative (no leading `/`), must not contain `..` traversal, and must use forward slashes | `STATE_PATH_FORMAT_INVALID` | error | `Path '{path}' in produces for prompt '{slug}' contains invalid characters or traversal. Paths must be relative with forward slashes and no '..' segments.` | Yes |
| V18 | `extra-prompts[].depends-on[]` slugs should exist in the resolved prompt set | `STATE_EXTRA_PROMPT_UNKNOWN_DEP` | warning | `Extra prompt '{name}' depends on '{dep}' which is not in the resolved prompt set.` | Yes |
| V19 | Completed prompts must have `depth` set (integer 1-5) | `STATE_MISSING_DEPTH` | warning | `Prompt '{slug}' is marked completed but has no depth field. The completion may predate depth tracking.` | Yes |
| V20 | Completed prompts whose `depth` differs from the current config depth | `PSM_DEPTH_MISMATCH` | warning | `Prompt '{slug}' was completed at depth {completed_depth} but current config specifies depth {config_depth}. Re-run with 'scaffold run {slug}' to update.` | Yes |

---

## Section 8: Examples

### Example 1: Minimal valid instance

A freshly initialized greenfield pipeline with two prompts. Represents the simplest possible valid state.

```json
{
  "schema-version": 1,
  "scaffold-version": "2.0.0",
  "methodology": "deep",
  "init-mode": "greenfield",
  "created": "2026-03-13T10:00:00Z",
  "in_progress": null,
  "prompts": {
    "create-prd": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/plan.md"]
    },
    "tech-stack": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/tech-stack.md"]
    }
  },
  "next_eligible": ["create-prd"],
  "extra-prompts": []
}
```

### Example 2: Complete realistic instance (mid-pipeline)

A deep methodology pipeline partway through execution. Three prompts completed, one in progress, several pending. Demonstrates all status types, the in_progress record, and per-step depth tracking.

```json
{
  "schema-version": 1,
  "scaffold-version": "2.0.0",
  "methodology": "deep",
  "init-mode": "greenfield",
  "created": "2026-03-12T09:00:00Z",
  "in_progress": {
    "prompt": "project-structure",
    "started": "2026-03-13T14:30:00Z",
    "partial_artifacts": [],
    "actor": "agent-1"
  },
  "prompts": {
    "create-prd": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/plan.md"],
      "at": "2026-03-12T09:45:00Z",
      "artifacts_verified": true,
      "completed_by": "ken",
      "depth": 5
    },
    "review-prd": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/reviews/pre-review-prd.md"],
      "at": "2026-03-12T10:15:00Z",
      "artifacts_verified": true,
      "completed_by": "ken",
      "depth": 5
    },
    "innovate-prd": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/prd-innovation.md"],
      "at": "2026-03-12T10:30:00Z",
      "artifacts_verified": true,
      "completed_by": "ken",
      "depth": 5
    },
    "tech-stack": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/tech-stack.md"],
      "at": "2026-03-12T11:00:00Z",
      "artifacts_verified": true,
      "completed_by": "ken",
      "depth": 5
    },
    "coding-standards": {
      "status": "skipped",
      "source": "pipeline",
      "produces": ["docs/coding-standards.md"],
      "at": "2026-03-12T11:30:00Z",
      "completed_by": "ken",
      "reason": "Using existing team coding standards from monorepo"
    },
    "tdd": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/tdd-standards.md"]
    },
    "project-structure": {
      "status": "in_progress",
      "source": "pipeline",
      "produces": ["docs/project-structure.md"],
      "at": "2026-03-13T14:30:00Z"
    },
    "dev-env-setup": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/dev-setup.md", "Makefile"]
    },
    "design-system": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/design-system.md"]
    },
    "user-stories-gaps": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/user-stories.md"]
    },
    "git-workflow": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/git-workflow.md"]
    }
  },
  "next_eligible": ["tdd"],
  "extra-prompts": []
}
```

### Example 3: Maximal instance (every optional field populated)

Brownfield initialization with extra prompts, a completed re-run, and every optional field filled.

```json
{
  "schema-version": 1,
  "scaffold-version": "2.1.3",
  "methodology": "deep",
  "init-mode": "brownfield",
  "created": "2026-03-10T08:00:00Z",
  "in_progress": {
    "prompt": "user-stories-gaps",
    "started": "2026-03-13T16:00:00Z",
    "partial_artifacts": ["docs/user-stories.md"],
    "actor": "agent-2"
  },
  "prompts": {
    "create-prd": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/plan.md"],
      "at": "2026-03-10T08:00:00Z",
      "artifacts_verified": true,
      "completed_by": "scaffold-adopt",
      "depth": 5
    },
    "review-prd": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/reviews/pre-review-prd.md"],
      "at": "2026-03-11T09:30:00Z",
      "artifacts_verified": true,
      "completed_by": "ken",
      "depth": 5
    },
    "innovate-prd": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/prd-innovation.md"],
      "at": "2026-03-11T09:45:00Z",
      "artifacts_verified": true,
      "completed_by": "ken",
      "depth": 5
    },
    "tech-stack": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/tech-stack.md"],
      "at": "2026-03-10T08:00:00Z",
      "artifacts_verified": true,
      "completed_by": "scaffold-adopt",
      "depth": 5
    },
    "coding-standards": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/coding-standards.md"],
      "at": "2026-03-12T14:00:00Z",
      "artifacts_verified": true,
      "completed_by": "alice",
      "depth": 5
    },
    "tdd": {
      "status": "skipped",
      "source": "pipeline",
      "produces": ["docs/tdd-standards.md"],
      "at": "2026-03-12T14:30:00Z",
      "completed_by": "ken",
      "reason": "Team uses property-based testing; TDD doc not applicable"
    },
    "project-structure": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/project-structure.md"],
      "at": "2026-03-13T10:00:00Z",
      "artifacts_verified": true,
      "completed_by": "agent-1",
      "depth": 5
    },
    "dev-env-setup": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/dev-setup.md", "Makefile"],
      "at": "2026-03-13T11:00:00Z",
      "artifacts_verified": true,
      "completed_by": "agent-1",
      "depth": 5
    },
    "design-system": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/design-system.md"]
    },
    "user-stories-gaps": {
      "status": "in_progress",
      "source": "pipeline",
      "produces": ["docs/user-stories.md"],
      "at": "2026-03-13T16:00:00Z"
    },
    "git-workflow": {
      "status": "pending",
      "source": "pipeline",
      "produces": ["docs/git-workflow.md"]
    },
    "custom-api-design": {
      "status": "pending",
      "source": "extra",
      "produces": ["docs/api-design.md"]
    }
  },
  "next_eligible": ["design-system", "git-workflow"],
  "extra-prompts": [
    {
      "slug": "custom-api-design",
      "path": "prompts/custom/api-design.md",
      "depends-on": ["tech-stack", "project-structure"],
      "phase": 4
    }
  ]
}
```

### Example 4: Invalid instance (annotated errors)

The following instance contains five deliberate errors, annotated with their error codes.

```json
{
  "schema-version": 2,
  "scaffold-version": "2.0.0",
  "methodology": "deep",
  "init-mode": "greenfield",
  "created": "2026-03-13T10:00:00Z",
  "in_progress": {
    "prompt": "nonexistent-prompt",
    "started": "2026-03-13T14:00:00Z",
    "partial_artifacts": [],
    "actor": "ken"
  },
  "prompts": {
    "create-prd": {
      "status": "completed",
      "source": "pipeline",
      "produces": ["docs/plan.md"]
    },
    "tech-stack": {
      "status": "finished",
      "source": "pipeline",
      "produces": ["docs/tech-stack.md"]
    },
    "coding-standards": {
      "status": "in_progress",
      "source": "pipeline",
      "produces": ["docs/coding-standards.md"],
      "at": "2026-03-13T13:00:00Z"
    }
  },
  "next_eligible": ["create-prd"],
  "extra-prompts": []
}
```

**Error annotations:**

| # | Location | Error Code | Rule | Explanation |
|---|----------|-----------|------|-------------|
| 1 | `schema-version: 2` | `STATE_VERSION_MISMATCH` (S4) | Schema version must equal `1` | CLI expects version 1; version 2 is unrecognized. |
| 2 | `in_progress.prompt: "nonexistent-prompt"` | `STATE_CORRUPTED` (V2) | `in_progress.prompt` must be a key in `prompts` | The slug `nonexistent-prompt` does not appear in the `prompts` map. |
| 3 | `create-prd` completed but missing `at` and `completed_by` | `STATE_CORRUPTED` (V7) | Completed prompts must have `at` and `completed_by` | Status is `completed` but neither the timestamp nor actor is recorded. |
| 4 | `tech-stack.status: "finished"` | `STATE_CORRUPTED` (S7) | Status must be one of: `pending`, `in_progress`, `completed`, `skipped` | `finished` is not a valid status value. |
| 5 | `coding-standards` has status `in_progress` while `in_progress.prompt` references a different prompt | `STATE_CORRUPTED` (V3/V4) | If `in_progress` is non-null, exactly one prompt must have status `in_progress` and it must match | `in_progress.prompt` is `nonexistent-prompt` but `coding-standards` has status `in_progress`. Also, `next_eligible` lists `create-prd` which has status `completed`, not `pending` (V6). |

---

## Section 9: Interaction with Other State Files

### During `scaffold init` (initialization path)

```
config.yml ──reads──→ State Manager ──writes──→ state.json
                          ↑
manifest.yml ─────────────┘ (resolved prompt set + dependency graph)
```

1. **Config Loader** reads `.scaffold/config.yml` to determine the active methodology.
2. **Methodology & Depth Resolver** (domain 16) + **Dependency Resolver** (domain 02) produce the ordered step list with dependency graph, `produces` fields (from meta-prompt frontmatter), and enablement status.
3. **State Manager** calls `initializeState()`:
   - Creates the `prompts` map with one entry per resolved prompt, all set to `pending`.
   - For **brownfield** (`scaffold adopt`): scans the filesystem for existing artifacts. Prompts whose `produces` files all exist are pre-completed with `completed_by: "scaffold-adopt"`.
   - For **v1-migration**: scans for v1 tracking comments in existing documents. Prompts whose artifacts contain v1 tracking comments are pre-completed with `completed_by: "v1-migration"`.
   - Computes `next_eligible` from the dependency graph.
4. **State Manager** writes atomically to `.scaffold/state.json`.
5. **Decision Logger** creates an empty `.scaffold/decisions.jsonl` (or pre-populates for brownfield).

**Interactions**: `state.json` does not exist before init. `config.yml` must exist. `decisions.jsonl` is created alongside state.json. No lock is needed during init (the project is being set up for the first time, or `scaffold reset` cleared the previous state).

### During `scaffold run` (execution path)

```
state.json ──reads──→ State Manager ──writes──→ state.json
     ↕                     ↑↓                       ↕
lock.json              decisions.jsonl        produced artifacts
```

1. **Lock Manager** acquires `.scaffold/lock.json` (or detects stale lock and clears it).
2. **State Manager** reads `state.json`.
3. **Crash recovery check**: If `in_progress` is non-null:
   - Run dual completion detection on the interrupted prompt (check `produces` artifacts on disk).
   - All artifacts present: auto-mark completed, clear `in_progress`, continue.
   - Partial/no artifacts: prompt user for recovery action (re-run, accept, or skip).
4. **Methodology change check** ([ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)): Compare `state.json` `methodology` against `config.yml` `methodology`. If they differ, emit `PSM_METHODOLOGY_MISMATCH` warning. Completed steps are preserved. Steps in state.json that no longer appear in the new methodology become orphaned entries (preserved, not deleted). New steps from the new methodology are added as `pending`. Pending steps are re-resolved against the new methodology's depth and enablement configuration.
5. **Artifact reconciliation**: For each prompt with status `pending`, check if all `produces` artifacts exist on disk. If so, auto-mark completed with `completed_by: "artifact"` and emit `PSM_ARTIFACTS_WITHOUT_STATE` warning.
6. **Eligibility**: Read `next_eligible` (or recompute if stale). Select next prompt.
6a. **Update mode detection** ([ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md)): If the selected step's status is `completed` and its `produces` artifacts exist on disk, the step enters update mode. The Assembly Engine includes the existing artifact content and previous `depth` in the assembled prompt for diff-based updates rather than full regeneration. If the current config depth differs from the recorded `depth`, a depth change context is provided.
7. **Transition to in_progress**: Set `in_progress` record. Update the prompt's status to `in_progress` with `at` timestamp. Write atomically.
8. **Agent executes** (outside scaffold control). Agent may produce artifacts listed in `produces`.
9. **Transition to completed**: Verify artifacts exist. Set `artifacts_verified`, `at`, `completed_by`, `depth` (the depth level used for this execution, from config/methodology — [ADR-043](../adrs/ADR-043-depth-scale.md)). Clear `in_progress`. Recompute `next_eligible`. Write atomically.
10. **Decision Logger** appends 0-3 decision entries to `decisions.jsonl` with `prompt_completed: true`.
11. **Lock Manager** releases `.scaffold/lock.json`.

**Interactions**: `lock.json` and `in_progress` are intentionally independent mechanisms (ADR-019). Lock is local-machine coordination; `in_progress` is cross-machine crash detection. `decisions.jsonl` references prompt slugs from `state.json` but the two files are not transactionally coupled — a crash between state update and decision write leaves orphaned provisional decisions, which are harmless.

### During `scaffold build` (build path)

```
config.yml ──reads──→ Build System ──writes──→ build outputs (commands/*.md, etc.)
state.json ──(not read)──
```

`scaffold build` does **not** read or write `state.json`. It is a pure transformation from config + prompt content to build outputs. The build path and the state path are decoupled — `scaffold build` can be run at any time without affecting pipeline progress. `state.json` is only consulted by runtime commands (`resume`, `status`, `next`, `skip`, `dashboard`, `validate`).

### During `scaffold reset` (reset path)

```
state.json ──deleted──→ (gone)
decisions.jsonl ──deleted──→ (gone)
config.yml ──preserved──
produced artifacts ──preserved──
```

1. `scaffold reset` deletes `.scaffold/state.json` and `.scaffold/decisions.jsonl`.
2. `config.yml` is preserved — it represents the user's project choices, not pipeline progress.
3. Produced artifacts (e.g., `docs/plan.md`) are preserved — they are the deliverables, not metadata.
4. The user must run `scaffold init` to re-create state.json. If artifacts exist on disk, the init wizard can be run in brownfield mode to pre-complete prompts that already have artifacts.
5. Git history preserves all deleted files — `git show HEAD:.scaffold/state.json` recovers the last committed state.

### During `scaffold validate` (validation path)

```
state.json ──reads──→ Validator
config.yml ──reads──→ Validator
produced artifacts ──reads (existence check)──→ Validator
decisions.jsonl ──reads──→ Validator
```

`scaffold validate` reads `state.json` and cross-references it against:
- `config.yml`: methodology match (V1), resolved prompt set match (V9)
- Produced artifacts on disk: completed-but-missing (V10), pending-but-present (V11), zero-byte (V12)
- `decisions.jsonl`: orphaned decision references (`DECISION_UNKNOWN_PROMPT`)
- Internal consistency: in_progress integrity (V2-V5), required fields (V7-V8), stale cache (V6)

The validator emits structured error and warning output per the CLI output contract (ADR-025). Exit code 0 if only warnings; exit code 1 if any errors.

### During `scaffold skip` (skip path)

```
state.json ──reads/writes──→ State Manager
```

1. State Manager reads `state.json`, finds the target prompt.
2. Validates the prompt is in `pending` status.
3. Transitions to `skipped` with `at`, `completed_by`, and optional `reason`.
4. Recomputes `next_eligible` (skipped prompts satisfy dependencies for downstream prompts).
5. Writes atomically.
6. If the skipped prompt has dependents, emits `PSM_SKIP_HAS_DEPENDENTS` warning.

### File interaction summary matrix

| Operation | `state.json` | `config.yml` | `decisions.jsonl` | `lock.json` | Produced artifacts |
|-----------|:---:|:---:|:---:|:---:|:---:|
| `scaffold init` | Write (create) | Read | Write (create) | -- | Read (brownfield scan) |
| `scaffold build` | -- | Read | -- | -- | -- |
| `scaffold run` | Read/Write | Read (methodology check) | Write (append) | Read/Write | Read (completion detection) |
| `scaffold status` | Read | Read | -- | -- | Read (artifact check) |
| `scaffold next` | Read | -- | -- | -- | -- |
| `scaffold skip` | Read/Write | -- | -- | Read/Write | -- |
| `scaffold reset` | Delete | Preserve | Delete | Delete | Preserve |
| `scaffold validate` | Read | Read | Read | -- | Read (existence check) |
| `scaffold dashboard` | Read | Read | -- | -- | -- |
