# Remove Phase Numbering from Pipeline Steps

> **For agentic workers:** Use superpowers:executing-plans to implement the plan generated from this spec.

**Goal:** Replace the `phase-NN-` naming convention with semantic step names and directory-based grouping, eliminating misleading numerical ordering from the pipeline.

**Motivation:** After reordering implementation tasks to run after testing/ops/security (PR #28), phase numbers no longer match execution order — phase 7 runs after phase 10. The v2 system already uses dependencies for ordering; phase numbers are cosmetic but actively misleading.

---

## Section 1: File Renames and Directory Structure

### New directory layout

```
pipeline/
  pre/             (unchanged — 6 files)
  modeling/        (new — 2 files)
  decisions/       (new — 2 files)
  architecture/    (new — 2 files)
  specification/   (new — 6 files)
  quality/         (new — 6 files)
  planning/        (new — 2 files)
  validation/      (unchanged — 7 files)
  finalization/    (unchanged — 3 files)
```

### Complete rename table

| Old file | New file | Old step name | New step name |
|---|---|---|---|
| `pipeline/phase-01-domain-modeling.md` | `pipeline/modeling/domain-modeling.md` | `phase-01-domain-modeling` | `domain-modeling` |
| `pipeline/phase-01a-review-domain-modeling.md` | `pipeline/modeling/review-domain-modeling.md` | `phase-01a-review-domain-modeling` | `review-domain-modeling` |
| `pipeline/phase-02-adrs.md` | `pipeline/decisions/adrs.md` | `phase-02-adrs` | `adrs` |
| `pipeline/phase-02a-review-adrs.md` | `pipeline/decisions/review-adrs.md` | `phase-02a-review-adrs` | `review-adrs` |
| `pipeline/phase-03-system-architecture.md` | `pipeline/architecture/system-architecture.md` | `phase-03-system-architecture` | `system-architecture` |
| `pipeline/phase-03a-review-architecture.md` | `pipeline/architecture/review-architecture.md` | `phase-03a-review-architecture` | `review-architecture` |
| `pipeline/phase-04-database-schema.md` | `pipeline/specification/database-schema.md` | `phase-04-database-schema` | `database-schema` |
| `pipeline/phase-04a-review-database.md` | `pipeline/specification/review-database.md` | `phase-04a-review-database` | `review-database` |
| `pipeline/phase-05-api-contracts.md` | `pipeline/specification/api-contracts.md` | `phase-05-api-contracts` | `api-contracts` |
| `pipeline/phase-05a-review-api.md` | `pipeline/specification/review-api.md` | `phase-05a-review-api` | `review-api` |
| `pipeline/phase-06-ux-spec.md` | `pipeline/specification/ux-spec.md` | `phase-06-ux-spec` | `ux-spec` |
| `pipeline/phase-06a-review-ux.md` | `pipeline/specification/review-ux.md` | `phase-06a-review-ux` | `review-ux` |
| `pipeline/phase-08-testing-strategy.md` | `pipeline/quality/testing-strategy.md` | `phase-08-testing-strategy` | `testing-strategy` |
| `pipeline/phase-08a-review-testing.md` | `pipeline/quality/review-testing.md` | `phase-08a-review-testing` | `review-testing` |
| `pipeline/phase-09-operations.md` | `pipeline/quality/operations.md` | `phase-09-operations` | `operations` |
| `pipeline/phase-09a-review-operations.md` | `pipeline/quality/review-operations.md` | `phase-09a-review-operations` | `review-operations` |
| `pipeline/phase-10-security.md` | `pipeline/quality/security.md` | `phase-10-security` | `security` |
| `pipeline/phase-10a-review-security.md` | `pipeline/quality/review-security.md` | `phase-10a-review-security` | `review-security` |
| `pipeline/phase-07-implementation-tasks.md` | `pipeline/planning/implementation-tasks.md` | `phase-07-implementation-tasks` | `implementation-tasks` |
| `pipeline/phase-07a-review-tasks.md` | `pipeline/planning/review-tasks.md` | `phase-07a-review-tasks` | `review-tasks` |

---

## Section 2: Frontmatter Changes

Each renamed meta-prompt file gets four frontmatter changes:

1. **`name`** — updated to new step name (e.g., `phase-07-implementation-tasks` → `implementation-tasks`)
2. **`phase`** — changed from numeric string to named group (e.g., `"7"` → `"planning"`)
3. **`order`** — new integer field for Kahn's algorithm tiebreaking
4. **`dependencies`** — references updated to new step names

### Example: `planning/implementation-tasks.md`

Before:
```yaml
name: phase-07-implementation-tasks
phase: "7"
dependencies: [phase-08-testing-strategy, phase-09-operations, phase-10-security]
```

After:
```yaml
name: implementation-tasks
phase: "planning"
order: 25
dependencies: [testing-strategy, operations, security]
```

### Phase groups and order ranges

| Group | Steps | Order range |
|---|---|---|
| `pre` | create-prd, review-prd, innovate-prd, user-stories, review-user-stories, innovate-user-stories | 1-6 |
| `modeling` | domain-modeling, review-domain-modeling | 7-8 |
| `decisions` | adrs, review-adrs | 9-10 |
| `architecture` | system-architecture, review-architecture | 11-12 |
| `specification` | database-schema, review-database, api-contracts, review-api, ux-spec, review-ux | 13-18 |
| `quality` | testing-strategy, review-testing, operations, review-operations, security, review-security | 19-24 |
| `planning` | implementation-tasks, review-tasks | 25-26 |
| `validation` | cross-phase-consistency, traceability-matrix, decision-completeness, critical-path-walkthrough, implementability-dry-run, dependency-graph-validation, scope-creep-check | 27-33 |
| `finalization` | apply-fixes-and-freeze, developer-onboarding-guide, implementation-playbook | 34-36 |

### Existing steps (pre, validation, finalization)

These steps are NOT renamed. Their `name` and `phase` fields are unchanged. They receive:
- An `order` field addition
- `dependencies` field updates where they reference old `phase-NN-` step names (e.g., validation steps that depend on `phase-10a-review-security` become `review-security`)

---

## Section 3: Review Output Paths

Review meta-prompts produce findings in `docs/reviews/`. Both the `outputs` frontmatter field AND body-text references (in "Expected Outputs" and "Mode Detection" sections) in each review step must be updated.

| Old output path | New output path |
|---|---|
| `docs/reviews/phase-01a-review.md` | `docs/reviews/review-domain-modeling.md` |
| `docs/reviews/phase-02a-review.md` | `docs/reviews/review-adrs.md` |
| `docs/reviews/phase-03a-review.md` | `docs/reviews/review-architecture.md` |
| `docs/reviews/phase-04a-review.md` | `docs/reviews/review-database.md` |
| `docs/reviews/phase-05a-review.md` | `docs/reviews/review-api.md` |
| `docs/reviews/phase-06a-review.md` | `docs/reviews/review-ux.md` |
| `docs/reviews/phase-07a-review.md` | `docs/reviews/review-tasks.md` |
| `docs/reviews/phase-08a-review.md` | `docs/reviews/review-testing.md` |
| `docs/reviews/phase-09a-review.md` | `docs/reviews/review-operations.md` |
| `docs/reviews/phase-10a-review.md` | `docs/reviews/review-security.md` |

No group prefix — step names are unique. Pre-pipeline reviews (`docs/reviews/pre-review-prd.md`, etc.) are unchanged.

---

## Section 4: Cascade Updates

### 4a. Methodology presets (3 files)

`methodology/deep.yml`, `methodology/mvp.yml`, `methodology/custom-defaults.yml`:
- Replace all 20 `phase-NN-<name>` step keys with `<name>` keys
- Step list order already reflects execution order

### 4b. Docs/v2 live files (17 files, ~160 references)

Search-and-replace across all non-archive docs/v2 files:
- Step names: `phase-NN-<name>` → `<name>` (e.g., `phase-07-implementation-tasks` → `implementation-tasks`)
- File paths: `pipeline/phase-NN-<name>.md` → `pipeline/<group>/<name>.md`
- Frontmatter examples: update `phase: "7"` patterns to `phase: "planning"` + `order: N`

Files affected:
- `docs/v2/adrs/ADR-042-knowledge-base-domain-expertise.md`
- `docs/v2/adrs/ADR-043-depth-scale.md`
- `docs/v2/adrs/ADR-046-phase-specific-review-criteria.md`
- `docs/v2/data/config-yml-schema.md`
- `docs/v2/data/frontmatter-schema.md`
- `docs/v2/data/manifest-yml-schema.md`
- `docs/v2/domain-models/08-prompt-frontmatter.md`
- `docs/v2/domain-models/15-assembly-engine.md`
- `docs/v2/domain-models/16-methodology-depth-resolution.md`
- `docs/v2/implementation/task-breakdown.md`
- `docs/v2/scaffold-v2-prd.md`
- `docs/v2/testing-strategy.md`
- `docs/v2/ux/cli-output-formats.md`
- `docs/v2/ux/error-messages.md`
- `docs/v2/validation/critical-path-analysis.md`
- `docs/v2/validation/implementability-review.md`
- `docs/v2/validation/traceability-matrix.md`

### 4c. Knowledge base — no changes needed (0 references)

### 4d. Archive files — intentionally untouched (historical record)

### 4e. Commands, scripts, CLAUDE.md — no changes needed (0 references)

---

## Section 5: What Does NOT Change

- **Archive files** (`docs/v2/archive/`) — untouched
- **Pre-pipeline steps** — names and phase unchanged, only `order` field added
- **Validation steps** — names and phase unchanged, only `order` field added
- **Finalization steps** — names and phase unchanged, only `order` field added
- **Commands directory** (`commands/`) — no phase-NN references
- **Knowledge base** (`knowledge/`) — no phase-NN references
- **v1 prompts.md** — independent numbering convention, not part of v2

---

## Section 6: Verification Strategy

After all changes, verify:

1. **No stale references** — grep for `phase-\d{2}` across all non-archive files, excluding `prompts.md` (v1); expect zero matches
2. **All step names consistent** — every `name` field in pipeline frontmatter matches the filename stem
3. **All dependencies resolve** — every step referenced in a `dependencies` field exists as a `name` in another meta-prompt
4. **Order values unique** — no two steps share the same `order` value
5. **`make check` passes** — all 55 tests, lint, frontmatter validation
6. **Methodology presets list every step** — deep.yml has all steps, mvp.yml has correct 4 enabled
