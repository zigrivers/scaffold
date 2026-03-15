<!-- scaffold:testing-strategy v4 2026-03-14 -->

# Scaffold v2 — Testing & Quality Strategy

**Phase**: 8 — Testing Strategy
**Depends on**: Phase 3 (system-architecture), Phase 4 (data schemas), Phase 5 (cli-contract, json-output-schemas), Phase 6 (error-messages), Phase 7 (task-breakdown)
**Last updated**: 2026-03-14
**Status**: draft

---

## 1. Testing Philosophy & Principles

### TDD Is Mandatory

Every implementation task in `task-breakdown.md` follows the Red → Green → Refactor cycle:

1. **Red**: Write a failing test that encodes an acceptance criterion from the task.
2. **Green**: Write the minimum code to make the test pass.
3. **Refactor**: Clean up without changing behavior. Tests must still pass.
4. **Commit**: Each red-green-refactor cycle produces a commit.

No implementation code exists without a failing test first.

### Test Contracts, Not Implementations

Tests assert **observable behavior** through public module APIs:

- Assert the shape and content of files written to disk — not which internal function wrote them.
- Assert exit codes and JSON envelope fields — not which middleware ran.
- Assert that `state.json` transitions correctly — not that `_writeState()` was called with specific arguments.

If refactoring internals breaks tests, the tests are wrong.

### Acceptance Criteria Are Test Specs

Every `- [ ]` acceptance criterion in `task-breakdown.md` maps to a test case. Example:

```
Task T-006 criterion: "Rejects depth outside 1-5 range (FIELD_INVALID_DEPTH)"
```

Becomes:

```typescript
it('rejects depth outside 1-5 range with FIELD_INVALID_DEPTH error', () => {
  const result = validateConfig({ ...validConfig, custom: { default_depth: 7 } });
  expect(result.errors).toContainEqual(
    expect.objectContaining({ code: 'FIELD_INVALID_DEPTH' })
  );
});
```

---

## 2. Test Framework & Tooling

| Tool | Purpose | Configuration |
|------|---------|---------------|
| **Vitest** | Test runner, assertions, mocking | `vitest.config.ts` (T-001) |
| **v8 provider** | Code coverage | Built-in vitest coverage |
| **Vitest benchmark** | Performance testing | `vitest.config.ts` bench config |

### Commands

| Command | Purpose | When to Run |
|---------|---------|-------------|
| `npm test` | Full unit + integration suite | Before every commit |
| `npm run test:coverage` | Unit tests with coverage report | CI pipeline |
| `npm run test:e2e` | End-to-end scenarios | CI pipeline |
| `npm run test:bench` | Performance benchmarks | Manual/scheduled |

### Shared Utilities

`tests/helpers/test-utils.ts` (created in T-001) provides:

- `createTestProject()` — creates a temp directory with minimal `.scaffold/` structure
- `createTestConfig()` — generates valid `ScaffoldConfig` objects with selective overrides
- `createTestState()` — generates valid `PipelineState` objects with step status overrides
- `createTestDecision()` — generates valid `DecisionEntry` objects
- `cleanupTestProject()` — removes temp directories

---

## 3. Test Organization & File Structure

### Co-Located Unit Tests

Unit tests live next to their source files:

```
src/
  utils/
    errors.ts              → errors.test.ts
  config/
    loader.ts              → loader.test.ts
    migration.ts           → migration.test.ts
  validation/
    config-validator.ts    → config-validator.test.ts
  project/
    frontmatter.ts         → frontmatter.test.ts
  state/
    state-manager.ts       → state-manager.test.ts
    completion.ts          → completion.test.ts
    lock-manager.ts        → lock-manager.test.ts
    decision-logger.ts     → decision-logger.test.ts
  core/
    dependency/
      dependency.ts        → dependency.test.ts
    assembly/
      engine.ts            → engine.test.ts
      depth-resolver.ts    → depth-resolver.test.ts
      preset-loader.ts     → preset-loader.test.ts
  cli/
    commands/
      init.ts              → init.test.ts
      run.ts               → run.test.ts
      status.ts            → status.test.ts
      ...                  → ....test.ts
    output/
      interactive.ts       → interactive.test.ts
      json.ts              → json.test.ts
      auto.ts              → auto.test.ts
```

### Separate Directories

```
tests/
  integration/             → component-to-component tests
    assembly-frontmatter.test.ts
    assembly-state.test.ts
    state-lock.test.ts
    validator-schemas.test.ts
    dashboard-integration.test.ts
    error-handling.test.ts
    config-pipeline.test.ts
  e2e/                     → end-to-end scenarios
    full-pipeline.test.ts
    init-wizard.test.ts
    crash-recovery.test.ts
    methodology-change.test.ts
    update-mode.test.ts
  performance/             → benchmark tests
    assembly-benchmark.test.ts
    state-io-benchmark.test.ts
    build-benchmark.test.ts
  helpers/                 → shared test utilities
    test-utils.ts
  fixtures/                → test data
    configs/               → config.yml variants
    states/                → state.json snapshots
    meta-prompts/          → sample pipeline/*.md files
    knowledge/             → sample knowledge base entries
    frontmatter/           → valid/invalid frontmatter samples
```

### Test Description Convention

```typescript
describe('ConfigLoader', () => {
  describe('load()', () => {
    it('parses a minimal valid config', () => { ... });
    it('returns FIELD_INVALID_METHODOLOGY when methodology is unknown', () => { ... });
    it('applies fuzzy suggestion when Levenshtein distance is 2 or less', () => { ... });
  });
});
```

Pattern: `describe('<ModuleName>')` → `describe('<methodName>()')` → `it('<verb>s <expected behavior> when <condition>')`.

---

## 4. Unit Testing Strategy (Per Module)

### 4a. Data Layer (T-004 through T-010)

**Frontmatter Parser** (`src/project/frontmatter.ts`):
- Test against fixture `.md` files in `tests/fixtures/frontmatter/`
- Valid: all required fields, optional fields present, knowledge-base array
- Invalid: missing `name`, non-kebab-case name, missing `outputs`, unclosed `---` delimiter
- Edge cases: empty frontmatter, no frontmatter at all, trailing whitespace on delimiters
- **Mock boundary**: None — pure parsing, no I/O beyond reading the fixture string

**Config Loader** (`src/config/loader.ts`):
- Test against fixture `config.yml` files in `tests/fixtures/configs/`
- Fixtures: minimal valid, deep methodology, MVP, custom with overrides, missing `version`, unknown fields, v1 format (for migration), typo in methodology (`"deap"`)
- Verify fuzzy matching: `"deap"` → `Did you mean "deep"?` (Levenshtein ≤ 2)
- Verify unknown field warnings (ADR-033): unknown top-level key produces `CONFIG_UNKNOWN_FIELD` warning, not error
- Verify migration: v1 config → v2 config (removes `mixins`, changes `methodology` to enum, sets `version: 2`)
- **Mock boundary**: Mock `fs.readFile` to return fixture content; do not hit real filesystem

**State Manager** (`src/state/state-manager.ts`):
- Test CRUD operations against temp files (use `createTestProject()`)
- Verify atomic write pattern: write to `.tmp`, then `fs.rename()`
- Verify `.tmp` file does not persist after successful write
- Verify schema validation: reject state with unknown status values, missing `schema_version`
- Test `in_progress` lifecycle: set before execution, clear after completion
- Verify completion detection: artifacts on disk override state.json (ADR-018)
- **Dual completion detection 4-cell matrix** (ADR-018, `src/state/completion.ts`): each scenario sets `in_progress` to a non-null `InProgressRecord`, configures the artifact condition, calls `checkCompletion()`, and asserts the result:
  - All artifacts exist → `confirmed_complete` (auto-mark completed, clear `in_progress`)
  - No artifacts exist → `incomplete` (recommend re-run)
  - Partial artifacts (some present, some missing) → `partial` (offer user choice; `--auto` mode: re-run)
  - Zero-byte artifact present → `confirmed_complete` with `PSM_ZERO_BYTE_ARTIFACT` warning (file existence is the check, not file size)
- **Mock boundary**: Use real filesystem via temp directories; mock nothing

**Decision Logger** (`src/state/decision-logger.ts`):
- Test append-only semantics: new entry appended, existing entries untouched
- Verify JSONL line format: each entry is valid JSON, newline-terminated
- Verify ID generation: sequential `D-NNN`, monotonically increasing
- Test truncated line detection: simulate crash by writing partial JSON
- Test concurrent writes: verify line-level atomicity (< 4KB per line)
- **Mock boundary**: Use real filesystem via temp directories

**Lock Manager** (`src/state/lock-manager.ts`):
- Test exclusive create: `{ flag: 'wx' }` fails with `EEXIST` if lock exists
- Test PID liveness check: live PID → lock is held; dead PID → stale
- Test stale detection: `process.kill(pid, 0)` throws `ESRCH` → auto-clear
- Test PID recycling: `processStartedAt` mismatch > 2 seconds → stale
- Test `EPERM`: different user → treat as stale
- **Platform-specific PID timestamp retrieval**: `processStartedAt` is obtained via platform-specific methods (macOS: `ps -o lstart=`, Linux: `/proc/PID/stat` field 22, fallback: `new Date().toISOString()`). Mock the platform detection layer (e.g., `getPlatform()` or `os.platform()`) — not `child_process.exec` directly — so unit tests exercise each platform branch independently. Provide fixtures for each platform's raw output format: a `ps -o lstart=` sample string, a `/proc/PID/stat` content string with field 22 populated, and a fallback path that returns an ISO timestamp.
- **Mock boundary**: Mock `process.kill()` for PID checks; mock `os.hostname()` for holder field; mock platform detection for `processStartedAt` branches; use real filesystem via temp directories

**Methodology Preset Loader** (`src/core/assembly/preset-loader.ts`):
- Test against fixture preset YAML files in `tests/fixtures/presets/`
- Fixtures: `deep.yml` (all 32 steps enabled, `default_depth: 5`), `mvp.yml` (4 steps enabled, `default_depth: 1`), `custom-defaults.yml` (all steps enabled, `default_depth: 3`)
- Verify step name validation: all step names in preset must match meta-prompt names → `PRESET_INVALID_STEP` on mismatch
- Verify warning when meta-prompt exists but is not listed in preset → `PRESET_MISSING_STEP`
- Verify `default_depth` validation: 0 or 6 → error; 1-5 → valid
- Verify conditional step handling: `conditional: "if-needed"` parsed correctly
- **Mock boundary**: Mock `fs.readFile` to return fixture content; mock meta-prompt directory listing for cross-reference validation

### 4b. Core Engine (T-011 through T-018)

**Dependency Resolver** (`src/core/dependency/dependency.ts`):
- Test with hand-crafted dependency graphs:
  - Linear chain: A → B → C
  - Diamond: A → B, A → C, B → D, C → D
  - Parallel: A, B, C (no edges)
  - Cycle: A → B → C → A → `DEP_CYCLE_DETECTED`
  - Self-reference: A → A → `DEP_SELF_REFERENCE`
  - Missing target: A → X (X not in graph) → `DEP_TARGET_MISSING`
- Verify topological sort produces valid ordering
- **Mock boundary**: None — pure algorithm, in-memory graph

**Depth Resolver** (`src/core/assembly/depth-resolver.ts`):
- Test 4-level precedence chain:
  1. CLI flag `--depth 3` (highest priority)
  2. `config.yml` `custom.steps.<step>.depth: 4`
  3. Methodology preset `default_depth: 5`
  4. Built-in default (3)
- Each level overrides lower levels
- Test boundary values: depth 0 → `FIELD_INVALID_DEPTH`, depth 6 → `FIELD_INVALID_DEPTH`, depth 1-5 → valid
- Test methodology change: `config.methodology` differs from `state.methodology` → `PSM_METHODOLOGY_MISMATCH` warning
- **Mock boundary**: None — pure resolution logic

**Assembly Engine** (`src/core/assembly/engine.ts`):
- Test 7-section output structure: System, Meta-prompt, Knowledge base, Context, Methodology, Instructions, Execution instruction
- **Critical**: Verify determinism — same inputs must produce byte-identical output. Run assembly twice with identical inputs, assert `output1 === output2`
- Test update mode detection: artifact exists + step completed → update mode context included (ADR-048)
- Test user instruction loading: global + per-step + inline, in precedence order (ADR-047)
- Test with missing knowledge base entry → `FRONTMATTER_KB_ENTRY_MISSING`
- Snapshot testing for assembled prompt structure (use inline snapshots for small sections)
- **Mock boundary**: Mock filesystem reads for meta-prompts, knowledge base, instructions, artifacts

**Methodology Change Detection**:
- Test: `state.config_methodology === 'deep'`, `config.methodology === 'mvp'` → warning emitted
- Test: completed steps preserved, orphaned steps preserved, new steps added as `pending`
- **Mock boundary**: None — pure comparison logic

### 4c. CLI Shell (T-019 through T-022)

**Output Context** (`src/cli/output/`):
- `InteractiveOutput`: captures to string buffer, verify human-readable text includes expected content
- `JsonOutput`: produces valid JSON envelope `{ success, command, data, errors, warnings, exit_code }` — parse and validate schema
- `AutoOutput`: verify no interactive prompts emitted, verify defaults applied for decisions
- **Mock boundary**: Mock `process.stdout.write` and `process.stderr.write`

**Middleware** (`src/cli/middleware/`):
- Project root detection: walk up directories looking for `.scaffold/`; test with nested directories, missing `.scaffold/`, `--root` override
- Output mode resolution: `--format json` → JSON mode, `--auto` → auto mode, neither → interactive mode, both → combined
- **Mock boundary**: Mock `process.cwd()` for root detection tests

**Error Display** (`src/cli/output/`):
- Test error grouping by source file: errors from `config.yml` grouped together, errors from `state.json` grouped separately
- Test errors-before-warnings ordering within each group
- Test fuzzy suggestion rendering: `Did you mean "deep"?` appears in error output
- **Mock boundary**: None — pure formatting

### 4d. Commands (T-023 through T-038)

Each command gets a focused test file. Every command test covers:

1. **Happy path** with expected output
2. **At least one error path** with correct exit code
3. **JSON output mode** returns correct envelope schema
4. **Auto mode** behavior (no prompts, safe defaults)

Example pattern for `scaffold status`:

```typescript
describe('StatusCommand', () => {
  it('displays pipeline progress for a valid project', async () => {
    const project = createTestProject({ completedSteps: ['create-prd'] });
    const result = await runCommand(['status'], { cwd: project });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('1/');
  });

  it('returns exit code 1 when config is missing', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'test-'));
    const result = await runCommand(['status'], { cwd: emptyDir });
    expect(result.exitCode).toBe(1);
  });

  it('returns valid JSON envelope with --format json', async () => {
    const project = createTestProject();
    const result = await runCommand(['status', '--format', 'json'], { cwd: project });
    const envelope = JSON.parse(result.stdout);
    expect(envelope).toMatchObject({
      success: true,
      command: 'status',
      exit_code: 0,
    });
    expect(envelope.data).toHaveProperty('steps');
  });
});
```

**Exit code testing per command**: Every command must verify at least one non-zero exit code. `scaffold run` (T-029) must test all 6 exit codes (0-5):
- 0: successful run
- 1: invalid step slug
- 2: dependency not met
- 3: lock held in `--auto` mode
- 4: user cancellation
- 5: assembly engine failure

**Do NOT** test that yargs routes to the correct handler — test the handler logic directly.

**Mock boundary**: Mock all data layer modules (`ConfigLoader`, `StateManager`, `LockManager`, `DecisionLogger`, `AssemblyEngine`). Assert the handler calls them correctly and formats output.

### 4e. Platform Adapters (T-039 through T-042)

- Test that file generation is deterministic: same input → identical files
- Test Claude Code adapter: produces valid YAML frontmatter in `commands/*.md`
- Test Codex adapter: assembles coherent `AGENTS.md` with entries for each enabled step
- Use **snapshot testing** for generated file content — capture expected output, compare on each run
- **Mock boundary**: Mock filesystem writes; assert write calls contain expected content

### 4f. CLAUDE.md Manager (T-043)

- Test section fill between `<!-- scaffold:managed by <step> -->` markers
- Test preservation of unmanaged content outside markers
- Test token budget warning at 2,000 tokens
- Test that no new `##`-level sections are added
- **Mock boundary**: Use real filesystem via temp directories

### 4g. Project Services & Utilities (T-032, T-033, T-036, T-037)

**Project Detector** (`src/project/detector.ts`):
- Test greenfield detection: empty directory → `{ mode: 'greenfield' }`
- Test brownfield detection: directory with `package.json` + `src/` → `{ mode: 'brownfield', signals: [...] }`
- Test v1 migration detection: directory with v1 tracking comments in `.md` files → `{ mode: 'v1-migration', matchedSteps: [...] }`
- Test signal priority: file signals override keyword signals when they conflict (ADR-027)
- Test artifact mapping: existing `docs/prd.md` maps to `create-prd` step via meta-prompt `outputs` field
- **Mock boundary**: Use real filesystem via temp directories with fixture project structures

**Init Wizard** (`src/wizard/init.ts`):
- Test smart methodology suggestion: idea text "REST API with PostgreSQL" → suggests `deep` with confidence score
- Test `--auto` mode: all questions resolved with safe defaults, no prompts emitted
- Test `--methodology` flag: pre-selects methodology, skips selection question
- Test re-initialization guard: existing `.scaffold/config.yml` without `--force` → `INIT_SCAFFOLD_EXISTS` error
- Test config generation: wizard output produces valid `ScaffoldConfig` with selected methodology, platforms, and project traits
- Test state initialization: generated `state.json` has all enabled steps as `pending`
- **Mock boundary**: Mock `@inquirer/prompts` for interactive questions; use real filesystem via temp directories for output verification

**Validator** (`src/cli/commands/validate.ts`):
- Test cross-cutting validation orchestration: config + frontmatter + dependency graph + state validated together
- Test error accumulation (ADR-040): multiple errors across different files reported in a single run, grouped by source file
- Test `--fix` flag: duplicate decision IDs reassigned, truncated JSONL lines removed
- Test config ↔ state consistency: `config.methodology` differs from `state.methodology` → `PSM_METHODOLOGY_MISMATCH` warning
- Test dependency ↔ frontmatter consistency: dependency target missing → `DEP_TARGET_MISSING` error
- **Mock boundary**: Use real filesystem via temp directories with multi-file fixture projects

**Dashboard Generator** (`src/dashboard/generator.ts`):
- Test HTML generation from state + config: produces self-contained HTML with correct step counts and progress percentage
- Test phase grouping: steps grouped by phase in output HTML
- Test light/dark mode: CSS custom properties present for both themes
- Test with empty state (all pending) and full state (all completed)
- **Mock boundary**: Use real filesystem via temp directories; assert HTML content via string matching (not DOM parsing)

---

## 5. File System Testing Patterns

### Temp Directory Pattern

Every test that touches the filesystem creates an isolated temp directory:

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function createTestProject(options?: {
  config?: Partial<ScaffoldConfig>;
  state?: Partial<PipelineState>;
  completedSteps?: string[];
}): string {
  const dir = mkdtempSync(join(tmpdir(), 'scaffold-test-'));
  const scaffoldDir = join(dir, '.scaffold');
  mkdirSync(scaffoldDir, { recursive: true });

  // Write minimal valid config
  writeFileSync(
    join(scaffoldDir, 'config.yml'),
    yaml.dump({ version: 2, methodology: 'deep', platforms: ['claude-code'], ...options?.config })
  );

  // Write minimal valid state
  if (options?.state || options?.completedSteps) {
    writeFileSync(
      join(scaffoldDir, 'state.json'),
      JSON.stringify(createTestState(options.state, options.completedSteps))
    );
  }

  return dir;
}
```

### Fixture Factories

```typescript
function createTestConfig(overrides?: Partial<ScaffoldConfig>): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    ...overrides,
  };
}

function createTestState(
  overrides?: Partial<PipelineState>,
  completedSteps?: string[]
): PipelineState {
  const prompts: Record<string, PromptStateEntry> = {};
  for (const step of completedSteps ?? []) {
    prompts[step] = { status: 'completed', completed_at: new Date().toISOString() };
  }
  return {
    schema_version: 2,
    config_methodology: 'deep',
    in_progress: null,
    prompts,
    ...overrides,
  };
}

function createTestDecision(overrides?: Partial<DecisionEntry>): DecisionEntry {
  return {
    id: 'D-001',
    prompt: 'create-prd',
    decision: 'Test decision',
    at: new Date().toISOString(),
    completed_by: 'test',
    prompt_completed: true,
    ...overrides,
  };
}
```

### Atomic Write Verification

```typescript
it('writes state atomically via temp file', async () => {
  const project = createTestProject();
  const statePath = join(project, '.scaffold', 'state.json');
  const tmpPath = statePath + '.tmp';

  await stateManager.write(project, newState);

  // .tmp file must not persist after successful write
  expect(existsSync(tmpPath)).toBe(false);
  // state.json must contain the new state
  const written = JSON.parse(readFileSync(statePath, 'utf-8'));
  expect(written.steps['create-prd'].status).toBe('completed');
});

it('preserves original state when write is interrupted', async () => {
  const project = createTestProject({ state: originalState });
  const statePath = join(project, '.scaffold', 'state.json');

  // Simulate crash: mock fs.rename to throw
  vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('ENOSPC'));

  await expect(stateManager.write(project, newState)).rejects.toThrow();

  // Original state.json must be unchanged
  const preserved = JSON.parse(readFileSync(statePath, 'utf-8'));
  expect(preserved).toEqual(originalState);
});
```

### Lock File Testing

```typescript
describe('LockManager', () => {
  it('acquires lock when no lock exists', async () => {
    const project = createTestProject();
    const result = await lockManager.acquire(project, 'run', 'create-prd');
    expect(result.acquired).toBe(true);
    expect(existsSync(join(project, '.scaffold', 'lock.json'))).toBe(true);
  });

  it('detects stale lock from dead PID', async () => {
    const project = createTestProject();
    // Write lock with a PID that doesn't exist
    writeLockFile(project, { pid: 999999, processStartedAt: '2026-01-01T00:00:00Z' });

    // Mock process.kill to throw ESRCH (no such process)
    vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: number) => {
      if (signal === 0) throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' });
      return true;
    });

    const result = await lockManager.acquire(project, 'run', 'create-prd');
    expect(result.acquired).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'LOCK_STALE_CLEARED' })
    );
  });

  it('detects recycled PID via processStartedAt mismatch', async () => {
    const project = createTestProject();
    writeLockFile(project, {
      pid: process.pid,  // Current process PID (alive)
      processStartedAt: '2020-01-01T00:00:00Z',  // But started years ago
    });

    const result = await lockManager.acquire(project, 'run', 'create-prd');
    expect(result.acquired).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'LOCK_PID_RECYCLED' })
    );
  });

  it('blocks on active lock without --force', async () => {
    const project = createTestProject();
    writeLockFile(project, { pid: process.pid, processStartedAt: getCurrentProcessStartTime() });

    const result = await lockManager.acquire(project, 'run', 'create-prd');
    expect(result.acquired).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'LOCK_HELD' })
    );
  });
});
```

---

## 6. CLI Testing Patterns

### Command Runner Helper

```typescript
interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCommand(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> }
): Promise<CommandResult> {
  // Invoke the CLI handler directly (not via child_process)
  // Capture stdout/stderr via mock streams
  const stdout = new WritableStringStream();
  const stderr = new WritableStringStream();

  const exitCode = await cli.run(args, {
    cwd: options?.cwd ?? process.cwd(),
    stdout,
    stderr,
    env: { ...process.env, ...options?.env },
  });

  return {
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    exitCode,
  };
}
```

### Three Output Modes Per Command

Every command test file includes tests for all three modes:

```typescript
describe('scaffold status', () => {
  describe('interactive mode', () => {
    it('displays human-readable pipeline progress', async () => {
      const result = await runCommand(['status'], { cwd: project });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('complete');
    });
  });

  describe('JSON mode (--format json)', () => {
    it('returns valid JSON envelope', async () => {
      const result = await runCommand(['status', '--format', 'json'], { cwd: project });
      const envelope = JSON.parse(result.stdout);
      expect(envelope.success).toBe(true);
      expect(envelope.command).toBe('status');
      expect(envelope.data).toHaveProperty('steps');
      expect(envelope.errors).toEqual([]);
      expect(envelope.exit_code).toBe(0);
    });
  });

  describe('auto mode (--auto)', () => {
    it('produces output without interactive prompts', async () => {
      const result = await runCommand(['status', '--auto'], { cwd: project });
      expect(result.exitCode).toBe(0);
      // No prompt text in stderr
      expect(result.stderr).not.toContain('?');
    });
  });
});
```

### Exit Code Testing

```typescript
// scaffold run must test all 6 exit codes
describe('scaffold run exit codes', () => {
  it('exits 0 on successful step execution', async () => { ... });

  it('exits 1 when step slug is invalid', async () => {
    const result = await runCommand(['run', 'nonexistent-step'], { cwd: project });
    expect(result.exitCode).toBe(1);
  });

  it('exits 2 when dependency is not met', async () => {
    const result = await runCommand(['run', 'system-architecture', '--auto'], { cwd: project });
    // system-architecture depends on adrs, which is not completed
    expect(result.exitCode).toBe(2);
  });

  it('exits 3 when lock is held in auto mode', async () => {
    writeLockFile(project, { pid: process.pid, processStartedAt: getCurrentProcessStartTime() });
    const result = await runCommand(['run', 'create-prd', '--auto'], { cwd: project });
    expect(result.exitCode).toBe(3);
  });

  it('exits 4 on user cancellation', async () => { ... });

  it('exits 5 on assembly engine failure', async () => {
    // Mock assembly engine to throw
    vi.spyOn(assemblyEngine, 'assemble').mockRejectedValueOnce(new Error('ASSEMBLY_FAILED'));
    const result = await runCommand(['run', 'create-prd', '--auto'], { cwd: project });
    expect(result.exitCode).toBe(5);
  });
});
```

### Lock Contention With --auto

```typescript
it('exits 3 when lock is held in --auto mode without --force', async () => {
  writeLockFile(project, activeLock);
  const result = await runCommand(['run', 'create-prd', '--auto'], { cwd: project });
  expect(result.exitCode).toBe(3);
  // Must NOT prompt — auto mode never prompts
  expect(result.stderr).not.toContain('Wait');
});

it('proceeds when lock is held with --auto --force', async () => {
  writeLockFile(project, activeLock);
  const result = await runCommand(['run', 'create-prd', '--auto', '--force'], { cwd: project });
  expect(result.exitCode).toBe(0);
});
```

---

## 7. Integration / E2E Testing Strategy

### Integration Tests (`tests/integration/`)

Integration tests verify component-to-component interactions using real implementations (not mocks) for both sides of a boundary. They sit between unit tests and E2E tests in the test pyramid — faster than E2E but broader than unit tests.

**Assembly Engine ↔ Frontmatter Parser** (`assembly-frontmatter.test.ts`):
- Load a real meta-prompt fixture, parse its frontmatter, and pass to the assembly engine
- Verify the assembled prompt includes knowledge base entries referenced in frontmatter
- Verify missing knowledge base entry produces `FRONTMATTER_KB_ENTRY_MISSING`

**Assembly Engine ↔ State Manager** (`assembly-state.test.ts`):
- Create a project with completed steps, invoke assembly for a step with dependencies
- Verify the assembled prompt includes prior artifacts as context
- Verify update mode: re-running a completed step includes existing artifact content

**State Manager ↔ Lock Manager** (`state-lock.test.ts`):
- Verify lock acquired before state mutation and released after
- Verify state remains unchanged when lock acquisition fails (EEXIST)
- Verify lock is released even when state write throws

**Validator ↔ Schema Validators** (`validator-schemas.test.ts`):
- Create a project with errors across config, frontmatter, and state files
- Run validator and verify errors accumulated from all sources, grouped by file
- Verify exit code reflects worst error across all validators

**Dashboard Generator ↔ State + Config** (`dashboard-integration.test.ts`):
- Create a project with realistic state (mix of completed/pending/skipped steps)
- Generate dashboard HTML and verify step counts, phase grouping, and progress data

**Error Handling Philosophy (ADR-040)** (`error-handling.test.ts`):
- Build-time accumulation: run `scaffold validate` against a project with 3+ distinct errors → all reported in output
- Build-time short-circuit: config with invalid YAML (Phase 1 failure) → no value validation errors reported (Phases 4-6 skipped)
- Runtime fail-fast: `scaffold run` with corrupt `state.json` → single error, immediate exit, no cascading errors

**Config Validation Pipeline Ordering** (`config-pipeline.test.ts`):
- Structural failure short-circuits: missing `version` field (Phase 3) → no `FIELD_INVALID_METHODOLOGY` errors from Phase 5
- Value errors accumulate: invalid methodology AND invalid platform both reported in single run
- Phase order: `CONFIG_PARSE_ERROR` (Phase 1) preempts `FIELD_MISSING` (Phase 3)

### E2E Tests (`tests/e2e/`)

Five end-to-end scenarios, each in `tests/e2e/`:

### Scenario 1: Full Pipeline (`full-pipeline.test.ts`)

```
init --auto --methodology deep
  → build
  → run each step (mocked AI execution, real state tracking)
  → status shows 100% completion
```

- Creates an isolated temp directory with fixture meta-prompts and knowledge base
- Verifies state transitions: pending → in_progress → completed for each step
- Verifies dependency ordering: steps only execute when predecessors are complete
- Verifies decision log accumulates entries

### Scenario 2: Init Wizard Paths (`init-wizard.test.ts`)

Three sub-scenarios:
- **Greenfield**: empty directory → `scaffold init --auto` → config created, state initialized, build runs
- **Brownfield**: directory with `package.json` + `src/` → project detector finds signals → init adapts
- **v1 Migration**: directory with v1 tracking comments → `scaffold init --auto` → pre-completes matched steps

### Scenario 3: Crash Recovery (`crash-recovery.test.ts`)

```
1. Create project, start a step (set in_progress manually in state.json)
2. Simulate crash (do not clear in_progress)
3. Run next command
4. Verify recovery matrix:
   - All artifacts exist → auto-complete, continue
   - No artifacts exist → offer re-run (auto mode: re-run)
   - Partial artifacts → offer choice (auto mode: re-run)
   - Zero-byte artifact → treated as present, PSM_ZERO_BYTE_ARTIFACT warning
```

### Scenario 4: Methodology Change (`methodology-change.test.ts`)

```
1. init --auto --methodology deep
2. Complete 3 steps
3. Edit config.yml: methodology → mvp
4. Run next step
5. Verify:
   - PSM_METHODOLOGY_MISMATCH warning emitted
   - Completed steps preserved (not rolled back)
   - New step set resolved from mvp preset
   - Orphaned state entries preserved
```

### Scenario 5: Update Mode (`update-mode.test.ts`)

```
1. Complete a step (artifact exists on disk)
2. Re-run the same step with --depth 5
3. Verify:
   - Step detected as update mode (ADR-048)
   - Existing artifact included in assembled prompt context
   - State updated with new depth level
   - Downstream stale warning emitted (ADR-034)
```

### E2E Rules

- Each test creates an isolated temp directory — no shared state between tests
- Tests clean up temp directories in `afterEach`
- E2E suite must complete within **30 seconds** total
- **No network access** in any test — enforced via a vitest `setupFiles` script (`tests/helpers/no-network.ts`) that installs a global `beforeAll` hook stubbing `net.connect`, `http.request`, `https.request`, and `globalThis.fetch` to throw `Error('Network access is not allowed in tests')`. This catches accidental network calls at runtime rather than relying on developer discipline.
- Meta-prompt and knowledge base fixtures are minimal (10-20 lines each)
- AI execution is mocked — the assembly engine produces output, but no AI model is called

---

## 8. Performance Testing Strategy

Vitest benchmark mode with realistic fixture data. Performance tests live in `tests/performance/`.

| Benchmark | p95 Budget | Test File | Fixture Data |
|-----------|-----------|-----------|-------------|
| Assembly (9-step sequence) | < 500ms | `assembly-benchmark.test.ts` | 32 meta-prompts, 32 KB entries, populated state |
| Step listing (status/list/next) | < 200ms | `state-io-benchmark.test.ts` | 32-step state with mixed statuses |
| State I/O (read + write) | < 100ms | `state-io-benchmark.test.ts` | Realistic state.json (~100KB) |
| Dependency resolution (Kahn's) | < 10ms | `state-io-benchmark.test.ts` | 32-node graph with 31 edges (realistic pipeline topology) |
| Build (all platforms) | < 2s | `build-benchmark.test.ts` | 32 meta-prompts, 3 platforms |

### Benchmark Pattern

```typescript
import { bench, describe } from 'vitest';

describe('Assembly Engine Performance', () => {
  const fixtures = loadRealisticFixtures(); // 32 meta-prompts, knowledge base, state

  bench('assembles a single step', async () => {
    await assemblyEngine.assemble('create-prd', fixtures);
  }, { time: 5000, iterations: 50 });

  bench('assembles a 9-step sequence', async () => {
    for (const step of firstNineSteps) {
      await assemblyEngine.assemble(step, fixtures);
    }
  }, { time: 10000, iterations: 20 });
});
```

Report p50/p95/p99 for each benchmark. Run against realistic fixture data (32 meta-prompts, not 3).

---

## 9. Coverage Targets

| Module Group | Branch Target | Rationale |
|-------------|:------------:|-----------|
| Core engine (`src/core/`) | ≥ 90% | Assembly correctness is critical; depth/methodology resolution must handle all precedence paths |
| State management (`src/state/`) | ≥ 90% | Crash recovery, atomic writes, dual detection must cover all paths |
| Data layer (`src/config/`, `src/project/`, `src/validation/`) | ≥ 90% | Schema validation, migration, fuzzy matching — all branches matter |
| CLI commands (`src/cli/commands/`) | ≥ 80% | Handler orchestration; error paths tested via exit codes |
| CLI output (`src/cli/output/`) | ≥ 80% | Three modes must all work; formatting edge cases |
| Platform adapters (`src/core/adapters/`) | ≥ 70% | Thin wrappers; determinism tested via snapshots |
| Wizard (`src/wizard/`) | ≥ 70% | Interactive flow; hard to test all branches |
| Dashboard (`src/dashboard/`) | ≥ 60% | HTML generation; visual correctness not testable via unit tests |
| Utils (`src/utils/`) | ≥ 90% | Small, pure functions — easy to cover fully |
| Types (`src/types/`) | N/A | No runtime code — only type definitions and type guards |

Coverage enforcement: CI fails if any module group drops below its target. No coverage decrease allowed from base branch.

### Coverage Enforcement Mechanism

Per-module-group thresholds are enforced via vitest's `coverage.thresholds` configuration in `vitest.config.ts`:

```typescript
coverage: {
  provider: 'v8',
  thresholds: {
    branches: 80,  // project-wide floor
    perFile: true,  // enforce per-file to prevent one large uncovered file from hiding
  },
  // Per-directory overrides for module groups
  '100': { statements: 90, branches: 90, include: ['src/core/**', 'src/state/**', 'src/config/**', 'src/utils/**'] },
  '80': { statements: 80, branches: 80, include: ['src/cli/commands/**', 'src/cli/output/**'] },
  '70': { statements: 70, branches: 70, include: ['src/wizard/**', 'src/core/adapters/**'] },
  '60': { statements: 60, branches: 60, include: ['src/dashboard/**'] },
}
```

Coverage decrease detection: CI compares coverage percentages against the base branch using `vitest --coverage` output parsed by a CI script. The script fails the check if any module group's branch coverage drops from the base branch value.

---

## 10. Distribution Verification Tests

Distribution testing validates that the npm package installs and runs correctly outside the development environment. These tests cover requirements F-051 (npm distribution) and F-052 (Homebrew distribution).

### npm Package Verification (CI Job)

Run as part of the CI pipeline after the build step:

| Test | Command | Assertion |
|------|---------|-----------|
| Pack dry-run | `npm pack --dry-run` | Output includes `dist/`, `pipeline/`, `knowledge/`, `methodology/`; excludes `tests/`, `docs/`, `src/*.ts` |
| Bin entry | `npm pack --dry-run --json \| jq '.[0].files'` | `dist/cli.js` (or equivalent entry point) is present |
| No dev artifacts | `npm pack --dry-run` | No `.env`, `.beads/`, `.scaffold/`, `.github/` in output |
| Install smoke test | `npm install -g ./scaffold-*.tgz && scaffold --version` | Exit code 0, prints version matching `package.json` |
| npx zero-install | `npx ./scaffold-*.tgz --version` | Exit code 0 |

### Homebrew Formula Verification (If Applicable)

If a Homebrew tap is maintained:

| Test | Command | Assertion |
|------|---------|-----------|
| Formula lint | `brew audit --strict scaffold` | No errors |
| SHA256 match | Compare formula SHA256 against `npm view` tarball | Values match |

### Implementation Notes

- The `npm pack` dry-run tests are fast (< 2s) and run in every CI build.
- The install smoke test creates a temp directory, runs `npm install -g` from the packed tarball, invokes `scaffold --version`, and cleans up. This catches missing files, broken bin links, and missing runtime dependencies.
- Homebrew formula verification runs only when the tap repo is updated (separate CI).

---

## 11. Quality Gates

### Pre-Commit (< 10 seconds)

- `tsc --noEmit` — TypeScript compilation
- `eslint src/` — lint rules
- No test execution (too slow for pre-commit hooks)

### CI Pipeline (< 3 minutes)

- All pre-commit checks (redundant but catches bypassed hooks)
- Full unit + integration test suite with coverage report
- E2E test suite
- Coverage threshold enforcement (fail if below targets in Section 9, via vitest `coverage.thresholds`)
- `npm audit --audit-level=high` — dependency vulnerability scanning (fail on high/critical)
- Architectural constraint verification (NF-012, NF-013): `scripts/check-no-credentials.sh` and `scripts/check-no-network.sh` — see security-practices.md §8
- No performance benchmarks in CI (environment-dependent timing). **Phase 7+ addition**: after the test suite stabilizes, add a CI step that runs `npm run test:bench` and parses vitest benchmark JSON output against hardcoded p95 thresholds. Vitest benchmark mode does not support threshold assertions natively — the CI script reads the JSON output and fails if any p95 exceeds its budget from Section 8.

If the CI pipeline exceeds the 3-minute budget, investigate before adding parallelization — the budget is a gate, not an aspiration.

### Pre-Merge

- All CI checks pass
- No decrease in coverage from base branch (CI script compares `vitest --coverage` output against base)
- PR review approved

### Periodic (Manual/Scheduled)

- Performance benchmarks (Section 8) against realistic data
- Mutation testing to assess test suite quality (Stryker with `@stryker-mutator/core` and vitest runner plugin) — adopt after Phase 7 integration tasks complete and test suite achieves >80% branch coverage project-wide. Initial target: >60% mutation score on `src/core/` and `src/state/` (the modules where correctness matters most). Mutation testing stays periodic/manual — do not add to CI gates.
- Visual dashboard verification via Playwright MCP (if dashboard changes)

---

## 12. AI Agent Testing Rules

These rules prevent common AI agent testing mistakes in this project:

1. **Never test frameworks.** Do not test that Vitest assertions work, that yargs routes correctly, or that `js-yaml` parses valid YAML. Only test scaffold logic that uses them.

2. **Never test type definitions.** `src/types/` contains no runtime code. Type guards in types files are the exception — test those.

3. **Test behavior, not implementation.** Assert the output file content, the exit code, the JSON envelope shape. Do not assert internal method call counts or private function arguments.

4. **Acceptance criteria are test cases.** Every `- [ ]` criterion in `task-breakdown.md` becomes a test. `"Rejects depth outside 1-5 range (FIELD_INVALID_DEPTH)"` → `it('rejects depth outside 1-5 range with FIELD_INVALID_DEPTH error', ...)`.

5. **Test names describe behavior.** `it('returns exit code 2 when dependency artifact missing')` not `it('handles error')` or `it('test case 3')`.

6. **No test ordering dependencies.** Each test creates its own temp directory and fixture state. Tests must pass when run in any order and in parallel.

7. **No `sleep()` in tests.** Mock time-dependent operations. If a test needs to verify a timestamp, freeze time with `vi.useFakeTimers()`.

8. **Flaky = bug.** If a test fails intermittently, fix the root cause (race condition, shared state, time dependency) or delete the test. Never `skip` a flaky test and leave it.

9. **Bug fix = failing test first.** When fixing a bug, write the failing test that reproduces the bug before writing the fix. The test proves the bug existed and prevents regression.

10. **One concern per test.** A test that checks config loading AND state initialization AND lock acquisition is testing three things. Split it.

11. **Use factories, not inline data.** Use `createTestConfig()`, `createTestState()`, `createTestDecision()` from `tests/helpers/test-utils.ts`. Only override what matters for the specific test.

12. **Clean up after yourself.** Every `createTestProject()` has a matching cleanup in `afterEach`. Temp directories must not accumulate.
