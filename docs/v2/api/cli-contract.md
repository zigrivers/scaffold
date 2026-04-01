# Scaffold v2 — CLI Contract

**Phase**: 5 — API Contract Specification
**Depends on**: Phase 3 ([system-architecture](../architecture/system-architecture.md)), Phase 4 ([data schemas](../data/)), Phase 2 ([ADR-025](../adrs/ADR-025-cli-output-contract.md), [ADR-040](../adrs/ADR-040-error-handling-philosophy.md), [ADR-043](../adrs/ADR-043-depth-scale.md), [ADR-044](../adrs/ADR-044-runtime-prompt-generation.md), [ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md), [ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md), [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md))
**Last updated**: 2026-03-14
**Status**: draft

---

## Table of Contents

1. [Global Conventions](#section-1-global-conventions)
2. [Command Reference](#section-2-command-reference)
   - [scaffold init](#scaffold-init-idea-flags)
   - [scaffold run](#scaffold-run-step-flags)
   - [scaffold build](#scaffold-build-flags)
   - [scaffold adopt](#scaffold-adopt-flags)
   - [scaffold skip](#scaffold-skip-step-flags)
   - [scaffold reset](#scaffold-reset-flags)
   - [scaffold status](#scaffold-status-flags)
   - [scaffold next](#scaffold-next-flags)
   - [scaffold validate](#scaffold-validate-flags)
   - [scaffold list](#scaffold-list-flags)
   - [scaffold info](#scaffold-info-step-flags)
   - [scaffold version](#scaffold-version)
   - [scaffold update](#scaffold-update-flags)
   - [scaffold dashboard](#scaffold-dashboard-flags)
   - [scaffold decisions](#scaffold-decisions---step-slug---last-n-flags)
3. [Command Dependency Matrix](#section-3-command-dependency-matrix)
4. [Flag Interaction Rules](#section-4-flag-interaction-rules)

---

## Section 1: Global Conventions

These rules apply to every scaffold command unless explicitly overridden in the per-command specification.

### 1a: Global Flags

Every command accepts the following flags in addition to its own command-specific flags:

| Flag | Type | Description |
|------|------|-------------|
| `--format json` | string | Emit all output as a single JSON envelope to stdout. Human-readable messages, warnings, and diagnostics are directed to stderr only. The JSON envelope schema is `{ success: boolean, command: string, data: object, errors: array, warnings: array, exit_code: number }`. |
| `--auto` | boolean | Suppress all interactive prompts. Resolve decisions using safe defaults. Does **not** imply `--force` ([ADR-036](../adrs/ADR-036-auto-does-not-imply-force.md)). |
| `--verbose` | boolean | Emit additional diagnostic output. In build commands: resolution trace (which step resolved from which layer), dependency graph edges. In runtime commands: assembly engine steps, state machine transitions, lock acquisition/release events, artifact check paths. Verbose output always goes to stderr; in `--format json` mode it appears under the `verbose` key in the JSON envelope. |
| `--help` | boolean | Show command usage, flags, and examples. Always exits 0. |
| `--version` | boolean | Show scaffold version string. Alias for `scaffold version`. |
| `--root <path>` | string | Override project root detection. Uses specified directory as `.scaffold/` parent instead of searching upward. See domain model 09 Algorithm 1. |
| `--force` | boolean | Override advisory lock contention. Usable independently of `--auto` in both interactive and non-interactive contexts. Does **not** override reset/overwrite protections — those require `--confirm-reset`. |

### 1b: Exit Code Contract

Exit codes are consistent across all commands ([ADR-025](../adrs/ADR-025-cli-output-contract.md)):

| Code | Meaning | Triggered By |
|------|---------|-------------|
| 0 | Success | All commands on success (warnings permitted) |
| 1 | Validation error | Bad config (`FIELD_*`; `CONFIG_*` aliases for backward compatibility), invalid manifest (`RESOLUTION_*`), malformed frontmatter (`FRONTMATTER_*`), bad arguments, dependency cycle (`DEP_CYCLE_DETECTED`), missing required init platform |
| 2 | Missing dependency | Predecessor artifact not found (`DEPENDENCY_MISSING_ARTIFACT`, `DEPENDENCY_UNMET`, `DEP_TARGET_MISSING`) |
| 3 | State corruption / lock contention | `state.json` unreadable (`STATE_PARSE_ERROR`, `STATE_CORRUPTED`, `STATE_VERSION_MISMATCH`), lock held by live process (`LOCK_HELD`) in `--auto` mode without `--force` |
| 4 | User cancellation | Interactive prompt declined (Ctrl+C, "no" response, empty selection) |
| 5 | Build/assembly error | Adapter write error (`OUTPUT_WRITE_FAILED`, `ADAPTER_INIT_FAILED`), assembly engine failure (`ASSEMBLY_FAILED`) |

Exit code 4 is produced exclusively by the interactive layer — no domain error code maps to it. It signals user choice, not system failure.

### 1c: Project Root Detection

Every command except `scaffold init` and `scaffold version` requires a project root. Project root detection walks up the directory tree from `cwd`, looking for a `.scaffold/` directory. If not found, the command exits with a clear error message explaining that `scaffold init` must be run first. The detected root is used as the base path for all `.scaffold/` file references throughout the command.

### 1d: Output Mode Behavior

Three output modes govern how commands interact with users ([ADR-025](../adrs/ADR-025-cli-output-contract.md)):

**Interactive mode** (default — no special flag):
- Information display: colored, formatted text to stdout; progress spinners on long operations.
- Confirmation prompts: yes/no questions via `@inquirer/prompts` before destructive operations.
- Selection prompts: interactive list selection via `@inquirer/prompts` for choices (methodology, platforms, etc.).

**JSON mode** (`--format json`):
- All structured output goes to stdout as a single JSON envelope. The envelope is emitted as one newline-terminated JSON object at the end of the command.
- Human-readable messages, warnings, and diagnostics go to stderr.
- Commands that require a confirmation prompt in interactive mode instead exit with code 4 if neither `--auto` nor `--confirm-reset` is provided. A JSON-mode command must always have the full output predictable without user interaction.
- Verbose diagnostics appear under `"verbose": [...]` in the envelope when `--verbose` is combined with `--format json`.

**Auto mode** (`--auto`):
- Suppresses all interactive prompts; resolves decisions using safe defaults.
- Information display: same as interactive mode, directed to stderr.
- Confirmation prompts: resolved as "no" (do not proceed) unless the operation is reversible (e.g., `scaffold skip` proceeds; `scaffold reset` does not).
- Selection prompts: resolved by choosing the default/recommended option (smart suggestion for methodology; first eligible step for run).
- A held lock with `--auto` (without `--force`) produces exit code 3, never proceeds silently.

**Combined modes** (`--auto --format json`):
- Decisions are resolved automatically (auto behavior); output is structured (JSON behavior).
- This is the mode for CI pipelines and agent automation.

### 1e: Lock Behavior Summary

Write commands acquire the advisory file lock (`.scaffold/lock.json`) before modifying pipeline state. Read-only commands never acquire the lock and run freely even when another process holds it ([ADR-019](../adrs/ADR-019-advisory-locking.md)).

| Category | Commands |
|----------|----------|
| Lockable (must acquire) | `run`, `skip`, `reset`, `adopt` |
| Read-only (no lock) | `init`, `build`, `status`, `next`, `validate`, `dashboard`, `list`, `info`, `version`, `update` |

### 1f: Error Handling Philosophy

Build-time commands (`build`, `validate`) accumulate all errors and warnings, report them grouped by source file (errors before warnings per file), then exit ([ADR-040](../adrs/ADR-040-error-handling-philosophy.md)). Runtime commands (`run`, `skip`, `reset`) fail fast on the first structural error.

---

## Section 2: Command Reference

---

### `scaffold init [idea] [flags]`

**Purpose**: Run the interactive methodology wizard (Deep/MVP/Custom), generate `.scaffold/config.yml`, then automatically invoke `scaffold build` to produce hidden platform adapter artifacts under `.scaffold/generated/`.
**Category**: init
**Lock behavior**: No lock (writes config/state atomically at the end; see domain model 14 §7.6)
**Requires project**: No (creates the project)

**Arguments:**

| Argument | Required | Type | Description |
|----------|----------|------|-------------|
| `idea` | No | string | Free-text idea description. Analyzed for keyword signals to inform smart methodology suggestion. Quoted if multi-word. |

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--force` | boolean | false | Allow re-initialization when `.scaffold/config.yml` already exists. Backs up existing `.scaffold/` before overwriting. Without this flag, an existing config produces error `INIT_SCAFFOLD_EXISTS` (exit 1). |
| `--confirm-reset` | boolean | false | Required in `--auto` mode when `--force` is also set. Confirms that overwriting existing config is intentional. Without this, `--auto --force` still fails (exit 1). |
| `--methodology <name>` | string | (smart suggestion) | Pre-select a methodology (Deep/MVP/Custom), skipping or pre-answering the methodology selection question. |
| `--dry-run` | boolean | false | Show what would be created without writing files. Implies `--auto`. |

**Interactive behavior**:

The wizard runs through three phases:

1. **Detection phase** (automatic): Parses the `idea` argument for keyword signals; scans codebase files for framework signals (v1 tracking comments → v1 migration, `package.json` + `src/` → brownfield, otherwise greenfield); performs smart methodology suggestion ([ADR-027](../adrs/ADR-027-init-wizard-smart-suggestion.md)).

2. **Question phase** (interactive): Presents questions in sequence with smart defaults highlighted:
   - Methodology selection: Deep / MVP / Custom (with confidence-weighted default)
   - Platform selection (`claude-code` and/or `codex`; Universal always generated)
   - Project type questions (conditional: `frontend`, `web`, `mobile`, `multi-platform`)

3. **Confirmation phase**: Displays summary of all selections; asks "Proceed with these settings?". On "no" → exit 4. On "yes" → writes config, initializes state, runs build.

File signals override keyword signals when they conflict ([ADR-027](../adrs/ADR-027-init-wizard-smart-suggestion.md)). An existing `package.json` with React dependencies beats idea text mentioning "mobile app."

**Auto mode behavior**:

All wizard questions are skipped. Selections use:
- Methodology: smart suggestion default, or Deep if no signals detected
- Platforms: auto-detected from codebase signals; defaults to `claude-code` if none detected
- Existing config (`--force` without `--confirm-reset`) → exit 1 error

`scaffold init --auto` is the non-interactive initialization path for CI and scripted setups.

**Success output**:

```
✓ Config written to .scaffold/config.yml
✓ Pipeline initialized (36 steps, all pending)
✓ .gitignore updated for Scaffold-managed files
✓ Build complete — Claude Code and Universal artifacts written under .scaffold/generated/

Next step: scaffold run <first-step>
```

In JSON mode, `data` contains `{ mode, methodology, config_path, platforms, project_traits, steps_resolved, build_result }`.

**Error conditions:**

| Error Code | Exit Code | Phase | Trigger | Message |
|------------|-----------|-------|---------|---------|
| `INIT_SCAFFOLD_EXISTS` | 1 | pre-wizard | `.scaffold/config.yml` already exists and `--force` not set | "Project already initialized. Use `--force` to reinitialize." |
| `INIT_METHODOLOGY_NOT_FOUND` | 1 | wizard | `--methodology` value not installed (wizard-phase detection) | "Methodology '<name>' not found. Available: deep, mvp." |
| `FIELD_INVALID_METHODOLOGY` | 1 | config validation | Methodology name fails config schema validation (post-wizard) | "Unknown methodology '<name>'. Run `scaffold list` to see available methodologies." |
| `INIT_NO_PLATFORMS` | 1 | wizard | No platforms selected during wizard multi-select | "At least one target platform must be selected." |
| `FIELD_MISSING` | 1 | config validation | Required config field absent after wizard completes | "Required field 'platforms' is missing from config." |
| `USER_CANCELLED` | 4 | wizard | User declines confirmation prompt | "Initialization cancelled." |
| (any build error) | 5 | build | `scaffold build` auto-run fails | Build errors are displayed; config and state files are already written. Run `scaffold build` after fixing. |

**Side effects**:
- Creates `.scaffold/config.yml` (wizard output)
- Creates `.scaffold/state.json` (all steps `pending`; v1 migration pre-completes matched steps)
- Creates `.scaffold/decisions.jsonl` (empty for greenfield/brownfield; may be pre-populated for v1 migration)
- Creates `.scaffold/instructions/` directory for user instruction files ([ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md))
- Invokes full `scaffold build` pipeline (creates/updates the managed `.gitignore` block and writes hidden adapter artifacts under `.scaffold/generated/`)

**Examples**:

```bash
# Interactive wizard with idea text
scaffold init "I want to build a REST API with Node.js and PostgreSQL"

# Non-interactive with preset methodology
scaffold init --auto --methodology deep

# Re-initialize existing project
scaffold init --force
# In CI: scaffold init --auto --force --confirm-reset
```

---

### `scaffold build [flags]`

**Purpose**: Generate thin platform adapter artifacts from the meta-prompt inventory. Each artifact points back to `scaffold run <step>`; prompt content resolution does not happen at build time. Idempotent and deterministic.
**Category**: build-time
**Lock behavior**: Read-only (no lock)
**Requires project**: Yes

**Arguments:** None

**Command-specific flags:** None beyond global flags.

**Interactive behavior**:

No interactive prompts. `scaffold build` is a deterministic transformation and requires no user decisions.

**Verbose mode** adds: methodology resolution path, each step's meta-prompt location, dependency graph edges, topological sort order, per-adapter file counts.

**Auto mode behavior**:

Same as interactive — no decisions to resolve. `--auto` has no behavioral effect on `scaffold build`.

**Success output**:

```
✓ Config valid (methodology: deep)
✓ 36 steps in pipeline (2 optional excluded: design-system, add-maestro)
✓ Dependency graph: 34 nodes, 31 edges, no cycles
✓ .gitignore updated for Scaffold-managed files
✓ Claude Code: 15 wrappers written to .scaffold/generated/claude-code/commands/
✓ Codex: guide updated at .scaffold/generated/codex/AGENTS.md
✓ Universal: reference updated at .scaffold/generated/universal/prompts/README.md
Build complete in 0.3s
```

In JSON mode, `data` contains `{ methodology, steps_total, steps_excluded, platforms, dependency_graph }` with optional `steps_added`, `steps_removed`.

**Error conditions** (accumulate; all reported before exit):

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `CONFIG_NOT_FOUND` | 1 | `.scaffold/config.yml` missing | "Config file not found. Run `scaffold init` first." |
| `CONFIG_PARSE_ERROR` | 1 | YAML syntax error in config | "YAML parse error in .scaffold/config.yml:<line>: <detail>" |
| `FIELD_INVALID_METHODOLOGY` | 1 | Methodology not installed | "Unknown methodology '<name>'. Run `scaffold list`." |

> **Note**: `FIELD_*` codes are canonical (see [config-yml-schema.md](../data/config-yml-schema.md)). `CONFIG_INVALID_METHODOLOGY` exists as a backward-compatible alias.

| `RESOLUTION_FILE_MISSING` | 1 | Meta-prompt file referenced in manifest not found | "Meta-prompt file missing: <path>" |
| `RESOLUTION_DUPLICATE_SLUG` | 1 | Two steps resolve to same slug | "Duplicate step slug '<slug>'." |
| `DEP_CYCLE_DETECTED` | 1 | Circular dependency in step graph | "Dependency cycle detected: <slug> → ... → <slug>" |
| `OUTPUT_WRITE_FAILED` | 5 | Cannot write output file | "Write failed: <path> — <os-error>" |
| `ADAPTER_INIT_FAILED` | 5 | Adapter initialization error | "Adapter '<name>' failed to initialize: <detail>" |
| (unknown fields) | 0 (warning) | Unknown keys in config, frontmatter, or manifest ([ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md)) | "warning: unknown field '<field>' in <file> (possible typo, or from a newer scaffold version)" |

**Side effects**:
- Creates or updates a managed `.gitignore` block for `.scaffold/generated/`, `.scaffold/lock.json`, `.scaffold/*.tmp`, and `.scaffold/**/*.tmp`
- Warns if user-owned `.gitignore` rules such as `.scaffold/` or `.scaffold/*` would hide committed Scaffold state
- Writes `.scaffold/generated/claude-code/commands/<step-slug>.md` for each step (Claude Code adapter; if `claude-code` in platforms)
- Writes `.scaffold/generated/codex/AGENTS.md` (Codex adapter; if `codex` in platforms)
- Writes `.scaffold/generated/universal/prompts/README.md` (Universal adapter; always generated)
- Warns if legacy root-level generated output still exists (`commands/`, `prompts/`, `codex-prompts/`, or a Scaffold-generated root `AGENTS.md`)
- Does NOT write root `commands/`, `AGENTS.md`, `prompts/`, or `codex-prompts/`
- Does NOT modify `.scaffold/state.json` or `.scaffold/decisions.jsonl`

**Examples**:

```bash
# Standard build
scaffold build

# Build with JSON output for CI
scaffold build --format json | jq '.data.steps_resolved'
```

---

### `scaffold adopt [flags]`

**Purpose**: Scan an existing codebase, map discovered files to scaffold step `produces` fields, and generate `.scaffold/state.json` with pre-completed entries. Distinct from `scaffold init` — adopt is purely analytical and does not run the wizard.
**Category**: init
**Lock behavior**: Acquires lock (writes state.json)
**Requires project**: Partial — requires `.scaffold/config.yml` to exist (for methodology and step resolution). Creates `.scaffold/state.json` and `.scaffold/decisions.jsonl`. If no config exists, use `scaffold init` instead, which includes brownfield detection.

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--dry-run` | boolean | false | Run the scan and show what would be pre-completed, but do not write `state.json`. |
| `--force` | boolean | false | Overwrite existing `state.json` if present. Without this flag, adopt fails if `state.json` already exists. |

**Interactive behavior**:

For each artifact discovered with a partial match (file exists but fails artifact-schema validation), adopt presents:
- The file path and the step it maps to
- A choice: "Mark as completed" / "Mark as pending" / "Skip this artifact"

For exact matches, adopt auto-completes without asking.

For v1 tracking comments detected during scan, adopt presents a confirmation: "Found v1 artifacts. Pre-complete <N> steps from v1 history?"

**Auto mode behavior**:

- Exact matches: auto-completed.
- Partial matches (file present but content incomplete): auto-marked `completed` with warning `PSM_ZERO_BYTE_ARTIFACT` or `VALIDATE_ARTIFACT_MISSING_SECTION` logged.
- No prompts shown; tooling inference is applied automatically.

**Error handling**: Fail-fast. Adopt aborts on the first structural error encountered during artifact scanning. Detection-level issues (e.g., ambiguous matches) are accumulated and presented as a summary before confirmation.

**Success output**:

```
Scanning codebase...
✓ Found 8 matching artifacts:
  completed: create-prd → docs/plan.md
  completed: tech-stack → docs/tech-stack.md
  completed: coding-standards → docs/coding-standards.md
  completed: tdd-standards → docs/tdd-standards.md
  completed: project-structure → docs/project-structure.md
  completed: dev-env-setup → docs/dev-env-setup.md
  pending:   git-workflow (docs/git-workflow.md not found)
  pending:   user-stories (docs/user-stories.md not found)

✓ state.json written — 6 pre-completed, 17 pending
```

In JSON mode, `data` contains `{ mode, artifacts_found, detected_artifacts, steps_completed, steps_remaining }` with optional `methodology`, `config_path`, `build_result`.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `CONFIG_NOT_FOUND` | 1 | Config missing | "No config found. Run `scaffold init` first, then use `scaffold adopt` to scan existing artifacts." |
| `STATE_PARSE_ERROR` | 3 | Existing state.json corrupt | "Existing state.json is corrupt. Use `--force` to overwrite." |
| `LOCK_HELD` | 3 | Lock held (in `--auto`) | "Lock held by <holder>. Use `--force` to override." |
| `USER_CANCELLED` | 4 | User cancels during partial match review | "Adopt cancelled." |

**Side effects**:
- Writes `.scaffold/state.json` with pre-completed step entries
- Optionally updates `.scaffold/config.yml` based on inferred tooling (only if user confirms or in `--auto` mode)
- Acquires and releases `.scaffold/lock.json`
- Does NOT run `scaffold build` (unlike `scaffold init`)

**Examples**:

```bash
# Scan existing codebase
scaffold adopt

# Preview without writing
scaffold adopt --dry-run

# Overwrite existing state
scaffold adopt --force
```

---

### `scaffold run <step> [flags]`

**Purpose**: Assemble and execute a pipeline step. Loads the step's meta-prompt, gathers knowledge base entries and project context, constructs the assembled prompt, and outputs it for AI execution. Tracks state before and after, and handles crash recovery. This is the PRIMARY command for pipeline execution.
**Category**: runtime
**Lock behavior**: Acquires lock
**Requires project**: Yes

**Arguments:**

| Argument | Required | Type | Description |
|----------|----------|------|-------------|
| `step` | Yes | string | Slug of the pipeline step to execute. Must exist in the resolved pipeline. |

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--instructions <text>` | string | (none) | Inline user instructions for this invocation. Appended as the highest-priority layer in the instruction hierarchy (global < per-step < inline per [ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md)). Ephemeral — not persisted. |
| `--depth <level>` | integer | (from config) | Override depth for this invocation. Must be 1-5 ([ADR-043](../adrs/ADR-043-depth-scale.md)). Takes highest precedence in the depth resolution chain (CLI flag > custom per-step > preset default > built-in). Ephemeral — not persisted to config. |
| `--force` | boolean | false | Override lock contention. Clears a held lock and proceeds. |

**Assembly sequence** (per PRD Section 9, [ADR-044](../adrs/ADR-044-runtime-prompt-generation.md)):

1. **Load meta-prompt**: Read `pipeline/<step>.md` — the step's purpose, inputs, outputs, quality criteria, methodology scaling rules.
2. **Check prerequisites**: Pipeline state (already completed? offer re-run in update mode), dependencies (all prior steps completed?), lock (another step running?).
3. **Load knowledge base entries**: Read files listed in the meta-prompt's `knowledge-base` frontmatter field.
4. **Gather project context**: Completed artifacts, `.scaffold/config.yml`, `.scaffold/state.json`, `.scaffold/decisions.jsonl`.
5. **Load user instructions**: Global (`.scaffold/instructions/global.md`), per-step (`.scaffold/instructions/<step>.md`), inline (`--instructions` flag).
6. **Determine depth**: Look up the step's depth level from methodology config.
7. **Construct assembled prompt**: Build the 7-section prompt structure (system, meta-prompt, knowledge base, context, methodology, instructions, execution instruction).
8. **AI generates and executes**: The AI reads the assembled prompt, generates a working prompt tailored to the project, and executes it.
9. **Update state**: Mark step completed in `state.json`. Record decisions in `decisions.jsonl`. Show next available step(s).

**Interactive behavior**:

1. **Lock check**: If lock held by live process → offer "Wait / Force / Cancel". Force clears lock and proceeds. Cancel → exit 4.
2. **Crash recovery** (if `in_progress` is non-null in state.json):
   - All `produces` artifacts present → auto-marks completed, continues.
   - No artifacts → presents "Re-run <step> / Mark as completed / Cancel".
   - Partial artifacts → presents "Re-run <step> (safer) / Accept partial output / Cancel".
   - Note: Zero-byte artifact files are treated as 'present' for crash recovery purposes but produce a `PSM_ZERO_BYTE_ARTIFACT` warning.
3. **Prerequisite check**: Verifies predecessor `produces` artifacts exist on disk. If missing → offers "Run prerequisite first / Proceed anyway / Cancel".
4. **Update mode** ([ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md)): If the step is already `completed`, the assembled prompt includes existing artifacts as additional context, and the meta-prompt's Mode Detection section instructs the AI to diff and propose targeted updates rather than regenerating from scratch.
5. **Methodology change check** ([ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)): If the methodology has changed since the last step was executed, emits a warning listing completed steps that were executed under the previous methodology. Pending steps are resolved under the new methodology; completed steps are preserved as-is.
6. **Depth downgrade check** ([ADR-051](../adrs/ADR-051-depth-downgrade-policy.md)): If the step was previously completed at a higher depth than the current effective depth (e.g., completed at depth 5, current config depth is 1), the CLI prompts: `"Step '<step>' was completed at depth {previous}. Current depth is {current}. Re-run at lower depth? [y/N]"`. Declining aborts (exit 0). In `--auto` mode, emits `DEPTH_DOWNGRADE` warning and proceeds. In `--force` mode, proceeds without prompt or warning. Depth upgrades (re-running at higher depth) proceed without confirmation in all modes.
7. **Execution**: Sets `in_progress` in state.json, outputs assembled prompt content to stdout for agent consumption.
8. **Completion gate**: After outputting the assembled prompt, scaffold blocks and waits for the agent to finish. In interactive mode, scaffold presents a completion confirmation: `"Step '<step>' complete? [Y/n/skip]"`. Answering `Y` (default) triggers post-completion processing. Answering `n` returns to the prompt output (re-display for copy-paste). Answering `skip` marks the step as skipped. In `--auto` mode, scaffold exits immediately after outputting the prompt (exit 0) — the step remains `in_progress`. On the next `scaffold run` invocation, crash recovery ([ADR-018](../adrs/ADR-018-completion-detection-crash-recovery.md)) detects the `in_progress` record and checks artifacts to determine completion. This makes crash recovery the primary completion mechanism in `--auto` mode.
9. **Post-completion**: Marks `completed` with depth level recorded, clears `in_progress`, appends decisions to `decisions.jsonl`, fills CLAUDE.md section if applicable, releases lock.
10. **Downstream warning** (for re-runs on completed steps): Emits warning listing all downstream steps that may be stale, with suggested `scaffold run <slug>` commands ([ADR-034](../adrs/ADR-034-rerun-no-cascade.md)).

Steps execute sequentially — at most one step at a time ([ADR-021](../adrs/ADR-021-sequential-prompt-execution.md)). Even in `--auto` mode, the user must have initiated `scaffold run`; the CLI does not self-invoke.

**Auto mode behavior**:

- Lock held → exit 3 (does not auto-force).
- Crash recovery:
  - All artifacts present → auto-complete, continue.
  - No artifacts → re-run without asking.
  - Partial artifacts → re-run (safer default) with warning.
- Missing prerequisites → exit 2 (`DEPENDENCY_UNMET`); does not proceed. Auto mode does not automatically execute prerequisite steps. Missing prerequisites produce exit 2 (`DEPENDENCY_UNMET`). This is the safe default for unattended operation per [ADR-021](../adrs/ADR-021-sequential-prompt-execution.md).
- Already-completed step → proceeds without confirmation (update mode).
- Depth downgrade → emits `DEPTH_DOWNGRADE` warning, proceeds without prompting.
- Completion gate → exits immediately after prompt output. Step remains `in_progress`. Next invocation triggers crash recovery for artifact-based completion detection.

**Success output**:

The primary output is the assembled prompt content itself on stdout:

```
=== Scaffold Session Context ===
Pipeline: deep | Progress: 3/22 complete (14%) | Step: user-stories
Methodology depth: comprehensive
Recent decisions:
  D-001: Using PostgreSQL for primary storage (tech-stack)
  D-002: REST API with OpenAPI spec (tech-stack)
================================

[Assembled prompt content for user-stories follows...]
```

After the agent completes and the user confirms completion:
```
✓ user-stories marked completed
→ Next eligible: user-stories-gaps
  Run: scaffold run user-stories-gaps
```

In JSON mode, `data` contains `{ step, methodology, depth, depth_source, update_mode, pipeline_progress, outputs_produced, next_eligible }` with optional `instructions_loaded` (layers of instructions applied per [ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md)) and `auto_decisions` (present in `--auto` mode). `depth` is integer 1-5 ([ADR-043](../adrs/ADR-043-depth-scale.md)); `depth_source` is one of `"cli-flag"`, `"custom-override"`, `"preset-default"`, `"built-in-default"` indicating which precedence layer determined the effective depth; `update_mode` is boolean ([ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md)).

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `LOCK_HELD` | 3 | Lock held in `--auto` without `--force` | "Lock held by <holder> (PID <pid>). Use `--force` to override, or wait for the other process to finish." |
| `STATE_PARSE_ERROR` | 3 | `state.json` unreadable | "state.json is corrupt: <detail>. Run `scaffold validate` for diagnostics." |
| `STATE_CORRUPTED` | 3 | state.json internally inconsistent | "state.json is internally inconsistent. Run `scaffold validate --fix`." |
| `STATE_VERSION_MISMATCH` | 3 | state.json schema version mismatch | "state.json was written by a different scaffold version. Run `scaffold build` to reinitialize." |
| `DEP_TARGET_MISSING` | 2 | Step slug not in resolved pipeline | "Unknown step slug '<slug>'. Run `scaffold status` to see valid slugs." |
| `DEPENDENCY_MISSING_ARTIFACT` | 2 | Prerequisite artifact not found (in `--auto`) | "Prerequisite not satisfied: '<predecessor>' must complete first (artifact missing: <path>)." |
| `DEPENDENCY_UNMET` | 2 | Predecessor step not completed (in `--auto`) | "Prerequisite not satisfied: '<predecessor>' has not been completed or skipped." |
| `PSM_ALREADY_IN_PROGRESS` | 3 | Another step is `in_progress` | "Another step is already in progress: <slug>. Check for a crashed session." |
| `ASSEMBLY_FAILED` | 5 | Assembly engine error (meta-prompt missing, knowledge base missing) | "Assembly failed for step '<slug>': <detail>" |
| `USER_CANCELLED` | 4 | User cancels at any confirmation point | "Cancelled." |
| `DEPTH_DOWNGRADE` | 0 (warning) | Step re-run at lower depth than original execution | "Step '<step>' was completed at depth {previous}. Re-running at depth {current}." |

**Side effects**:
- Acquires `.scaffold/lock.json`
- Sets `in_progress` in `.scaffold/state.json`
- Outputs assembled prompt content to stdout (the agent execution boundary — scaffold has no visibility into agent execution)
- After agent completion: marks step `completed` in `.scaffold/state.json` (atomic write)
- Appends 1–3 decision entries to `.scaffold/decisions.jsonl`
- Updates `CLAUDE.md` managed section if the step owns one
- Releases `.scaffold/lock.json`

**Examples**:

```bash
# Run a specific pipeline step
scaffold run create-prd

# Run with inline instructions
scaffold run tech-stack --instructions "Focus on serverless architecture"

# Non-interactive CI execution (fails on lock contention)
scaffold run create-prd --auto --format json

# Force-override stale lock
scaffold run user-stories --force
```

---

### `scaffold skip <step> [flags]`

**Purpose**: Mark a step as skipped. The step is treated as resolved for dependency computation — its dependents become eligible. Skipped steps remain in `state.json` with `status: skipped` ([ADR-020](../adrs/ADR-020-skip-vs-exclude-semantics.md)).
**Category**: runtime
**Lock behavior**: Acquires lock
**Requires project**: Yes

**Arguments:**

| Argument | Required | Type | Description |
|----------|----------|------|-------------|
| `step` | Yes | string | Slug of the step to skip. Must exist in the resolved pipeline (in `state.json`). |

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--reason <text>` | string | (empty) | Reason for skipping. Stored in `state.json` entry's `skip_reason` field. Optional but recommended for team visibility. |
| `--force` | boolean | false | Override lock contention. |

**Interactive behavior**:

Presents confirmation: "Skip '<step>'? This will unblock dependent steps." with optional reason input if `--reason` not provided. On "no" → exit 4.

If the step is already `completed`, presents: "Step '<step>' is already completed. Re-mark as skipped? (Note: dependent steps may have been run with its artifacts.)" This is an unusual workflow — warn but allow.

If the step is `in_progress`, warns that a session may be actively executing it.

**Auto mode behavior**:

- Proceeds without confirmation (skipping is reversible — the step can be re-run via `scaffold run <slug>`).
- If `--reason` not provided, `skip_reason` is set to `"auto-skipped"`.
- If step is `in_progress` → emits warning and proceeds (does not block).

**Success output**:

```
✓ add-playwright skipped
  Reason: "Using Cypress instead"
→ 2 steps now unblocked: coding-standards, tdd-standards
```

In JSON mode, `data` contains `{ step, reason, newly_eligible }` with optional `previous_status`.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `DEP_TARGET_MISSING` | 2 | Step slug not in state.json | "Unknown step '<slug>'. Run `scaffold status` to see valid slugs." |
| `PSM_INVALID_TRANSITION` | 3 | Step already completed | "Step already completed — use `--force` to re-skip." |
| `LOCK_HELD` | 3 | Lock held in `--auto` | "Lock held by <holder>. Use `--force` to override." |
| `STATE_PARSE_ERROR` | 3 | state.json corrupt | "state.json is corrupt. Run `scaffold validate`." |
| `USER_CANCELLED` | 4 | User declines confirmation | "Skip cancelled." |

**Side effects**:
- Acquires `.scaffold/lock.json`
- Updates step entry in `.scaffold/state.json` to `status: skipped`, sets `skip_reason` and `skipped_at` timestamp
- Updates `next_eligible` cache in state.json
- Releases `.scaffold/lock.json`

**Examples**:

```bash
# Skip a step with a reason
scaffold skip add-playwright --reason "Using Cypress instead"

# Skip without confirmation (auto mode)
scaffold skip design-system --auto --reason "No frontend"

# Skip in CI with JSON output
scaffold skip multi-model-review --auto --format json
```

---

### `scaffold reset [flags]`

**Purpose**: Delete `state.json` and `decisions.jsonl`, resetting all pipeline progress. Preserves `config.yml`, `CLAUDE.md`, build outputs, and all produced artifacts.
**Category**: runtime
**Lock behavior**: Acquires lock
**Requires project**: Yes

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--confirm-reset` | boolean | false | Required in `--auto` mode to confirm the destructive operation. In interactive mode, substitutes for the "are you sure?" prompt. |
| `--force` | boolean | false | Override lock contention. |

**Interactive behavior**:

Always presents a confirmation prompt: "Reset all pipeline progress? This deletes state.json and decisions.jsonl. Config, CLAUDE.md, and produced artifacts are preserved. This cannot be undone (except via git). Continue? [y/N]"

On "no" → exit 4. On "yes" → proceeds with deletion.

**Auto mode behavior**:

- Without `--confirm-reset` → exit 1 error: "Reset is destructive. Use `--auto --confirm-reset` to confirm, or run interactively."
- With `--confirm-reset` → proceeds without asking.
- Lock held without `--force` → exit 3.

**Success output**:

```
✓ .scaffold/state.json deleted
✓ .scaffold/decisions.jsonl deleted
Pipeline reset complete. Run `scaffold init` or `scaffold build` to reinitialize.
```

In JSON mode, `data` contains `{ files_deleted: string[], files_preserved: string[] }`.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `LOCK_HELD` | 3 | Lock held in `--auto` | "Lock held by <holder>. Use `--force` to override." |
| `PSM_WRITE_FAILED` | 3 | Cannot delete state file | "Failed to delete .scaffold/state.json: <os-error>" |
| (missing `--confirm-reset` in auto) | 1 | `--auto` without `--confirm-reset` | "Reset requires explicit confirmation in auto mode. Add `--confirm-reset`." |
| `USER_CANCELLED` | 4 | User declines interactive confirmation | "Reset cancelled." |

**Side effects**:
- Acquires `.scaffold/lock.json`
- Deletes `.scaffold/state.json`
- Deletes `.scaffold/decisions.jsonl`
- Preserves: `.scaffold/config.yml`, `.scaffold/generated/`, `CLAUDE.md`, `AGENTS.md`, and all produced artifacts (e.g., `docs/`)
- Releases `.scaffold/lock.json`

**Examples**:

```bash
# Interactive reset
scaffold reset

# Non-interactive reset (e.g., test cleanup)
scaffold reset --auto --confirm-reset

# Reset with stale lock override
scaffold reset --auto --confirm-reset --force
```

---

### `scaffold status [flags]`

**Purpose**: Show the current pipeline progress — completed, skipped, in-progress, and pending steps organized by phase, with counts and percentages.
**Category**: runtime
**Lock behavior**: Read-only (no lock)
**Requires project**: Yes

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--phase <n>` | integer | (all phases) | Filter output to a specific phase number. |

**Interactive behavior**:

Displays a formatted table grouped by phase. Each row shows: step name, status indicator (✓ completed, ↷ skipped, ⚡ in_progress, ○ pending, ! orphaned), completion timestamp (for completed), skip reason (for skipped). An "Orphaned (methodology changed)" section appears if any state.json entries reference steps no longer in the resolved pipeline.

**Auto mode behavior**:

Same as interactive — no decisions to resolve. Output goes to stderr if `--format json` not set.

**Verbose mode** adds: completion timestamps for all statuses, actor identity, artifact verification status, `next_eligible` cache value.

**Success output**:

```
Pipeline: deep | Methodology: deep | 8/22 complete (36%)

Phase 0 — Prerequisites
  ✓ claude-code-permissions   completed  2026-03-10

Phase 1 — Planning
  ✓ create-prd                completed  2026-03-10
  ✓ review-prd                completed  2026-03-11
  ✓ innovate-prd              completed  2026-03-11
  ✓ tech-stack                completed  2026-03-11
  ○ user-stories              pending
  ○ user-stories-gaps         pending    [blocked by user-stories]

Phase 2 — Architecture
  ○ coding-standards          pending
  ...

Next eligible: user-stories
```

In JSON mode, `data` contains `{ methodology, progress: { completed, skipped, in_progress, pending, total }, phases: [{ name, index, steps: [{ slug, status, source, depth, ... }] }], next_eligible: string[], orphaned_entries: string[] }`. Per-step `depth` (integer 1-5, [ADR-043](../adrs/ADR-043-depth-scale.md)) is present for completed steps.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `STATE_PARSE_ERROR` | 3 | state.json corrupt | "state.json is corrupt. Run `scaffold validate`." |
| `CONFIG_NOT_FOUND` | 1 | Config missing | "Config not found. Run `scaffold init`." |

**Side effects**: None (read-only).

**Examples**:

```bash
# Show full pipeline status
scaffold status

# Show only phase 2
scaffold status --phase 2

# Machine-readable status for CI
scaffold status --format json | jq '.data.completed / .data.total'
```

---

### `scaffold next [flags]`

**Purpose**: Show the next eligible step(s) with full context — phase, dependencies satisfied, and a one-line description. Does not execute anything.
**Category**: runtime
**Lock behavior**: Read-only (no lock)
**Requires project**: Yes

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--count <n>` | integer | 1 | Show up to N next eligible steps (parallel set). |

**Interactive behavior**:

Displays the next eligible step with its description, phase, and which dependencies were just satisfied that made it eligible.

**Auto mode behavior**:

Same output. No decisions.

**Verbose mode** adds: full dependency list for the next step, `produces` artifacts it will generate, `reads` artifacts it consumes, whether the step has a CLAUDE.md section.

**Success output**:

```
Next: user-stories (Phase 1 — Planning)
  Description: Create user stories from the PRD
  Depends on: create-prd ✓, review-prd ✓
  Produces: docs/user-stories.md

Run: scaffold run
```

If pipeline is complete:
```
Pipeline complete. All 36 steps finished.
```

In JSON mode, `data` contains `{ eligible: [{ slug, description, phase, produces, reads, depends_on, source, argument_hint }], pipeline_complete: boolean }`.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `STATE_PARSE_ERROR` | 3 | state.json corrupt | "state.json is corrupt." |
| `CONFIG_NOT_FOUND` | 1 | Config missing | "Config not found. Run `scaffold init`." |

**Side effects**: None (read-only).

**Examples**:

```bash
scaffold next
scaffold next --count 3
scaffold next --format json
```

---

### `scaffold validate [flags]`

**Purpose**: Cross-cutting validation of all scaffold files — config, manifests, step frontmatter, build outputs, state consistency, and artifact schemas. Accumulates all issues and reports them grouped by source file. Read-only; modifies nothing.
**Category**: build-time
**Lock behavior**: Read-only (no lock)
**Requires project**: Yes

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--scope <list>` | string | `config,manifests,frontmatter,artifacts,state` | Comma-separated list of validation scopes to run. Valid values: `config`, `manifests`, `frontmatter`, `artifacts`, `state`, `decisions`. |
| `--fix` | boolean | false | Apply safe auto-fixes where available (e.g., reassign duplicate decision IDs). Does not modify step files or config. **Phase 2.** Implement `scaffold validate` as read-only in Phase 1. The `--fix` flag and auto-fix logic are deferred to Phase 2. |

**Interactive behavior**:

Runs all validation passes, accumulates all errors and warnings, then prints them grouped by source file (errors before warnings per file). Summary line at the end: `N errors, M warnings`. Exits 1 if any errors; exits 0 if only warnings or no issues.

**Auto mode behavior**:

Same as interactive. Output goes to stderr. With `--format json`, errors and warnings appear in the envelope arrays.

**Verbose mode** adds: every file checked (not just files with issues), each validator's pass/fail result per file.

**Validation Checks**:

Checks are organized by category:

- **Config (4 checks):** schema version valid, methodology name installed, platform values valid, required fields present
- **Manifests (4 checks):** manifest loads/parses, all step references resolve to files, no circular dependencies, all dependency targets exist
- **Frontmatter (5 checks):** YAML valid, required fields present (description), reads entries are valid paths, produces entries are valid, depends_on slugs exist in pipeline
- **Artifacts (5 checks):** required sections present, ID format patterns valid, index table present in first 50 lines, tracking comment on line 1, no unresolved markers in content
- **State (5 checks):** schema version matches, all referenced slugs exist in pipeline, completed steps have produces artifacts on disk, completed steps have valid depth (V19 per [state-json-schema](../data/state-json-schema.md)), completed steps have depth within configured range (V20)
- **Decisions (3 checks):** entries parse as valid JSON, IDs sequential and unique, step references exist in pipeline

**Success output** (no issues):

```
✓ Config valid
✓ Methodology manifest valid (deep)
✓ 24 steps — frontmatter valid
✓ 22 build outputs — no unresolved markers
✓ state.json consistent with artifacts on disk
✓ decisions.jsonl — 47 entries, no duplicates

0 errors, 0 warnings
```

**Error output** (issues found):

```
.scaffold/config.yml
  warning: unknown field "extra_settings" (possible typo, or from a newer scaffold version)

content/base/create-prd.md
  error [FRONTMATTER_PRODUCES_MISSING]: Required 'produces' field absent

2 errors, 1 warning
```

In JSON mode, `data` contains `{ valid: boolean, checks: [{ category, name, status, message, details }], summary: { passed, failed, warnings } }`.

**Error conditions** (reported as issues; not command failures):

All error codes from all domain components may appear (see Section 7c of [system-architecture.md](../architecture/system-architecture.md) for the full list). Key codes include:

| Error Code | Category | Description |
|------------|----------|-------------|
| `FIELD_*` | config | Config schema violations (canonical names; `CONFIG_*` aliases exist for backward compatibility) |
| `RESOLUTION_*` | manifests | Step resolution failures |
| `FRONTMATTER_*` | frontmatter | Frontmatter schema violations |
| `DEP_CYCLE_DETECTED` | manifests | Circular dependency |
| `INJ_*` | build outputs | Unresolved markers in build output |
| `VALIDATE_ARTIFACT_*` | artifacts | Artifact structural violations |
| `STATE_*` | state | State consistency failures |
| `VALIDATE_DECISIONS_INVALID` | decisions | Malformed decision entries |
| (warning) `DECISION_UNKNOWN_STEP` | decisions | Decision references unknown step slug |
| (warning) `PSM_ZERO_BYTE_ARTIFACT` | state | Zero-byte artifact file |
| (warning) `DEP_RERUN_STALE_DOWNSTREAM` | state | Re-run may have left downstream stale |

**Side effects**: None unless `--fix` is passed (which may rename decision IDs in `decisions.jsonl`).

**Examples**:

```bash
# Full validation
scaffold validate

# Validate only config and manifests
scaffold validate --scope config,manifests

# Validate and auto-fix safe issues
scaffold validate --fix

# CI: fail on any error
scaffold validate --format json; echo "exit: $?"
```

---

### `scaffold list [flags]`

**Purpose**: Display all available methodologies, platform adapters, and tools. No project required.
**Category**: utility
**Lock behavior**: Read-only (no lock)
**Requires project**: No

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--section <name>` | string | (all) | Show only a specific section. Valid values: `methodologies`, `platforms`, `tools`. |
| `--verbose` | boolean | false | In the `tools` section, adds an Arguments column showing `argument-hint` values. |

**Interactive behavior**:

Displays formatted sections with descriptions for each option. Current project selection is highlighted (if a project exists).

**Auto mode behavior**: Same output.

**Success output**:

```
Methodologies
─────────────
  deep            Full pipeline — comprehensive documentation, parallel agents (36 steps)
  mvp             Streamlined pipeline — fewer phases, lighter process (7 steps)

Platforms
─────────
  claude-code    Generates hidden wrappers in .scaffold/generated/claude-code/commands/
  codex          Generates a hidden guide at .scaffold/generated/codex/AGENTS.md
  (universal)    Generates hidden references in .scaffold/generated/universal/
```

In JSON mode, `data` contains `{ methodologies: [...], platforms: [...], tools: { build: [...], utility: [...] } }`.

**Error conditions:** None (read-only, no project required).

**Side effects**: None.

**Examples**:

```bash
scaffold list
scaffold list --section methodologies
scaffold list --section tools
scaffold list --section tools --verbose
scaffold list --format json
```

---

### `scaffold info [step] [flags]`

**Purpose**: Show project configuration summary, or when a step slug is provided, show step details including meta-prompt content, knowledge base references, and depth level. Replaces the former `scaffold preview` command.
**Category**: utility
**Lock behavior**: Read-only (no lock)
**Requires project**: Yes

**Arguments:**

| Argument | Required | Type | Description |
|----------|----------|------|-------------|
| `step` | No | string | Step slug. When provided, shows step details (meta-prompt, knowledge base refs, depth). When omitted, shows project configuration summary. |

**Command-specific flags:** None beyond global flags.

**Interactive behavior**: Displays formatted project config summary, or step details when a step slug is provided.

**Auto mode behavior**: Same output.

**Verbose mode** adds: config file path, state.json path, schema version, unknown fields present, stale build warning if config mtime > last build timestamp. For step details: full meta-prompt content, knowledge base file contents.

**Success output** (project info — no step argument):

```
Project: .scaffold/config.yml
  Methodology:       deep
  Platforms:         claude-code, (universal)
  Project traits:    frontend=true, web=true

Pipeline:  24 defined, 22 resolved (2 excluded: design-system, add-maestro)
Progress:  8/22 complete (36%)
Last build: 2026-03-12T14:23:00Z
```

**Success output** (step info — with step argument):

```
Step: tech-stack (Phase 1 — Foundation)
  Description:   Define the technology stack
  Methodology:   deep (depth: comprehensive)
  Produces:      docs/tech-stack.md
  Depends on:    create-prd
  Knowledge base: knowledge/tech-evaluation.md, knowledge/stack-patterns.md
  Status:        completed (2026-03-12T16:30:00Z)
  Instructions:  global.md, tech-stack.md (2 layers loaded)
```

In JSON mode (project info), `data` contains `{ methodology, platforms, project_traits, extra_steps, step_count, config_path, project_root }` with optional `progress`.

In JSON mode (step info), `data` contains `{ step, description, methodology, depth, produces, reads, depends_on, knowledge_base, status, instructions_loaded }`.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `CONFIG_NOT_FOUND` | 1 | Config missing | "Config not found. Run `scaffold init`." |
| `CONFIG_PARSE_ERROR` | 1 | Config unreadable | "Config parse error: <detail>" |
| `STATE_PARSE_ERROR` | 3 | state.json corrupt | "state.json is corrupt. Run `scaffold validate`." |

**Side effects**: None.

**Examples**:

```bash
scaffold info
scaffold info --verbose
scaffold info --format json
```

---

### `scaffold version`

**Purpose**: Show the installed scaffold version and, when network is available, the latest published version.
**Category**: utility
**Lock behavior**: Read-only (no lock)
**Requires project**: No

**Arguments:** None

**Command-specific flags:** None beyond global flags.

**Success output**:

```
scaffold v2.0.0 (installed)
scaffold v2.1.0 available — run `scaffold update` to upgrade
```

If no network (offline): shows installed version only, no "available" line.

In JSON mode, `data` contains `{ version: string, node_version: string, platform: string, latest_version: string | null, update_available: boolean | null }`.

**Error conditions:** None (always exits 0).

**Side effects**: None (network check is best-effort; failure is silent).

**Examples**:

```bash
scaffold version
scaffold --version   # Global flag alias
scaffold version --format json
```

---

### `scaffold update [flags]`

**Purpose**: Pull the latest scaffold version (via npm/Homebrew), then re-run `scaffold build` in the current project if a project is detected.
**Category**: utility
**Lock behavior**: Read-only (no lock; build is read-only for locking)
**Requires project**: No (but will rebuild if project present)

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--skip-build` | boolean | false | Update the CLI without rebuilding the current project. |
| `--check-only` | boolean | false | Show available update without applying it. Exits 0 with update info in JSON mode. |

**Interactive behavior**:

Shows current and target versions. Confirms: "Update scaffold from v2.0.0 to v2.1.0? [Y/n]"

If a project is detected and methodology or schema changes are present in the new version, warns: "This update includes methodology changes. Your build outputs will be regenerated. Commit your current state first."

**Auto mode behavior**:

Proceeds without confirmation. Runs build if project present (unless `--skip-build`).

**Success output**:

```
✓ scaffold updated: v2.0.0 → v2.1.0
✓ Rebuilt project (deep, 36 steps)
```

In JSON mode, `data` contains `{ current_version, latest_version, updated }` with optional `changelog`, `rebuild_result`.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| (npm/Homebrew error) | 1 | Update manager failure | "Update failed: <manager-error>" |
| `USER_CANCELLED` | 4 | User declines | "Update cancelled." |
| (any build error after update) | 5 | Build fails after update | Build errors reported; CLI is updated but build outputs are stale. Run `scaffold build` manually. |

**Side effects**:
- Invokes npm or Homebrew to update the `scaffold` package
- If project present and not `--skip-build`: invokes `scaffold build`

**Examples**:

```bash
scaffold update
scaffold update --skip-build
scaffold update --auto
```

---

### `scaffold dashboard [flags]`

**Purpose**: Generate a self-contained HTML dashboard showing pipeline progress, phase status, step details, and decision log. Opens in the default browser unless `--no-open` is specified.
**Category**: utility
**Lock behavior**: Read-only (no lock)
**Requires project**: Yes

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--no-open` | boolean | false | Generate the HTML file without opening it in the browser. |
| `--output <file>` | string | `.scaffold/dashboard.html` | Path for the generated HTML file. |
| `--json-only` | boolean | false | Skip HTML generation; output the dashboard data as JSON only (implies `--format json`). |

**Interactive behavior**:

Generates the HTML file, prints the file path, then opens in the default browser (unless `--no-open`).

**Auto mode behavior**:

Generates the HTML file but does not open the browser (browser launch is interactive). Prints the file path.

**Success output**:

```
✓ Dashboard generated: .scaffold/dashboard.html
Opening in browser...
```

With `--no-open`:
```
✓ Dashboard generated: .scaffold/dashboard.html
```

In JSON mode (or `--json-only`), `data` contains `{ methodology, progress: { completed, skipped, pending, total }, phases: [{ name, index, steps: [{ slug, status, description }] }], generated_at, output_path }` with optional `decisions` (array of recent decision entries) and `opened` (boolean).

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `STATE_PARSE_ERROR` | 3 | state.json corrupt | "state.json is corrupt." |
| `CONFIG_NOT_FOUND` | 1 | Config missing | "Config not found." |
| `OUTPUT_WRITE_FAILED` | 5 | Cannot write HTML file | "Dashboard write failed: <path>" |

**Side effects**:
- Writes `<output>` HTML file (default: `.scaffold/dashboard.html`)
- May launch browser process (platform-dependent; failure is non-fatal and printed as warning)

**Examples**:

```bash
scaffold dashboard
scaffold dashboard --no-open --output /tmp/pipeline-status.html
scaffold dashboard --json-only --format json | jq '.data.progress'
```

---

### `scaffold decisions [--step <slug>] [--last <n>] [flags]`

**Purpose**: Query the decision log.
**Category**: Utility (read-only)
**Requires project**: Yes
**Lock behavior**: None (read-only, no state modification)

**Arguments:** None

**Command-specific flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--step <slug>` | string | (all) | Filter decisions by step slug. |
| `--last <n>` | integer | (all) | Show last N entries. |

**Interactive behavior**: Displays decision entries in reverse chronological order. Each entry shows step slug, timestamp, decision text, and actor.

**Auto mode**: Same as interactive — read-only commands have no decisions to make.

**Success output**: Lists decision entries. In JSON mode, `data` contains `{ decisions, total }` where `decisions` is an array of `{ id, step, timestamp, decision, actor }` with optional `context`.

**Error conditions:**

| Error Code | Exit Code | Trigger | Message |
|------------|-----------|---------|---------|
| `CONFIG_NOT_FOUND` | 1 | No `.scaffold/` directory | "Config not found. Run `scaffold init`." |
| `STATE_PARSE_ERROR` | 3 | `decisions.jsonl` malformed | "decisions.jsonl is malformed. Run `scaffold validate`." |
| `DEP_TARGET_MISSING` | 2 | `--step` slug doesn't exist in pipeline | "Unknown step '<slug>'. Run `scaffold status` to see valid slugs." |

**Side effects**: None (read-only).

**Examples:**

```bash
# Show all decisions
scaffold decisions

# Show decisions for a specific step
scaffold decisions --step tech-stack

# Show last 5 decisions as JSON
scaffold decisions --last 5 --format json
```

---

## Section 2b: Operational Patterns

### Multi-Agent Execution

Scaffold supports parallel execution via git worktrees ([system-architecture.md §6b](../architecture/system-architecture.md)). Each worktree has an independent `.scaffold/` directory. Setup is manual:

```bash
git worktree add ../project-agent-1 -b agent-1
cd ../project-agent-1 && scaffold status
```

There is no `scaffold worktree` command — standard git worktree tooling is sufficient. Step coordination (preventing two agents from working on the same step) is the user's responsibility; `scaffold next` shows eligible steps but does not claim them.

### CI/CD Pipeline Execution

For automated pipelines, loop `scaffold next` and `scaffold run` with `--auto --format json`:

```bash
while step=$(scaffold next --format json | jq -r '.data.eligible[0].name // empty'); do
  scaffold run "$step" --auto --format json || exit $?
done
```

In `--auto` mode, `scaffold run` exits immediately after outputting the assembled prompt (step remains `in_progress`). Completion is detected via crash recovery on the next invocation. See `scaffold run` [completion gate](#scaffold-run-step-flags) for details.

---

## Section 3: Command Dependency Matrix

This table shows which commands internally invoke other commands (as function calls, not subprocess spawns) and which other commands a user is expected to run in sequence.

| Command | Internally Invokes | Typically Followed By |
|---------|-------------------|----------------------|
| `scaffold init` | `scaffold build` (auto, after config written) | `scaffold run <step>` |
| `scaffold run` | (none; assembles and outputs prompt for external agent) | `scaffold run <next-step>` or `scaffold status` |
| `scaffold build` | (none; generates thin wrappers) | `scaffold run <step>` |
| `scaffold adopt` | (none; writes state only) | `scaffold build` (if build outputs stale), then `scaffold run <step>` |
| `scaffold skip` | (none) | `scaffold run <next-step>` |
| `scaffold reset` | (none; deletes state) | `scaffold build` (rebuild outputs if needed), then `scaffold run <step>` |
| `scaffold status` | (none; read-only) | `scaffold run <step>` |
| `scaffold next` | (none; read-only) | `scaffold run <step>` |
| `scaffold validate` | (none; read-only) | Fix issues, then `scaffold build` |
| `scaffold list` | (none) | `scaffold init` |
| `scaffold info` | (none; read-only) | `scaffold run <step>` |
| `scaffold version` | (none) | `scaffold update` |
| `scaffold update` | `scaffold build` (if project present; skippable with `--skip-build`) | `scaffold run <step>` |
| `scaffold dashboard` | (none; read-only) | `scaffold run <step>` |
| `scaffold decisions` | (none; read-only) | `scaffold run <step>` |

**Notes:**

- `scaffold init` calls `scaffold build` as an internal function call after writing the config — the build is part of init's atomicity, not a separate subprocess.
- `scaffold update` calls `scaffold build` as a best-effort rebuild after updating the CLI binary — failure is non-fatal.
- No command requires another command to have been run as a prerequisite within the same process. Prerequisites are enforced by file existence checks (`config.yml` required for build, `state.json` required for runtime commands).

---

## Section 4: Flag Interaction Rules

### 4a: --auto and --force

These flags are orthogonal and independent ([ADR-036](../adrs/ADR-036-auto-does-not-imply-force.md)):

- `--auto` alone: Suppresses interactive prompts; uses safe defaults; **fails** on lock contention (exit 3); **fails** on destructive operations without `--confirm-reset` (exit 1).
- `--force` alone: Overrides lock contention; works in both interactive and non-interactive contexts.
- `--auto --force` (combined): Suppresses prompts AND overrides lock contention. This is the combination for CI pipelines that need to run even when another process may be executing. Still does **not** override reset/overwrite protections.
- `--auto --force --confirm-reset` (combined): Full unattended destructive operation. Required for `scaffold reset` or `scaffold init --force` in CI.

```bash
# CI-safe: fails if lock held
scaffold run <step> --auto --format json

# CI-aggressive: overrides lock (use with caution)
scaffold run <step> --auto --force --format json

# Destroy state in CI (test cleanup)
scaffold reset --auto --confirm-reset --force
```

### 4b: --auto and --confirm-reset

`--confirm-reset` is required in addition to `--auto` for destructive operations:

| Command | `--auto` alone | `--auto --confirm-reset` |
|---------|----------------|--------------------------|
| `scaffold reset` | Exit 1 (requires explicit confirmation) | Proceeds |
| `scaffold init --force` | Exit 1 (overwriting existing config) | Proceeds |
| `scaffold init` (no existing config) | Proceeds | Not needed |
| `scaffold skip` | Proceeds (reversible) | Not needed |
| `scaffold run <step>` | Proceeds (no destruction) | Not needed |

### 4c: --format json and interactive commands

Commands that present interactive prompts (confirmation, selection, crash recovery) require `--auto` or explicit flag confirmation when `--format json` is set:

- `scaffold run <step> --format json` without `--auto`: Exits 4 if an interactive decision is required (crash recovery, prerequisite prompt, lock confirmation).
- `scaffold run <step> --format json --auto`: Resolves all decisions automatically; emits structured JSON envelope.
- `scaffold init --format json` without `--auto`: Exits 4 immediately (wizard requires interaction).

The principle: JSON mode expects no stdin. Any command that might block on stdin in JSON mode exits 4 unless `--auto` resolves the interaction.

### 4d: --format json and --verbose

When both are set, verbose diagnostics appear in the JSON envelope under `"verbose": [...]`. Each entry is `{ level: "debug" | "info", component: string, message: string, data?: object }`. This allows consumers to inspect the resolution trace without parsing human-readable stderr.

```json
{
  "success": true,
  "command": "build",
  "data": { ... },
  "errors": [],
  "warnings": [],
  "verbose": [
    { "level": "debug", "component": "MetaPromptLoader", "message": "Loaded meta-prompt for create-prd from pipeline/" },
    { "level": "debug", "component": "AssemblyEngine", "message": "Assembled prompt for create-prd (depth: comprehensive, 3 knowledge base entries)" }
  ],
  "exit_code": 0
}
```

### 4e: --force and read-only commands

`--force` has no effect on read-only commands (`status`, `next`, `validate`, `dashboard`, `list`, `info`, `version`). These commands never acquire the lock, so there is nothing to force. Passing `--force` to a read-only command is accepted silently (not an error).

### 4f: Reserved for future use

The `--allow-unresolved-markers` flag from the original v2 spec has been removed. Mixin injection is eliminated per meta-prompt architecture (ADR-041).

### 4g: Command-specific confirmation flags

`--confirm-reset` is scoped to destructive reset and reinit operations only. It is **not** a general "skip all confirmations" flag. Commands that require `--confirm-reset`:

- `scaffold reset` (in `--auto` mode)
- `scaffold init --force` (in `--auto` mode — overwriting existing config)

Commands that `--confirm-reset` does NOT apply to:

- `scaffold skip` — already safe with `--auto` alone (reversible)
- `scaffold run` — no destructive operation
- `scaffold build` — idempotent rewrite of generated files, not state

### 4h: JSON envelope schema

The complete JSON envelope schema for `--format json` output ([ADR-025](../adrs/ADR-025-cli-output-contract.md)):

```typescript
interface OutputEnvelope {
  /** Whether the command completed without errors */
  success: boolean;
  /** Command name (e.g., "build", "resume", "validate") */
  command: string;
  /** Command-specific output data. Shape varies per command (see per-command Success Output sections). */
  data: object;
  /** Accumulated errors. Empty array on success. */
  errors: Array<{
    code: string;        // e.g., "FIELD_INVALID_MIXIN_VALUE"
    message: string;
    file?: string;       // Source file path if applicable
    line?: number;       // Line number if applicable
    suggestion?: string; // "did you mean X?" if fuzzy match available
  }>;
  /** Accumulated warnings. May be non-empty even on success (exit 0). */
  warnings: Array<{
    code: string;
    message: string;
    file?: string;
  }>;
  /** The process exit code. Matches the process's actual exit code. */
  exit_code: number;
  /** Present only when --verbose is set. Diagnostic trace entries. */
  verbose?: Array<{
    level: "debug" | "info";
    component: string;
    message: string;
    data?: object;
  }>;
  /** Scaffold CLI version that produced this output */
  scaffold_version: string;
}
```

Human-readable output for all modes (interactive, auto, and verbose non-JSON messages) is always directed to **stderr**. The JSON envelope is always the **only** content on stdout in `--format json` mode.

---

*Cross-references: [system-architecture.md](../architecture/system-architecture.md) §7 (Error Architecture), [domain-models/09-cli-architecture.md](../domain-models/09-cli-architecture.md) §3–§6, [ADR-025](../adrs/ADR-025-cli-output-contract.md), [ADR-036](../adrs/ADR-036-auto-does-not-imply-force.md), [ADR-040](../adrs/ADR-040-error-handling-philosophy.md), [data/config-yml-schema.md](../data/config-yml-schema.md), [data/state-json-schema.md](../data/state-json-schema.md), [data/lock-json-schema.md](../data/lock-json-schema.md), [data/decisions-jsonl-schema.md](../data/decisions-jsonl-schema.md)*
