# Scaffold v2 — JSON Output Schemas

**Phase**: 5 — API Contract Specification
**Depends on**: [CLI Contract](cli-contract.md), [Architecture Section 7](../architecture/system-architecture.md)
**Informed by**: Phase 4 data schemas ([state](../data/state-json-schema.md), [config](../data/config-yml-schema.md), [decisions](../data/decisions-jsonl-schema.md)) — output schemas are self-contained for API consumers but structurally aligned with internal file schemas
**Last updated**: 2026-03-14
**Status**: draft

---

## Table of Contents

1. [Envelope Structure](#1-envelope-structure)
2. [Per-Command Data Schemas](#2-per-command-data-schemas)
   - 2.1 [scaffold init](#21-scaffold-init)
   - 2.2 [scaffold build](#22-scaffold-build)
   - 2.3 [scaffold adopt](#23-scaffold-adopt)
   - 2.4 [scaffold run](#24-scaffold-run)
   - 2.5 [scaffold skip](#25-scaffold-skip)
   - 2.6 [scaffold reset](#26-scaffold-reset)
   - 2.7 [scaffold status](#27-scaffold-status)
   - 2.8 [scaffold next](#28-scaffold-next)
   - 2.9 [scaffold validate](#29-scaffold-validate)
   - 2.10 [scaffold list](#210-scaffold-list)
   - 2.11 [scaffold info](#211-scaffold-info)
   - 2.12 [scaffold version](#212-scaffold-version)
   - 2.13 [scaffold update](#213-scaffold-update)
   - 2.14 [scaffold dashboard](#214-scaffold-dashboard)
   - 2.15 [scaffold decisions](#215-scaffold-decisions)
3. [Error Object Schema](#3-error-object-schema)
4. [Versioning and Stability](#4-versioning-and-stability)

---

## 1. Envelope Structure

Every command emits a single JSON object to stdout when invoked with `--format json`. The outer shape is always the same regardless of which command ran. Only the `data` field varies per command.

### 1.1 Example envelope

```json
{
  "success": true,
  "command": "run",
  "data": { ... },
  "errors": [],
  "warnings": [],
  "exit_code": 0,
  "verbose": null,
  "scaffold_version": "2.1.0"
}
```

Failure envelope:

```json
{
  "success": false,
  "command": "build",
  "data": null,
  "errors": [
    {
      "code": "CONFIG_INVALID_METHODOLOGY",
      "message": "Methodology 'clasic' not found. Did you mean 'classic'?",
      "file": ".scaffold/config.yml",
      "line": 3,
      "suggestion": "classic",
      "recovery": "Update the 'methodology' field to one of the installed methodologies."
    }
  ],
  "warnings": [],
  "exit_code": 1,
  "verbose": null,
  "scaffold_version": "2.1.0"
}
```

### 1.2 Envelope field definitions

| Field | Type | Always present | Description |
|-------|------|:--------------:|-------------|
| `success` | boolean | Yes | `true` if `exit_code` is 0. `false` otherwise. |
| `command` | string | Yes | The subcommand that was invoked (e.g., `"resume"`, `"build"`). |
| `data` | object \| null | Yes | Command-specific payload. `null` when `success` is `false` and the command could not produce partial data. Defined per command in Section 2. |
| `errors` | array | Yes | Structured error objects. Empty array on success. See Section 3. |
| `warnings` | array | Yes | Structured warning objects. Same shape as error objects. May be non-empty even on success. See Section 3. |
| `exit_code` | integer | Yes | The process exit code. One of `0`, `1`, `2`, `3`, `4`, `5`. See exit code table below. |
| `verbose` | array \| null | Yes | Verbose diagnostics when `--verbose` is passed. `null` when `--verbose` is not set. Each entry is an object with `level`, `component`, `message`, and optional `data`. Contents are informational and non-stable across versions. |
| `scaffold_version` | string | Yes | The scaffold CLI version that produced this output. |

**Exit code semantics** ([ADR-025](../adrs/ADR-025-cli-output-contract.md)):

| Code | Meaning | Triggered by |
|------|---------|-------------|
| `0` | Success | All commands on success (warnings do not affect exit code) |
| `1` | Validation error | Bad config, invalid frontmatter, missing required field, circular dependency in manifest |
| `2` | Missing dependency | Predecessor artifact not found; prerequisite prompt not completed |
| `3` | State / lock error | `state.json` unreadable or corrupt; `lock.json` held by another alive process |
| `4` | User cancellation | User pressed Ctrl+C or declined an interactive confirmation |
| `5` | Build/assembly error | Platform adapter failure, assembly engine error |

### 1.3 JSON Schema for the envelope

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold-cli.dev/schemas/envelope.json",
  "title": "ScaffoldJsonEnvelope",
  "description": "Standard JSON output envelope emitted by every scaffold command in --format json mode.",
  "type": "object",
  "required": ["success", "command", "data", "errors", "warnings", "exit_code", "verbose", "scaffold_version"],
  "additionalProperties": true,
  "properties": {
    "success": {
      "type": "boolean",
      "description": "True if exit_code is 0."
    },
    "command": {
      "type": "string",
      "minLength": 1,
      "description": "The subcommand name that produced this output."
    },
    "data": {
      "oneOf": [
        { "type": "object" },
        { "type": "null" }
      ],
      "description": "Command-specific data payload. null on hard failures where no partial data is available."
    },
    "errors": {
      "type": "array",
      "items": { "$ref": "#/$defs/ScaffoldError" }
    },
    "warnings": {
      "type": "array",
      "items": { "$ref": "#/$defs/ScaffoldWarning" }
    },
    "exit_code": {
      "type": "integer",
      "enum": [0, 1, 2, 3, 4, 5]
    },
    "verbose": {
      "oneOf": [
        {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "level": { "type": "string" },
              "component": { "type": "string" },
              "message": { "type": "string" },
              "data": { "type": "object" }
            },
            "required": ["level", "component", "message"]
          }
        },
        { "type": "null" }
      ],
      "description": "Verbose diagnostics. Present when --verbose is passed; null otherwise. Structure is non-stable."
    },
    "scaffold_version": {
      "type": "string",
      "description": "The scaffold CLI version that produced this output."
    }
  },
  "$defs": {
    "ScaffoldError": { "$ref": "error-object.json" },
    "ScaffoldWarning": { "$ref": "warning-object.json" }
  }
}
```

**Note on forward compatibility**: Per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md), consumers must ignore unknown top-level fields for forward compatibility.

**Note on stdout/stderr in JSON mode**: In `--format json` mode, only the JSON envelope is written to stdout. All human-readable progress messages, spinner output, and info text go to stderr. This ensures that `scaffold build --format json | jq .data` works correctly without stderr noise polluting the stream. See [ADR-025](../adrs/ADR-025-cli-output-contract.md) for the full output contract.

---

## 2. Per-Command Data Schemas

This section defines the `data` field for every command. Each command's `data` has a stable, documented shape. Consumers that encounter unknown fields within `data` must ignore them per forward-compatibility rules ([ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md)).

Commands are grouped by their category ([domain 09](../domain-models/09-cli-architecture.md) Section 3):

- **Init & Build**: `init`, `build`, `adopt`
- **Runtime — pipeline execution**: `run`, `skip`, `reset`
- **Runtime — pipeline inspection**: `status`, `next`, `validate`
- **Configuration**: `list`, `info`
- **Utility**: `version`, `update`, `dashboard`

---

### 2.1 scaffold init

**Signature**: `scaffold init [idea]`
**Requires project**: No (creates the project)
**Requires state**: No

`scaffold init` runs the Init Wizard ([domain 14](../domain-models/14-init-wizard.md)), which detects the project mode (greenfield / brownfield / v1-migration), presents interactive questions, writes `.scaffold/config.yml`, initializes `state.json` and `decisions.jsonl`, then automatically runs `scaffold build` ([architecture Section 4c](../architecture/system-architecture.md)).

**Example `data`**:

```json
{
  "mode": "greenfield",
  "methodology": "deep",
  "config_path": ".scaffold/config.yml",
  "platforms": ["claude-code"],
  "project_traits": ["web", "frontend"],
  "steps_resolved": 24,
  "build_result": {
    "methodology": "deep",
    "steps_total": 24,
    "steps_excluded": 2,
    "platforms": {
      "claude-code": { "files_written": 24, "output_dir": "commands/" }
    }
  }
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/init.json",
  "title": "InitData",
  "type": "object",
  "required": ["mode", "methodology", "config_path", "platforms", "steps_resolved", "build_result"],
  "additionalProperties": true,
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["greenfield", "brownfield", "v1-migration"],
      "description": "How the project was detected and initialized. See domain 07 and ADR-028."
    },
    "methodology": {
      "type": "string",
      "description": "The methodology selected during the wizard (e.g., 'deep', 'mvp', 'custom')."
    },
    "config_path": {
      "type": "string",
      "description": "Relative path to the written config file. Always '.scaffold/config.yml'."
    },
    "platforms": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Platform adapters activated (from config.yml platforms list)."
    },
    "project_traits": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Derived project traits (e.g., 'web', 'frontend', 'mobile') used for optional step filtering."
    },
    "steps_resolved": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of steps in the resolved pipeline after exclusions."
    },
    "build_result": {
      "$ref": "build.json",
      "description": "Results from the automatic scaffold build that runs after wizard completion."
    }
  }
}
```

**Error codes** specific to `init`:

| Code | Exit | Description |
|------|------|-------------|
| `INIT_SCAFFOLD_EXISTS` | 1 | `.scaffold/config.yml` already exists and `--force` was not supplied |
| `USER_CANCELLED` | 4 | User declined the final confirmation or pressed Ctrl+C |

---

### 2.2 scaffold build

**Signature**: `scaffold build`
**Requires project**: Yes
**Requires state**: No

`scaffold build` generates thin command wrappers for platforms from the meta-prompt inventory. Each wrapper invokes `scaffold run <step>` — no prompt content resolution occurs at build time.

**Example `data`**:

```json
{
  "methodology": "deep",
  "steps_total": 24,
  "steps_excluded": 2,
  "excluded_step_names": ["add-maestro", "add-detox"],
  "platforms": {
    "claude-code": {
      "files_written": 24,
      "output_dir": "commands/"
    },
    "codex": {
      "files_written": 1,
      "output_dir": "."
    }
  },
  "dependency_graph": {
    "nodes": 22,
    "edges": 31,
    "has_cycles": false
  },
  "steps_added": [],
  "steps_removed": [],
  "build_duration_ms": 142
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/build.json",
  "title": "BuildData",
  "type": "object",
  "required": ["methodology", "steps_total", "steps_excluded", "platforms"],
  "additionalProperties": true,
  "properties": {
    "methodology": {
      "type": "string",
      "description": "The methodology used for this build (e.g., 'deep', 'mvp')."
    },
    "steps_total": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of steps included in the resolved pipeline (after excluding optionals with unmet conditions)."
    },
    "steps_excluded": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of optional steps excluded because their 'requires' trait condition was not met."
    },
    "excluded_step_names": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Slugs of steps that were excluded from the build (due to unmet trait conditions)."
    },
    "platforms": {
      "type": "object",
      "description": "Per-adapter build results. claude-code and codex appear only if configured.",
      "additionalProperties": {
        "type": "object",
        "required": ["files_written", "output_dir"],
        "additionalProperties": true,
        "properties": {
          "files_written": {
            "type": "integer",
            "minimum": 0,
            "description": "Number of wrapper files written by this adapter."
          },
          "output_dir": {
            "type": "string",
            "description": "Directory path (relative to project root) where this adapter wrote its output."
          }
        }
      }
    },
    "dependency_graph": {
      "type": "object",
      "required": ["nodes", "edges", "has_cycles"],
      "additionalProperties": true,
      "properties": {
        "nodes": { "type": "integer", "minimum": 0, "description": "Number of steps in the dependency graph." },
        "edges": { "type": "integer", "minimum": 0, "description": "Number of dependency edges in the graph." },
        "has_cycles": { "type": "boolean", "description": "Whether the dependency graph contains cycles." }
      },
      "description": "Summary statistics for the resolved dependency graph."
    },
    "steps_added": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Step slugs that appear in the new build but were absent in the previous build. Empty on first build."
    },
    "steps_removed": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Step slugs that were in the previous build but are absent from the new one. Empty on first build."
    },
    "build_duration_ms": {
      "type": "integer",
      "minimum": 0,
      "description": "Wall-clock time for the build in milliseconds."
    }
  }
}
```

---

### 2.3 scaffold adopt

**Signature**: `scaffold adopt`
**Requires project**: No (creates the `.scaffold/` directory)
**Requires state**: No

`scaffold adopt` scans an existing codebase, maps discovered artifacts to scaffold prompts via their `produces` fields, writes `.scaffold/config.yml` and `state.json` with pre-completed entries for matched prompts, and runs `scaffold build`. See [domain 07](../domain-models/07-brownfield-adopt.md) for the scanning algorithm.

**Example `data`**:

```json
{
  "mode": "brownfield",
  "artifacts_found": 5,
  "detected_artifacts": [
    { "file": "docs/plan.md", "mapped_to_prompt": "create-prd" },
    { "file": "docs/tech-stack.md", "mapped_to_prompt": "tech-stack" },
    { "file": "docs/coding-standards.md", "mapped_to_prompt": "coding-standards" },
    { "file": "docs/project-structure.md", "mapped_to_prompt": "project-structure" },
    { "file": "docs/git-workflow.md", "mapped_to_prompt": "git-workflow" }
  ],
  "prompts_completed": 5,
  "prompts_remaining": 19,
  "methodology": "classic",
  "config_path": ".scaffold/config.yml",
  "build_result": { ... }
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/adopt.json",
  "title": "AdoptData",
  "type": "object",
  "required": ["mode", "artifacts_found", "detected_artifacts", "prompts_completed", "prompts_remaining"],
  "additionalProperties": true,
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["brownfield", "v1-migration"],
      "description": "Detected project mode. adopt always results in brownfield or v1-migration — never greenfield."
    },
    "artifacts_found": {
      "type": "integer",
      "minimum": 0,
      "description": "Total number of existing files that matched a prompt's produces field."
    },
    "detected_artifacts": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["file", "mapped_to_prompt"],
        "additionalProperties": true,
        "properties": {
          "file": {
            "type": "string",
            "description": "Relative path of the existing file."
          },
          "mapped_to_prompt": {
            "type": "string",
            "description": "Slug of the prompt whose produces field matched this file."
          },
          "match_type": {
            "type": "string",
            "enum": ["exact", "fuzzy"],
            "description": "How the file matched: exact (same path) or fuzzy (same filename, different directory)."
          },
          "schema_valid": {
            "type": "boolean",
            "description": "Whether the artifact passes the prompt's artifact-schema validation. Partial matches (present but invalid) are pre-completed with a warning."
          }
        }
      }
    },
    "prompts_completed": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of prompts marked as completed in state.json because their artifacts were found."
    },
    "prompts_remaining": {
      "type": "integer",
      "minimum": 0,
      "description": "Number of prompts left as pending (artifacts not found)."
    },
    "methodology": {
      "type": "string",
      "description": "Methodology selected during adopt (from inferred signals or --auto default)."
    },
    "config_path": {
      "type": "string",
      "description": "Relative path to the written config file."
    },
    "build_result": {
      "$ref": "build.json",
      "description": "Results from the automatic scaffold build after adopt completes."
    }
  }
}
```

---

### 2.4 scaffold run

**Signature**: `scaffold run <step> [--instructions "..."] [--force]`
**Requires project**: Yes
**Requires state**: Yes (creates if absent)

`scaffold run` is the primary command. It assembles and executes a pipeline step using the assembly engine (PRD Section 9). The `data` field encodes the step execution context including methodology, depth, outputs produced, and next eligible steps.

**Example `data`**:

```json
{
  "step": "tech-stack",
  "methodology": "deep",
  "depth": "comprehensive",
  "pipeline_progress": {
    "completed": 3,
    "skipped": 0,
    "pending": 19,
    "in_progress": null,
    "total": 22
  },
  "outputs_produced": ["docs/tech-stack.md"],
  "next_eligible": ["coding-standards", "project-structure"],
  "instructions_loaded": ["global.md", "tech-stack.md", "inline"],
  "auto_decisions": []
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/run.json",
  "title": "RunData",
  "type": "object",
  "required": ["step", "methodology", "depth", "pipeline_progress", "outputs_produced", "next_eligible"],
  "additionalProperties": true,
  "properties": {
    "step": {
      "type": "string",
      "description": "Slug of the step that was executed."
    },
    "methodology": {
      "type": "string",
      "description": "The methodology used for assembly (e.g., 'deep', 'mvp')."
    },
    "depth": {
      "type": "string",
      "description": "The depth level used for this step's execution (e.g., 'comprehensive', 'standard', 'minimal')."
    },
    "pipeline_progress": {
      "type": "object",
      "required": ["completed", "skipped", "pending", "in_progress", "total"],
      "additionalProperties": true,
      "properties": {
        "completed": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of steps with status 'completed' (after this step completes)."
        },
        "skipped": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of steps with status 'skipped'."
        },
        "pending": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of steps with status 'pending'."
        },
        "in_progress": {
          "oneOf": [{ "type": "string" }, { "type": "null" }],
          "description": "Slug of the currently in-progress step, or null after completion."
        },
        "total": {
          "type": "integer",
          "minimum": 1,
          "description": "Total number of steps in the resolved pipeline."
        }
      }
    },
    "outputs_produced": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Relative paths of artifacts produced by this step."
    },
    "next_eligible": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Step slugs that are now eligible to run after this step's completion."
    },
    "instructions_loaded": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Instruction layers that were loaded for assembly (e.g., 'global.md', 'tech-stack.md', 'inline')."
    },
    "auto_decisions": {
      "type": "array",
      "description": "In JSON mode, questions that would be interactive are auto-resolved.",
      "items": {
        "type": "object",
        "required": ["question", "answer", "reason"],
        "additionalProperties": true,
        "properties": {
          "question": { "type": "string" },
          "answer": { "type": "string" },
          "reason": { "type": "string", "description": "Why this answer was chosen (e.g., 'default')." }
        }
      }
    }
  }
}
```

---

### 2.5 scaffold skip

**Signature**: `scaffold skip <prompt> [--reason <text>]`
**Requires project**: Yes
**Requires state**: Yes

`scaffold skip` marks a prompt as `skipped` in `state.json`. Skipped prompts are treated as satisfied for dependency purposes, unblocking their dependents. See [ADR-020](../adrs/ADR-020-skip-vs-exclude-semantics.md).

**Example `data`**:

```json
{
  "prompt": "add-playwright",
  "reason": "Using Vitest browser mode instead",
  "previous_status": "pending",
  "newly_eligible": ["user-stories"]
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/skip.json",
  "title": "SkipData",
  "type": "object",
  "required": ["prompt", "reason", "newly_eligible"],
  "additionalProperties": true,
  "properties": {
    "prompt": {
      "type": "string",
      "description": "Slug of the prompt that was skipped."
    },
    "reason": {
      "type": "string",
      "description": "Human-readable reason for skipping, from --reason flag or empty string if not provided."
    },
    "previous_status": {
      "type": "string",
      "enum": ["pending", "completed"],
      "description": "Status of the prompt before it was skipped."
    },
    "newly_eligible": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Prompt slugs that are now eligible to run because the skipped prompt unblocked them."
    }
  }
}
```

**Error codes** specific to `skip`:

| Code | Exit | Description |
|------|------|-------------|
| `DEP_TARGET_MISSING` | 2 | The specified prompt slug is not in the resolved pipeline |
| `PSM_INVALID_TRANSITION` | 3 | The prompt is already completed and cannot be skipped; use `scaffold run <step>` to re-run |

---

### 2.6 scaffold reset

**Signature**: `scaffold reset [--confirm-reset]`
**Requires project**: Yes
**Requires state**: No (reset targets state)

`scaffold reset` deletes `state.json` and `decisions.jsonl`. Config, build outputs, and produced artifacts are preserved. The `--confirm-reset` flag is required for non-interactive operation ([ADR-036](../adrs/ADR-036-auto-does-not-imply-force.md)).

**Example `data`**:

```json
{
  "files_deleted": [
    ".scaffold/state.json",
    ".scaffold/decisions.jsonl"
  ],
  "files_preserved": [
    ".scaffold/config.yml",
    "commands/",
    "prompts/",
    "CLAUDE.md"
  ]
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/reset.json",
  "title": "ResetData",
  "type": "object",
  "required": ["files_deleted", "files_preserved"],
  "additionalProperties": true,
  "properties": {
    "files_deleted": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Relative paths of files that were deleted. Always includes state.json and decisions.jsonl when they existed."
    },
    "files_preserved": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Relative paths of notable files/directories that were preserved (config, build outputs, CLAUDE.md)."
    }
  }
}
```

---

### 2.7 scaffold status

**Signature**: `scaffold status`
**Requires project**: Yes
**Requires state**: Yes

`scaffold status` reads `state.json` and the methodology manifest to display pipeline progress grouped by phase.

**Example `data`**:

```json
{
  "methodology": "classic",
  "progress": {
    "completed": 6,
    "skipped": 1,
    "in_progress": 0,
    "pending": 17,
    "total": 24
  },
  "phases": [
    {
      "name": "Foundation",
      "index": 1,
      "prompts": [
        {
          "slug": "create-prd",
          "status": "completed",
          "source": "base",
          "at": "2026-03-10T14:00:00.000Z",
          "completed_by": "ken"
        },
        {
          "slug": "tech-stack",
          "status": "completed",
          "source": "override",
          "at": "2026-03-10T16:30:00.000Z",
          "completed_by": "ken"
        }
      ]
    },
    {
      "name": "Standards",
      "index": 2,
      "prompts": [
        {
          "slug": "coding-standards",
          "status": "completed",
          "source": "base",
          "at": "2026-03-12T18:42:00.000Z",
          "completed_by": "ken"
        },
        {
          "slug": "add-playwright",
          "status": "skipped",
          "source": "base",
          "at": "2026-03-12T19:00:00.000Z",
          "reason": "Using Vitest browser mode instead"
        }
      ]
    }
  ],
  "next_eligible": ["git-workflow", "dev-env-setup"],
  "orphaned_entries": []
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/status.json",
  "title": "StatusData",
  "type": "object",
  "required": ["methodology", "progress", "phases", "next_eligible"],
  "additionalProperties": true,
  "properties": {
    "methodology": {
      "type": "string",
      "description": "Active methodology name from state.json."
    },
    "progress": {
      "type": "object",
      "required": ["completed", "skipped", "in_progress", "pending", "total"],
      "additionalProperties": true,
      "properties": {
        "completed": { "type": "integer", "minimum": 0 },
        "skipped": { "type": "integer", "minimum": 0 },
        "in_progress": { "type": "integer", "minimum": 0, "description": "Number of prompts currently in progress." },
        "pending": { "type": "integer", "minimum": 0 },
        "total": { "type": "integer", "minimum": 1 }
      }
    },
    "phases": {
      "type": "array",
      "description": "Prompts grouped by pipeline phase in phase order.",
      "items": {
        "type": "object",
        "required": ["name", "index", "prompts"],
        "additionalProperties": true,
        "properties": {
          "name": { "type": "string", "description": "Phase display name from the methodology manifest." },
          "index": { "type": "integer", "minimum": 0, "description": "Phase number (0-based). Phase 0 is 'Prerequisites'." },
          "prompts": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["slug", "status", "source"],
              "additionalProperties": true,
              "properties": {
                "slug": { "type": "string" },
                "status": { "type": "string", "enum": ["completed", "skipped", "pending", "in_progress"] },
                "source": { "type": "string", "enum": ["base", "override", "ext", "project-custom", "user-custom", "extra"] },
                "at": { "type": "string", "format": "date-time" },
                "completed_by": { "type": "string" },
                "reason": { "type": "string", "description": "Skip reason. Only present when status is 'skipped'." },
                "blocked_by": {
                  "type": "array",
                  "items": { "type": "string" },
                  "description": "Slugs of prerequisite prompts that are not yet completed or skipped. Only present when status is 'pending' and the prompt has unmet dependencies."
                }
              }
            }
          }
        }
      }
    },
    "next_eligible": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Prompt slugs currently eligible to run."
    },
    "orphaned_entries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["slug", "status", "at"],
        "additionalProperties": true,
        "properties": {
          "slug": { "type": "string", "description": "Prompt slug present in state.json but absent from the current resolved pipeline." },
          "status": { "type": "string", "description": "The status of the orphaned entry in state.json (e.g., 'completed', 'skipped')." },
          "at": { "type": "string", "format": "date-time", "description": "Timestamp when the entry was last updated in state.json." },
          "completed_by": { "type": "string", "description": "Identity of the user/agent who completed the prompt, if applicable." }
        }
      },
      "description": "State entries for prompts present in state.json but absent from the current resolved pipeline (e.g., after a methodology change). See architecture Section 5b."
    }
  }
}
```

---

### 2.8 scaffold next

**Signature**: `scaffold next`
**Requires project**: Yes
**Requires state**: Yes

`scaffold next` reports eligible prompts without executing any of them. It reads frontmatter for each eligible prompt to provide rich context.

**Example `data`**:

```json
{
  "eligible": [
    {
      "slug": "git-workflow",
      "description": "Configure Git branching strategy, PR templates, and merge conventions.",
      "phase": 2,
      "phase_name": "Standards",
      "produces": ["docs/git-workflow.md"],
      "reads": ["docs/tech-stack.md"],
      "depends_on": ["coding-standards"],
      "source": "base",
      "argument_hint": null
    },
    {
      "slug": "dev-env-setup",
      "description": "Create development environment setup guide and onboarding script.",
      "phase": 2,
      "phase_name": "Standards",
      "produces": ["docs/dev-setup.md"],
      "reads": ["docs/tech-stack.md", "docs/project-structure.md"],
      "depends_on": ["project-structure"],
      "source": "base",
      "argument_hint": null
    }
  ],
  "pipeline_complete": false
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/next.json",
  "title": "NextData",
  "type": "object",
  "required": ["eligible", "pipeline_complete"],
  "additionalProperties": true,
  "properties": {
    "pipeline_complete": {
      "type": "boolean",
      "description": "Whether the entire pipeline is complete with no more eligible prompts."
    },
    "blocked_prompts": {
      "type": "array",
      "description": "Prompts that are pending but blocked by unmet dependencies. Useful for diagnosing the 'all blocked' case where eligible is empty but pipeline_complete is false.",
      "items": {
        "type": "object",
        "required": ["slug", "blocked_by"],
        "additionalProperties": true,
        "properties": {
          "slug": { "type": "string", "description": "Prompt identifier." },
          "blocked_by": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Slugs of prerequisite prompts that are not yet completed or skipped."
          }
        }
      }
    },
    "eligible": {
      "type": "array",
      "description": "All currently eligible prompts with their frontmatter metadata.",
      "items": {
        "type": "object",
        "required": ["slug", "description", "phase", "produces", "reads", "depends_on", "source"],
        "additionalProperties": true,
        "properties": {
          "slug": { "type": "string", "description": "Prompt identifier." },
          "description": { "type": "string", "description": "Short human-readable description from frontmatter." },
          "phase": { "type": "integer", "minimum": 0, "description": "Phase number for display grouping." },
          "phase_name": { "type": "string", "description": "Phase display name from the methodology manifest (e.g., 'Foundation', 'Standards')." },
          "produces": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Artifact file paths this prompt creates (relative to project root)."
          },
          "reads": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Files this prompt reads as context (resolved from frontmatter 'reads' field — full-file paths only, sections extracted to strings)."
          },
          "depends_on": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Prerequisite prompt slugs (union of manifest and frontmatter dependencies)."
          },
          "source": {
            "type": "string",
            "enum": ["base", "override", "ext", "project-custom", "user-custom", "extra"],
            "description": "Where this prompt was resolved from in the three-layer resolution chain."
          },
          "argument_hint": {
            "oneOf": [{ "type": "string" }, { "type": "null" }],
            "description": "Optional argument hint from frontmatter (e.g., '<tech constraints or preferences>')."
          }
        }
      }
    }
  }
}
```

**Error codes** specific to `next`:

`scaffold next` returns exit code 0 even when no prompts are eligible — the `data.eligible` array is simply empty and `data.pipeline_complete` is `true`. This is not an error condition; it indicates the pipeline is finished or all remaining prompts are blocked.

---

### 2.9 scaffold validate

**Signature**: `scaffold validate [--fix]`
**Requires project**: Yes
**Requires state**: No

`scaffold validate` runs the full validation pipeline ([domain 09](../domain-models/09-cli-architecture.md) algorithm 5) in read-only mode, accumulating all issues without short-circuiting. See [ADR-040](../adrs/ADR-040-error-handling-philosophy.md).

**Example `data`**:

```json
{
  "valid": false,
  "checks": [
    {
      "category": "config",
      "name": "Config schema validation",
      "status": "pass",
      "message": null,
      "details": {}
    },
    {
      "category": "manifest",
      "name": "Methodology manifest — dependency cycle check",
      "status": "pass",
      "message": null,
      "details": {}
    },
    {
      "category": "artifacts",
      "name": "Artifact schema — docs/plan.md",
      "status": "fail",
      "message": "Artifact 'docs/plan.md' is missing required section 'Acceptance Criteria'.",
      "details": {
        "file": "docs/plan.md",
        "missing_sections": ["Acceptance Criteria"],
        "error_code": "VALIDATE_ARTIFACT_MISSING_SECTION"
      }
    },
    {
      "category": "state",
      "name": "Orphaned state entries",
      "status": "warn",
      "message": "2 state entries reference prompts not in the current resolved pipeline.",
      "details": {
        "orphaned_slugs": ["old-setup", "deprecated-review"]
      }
    }
  ],
  "summary": {
    "passed": 18,
    "failed": 1,
    "warnings": 1
  }
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/validate.json",
  "title": "ValidateData",
  "type": "object",
  "required": ["valid", "checks", "summary"],
  "additionalProperties": true,
  "properties": {
    "valid": {
      "type": "boolean",
      "description": "True if no checks have status 'fail'. Warnings do not affect validity."
    },
    "checks": {
      "type": "array",
      "description": "All validation checks run, in execution order.",
      "items": {
        "type": "object",
        "required": ["category", "name", "status"],
        "additionalProperties": true,
        "properties": {
          "category": {
            "type": "string",
            "enum": ["config", "manifest", "prompts", "artifacts", "state", "decisions"],
            "description": "Which validation phase produced this check."
          },
          "name": {
            "type": "string",
            "description": "Human-readable name of the check."
          },
          "status": {
            "type": "string",
            "enum": ["pass", "fail", "warn"],
            "description": "'pass' = no issue. 'fail' = error that makes the project invalid. 'warn' = advisory issue."
          },
          "message": {
            "oneOf": [{ "type": "string" }, { "type": "null" }],
            "description": "Human-readable description of the issue. Null on pass."
          },
          "details": {
            "type": "object",
            "additionalProperties": true,
            "description": "Structured details about the check (file path, error code, missing fields, etc.)."
          }
        }
      }
    },
    "summary": {
      "type": "object",
      "required": ["passed", "failed", "warnings"],
      "additionalProperties": true,
      "properties": {
        "passed": { "type": "integer", "minimum": 0 },
        "failed": { "type": "integer", "minimum": 0 },
        "warnings": { "type": "integer", "minimum": 0 }
      }
    },
    "scopes_active": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Validation scopes that were active for this run (e.g., 'config', 'manifest', 'prompts', 'artifacts', 'state', 'decisions')."
    },
    "fixes_applied": {
      "type": "array",
      "description": "Auto-fixes applied when --fix was passed. Empty when --fix was not used or no fixes were needed.",
      "items": {
        "type": "object",
        "required": ["description", "detail"],
        "additionalProperties": true,
        "properties": {
          "description": { "type": "string", "description": "Short summary of the fix applied." },
          "detail": { "type": "string", "description": "Detailed explanation of what was changed." }
        }
      }
    }
  }
}
```

---

### 2.10 scaffold list

**Signature**: `scaffold list [--verbose]`
**Requires project**: No
**Requires state**: No

`scaffold list` enumerates all installed methodologies and platform adapters.

**Example `data`**:

```json
{
  "methodologies": [
    {
      "name": "deep",
      "display_name": "Scaffold Deep",
      "description": "Full pipeline with comprehensive documentation and parallel agents.",
      "step_count": 24,
      "installed": true
    },
    {
      "name": "mvp",
      "display_name": "Scaffold MVP",
      "description": "Streamlined pipeline with fewer phases and lighter process.",
      "step_count": 12,
      "installed": true
    }
  ],
  "platforms": [
    { "name": "claude-code", "description": "Generates commands/*.md that invoke scaffold run" },
    { "name": "codex", "description": "Generates AGENTS.md entries pointing to scaffold run" },
    { "name": "universal", "description": "scaffold run outputs assembled prompt to stdout" }
  ]
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/list.json",
  "title": "ListData",
  "type": "object",
  "required": ["methodologies", "platforms"],
  "additionalProperties": true,
  "properties": {
    "methodologies": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "description", "step_count", "installed"],
        "additionalProperties": true,
        "properties": {
          "name": { "type": "string", "description": "Kebab-case methodology identifier." },
          "display_name": { "type": "string", "description": "Human-readable name from manifest.yml." },
          "description": { "type": "string", "description": "Short description from manifest.yml." },
          "step_count": { "type": "integer", "minimum": 0, "description": "Number of steps in the full pipeline (before optional exclusions)." },
          "installed": { "type": "boolean", "description": "Whether the methodology is available in this installation." }
        }
      }
    },
    "platforms": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "description"],
        "additionalProperties": true,
        "properties": {
          "name": { "type": "string", "description": "Platform adapter identifier (e.g., 'claude-code', 'codex', 'universal')." },
          "description": { "type": "string", "description": "Short description of the platform adapter's delivery format." }
        }
      },
      "description": "Registered platform adapters with their metadata."
    }
  }
}
```

---

### 2.11 scaffold info

**Signature**: `scaffold info [step]`
**Requires project**: Yes
**Requires state**: No

`scaffold info` shows the current project configuration, or when a step slug is provided, shows step details (meta-prompt, knowledge base refs, depth level).

**Example `data`** (project info — no step argument):

```json
{
  "methodology": "deep",
  "platforms": ["claude-code"],
  "project_traits": ["web", "frontend"],
  "step_count": 22,
  "config_path": ".scaffold/config.yml",
  "project_root": "/Users/ken/projects/acme-web",
  "progress": {
    "completed": 6,
    "skipped": 1,
    "pending": 15,
    "total": 22
  }
}
```

**Example `data`** (step info — with step argument):

```json
{
  "step": "tech-stack",
  "description": "Define the technology stack",
  "methodology": "deep",
  "depth": "comprehensive",
  "produces": ["docs/tech-stack.md"],
  "reads": ["docs/plan.md"],
  "depends_on": ["create-prd"],
  "knowledge_base": ["knowledge/tech-evaluation.md", "knowledge/stack-patterns.md"],
  "status": "completed",
  "instructions_loaded": ["global.md", "tech-stack.md"]
}
```

**JSON Schema** (project info):

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/info.json",
  "title": "InfoData",
  "type": "object",
  "required": ["methodology", "platforms", "step_count"],
  "additionalProperties": true,
  "properties": {
    "methodology": { "type": "string" },
    "platforms": {
      "type": "array",
      "items": { "type": "string" }
    },
    "project_traits": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Derived traits used for optional step filtering."
    },
    "step_count": {
      "type": "integer",
      "minimum": 0,
      "description": "Total steps in the resolved pipeline."
    },
    "last_build_at": {
      "oneOf": [
        { "type": "string", "format": "date-time" },
        { "type": "null" }
      ],
      "description": "ISO 8601 timestamp of the most recent scaffold build. Null if no build has been run."
    },
    "config_path": { "type": "string" },
    "project_root": { "type": "string", "description": "Absolute path to the project root." },
    "progress": {
      "oneOf": [
        {
          "type": "object",
          "required": ["completed", "skipped", "pending", "total"],
          "additionalProperties": true,
          "properties": {
            "completed": { "type": "integer", "minimum": 0 },
            "skipped": { "type": "integer", "minimum": 0 },
            "pending": { "type": "integer", "minimum": 0 },
            "total": { "type": "integer", "minimum": 1 }
          }
        },
        { "type": "null" }
      ],
      "description": "Pipeline progress summary when state.json exists. Null if state has not been initialized."
    }
  }
}
```

**JSON Schema** (step info):

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/info-step.json",
  "title": "InfoStepData",
  "type": "object",
  "required": ["step", "description", "methodology", "depth", "produces", "depends_on", "knowledge_base"],
  "additionalProperties": true,
  "properties": {
    "step": { "type": "string", "description": "Step slug." },
    "description": { "type": "string", "description": "Step description from meta-prompt." },
    "methodology": { "type": "string", "description": "Active methodology." },
    "depth": { "type": "string", "description": "Depth level for this step." },
    "produces": { "type": "array", "items": { "type": "string" }, "description": "Output artifact paths." },
    "reads": { "type": "array", "items": { "type": "string" }, "description": "Input artifact paths." },
    "depends_on": { "type": "array", "items": { "type": "string" }, "description": "Prerequisite step slugs." },
    "knowledge_base": { "type": "array", "items": { "type": "string" }, "description": "Knowledge base file paths referenced by the meta-prompt." },
    "status": { "type": "string", "enum": ["completed", "skipped", "pending", "in_progress"], "description": "Current status from state.json." },
    "instructions_loaded": { "type": "array", "items": { "type": "string" }, "description": "Instruction layers available for this step." }
  }
}
```

---

### 2.12 scaffold version

**Signature**: `scaffold version`
**Requires project**: No
**Requires state**: No

**Example `data`**:

```json
{
  "version": "2.1.0",
  "node_version": "v22.3.0",
  "platform": "darwin-arm64",
  "latest_version": "2.2.0",
  "update_available": true
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/version.json",
  "title": "VersionData",
  "type": "object",
  "required": ["version", "node_version", "platform"],
  "additionalProperties": true,
  "properties": {
    "version": { "type": "string", "description": "Installed scaffold CLI version (semver)." },
    "node_version": { "type": "string", "description": "Node.js runtime version (e.g., 'v22.3.0')." },
    "platform": { "type": "string", "description": "OS and architecture (e.g., 'darwin-arm64', 'linux-x64')." },
    "latest_version": {
      "oneOf": [{ "type": "string" }, { "type": "null" }],
      "description": "Latest published version if the registry was reachable; null if the check failed."
    },
    "update_available": {
      "oneOf": [{ "type": "boolean" }, { "type": "null" }],
      "description": "True if latest_version > version. Null if latest_version could not be fetched."
    }
  }
}
```

---

### 2.13 scaffold update

**Signature**: `scaffold update [--check-only]`
**Requires project**: No
**Requires state**: No

**Example `data`** — update applied:

```json
{
  "current_version": "2.1.0",
  "latest_version": "2.2.0",
  "updated": true,
  "changelog": "## v2.2.0\n- Add scaffold preview command\n- Fix crash recovery in --auto mode",
  "rebuild_result": null
}
```

**Example `data`** — already up to date:

```json
{
  "current_version": "2.2.0",
  "latest_version": "2.2.0",
  "updated": false,
  "changelog": null,
  "rebuild_result": null
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/update.json",
  "title": "UpdateData",
  "type": "object",
  "required": ["current_version", "latest_version", "updated"],
  "additionalProperties": true,
  "properties": {
    "current_version": { "type": "string", "description": "Version before the update." },
    "latest_version": { "type": "string", "description": "Latest published version." },
    "updated": { "type": "boolean", "description": "Whether the CLI was updated to a new version." },
    "changelog": {
      "oneOf": [{ "type": "string" }, { "type": "null" }],
      "description": "Release notes for the installed version. Null if not updated or unavailable."
    },
    "rebuild_result": {
      "oneOf": [
        { "$ref": "build.json" },
        { "type": "null" }
      ],
      "description": "If a project root was detected after update and a rebuild was triggered, the build result. Null if no rebuild was performed."
    }
  }
}
```

---

### 2.14 scaffold dashboard

**Signature**: `scaffold dashboard [--no-open] [--json-only] [--output <file>]`
**Requires project**: Yes
**Requires state**: No

`scaffold dashboard` reads `state.json` and `config.yml` to generate a self-contained HTML progress dashboard. The `data` field includes the methodology, structured progress, per-phase prompt status, generation timestamp, and the output file path.

**Example `data`**:

```json
{
  "methodology": "classic",
  "progress": {
    "completed": 6,
    "skipped": 1,
    "pending": 17,
    "total": 24
  },
  "phases": [
    {
      "name": "Foundation",
      "index": 1,
      "prompts": [
        { "slug": "create-prd", "status": "completed", "description": "Create the product requirements document." },
        { "slug": "tech-stack", "status": "completed", "description": "Define the technology stack." }
      ]
    },
    {
      "name": "Standards",
      "index": 2,
      "prompts": [
        { "slug": "coding-standards", "status": "completed", "description": "Establish coding conventions." },
        { "slug": "git-workflow", "status": "pending", "description": "Configure Git branching strategy." }
      ]
    }
  ],
  "generated_at": "2026-03-13T10:30:00.000Z",
  "output_path": "/Users/ken/projects/acme-web/.scaffold/dashboard.html",
  "decisions": [
    { "prompt": "tech-stack", "timestamp": "2026-03-11T16:30:00.000Z", "decision": "Node.js 22 LTS with TypeScript 5.4; Fastify for HTTP." }
  ],
  "opened": true
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/dashboard.json",
  "title": "DashboardData",
  "type": "object",
  "required": ["methodology", "progress", "phases", "generated_at", "output_path"],
  "additionalProperties": true,
  "properties": {
    "methodology": {
      "type": "string",
      "description": "Active methodology name."
    },
    "progress": {
      "type": "object",
      "required": ["completed", "skipped", "pending", "total"],
      "additionalProperties": true,
      "properties": {
        "completed": { "type": "integer", "minimum": 0 },
        "skipped": { "type": "integer", "minimum": 0 },
        "pending": { "type": "integer", "minimum": 0 },
        "total": { "type": "integer", "minimum": 1 }
      }
    },
    "phases": {
      "type": "array",
      "description": "Prompts grouped by pipeline phase.",
      "items": {
        "type": "object",
        "required": ["name", "index", "prompts"],
        "additionalProperties": true,
        "properties": {
          "name": { "type": "string", "description": "Phase display name." },
          "index": { "type": "integer", "minimum": 0, "description": "Phase number (0-based). Phase 0 is 'Prerequisites'." },
          "prompts": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["slug", "status", "description"],
              "additionalProperties": true,
              "properties": {
                "slug": { "type": "string" },
                "status": { "type": "string", "enum": ["completed", "skipped", "pending", "in_progress"] },
                "description": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "generated_at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of when the dashboard was generated."
    },
    "output_path": {
      "type": "string",
      "description": "Path to the generated HTML file."
    },
    "decisions": {
      "type": "array",
      "description": "Recent decision entries included in the dashboard.",
      "items": {
        "type": "object",
        "required": ["prompt", "timestamp", "decision"],
        "additionalProperties": true,
        "properties": {
          "prompt": { "type": "string", "description": "Slug of the prompt that recorded this decision." },
          "timestamp": { "type": "string", "format": "date-time", "description": "When the decision was recorded." },
          "decision": { "type": "string", "description": "Decision text." }
        }
      }
    },
    "opened": {
      "type": "boolean",
      "description": "Whether the file was opened in the system browser. False when --no-open is passed."
    }
  }
}
```

---

### 2.15 scaffold decisions

**Signature**: `scaffold decisions [--prompt <slug>] [--last <n>] [--format json]`
**Requires project**: Yes
**Requires state**: Yes

`scaffold decisions` reads `.scaffold/decisions.jsonl` and returns the recorded project decisions, optionally filtered by prompt slug or limited to the most recent entries.

**Example `data`**:

```json
{
  "decisions": [
    {
      "id": "D-012",
      "prompt": "coding-standards",
      "timestamp": "2026-03-12T18:41:00.000Z",
      "decision": "Use Biome for linting and formatting; target ES2022.",
      "actor": "ken",
      "context": "Evaluated ESLint + Prettier vs Biome; chose Biome for performance."
    },
    {
      "id": "D-011",
      "prompt": "coding-standards",
      "timestamp": "2026-03-12T18:40:00.000Z",
      "decision": "Enforce 100-character line limit; no semicolons.",
      "actor": "ken"
    },
    {
      "id": "D-010",
      "prompt": "tech-stack",
      "timestamp": "2026-03-12T17:22:00.000Z",
      "decision": "Node.js 22 LTS with TypeScript 5.4; Fastify for HTTP.",
      "actor": "ken"
    }
  ],
  "total": 12
}
```

**JSON Schema**:

```json
{
  "$id": "https://scaffold-cli.dev/schemas/data/decisions.json",
  "title": "DecisionsData",
  "type": "object",
  "required": ["decisions", "total"],
  "additionalProperties": true,
  "properties": {
    "decisions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "pattern": "^D-\\d{3,}$", "description": "Decision ID (e.g., 'D-012')." },
          "prompt": { "type": "string" },
          "timestamp": { "type": "string", "format": "date-time" },
          "decision": { "type": "string" },
          "actor": { "type": "string" },
          "context": { "type": "string" }
        },
        "required": ["id", "prompt", "timestamp", "decision", "actor"]
      }
    },
    "total": {
      "type": "integer",
      "description": "Total number of decisions in the decisions log (before filtering)."
    }
  }
}
```

**Error codes** specific to `decisions`:

| Code | Exit | Description |
|------|------|-------------|
| `CONFIG_NOT_FOUND` | 1 | `.scaffold/config.yml` missing |
| `STATE_PARSE_ERROR` | 3 | `state.json` or `decisions.jsonl` unreadable or corrupt |
| `DEP_TARGET_MISSING` | 2 | `--prompt` slug not found in the resolved pipeline |

---

## 3. Error Object Schema

### 3.1 Error object fields

Every entry in the `errors` and `warnings` arrays conforms to the following schema:

```json
{
  "code": "MANIFEST_CIRCULAR_DEPENDENCY",
  "message": "Circular dependency detected: create-prd → tech-stack → create-prd",
  "file": "content/methodologies/classic/manifest.yml",
  "line": null,
  "suggestion": null,
  "recovery": "Check the 'dependencies' section in your methodology manifest and remove the cycle.",
  "details": {
    "cycle": ["create-prd", "tech-stack", "create-prd"]
  },
  "exit_code": 1
}
```

**Field definitions**:

| Field | Type | Always present | Description |
|-------|------|:--------------:|-------------|
| `code` | string | Yes | Machine-readable error code (see Section 3.3). Stable across versions. |
| `message` | string | Yes | Human-readable error message with context variables substituted. |
| `file` | string \| null | Yes | Relative path of the source file where the error originated. Null for errors not associated with a file. |
| `line` | integer \| null | Yes | Line number within `file`, 1-based. Null if line is not known or not applicable. |
| `suggestion` | string \| null | Yes | Fuzzy-match suggestion for typo correction (e.g., "Did you mean 'classic'?"). Null when no suggestion applies. Present when Levenshtein distance ≤ 2 between the invalid value and a valid option. |
| `recovery` | string | Yes | Actionable guidance on how to resolve the error. |
| `details` | object | Yes | Structured supplemental data specific to the error code. May be an empty object. Never null. See Section 3.2. |
| `exit_code` | integer | Yes | The exit code this error contributes to. One of 1, 2, 3, 4, 5. |

**Warning objects** share the same shape as error objects. A warning always has `exit_code: 0`.

### 3.2 JSON Schema for error and warning objects

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold-cli.dev/schemas/error-object.json",
  "title": "ScaffoldError",
  "type": "object",
  "required": ["code", "message", "file", "line", "suggestion", "recovery", "details", "exit_code"],
  "additionalProperties": true,
  "properties": {
    "code": {
      "type": "string",
      "minLength": 1,
      "description": "Machine-readable error code."
    },
    "message": {
      "type": "string",
      "description": "Human-readable message with variable substitution applied."
    },
    "file": {
      "oneOf": [{ "type": "string" }, { "type": "null" }]
    },
    "line": {
      "oneOf": [{ "type": "integer", "minimum": 1 }, { "type": "null" }]
    },
    "suggestion": {
      "oneOf": [{ "type": "string" }, { "type": "null" }]
    },
    "recovery": {
      "type": "string"
    },
    "details": {
      "type": "object",
      "additionalProperties": true
    },
    "exit_code": {
      "type": "integer",
      "enum": [0, 1, 2, 3, 4, 5]
    }
  }
}
```

### 3.3 Error code registry

The following tables map every error code to its expected `details` object shape. Codes without a `details` column produce an empty object `{}`.

**Init Wizard (domain 14) — exit code 1**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `INIT_SCAFFOLD_EXISTS` | `existing_config_path: string` | `.scaffold/config.yml` already exists |

**Config Loader (domain 06) — exit code 1**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `CONFIG_NOT_FOUND` | `searched_path: string` | `.scaffold/config.yml` not found |
| `CONFIG_PARSE_ERROR` | `parse_error: string` | YAML syntax error |
| `CONFIG_EMPTY` | — | File is empty |
| `CONFIG_NOT_OBJECT` | `actual_type: string` | Root YAML is not a mapping |
| `CONFIG_INVALID_VERSION` | `config_version: number, cli_max: number` | Config version exceeds CLI support |
| `CONFIG_INVALID_METHODOLOGY` | `value: string, valid_options: string[]` | Unknown methodology |
| `CONFIG_INVALID_MIXIN` | `axis: string, value: string, valid_options: string[]` | Unknown mixin value (legacy, preserved for backward compatibility) |
| `CONFIG_INVALID_PLATFORM` | `value: string, valid_options: string[]` | Unknown platform |
| `CONFIG_INVALID_TRAIT` | `value: string` | Unknown project trait |
| `CONFIG_MISSING_REQUIRED` | `field: string` | Required field absent |
| `CONFIG_EXTRA_PROMPT_NOT_FOUND` | `slug: string, searched_paths: string[]` | Extra-prompt file not found |
| `CONFIG_EXTRA_PROMPT_INVALID` | `slug: string, reason: string` | Extra-prompt frontmatter invalid |
| `CONFIG_EXTRA_SLUG_CONFLICT` | `slug: string` | Extra-prompt slug collides with built-in |
| `CONFIG_MIGRATE_FAILED` | `from_version: number, to_version: number, error: string` | Schema migration failed |
| `CONFIG_UNKNOWN_FIELD` | `field: string` | Unrecognized top-level field (warning) |

**Prompt Resolver (domain 01) — exit code 1**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `RESOLUTION_FILE_MISSING` | `slug: string, expected_paths: string[]` | Prompt file not found |
| `RESOLUTION_EXTRA_PROMPT_MISSING` | `slug: string` | Extra-prompt cannot be resolved |
| `RESOLUTION_DUPLICATE_SLUG` | `slug: string, files: string[]` | Slug collision across resolution layers |
| `RESOLUTION_MANIFEST_INVALID` | `reason: string` | Manifest is structurally invalid |
| `RESOLUTION_METHODOLOGY_NOT_FOUND` | `name: string` | Methodology directory missing |
| `RESOLUTION_FRONTMATTER_PARSE_ERROR` | `parse_error: string` | Frontmatter YAML invalid |
| `RESOLUTION_EXTRA_PROMPT_INVALID_FRONTMATTER` | `slug: string, reason: string` | Extra-prompt frontmatter malformed |
| `RESOLUTION_CUSTOM_OVERRIDE_ACTIVE` | `slug: string, override_path: string` | Custom override replacing built-in (warning) |
| `RESOLUTION_UNKNOWN_TRAIT` | `trait: string, prompt: string` | Prompt references an unknown project trait in its `requires` field (warning) |

**Dependency Resolver (domain 02)**:

| Code | Exit | `details` fields | Description |
|------|------|-----------------|-------------|
| `DEP_CYCLE_DETECTED` | 1 | `cycle: string[]` | Circular dependency in graph |
| `DEP_TARGET_MISSING` | 2 | `slug: string, missing_dep: string` | `depends-on` target not in pipeline |
| `DEP_SELF_REFERENCE` | 1 | `slug: string` | Prompt depends on itself |
| `DEPENDENCY_MISSING_ARTIFACT` | 2 | `prompt: string, artifact: string, predecessor: string` | Predecessor artifact not on disk |
| `DEPENDENCY_UNMET` | 2 | `prompt: string, unmet_dep: string` | Prerequisite not completed or skipped |
| `DEP_ON_EXCLUDED` | 0 | `slug: string, excluded_dep: string` | Dependency on an excluded optional prompt (warning) |
| `DEP_RERUN_STALE_DOWNSTREAM` | 0 | `rerun_prompt: string, stale_prompts: string[]` | Re-run may leave downstream prompts stale (warning) |
| `DEP_PHASE_CONFLICT` | 0 | `slug: string, dep_slug: string, slug_phase: number, dep_phase: number` | Prompt depends on a prompt in a later phase (warning) |

**Assembly Engine — exit code 5**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `ASSEMBLY_FAILED` | `step: string, reason: string` | Assembly engine failure (meta-prompt missing, knowledge base missing) |
| `ASSEMBLY_META_PROMPT_NOT_FOUND` | `step: string, expected_path: string` | Meta-prompt file for step not found |
| `ASSEMBLY_KNOWLEDGE_NOT_FOUND` | `step: string, path: string` | Knowledge base file referenced by meta-prompt not found |

**State Manager (domain 03) — exit code 3**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `STATE_PARSE_ERROR` | `parse_error: string` | `state.json` invalid JSON |
| `STATE_VERSION_MISMATCH` | `state_version: number, expected_version: number` | Schema version mismatch |
| `STATE_CORRUPTED` | `reason: string` | Internally inconsistent state |
| `STATE_ARTIFACT_MISMATCH` | `prompt: string, missing_artifact: string` | Completed prompt has missing artifact |
| `PSM_INVALID_TRANSITION` | `prompt: string, from_status: string, to_status: string` | Invalid state transition |
| `PSM_ALREADY_IN_PROGRESS` | `active_prompt: string` | Another prompt is already in_progress |
| `PSM_WRITE_FAILED` | `reason: string` | Failed to write state.json |
| `PSM_METHODOLOGY_MISMATCH` | `state_methodology: string, config_methodology: string` | Methodology mismatch between state and config |
| `PSM_CRASH_DETECTED` | `prompt: string, started_at: string` | Previous session crashed (warning) |
| `PSM_ZERO_BYTE_ARTIFACT` | `prompt: string, artifact: string` | Artifact exists but is 0 bytes (warning) |
| `PSM_SKIP_HAS_DEPENDENTS` | `prompt: string, dependent_prompts: string[]` | Skipping prompt may affect dependents (warning) |
| `PSM_STATE_WITHOUT_ARTIFACTS` | `prompt: string, missing_artifacts: string[]` | Prompt marked completed in state but expected artifacts are missing on disk (warning) |
| `PSM_ARTIFACTS_WITHOUT_STATE` | `prompt: string, found_artifacts: string[]` | Prompt artifacts exist on disk but prompt is not marked completed in state (warning) |

**Lock Manager (domain 13) — exit code 3**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `LOCK_HELD` | `holder: string, prompt: string, pid: number, started: string` | Another process holds the lock |
| `LOCK_STALE_DETECTED` | `holder: string, pid: number` | Stale lock auto-cleared (warning) |
| `LOCK_ACQUISITION_RACE` | — | Race on atomic create; retry recommended |

**Platform Adapters (domain 05) — exit code 5**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `ADAPTER_INIT_FAILED` | `platform: string, reason: string` | Adapter failed to initialize |
| `OUTPUT_WRITE_FAILED` | `path: string, reason: string` | Cannot write output file |
| `AGENTS_MD_ASSEMBLY` | `reason: string` | AGENTS.md assembly failed |
| `UNKNOWN_PLATFORM` | `platform: string` | Platform not registered |
| `CASCADE_RISK` | `platform: string, prompt: string, affected_prompts: string[]` | Potential cascade risk from adapter transformation (warning) |

**Frontmatter Parser (domain 08) — exit code 1**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `FRONTMATTER_MISSING` | `file: string` | No `---` frontmatter delimiters |
| `FRONTMATTER_UNCLOSED` | `file: string` | Opening `---` without closing `---` |
| `FRONTMATTER_YAML_ERROR` | `file: string, parse_error: string` | Malformed YAML in frontmatter |
| `FRONTMATTER_DESCRIPTION_MISSING` | `file: string` | Required `description` field absent |
| `FRONTMATTER_INVALID_FIELD` | `file: string, field: string` | Unknown field in frontmatter (warning) |
| `FRONTMATTER_PRODUCES_MISSING` | `file: string` | Built-in prompt has no `produces` field |
| `FRONTMATTER_DEPENDS_INVALID_SLUG` | `file: string, slug: string` | `depends-on` entry is not valid |

**Validator (cross-cutting) — exit code 1**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `VALIDATE_ARTIFACT_MISSING_SECTION` | `file: string, missing_section: string` | Required section absent from artifact |
| `VALIDATE_ARTIFACT_INVALID_ID` | `file: string, id: string, pattern: string` | Artifact ID does not match expected pattern |
| `VALIDATE_ARTIFACT_MISSING_INDEX` | `file: string` | Artifact missing index table in first 50 lines |
| `VALIDATE_ARTIFACT_MISSING_TRACKING` | `file: string` | Artifact missing tracking comment on line 1 |
| `VALIDATE_UNRESOLVED_MARKER` | `file: string, marker: string` | Build output has unresolved marker |
| `VALIDATE_DECISIONS_INVALID` | `entry_number: number, reason: string` | Malformed entry in decisions.jsonl |
| `DECISION_UNKNOWN_PROMPT` | `decision_id: string, prompt: string` | Decision references unknown prompt (warning) |
| `COMBO_MANUAL_FULL_PR` | `agent_mode: string, git_workflow: string` | Configuration combines `agent-mode: manual` with `git-workflow: full-pr`, which may cause friction (warning) |
| `COMBO_NONE_MULTI` | `task_tracking: string, agent_mode: string` | Configuration combines `task-tracking: none` with `agent-mode: multi`, which lacks task coordination (warning) |

**Runtime commands** (uses canonical domain codes):

| Code | Exit | `details` fields | Description |
|------|------|-----------------|-------------|
| `DEP_TARGET_MISSING` | 2 | `slug: string` | Prompt slug not in resolved pipeline |
| `PSM_INVALID_TRANSITION` | 3 | `prompt: string, current_status: string, attempted_transition: string` | Invalid state transition (e.g., skipping a completed prompt) |
| `DEPENDENCY_UNMET` | 2 | `prompt: string, blocking: string[]` | Prompt depends on uncompleted prompts |
| `DEPENDENCY_MISSING_ARTIFACT` | 2 | `prompt: string, artifact: string` | Predecessor artifact not found on disk |

**User cancellation — exit code 4**:

| Code | `details` fields | Description |
|------|-----------------|-------------|
| `USER_CANCELLED` | — | User declined confirmation or pressed Ctrl+C |

---

## 4. Versioning and Stability

### 4.1 The JSON output is a stable API

The `--format json` output of every scaffold command is treated as a **stable API contract** from the perspective of agents, scripts, and CI systems that consume it. Changes to this contract follow the rules below.

### 4.2 Breaking vs. non-breaking changes

**Breaking changes** — require a major CLI version bump (e.g., `2.x.x` → `3.0.0`):

- Removing a field from any `data` object or from the envelope
- Renaming a field in `data` or the envelope
- Changing the type of an existing field (e.g., string → object)
- Removing a value from an enum (e.g., removing a valid `status` value)
- Changing the semantics of an existing field without changing its name
- Removing an error code
- Changing which exit code an error code maps to

**Non-breaking changes** — permitted in minor or patch versions:

- Adding a new field to any `data` object (at the same nesting level or nested deeper)
- Adding a new field to the error object shape
- Adding a new error code
- Adding a new enum value (consumers must handle unknown values gracefully)
- Adding new optional flags to commands
- Increasing the fidelity of existing fields (e.g., adding more entries to `context_files`)

### 4.3 Forward compatibility: agents must ignore unknown fields

Per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md), agents consuming scaffold JSON output MUST:

- Ignore fields they do not recognize within any `data` object
- Not fail when the `details` object of an error contains unexpected properties
- Not fail when an enum field (e.g., `status`, `source`, `category`) contains a value not in their known set
- Not assume that the `data` field is exactly the shape they last tested against — new fields may appear

This ensures that an agent written against v2.1 continues to work when run against a v2.3 CLI that adds new diagnostic fields to the output.

### 4.4 Versioning of this document

This document is versioned with the scaffold CLI. The `$id` values in the JSON Schemas embed the schema URL at the scaffold-cli.dev domain. When a breaking schema change occurs, the `$id` URL changes (e.g., `.../data/resume.json` → `.../v3/data/resume.json`), and the previous schema URL remains resolvable as documentation for the old contract.

The CLI version that corresponds to a given JSON schema revision can be determined from the CHANGELOG or by inspecting the `version` field in `scaffold version --format json`.
