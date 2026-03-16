# Scaffold v2 — Implementation Playbook

**Phase**: final
**Depends on**: developer-onboarding-guide, all frozen phase artifacts
**Last updated**: 2026-03-16
**Status**: draft

---

## 1. How to Use This Document

- **Read the [developer onboarding guide](developer-onboarding.md) first** — it covers architecture, patterns, and setup. This playbook assumes you understand the system.
- **This playbook covers how to execute tasks** — task picking protocol, coding conventions specific to Scaffold v2, git workflow, quality gates, and inter-agent handoff format.
- **Reference this document before starting every task and before every PR.**

---

## 2. Task Execution Protocol

### 2a. How to Pick a Task

1. Read [task-breakdown.md](../implementation/task-breakdown.md) for the full task graph (55 tasks, 8 phases)
2. Identify unblocked tasks: all dependencies completed (check the dependency graph in the Mermaid diagram)
3. Claim the task — update tracking to prevent two agents working the same task
4. Read the task's acceptance criteria — these are your test specs (every `- [ ]` checkbox becomes a test case)

### 2b. Before You Start — Context Loading

For each task, read these documents in order:

1. **The task description and acceptance criteria** in [task-breakdown.md](../implementation/task-breakdown.md)
2. **All domain models referenced** in the task (listed in task dependencies) — see [domain-models/index.md](../domain-models/index.md) for current vs. archived models
3. **The TypeScript API contract** in [internal-interfaces.md](../api/internal-interfaces.md) for the module you're implementing
4. **The relevant data schema** in [data/](../data/) if the module manages persistence
5. **Any ADRs referenced** in the task description — understand the "why" behind design choices ([ADR index](../adrs/index.md))

#### Per-Phase Context Brief

| Phase | Must Read Before Starting |
|-------|--------------------------|
| 0 (Bootstrap) | [PRD §1-4](../scaffold-v2-prd.md), [system-architecture.md](../architecture/system-architecture.md), [internal-interfaces.md](../api/internal-interfaces.md) (types section), [testing-strategy.md](../testing-strategy.md) §1-2 |
| 1 (Data Layer) | Relevant domain model ([03](../domain-models/03-pipeline-state-machine.md), [06](../domain-models/06-config-validation.md), [08](../domain-models/08-prompt-frontmatter.md), [11](../domain-models/11-decision-log.md), [13](../domain-models/13-pipeline-locking.md), [16](../domain-models/16-methodology-depth-resolution.md)), relevant [data schema](../data/), [internal-interfaces.md](../api/internal-interfaces.md) (module section), [testing-strategy.md](../testing-strategy.md) §4a |
| 2 (Core Engine) | Domain models [02](../domain-models/02-dependency-resolution.md), [15](../domain-models/15-assembly-engine.md), [16](../domain-models/16-methodology-depth-resolution.md), [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md), [ADR-044](../adrs/ADR-044-runtime-prompt-generation.md), [ADR-045](../adrs/ADR-045-assembled-prompt-structure.md), [internal-interfaces.md](../api/internal-interfaces.md) (assembly/dependency sections), [testing-strategy.md](../testing-strategy.md) §4b |
| 3 (CLI Shell) | Domain model [09](../domain-models/09-cli-architecture.md), [cli-contract.md](../api/cli-contract.md), [cli-output-formats.md](../ux/cli-output-formats.md), [error-messages.md](../ux/error-messages.md), [testing-strategy.md](../testing-strategy.md) §4c |
| 4 (Commands) | [cli-contract.md](../api/cli-contract.md) (command spec), domain model [09](../domain-models/09-cli-architecture.md), [json-output-schemas.md](../api/json-output-schemas.md), [testing-strategy.md](../testing-strategy.md) §4d |
| 5 (Adapters) | [adapter-interface.md](../api/adapter-interface.md), domain model [05](../domain-models/05-platform-adapters.md), [ADR-022](../adrs/ADR-022-three-platform-adapters.md), [testing-strategy.md](../testing-strategy.md) §4e |
| 6 (Content) | All domain models, [testing-strategy.md](../testing-strategy.md) (quality criteria), [security-practices.md](../security-practices.md) §4 |
| 7 (Integration) | Full test suite structure, [operations-runbook.md](../operations-runbook.md) (CI/release), all acceptance criteria |

### 2c. Task Execution Flow

1. Create a feature branch (see [Section 4](#4-git-workflow))
2. Write failing tests from acceptance criteria (**Red**)
3. Implement minimum code to pass (**Green**)
4. Refactor without changing behavior (**Refactor**)
5. Commit each red-green-refactor cycle
6. Run all quality gates (see [Section 5](#5-quality-gates))
7. Create PR, wait for CI, squash-merge

---

## 3. Coding Conventions for Scaffold v2

These conventions are derived from the actual v2 architecture and TypeScript API contracts — not generic patterns.

### 3a. Module Patterns

**Core modules** (StateManager, LockManager, AssemblyEngine, ConfigLoader): Classes with constructor injection. Dependencies passed in constructor, never resolved via service locator or global singleton. Public methods match the contracts in [internal-interfaces.md](../api/internal-interfaces.md).

```typescript
// Example: StateManager constructor injection
export class StateManager {
  constructor(
    projectRoot: string,
    computeEligible: (steps: Record<string, StepStateEntry>) => string[]
  ) { ... }
}
```

**Utility modules** (`src/utils/`): Plain exported functions. Stateless — no side effects beyond file I/O. Examples: `atomicWriteFile()`, `findClosestMatch()`, `createScaffoldError()`.

**Type modules** (`src/types/`): Interfaces and type aliases only. One barrel file exception: `src/types/index.ts` re-exports all types (this is the only barrel file in the codebase).

### 3b. File and Directory Naming

Source directory layout from the [system architecture](../architecture/system-architecture.md):

```
src/
├── cli/          # CLI framework, commands, output formatting, middleware
├── core/
│   ├── assembly/ # Assembly engine (7 stages)
│   └── dependency/ # Dependency resolution (Kahn's algorithm)
├── state/        # State manager, lock, decisions, completion detection
├── config/       # Config loader, schema, migration
├── validation/   # Cross-cutting validators
├── project/      # Project detector, adopt, CLAUDE.md manager, frontmatter
├── wizard/       # Init wizard, suggestion, signals
├── dashboard/    # Self-contained HTML dashboard generator
├── types/        # Centralized type definitions (barrel exception)
└── utils/        # Shared utilities (fs, levenshtein, errors)
```

Rules:
- **kebab-case** for all files: `state-manager.ts`, `dependency-resolver.ts`
- **Co-located tests**: `state-manager.test.ts` next to `state-manager.ts`
- **One primary export per file** matching the filename
- **No barrel/index files** except `src/types/index.ts`
- **All imports use direct paths**: `import { resolve } from '../core/dependency/resolver'`

### 3c. TypeScript Conventions

Derived from [internal-interfaces.md](../api/internal-interfaces.md) and [testing-strategy.md](../testing-strategy.md):

- **Strict mode**: `strict: true` in `tsconfig.json`
- **ES2022 target**, ESM modules
- **Explicit return types** on public APIs
- **`interface`** for public contracts (StateManager, AssemblyEngine, etc.)
- **`type`** for unions and intersections (`DepthLevel = 1 | 2 | 3 | 4 | 5`)
- **Constructor injection** for dependencies — no global singletons, no service locators
- **Synchronous fs APIs** per single-process model — `fs.readFileSync`, `fs.writeFileSync`, `fs.renameSync` — no `async`/`await` for file I/O
- Event loop used only for `@inquirer/prompts` interactive input

### 3d. Error Handling

From [error-messages.md](../ux/error-messages.md) and [ADR-040](../adrs/ADR-040-error-handling-philosophy.md):

**Structured errors**: Use `ScaffoldError` objects with `code`, `message`, `file`, and fix suggestion. Error factories in `src/utils/errors.ts`.

```typescript
// Example: creating a structured error
throw createScaffoldError({
  code: 'CONFIG_MISSING',
  message: `Config file not found at ${configPath}`,
  file: configPath,
  recovery: 'Run "scaffold init" to create a project configuration'
});
```

**Error code prefixes** by component: `CONFIG_*`, `FIELD_*`, `DEP_*`, `STATE_*`, `LOCK_*`, `STEP_*`, `ASM_*`, `INIT_*`, `MIGRATE_*`, `RESOLUTION_*`.

**Build-time** (`scaffold build`, `scaffold validate`): **Accumulate** all errors — report grouped by source file, errors before warnings. User fixes multiple issues in one session.

**Runtime** (`scaffold run`, `scaffold skip`, `scaffold reset`): **Fail-fast** on first structural error. Warnings reported but don't block execution.

**Fuzzy match suggestions**: For typos (Levenshtein distance ≤ 2), include "Did you mean...?" in error messages.

**Exit codes**: 0 (success), 1 (validation), 2 (dependency), 3 (state/lock), 4 (cancellation), 5 (assembly/build).

### 3e. File I/O Patterns

From the [data schemas](../data/):

- **Atomic writes**: Write to `<file>.tmp`, then `fs.renameSync()` — never modify files in-place

```typescript
fs.writeFileSync(filePath + '.tmp', data);
fs.renameSync(filePath + '.tmp', filePath);
```

- **Exclusive create for locks**: `fs.writeFileSync(path, data, { flag: 'wx' })` — fails if file exists (POSIX `O_CREAT | O_EXCL`)
- **JSONL append**: `fs.appendFileSync()` for `decisions.jsonl` — one compact JSON object per line, `\n` terminated, no pretty-printing
- **Path validation**: Resolve with `path.resolve()`, verify within project root, reject null bytes
- **Forward compatibility**: Unknown fields in config/state produce warnings, not errors ([ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md)). Preserve unknown fields on read/write — never strip them.

### 3f. What NOT To Do

Compiled from [security-practices.md](../security-practices.md) and key ADRs:

- **No `eval()`**, `new Function()`, `vm.runInContext()` — content files are data, never code
- **No `child_process.exec()`** with string concatenation — use `execFile()` with arg arrays if shell is needed
- **No network requests** except in `src/cli/commands/update.ts` (PRD constraint NF-013)
- **No credentials**, API keys, `.env` files (PRD constraint NF-012)
- **No `require()`** or dynamic `import()` for content files — they are concatenated as plain text
- **No Bash 4+ features** in any shell scripts (macOS 3.2 compatibility)
- **No `async`/`await`** for file I/O — synchronous fs APIs only (single-process model)
- **No barrel/index files** except `src/types/index.ts`
- **No service locators or global singletons** — use constructor injection

---

## 4. Git Workflow

Follows the project's standard GitHub flow from [git-workflow.md](../../git-workflow.md).

### 4a. Branch Naming

```
type/short-description
```

Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`.

Examples for v2 tasks:
```
feat/state-manager
feat/assembly-engine
test/assembly-engine-e2e
fix/config-unknown-fields
```

### 4b. Commit Format

```
type(scope): description
```

Scope is the module: `state`, `config`, `assembly`, `cli`, `deps`, `types`, `utils`, `wizard`, `dashboard`, `adapters`.

Imperative mood, lowercase after type.

Examples:
```
feat(state): implement atomic write for state.json
test(assembly): add determinism test for 7-section output
fix(config): handle unknown fields with warnings per ADR-033
refactor(types): extract DepthLevel union to shared types
```

### 4c. PR Workflow

1. `npm run check` locally (must exit 0)
2. Push branch: `git push -u origin HEAD`
3. Create PR: `gh pr create`
4. Wait for CI (`check` job) to pass
5. Squash-merge: `gh pr merge --squash --delete-branch`
6. Pull updated main: `git checkout main && git pull origin main`

### 4d. One Task = One Branch = One PR

Enforce the mapping. No multi-task PRs unless tasks are trivially related (e.g., T-001 bootstrap + T-002 types in Phase 0).

---

## 5. Quality Gates

Every PR must pass all gates before merge. Run them locally before pushing.

### Gate 1: Type Check

```bash
npx tsc --noEmit
```

All TypeScript files must compile without errors under strict mode.

### Gate 2: Lint

```bash
npm run lint
```

ESLint with `@typescript-eslint` rules. No warnings, no errors.

### Gate 3: Tests Pass

```bash
npm test
```

Vitest runs all unit and integration tests. Zero failures.

### Gate 4: Coverage Meets Threshold

Coverage targets from [testing-strategy.md](../testing-strategy.md):

| Module Group | Branch Target | Line Target |
|-------------|--------------|-------------|
| `src/types/` | N/A (pure types) | 100% |
| `src/utils/` | ≥ 85% | ≥ 90% |
| `src/state/`, `src/config/`, `src/project/` | ≥ 80% | ≥ 85% |
| `src/core/assembly/`, `src/core/dependency/` | ≥ 85% | ≥ 90% |
| `src/cli/` | ≥ 75% | ≥ 80% |
| `src/validation/` | ≥ 85% | ≥ 90% |
| `src/core/adapters/` | ≥ 80% | ≥ 85% |

```bash
npm run test:coverage
```

### Gate 5: All Gates Combined

```bash
npm run check    # lint && type-check && test — must exit 0
```

### Gate 6: Self-Review

Before pushing, review your own diff against:
- The **acceptance criteria** for the task — every checkbox must be covered
- The **TypeScript API** in [internal-interfaces.md](../api/internal-interfaces.md) — do public APIs match the contracts?
- **Error codes** in [error-messages.md](../ux/error-messages.md) — are you using the right codes and exit codes?

```bash
git diff origin/main...HEAD
```

---

## 6. Per-Phase Execution Guidance

### Phase 0 — Bootstrap (T-001, T-002, T-003)

**Tasks**:
- **T-001**: Initialize TypeScript project (`package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`)
- **T-002**: Define 15 core type definition files in `src/types/`
- **T-003**: Implement utility modules (`fs.ts`, `levenshtein.ts`, `errors.ts`)

**Dependencies**: T-001 → T-002, T-001 → T-003. T-002 and T-003 can parallelize after T-001.

**Max parallelism**: 2 concurrent (T-002 + T-003).

**Patterns**: T-001 creates the skeleton — `npm run check` must pass on the empty project before moving on. T-002 produces type-only modules (no runtime code, but tests verify enum values match spec). T-003's utilities must hit ≥ 85% branch coverage.

**Pitfalls**: Get the `tsconfig.json` strict settings right in T-001 — every subsequent task depends on them. T-002's types barrel file (`src/types/index.ts`) is the only exception to the no-barrel rule.

**Phase complete when**: `npm run check` passes on the skeleton with types and utilities.

### Phase 1 — Data Layer (T-004 through T-010)

**Tasks**:
- **T-004**: Frontmatter parser (YAML extraction, Zod validation, kebab→camelCase)
- **T-005**: Config loader & validator (6-phase validation, v1→v2 migration, fuzzy matching)
- **T-006**: Methodology preset loader (deep/mvp/custom, step enablement maps)
- **T-007**: State manager with atomic writes (CRUD, `next_eligible` computation)
- **T-008**: Completion detection & crash recovery (dual detection: state + artifact)
- **T-009**: Decision logger (JSONL append, D-NNN IDs, filtering)
- **T-010**: Lock manager with PID liveness (advisory locking, stale detection)

**Dependencies**: T-004, T-005, T-007, T-009, T-010 can start after T-002/T-003. T-006 depends on T-004 and T-005. T-008 depends on T-007.

**Max parallelism**: 5 concurrent (T-004, T-005, T-007, T-009, T-010).

**Patterns**: Every module manages one file format and uses atomic writes. Test the atomic write failure mode (crash mid-write leaves `.tmp` file). Test forward compatibility — unknown fields preserved per [ADR-033](../adrs/ADR-033-forward-compatibility-unknown-fields.md).

**Pitfalls**: T-006 depends on both T-004 and T-005 — don't start it until both are merged. State manager (T-007) is on the critical path — prioritize it.

**Phase complete when**: All 7 tasks merged, all data modules pass coverage targets (≥ 80% branch), atomic writes verified.

### Phase 2 — Core Engine (T-011 through T-018)

**Tasks**:
- **T-011**: Dependency resolver (Kahn's algorithm, cycle detection)
- **T-012**: Depth resolution (4-level precedence: CLI > custom > preset > default)
- **T-013**: Meta-prompt loader (parse `pipeline/*.md`, frontmatter + sections)
- **T-014**: Knowledge base loader (directory scanning, name-to-filepath index)
- **T-015**: Context gatherer (4 sources: artifacts, config, state, decisions)
- **T-016**: Instruction loader (3-layer precedence: global > per-step > CLI)
- **T-017**: Assembly engine orchestrator (9-step → 7-section prompt, < 500ms budget)
- **T-018**: Update mode + methodology change detection

**Dependencies**: T-011 through T-016 can parallelize (up to 6 concurrent). T-017 blocks on all of T-011–T-016. T-018 blocks on T-017.

**Max parallelism**: 6 concurrent for T-011–T-016.

**Patterns**: Assembly engine (T-017) is the integration point — test **determinism** (same inputs → byte-identical output). The 7 assembled prompt sections follow [ADR-045](../adrs/ADR-045-assembled-prompt-structure.md). Performance budget: < 500ms p95 for full assembly.

**Pitfalls**: T-017 depends on 5 other tasks — it will be the last started in this phase. T-012 (depth resolution) is on the critical path; prioritize it. The 4-level depth precedence chain (CLI flag > step override > custom default > preset default) must be tested exhaustively.

**Phase complete when**: All 8 tasks merged, assembly produces deterministic 7-section output, coverage ≥ 85% branch for core modules.

### Phase 3 — CLI Shell (T-019 through T-022)

**Tasks**:
- **T-019**: CLI framework (yargs, 15 command stubs, global flags)
- **T-020**: Output context system (Interactive/JSON/Auto strategy pattern)
- **T-021**: Error display & formatting (single/batch, fuzzy suggestions, file grouping)
- **T-022**: CLI middleware (project root detection, output mode resolution)

**Dependencies**: T-019 → T-020 → T-021 is sequential. T-022 can parallel with T-020/T-021. **Can start in parallel with Phase 2** (CLI shell is independent of core engine).

**Max parallelism**: 2 concurrent (T-022 parallel with T-020/T-021 chain).

**Patterns**: Three output modes (interactive, JSON, auto) — every test should verify all three. Interactive mode uses colors and spinners; JSON mode outputs `{ success, data, errors }` envelopes; auto mode (non-TTY) suppresses decoration.

**Pitfalls**: T-021 (error display) is a bottleneck — 15 downstream tasks (every command needs error formatting). Prioritize it. The `NO_COLOR` environment variable must be respected.

**Phase complete when**: All 4 tasks merged, CLI responds to `--help` for all 15 stubs, output modes verified for interactive/JSON/auto.

### Phase 4 — Commands (T-023 through T-038)

**Tasks (16 total)**:

*Read Commands (6)*: T-023 `status`, T-024 `next`, T-025 `info`, T-026 `list`, T-027 `decisions`, T-028 `version`

*Mutating Commands (3)*: T-029 `run` (core command), T-030 `skip`, T-031 `reset`

*Setup Commands (4)*: T-032 project detector, T-033 init wizard, T-034 `build`, T-035 `adopt`

*Utility Commands (3)*: T-036 `validate`, T-037 `dashboard`, T-038 `update`

**Dependencies**: Read commands (T-023–T-028) can mostly parallelize after T-021. T-029 (`run`) depends on Phase 2 engine + Phase 3 shell. Setup commands depend on T-022. T-037 (`dashboard`) is independent.

**Max parallelism**: 10+ concurrent.

**Patterns**: Every command test covers: happy path, error path, JSON mode, auto mode. Mutating commands acquire locks. Read commands do not acquire locks. T-029 (`run`) is the most complex — it orchestrates lock → crash recovery → dependency check → assembly → completion prompt → state write.

**Pitfalls**: T-029 (`run`) depends on nearly everything — it's the last mutating command. It's on the critical path. T-033 (init wizard) uses `@inquirer/prompts` — the only async code in the project. T-028 (`version`) makes the sole allowed network request (npm registry check with 3s timeout).

**Phase complete when**: All 16 tasks merged, every command works in interactive + JSON + auto modes, coverage ≥ 75% branch for CLI commands.

### Phase 5 — Platform Adapters (T-039 through T-043)

**Tasks**:
- **T-039**: Adapter interface factory (PlatformAdapter interface, lifecycle: initialize/generateStepWrapper/finalize)
- **T-040**: Claude Code adapter (`commands/*.md` with YAML frontmatter)
- **T-041**: Codex adapter (single `AGENTS.md`, phase-grouped steps)
- **T-042**: Universal adapter (`prompts/*.md`, stdout-based)
- **T-043**: CLAUDE.md manager (reserved sections, ownership markers, 2000-token budget)

**Dependencies**: T-040, T-041, T-042, T-043 can parallelize after T-039.

**Max parallelism**: 4 concurrent.

**Patterns**: Adapters are thin wrappers — **deterministic output** (same input → identical files). Use snapshot testing. Each adapter follows the initialize → generateStepWrapper → finalize lifecycle.

**Pitfalls**: T-043 (CLAUDE.md manager) has token budgeting logic — test the 2000-token total budget with edge cases (section overflow, token counting via word-count approximation).

**Phase complete when**: All 5 tasks merged, `scaffold build` generates correct output for all 3 platforms, snapshot tests pass.

### Phase 6 — Content Authoring (T-044 through T-051)

**Tasks**:
- **T-044**: Methodology presets (deep.yml, mvp.yml, custom-defaults.yml)
- **T-045**: Core knowledge base (10 entries)
- **T-046**: Review knowledge base (11 entries)
- **T-047**: Validation/product knowledge base (11 entries)
- **T-048**: Meta-prompts product/domain (8 steps)
- **T-049**: Meta-prompts architecture/data (4 steps)
- **T-050**: Meta-prompts implementation/finalization (14 steps)
- **T-051**: Meta-prompts review (10 steps)

**Dependencies**: 6 concurrent. **Can start in parallel with Phase 4/5** — content authoring is independent of CLI code.

**Max parallelism**: 6 concurrent.

**Patterns**: Meta-prompts are 30–80 lines of YAML frontmatter + intent declarations — NOT actual prompt text. They declare purpose, inputs, outputs, quality criteria, methodology-scaling guidance. Knowledge base entries are topic-organized and methodology-independent.

**Pitfalls**: Knowledge base entry names must match the `knowledge-base` references in meta-prompt frontmatter exactly. Methodology presets must reference step names matching meta-prompt `name` fields. Validate with `scaffold validate` after authoring.

**Phase complete when**: All 8 tasks merged, all 36 meta-prompts and all KB entries validate, methodology presets reference valid step names.

### Phase 7 — Integration & Polish (T-052 through T-055)

**Tasks**:
- **T-052**: E2E tests (5 scenarios: full pipeline, init wizard, crash recovery, methodology change, update mode)
- **T-053**: npm packaging (files, bin.scaffold, prepublish script)
- **T-054**: v1→v2 migration guide
- **T-055**: Performance validation (assembly < 500ms p95, listing < 200ms, state I/O < 100ms, build < 2s)

**Dependencies**: T-052 and T-054 can parallelize. T-053 and T-055 depend on T-052.

**Max parallelism**: 2 concurrent (T-052 + T-054), then 2 concurrent (T-053 + T-055).

**Patterns**: E2E tests mock the AI execution boundary — programmatically mark steps complete and create stub artifacts. Performance tests use `vitest bench` against p95 budgets. Package verification: `npm pack --dry-run` must include `dist/`, `pipeline/`, `knowledge/`, `methodology/`.

**Pitfalls**: E2E tests have a 30-second timeout in vitest config — design scenarios to complete well within this. T-053 (packaging) must verify no sensitive files leak (no `src/`, `tests/`, `docs/`, `.scaffold/`, `.github/`).

**Phase complete when**: All 4 tasks merged, E2E suite passes, `npm pack` produces correct tarball, all performance budgets met.

---

## 7. Inter-Agent Handoff

### 7a. Task Completion Record

When you finish a task, include in the PR description:

1. **What was implemented** — 2–3 sentences on the approach
2. **Assumptions made** — any decision not explicit in the specs
3. **What's left** — known limitations or follow-up items
4. **Watch out** — gotchas for downstream tasks
5. **Files modified** — list of files touched

### 7b. Handoff Template

```markdown
## Task T-0XX Completion: [Task Title]

### Summary
[2-3 sentences: what was built, what pattern was followed]

### Assumptions
- [Decision not in specs, e.g., "Used zod for validation instead of manual checks"]

### Not Included
- [Deferred work, e.g., "Performance optimization deferred to T-055"]

### Watch Out
- [Gotchas, e.g., "StateManager.loadState() throws on missing file — callers must handle"]

### Files
- src/state/state-manager.ts (new)
- src/state/state-manager.test.ts (new)
- src/types/state.ts (modified — added StepStatus type)
```

### 7c. Parallel Agent Rules

1. **Never work on the same file simultaneously** — sequence those tasks
2. **Rebase on main before pushing** — other agents are merging constantly
3. **Claim tasks atomically** — check-then-claim is a race condition; update tracking in one operation
4. **Communicate through the task system, not assumptions** — if you discover something that affects another task, record it in the handoff

---

## 8. Critical Path Awareness

The critical path determines minimum calendar time. These 10 tasks must be prioritized:

```
T-001 → T-002 → T-004 → T-006 → T-012 → T-017 → T-018 → T-029 → T-052 → T-053
```

**What this means**:
- Delays on any of these 10 tasks delay everything
- Non-critical tasks can slip without affecting the overall schedule
- **Bottleneck tasks** that unblock the most downstream work:
  - **T-002** (types) — blocks 6 downstream tasks
  - **T-004** (frontmatter) — blocks 12 downstream tasks (meta-prompts, KB, presets, detector all parse frontmatter)
  - **T-017** (assembly engine) — blocks T-018 and T-029
  - **T-021** (error display) — blocks 15 downstream tasks (every command needs error formatting)
- When choosing between tasks, always pick the one closer to the critical path
