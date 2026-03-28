# scaffold rework — Phase-Level Re-execution Command

**Date:** 2026-03-29
**Status:** Draft
**Approach:** Hybrid A+C — Thin CLI planner with persistent rework session

## Summary

A new `scaffold rework` CLI command that lets users re-run all steps within selected phases at a configurable depth. The command creates a persistent execution plan (`.scaffold/rework.json`) that the scaffold-runner skill consumes to drive step-by-step execution. Supports both improving artifact depth and cleaning up messy runs.

## Use Cases

1. **Improve existing artifacts** — Already ran the pipeline at depth 3, want to re-run phases at depth 5 to strengthen artifacts
2. **Clean up a messy run** — Some steps were rushed or done out of order, want to systematically re-do phases

## Command Interface

```
scaffold rework [options]

Phase Selection:
  --phases <list>      Comma-separated phase numbers or ranges (e.g., 1-5, 1,3,5, 1-3,5)
  --through <N>        Shorthand for phases 1 through N
  --exclude <list>     Exclude specific phases from selection

Execution:
  --depth <N>          Override depth for all replayed steps (1-5)
  --fix                Auto-fix issues found in review steps (default: on)
  --no-fix             Disable auto-fix for review steps
  --fresh              Wipe existing artifacts before re-running (default: update mode)
  --auto               Run all steps without pausing between phases

Session:
  --resume             Resume an interrupted rework session
  --clear              Clear an active rework session without executing
  --advance <step>     Mark a step as completed in the rework session (used by runner skill)

Output:
  --format <mode>      Output format: interactive (default), json
  --force              Skip confirmation prompts
```

### Interactive Flow (no flags)

1. Show all 14 phases with step counts and current completion status
2. User selects which phases to include (checklist-style)
3. Confirm selection with summary: "Rework plan created: 23 steps across phases 1-5 at depth 3"
4. Output the rework plan (runner skill reads it to drive execution)

### Scripted Flow (with flags)

```bash
scaffold rework --through 5 --depth 4 --fix --auto
scaffold rework --phases 1,3,5 --exclude 10 --fresh
scaffold rework --resume
```

### Flag Interactions

| Flags | Behavior |
|-------|----------|
| No phase flags | Interactive checklist |
| `--phases 1-5` | Explicit selection, no prompt |
| `--through 5` | Phases 1-5, no prompt |
| `--through 5 --exclude 3` | Phases 1,2,4,5 |
| `--phases 1-3,5` | Mixed range + explicit |
| `--depth N` | Override depth for all steps |
| No `--depth` | Respect project config (per-step > custom default > preset default) |
| `--fix` (default) | Review steps auto-fix artifacts |
| `--no-fix` | Review steps report issues only |
| `--fresh` | Wipe artifacts before re-running |
| No `--fresh` | Update mode (preserve + improve existing artifacts) |
| `--auto` | No pauses between phases |
| No `--auto` | Pause at phase boundaries for review |

## Rework Session (`.scaffold/rework.json`)

### Schema

```jsonc
{
  "schema_version": 1,
  "created": "2026-03-29T10:30:00Z",
  "config": {
    "phases": [1, 2, 3, 4, 5],
    "depth": null,              // null = use project config; number = override
    "fix": true,
    "fresh": false,
    "auto": false
  },
  "steps": [
    {
      "name": "create-prd",
      "phase": 1,
      "status": "pending",       // pending | in_progress | completed | failed | skipped
      "completed_at": null,
      "error": null
    }
    // ... all selected steps in topological execution order
  ],
  "current_step": null,          // step name currently being executed
  "stats": {
    "total": 23,
    "completed": 0,
    "skipped": 0,
    "failed": 0
  }
}
```

### Lifecycle

1. **Create** — `scaffold rework` writes rework.json after phase selection
2. **Read** — Runner skill reads on startup to detect active rework
3. **Advance** — After each step, runner skill calls `scaffold rework --advance <step>` to update session
4. **Resume** — `scaffold rework --resume` reads existing session, continues from first non-completed step
5. **Clear** — `scaffold rework --clear` deletes the file
6. **Conflict** — If rework.json exists when `scaffold rework` is run (without --resume), warn and offer resume or clear

### State Reconciliation

- rework.json tracks rework session progress (which steps to re-run, where we are)
- state.json tracks pipeline state (step completion status, artifacts, depth)
- Both are updated: when a step completes, rework.json advances the cursor AND state.json marks the step completed
- If they disagree (e.g., manual intervention), rework.json is source of truth for the rework session

## Execution Flow

### Step A: Plan Creation (CLI)

1. Parse CLI flags (`--phases`, `--through`, `--exclude`, `--depth`, etc.)
2. If no phase flags: launch interactive phase selector
   - Show all 14 phases with: phase number, display name, step count, completion status
   - User toggles phases on/off, confirms selection
3. Resolve selected phases into ordered step list:
   - Get all steps belonging to selected phases
   - Filter out steps with `conditional: "if-needed"` that have status `skipped` in state.json (they were intentionally excluded during init)
   - Sort by dependency graph (topological order with phase-aligned tiebreaker)
4. Resolve depth: CLI `--depth` flag > project config per-step > project custom default > preset default
5. Check for existing rework.json:
   - If present and no `--resume`: warn, offer resume or clear
   - If present and `--resume`: skip to Phase 2
6. Batch-reset all selected steps in state.json to `pending`
7. If `--fresh`: record which artifacts to wipe (runner skill handles actual deletion)
8. Write `.scaffold/rework.json` with full execution plan
9. Output summary: "Rework plan created: 23 steps across phases 1-5 at depth 3"

### Step B: Step Execution (Runner Skill)

1. Runner skill reads rework.json, finds next pending step
2. Mark step as `in_progress` in rework.json
3. Run the step using existing runner skill workflow:
   - `scaffold run <step>` (handles assembly, update/fresh mode, depth)
   - Preview prompt, surface decision points
   - Execute prompt faithfully
   - For review steps with `fix: true`: additional instruction to apply fixes inline
4. After step completes:
   - `scaffold rework --advance <step>` updates rework.json
   - `scaffold complete <step>` updates state.json
5. Phase boundary check:
   - If `auto: false` and next step is in a different phase: pause
   - Show phase summary (steps completed, artifacts updated)
   - Ask user to continue or stop
6. Repeat until all steps done or user stops

### Step C: Completion

1. Print summary: total steps completed, artifacts updated, fixes applied, failures
2. Delete rework.json (session complete)
3. Show overall pipeline status via `scaffold status`

### Error Handling

- **Step failure:** Mark step as `failed` in rework.json with error message. Continue to next step (default) or stop (`--strict` future enhancement).
- **Context loss:** rework.json persists on disk. `scaffold rework --resume` picks up from first non-completed step.
- **Manual intervention:** If user manually completes/skips a step outside the rework flow, rework.json may be stale. `--advance` and `--resume` reconcile by checking state.json.

## Runner Skill Integration

### Detection

On startup or when the user mentions "rework", the runner skill checks for `.scaffold/rework.json`. If present, it enters rework mode automatically.

### Rework Mode Behavior

1. Read rework.json: show status — "Active rework: 15/23 steps completed, currently in Phase 3"
2. Get next pending step from rework.json
3. Execute using existing runner skill workflow (preview prompt, surface decisions, execute, complete)
4. After completing a step, advance the session via `scaffold rework --advance <step>`
5. At phase boundaries (when `auto` is off): pause, show phase summary, ask to continue
6. For review steps with `fix: true`: inject additional instruction for auto-fix behavior

### New Natural Language Triggers

| User says | Maps to |
|-----------|---------|
| "rework phases 1-5" | `scaffold rework --through 5` |
| "rework everything" | `scaffold rework` (interactive selection) |
| "continue rework" / "resume" | `scaffold rework --resume` |
| "stop rework" | `scaffold rework --clear` |
| "rework status" | Read rework.json, show progress |

### Auto-Fix Prompt Injection

When a review step runs with `fix: true`, the assembly engine injects an additional instruction:

```markdown
## Rework Mode: Auto-Fix Enabled
You are re-running this review step in rework mode. Instead of just listing issues:
1. Read the artifact being reviewed
2. Identify all issues at the current depth level
3. Apply fixes directly to the artifact
4. Summarize what you changed and why
```

This is added to the Instructions section of the assembled prompt.

## Components & File Changes

### New Files

| File | Purpose |
|------|---------|
| `src/cli/commands/rework.ts` | CLI command — phase selection, session management |
| `src/types/rework.ts` | TypeScript interfaces for ReworkSession, ReworkStep, ReworkConfig |
| `src/state/rework-manager.ts` | CRUD operations for rework.json (create, read, advance, clear) |
| `tests/rework.bats` | Bats tests for the rework command |

### Modified Files

| File | Change |
|------|--------|
| `src/cli/index.ts` | Register `rework` command |
| `src/core/assembly/engine.ts` | Accept `reworkMode` flag to inject auto-fix instructions for review steps |
| `skills/scaffold-runner/SKILL.md` | Add rework mode section, natural language triggers, phase boundary behavior |
| `src/state/state-manager.ts` | Add `batchReset(steps: string[])` method for resetting multiple steps atomically |

### Unchanged (Leveraged As-Is)

| Component | How It's Used |
|-----------|---------------|
| Dependency graph (`src/core/dependency/`) | Computes topological order for selected steps |
| Depth resolver (`src/core/assembly/depth-resolver.ts`) | Resolves depth per-step respecting project config |
| Update mode detection (`src/core/assembly/update-mode.ts`) | Handles existing artifact detection for re-runs |
| `scaffold run` command | Executes individual steps (assembly + prompt output) |
| `scaffold complete` command | Marks steps as completed in state.json |

## Testing Strategy

### Unit Tests (bats)

- **Phase selection parsing:** `--phases 1-3,5` resolves to `[1,2,3,5]`; `--through 5` resolves to `[1,2,3,4,5]`; `--exclude 3` removes phase 3
- **Step ordering:** Given selected phases, correct topological order is produced
- **rework.json lifecycle:** Create, read, advance, resume, clear
- **Conflict detection:** Existing rework.json blocks new rework without --force
- **Edge cases:** Empty phase (all steps conditional+skipped), single phase, all phases
- **Batch reset:** Multiple steps reset atomically in state.json

### Integration Tests

- **Full flow:** `scaffold rework --through 3 --auto --format json` on a project with completed phases — verify steps reset, rework.json created, steps correctly ordered
- **Resume:** Create rework, advance halfway, `scaffold rework --resume` picks up at correct step
- **Fresh mode:** `--fresh` flag records artifact wipe intent in rework.json

### Runner Skill Testing

- Verify skill detects active rework.json
- Verify phase boundary pauses work correctly
- Verify `--fix` injects correct prompt modification into assembled prompts

## Open Questions

None — all decisions resolved during brainstorming.
