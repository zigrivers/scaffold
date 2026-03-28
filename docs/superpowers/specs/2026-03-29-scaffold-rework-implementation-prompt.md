# Implementation Prompt: `scaffold rework` Command

Copy everything below the line and paste it as a prompt to Claude Code.

---

## Task

Implement the `scaffold rework` CLI command as specified in `docs/superpowers/specs/2026-03-29-scaffold-rework-command-design.md`. Read that spec first — it is the authoritative source for all behavior. This prompt provides implementation-level guidance on top of the spec.

## Context

This is a new CLI subcommand for the scaffold pipeline tool. It lets users re-run all steps within selected phases — either to improve artifact depth or clean up a messy run. The command creates a persistent execution plan (`.scaffold/rework.json`) that the scaffold-runner skill reads to drive step-by-step execution.

**Approach:** Hybrid — the CLI handles phase selection and session management (planner), the runner skill handles step execution (executor).

## Implementation Order

Follow TDD. For each file below: write failing tests first, then implement until tests pass, then move to the next file.

### Step 1: Types (`src/types/rework.ts`)

Define the TypeScript interfaces for the rework session. Add a re-export in `src/types/index.ts`.

```typescript
// Interfaces needed:
// - ReworkStepStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped'
// - ReworkStep: { name, phase (number), status, completed_at (string|null), error (string|null) }
// - ReworkConfig: { phases (number[]), depth (DepthLevel|null), fix (boolean), fresh (boolean), auto (boolean) }
// - ReworkSession: { schema_version (1), created (ISO string), config, steps (ReworkStep[]), current_step (string|null), stats: { total, completed, skipped, failed } }
```

Use the existing `DepthLevel` type from `src/types/enums.ts`.

### Step 2: Rework Manager (`src/state/rework-manager.ts`)

CRUD operations for `.scaffold/rework.json`. Follow the same patterns as `src/state/state-manager.ts`:
- Use `atomicWriteFile` from `src/utils/fs.js` for writes
- Use `fileExists` from `src/utils/fs.js` for existence checks
- Throw `ScaffoldError` objects (see `src/utils/errors.ts` for the pattern)

```typescript
export class ReworkManager {
  constructor(private projectRoot: string) {}

  /** Check if a rework session exists. */
  hasSession(): boolean

  /** Load and validate rework.json from disk. Throws if missing or invalid. */
  loadSession(): ReworkSession

  /** Create a new rework session. Throws if one already exists (use clearSession first). */
  createSession(config: ReworkConfig, steps: ReworkStep[]): ReworkSession

  /** Advance a step to completed. Updates stats. */
  advanceStep(stepName: string): void

  /** Mark a step as failed with an error message. */
  failStep(stepName: string, error: string): void

  /** Mark a step as in_progress, set current_step. */
  startStep(stepName: string): void

  /** Get the next pending step, or null if all done. */
  nextStep(): ReworkStep | null

  /** Delete the rework session file. */
  clearSession(): void

  /** Atomically persist session to disk. */
  private saveSession(session: ReworkSession): void
}
```

### Step 3: Phase Selection Utilities (`src/core/rework/phase-selector.ts`)

Pure functions for parsing phase selection flags and resolving steps.

```typescript
/**
 * Parse --phases flag value into an array of phase numbers.
 * Supports: "1-5" (range), "1,3,5" (list), "1-3,5" (mixed).
 * Throws on invalid input.
 */
export function parsePhases(input: string): number[]

/**
 * Parse --through flag: returns [1, 2, ..., N].
 */
export function parseThrough(n: number): number[]

/**
 * Apply --exclude: remove excluded phase numbers from the list.
 */
export function applyExclusions(phases: number[], exclude: number[]): number[]

/**
 * Given selected phase numbers and the full pipeline (MetaPromptFrontmatter[]),
 * return the steps belonging to those phases in topological order.
 * Filter out steps with conditional="if-needed" that have status="skipped" in state.
 */
export function resolveStepsForPhases(
  phaseNumbers: number[],
  metaPrompts: MetaPromptFrontmatter[],
  state: PipelineState,
  graph: DependencyGraph,  // from src/core/dependency/graph.ts
): ReworkStep[]
```

Use the `PHASES` constant from `src/types/frontmatter.ts` to map phase numbers to slugs. Use the existing `topologicalSort` from `src/core/dependency/dependency.ts` and `buildGraph` from `src/core/dependency/graph.ts` for ordering.

### Step 4: CLI Command (`src/cli/commands/rework.ts`)

Follow the exact pattern from `src/cli/commands/reset.ts`:
- Export a `CommandModule<Record<string, unknown>, ReworkArgs>` as default
- Use `findProjectRoot` from `src/cli/middleware/project-root.js`
- Use `resolveOutputMode` and `createOutputContext` for output handling
- Use `acquireLock` / `releaseLock` from `src/state/lock-manager.js`

```typescript
interface ReworkArgs {
  phases?: string       // "1-5", "1,3,5", "1-3,5"
  through?: number      // shorthand for phases 1..N
  exclude?: string      // "3,5" — phases to exclude
  depth?: number        // override depth (1-5)
  fix?: boolean         // auto-fix review steps (default true)
  fresh?: boolean       // wipe artifacts (default false)
  auto?: boolean        // no pauses between phases (default false)
  resume?: boolean      // resume interrupted session
  clear?: boolean       // clear active session
  advance?: string      // mark a step completed (used by runner skill)
  format?: string
  verbose?: boolean
  root?: string
  force?: boolean
}
```

**Handler logic branches:**

1. **`--clear`**: Call `reworkManager.clearSession()`, exit 0.

2. **`--advance <step>`**: Call `reworkManager.advanceStep(step)`. If all steps done, print completion summary and delete session. Exit 0. Output JSON result in json mode.

3. **`--resume`**: Load existing session via `reworkManager.loadSession()`. Find next pending step. Print status summary. In json mode, output the full session. Exit 0.

4. **Default (new rework)**:
   - Check for existing session → warn, offer resume or clear (interactive) / error (auto without --force)
   - Resolve phases: use `--phases`, `--through`, and `--exclude` flags. If none provided and mode is interactive, show phase checklist (use the output context's `select` or `confirm` methods)
   - Discover meta-prompts via `discoverMetaPrompts(getPackagePipelineDir(projectRoot))`
   - Load state via `StateManager`
   - Build dependency graph, resolve step order via `resolveStepsForPhases`
   - Batch-reset selected steps in state.json (loop through each step, set to pending — follow the pattern in `resetCommand` for single-step reset but skip confirmation)
   - Create `ReworkConfig` from flags (depth: null if not specified, fix: default true, fresh: default false, auto: from argv)
   - Call `reworkManager.createSession(config, steps)`
   - Print summary: "Rework plan created: {N} steps across phases {list} at depth {d}"
   - In json mode, output the full session

**Register in `src/cli/index.ts`:**
```typescript
import reworkCommand from './commands/rework.js'
// ... add .command(reworkCommand) in the yargs chain
```

### Step 5: Assembly Engine Enhancement (`src/core/assembly/engine.ts`)

Add rework auto-fix instruction injection. This is a small, targeted change:

1. Add an optional `reworkFix?: boolean` field to the `AssemblyOptions` interface in `src/types/assembly.ts`
2. In the `buildInstructionsSection` method, if `reworkFix` is true, append a "Rework Mode: Auto-Fix Enabled" subsection:

```typescript
if (options.reworkFix) {
  parts.push(`### Rework Mode: Auto-Fix Enabled\n\nYou are re-running this review step in rework mode. Instead of just listing issues:\n1. Read the artifact being reviewed\n2. Identify all issues at the current depth level\n3. Apply fixes directly to the artifact\n4. Summarize what you changed and why`)
}
```

This gets triggered by the runner skill passing `--instructions` or by a future direct integration.

### Step 6: Runner Skill Update (`skills/scaffold-runner/SKILL.md`)

Add a new section after "Batch Execution" called "Rework Mode". This section teaches the runner skill how to:

1. **Detect active rework**: Check for `.scaffold/rework.json` via `cat .scaffold/rework.json 2>/dev/null` on activation
2. **Enter rework mode**: When rework.json exists, show status and offer to continue
3. **Execute rework steps**: For each step:
   - Read current step from rework.json
   - If the step is a review step (name starts with `review-`) and config.fix is true, add `--instructions "Apply fixes directly to the reviewed artifact instead of just listing issues"` to the scaffold run command
   - If config.fresh is true and this is the first run of the step in this session, note that the artifact should be created fresh (the runner deletes the existing artifact before running)
   - Run the step using the normal Smart Scaffold Execution workflow
   - After completion: `scaffold rework --advance <step>` then `scaffold complete <step>`
4. **Phase boundary pauses**: If config.auto is false, after completing the last step in a phase, show a phase summary and ask the user whether to continue
5. **Completion**: When `scaffold rework --advance` reports all steps done, show the full rework summary

**New natural language triggers to add to the Navigation Commands table:**

| User Says | Action |
|---|---|
| "rework phases 1-5" | `scaffold rework --through 5` → enter rework mode |
| "rework everything" | `scaffold rework` (interactive phase selection) |
| "continue rework" / "resume rework" | `scaffold rework --resume` → continue from where it stopped |
| "stop rework" / "cancel rework" | `scaffold rework --clear` |
| "rework status" | Read `.scaffold/rework.json`, show progress |

### Step 7: Tests (`tests/rework.bats`)

Write bats tests following the pattern in existing test files. Key test cases:

```bash
# Phase selection parsing
@test "parsePhases: range 1-5 resolves to [1,2,3,4,5]"
@test "parsePhases: explicit list 1,3,5 resolves to [1,3,5]"
@test "parsePhases: mixed 1-3,5 resolves to [1,2,3,5]"
@test "parsePhases: invalid input errors"
@test "applyExclusions: removes excluded phases"
@test "through flag: --through 5 resolves to [1,2,3,4,5]"

# Session lifecycle
@test "rework creates rework.json with correct structure"
@test "rework --advance marks step completed and updates stats"
@test "rework --advance on last step prints completion summary"
@test "rework --resume loads existing session"
@test "rework --resume errors when no session exists"
@test "rework --clear deletes rework.json"
@test "rework errors when session exists without --resume or --force"

# State integration
@test "rework batch-resets selected steps to pending"
@test "rework respects skipped conditional steps"
@test "rework with --fresh records fresh flag in config"

# JSON output
@test "rework --format json outputs valid JSON"
@test "rework --advance --format json outputs step result"
```

For bats tests, you'll need to set up fixtures with a `.scaffold/` directory containing state.json. Look at existing test files in `tests/` for the fixture pattern.

## Key Patterns to Follow

- **Error format**: Use `output.error({ code, message, exitCode, recovery })` — see reset.ts
- **Lock management**: Always acquire/release locks around state mutations — see reset.ts and run.ts
- **Output modes**: Support interactive, json, and auto via `resolveOutputMode` — see run.ts
- **Fuzzy matching**: Use `findClosestMatch` from `src/utils/levenshtein.js` for step name typos
- **Import style**: Use `.js` extensions in imports (ESM)
- **Type re-exports**: Add new types to `src/types/index.ts`

## Files to Create

| File | Purpose |
|------|---------|
| `src/types/rework.ts` | Interfaces |
| `src/state/rework-manager.ts` | Session CRUD |
| `src/core/rework/phase-selector.ts` | Phase parsing + step resolution |
| `src/cli/commands/rework.ts` | CLI command |
| `tests/rework.bats` | Test suite |

## Files to Modify

| File | Change |
|------|--------|
| `src/types/index.ts` | Re-export rework types |
| `src/types/assembly.ts` | Add `reworkFix?: boolean` to `AssemblyOptions` |
| `src/core/assembly/engine.ts` | Inject auto-fix instructions when `reworkFix` is true |
| `src/cli/index.ts` | Register rework command |
| `skills/scaffold-runner/SKILL.md` | Add rework mode section |

## Verification

After implementation, run:

```bash
make check          # All quality gates (lint + validate + test)
make test           # Just tests
scaffold rework --help  # Verify command is registered and help text is correct
```

Then manually verify:
1. `scaffold rework --through 3 --format json` in a test project with completed phases — should create rework.json
2. `scaffold rework --resume --format json` — should load and display the session
3. `scaffold rework --advance create-prd --format json` — should advance the step
4. `scaffold rework --clear` — should delete rework.json

## Step 8: Git Workflow, PR, and Release

After all tests pass and verification is complete, follow the project's git workflow to ship this feature.

### 8a. Create Feature Branch and PR

```bash
# Create branch (should already be on one — if not:)
git checkout -b feat/rework-command origin/main

# Stage and commit all changes (use conventional commit format)
git add src/types/rework.ts src/state/rework-manager.ts src/core/rework/phase-selector.ts \
        src/cli/commands/rework.ts src/cli/index.ts src/types/index.ts src/types/assembly.ts \
        src/core/assembly/engine.ts skills/scaffold-runner/SKILL.md tests/rework.bats
git commit -m "feat: add scaffold rework command for phase-level re-execution"

# Push and create PR
git push -u origin HEAD
gh pr create --title "feat: add scaffold rework command" --body "$(cat <<'EOF'
## Summary
- New `scaffold rework` CLI command for re-running all steps within selected phases
- Persistent rework sessions (`.scaffold/rework.json`) survive context resets
- Phase selection via `--phases`, `--through`, `--exclude` flags or interactive checklist
- `--fix` flag for auto-fixing issues in review steps
- Runner skill integration for step-by-step execution

## Test plan
- [ ] `make check` passes (lint + validate + test)
- [ ] `scaffold rework --help` shows correct usage
- [ ] `scaffold rework --through 3 --format json` creates rework.json
- [ ] `scaffold rework --resume` loads existing session
- [ ] `scaffold rework --advance <step>` advances correctly
- [ ] `scaffold rework --clear` removes session
EOF
)"
```

### 8b. Wait for CI, then Merge

```bash
gh pr checks --watch        # Wait for CI to pass
gh pr merge --squash --delete-branch
git checkout main && git pull --rebase origin main
```

### 8c. Version Bump and Changelog

Determine the new version — this is a new feature so bump the minor version. Check the current version first:

```bash
node -p "require('./package.json').version"
```

Then create a release branch:

```bash
git checkout -b chore/release-vX.Y.0 origin/main
```

1. **Bump version** in both `package.json` and `.claude-plugin/plugin.json`
2. **Update `CHANGELOG.md`** — Add a new entry at the top following the existing format:

```markdown
## [X.Y.0] — YYYY-MM-DD

### Added

- **`scaffold rework` command** — Re-run all steps within selected phases at configurable depth. Supports `--phases`, `--through`, `--exclude` for phase selection, `--fix` for auto-fixing review step issues, `--fresh` for clean re-runs, and persistent sessions (`.scaffold/rework.json`) that survive context resets.
- **Rework mode in scaffold-runner skill** — Runner skill auto-detects active rework sessions, executes steps sequentially, pauses at phase boundaries, and supports natural language triggers ("rework phases 1-5", "resume rework").
- **`reworkFix` assembly option** — Assembly engine injects auto-fix instructions for review steps during rework mode.
```

3. **Update `README.md`** — If there's a command count or feature list, update it to include the new `rework` command.

### 8d. Release PR and Tag

```bash
git add package.json .claude-plugin/plugin.json CHANGELOG.md README.md
git commit -m "chore: bump version to X.Y.0"
git push -u origin HEAD
gh pr create --title "chore: bump version to X.Y.0" --body "Version release for scaffold rework command"
gh pr checks --watch
gh pr merge --squash --delete-branch
git checkout main && git pull --rebase origin main
```

### 8e. Tag and GitHub Release

```bash
git tag vX.Y.0
git push origin vX.Y.0
gh release create vX.Y.0 --title "vX.Y.0 — scaffold rework command" --notes "$(cat <<'EOF'
## What's New

**`scaffold rework`** — Re-run entire phases of the pipeline at configurable depth.

- Phase selection: `--phases 1-5`, `--through 5`, `--exclude 3`
- Auto-fix review steps: `--fix` (default on)
- Persistent sessions: survives context resets via `.scaffold/rework.json`
- Runner skill integration: natural language triggers, phase boundary pauses

See [CHANGELOG.md](CHANGELOG.md) for full details.
EOF
)"
```

The Homebrew formula auto-updates on tag push via the `update-homebrew.yml` workflow.
