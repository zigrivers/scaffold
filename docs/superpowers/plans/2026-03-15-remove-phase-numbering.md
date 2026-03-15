# Remove Phase Numbering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip `phase-NN-` prefix from 20 pipeline files, move into semantic subdirectories, replace numeric phases with named groups + order field, and update all references.

**Architecture:** Git mv 20 files into 6 new subdirectories. Update frontmatter (name, phase, order, dependencies) in all 36 pipeline steps. Update 3 methodology presets and 17 docs/v2 files. Verify with grep and make check.

**Tech Stack:** Bash (git mv, mkdir), markdown editing, YAML editing

**Spec:** `docs/superpowers/specs/2026-03-15-remove-phase-numbering-design.md`

---

## Chunk 1: Pipeline Restructuring

### Task 1: Create directories and move files

**Files:**
- Create directories: `pipeline/modeling/`, `pipeline/decisions/`, `pipeline/architecture/`, `pipeline/specification/`, `pipeline/quality/`, `pipeline/planning/`
- Move: 20 files (see steps below)

- [ ] **Step 1: Create the 6 new directories**

```bash
mkdir -p pipeline/modeling pipeline/decisions pipeline/architecture pipeline/specification pipeline/quality pipeline/planning
```

- [ ] **Step 2: Git mv modeling and decisions files**

```bash
git mv pipeline/phase-01-domain-modeling.md pipeline/modeling/domain-modeling.md
git mv pipeline/phase-01a-review-domain-modeling.md pipeline/modeling/review-domain-modeling.md
git mv pipeline/phase-02-adrs.md pipeline/decisions/adrs.md
git mv pipeline/phase-02a-review-adrs.md pipeline/decisions/review-adrs.md
```

- [ ] **Step 3: Git mv architecture files**

```bash
git mv pipeline/phase-03-system-architecture.md pipeline/architecture/system-architecture.md
git mv pipeline/phase-03a-review-architecture.md pipeline/architecture/review-architecture.md
```

- [ ] **Step 4: Git mv specification files**

```bash
git mv pipeline/phase-04-database-schema.md pipeline/specification/database-schema.md
git mv pipeline/phase-04a-review-database.md pipeline/specification/review-database.md
git mv pipeline/phase-05-api-contracts.md pipeline/specification/api-contracts.md
git mv pipeline/phase-05a-review-api.md pipeline/specification/review-api.md
git mv pipeline/phase-06-ux-spec.md pipeline/specification/ux-spec.md
git mv pipeline/phase-06a-review-ux.md pipeline/specification/review-ux.md
```

- [ ] **Step 5: Git mv quality files**

```bash
git mv pipeline/phase-08-testing-strategy.md pipeline/quality/testing-strategy.md
git mv pipeline/phase-08a-review-testing.md pipeline/quality/review-testing.md
git mv pipeline/phase-09-operations.md pipeline/quality/operations.md
git mv pipeline/phase-09a-review-operations.md pipeline/quality/review-operations.md
git mv pipeline/phase-10-security.md pipeline/quality/security.md
git mv pipeline/phase-10a-review-security.md pipeline/quality/review-security.md
```

- [ ] **Step 6: Git mv planning files**

```bash
git mv pipeline/phase-07-implementation-tasks.md pipeline/planning/implementation-tasks.md
git mv pipeline/phase-07a-review-tasks.md pipeline/planning/review-tasks.md
```

- [ ] **Step 7: Verify no files remain in pipeline root**

```bash
ls pipeline/*.md
```

Expected: No `.md` files in `pipeline/` root (only subdirectories).

- [ ] **Step 8: Commit**

```bash
git add -A pipeline/
git commit -m "refactor: move 20 pipeline files into semantic subdirectories"
```

---

### Task 2: Update frontmatter — modeling, decisions, architecture (6 files)

**Files:**
- Modify: `pipeline/modeling/domain-modeling.md`
- Modify: `pipeline/modeling/review-domain-modeling.md`
- Modify: `pipeline/decisions/adrs.md`
- Modify: `pipeline/decisions/review-adrs.md`
- Modify: `pipeline/architecture/system-architecture.md`
- Modify: `pipeline/architecture/review-architecture.md`

For each file, update 4 frontmatter fields: `name`, `phase`, add `order`, update `dependencies`. Also update `outputs` for review files, and body-text references to old output paths.

- [ ] **Step 1: Update `pipeline/modeling/domain-modeling.md`**

Frontmatter changes:
- `name: phase-01-domain-modeling` → `name: domain-modeling`
- `phase: "1"` → `phase: "modeling"`
- Add: `order: 7`
- `dependencies: [innovate-user-stories]` → `dependencies: [innovate-user-stories]` (unchanged — no phase-NN refs)

- [ ] **Step 2: Update `pipeline/modeling/review-domain-modeling.md`**

Frontmatter changes:
- `name: phase-01a-review-domain-modeling` → `name: review-domain-modeling`
- `phase: "1a"` → `phase: "modeling"`
- Add: `order: 8`
- `dependencies: [phase-01-domain-modeling]` → `dependencies: [domain-modeling]`
- `outputs: [docs/reviews/phase-01a-review.md]` → `outputs: [docs/reviews/review-domain-modeling.md]`

Body-text changes: replace all occurrences of `docs/reviews/phase-01a-review.md` with `docs/reviews/review-domain-modeling.md` in Expected Outputs and Mode Detection sections.

- [ ] **Step 3: Update `pipeline/decisions/adrs.md`**

Frontmatter changes:
- `name: phase-02-adrs` → `name: adrs`
- `phase: "2"` → `phase: "decisions"`
- Add: `order: 9`
- `dependencies: [phase-01-domain-modeling]` → `dependencies: [domain-modeling]`

- [ ] **Step 4: Update `pipeline/decisions/review-adrs.md`**

Frontmatter changes:
- `name: phase-02a-review-adrs` → `name: review-adrs`
- `phase: "2a"` → `phase: "decisions"`
- Add: `order: 10`
- `dependencies: [phase-02-adrs]` → `dependencies: [adrs]`
- `outputs: [docs/reviews/phase-02a-review.md]` → `outputs: [docs/reviews/review-adrs.md]`

Body-text changes: replace `docs/reviews/phase-02a-review.md` → `docs/reviews/review-adrs.md`.

- [ ] **Step 5: Update `pipeline/architecture/system-architecture.md`**

Frontmatter changes:
- `name: phase-03-system-architecture` → `name: system-architecture`
- `phase: "3"` → `phase: "architecture"`
- Add: `order: 11`
- `dependencies: [phase-02-adrs]` → `dependencies: [adrs]`

- [ ] **Step 6: Update `pipeline/architecture/review-architecture.md`**

Frontmatter changes:
- `name: phase-03a-review-architecture` → `name: review-architecture`
- `phase: "3a"` → `phase: "architecture"`
- Add: `order: 12`
- `dependencies: [phase-03-system-architecture]` → `dependencies: [system-architecture]`
- `outputs: [docs/reviews/phase-03a-review.md]` → `outputs: [docs/reviews/review-architecture.md]`

Body-text changes: replace `docs/reviews/phase-03a-review.md` → `docs/reviews/review-architecture.md`.

- [ ] **Step 7: Run `make check`**

Expected: 55 tests pass.

- [ ] **Step 8: Commit**

```bash
git add pipeline/modeling/ pipeline/decisions/ pipeline/architecture/
git commit -m "refactor: update frontmatter in modeling, decisions, architecture steps"
```

---

### Task 3: Update frontmatter — specification (6 files)

**Files:**
- Modify: `pipeline/specification/database-schema.md`
- Modify: `pipeline/specification/review-database.md`
- Modify: `pipeline/specification/api-contracts.md`
- Modify: `pipeline/specification/review-api.md`
- Modify: `pipeline/specification/ux-spec.md`
- Modify: `pipeline/specification/review-ux.md`

- [ ] **Step 1: Update `pipeline/specification/database-schema.md`**

Frontmatter changes:
- `name: phase-04-database-schema` → `name: database-schema`
- `phase: "4"` → `phase: "specification"`
- Add: `order: 13`
- `dependencies: [phase-03-system-architecture]` → `dependencies: [system-architecture]`

- [ ] **Step 2: Update `pipeline/specification/review-database.md`**

Frontmatter changes:
- `name: phase-04a-review-database` → `name: review-database`
- `phase: "4a"` → `phase: "specification"`
- Add: `order: 14`
- `dependencies: [phase-04-database-schema]` → `dependencies: [database-schema]`
- `outputs: [docs/reviews/phase-04a-review.md]` → `outputs: [docs/reviews/review-database.md]`

Body-text changes: replace `docs/reviews/phase-04a-review.md` → `docs/reviews/review-database.md`.

- [ ] **Step 3: Update `pipeline/specification/api-contracts.md`**

Frontmatter changes:
- `name: phase-05-api-contracts` → `name: api-contracts`
- `phase: "5"` → `phase: "specification"`
- Add: `order: 15`
- `dependencies: [phase-03-system-architecture]` → `dependencies: [system-architecture]`

- [ ] **Step 4: Update `pipeline/specification/review-api.md`**

Frontmatter changes:
- `name: phase-05a-review-api` → `name: review-api`
- `phase: "5a"` → `phase: "specification"`
- Add: `order: 16`
- `dependencies: [phase-05-api-contracts]` → `dependencies: [api-contracts]`
- `outputs: [docs/reviews/phase-05a-review.md]` → `outputs: [docs/reviews/review-api.md]`

Body-text changes: replace `docs/reviews/phase-05a-review.md` → `docs/reviews/review-api.md`.

- [ ] **Step 5: Update `pipeline/specification/ux-spec.md`**

Frontmatter changes:
- `name: phase-06-ux-spec` → `name: ux-spec`
- `phase: "6"` → `phase: "specification"`
- Add: `order: 17`
- `dependencies: [phase-03-system-architecture]` → `dependencies: [system-architecture]`

- [ ] **Step 6: Update `pipeline/specification/review-ux.md`**

Frontmatter changes:
- `name: phase-06a-review-ux` → `name: review-ux`
- `phase: "6a"` → `phase: "specification"`
- Add: `order: 18`
- `dependencies: [phase-06-ux-spec]` → `dependencies: [ux-spec]`
- `outputs: [docs/reviews/phase-06a-review.md]` → `outputs: [docs/reviews/review-ux.md]`

Body-text changes: replace `docs/reviews/phase-06a-review.md` → `docs/reviews/review-ux.md`.

- [ ] **Step 7: Run `make check`**

Expected: 55 tests pass.

- [ ] **Step 8: Commit**

```bash
git add pipeline/specification/
git commit -m "refactor: update frontmatter in specification steps"
```

---

### Task 4: Update frontmatter — quality and planning (8 files)

**Files:**
- Modify: `pipeline/quality/testing-strategy.md`
- Modify: `pipeline/quality/review-testing.md`
- Modify: `pipeline/quality/operations.md`
- Modify: `pipeline/quality/review-operations.md`
- Modify: `pipeline/quality/security.md`
- Modify: `pipeline/quality/review-security.md`
- Modify: `pipeline/planning/implementation-tasks.md`
- Modify: `pipeline/planning/review-tasks.md`

- [ ] **Step 1: Update `pipeline/quality/testing-strategy.md`**

Frontmatter changes:
- `name: phase-08-testing-strategy` → `name: testing-strategy`
- `phase: "8"` → `phase: "quality"`
- Add: `order: 19`
- `dependencies: [phase-03-system-architecture]` → `dependencies: [system-architecture]`

- [ ] **Step 2: Update `pipeline/quality/review-testing.md`**

Frontmatter changes:
- `name: phase-08a-review-testing` → `name: review-testing`
- `phase: "8a"` → `phase: "quality"`
- Add: `order: 20`
- `dependencies: [phase-08-testing-strategy]` → `dependencies: [testing-strategy]`
- `outputs: [docs/reviews/phase-08a-review.md]` → `outputs: [docs/reviews/review-testing.md]`

Body-text changes: replace `docs/reviews/phase-08a-review.md` → `docs/reviews/review-testing.md`.

- [ ] **Step 3: Update `pipeline/quality/operations.md`**

Frontmatter changes:
- `name: phase-09-operations` → `name: operations`
- `phase: "9"` → `phase: "quality"`
- Add: `order: 21`
- `dependencies: [phase-08-testing-strategy]` → `dependencies: [testing-strategy]`

- [ ] **Step 4: Update `pipeline/quality/review-operations.md`**

Frontmatter changes:
- `name: phase-09a-review-operations` → `name: review-operations`
- `phase: "9a"` → `phase: "quality"`
- Add: `order: 22`
- `dependencies: [phase-09-operations]` → `dependencies: [operations]`
- `outputs: [docs/reviews/phase-09a-review.md]` → `outputs: [docs/reviews/review-operations.md]`

Body-text changes: replace `docs/reviews/phase-09a-review.md` → `docs/reviews/review-operations.md`.

- [ ] **Step 5: Update `pipeline/quality/security.md`**

Frontmatter changes:
- `name: phase-10-security` → `name: security`
- `phase: "10"` → `phase: "quality"`
- Add: `order: 23`
- `dependencies: [phase-09-operations]` → `dependencies: [operations]`

- [ ] **Step 6: Update `pipeline/quality/review-security.md`**

Frontmatter changes:
- `name: phase-10a-review-security` → `name: review-security`
- `phase: "10a"` → `phase: "quality"`
- Add: `order: 24`
- `dependencies: [phase-10-security]` → `dependencies: [security]`
- `outputs: [docs/reviews/phase-10a-review.md]` → `outputs: [docs/reviews/review-security.md]`

Body-text changes: replace `docs/reviews/phase-10a-review.md` → `docs/reviews/review-security.md`.

- [ ] **Step 7: Update `pipeline/planning/implementation-tasks.md`**

Frontmatter changes:
- `name: phase-07-implementation-tasks` → `name: implementation-tasks`
- `phase: "7"` → `phase: "planning"`
- Add: `order: 25`
- `dependencies: [phase-08-testing-strategy, phase-09-operations, phase-10-security]` → `dependencies: [testing-strategy, operations, security]`

- [ ] **Step 8: Update `pipeline/planning/review-tasks.md`**

Frontmatter changes:
- `name: phase-07a-review-tasks` → `name: review-tasks`
- `phase: "7a"` → `phase: "planning"`
- Add: `order: 26`
- `dependencies: [phase-07-implementation-tasks]` → `dependencies: [implementation-tasks]`
- `outputs: [docs/reviews/phase-07a-review.md]` → `outputs: [docs/reviews/review-tasks.md]`

Body-text changes: replace `docs/reviews/phase-07a-review.md` → `docs/reviews/review-tasks.md`.

- [ ] **Step 9: Run `make check`**

Expected: 55 tests pass.

- [ ] **Step 10: Commit**

```bash
git add pipeline/quality/ pipeline/planning/
git commit -m "refactor: update frontmatter in quality and planning steps"
```

---

## Chunk 2: Existing Steps and Presets

### Task 5: Add order fields to pre-pipeline steps (6 files)

**Files:**
- Modify: `pipeline/pre/create-prd.md`
- Modify: `pipeline/pre/review-prd.md`
- Modify: `pipeline/pre/innovate-prd.md`
- Modify: `pipeline/pre/user-stories.md`
- Modify: `pipeline/pre/review-user-stories.md`
- Modify: `pipeline/pre/innovate-user-stories.md`

These files keep their existing `name`, `phase`, and `dependencies`. Only add the `order` field after the `phase` line.

- [ ] **Step 1: Add `order: 1` to `create-prd.md`**
- [ ] **Step 2: Add `order: 2` to `review-prd.md`**
- [ ] **Step 3: Add `order: 3` to `innovate-prd.md`**
- [ ] **Step 4: Add `order: 4` to `user-stories.md`**
- [ ] **Step 5: Add `order: 5` to `review-user-stories.md`**
- [ ] **Step 6: Add `order: 6` to `innovate-user-stories.md`**

- [ ] **Step 7: Run `make check`**

Expected: 55 tests pass.

- [ ] **Step 8: Commit**

```bash
git add pipeline/pre/
git commit -m "refactor: add order fields to pre-pipeline steps"
```

---

### Task 6: Update validation and finalization steps (10 files)

**Files:**
- Modify: `pipeline/validation/cross-phase-consistency.md`
- Modify: `pipeline/validation/traceability-matrix.md`
- Modify: `pipeline/validation/decision-completeness.md`
- Modify: `pipeline/validation/critical-path-walkthrough.md`
- Modify: `pipeline/validation/implementability-dry-run.md`
- Modify: `pipeline/validation/dependency-graph-validation.md`
- Modify: `pipeline/validation/scope-creep-check.md`
- Modify: `pipeline/finalization/apply-fixes-and-freeze.md`
- Modify: `pipeline/finalization/developer-onboarding-guide.md`
- Modify: `pipeline/finalization/implementation-playbook.md`

- [ ] **Step 1: Update all 7 validation steps**

For each validation step:
- Add `order` field (27-33, in the order listed above)
- Change `dependencies: [phase-10a-review-security]` → `dependencies: [review-tasks, review-security]`

**Why `[review-tasks, review-security]`:** After PR #28's reorder, `review-tasks` (planning) and `review-security` (quality) are on parallel branches. Validation must wait for both. The original dependency on `phase-10a-review-security` alone was incomplete — it didn't wait for implementation task review.

Order assignments:
- cross-phase-consistency: `order: 27`
- traceability-matrix: `order: 28`
- decision-completeness: `order: 29`
- critical-path-walkthrough: `order: 30`
- implementability-dry-run: `order: 31`
- dependency-graph-validation: `order: 32`
- scope-creep-check: `order: 33`

- [ ] **Step 2: Update finalization steps**

For each finalization step, add `order` field only (dependencies reference other validation/finalization steps by name, which are unchanged):
- apply-fixes-and-freeze: `order: 34`
- developer-onboarding-guide: `order: 35`
- implementation-playbook: `order: 36`

- [ ] **Step 3: Run `make check`**

Expected: 55 tests pass.

- [ ] **Step 4: Commit**

```bash
git add pipeline/validation/ pipeline/finalization/
git commit -m "refactor: add order fields and update deps in validation/finalization steps"
```

---

### Task 7: Update methodology presets (3 files)

**Files:**
- Modify: `methodology/deep.yml`
- Modify: `methodology/mvp.yml`
- Modify: `methodology/custom-defaults.yml`

In each file, replace all 20 `phase-NN-<name>` step keys with the new `<name>` keys. Preserve the execution-order listing established in PR #28.

- [ ] **Step 1: Update `methodology/deep.yml`**

Replace these step keys (keeping their `{ enabled: true }` or `{ enabled: true, conditional: "if-needed" }` values):

| Old key | New key |
|---|---|
| `phase-01-domain-modeling` | `domain-modeling` |
| `phase-01a-review-domain-modeling` | `review-domain-modeling` |
| `phase-02-adrs` | `adrs` |
| `phase-02a-review-adrs` | `review-adrs` |
| `phase-03-system-architecture` | `system-architecture` |
| `phase-03a-review-architecture` | `review-architecture` |
| `phase-04-database-schema` | `database-schema` |
| `phase-04a-review-database` | `review-database` |
| `phase-05-api-contracts` | `api-contracts` |
| `phase-05a-review-api` | `review-api` |
| `phase-06-ux-spec` | `ux-spec` |
| `phase-06a-review-ux` | `review-ux` |
| `phase-08-testing-strategy` | `testing-strategy` |
| `phase-08a-review-testing` | `review-testing` |
| `phase-09-operations` | `operations` |
| `phase-09a-review-operations` | `review-operations` |
| `phase-10-security` | `security` |
| `phase-10a-review-security` | `review-security` |
| `phase-07-implementation-tasks` | `implementation-tasks` |
| `phase-07a-review-tasks` | `review-tasks` |

- [ ] **Step 2: Update `methodology/mvp.yml`**

Same key replacements as deep.yml (same 20 keys, different enabled values).

- [ ] **Step 3: Update `methodology/custom-defaults.yml`**

Same key replacements.

- [ ] **Step 4: Run `make check`**

Expected: 55 tests pass.

- [ ] **Step 5: Commit**

```bash
git add methodology/
git commit -m "refactor: update step names in methodology presets"
```

---

## Chunk 3: Documentation and Verification

### Task 8: Update docs/v2 references — ADRs and data schemas (6 files)

**Files:**
- Modify: `docs/v2/adrs/ADR-042-knowledge-base-domain-expertise.md`
- Modify: `docs/v2/adrs/ADR-043-depth-scale.md`
- Modify: `docs/v2/adrs/ADR-046-phase-specific-review-criteria.md`
- Modify: `docs/v2/data/config-yml-schema.md`
- Modify: `docs/v2/data/frontmatter-schema.md`
- Modify: `docs/v2/data/manifest-yml-schema.md`

For each file, apply three categories of search-and-replace:

1. **Step names:** Replace every `phase-NN-<name>` or `phase-NNa-<name>` with the new `<name>` (use the rename table from the spec)
2. **File paths:** Replace `pipeline/phase-NN-<name>.md` with `pipeline/<group>/<name>.md` and `pipeline/pre/<name>.md` paths where the `pre/` was already correct
3. **Frontmatter examples:** Where YAML examples show `phase: "7"` or similar, update to `phase: "<group>"` and add `order: N`

Do NOT modify `docs/v2/archive/` files.

- [ ] **Step 1: Update each file** — read, apply all three categories of replacements, verify no stale `phase-\d{2}` references remain in the file
- [ ] **Step 2: Commit**

```bash
git add docs/v2/adrs/ docs/v2/data/
git commit -m "docs(v2): update phase references in ADRs and data schemas"
```

---

### Task 9: Update docs/v2 references — domain models, implementation, PRD, testing (5 files)

**Files:**
- Modify: `docs/v2/domain-models/08-prompt-frontmatter.md`
- Modify: `docs/v2/domain-models/15-assembly-engine.md`
- Modify: `docs/v2/domain-models/16-methodology-depth-resolution.md`
- Modify: `docs/v2/implementation/task-breakdown.md`
- Modify: `docs/v2/scaffold-v2-prd.md`

Same three categories of search-and-replace as Task 8.

- [ ] **Step 1: Update each file**
- [ ] **Step 2: Commit**

```bash
git add docs/v2/domain-models/ docs/v2/implementation/ docs/v2/scaffold-v2-prd.md
git commit -m "docs(v2): update phase references in domain models, implementation, and PRD"
```

---

### Task 10: Update docs/v2 references — UX, testing strategy, validation (6 files)

**Files:**
- Modify: `docs/v2/testing-strategy.md`
- Modify: `docs/v2/ux/cli-output-formats.md`
- Modify: `docs/v2/ux/error-messages.md`
- Modify: `docs/v2/validation/critical-path-analysis.md`
- Modify: `docs/v2/validation/implementability-review.md`
- Modify: `docs/v2/validation/traceability-matrix.md`

Same three categories of search-and-replace as Task 8.

- [ ] **Step 1: Update each file**
- [ ] **Step 2: Commit**

```bash
git add docs/v2/testing-strategy.md docs/v2/ux/ docs/v2/validation/
git commit -m "docs(v2): update phase references in UX, testing, and validation docs"
```

---

### Task 11: Full verification

- [ ] **Step 1: Grep for stale phase-NN references**

```bash
grep -rn 'phase-[0-9][0-9]' --include='*.md' --include='*.yml' --exclude-dir='archive' --exclude-dir='superpowers' . | grep -v 'prompts.md'
```

Expected: Zero matches. If any remain, fix them before proceeding.

- [ ] **Step 2: Verify all step names match filenames**

For each file in `pipeline/*/`:
- Extract `name:` from frontmatter
- Verify it matches the filename stem (filename without `.md`)

- [ ] **Step 3: Verify all dependencies resolve**

For each `dependencies: [...]` list across all pipeline files:
- Every referenced step name must exist as a `name:` field in some other pipeline file

- [ ] **Step 4: Verify order values are unique**

Extract all `order:` values from pipeline files. Verify no duplicates and values span 1-36.

- [ ] **Step 5: Verify methodology presets list every step**

Verify `methodology/deep.yml` contains all 36 step names. Verify `methodology/mvp.yml` has exactly 4 steps enabled (create-prd, testing-strategy, implementation-tasks, implementation-playbook). Verify no step key contains `phase-`.

- [ ] **Step 6: Run `make check`**

```bash
make check
```

Expected: 55 tests pass, lint clean, frontmatter valid.

- [ ] **Step 7: Final commit if any verification fixes were needed**
