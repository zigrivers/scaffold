# Scaffold v2 — CLI Output Formats

**Phase**: 6 — UX Specification
**Depends on**: Phase 5 CLI contract (all commands), Phase 5 JSON output schemas, [ADR-043](../adrs/ADR-043-depth-scale.md) (depth scale), [ADR-044](../adrs/ADR-044-runtime-prompt-generation.md) (runtime assembly), [ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md) (user instructions), [ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md) (update mode), [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md) (methodology changes)
**Last updated**: 2026-03-14
**Status**: draft

---

## Table of Contents

1. [Global Output Conventions](#section-1-global-output-conventions)
2. [Per-Command Output Specifications](#section-2-per-command-output-specifications)
3. [Confirmation and Selection Patterns](#section-3-confirmation-and-selection-patterns)
4. [Empty State and First-Run Messaging](#section-4-empty-state-and-first-run-messaging)

---

## Section 1: Global Output Conventions

These rules govern the interactive (human-readable) output of every scaffold command. JSON output is defined separately in [json-output-schemas.md](../api/json-output-schemas.md). The three output modes (interactive, `--format json`, `--auto`) are governed by [ADR-025](../adrs/ADR-025-cli-output-contract.md).

### 1a: Typography and Color

| Element | Symbol | Color | Usage |
|---------|--------|-------|-------|
| Success | `✓` | Green | Operation completed successfully |
| Warning | `⚠` | Yellow | Non-fatal issue; operation proceeds |
| Error | `✗` | Red | Fatal issue; operation aborted |
| Prompt | `?` | Cyan | Waiting for user input |
| Next step | `→` | White/default | Suggested follow-up action |
| In progress | `◉` | Blue | Currently executing prompt |
| Pending | `○` | Gray (dimmed) | Not yet started |
| Done | `✓` | Green | Finished prompt |
| Skipped | `→` | Gray (dimmed) | Intentionally bypassed |

**Bold** is used for:
- Section headers within command output
- Numeric counts and percentages (e.g., **8/23**, **35%**)
- Command names in "Next step" suggestions

**Dimmed** text is used for:
- File paths (e.g., `.scaffold/config.yml`)
- Timestamps
- Secondary information (skip reasons, actor names)

**Underlined** text is used for:
- URLs (dashboard file paths that can be opened)

### 1b: Progress Patterns

| Duration | Indicator | Example |
|----------|-----------|---------|
| < 1 second | None; display result immediately | `✓ Config valid` |
| 1-5 seconds | Spinner with description | `⠋ Resolving prompts...` then `✓ 24 defined / 22 resolved` |
| > 5 seconds | Progress bar with count | `Building ██████░░░░ 14/23 prompts` |

Spinners use the Braille dot pattern (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) cycling at 80ms intervals. The spinner text replaces in-place on the same line. Upon completion, the spinner line is replaced with the final result line.

### 1c: Table Formatting

- Left-align text columns; right-align numeric columns
- Use space padding (not tabs) for alignment
- Header separator: single dash line matching column widths
- Maximum width: 80 characters; truncate long values with `...`
- Column spacing: 2 spaces minimum between columns

### 1d: Verbosity Levels

**Normal mode** (default): Shows results only. No intermediate steps, no file paths unless directly relevant, no timing unless the operation is notably slow.

**Verbose mode** (`--verbose`): Adds intermediate steps, resolution traces, file paths for every read/write, timing per phase, and dependency graph edges. Verbose output is prefixed with a dimmed component tag:

```
[ConfigLoader] Reading .scaffold/config.yml
[StepResolver] Resolved create-prd from pipeline definition
[AssemblyEngine] Loaded meta-prompt for create-prd (42 lines)
```

### 1e: Error Display

Errors are displayed with the error code, source file (when applicable), and a recovery suggestion:

```
✗ error [CONFIG_INVALID_METHODOLOGY]: Unknown methodology 'deap'.
  Did you mean 'deep'?
  File: .scaffold/config.yml
```

When multiple errors are accumulated (build-time commands), they are grouped by source file:

```
.scaffold/config.yml
  ✗ error [CONFIG_INVALID_METHODOLOGY]: Unknown methodology 'deap'. Did you mean 'deep'?
  ⚠ warning [CONFIG_UNKNOWN_FIELD]: Unknown field "extra_settings" (possible typo)

content/base/create-prd.md
  ✗ error [FRONTMATTER_PRODUCES_MISSING]: Required 'produces' field absent

2 errors, 1 warning
```

### 1f: Blank Line Conventions

- One blank line between logical sections within a command's output
- No blank line between a result line and its indented detail
- One blank line before the "Next step" suggestion at the end
- No trailing blank line after the final output line

### 1g: Non-Interactive Output

When scaffold runs in a non-interactive context (CI, piped output, or explicit opt-out), the output adapts to remove features that depend on a terminal.

**Detection and precedence** (highest priority first):

1. `FORCE_COLOR=1` — forces color output even when stdout is not a TTY
2. `NO_COLOR` (any value, including empty) — disables all ANSI color/style codes per [no-color.org](https://no-color.org/)
3. TTY detection — if stdout is not a TTY (pipe, redirect, or CI environment), behave as non-interactive

CI environments (detected via `CI=true`, `GITHUB_ACTIONS`, `GITLAB_CI`, or similar standard variables) are treated identically to non-TTY.

**Behavior changes in non-interactive mode:**

| Feature | Interactive (TTY) | Non-interactive |
|---------|-------------------|-----------------|
| ANSI colors/styles | Enabled | Disabled (plain text) |
| Spinners (`⠋⠙⠹...`) | Animated in-place | Replaced with a single static line: `Processing...` |
| Progress bars | Rendered and updated | Omitted entirely |
| Final result lines | Printed | Printed (unchanged) |
| Prompts / confirmations | Displayed, await input | Use defaults or flag values; abort if no default exists |

**Piped output example:**

```
Processing...
✓ Config valid (methodology: deep, 32 steps)
✓ 32 defined / 29 enabled (3 conditional disabled)
✓ Dependency graph: 29 nodes, 42 edges, no cycles
✓ Claude Code: 29 thin wrappers written to commands/
✓ Universal: 29 prompts written to prompts/
Build complete in 0.4s
```

Colors and style codes (bold, dim, underline) are stripped. Unicode symbols (`✓`, `✗`, `⚠`, `→`) are preserved because they are plain UTF-8, not ANSI escapes.

---

## Section 2: Per-Command Output Specifications

---

### `scaffold init`

**Success output:**

The init wizard output is defined in [init-wizard-flow.md](init-wizard-flow.md). This section specifies only the post-wizard build output that appears after the user confirms their selections.

```
✓ Config written to .scaffold/config.yml
✓ Pipeline initialized (32 steps, 29 enabled, all pending)
✓ .scaffold/instructions/ directory created
✓ Build complete:
    Claude Code:  29 commands  → commands/
    Universal:    29 prompts   → prompts/

Next step: scaffold run <step>
```

When both `claude-code` and `codex` platforms are selected:

```
✓ Config written to .scaffold/config.yml
✓ Pipeline initialized (32 steps, 29 enabled, all pending)
✓ .scaffold/instructions/ directory created
✓ Build complete:
    Claude Code:  29 commands  → commands/
    Codex:        29 prompts   → codex-prompts/
    Universal:    29 prompts   → prompts/

Next step: scaffold run <step>
```

**Progress indicators:**

```
⠋ Detecting project type...
⠋ Resolving prompts...
⠋ Building output files...
```

Each spinner is replaced by its corresponding `✓` result line upon completion.

**Edge cases:**

Re-initialization with `--force` (existing project):

```
⚠ Existing .scaffold/ directory found. Backing up to .scaffold.backup/
✓ Config written to .scaffold/config.yml
✓ Pipeline initialized (32 steps, 29 enabled, all pending)
✓ .scaffold/instructions/ directory created
✓ Build complete:
    Claude Code:  29 commands  → commands/
    Universal:    29 prompts   → prompts/

Next step: scaffold run <step>
```

v1 migration detected:

```
✓ v1 scaffold detected — migrating to v2 format
✓ Config written to .scaffold/config.yml
✓ Pipeline initialized (32 steps, 29 enabled, 8 pre-done from v1 history)
✓ .scaffold/instructions/ directory created
✓ Build complete:
    Claude Code:  29 commands  → commands/
    Universal:    29 prompts   → prompts/

Next step: scaffold run <step>
```

**Verbose additions:**

```
[InitWizard] Idea analysis: keywords=[REST, API, Node.js, PostgreSQL]
[InitWizard] File signals: package.json detected (brownfield)
[InitWizard] Smart suggestion: deep (confidence: high, signals: 3 keyword + 1 file)
[ConfigLoader] Writing .scaffold/config.yml (version: 1, methodology: deep)
[StateManager] Initializing state: 32 steps, 0 pre-done
[StepResolver] Resolved 32 steps from pipeline definition, 3 conditional disabled
[ClaudeCodeAdapter] Wrote 29 thin wrappers to commands/
[UniversalAdapter] Wrote 29 thin wrappers to prompts/
```

---

### `scaffold build`

**Success output (first build):**

```
✓ Config valid (methodology: deep, 32 steps)
✓ 32 defined / 29 enabled (3 conditional disabled)
✓ Dependency graph: 29 nodes, 42 edges, no cycles
✓ Claude Code: 29 thin wrappers written to commands/
✓ Universal: 29 prompts written to prompts/
Build complete in 0.4s
```

**Success output (rebuild with diff):**

```
✓ Config valid (methodology: deep, 32 steps)
✓ 32 defined / 29 enabled (3 conditional disabled)
✓ Dependency graph: 29 nodes, 42 edges, no cycles
✓ Claude Code: 29 thin wrappers written to commands/
✓ Universal: 29 prompts written to prompts/
  Changed: 3 modified (system-architecture, database-schema, api-contracts)
  Added:   0
  Removed: 0
Build complete in 0.5s
```

**Progress indicators:**

```
⠋ Validating config...
⠋ Resolving steps...
Building ██████████████░░░░░░ 16/29 wrappers
```

The progress bar appears only during file writing when there are more than 10 steps.

**Edge cases:**

Build with no conditional steps disabled:

```
✓ Config valid (methodology: deep, 32 steps)
✓ 32 defined / 32 enabled
✓ Dependency graph: 32 nodes, 48 edges, no cycles
✓ Claude Code: 32 thin wrappers written to commands/
✓ Universal: 32 prompts written to prompts/
Build complete in 0.5s
```

**Verbose additions:**

```
[ConfigLoader] Reading .scaffold/config.yml (version: 1)
[ConfigLoader] Methodology: deep, schema valid
[StepResolver] 32 steps defined, 29 enabled, 3 conditional disabled
[DependencyResolver] Topological order: create-prd → review-prd → innovate-prd → domain-modeling → ...
[ClaudeCodeAdapter] Writing commands/create-prd.md (thin wrapper, 0.3 KB)
[UniversalAdapter] Writing prompts/create-prd.md (thin wrapper, 0.3 KB)
```

---

### `scaffold adopt`

**Success output:**

```
Scanning codebase...
✓ Found 8 matching artifacts:
    done       create-prd           → docs/plan.md
    done       tech-stack           → docs/tech-stack.md
    done       coding-standards     → docs/coding-standards.md
    done       tdd-standards        → docs/tdd-standards.md
    done       project-structure    → docs/project-structure.md
    done       dev-env-setup        → docs/dev-env-setup.md
    pending    git-workflow           (docs/git-workflow.md not found)
    pending    user-stories           (docs/user-stories.md not found)

✓ state.json written — 6 pre-done, 26 pending

Next step: scaffold build
```

**Progress indicators:**

```
⠋ Scanning project files...
⠋ Matching artifacts to prompts...
```

**Edge cases:**

Dry run:

```
Scanning codebase...
Found 6 matching artifacts:
    would mark done  create-prd           → docs/plan.md
    would mark done  tech-stack           → docs/tech-stack.md
    would mark done  coding-standards     → docs/coding-standards.md
    would mark done  tdd-standards        → docs/tdd-standards.md
    would mark done  project-structure    → docs/project-structure.md
    would mark done  dev-env-setup        → docs/dev-env-setup.md

Dry run — no files written. Run without --dry-run to apply.
```

Partial match requiring confirmation:

```
? docs/plan.md found but missing required section "Acceptance Criteria".
  Maps to: create-prd
  ● Mark as done
  ○ Mark as pending
  ○ Skip this artifact
```

**Verbose additions:**

```
[AdoptScanner] Scanning from project root: /Users/ken/projects/acme-web
[AdoptScanner] Checking docs/plan.md against create-prd.produces
[AdoptScanner] docs/plan.md: exact path match, schema validation: pass
[AdoptScanner] Checking package.json for framework signals
[AdoptScanner] package.json: jest detected → tdd=strict signal
[AdoptScanner] .beads/ directory found → task-tracking=beads signal
```

---

### `scaffold run`

**Success output (normal execution):**

Lock acquisition is silent on success. The assembly engine assembles and presents the prompt:

```
=== Scaffold: git-workflow (Phase 3 — System Architecture) ===
Pipeline: deep | Progress: 6/32 complete (19%) | Depth: 5
Recent decisions:
  D-012: Use Biome for linting and formatting; target ES2022. (coding-standards)
  D-011: Enforce 100-character line limit; no semicolons. (coding-standards)
  D-010: Node.js 22 LTS with TypeScript 5.4; Fastify for HTTP. (tech-stack)
Predecessor reads: docs/plan.md, docs/tech-stack.md, docs/coding-standards.md
================================

[Assembled prompt content for git-workflow follows...]
```

After the agent completes the step and the user confirms:

```
✓ git-workflow marked done
→ Next eligible: dev-env-setup, tdd-standards
  Run: scaffold run <step>
```

**Progress indicators:**

```
⠋ Checking pipeline state...
⠋ Assembling prompt...
```

These appear before the assembled prompt and are replaced by the output itself.

**Edge cases:**

Stale lock cleanup:

```
⚠ Stale lock found (PID 42891 is not running). Clearing lock.
```

This message appears before the assembled prompt when a lock exists but the holding process is dead. No user interaction is required.

Crash recovery (no artifacts):

```
⚠ Previous session interrupted: dev-env-setup
  Started at: 2026-03-13 09:15 UTC
  Artifacts found: none

? How would you like to proceed?
  ● Re-run dev-env-setup
  ○ Mark as done anyway
  ○ Cancel
```

Crash recovery (partial artifacts):

```
⚠ Previous session interrupted: dev-env-setup
  Started at: 2026-03-13 09:15 UTC
  Artifacts found: 1 of 2
    ✓ docs/dev-setup.md (present)
    ✗ scripts/setup.sh (missing)

? How would you like to proceed?
  ● Re-run dev-env-setup (safer)
  ○ Accept partial output
  ○ Cancel
```

Crash recovery (all artifacts present):

```
✓ Previous session recovered: dev-env-setup
  All 2 artifacts found. Auto-marking as done.
```

Prerequisite check failure (interactive):

```
⚠ Prerequisite not satisfied for git-workflow:
  coding-standards must complete first (docs/coding-standards.md not found)

? How would you like to proceed?
  ● Run coding-standards first
  ○ Proceed anyway (artifacts may be missing)
  ○ Cancel
```

Re-running a done step (update mode per [ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md)):

```
⚠ tech-stack was already done on 2026-03-11 (depth 5).
  This will run in update mode — diff-based updates to the existing artifact.
? Re-run this step in update mode? Downstream steps will not be automatically re-run. [y/N]
```

After re-run completes:

```
✓ tech-stack marked done (update mode)
⚠ The following downstream steps may now be stale:
    coding-standards (done 2026-03-12, depth 5)
    project-structure (done 2026-03-12, depth 5)
  Consider re-running: scaffold run coding-standards
→ Next eligible: user-stories
  Run: scaffold run <step>
```

Methodology change warning (per [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)):

```
⚠ Methodology changed since last execution.
  Previous: deep → Current: mvp
  3 completed step(s) were executed under the previous methodology.
  These steps are preserved as-is. Pending steps will be resolved under 'mvp'.
```

Pipeline complete:

```
✓ Pipeline complete — all 32 steps finished.
  Run scaffold status for a full summary.
  Run scaffold dashboard to view the progress dashboard.
```

**Verbose additions:**

```
[LockManager] Acquiring lock: .scaffold/lock.json
[LockManager] Lock acquired (PID 54321, holder: ken)
[StateManager] Reading .scaffold/state.json (version: 1)
[StateManager] Progress: 6 done, 1 skipped, 24 pending, 0 in_progress
[DependencyResolver] Checking prerequisites for git-workflow
[AssemblyEngine] Loading meta-prompt: pipeline/git-workflow.md
[AssemblyEngine] Loading knowledge base: knowledge/git-workflow.md
[AssemblyEngine] Depth level: 5
[AssemblyEngine] Loading user instructions: global.md (found), git-workflow.md (not found)
[AssemblyEngine] Instruction precedence: global → per-step → inline ([ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md))
[AssemblyEngine] Update mode: false (first execution)
[AssemblyEngine] Assembling prompt (7 sections per [ADR-045](../adrs/ADR-045-assembled-prompt-structure.md))
[DecisionLog] Loading .scaffold/decisions.jsonl (12 entries)
[DecisionLog] Last 3 decisions: D-012, D-011, D-010
```

---

### `scaffold skip`

**Success output:**

```
✓ add-playwright skipped
  Reason: "Using Vitest browser mode instead"
→ 2 prompts now unblocked: coding-standards, tdd-standards
  Run: scaffold run <step>
```

**Progress indicators:** None. Skip is instantaneous.

**Edge cases:**

Skip without reason provided:

```
✓ add-playwright skipped
  Reason: (none)
→ 1 prompt now unblocked: user-stories
  Run: scaffold run <step>
```

Skip with no newly unblocked prompts:

```
✓ add-playwright skipped
  Reason: "Not applicable"
  No new prompts unblocked.
```

Skipping an already-done prompt (with confirmation):

```
⚠ tech-stack is already done (2026-03-11).
  Dependent prompts may have been run using its artifacts.
? Re-mark as skipped? [y/N]

✓ tech-stack marked as skipped (was: done)
  Reason: "Revisiting tech choices later"
```

**Verbose additions:**

```
[LockManager] Acquiring lock: .scaffold/lock.json
[StateManager] Transitioning add-playwright: pending → skipped
[StateManager] skip_reason: "Using Vitest browser mode instead"
[DependencyResolver] Recalculating eligible: +2 newly unblocked [coding-standards, tdd-standards]
[LockManager] Releasing lock
```

---

### `scaffold reset`

**Success output:**

```
⚠ This will reset all pipeline progress.
  The following files will be deleted:
    .scaffold/state.json
    .scaffold/decisions.jsonl

  The following will be preserved:
    .scaffold/config.yml
    commands/ (23 files)
    prompts/ (23 files)
    CLAUDE.md
    All produced artifacts (docs/, etc.)

? Continue? This cannot be undone (except via git). [y/N]

✓ .scaffold/state.json deleted
✓ .scaffold/decisions.jsonl deleted
Pipeline reset complete.

Next step: scaffold build (to reinitialize state)
```

**Progress indicators:** None. Deletion is instantaneous.

**Edge cases:**

Reset when state.json does not exist:

```
⚠ .scaffold/state.json does not exist. Nothing to reset.
```

Reset when decisions.jsonl is missing but state.json exists:

```
✓ .scaffold/state.json deleted
  .scaffold/decisions.jsonl not found (already absent)
Pipeline reset complete.

Next step: scaffold build (to reinitialize state)
```

**Verbose additions:**

```
[LockManager] Acquiring lock: .scaffold/lock.json
[StateManager] Deleting .scaffold/state.json (was: 23 prompts, 8 done)
[DecisionLog] Deleting .scaffold/decisions.jsonl (was: 47 entries)
[LockManager] Releasing lock
```

---

### `scaffold status`

**Success output:**

```
Pipeline: deep | 8/32 complete (25%) | Depth: 5
████████░░░░░░░░░░░░░░░░░░░░░░ 25%

Phase 0 — Prerequisites
  ✓ claude-code-permissions           done        2026-03-10  depth 5

Phase 1 — Planning
  ✓ create-prd                        done        2026-03-10  depth 5
  ✓ review-prd                        done        2026-03-11  depth 5
  ✓ innovate-prd                      done        2026-03-11  depth 5  (if-needed)
  ✓ tech-stack                        done        2026-03-11  depth 5
  ○ user-stories                      pending     [blocked by: innovate-prd → done]
  ○ user-stories-gaps                 pending     [blocked by: user-stories]

Phase 2 — Standards
  ✓ coding-standards                  done        2026-03-12  depth 5
  ✓ tdd-standards                     done        2026-03-12  depth 5
  → add-playwright                    skipped     "Using Vitest browser mode"
  ○ design-system                     pending

Phase 3 — Setup
  ✓ project-structure                 done        2026-03-12  depth 5
  ✓ dev-env-setup                     done        2026-03-12  depth 5
  ○ git-workflow                      pending

Phase 4 — Architecture
  ○ data-models                       pending     [blocked by: tech-stack → done]
  ○ api-design                        pending     [blocked by: data-models]
  ...

What's Next
→ Next eligible: user-stories, design-system, git-workflow
  Run: scaffold run <step>
```

**Progress indicators:** None. Status is a read-only display.

**Edge cases:**

Orphaned entries detected (methodology changed, [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md)):

```
Pipeline: mvp | 2/4 complete (50%) | Depth: 1
███████████████░░░░░░░░░░░░░░░ 50%

Phase 1 — Planning
  ✓ create-prd                        done        2026-03-10  depth 3
  ...

Orphaned (no longer in pipeline)
  ! multi-agent-setup                 done        2026-03-11  depth 5
  ! add-maestro                       done        2026-03-12  depth 5

⚠ 2 orphaned entries from a previous methodology (was: deep, now: mvp).
  These prompts are no longer in the resolved pipeline. Their state is
  preserved but they will not appear in the active pipeline.
  Completed steps retain their original depth level.

What's Next
→ Next eligible: tech-stack
  Run: scaffold run <step>
```

In-progress prompt visible:

```
Phase 2 — Standards
  ✓ coding-standards                  done        2026-03-12
  ◉ tdd-standards                     in progress (started 2026-03-13 09:15)
  ○ add-playwright                    pending     [blocked by: tdd-standards]
```

**Verbose additions:**

```
[StateManager] Loaded state: 8 done, 1 skipped, 23 pending, 0 in_progress
[StateManager] Orphaned entries: 0
[DependencyResolver] Next eligible cache: [user-stories, design-system, git-workflow]
[StateManager] create-prd: done at 2026-03-10T14:00:00Z by ken, depth 5
[StateManager] create-prd: artifact docs/plan.md verified (present, 4.2 KB)
```

---

### `scaffold next`

**Success output (single next prompt):**

```
Next: user-stories (Phase 1 — Planning)
  Description:  Create user stories from the PRD
  Depth:        5
  Depends on:   review-prd ✓
  Produces:     docs/user-stories.md
  Reads:        docs/plan.md, docs/tech-stack.md

Run: scaffold run <step>
```

**Success output (multiple eligible, `--count 3`):**

```
Next eligible (3 of 5):

  1. user-stories (Phase 1 — Planning)
     Description:  Create user stories from the PRD
     Depth:        5
     Depends on:   review-prd ✓
     Produces:     docs/user-stories.md

  2. design-system (Phase 2 — Standards)
     Description:  Define the UI design system
     Depth:        5
     Depends on:   tech-stack ✓
     Produces:     docs/design-system.md

  3. git-workflow (Phase 3 — Setup)
     Description:  Configure Git branching strategy and PR conventions
     Depth:        5
     Depends on:   coding-standards ✓
     Produces:     docs/git-workflow.md

Run: scaffold run <step>
```

**Progress indicators:** None. Read-only command.

**Edge cases:**

Pipeline complete:

```
Pipeline complete. All 32 steps finished.
Run scaffold status for a full summary.
```

All remaining prompts blocked:

```
No eligible prompts. 4 prompts remain but all are blocked:
  user-stories-gaps       blocked by: user-stories (pending)
  api-design              blocked by: data-models (pending)
  api-implementation      blocked by: api-design (pending)
  integration-tests       blocked by: api-implementation (pending)

Run: scaffold status to see the full pipeline.
```

**Verbose additions:**

```
[DependencyResolver] Computing eligibility from state (8 done, 1 skipped, 23 pending)
[DependencyResolver] user-stories: dependency satisfied (review-prd)
[DependencyResolver] user-stories: produces=[docs/user-stories.md], reads=[docs/plan.md, docs/tech-stack.md]
[DependencyResolver] user-stories: source=pipeline, depth=5, has CLAUDE.md section: no
```

---

### `scaffold validate`

**Success output (no issues):**

```
✓ Config valid
✓ Pipeline manifest valid (deep, 32 defined / 29 enabled)
✓ 29 prompts — frontmatter valid
✓ 29 build outputs — no unresolved markers
✓ state.json consistent (8 done, all artifacts present on disk, depths valid)
✓ decisions.jsonl — 47 entries, IDs sequential, no duplicates

0 errors, 0 warnings
```

**Success output (issues found):**

```
.scaffold/config.yml
  ✗ [CONFIG_INVALID_METHODOLOGY] Unknown methodology 'deap'. Did you mean 'deep'?
  ⚠ [CONFIG_UNKNOWN_FIELD] Unknown field "extra_settings" (possible typo, or from a newer scaffold version)

pipeline/pre/create-prd.md
  ✗ [FRONTMATTER_PRODUCES_MISSING] Required 'produces' field absent

.scaffold/state.json
  ⚠ [PSM_ZERO_BYTE_ARTIFACT] docs/plan.md exists but is 0 bytes (create-prd)

2 errors, 2 warnings
```

**Progress indicators:**

```
⠋ Validating config...
⠋ Checking pipeline manifest...
⠋ Validating prompt frontmatter (29 files)...
⠋ Checking build outputs...
⠋ Verifying state consistency...
⠋ Checking decision log...
```

Each spinner is replaced by the corresponding `✓` or `✗` result line.

**Edge cases:**

Scoped validation (`--scope config,state`):

```
✓ Config valid
✓ state.json consistent (8 done, all artifacts present, depths valid)

0 errors, 0 warnings (scoped: config, state)
```

Validation with auto-fix (`--fix`):

```
.scaffold/decisions.jsonl
  ⚠ [VALIDATE_DECISIONS_DUPLICATE_ID] Duplicate decision ID: D-011
    Fixed: reassigned to D-048

0 errors, 0 warnings (1 auto-fix applied)
```

**Verbose additions:**

```
[Validator] Scope: config, manifests, frontmatter, artifacts, state, decisions
[Validator:config] Checking .scaffold/config.yml... pass
[Validator:config] Checking version field: 1 (current)
[Validator:config] Checking methodology: deep (valid methodology)
[Validator:config] Checking depth: 5 (valid range 1-5)
[Validator:pipeline] Loading pipeline definition: 32 steps
[Validator:pipeline] Dependency cycle check: 29 nodes, 42 edges, no cycles
[Validator:frontmatter] Checking pipeline/pre/create-prd.md... pass
[Validator:artifacts] Checking docs/plan.md against create-prd artifact schema... pass
[Validator:state] Checking slug consistency: 32 state entries, 32 pipeline prompts, 0 orphaned
[Validator:state] Checking completed step depths: 8 completed, all depths within range (V19 pass)
[Validator:state] Checking depth within configured range: 8 completed, all within 1-5 (V20 pass)
[Validator:decisions] Checking .scaffold/decisions.jsonl: 47 entries, IDs sequential
```

---

### `scaffold add` (REMOVED)

> **Removed**: The `scaffold add` command has been eliminated. Mixin axes are no longer part of the architecture. See PRD Section 8.

---

### `scaffold list`

**Success output:**

```
Methodologies
─────────────
  deep       Deep Domain Modeling — all 32 steps at depth 5
  mvp        MVP — get to code fast, 4 steps at depth 1
  custom     Custom — pick your own steps and depth levels

Platforms
─────────
  claude-code    Generates commands/*.md thin wrappers
  codex          Generates AGENTS.md + codex-prompts/*.md
  (universal)    Always generated — prompts/*.md plain markdown
```

When run inside an initialized project, current methodology and depth are highlighted:

```
Methodologies
─────────────
  [deep]     Deep Domain Modeling — all 32 steps at depth 5
  mvp        MVP — get to code fast, 4 steps at depth 1
  custom     Custom — pick your own steps and depth levels
```

**Progress indicators:** None. Read-only command.

**Edge cases:**

Filtered by section (`--section methodologies`):

```
Methodologies
─────────────
  deep       Deep Domain Modeling — all 32 steps at depth 5
  mvp        MVP — get to code fast, 4 steps at depth 1
  custom     Custom — pick your own steps and depth levels
```

**Verbose additions:**

```
[ContentRegistry] Scanning pipeline/ for step definitions
[ContentRegistry] Found: 32 steps defined
[ContentRegistry] Methodologies: deep (32 steps, depth 5), mvp (4 steps, depth 1), custom (user-configured)
[ContentRegistry] Project config detected: .scaffold/config.yml (highlighting current selections)
```

---

### `scaffold info`

**Success output:**

```
Project: .scaffold/config.yml
  Methodology:       deep
  Depth:             5
  Platforms:         claude-code, (universal)
  Conditional:       database (enabled), api (enabled), ui-ux (disabled)

Pipeline:   32 defined / 29 enabled (3 conditional disabled)
Progress:   8/29 complete (28%)
Last build: 2026-03-12 14:23 UTC
```

**Progress indicators:** None. Read-only command.

**Edge cases:**

No state.json yet (init run but no steps executed):

```
Project: .scaffold/config.yml
  Methodology:       deep
  Depth:             5
  Platforms:         claude-code, (universal)
  Conditional:       database (enabled), api (enabled), ui-ux (enabled)

Pipeline:   32 defined / 32 enabled
Progress:   0/32 complete (0%)
Last build: 2026-03-13 10:00 UTC
```

**Step-level output** (`scaffold info <step>`):

```
Step: git-workflow (Phase 3 — System Architecture)
  Description:     Configure Git branching strategy and PR conventions
  Status:          pending
  Depth:           5
  Source:          pipeline
  Meta-prompt:     pipeline/git-workflow.md
  Knowledge base:  knowledge/git-workflow.md
  Depends on:      coding-standards ✓
  Produces:        docs/git-workflow.md
  Reads:           docs/coding-standards.md

Instructions loaded:
  Global:          .scaffold/instructions/global.md (found)
  Per-step:        .scaffold/instructions/git-workflow.md (not found)
```

When the step is completed:

```
Step: tech-stack (Phase 1 — Planning)
  Description:     Research and document technology decisions
  Status:          done (2026-03-11, depth 5)
  Depth:           5
  Source:          pipeline
  Meta-prompt:     pipeline/tech-stack.md
  Knowledge base:  knowledge/tech-stack.md
  Depends on:      create-prd ✓
  Produces:        docs/tech-stack.md (verified present)
  Completed by:    ken
```

**Verbose additions:**

```
[ConfigLoader] Config path: /Users/ken/projects/acme-web/.scaffold/config.yml
[ConfigLoader] Schema version: 1 (current)
[ConfigLoader] Unknown fields: none
[StateManager] State path: /Users/ken/projects/acme-web/.scaffold/state.json
[StateManager] Progress: 8 done, 1 skipped, 23 pending
[BuildMetadata] Last build: 2026-03-12T14:23:00Z
[BuildMetadata] Config mtime: 2026-03-12T14:20:00Z (not stale)
```

---

### `scaffold version`

**Success output:**

```
scaffold v2.1.0 (installed)
```

When an update is available:

```
scaffold v2.0.0 (installed)
scaffold v2.1.0 available — run scaffold update to upgrade
```

When offline (no network):

```
scaffold v2.1.0 (installed)
```

**Progress indicators:** None unless network check is slow (> 1s), in which case:

```
scaffold v2.1.0 (installed)
⠋ Checking for updates...
```

If the check times out or fails, no "available" line is printed.

**Edge cases:** None. Always exits 0.

**Verbose additions:**

```
[VersionManager] Installed: 2.1.0
[VersionManager] Node.js: v22.3.0
[VersionManager] Platform: darwin-arm64
[VersionManager] Registry check: https://registry.npmjs.org/@scaffold-cli/scaffold
[VersionManager] Latest: 2.1.0 (up to date)
```

---

### `scaffold update`

**Success output:**

```
scaffold v2.0.0 → v2.1.0

Changelog:
  - Add scaffold preview command
  - Fix crash recovery in --auto mode
  - Improve assembly engine performance

? Update scaffold to v2.1.0? [Y/n]

⠋ Downloading v2.1.0...
✓ scaffold updated: v2.0.0 → v2.1.0
✓ Rebuilt project (deep, 32 steps)
  Changed: 2 modified (create-prd, tech-stack)
```

**Progress indicators:**

```
⠋ Checking for updates...
⠋ Downloading v2.1.0...
⠋ Rebuilding project...
```

**Edge cases:**

Already up to date:

```
scaffold v2.1.0 is already the latest version.
```

Update with `--check-only`:

```
scaffold v2.0.0 (installed)
scaffold v2.1.0 available

Changelog:
  - Add scaffold preview command
  - Fix crash recovery in --auto mode

Run scaffold update to install.
```

Update with `--skip-build`:

```
✓ scaffold updated: v2.0.0 → v2.1.0
⚠ Build skipped (--skip-build). Run scaffold build to regenerate output files.
```

Update when no project is present:

```
✓ scaffold updated: v2.0.0 → v2.1.0
```

**Verbose additions:**

```
[UpdateManager] Current: 2.0.0, Latest: 2.1.0
[UpdateManager] Update method: npm (global)
[UpdateManager] Running: npm update -g @scaffold-cli/scaffold
[UpdateManager] npm: updated @scaffold-cli/scaffold@2.1.0
[UpdateManager] Project detected at /Users/ken/projects/acme-web
[BuildPipeline] Triggering rebuild after update...
```

---

### `scaffold dashboard`

**Success output:**

```
✓ Dashboard generated: .scaffold/dashboard.html
Opening in browser...
```

With `--no-open`:

```
✓ Dashboard generated: .scaffold/dashboard.html
  Open in browser: file:///Users/ken/projects/acme-web/.scaffold/dashboard.html
```

With custom output path:

```
✓ Dashboard generated: /tmp/pipeline-status.html
Opening in browser...
```

**Progress indicators:**

```
⠋ Generating dashboard...
```

**Edge cases:**

Browser launch failure:

```
✓ Dashboard generated: .scaffold/dashboard.html
⚠ Could not open browser automatically.
  Open manually: file:///Users/ken/projects/acme-web/.scaffold/dashboard.html
```

**Verbose additions:**

```
[DashboardGenerator] Reading .scaffold/state.json (8 done, 1 skipped, 23 pending)
[DashboardGenerator] Reading .scaffold/config.yml (methodology: deep, depth: 5)
[DashboardGenerator] Reading .scaffold/decisions.jsonl (47 entries)
[DashboardGenerator] Writing .scaffold/dashboard.html (42 KB, self-contained)
[DashboardGenerator] Launching browser: open .scaffold/dashboard.html
```

---

### `scaffold preview` (REMOVED)

> **Removed**: The `scaffold preview` command has been eliminated. Assembly is transparent; `scaffold info <step>` provides step details including meta-prompt content, knowledge base references, and depth level. See PRD Section 8.

---

### `scaffold decisions`

**Success output (all decisions):**

```
Decision Log (47 entries)
─────────────────────────

D-047  coding-standards  2026-03-12 18:41
  Use Biome for linting and formatting; target ES2022.

D-046  coding-standards  2026-03-12 18:40
  Enforce 100-character line limit; no semicolons.

D-045  tech-stack        2026-03-12 17:22
  Node.js 22 LTS with TypeScript 5.4; Fastify for HTTP.

D-044  tech-stack        2026-03-12 17:20
  PostgreSQL 16 for primary storage; Drizzle ORM.

D-043  create-prd        2026-03-10 14:15
  Target audience: internal engineering teams, 50-200 developers.

...
```

**Success output (filtered by prompt, `--prompt tech-stack`):**

```
Decision Log — tech-stack (5 entries)
─────────────────────────────────────

D-045  2026-03-12 17:22
  Node.js 22 LTS with TypeScript 5.4; Fastify for HTTP.

D-044  2026-03-12 17:20
  PostgreSQL 16 for primary storage; Drizzle ORM.

D-043  2026-03-12 17:18
  Redis for caching and session storage.

D-042  2026-03-12 17:15
  Docker Compose for local development; Kubernetes for production.

D-041  2026-03-12 17:10
  Monorepo with Turborepo; pnpm workspaces.
```

**Success output (last N, `--last 3`):**

```
Decision Log (last 3 of 47)
────────────────────────────

D-047  coding-standards  2026-03-12 18:41
  Use Biome for linting and formatting; target ES2022.

D-046  coding-standards  2026-03-12 18:40
  Enforce 100-character line limit; no semicolons.

D-045  tech-stack        2026-03-12 17:22
  Node.js 22 LTS with TypeScript 5.4; Fastify for HTTP.
```

**Progress indicators:** None. Read-only command.

**Edge cases:**

No decisions recorded yet:

```
No decisions recorded. Decisions are created as prompts are done.
Run scaffold run <step> to start the pipeline.
```

No matching decisions for filter:

```
No decisions found for prompt 'add-playwright'.
```

**Verbose additions:**

```
[DecisionLog] Reading .scaffold/decisions.jsonl (47 entries)
[DecisionLog] Filter: prompt=tech-stack → 5 matching entries
[DecisionLog] Entries sorted by timestamp (newest first)
```

---

## Section 3: Confirmation and Selection Patterns

All interactive patterns use `@inquirer/prompts` (or equivalent) and respect the `--auto` flag. When `--auto` is active, all patterns resolve to their documented default without displaying the prompt.

### 3a: Yes/No Confirmation

Format: `? <question> [Y/n]` or `? <question> [y/N]`

The capital letter indicates the default when the user presses Enter without typing. Destructive operations default to "no" (`[y/N]`). Non-destructive operations default to "yes" (`[Y/n]`).

```
? Apply this change? (Requires scaffold build to take effect.) [Y/n]
```

```
? Reset all pipeline progress? This cannot be undone (except via git). [y/N]
```

**Auto mode resolution:**
- `[Y/n]` defaults: resolved as "yes" (proceed)
- `[y/N]` defaults: resolved as "no" (abort, exit 4) unless overridden by `--confirm-reset`

### 3b: Single Selection (Radio)

Format: Arrow-key navigable list with `●` for selected and `○` for unselected. Default selection is pre-highlighted.

```
? Choose a methodology:
  ● Deep Domain Modeling    Comprehensive — all 32 steps at depth 5
  ○ MVP                     Get to code fast — 4 steps at depth 1
  ○ Custom                  Pick your own steps and depth levels
```

Arrow keys move the `●` indicator. Enter confirms the selection.

**Auto mode resolution:** Selects the default (first item, or smart suggestion when available).

### 3c: Multi-Selection (Checkbox)

Format: Space-toggleable list with `◉` for checked and `○` for unchecked. Enter confirms all selections.

```
? Select platforms (space to toggle, enter to confirm):
  ◉ claude-code     Generates commands/*.md with YAML frontmatter
  ○ codex           Generates AGENTS.md + codex-prompts/*.md
```

At least one item must be selected. Attempting to confirm with zero selections shows an inline error: `At least one platform must be selected.`

**Auto mode resolution:** Selects the default set (auto-detected or manifest defaults).

### 3d: Free Text Input

Format: `? <Prompt>: _` where `_` is the cursor position.

```
? Reason for skipping: _
```

Input is single-line. Enter submits. Empty input is accepted when the field is optional.

**Auto mode resolution:** Uses the flag value if provided (e.g., `--reason`), otherwise uses the documented default (e.g., `"auto-skipped"`).

### 3e: Three-Way Choice (Crash Recovery)

Format: Radio selection with descriptive options.

```
? Previous session interrupted: dev-env-setup. How would you like to proceed?
  ● Re-run dev-env-setup
  ○ Mark as done anyway
  ○ Cancel
```

**Auto mode resolution:** Follows the crash recovery matrix from ADR-018:
- All artifacts present: auto-mark done
- No artifacts: re-run
- Partial artifacts: re-run (safer default)

---

## Section 4: Empty State and First-Run Messaging

### 4a: `scaffold status` before any prompts done

```
Pipeline: deep | 0/32 complete (0%) | Depth: 5
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%

Phase 0 — Prerequisites
  ○ claude-code-permissions           pending

Phase 1 — Planning
  ○ create-prd                        pending
  ○ review-prd                        pending     [blocked by: create-prd]
  ○ innovate-prd                      pending     [blocked by: review-prd]  (if-needed)
  ○ tech-stack                        pending     [blocked by: create-prd]
  ○ user-stories                      pending     [blocked by: innovate-prd]
  ○ user-stories-gaps                 pending     [blocked by: user-stories]
  ...

What's Next
→ Next eligible: claude-code-permissions
  Run: scaffold run <step>
```

### 4b: `scaffold next` when pipeline is complete

```
Pipeline complete. All 32 prompts finished.

Your project scaffolding is done. Suggested next actions:
  scaffold dashboard   — View the progress dashboard
  scaffold decisions   — Review all recorded decisions
  scaffold validate    — Run a final validation check
```

### 4c: `scaffold validate` with zero issues

```
✓ Config valid
✓ Pipeline manifest valid (deep, 32 defined / 29 enabled)
✓ 29 prompts — frontmatter valid
✓ 29 build outputs — no unresolved markers
✓ state.json consistent (0 done, no artifacts to verify)
✓ decisions.jsonl — 0 entries (empty, no issues)

0 errors, 0 warnings
```

### 4d: `scaffold list` with only one methodology

```
Methodologies
─────────────
  deep       Deep Domain Modeling — all 32 steps at depth 5

Platforms
─────────
  claude-code    Generates commands/*.md thin wrappers
  codex          Generates AGENTS.md + codex-prompts/*.md
  (universal)    Always generated — prompts/*.md plain markdown
```

No special messaging. A single methodology is displayed the same way as multiple. The init wizard will pre-select it automatically.

### 4e: `scaffold run` when all steps done

```
✓ Pipeline complete — all 32 prompts finished.

Your project scaffolding is done. Suggested next actions:
  scaffold dashboard   — View the progress dashboard
  scaffold decisions   — Review all recorded decisions
  scaffold validate    — Run a final validation check
```

This message exits 0. No prompt content is emitted.

---

*Cross-references: [cli-contract.md](../api/cli-contract.md) (all 17 commands), [json-output-schemas.md](../api/json-output-schemas.md) (JSON data shapes), [state-json-schema.md](../data/state-json-schema.md) (state data for status/resume), [config-yml-schema.md](../data/config-yml-schema.md) (config data for info), [ADR-025](../adrs/ADR-025-cli-output-contract.md) (output contract decision), [init-wizard-flow.md](init-wizard-flow.md) (init wizard UX)*
