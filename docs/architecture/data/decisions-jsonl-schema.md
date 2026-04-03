# decisions.jsonl Schema

**Phase**: 4 — Data Schemas
**Depends on**: [domain-models/11-decision-log.md](../domain-models/11-decision-log.md), [adrs/ADR-013-decision-log-jsonl-format.md](../adrs/ADR-013-decision-log-jsonl-format.md), [architecture/system-architecture.md](../architecture/system-architecture.md) §5
**Last updated**: 2026-03-14
**Status**: draft

---

## Section 1: Overview

`.scaffold/decisions.jsonl` is an **append-only JSONL file** that records key decisions made during scaffold pipeline execution. Each line is a self-contained JSON object representing one decision. The CLI writes all entries — agents provide decision text and categories, but never write to this file directly.

**Purpose**: Persist technology, architecture, process, convention, and infrastructure decisions across sessions so that downstream prompts and `scaffold run` can reference prior reasoning without re-reading all predecessor artifacts.

**Lifecycle**:
- **Created by**: `scaffold init` (empty file) or `scaffold adopt` (pre-populated from detected existing choices)
- **Written by**: Decision Logger, a CLI-gated component that assigns IDs, sets timestamps, and serializes entries
- **Read by**: `scaffold run` (session bootstrap context), downstream prompts, `scaffold validate`, `scaffold status`
- **Deleted by**: `scaffold reset` (deletes the entire file; git history preserves previous decisions)

**Key design properties**:
- **Append-only**: Entries are never modified or deleted in place. Status changes (e.g., review approval) are modeled by appending new entries that supersede old ones.
- **JSONL format**: One JSON object per line, no wrapping array. This enables conflict-free git merges when multiple agents append concurrently from separate worktrees.
- **CLI-gated writes**: The scaffold CLI assigns decision IDs (`D-NNN`), sets `prompt_completed` based on actual pipeline state, and writes the correctly formatted line. This ensures consistent formatting and correct metadata.
- **Git-committed**: The file is tracked in version control for cross-session and cross-team visibility.
- **1-3 decisions per prompt**: Each prompt execution typically produces 1-3 entries (guideline, not hard limit). The CLI warns when exceeded; `scaffold adopt` is exempt.
- **Max expected size**: ~50 KB (30-90 entries at ~200 bytes each for a full pipeline run; grows monotonically due to append-only design).

---

## Section 2: Formal Schema Definition

### JSON Schema for a Single JSONL Entry

Each line in `decisions.jsonl` MUST be a valid JSON object conforming to the following schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold.dev/schemas/decision-entry.json",
  "title": "DecisionEntry",
  "description": "A single entry in .scaffold/decisions.jsonl representing one key decision made during pipeline execution.",
  "type": "object",
  "required": ["id", "prompt", "decision", "at", "completed_by", "prompt_completed"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^D-\\d{3,}$",
      "description": "Sequential decision ID. Format: D-NNN (zero-padded to at least 3 digits). Examples: D-001, D-042, D-100."
    },
    "prompt": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "description": "The step name (kebab-case slug) that produced this decision. Must match a step name in the resolved pipeline (state.json prompts map)."
    },
    "decision": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable decision text. Should be self-contained and readable without other context. Non-empty (minLength: 1). Recommended max: 500 characters (enforced as semantic warning, not structural)."
    },
    "at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp of when this decision was recorded. Example: 2026-03-13T14:30:00.000Z"
    },
    "completed_by": {
      "type": "string",
      "minLength": 1,
      "description": "Identity of who made this decision. For humans: username. For agents: BD_ACTOR value (e.g., agent-1, codex-main). For CLI-generated entries: scaffold-adopt."
    },
    "prompt_completed": {
      "type": "boolean",
      "description": "Whether the prompt completed successfully after this decision was recorded. true = confirmed (normal path). false = provisional (may indicate crashed session)."
    },
    "category": {
      "type": "string",
      "enum": ["technology", "architecture", "process", "convention", "infrastructure"],
      "description": "Classification of the decision type. Optional; omitted if the agent does not categorize."
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["NEEDS_USER_REVIEW"]
      },
      "uniqueItems": true,
      "description": "Tags for special handling. NEEDS_USER_REVIEW flags high-stakes autonomous decisions for human review."
    },
    "review_status": {
      "type": "string",
      "enum": ["pending", "approved", "rejected", "revised"],
      "description": "Review status for decisions tagged NEEDS_USER_REVIEW. Only present when tags includes NEEDS_USER_REVIEW. Defaults to pending when first written."
    },
    "depth": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "Depth level (1-5) at which the step was executing when this decision was recorded. Enables downstream steps to understand the rigor level of prior decisions. Scale: 1 (MVP floor) through 5 (deep ceiling). See ADR-043."
    }
  },
  "additionalProperties": true
}
```

**Note on `additionalProperties: true`**: Per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md), unknown fields produce warnings but are preserved on read. This enables forward compatibility: a newer CLI version may add fields that older versions do not recognize but must not discard.

### JSONL File-Level Constraints

| Constraint | Rule |
|---|---|
| **Format** | One JSON object per line. No wrapping array. No comma between lines. |
| **Line termination** | Every line (including the last) MUST end with a newline character (`\n`). |
| **Encoding** | UTF-8 without BOM. |
| **Empty lines** | Blank lines (whitespace-only) are permitted and skipped during parsing. |
| **Line size** | Each serialized JSON line MUST be less than 4 KB to ensure POSIX atomic append semantics. |
| **File creation** | Created empty by `scaffold init`; may be pre-populated by `scaffold adopt`. |
| **File deletion** | Only by `scaffold reset`. Individual entries are never removed. |
| **ID ordering** | IDs MUST be monotonically increasing within a single writer's append sequence. Across concurrent writers, file position determines authority (last entry wins for duplicate IDs). |
| **ID uniqueness** | IDs SHOULD be unique within the file. Duplicates from concurrent writers are detected by `scaffold validate` and correctable via `--fix`. |

---

## Section 3: Field Reference

| Field | Type | Required | Default | Constraints | Description |
|---|---|---|---|---|---|
| `id` | `string` | Yes | — | Pattern: `^D-\d{3,}$`. Monotonically increasing. Unique within file (SHOULD; duplicates are warnings, not errors). | Sequential decision identifier. Assigned by CLI, never by agents. |
| `prompt` | `string` | Yes | — | kebab-case (`^[a-z][a-z0-9-]*$`). Should match a step name in `state.json` `prompts` map. | Step name (kebab-case slug) that produced this decision. |
| `decision` | `string` | Yes | — | Non-empty after trimming (minLength: 1). Recommended max: 500 characters (semantic warning, not structural). | Human-readable decision text describing what was decided and why. |
| `at` | `string` | Yes | — | Valid ISO 8601 date-time. Example: `2026-03-13T14:30:00.000Z` | Timestamp of when the CLI recorded this entry. |
| `completed_by` | `string` | Yes | — | Non-empty after trimming. | Actor identity: username, `BD_ACTOR` value, or `scaffold-adopt`. |
| `prompt_completed` | `boolean` | Yes | — | Must be `true` or `false`. | `true` if the prompt completed successfully before this entry was written (confirmed). `false` if written during execution before completion was confirmed (provisional). |
| `category` | `string` | No | *(absent)* | One of: `technology`, `architecture`, `process`, `convention`, `infrastructure`. | Decision classification. Aids filtering and downstream consumption. |
| `tags` | `string[]` | No | *(absent)* | Array of unique strings. Currently only `NEEDS_USER_REVIEW` is defined. | Tags for special handling. |
| `review_status` | `string` | No | *(absent)* | One of: `pending`, `approved`, `rejected`, `revised`. Only meaningful when `tags` includes `NEEDS_USER_REVIEW`. | Review lifecycle state for autonomous high-stakes decisions. |
| `depth` | `integer` | No | *(absent)* | 1-5 ([ADR-043](../adrs/ADR-043-depth-scale.md)). | Depth level at which the step was executing when this decision was recorded. Enables downstream steps to assess the rigor level behind prior decisions. |

**Field name convention**: This file uses `snake_case` for field names (`completed_by`, `prompt_completed`, `review_status`), matching the serialized JSON convention established in Domain 11.

---

## Section 4: Cross-Schema References

| This Field | References | Target File | Relationship | Orphan Behavior |
|---|---|---|---|---|
| `prompt` | Prompt slug key | `.scaffold/state.json` → `prompts.{key}` | Decision's prompt should exist as a key in the state file's `prompts` map. | Orphaned decisions (prompt removed by methodology change) are harmless. `scaffold validate` emits `DECISION_UNKNOWN_PROMPT` warning. Orphaned entries remain in the file and are excluded from "latest per prompt" queries for active prompts. |
| `id` | Other `id` values | `.scaffold/decisions.jsonl` (self-referential) | IDs should be unique within the file. | Duplicate IDs (from concurrent appends) are resolved by file position: last entry with a given ID wins. `scaffold validate` detects duplicates; `--fix` reassigns. |
| `completed_by` | Actor identity | `BD_ACTOR` environment variable / CLI session | Links a decision to the agent or user who made it. | No validation against an external actor registry. Any non-empty string is accepted. |
| `at` | Temporal ordering | `.scaffold/state.json` → `prompts.{key}.completed_at` | Decision timestamp should be close to (within minutes of) the prompt's completion timestamp in state.json. | No cross-file timestamp validation. Divergence is expected for provisional entries and re-runs. |

**Prompt slug stability**: Prompt slugs are treated as immutable identifiers across methodology versions. If a prompt's content changes significantly, the methodology deprecates the old slug and introduces a new one. Orphaned `decisions.jsonl` entries referencing deprecated slugs remain in the log but are not surfaced by "latest decision per prompt" queries for active prompts.

---

## Section 5: Version History and Migration

This file has **no version field**. This is a deliberate design choice, not an omission.

**Rationale**: `decisions.jsonl` is an append-only log where each line is independently parseable. Unlike `state.json` or `config.yml` (which represent a single structured document whose shape may change across schema versions), the decision log is a sequence of independent records. Schema evolution is handled per-entry:

1. **New optional fields**: Added to new entries written by newer CLI versions. Older entries without these fields remain valid — consumers treat absent optional fields as undefined. Example: `category`, `tags`, and `review_status` are all optional precisely because they were designed for incremental adoption.

2. **Unknown fields**: Per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md), unknown fields on any entry produce warnings but are preserved on read. A newer CLI version can add fields that older versions do not strip.

3. **No migration needed**: Because entries are never modified in place, there is no "old format" to migrate. The file may contain a mix of entries with different optional field sets — some with `category`, some without; some with `tags`, some without. This is by design.

4. **Breaking changes**: If a future schema change requires modifying the meaning of an existing required field (which is not anticipated), the resolution would be a new file format (e.g., `decisions-v2.jsonl`) rather than in-place migration, preserving the append-only invariant.

**Comparison with state.json**: `state.json` includes a `schema_version` field because it is a single document that is fully rewritten on each mutation — a version field enables the CLI to detect and migrate the entire document. `decisions.jsonl` entries are never rewritten, so per-entry version tracking would be redundant overhead on every line for no operational benefit.

---

## Section 6: Serialization Details

### JSONL Format Rules

`decisions.jsonl` uses [JSON Lines](https://jsonlines.org/) format with the following specific rules:

1. **One JSON object per line**: Each line contains exactly one complete JSON object. Objects MUST NOT span multiple lines — no pretty-printing, no embedded newlines in string values (use `\n` escape sequences if needed).

2. **Newline-terminated**: Every line, including the last line in the file, MUST end with a single newline character (`\n`). A file with 3 entries contains exactly 3 newline characters.

3. **No wrapping array**: The file is NOT a JSON array. There are no `[` or `]` delimiters and no commas between lines. Each line is parsed independently via `JSON.parse()`.

4. **No trailing comma**: JSON objects on each line MUST NOT have trailing commas (standard JSON requirement).

5. **Compact serialization**: Entries MUST be serialized with `JSON.stringify(entry)` (no indentation, no extra whitespace). This ensures each entry occupies exactly one line and stays well under the 4 KB atomic write threshold.

6. **UTF-8 encoding**: The file MUST be encoded as UTF-8 without a byte order mark (BOM).

7. **No blank line between entries**: While blank lines are tolerated during parsing (skipped silently), the CLI MUST NOT write blank lines between entries. The canonical format is consecutive JSON lines with no gaps.

8. **Line ending tolerance**: Files are written with LF (Unix-style) line endings. Readers must tolerate CRLF (Windows-style) line endings for cross-platform compatibility.

### Line-Level Atomicity

POSIX guarantees that `write()` calls under the pipe buffer size (4 KB on Linux, 4 KB on macOS) are atomic — the kernel will not interleave bytes from concurrent writes to the same file. Since each decision entry serializes to approximately 150-300 bytes (well under 4 KB), a single `write()` call for one entry is atomic.

**Multi-entry appends**: When the CLI writes a batch of 1-3 decisions, it concatenates them into a single string (`line1\nline2\nline3\n`) and performs one `write()` call. For a 3-entry batch at ~300 bytes each, the total is ~900 bytes — still well under 4 KB.

### Partial Last Line Handling (Crash Recovery)

If the process crashes mid-write (power failure, `kill -9`, OOM), the file may end with a truncated JSON line that is not valid JSON:

```
{"id":"D-001","prompt":"product-definition","decision":"Using React for UI","at":"2026-03-13T14:30:00.000Z","completed_by":"agent-1","prompt_completed":true,"category":"technology"}
{"id":"D-002","prompt":"product-definition","decision":"PostgreSQL for
```

**Detection**: On read, the CLI parses each line independently. A line that fails `JSON.parse()` is a truncated crash artifact.

**Resolution**: The truncated line is skipped with a `DECISION_TRUNCATED_LINE` warning. The warning includes the line number and a truncated preview of the raw content. No data from valid preceding lines is lost.

**No auto-repair**: The CLI does not attempt to fix or remove the truncated line. It remains in the file until either:
- `scaffold validate --fix` removes it
- `scaffold reset` deletes the entire file
- A user manually edits the file

### Git Merge Behavior

Because JSONL appends are independent line additions at the end of the file, git auto-merges concurrent appends from different branches without conflicts:

```
# Branch A appends:
{"id":"D-005",...}

# Branch B appends:
{"id":"D-005",...}

# After merge, both lines appear (in merge order):
{"id":"D-005","prompt":"tech-stack",...}    ← from branch A
{"id":"D-005","prompt":"api-design",...}    ← from branch B
```

The duplicate ID (`D-005`) is expected in this scenario and resolved by "last entry wins" query semantics. `scaffold validate` detects the duplicate and `--fix` reassigns the later entry to `D-006`.

### Timestamp Format

Timestamps use ISO 8601 format with UTC timezone designator (`Z`). Milliseconds are optional and may be omitted. Consumers must accept both `2026-03-13T10:00:00Z` and `2026-03-13T10:00:00.000Z`.

---

## Section 7: Validation Rules

### Structural Validation (per-line)

These rules apply to each individual line in the file. A line that fails structural validation is an **error** — the entry is skipped during processing.

| Rule | Check | Error Code | Severity | Message Template |
|---|---|---|---|---|
| Valid JSON | Line parses successfully via `JSON.parse()` | `DECISION_PARSE_ERROR` | Error | `Failed to parse {file} line {line}: {parse_error}. Each line must be a complete JSON object.` |
| Required fields present | `id`, `prompt`, `decision`, `at`, `completed_by`, `prompt_completed` all exist | `DECISION_SCHEMA_ERROR` | Error | `Decision entry at {file} line {line} missing required field '{field}'.` |
| Non-empty prompt | `prompt` is non-empty after trimming (1+ characters) | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' has empty prompt field. Every decision must reference the prompt that produced it.` |
| ID format | `id` matches pattern `^D-\d{3,}$` | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' in {file} line {line} doesn't match D-NNN format. Expected 'D-' followed by 3+ digits.` |
| Valid timestamp | `at` is a valid ISO 8601 date-time string | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' has invalid timestamp '{value}'. Must be valid ISO 8601 date-time.` |
| Non-empty decision | `decision` is non-empty after trimming (1+ characters) | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' has empty decision text. Must be 1+ characters.` |
| Non-empty actor | `completed_by` is non-empty after trimming | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' has empty completed_by field. Must identify the actor.` |
| Boolean prompt_completed | `prompt_completed` is exactly `true` or `false` (not truthy/falsy) | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' prompt_completed must be boolean (true/false), got '{value}'.` |
| Valid category | If `category` is present, it is one of: `technology`, `architecture`, `process`, `convention`, `infrastructure` | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' has invalid category '{value}'. Valid: technology, architecture, process, convention, infrastructure.` |
| Valid tags | If `tags` is present, it is an array and every element is a known tag (`NEEDS_USER_REVIEW`) | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' has unknown tag '{value}'. Currently defined tags: NEEDS_USER_REVIEW.` |
| Valid review status | If `review_status` is present, it is one of: `pending`, `approved`, `rejected`, `revised` | `DECISION_SCHEMA_ERROR` | Error | `Decision '{id}' has invalid review_status '{value}'. Valid: pending, approved, rejected, revised.` |

### Semantic Validation (cross-entry and cross-file)

These rules apply across multiple entries or across files. Semantic issues are **warnings** unless otherwise noted.

| Rule | Check | Warning/Error Code | Severity | Message Template |
|---|---|---|---|---|
| Unique IDs | No two confirmed entries (`prompt_completed: true`) share the same `id` | `DECISION_ID_COLLISION` | Error | `Duplicate decision ID '{id}' found at lines {line1} and {line2}. Run 'scaffold validate --fix' to reassign.` |
| Known prompt | `prompt` matches a key in `state.json` `prompts` map | `DECISION_UNKNOWN_PROMPT` | Warning | `Decision '{id}' references prompt '{prompt}' which is not in the current pipeline. Expected after methodology changes.` |
| Decision text length | `decision` is at most 500 characters | `DECISION_TEXT_LENGTH` | Warning | `Decision text in entry '{id}' is {length} characters (recommended max: 500). Consider condensing for readability.` |
| Decisions per prompt | No more than 3 entries per prompt execution (same prompt, timestamps within 60 seconds) | `DECISION_HIGH_COUNT` | Warning | `Prompt '{prompt}' has {count} decisions in a single execution (recommended max: 3). Consider consolidating.` |
| No stale provisionals | Provisional entries (`prompt_completed: false`) older than 24 hours | `DECISION_STALE_PROVISIONAL` | Warning | `Provisional decision '{id}' is {hours}h old. The session may have crashed. Re-run the prompt or accept the provisional entry.` |
| Pending reviews | Entries with `tags` including `NEEDS_USER_REVIEW` and `review_status: pending` | `DECISION_PENDING_REVIEW` | Warning | `Decision '{id}' is flagged for user review but still pending. Review and approve, reject, or revise.` |
| Empty log | File exists but contains no valid entries | `DECISION_EMPTY_LOG` | Warning | `{file} exists but contains no valid entries. Entries appear as prompts complete.` |
| Truncated line | A line fails JSON parsing (likely crash artifact) | `DECISION_TRUNCATED_LINE` | Warning | `{file} line {line} is not valid JSON (likely truncated by crash). Run 'scaffold validate --fix' to remove.` |
| Unknown fields | An entry contains fields not defined in the schema | *(per ADR-033)* | Warning | `Decision '{id}' contains unknown field '{field}'. Field preserved for forward compatibility.` |

### Validation Behavior Summary

- **`scaffold validate`**: Runs all structural and semantic checks. Exits 0 if only warnings; exits non-zero if any errors.
- **`scaffold validate --fix`**: For duplicate IDs, reassigns the later entry's ID. For truncated lines, removes them. Does not fix other errors.
- **On read (resume, status)**: Runs structural validation only. Malformed lines are skipped with warnings. Semantic validation is deferred to explicit `validate` invocations.

### Complete Error Code Reference

| Code | Trigger | Severity | Recovery |
|---|---|---|---|
| `DECISION_PARSE_ERROR` | Line is not valid JSON | Error | Fix or remove the malformed line. If last line, likely a crash artifact — `scaffold validate --fix` removes it. |
| `DECISION_SCHEMA_ERROR` | Valid JSON but wrong shape (missing required field, invalid field value) | Error | Add missing fields or correct invalid values. |
| `DECISION_WRITE_FAILED` | Failed to append to the file (permissions, disk full) | Error | Check file permissions and available disk space. |
| `DECISION_FILE_NOT_FOUND` | `decisions.jsonl` does not exist when a write or read operation expects it | Error | Run `scaffold init` to create the file. |
| `DECISION_ID_COLLISION` | Two confirmed entries share the same ID | Error | Run `scaffold validate --fix` to reassign the later entry's ID. |
| `DECISION_VALIDATION_FAILED` | One or more entries failed structural validation | Error | Run `scaffold validate` to see details; fix individual entries. |
| `DECISION_PERMISSION_ERROR` | Cannot read or write `decisions.jsonl` | Error | Check file and directory permissions on `.scaffold/`. |
| `DECISION_TRUNCATED_LINE` | A line fails JSON parsing, likely a crash artifact | Warning | Run `scaffold validate --fix` to remove, or leave in place (skipped on read). |
| `DECISION_UNKNOWN_PROMPT` | Entry references a prompt slug not in the current pipeline | Warning | Expected after methodology changes. No action needed. |
| `DECISION_PROVISIONAL_EXISTS` | Provisional entries exist (possible crash) | Warning | Re-run the prompt to produce confirmed entries, or verify the provisional entries are acceptable. |
| `DECISION_PENDING_REVIEW` | Entries tagged `NEEDS_USER_REVIEW` with `review_status: pending` | Warning | Review the flagged decisions and approve, reject, or revise. |
| `DECISION_SUPERSEDED` | An entry was superseded by a newer entry for the same prompt | Warning | Informational only. Superseded entries remain for auditing. |
| `DECISION_EMPTY_LOG` | File exists but contains no entries | Warning | Expected immediately after `scaffold init`. Entries appear as prompts complete. |
| `DECISION_HIGH_COUNT` | More than 3 decisions recorded for a single prompt execution | Warning | Consider consolidating decisions. Not enforced as an error. |
| `DECISION_STALE_PROVISIONAL` | Provisional entry older than 24 hours | Warning | Session likely crashed. Re-run the prompt or accept the provisional entries. |

---

## Section 8: Examples

### Example 1: Minimal Single Entry

The smallest valid entry, using only required fields:

```jsonl
{"id":"D-001","prompt":"product-definition","decision":"Building a task management CLI tool targeting developers","at":"2026-03-13T10:00:00.000Z","completed_by":"user-1","prompt_completed":true}
```

### Example 2: Realistic Multi-Entry Mid-Pipeline

A file after completing several prompts, showing typical usage with categories, a provisional entry, and a re-run scenario:

```jsonl
{"id":"D-001","prompt":"product-definition","decision":"Building a task management CLI tool targeting developers who want offline-first task tracking","at":"2026-03-13T10:00:00.000Z","completed_by":"user-1","prompt_completed":true,"category":"architecture","depth":5}
{"id":"D-002","prompt":"product-definition","decision":"MVP scope: create, list, update, delete tasks with local SQLite storage","at":"2026-03-13T10:00:01.000Z","completed_by":"user-1","prompt_completed":true,"category":"process","depth":5}
{"id":"D-003","prompt":"tech-stack","decision":"Chose Rust for CLI implementation — compile-time safety, single binary distribution, fast startup","at":"2026-03-13T11:15:00.000Z","completed_by":"user-1","prompt_completed":true,"category":"technology","depth":5}
{"id":"D-004","prompt":"tech-stack","decision":"SQLite via rusqlite for local storage — zero-config, single-file database, embedded","at":"2026-03-13T11:15:01.000Z","completed_by":"user-1","prompt_completed":true,"category":"technology"}
{"id":"D-005","prompt":"tech-stack","decision":"Using clap for argument parsing — derive macros reduce boilerplate","at":"2026-03-13T11:15:02.000Z","completed_by":"user-1","prompt_completed":true,"category":"technology"}
{"id":"D-006","prompt":"project-structure","decision":"Flat module layout with lib.rs re-exports — avoid deep nesting for a small CLI","at":"2026-03-13T12:30:00.000Z","completed_by":"agent-1","prompt_completed":false,"category":"architecture"}
{"id":"D-007","prompt":"api-design","decision":"Subcommand pattern: task create, task list, task update, task delete, task show","at":"2026-03-13T14:00:00.000Z","completed_by":"agent-2","prompt_completed":true,"category":"architecture"}
{"id":"D-008","prompt":"api-design","decision":"JSON output mode via --json flag for scripting and piping","at":"2026-03-13T14:00:01.000Z","completed_by":"agent-2","prompt_completed":true,"category":"convention"}
{"id":"D-009","prompt":"project-structure","decision":"Flat module layout with lib.rs re-exports — confirmed after crash recovery","at":"2026-03-13T15:00:00.000Z","completed_by":"agent-1","prompt_completed":true,"category":"architecture"}
```

**What this shows**:
- `D-001` through `D-005`: Normal confirmed entries from the first three prompts, 2-3 decisions each.
- `D-006`: A provisional entry (`prompt_completed: false`) for `project-structure` — the session may have crashed.
- `D-007` and `D-008`: Entries from a second agent working in parallel on `api-design`.
- `D-009`: A confirmed entry for `project-structure` after re-running the prompt. This supersedes the provisional `D-006`. The "latest per prompt" query returns `D-009`, not `D-006`.

### Example 3: Maximal Entry with All Optional Fields

An entry using every defined field, including Codex autonomous decision tagging:

```jsonl
{"id":"D-012","prompt":"data-model","decision":"PostgreSQL as primary database — ACID compliance required for financial transaction records","at":"2026-03-13T16:45:00.000Z","completed_by":"codex-main","prompt_completed":true,"category":"technology","tags":["NEEDS_USER_REVIEW"],"review_status":"pending"}
```

After the user reviews and approves this decision, a new entry is appended (the original remains):

```jsonl
{"id":"D-012","prompt":"data-model","decision":"PostgreSQL as primary database — ACID compliance required for financial transaction records","at":"2026-03-13T16:45:00.000Z","completed_by":"codex-main","prompt_completed":true,"category":"technology","tags":["NEEDS_USER_REVIEW"],"review_status":"pending"}
{"id":"D-015","prompt":"data-model","decision":"PostgreSQL as primary database — ACID compliance required for financial transaction records","at":"2026-03-13T18:00:00.000Z","completed_by":"user-1","prompt_completed":true,"category":"technology","tags":["NEEDS_USER_REVIEW"],"review_status":"approved"}
```

The "latest per prompt" query returns the `D-015` entry (with `review_status: approved`), superseding `D-012`.

### Example 4: Invalid Entries with Annotations

Each line below is invalid. Annotations explain what is wrong.

```jsonl
{"prompt":"tech-stack","decision":"Using React","at":"2026-03-13T10:00:00.000Z","completed_by":"user-1","prompt_completed":true}
```
**Error**: `DECISION_SCHEMA_ERROR` — Missing required field `id`.

```jsonl
{"id":"D-003","prompt":"tech-stack","decision":"","at":"2026-03-13T10:00:00.000Z","completed_by":"user-1","prompt_completed":true}
```
**Error**: `DECISION_SCHEMA_ERROR` — Empty `decision` field. Must be 1-500 characters.

```jsonl
{"id":"003","prompt":"tech-stack","decision":"Using React","at":"2026-03-13T10:00:00.000Z","completed_by":"user-1","prompt_completed":true}
```
**Error**: `DECISION_SCHEMA_ERROR` — Invalid `id` format. Must match `D-NNN` pattern (e.g., `D-003`).

```jsonl
{"id":"D-004","prompt":"tech-stack","decision":"Using React","at":"not-a-date","completed_by":"user-1","prompt_completed":true}
```
**Error**: `DECISION_SCHEMA_ERROR` — Invalid `at` timestamp. Must be valid ISO 8601.

```jsonl
{"id":"D-005","prompt":"tech-stack","decision":"Using React","at":"2026-03-13T10:00:00.000Z","completed_by":"user-1","prompt_completed":"yes"}
```
**Error**: `DECISION_SCHEMA_ERROR` — `prompt_completed` must be a boolean (`true` or `false`), not a string.

```jsonl
{"id":"D-006","prompt":"tech-stack","decision":"Using React","at":"2026-03-13T10:00:00.000Z","completed_by":"user-1","prompt_completed":true,"category":"frontend"}
```
**Error**: `DECISION_SCHEMA_ERROR` — Invalid `category`. Must be one of: `technology`, `architecture`, `process`, `convention`, `infrastructure`.

```jsonl
{"id":"D-007","prompt":"tech-stack","decision":"Using React
```
**Error**: `DECISION_PARSE_ERROR` — Invalid JSON (truncated line, likely crash artifact). This line would be skipped on read with a `DECISION_TRUNCATED_LINE` warning.

---

## Section 9: Interaction with Other State Files

### state.json

**Relationship**: `decisions.jsonl` entries reference prompt slugs that correspond to keys in `state.json`'s `prompts` map. The state machine controls when decisions are written — the CLI triggers decision recording as a post-completion side effect when a prompt transitions to `completed`.

**Consistency scenarios**:

| Scenario | state.json | decisions.jsonl | Resolution |
|---|---|---|---|
| Normal completion | Prompt is `completed` | 1-3 confirmed entries exist for this prompt | Consistent. No action. |
| Completed, no decisions | Prompt is `completed` | No entries for this prompt | Valid. Not all prompts produce decisions. The 1-3 guideline is not enforced as a requirement. |
| Provisional decisions, prompt completed | Prompt is `completed` | Only provisional entries (`prompt_completed: false`) | Session crashed after writing provisional entries; user re-ran and completed the prompt but crash recovery did not re-record decisions. `scaffold validate` emits `DECISION_PROVISIONAL_EXISTS` warning. |
| Orphaned decisions | Prompt removed from pipeline (methodology change) | Entries reference the removed prompt slug | `scaffold validate` emits `DECISION_UNKNOWN_PROMPT` warning. Orphaned entries remain for auditing. |
| Prompt re-run | Prompt is `completed` (latest run) | Multiple batches of entries for this prompt | "Latest per prompt" query returns the most recent confirmed batch. Earlier batches are superseded but preserved. |

### config.yml

**Relationship**: Indirect. `config.yml` defines the methodology and depth configuration that determines which steps are enabled in the pipeline. The set of valid step names in `decisions.jsonl` is derived from the resolved pipeline, which is derived from `config.yml`.

**Impact of config changes**: If a methodology change removes a prompt that has decisions, those decisions become orphaned. If a methodology change adds a prompt, new decisions will be recorded as the prompt is executed. No migration of existing decisions is needed.

### lock.json

**Relationship**: The advisory lock in `lock.json` prevents concurrent `scaffold run` invocations on the same worktree, which indirectly protects `decisions.jsonl` from concurrent local writes. However, `decisions.jsonl` does not reference `lock.json` and `lock.json` does not reference `decisions.jsonl`.

**Cross-worktree**: Each git worktree has its own `.scaffold/` directory with independent `decisions.jsonl` and `lock.json` files. When worktrees merge to the main branch, their independent `decisions.jsonl` appends merge cleanly via git.

### CLAUDE.md

**Relationship**: None directly. `CLAUDE.md` sections are filled by prompts during execution, but the decision log does not reference CLAUDE.md and vice versa. Both are downstream effects of prompt completion — decisions capture reasoning, CLAUDE.md sections capture agent instructions.

### Build Outputs (commands/*.md, codex-prompts/*.md, prompts/*.md)

**Relationship**: Downstream prompts may read the decision log (via the session bootstrap summary produced by `scaffold run`) to understand prior choices. The decision log content influences what agents write in their prompt outputs, but there is no structural reference from build outputs to `decisions.jsonl`.

**Session bootstrap**: When `scaffold run` starts a new session, it reads `decisions.jsonl`, runs the "latest per prompt" query, and includes a summary of recent decisions in the agent's context block. This is the primary mechanism by which decisions flow to downstream prompt execution.
