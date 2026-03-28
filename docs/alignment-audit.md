# Pipeline Alignment Audit: Evals, Story-Tests, and Implementation Steps

> Audit date: 2026-03-28 | Scaffold v2.29.0

## 1. Audit Summary

The test/eval/implementation chain is **structurally sound** — the dependency graph flows correctly from TDD standards through story-tests and create-evals to implementation planning. However, there are **significant misalignment gaps** in how downstream steps consume the artifacts that story-tests and create-evals produce. The chain works in theory but the connections are implicit rather than explicit, meaning an implementation agent would need to discover these artifacts rather than being directed to them.

### What's Well-Aligned

- **story-tests → create-evals dependency chain**: `create-evals` correctly depends on `story-tests` and reads it. The `tests/acceptance/` directory from story-tests feeds into create-evals' coverage eval category.
- **tdd as foundation**: Both `story-tests` and `create-evals` depend on `tdd`, ensuring testing conventions exist before test artifacts are generated.
- **Knowledge coverage**: `eval-craft` (1009 lines) is comprehensive and directly maps to what `create-evals` asks Claude to produce. `testing-strategy` (403 lines) covers the test pyramid and patterns that `story-tests` needs.
- **Meta-eval structural coverage**: All 51 pipeline steps pass the same 39 eval checks — frontmatter completeness, dependency resolution, order ranges, output references, prompt quality.
- **Mode Detection and Update Mode**: Both `story-tests` and `create-evals` have thorough update mode logic for incremental changes.

### What's Not Aligned

- **implementation-plan doesn't reference story-tests outputs** — It depends on `create-evals` but never reads `tests/acceptance/` or `docs/story-tests-map.md`. Tasks should reference which test skeletons to implement.
- **implementation-playbook is disconnected from quality artifacts** — It reads `docs/tdd-standards.md` but not `tests/acceptance/`, `docs/story-tests-map.md`, `docs/eval-standards.md`, or `tests/evals/`. Agents following the playbook wouldn't know these artifacts exist.
- **traceability-matrix doesn't use story-tests-map.md** — It traces "PRD → Stories → Tasks" but not "Stories → Test Cases". The `docs/story-tests-map.md` is exactly the traceability artifact it should consume, but it's not referenced.
- **Terminal output exemptions mask real consumers** — `story-tests` and `create-evals` are both marked as `TERMINAL_OUTPUT_EXEMPT` in `output-consumption.bats`, even though `create-evals` consumes story-tests outputs and `implementation-plan` should consume both.

---

## 2. Dependency Chain Map

### Current State

```
Phase 2 (foundation)
  tdd ──────────────────────┬──────────────────────────────────┐
  coding-standards ─────────┤                                  │
                            │                                  │
Phase 9 (quality)           │                                  │
  review-testing ◄──────────┘                                  │
  story-tests ◄─── tdd + review-user-stories + review-arch     │
  create-evals ◄── tdd + story-tests ─────────────────────┐    │
                                                           │    │
Phase 12 (planning)                                        │    │
  implementation-plan ◄── create-evals + tdd + ops + sec   │    │
                          (does NOT read story-tests)  ◄───┘    │
  implementation-plan-review ◄── implementation-plan            │
                                                                │
Phase 13 (validation)                                           │
  traceability-matrix ◄── impl-plan-review                      │
                          (does NOT read story-tests-map.md)    │
                                                                │
Phase 14 (finalization)                                         │
  apply-fixes-and-freeze ◄── 7 validation steps                │
  developer-onboarding-guide ◄── apply-fixes-and-freeze         │
  implementation-playbook ◄── dev-onboarding-guide              │
                              (does NOT reference quality artifacts)
```

### Missing Connections (dotted lines = should exist)

```
story-tests ···outputs···> tests/acceptance/, docs/story-tests-map.md
                              │                        │
                              ▼                        ▼
                    create-evals (reads ✓)    traceability-matrix (MISSING)
                              │
                              ▼
                    implementation-plan (depends ✓, but doesn't read outputs)
                              │
                              ▼
                    implementation-playbook (MISSING - no reference to any quality artifacts)
```

---

## 3. Issue List

### P1: Misaligned — Things Don't Connect Properly

#### M1: `implementation-plan` doesn't read `story-tests` outputs
- **File**: `pipeline/planning/implementation-plan.md`
- **Problem**: `implementation-plan` depends on `create-evals` (which itself depends on `story-tests`), but it doesn't declare `reads: [story-tests]` and its body never mentions `tests/acceptance/` or `docs/story-tests-map.md`. The command file similarly omits these from its "Required Reading" table.
- **Impact**: Implementation tasks won't reference which test skeletons to implement. Agents create tasks with generic "write tests" instructions instead of "implement the pending test cases in `tests/acceptance/US-001-login.test.ts`."
- **Priority**: P1
- **Complexity**: S

#### M2: `implementation-playbook` doesn't reference quality artifacts
- **File**: `pipeline/finalization/implementation-playbook.md`
- **Problem**: The playbook reads `docs/tdd-standards.md` but never mentions `tests/acceptance/`, `docs/story-tests-map.md`, `docs/eval-standards.md`, or `tests/evals/`. An agent following the playbook wouldn't know test skeletons or eval checks exist.
- **Impact**: Implementation agents may write tests from scratch instead of implementing existing skeletons. Eval checks won't be referenced as quality gates during implementation.
- **Priority**: P1
- **Complexity**: S

#### M3: `traceability-matrix` doesn't use `docs/story-tests-map.md`
- **File**: `pipeline/validation/traceability-matrix.md`
- **Problem**: Traceability traces PRD → Stories → Tasks but the chain should be PRD → Stories → Test Cases → Tasks. The `docs/story-tests-map.md` artifact provides the Stories → Test Cases link, but traceability-matrix doesn't read it.
- **Impact**: Traceability validation can't verify that every acceptance criterion has a test case, which is the entire point of story-tests.
- **Priority**: P1
- **Complexity**: S

#### M4: `output-consumption.bats` incorrectly exempts `story-tests`
- **File**: `tests/evals/output-consumption.bats`
- **Problem**: `story-tests` is listed as `TERMINAL_OUTPUT_EXEMPT`, but its outputs ARE consumed by `create-evals` (which declares `reads: [story-tests]` and lists `tests/acceptance/` as optional input). The exemption masks a real data flow.
- **Impact**: If `create-evals` stops reading story-tests outputs, the eval won't catch it.
- **Priority**: P1
- **Complexity**: S

### P2: Missing — Should Exist But Doesn't

#### N1: No `reads` field on `implementation-playbook`
- **File**: `pipeline/finalization/implementation-playbook.md`
- **Problem**: The playbook has no `reads:` field at all. It should read `[story-tests, create-evals, implementation-plan]` to explicitly declare its artifact dependencies.
- **Impact**: The pipeline doesn't track that the playbook needs quality artifacts.
- **Priority**: P2
- **Complexity**: S

#### N2: No `reads` field on `traceability-matrix`
- **File**: `pipeline/validation/traceability-matrix.md`
- **Problem**: No `reads:` field. Should read `[story-tests, create-evals]` to declare that traceability validation uses test mapping and eval standard artifacts.
- **Priority**: P2
- **Complexity**: S

#### N3: `implementation-plan` command doesn't list story-tests outputs in Required Reading
- **File**: `commands/implementation-plan.md`
- **Problem**: The "Required Reading Before Creating Tasks" table lists 16 documents but omits `tests/acceptance/` (the test skeletons) and `docs/story-tests-map.md` (the AC → test mapping). These are critical for writing task descriptions that reference which tests to implement.
- **Priority**: P2
- **Complexity**: S

#### N4: No meta-eval for the quality → planning artifact chain
- **Problem**: No eval verifies that `implementation-plan`'s dependencies include steps that produce test/eval artifacts. If someone removes `create-evals` from `implementation-plan`'s dependencies, no eval would catch it.
- **Priority**: P2
- **Complexity**: M

### P3: Weak — Exists But Insufficient

#### W1: `traceability-matrix` Quality Criteria are generic
- **File**: `pipeline/validation/traceability-matrix.md`
- **Problem**: Quality criteria say "Analysis is comprehensive" and "Findings are actionable" — these are copy-paste from other validation steps. Missing: "Every AC maps to at least one test case in docs/story-tests-map.md", "Every test case maps to at least one implementation task."
- **Priority**: P3
- **Complexity**: S

#### W2: `implementation-plan` Quality Criteria don't mention test skeletons
- **File**: `pipeline/planning/implementation-plan.md`
- **Problem**: Quality criteria include "Tasks incorporate testing requirements from testing strategy" but don't mention "Tasks reference corresponding test skeletons from tests/acceptance/". The distinction matters — one points to strategy docs, the other points to actual pending test files that agents should implement.
- **Priority**: P3
- **Complexity**: S

#### W3: `implementation-playbook` Quality Criteria don't mention eval gates
- **File**: `pipeline/finalization/implementation-playbook.md`
- **Problem**: Quality criteria include "Quality gates are defined" but don't specify that `make eval` should be one of those gates, or that agents should verify test skeleton implementation status.
- **Priority**: P3
- **Complexity**: S

#### W4: Incremental update story is incomplete
- **Problem**: Both `story-tests` and `create-evals` have good update mode logic. But when a user adds a new user story after the pipeline has run, the downstream chain doesn't propagate cleanly: story-tests can add new test files (good), create-evals can regenerate coverage evals (good), but `implementation-plan` doesn't know to add tasks for the new test skeletons because it doesn't read story-tests outputs.
- **Priority**: P3
- **Complexity**: M

---

## 4. Recommendations

### R1: Add `story-tests` to `implementation-plan` reads (fixes M1)
**File**: `pipeline/planning/implementation-plan.md`
**Change**: Add `reads: [create-prd, story-tests]` (currently `reads: [create-prd]`)
**Body change**: Add to Inputs section:
```
- tests/acceptance/ (required if exists) — test skeletons to reference in task descriptions
- docs/story-tests-map.md (required if exists) — AC-to-test mapping for task coverage
```
**Why**: Tasks need to reference which test skeletons to implement.

### R2: Add `reads` to `implementation-playbook` (fixes M2, N1)
**File**: `pipeline/finalization/implementation-playbook.md`
**Change**: Add `reads: [story-tests, create-evals, implementation-plan]`
**Body change**: Add to Inputs section:
```
- tests/acceptance/ (required if exists) — test skeletons agents implement during TDD
- docs/story-tests-map.md (required if exists) — story → test mapping for progress tracking
- tests/evals/ (required if exists) — project eval checks to run as quality gates
- docs/eval-standards.md (required if exists) — what evals check and what they don't
```
**Why**: The playbook is the operational guide agents follow. It must reference all quality artifacts.

### R3: Add `reads` to `traceability-matrix` (fixes M3, N2)
**File**: `pipeline/validation/traceability-matrix.md`
**Change**: Add `reads: [story-tests, create-evals]`
**Body change**: Add to Inputs section:
```
- docs/story-tests-map.md (required if exists) — AC-to-test-case traceability
- tests/acceptance/ (required if exists) — test skeleton files for verification
- docs/eval-standards.md (required if exists) — eval coverage documentation
```
**Why**: Traceability should verify the full chain including Stories → Test Cases.

### R4: Remove `story-tests` from terminal output exemptions (fixes M4)
**File**: `tests/evals/output-consumption.bats`
**Change**: Remove `"story-tests"` from `TERMINAL_OUTPUT_EXEMPT` array
**Why**: `create-evals` consumes story-tests outputs. The exemption hides a real data flow from the eval.

### R5: Add story-tests outputs to implementation-plan command Required Reading (fixes N3)
**File**: `commands/implementation-plan.md`
**Change**: Add two rows to the Required Reading table:
```
| `tests/acceptance/` | *(if exists)* Test skeleton files — reference in task descriptions so agents know which tests to implement |
| `docs/story-tests-map.md` | *(if exists)* AC-to-test mapping — verify task coverage against test coverage |
```

### R6: Strengthen Quality Criteria (fixes W1, W2, W3)

**`pipeline/validation/traceability-matrix.md`** — Add:
```
- Every AC maps to at least one test case (verified against docs/story-tests-map.md if it exists)
- Every test case maps to at least one implementation task
```

**`pipeline/planning/implementation-plan.md`** — Add:
```
- Tasks reference corresponding test skeletons from tests/acceptance/ where applicable
```

**`pipeline/finalization/implementation-playbook.md`** — Add:
```
- Quality gates include `make eval` (or equivalent) as a required check
- Agent workflow references test skeleton implementation status from tests/acceptance/
```

---

## 5. Proposed Changes

### Pipeline Frontmatter Edits

| File | Field | Current | Proposed |
|------|-------|---------|----------|
| `pipeline/planning/implementation-plan.md` | `reads` | `[create-prd]` | `[create-prd, story-tests]` |
| `pipeline/finalization/implementation-playbook.md` | `reads` | *(missing)* | `[story-tests, create-evals, implementation-plan]` |
| `pipeline/validation/traceability-matrix.md` | `reads` | *(missing)* | `[story-tests, create-evals]` |

### Meta-Eval Edit

| File | Change |
|------|--------|
| `tests/evals/output-consumption.bats` | Remove `"story-tests"` from `TERMINAL_OUTPUT_EXEMPT` |

### Pipeline Body/Quality Criteria Edits

| File | Section | Addition |
|------|---------|----------|
| `implementation-plan.md` | `## Inputs` | Add `tests/acceptance/` and `docs/story-tests-map.md` |
| `implementation-plan.md` | `## Quality Criteria` | Add "Tasks reference test skeletons from tests/acceptance/" |
| `implementation-playbook.md` | `## Inputs` | Add quality artifact references (tests/acceptance/, tests/evals/, docs/eval-standards.md) |
| `implementation-playbook.md` | `## Quality Criteria` | Add `make eval` as quality gate, test skeleton references |
| `traceability-matrix.md` | `## Inputs` | Add `docs/story-tests-map.md` and `tests/acceptance/` |
| `traceability-matrix.md` | `## Quality Criteria` | Add AC → test case and test case → task traceability criteria |

### Command File Edits

| File | Section | Addition |
|------|---------|----------|
| `commands/implementation-plan.md` | Required Reading table | Add `tests/acceptance/` and `docs/story-tests-map.md` rows |
| `commands/implementation-playbook.md` | Inputs/context | Add quality artifact references |
