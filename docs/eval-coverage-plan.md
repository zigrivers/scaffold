# Eval Coverage Plan

> Generated 2026-03-28 from comprehensive project audit.

## 1. Coverage Summary

### TypeScript (vitest): 67 test files, 772 tests — ALL PASSING

| Module | Stmts | Branch | Funcs | Lines | Notes |
|--------|------:|-------:|------:|------:|-------|
| **src/cli** (index) | 100% | 100% | 100% | 100% | |
| **src/cli/commands** | 76.6% | 72.0% | 61.9% | 76.6% | Weakest: `update` 57%, `version` 59%, `dashboard` 60%, `reset` 67%, `run` 69%, `skill` 71% |
| **src/cli/output** | 87.2% | 85.6% | 92.6% | 87.2% | `auto.ts`, `interactive.ts`, `json.ts` have no dedicated tests (covered indirectly) |
| **src/config** | 91.1% | 90.6% | 100% | 91.1% | Solid |
| **src/core/adapters** | 98.7% | 94.4% | 100% | 98.7% | Excellent |
| **src/core/assembly** | 85.5% | 86.1% | 97.1% | 85.5% | `knowledge-loader` 68%, `preset-loader` 79% drag average down |
| **src/core/dependency** | 100% | 84.5% | 100% | 100% | `graph.ts` has no dedicated tests but 100% coverage via integration |
| **src/dashboard** | 99% | 92% | 100% | 99% | |
| **src/project** | 95.9% | 87.3% | 100% | 95.9% | |
| **src/state** | 93.9% | 85.7% | 93.3% | 93.9% | |
| **src/types** | 100% | 100% | 100% | 100% | Pure types |
| **src/utils** | 99.0% | 96.4% | 97.3% | 99.0% | |
| **src/validation** | 69.2% | 57.1% | 100% | 69.2% | 4 validator files tested only indirectly |
| **src/wizard** | 77.2% | 62.2% | 100% | 77.2% | `questions.ts`, `suggestion.ts` untested |
| **OVERALL** | **84.4%** | **80.7%** | **88.6%** | **84.4%** | |

### Bats Tests: 3 test files, ~54 tests

| File | Tests | Covers |
|------|------:|--------|
| `generate-dashboard.bats` | 38 | `scripts/generate-dashboard.sh` |
| `validate-frontmatter.bats` | 9 | `scripts/validate-frontmatter.sh` |
| `setup-agent-worktree.bats` | 7 | `scripts/setup-agent-worktree.sh` |

### Bats Evals: 7 eval files, ~28 tests

| File | Tests | Invariant |
|------|------:|-----------|
| `pipeline-completeness.bats` | 6 | Frontmatter fields, body sections, order ranges, dependency resolution, knowledge refs |
| `skill-triggers.bats` | 7 | Skill activation patterns, boundaries, overlap prevention |
| `channel-parity.bats` | 4 | Pipeline ↔ command 1:1 mapping, no duplicates |
| `command-structure.bats` | 3 | Description, Mode Detection → Process → After This Step |
| `knowledge-quality.bats` | 3 | Required fields, min line counts by category, code blocks |
| `cross-channel.bats` | 2 | Pipeline outputs appear in command Mode Detection |
| `redundancy.bats` | 3 | Summary ↔ Deep Guidance balance |

### Scripts WITHOUT Test Coverage (7 of 10)

| Script | Complexity | Risk |
|--------|-----------|------|
| `install.sh` | Low | Medium — writes to `~/.claude/commands/` |
| `uninstall.sh` | Low | Medium — deletes from `~/.claude/commands/` |
| `update.sh` | Medium | Medium — git clone + install |
| `install-hooks.sh` | Low | Low — writes to `.git/hooks/` |
| `extract-commands.sh` | High (18 modifications, highest churn) | Low — legacy v1 script |
| `prepublish.sh` | Trivial | Low — just `npm run build && npm test` |
| `implementation-plan-mmr.sh` | High | Low — external CLI orchestration |

### CI Pipeline Gap

**`make check`** runs: ShellCheck → frontmatter validate → bats tests → bats evals

**NOT in CI:**
| Gate | Status | Impact |
|------|--------|--------|
| `npm test` (772 vitest tests) | Not running | **CRITICAL** — TypeScript regressions invisible |
| `npm run type-check` (tsc --noEmit) | Not running | **HIGH** — type errors invisible |
| `npm run lint` (ESLint) | Not running (64 errors exist) | **MEDIUM** — lint drift |
| `npm run build` (tsc compile) | Not running | **HIGH** — broken package invisible |
| Coverage enforcement | Not configured | **MEDIUM** — coverage can silently drop |

---

## 2. Gap Analysis

### CRITICAL — Breaks Users Silently

#### G1: CI doesn't run TypeScript tests
**Risk**: Any PR can merge with failing vitest tests. The entire TypeScript codebase (24K lines, 772 tests) has zero CI protection.
**Evidence**: CI installs `shellcheck jq bats` but never installs Node.js or runs npm commands.
**Files**: `.github/workflows/ci.yml`

#### G2: CI doesn't validate the build
**Risk**: Published npm package (`@zigrivers/scaffold`) could have TypeScript compilation errors. Users run `npx scaffold` and get crashes.
**Evidence**: `npm run build` never runs in CI. The `prepublish.sh` script runs locally but isn't enforced.
**Files**: `.github/workflows/ci.yml`, `scripts/prepublish.sh`

#### G3: `src/cli/commands/skill.ts` — 47% branch coverage, 4 bug fixes
**Risk**: The `skill` command is the most bug-prone CLI command (4 fixes in git history) with the weakest coverage (47% branches, only 3 tests).
**Evidence**: `git log` shows 4 separate fix commits touching `skill.ts`. Coverage shows lines 73-82, 84-101, 105-110, 128-131 uncovered.
**Files**: `src/cli/commands/skill.ts`, `src/cli/commands/skill.test.ts`

#### G4: `src/validation/` — 57% branch coverage
**Risk**: The 4 individual validators (`config-validator.ts`, `dependency-validator.ts`, `frontmatter-validator.ts`, `state-validator.ts`) have no dedicated tests. Only tested indirectly via `validation/index.test.ts` which has 8 integration tests.
**Evidence**: 69% statement coverage, 57% branch coverage. Validation logic is a critical gate that prevents corrupt state.
**Files**: `src/validation/*.ts`

#### G5: `src/cli/commands/run.ts` — 68% branch coverage
**Risk**: The `run` command is the core CLI entry point (runs the pipeline). 68% branch coverage means error paths and edge cases are untested.
**Evidence**: Lines 189-190, 234-252, 292, 332-339, 343-348, 404, 431 uncovered. These include lock conflict handling, crash recovery paths, and assembly error propagation.
**Files**: `src/cli/commands/run.ts`, `src/cli/commands/run.test.ts`

### HIGH — Causes Incorrect Output

#### G6: `src/core/assembly/knowledge-loader.ts` — 68% statement coverage
**Risk**: Knowledge injection is core to prompt quality. The loader has 68% coverage, meaning knowledge override precedence, recursive directory scanning, and Deep Guidance extraction have untested paths.
**Evidence**: Lines 158-264 and 279-326 uncovered — these are the knowledge content extraction and override resolution paths.
**Files**: `src/core/assembly/knowledge-loader.ts`, `src/core/assembly/knowledge-loader.test.ts`

#### G7: State migration fragility
**Risk**: `state-migration.ts` has 6 modifications (highest churn in src/) and is touched every time a pipeline step is added/renamed/retired. Each migration is manually maintained.
**Evidence**: 26 tests exist but the file keeps needing fixes (#115, #149, #160). The retired-step mapping pattern is error-prone.
**Files**: `src/state/state-migration.ts`, `src/state/state-migration.test.ts`

#### G8: No eval for output consumption
**Risk**: A pipeline step can declare outputs that no downstream step references. The `cross-channel.bats` eval checks outputs appear in Mode Detection but doesn't verify downstream steps actually depend on them.
**Evidence**: `cross-channel.bats` has only 2 tests and the dependency check is explicitly "soft".
**Files**: `tests/evals/cross-channel.bats`

#### G9: No eval for conditional field validity
**Risk**: Pipeline steps with `conditional: true` aren't validated for having proper conditional logic. A step could be marked conditional but never have conditions documented.
**Files**: `tests/evals/pipeline-completeness.bats`

### MEDIUM — Degrades Experience

#### G10: `src/wizard/` — 62% branch coverage
**Risk**: The init wizard (`questions.ts`, `suggestion.ts`) has no dedicated tests. The smart suggestions engine that recommends methodology based on project signals is untested directly.
**Files**: `src/wizard/questions.ts`, `src/wizard/suggestion.ts`, `src/wizard/wizard.test.ts`

#### G11: `src/cli/commands/update.ts` — 57% statement coverage
**Risk**: The `update` command (for updating scaffold itself) has the lowest coverage of any command.
**Files**: `src/cli/commands/update.ts`, `src/cli/commands/update.test.ts`

#### G12: `src/cli/commands/version.ts` — 59% statement coverage
**Risk**: Version display logic poorly covered. Lines 33-58 and 64-65 and 91-96 untested.
**Files**: `src/cli/commands/version.ts`, `src/cli/commands/version.test.ts`

#### G13: `src/cli/commands/reset.ts` — 68% statement coverage
**Risk**: Reset command touches state files destructively. Untested paths could corrupt or incompletely reset state.
**Files**: `src/cli/commands/reset.ts`, `src/cli/commands/reset.test.ts`

#### G14: Broken `test:e2e` script
**Risk**: `vitest.e2e.config.ts` doesn't exist but is referenced in `package.json`. The E2E tests in `src/e2e/` run as part of the main suite (not excluded), but the dedicated script is broken.
**Files**: `package.json`

#### G15: Benchmark naming mismatch
**Risk**: `npm run test:bench` finds no files because benchmarks use `.test.ts` extension instead of `.bench.ts`. Benchmarks run as regular tests with no performance regression detection.
**Files**: `tests/performance/*.test.ts`

### LOW — Cosmetic/Internal

#### G16: ESLint has 64 existing errors
**Risk**: Lint quality drifting. Not blocking but accumulating technical debt.

#### G17: `src/cli/output/` display modules lack dedicated tests
**Risk**: `auto.ts`, `interactive.ts`, `json.ts` have no dedicated test files. 87% coverage from indirect testing is decent but error formatting edge cases aren't exercised.

#### G18: `src/core/dependency/graph.ts` — no dedicated tests
**Risk**: Low — 100% coverage via integration. But if the integration paths change, graph building could silently break.

---

## 3. Proposed Evals

### P0 — Do Immediately

#### E1: Wire TypeScript tests into CI
- **What it tests**: All 772 vitest tests run on every PR
- **What it catches**: TypeScript regressions, type errors, build failures
- **Where**: `.github/workflows/ci.yml`
- **Priority**: P0
- **Complexity**: S
- **Implementation**: Add Node.js setup + `npm ci && npm run check` to CI workflow

#### E2: Add coverage threshold to CI
- **What it tests**: Coverage doesn't drop below current baseline
- **What it catches**: New code without tests, deleted tests
- **Where**: `vitest.config.ts` (coverage thresholds), `.github/workflows/ci.yml`
- **Priority**: P0
- **Complexity**: S
- **Implementation**: Add `coverage.thresholds` to vitest config: `{ statements: 84, branches: 80, functions: 88, lines: 84 }`

#### E3: Expand `skill.ts` test coverage (47% → 85%+ branches)
- **What it tests**: Skill command error paths, edge cases
- **What it catches**: The recurring bug pattern in skill.ts (4 historical fixes)
- **Where**: `src/cli/commands/skill.test.ts`
- **Priority**: P0
- **Complexity**: M
- **Specific tests needed**:
  - Unknown skill name with fuzzy suggestion
  - Skill listing with no skills directory
  - Skill info for non-existent skill
  - Skill with missing SKILL.md
  - Skill activation pattern validation

#### E4: Expand `run.ts` test coverage (68% → 85%+ branches)
- **What it tests**: Core pipeline execution error paths
- **What it catches**: Lock conflicts, crash recovery edge cases, assembly failures
- **Where**: `src/cli/commands/run.test.ts`
- **Priority**: P0
- **Complexity**: M
- **Specific tests needed**:
  - Lock held by dead process with --force
  - Crash recovery with corrupted state
  - Assembly failure mid-pipeline
  - Dependency violation with skip override
  - Signal handling (SIGINT cleanup)

### P1 — Do This Sprint

#### E5: Validation module dedicated tests
- **What it tests**: Each validator in isolation
- **What it catches**: Validation bypass, false positives/negatives on malformed data
- **Where**: New files: `src/validation/config-validator.test.ts`, `dependency-validator.test.ts`, `frontmatter-validator.test.ts`, `state-validator.test.ts`
- **Priority**: P1
- **Complexity**: M
- **Specific tests needed**:
  - Config validator: missing required fields, invalid types, unknown fields
  - Dependency validator: cycles, dangling refs, self-references
  - Frontmatter validator: missing delimiters, invalid YAML, out-of-range order
  - State validator: corrupt JSON, missing version, orphaned steps

#### E6: Knowledge-loader coverage expansion (68% → 85%+)
- **What it tests**: Knowledge override precedence, Deep Guidance extraction, recursive scanning
- **What it catches**: Wrong knowledge injected, missing overrides, broken Deep Guidance extraction
- **Where**: `src/core/assembly/knowledge-loader.test.ts`
- **Priority**: P1
- **Complexity**: M
- **Specific tests needed**:
  - Local override takes precedence over global
  - Deep Guidance section extracted correctly with various heading levels
  - Empty knowledge directory handled
  - Knowledge entry with no frontmatter skipped gracefully
  - Very large knowledge entry (>1000 lines) handled

#### E7: State migration regression suite
- **What it tests**: Every historical migration path continues to work
- **What it catches**: New migrations breaking old state files
- **Where**: `src/state/state-migration.test.ts`
- **Priority**: P1
- **Complexity**: S
- **Specific tests needed**:
  - Fixture-based: store actual old state files as fixtures and verify migration
  - Round-trip: migrate → save → load → verify
  - Unknown step names in old state preserved (not lost)

#### E8: Meta-eval for output consumption
- **What it tests**: Every pipeline step's declared outputs are referenced by at least one downstream step's dependencies or inputs
- **What it catches**: Orphaned outputs, broken handoff chains
- **Where**: New file: `tests/evals/output-consumption.bats`
- **Priority**: P1
- **Complexity**: M
- **Implementation**: For each step's `outputs` field, verify at least one other step lists it in dependencies or mentions it in its body

#### E9: Meta-eval for dependency transitivity
- **What it tests**: If A depends on B and B depends on C, verify A's execution order is after C
- **What it catches**: Implicit dependency violations that cause steps to run with missing prerequisites
- **Where**: New file: `tests/evals/dependency-ordering.bats`
- **Priority**: P1
- **Complexity**: M

### P2 — Do Next Sprint

#### E10: Wizard suggestion engine tests
- **What it tests**: Smart methodology suggestions based on project signals
- **What it catches**: Wrong methodology recommended for project type
- **Where**: New file: `src/wizard/suggestion.test.ts`
- **Priority**: P2
- **Complexity**: M

#### E11: Expand `reset.ts`, `update.ts`, `version.ts` coverage
- **What it tests**: Destructive operations, version parsing, update flow
- **What it catches**: Incomplete reset, wrong version display, failed updates
- **Where**: Existing test files for each command
- **Priority**: P2
- **Complexity**: M

#### E12: Meta-eval for conditional step validity
- **What it tests**: Steps with `conditional: true` have conditional logic documented in their body
- **What it catches**: Steps marked conditional but always/never executing
- **Where**: Extend `tests/evals/pipeline-completeness.bats`
- **Priority**: P2
- **Complexity**: S

#### E13: Meta-eval for After This Step chain integrity
- **What it tests**: "After This Step" references form valid chains without cycles or dangling references
- **What it catches**: Broken next-step guidance chains after pipeline reordering
- **Where**: Extend `tests/evals/command-structure.bats`
- **Priority**: P2
- **Complexity**: M

#### E14: Meta-eval for knowledge-base reference accuracy
- **What it tests**: Knowledge entries referenced in pipeline steps actually contain content relevant to the step's phase
- **What it catches**: Stale knowledge references after knowledge restructuring
- **Where**: Extend `tests/evals/cross-channel.bats`
- **Priority**: P2
- **Complexity**: M

### P3 — Backlog

#### E15: Fix `test:e2e` script
- **What it tests**: E2E tests run in isolation with proper config
- **Where**: Create `vitest.e2e.config.ts` or remove from `package.json`
- **Priority**: P3
- **Complexity**: S

#### E16: Fix benchmark naming
- **What it tests**: Performance benchmarks run via `npm run test:bench`
- **Where**: Rename `tests/performance/*.test.ts` → `*.bench.ts`
- **Priority**: P3
- **Complexity**: S

#### E17: Install/uninstall script tests
- **What it tests**: Install copies correct files, uninstall removes only scaffold files
- **Where**: New file: `tests/install-uninstall.bats`
- **Priority**: P3
- **Complexity**: M
- **Approach**: Use BATS tmpdir to mock `~/.claude/commands/`

#### E18: Graph.ts dedicated unit tests
- **What it tests**: DAG construction from frontmatter in isolation
- **Where**: New file: `src/core/dependency/graph.test.ts`
- **Priority**: P3
- **Complexity**: S
- **Rationale**: 100% coverage via integration, but dedicated tests prevent silent breakage if integration paths change

---

## 4. Structural Recommendations

### R1: Unify CI quality gates

Currently there are **two separate check commands** that don't know about each other:

| Command | Runs | Context |
|---------|------|---------|
| `make check` | ShellCheck + frontmatter + bats + evals | CI, pre-push hook |
| `npm run check` | ESLint + type-check + vitest | Local only |

**Recommendation**: Add a unified `make check-all` target:
```makefile
check-all: lint validate test eval ts-check  ## Full quality gates (bash + TypeScript)

ts-check:  ## Run TypeScript quality gates
	npm run lint
	npm run type-check
	npm test
```

Update CI to run `make check-all`. Keep `make check` for quick bash-only validation.

### R2: Add coverage thresholds

Add to `vitest.config.ts`:
```typescript
coverage: {
  thresholds: {
    statements: 84,
    branches: 80,
    functions: 88,
    lines: 84,
  }
}
```

This locks in current coverage as a floor. Any PR that drops coverage below these values fails CI.

### R3: Consider property-based testing for assembly engine

The assembly engine (`engine.ts`) has 40 tests but they're all example-based. Property-based tests (using `fast-check`) could find edge cases in:
- Section ordering determinism across random inputs
- Depth resolution with random precedence combinations
- Knowledge injection with random knowledge entry sets

**Cost**: Medium. Requires adding `fast-check` dependency and writing generators.
**Benefit**: High for the assembly engine (the most critical code path).

### R4: Add snapshot tests for generated commands

After `scaffold build`, the generated command files in `commands/` should match expected snapshots. This catches unintended changes to command output format.

**Implementation**: `vitest` built-in snapshot testing. Run build in test, compare output against committed snapshots.

### R5: Meta-eval for prompt quality (not just structure)

Current evals verify structure (required sections exist, fields present). They don't verify content quality. Consider adding:

- **Minimum section length**: Each required section (Purpose, Inputs, Expected Outputs, Quality Criteria) has at least 3 lines of content
- **No placeholder text**: Sections don't contain "TODO", "TBD", "FIXME"
- **Cross-reference validation**: References to other steps use correct step names (not stale)
- **Instruction consistency**: All document-creating prompts use consistent Mode Detection phrasing

### R6: Test fixture factory

Several test files create similar mock objects (MetaPrompt, Config, State). A shared fixture factory would:
- Reduce test boilerplate
- Ensure fixtures stay in sync with type changes
- Make it easier to write new tests

**Location**: `tests/helpers/fixtures.ts`

### R7: Fix existing lint errors before enforcing in CI

The 64 ESLint errors need to be fixed before adding `npm run lint` to CI. Do this as a separate PR to avoid mixing lint fixes with feature work.

---

## 5. Implementation Roadmap

### Wave 1: CI Foundation (P0) — Do First

| # | Task | Est. | Depends On |
|---|------|------|------------|
| 1.1 | Fix 64 ESLint errors | M | — |
| 1.2 | Add Node.js + `npm run check` to CI workflow | S | 1.1 |
| 1.3 | Add `npm run build` to CI workflow | S | 1.2 |
| 1.4 | Add coverage thresholds to vitest config | S | 1.2 |
| 1.5 | Expand `skill.ts` tests (47% → 85%+ branches) | M | — |
| 1.6 | Expand `run.ts` tests (68% → 85%+ branches) | M | — |

**Outcome**: CI catches TypeScript regressions, type errors, build failures, and coverage drops. The two most fragile commands have robust test coverage.

### Wave 2: Critical Module Coverage (P1) — Same Sprint

| # | Task | Est. | Depends On |
|---|------|------|------------|
| 2.1 | Add validation module dedicated tests (4 files) | M | — |
| 2.2 | Expand knowledge-loader tests (68% → 85%+) | M | — |
| 2.3 | Add state migration regression fixtures | S | — |
| 2.4 | New eval: `output-consumption.bats` | M | — |
| 2.5 | New eval: `dependency-ordering.bats` | M | — |

**Outcome**: Validation, knowledge injection, and state migration — the three most frequently broken areas — have comprehensive coverage. Two new meta-evals catch pipeline integrity issues.

### Wave 3: Experience & Completeness (P2) — Next Sprint

| # | Task | Est. | Depends On |
|---|------|------|------------|
| 3.1 | Add wizard suggestion tests | M | — |
| 3.2 | Expand `reset.ts`, `update.ts`, `version.ts` tests | M | — |
| 3.3 | Extend eval: conditional step validity | S | — |
| 3.4 | Extend eval: After This Step chain integrity | M | — |
| 3.5 | Extend eval: knowledge-base reference accuracy | M | — |

**Outcome**: Full CLI command coverage above 85%. Meta-evals cover the most common sources of pipeline breakage.

### Wave 4: Polish (P3) — Backlog

| # | Task | Est. | Depends On |
|---|------|------|------------|
| 4.1 | Fix `test:e2e` config or remove | S | — |
| 4.2 | Fix benchmark naming (`.test.ts` → `.bench.ts`) | S | — |
| 4.3 | Add install/uninstall script tests | M | — |
| 4.4 | Add `graph.ts` dedicated unit tests | S | — |
| 4.5 | Evaluate property-based testing for assembly engine | L | — |
| 4.6 | Build test fixture factory | M | — |
| 4.7 | Add snapshot tests for generated commands | M | — |

**Outcome**: Complete test infrastructure with no broken scripts, proper benchmarking, and advanced testing techniques.

---

## Appendix: Git History Insights

### Highest-Churn Source Files (most modifications)

1. `src/state/state-migration.ts` — 6 modifications
2. `src/cli/commands/status.ts` — 6 modifications
3. `src/cli/index.ts` — 5 modifications
4. `src/cli/commands/next.ts` — 5 modifications
5. `src/cli/commands/check.ts` — 5 modifications
6. `src/state/state-manager.ts` — 4 modifications
7. `src/project/frontmatter.ts` — 4 modifications
8. `src/core/assembly/knowledge-loader.ts` — 4 modifications
9. `src/cli/commands/skill.ts` — 4 modifications
10. `src/cli/commands/run.ts` — 4 modifications

### Recurring Fix Patterns

1. **State migration (#115, #149, #160)** — Every pipeline step change requires manual migration update
2. **After This Step chains (#138-#143)** — Command cross-references break when pipeline reorders
3. **External CLI flags (#128, #131, #133, #137)** — Missing `--skip-git-repo-check`, `NO_BROWSER=true`
4. **Knowledge references (#150)** — Recommending non-existent MCP servers
5. **SKILL.md staleness (#146)** — Skill docs reference old step names

### 44% Bug-Fix Ratio

125 of 281 commits are fixes. Many are chains of consecutive fix commits (#130-#145), suggesting changes aren't being validated before merge — which directly supports the P0 priority of wiring TypeScript tests into CI.
