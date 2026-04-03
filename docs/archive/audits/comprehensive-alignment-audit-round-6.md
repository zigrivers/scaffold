# Comprehensive Pipeline Alignment Audit — Round 6

<!-- scaffold:audit-round-6 v2.40.1 2026-03-29 -->

## Executive Summary

**Pipeline version**: v2.40.1
**Audit date**: 2026-03-29
**Prior round**: Round 5 (v2.39.0)

### Overall Health Score: **A- (Strong — Stable, with systemic QC tagging gap identified)**

Round 5 regressions (operations/security grouped depths, command drift, MVP stuck point) are
all confirmed fixed in v2.40.0/v2.40.1. Build system is clean with zero drift. This round
surfaces a systemic gap: 93 QC criteria across 32 steps lack depth tags, making MVP-depth
self-assessment ambiguous. The `new-enhancement` build step has the most findings (5).

| Category | R4 | R5 | R6 | Trend |
|----------|----|----|----|----|
| BROKEN | 0 | 2 | 0 | ↓ (R5 regressions resolved) |
| MISALIGNED | 15 | 12 | 11 | ↓ improving |
| MISSING | 18 | 3 | 4 | → stable |
| WEAK | 54 | 20 | 43 | ↑ (deeper audit found systemic QC tagging gap) |
| **Total** | **87** | **37** | **58** | Deeper coverage; R5 fixes confirmed |

**Key findings this round:**
1. **Systemic**: 93 QC criteria across 32 steps lack depth tags (3-X1) — agents at MVP can't distinguish required vs optional criteria
2. **UMS path mismatches**: review-prd and implementation-plan-review have wrong file paths in Update Mode Specifics Detect field
3. **new-enhancement gaps**: Doesn't read architecture/domain/API docs for impact analysis, doesn't update spec-layer artifacts, has premature version-bump phase
4. **R5 regressions confirmed fixed**: operations/security depths, command drift, MVP stuck point all resolved
5. **Build system clean**: Zero content drift across all 15 sampled command/pipeline pairs

---

## Delta from Round 5

### Resolved Findings (R5 → R6)

| R5 Finding | Status | Evidence |
|-----------|--------|---------|
| 2-R1: operations.md/security.md grouped depths | RESOLVED | Individual depth levels 1-5 present in both files |
| 5-B1: Commands stale after R4 changes | RESOLVED | All commands rebuilt 2026-03-29 04:43:51 |
| 7-F1: MVP stuck at implementation-plan | RESOLVED | MVP-Specific Guidance section added (lines 70-94) |

### Regressions

None. All R5 fixes are intact.

---

## Findings by Module

### Module 1: Dependency, Data Flow & Mode Detection

**New findings: 4 | Carried forward: 7 | Total: 11**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **1-M6** | **MISALIGNED** | **review-prd** | **UMS Detect field references `docs/reviews/review-prd.md` but output is `docs/reviews/pre-review-prd.md`** | **P1** | **New** |
| **1-M7** | **MISALIGNED** | **implementation-plan-review** | **UMS Detect field references `docs/reviews/review-implementation-plan.md` but output is `docs/reviews/review-tasks.md`** | **P1** | **New** |
| **1-M8** | **MISALIGNED** | **implementation-plan-review** | **Inputs mark system-architecture and domain-models as "required" but unavailable at MVP** | **P2** | **New** |
| **1-W4** | **WEAK** | **innovate-user-stories** | **Expected Outputs lists docs/user-stories.md but frontmatter outputs omits it (inconsistent with other innovate steps)** | **P3** | **New** |
| 1-M1 | MISALIGNED | 7 steps | Multiple CLAUDE.md modifiers without sequencing | P3 | Carried |
| 1-M2 | MISALIGNED | All review steps | Review outputs not consumed downstream (by design — human-facing) | P3 | Carried |
| 1-M3 | MISALIGNED | innovate-prd | Empty reads field | P3 | Carried |
| 1-M4 | MISALIGNED | domain-modeling | Reads conditional innovate-user-stories (safe per engine behavior) | P3 | Carried |
| 1-M5 | WEAK | platform-parity-review | Conditional deps not documented in Inputs | P3 | Carried |
| 1-W1 | WEAK | beads | tasks/lessons.md not pipeline-consumed | P3 | Carried |
| 1-W2 | WEAK | Validation steps | Conditional spec gaps not handled | P3 | Carried |

### Module 2: Methodology Scaling Coherence

**New findings: 3 | Carried forward: 1 | Total: 4**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 2-W1 | WEAK | innovate-prd | Depths 1 and 2 are identical "Skip" text | P3 | New |
| 2-W2 | WEAK | innovate-user-stories | Depths 1 and 2 are identical "Skip" text | P3 | New |
| 2-W4 | WEAK | 32 steps | Untagged QC criteria lack depth applicability (see 3-X1) | P1 | Carried/refined |
| 2-W5 | WEAK | 36 steps | Depth format inconsistency (bullet vs inline) | P3 | New |

R5 regressions 2-R1 (operations, security): **CONFIRMED RESOLVED**.

### Module 3: Quality Criteria Assessment

**New findings: 17 | Carried forward: 2 | Total: 19**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **3-X1** | **MISSING** | **32 steps** | **93 untagged QC criteria — agents can't determine MVP applicability** | **P1** | **New** |
| **3-X2** | **MISSING** | **review-prd, review-user-stories, review-vision** | **Untagged "all passes" criterion conflicts with MVP-tagged "passes 1-2 only"** | **P2** | **New** |
| **3-X3** | **MISSING** | **new-enhancement** | **"thorough" in QC is subjective with no measurable threshold** | **P2** | **New** |
| **3-M2** | **MISALIGNED** | **tech-stack** | **Multi-model QC uses non-standard phrasing (not Consensus/Majority/Divergent)** | **P2** | **New** |
| **3-M3** | **MISALIGNED** | **platform-parity-review** | **Multi-model QC uses abbreviated phrasing** | **P2** | **New** |
| 3-M1 | MISALIGNED | scope-creep-check | "traces to" instead of standard "maps to" | P2 | Carried |
| 3-M4 | MISALIGNED | innovate-prd, innovate-user-stories | Innovation multi-model QC lacks conflict resolution | P3 | Carried |
| 3-W1 | WEAK | review-testing, review-operations, review-security | 3 untagged criteria each (should be mvp) | P2 | New |
| 3-W2 | WEAK | coding-standards | Commit format assumes Beads always present | P3 | New |
| 3-W3 | WEAK | new-enhancement | "testable" weaker than user-stories equivalent | P3 | New |
| 3-W4 | WEAK | automated-pr-review | 7 untagged criteria | P3 | New |
| 3-W5 | WEAK | design-system | "appropriate" in spacing criterion | P3 | New |
| 3-W6 | WEAK | story-tests | 5 untagged criteria | P2 | New |
| 3-W7 | WEAK | add-e2e-testing | Non-standard depth tag format "(deep for multi-platform)" | P3 | New |
| 3-W8 | WEAK | Multiple steps | Remaining vague language (3-4 instances) | P3 | Carried/refined |
| 3-W9 | WEAK | apply-fixes-and-freeze | "addressed" is ambiguous | P3 | New |
| 3-W10 | WEAK | implementability-dry-run | Redundant QC criterion | P3 | New |
| 3-W11 | WEAK | workflow-audit | Duplicate tracking comment criteria | P3 | New |
| 3-W12 | WEAK | developer-onboarding-guide | Combined criterion mixes MVP and deep concerns | P2 | New |

### Module 4: Knowledge System Alignment

**New findings: 4 | Carried forward: 5 | Total: 9**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **4-M1** | **MISALIGNED** | **critical-path-analysis, implementability-review** | **Lack Summary + Deep Guidance structure (58/60 have it)** | **P2** | **New** |
| 4-M2 | MISALIGNED | R5 report | R5 claimed "60/60 entries with Deep Guidance" — actually 58/60 | P3 | New/informational |
| **4-W5** | **WEAK** | **implementation-plan** | **Could benefit from system-architecture knowledge at deep depth** | **P3** | **New** |
| 4-W6 | WEAK | workflow-audit | cross-phase-consistency knowledge is validation-focused | P3 | New |
| 4-W7 | WEAK | innovate-vision | No dedicated vision-innovation knowledge entry (PRD and user-story have one) | P3 | New |
| 4-W1 | WEAK | system-architecture | Knowledge lacks ADR-to-component mapping guidance | P3 | Carried |
| 4-W2 | WEAK | story-tests | testing-strategy lacks skeleton-specific workflow | P3 | Carried |
| 4-W3 | WEAK | 14 review entries | Don't cross-reference review-step-template | P3 | Carried |
| 4-W4 | WEAK | 14 review entries | Generic "review" as primary topic | P3 | Carried |

### Module 5: Command ↔ Pipeline Parity (Build Drift)

**New findings: 1 | Carried forward: 0 | Total: 1**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 5-W1 | WEAK | CI/Makefile | No automated build-drift guard in CI (`make check` doesn't verify freshness) | P3 | New |

**Build system is clean**: Zero content drift across all 15 sampled pairs. All commands rebuilt after latest pipeline edits.

### Module 6: Implementation Handoff Quality

**New findings: 15 | Carried forward: 0 | Total: 15**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **6-B1** | **MISSING** | **new-enhancement** | **Doesn't update spec-layer artifacts (DB schema, API contracts, UX spec) when impact analysis identifies changes** | **P1** | **New** |
| **6-M1** | **MISALIGNED** | **new-enhancement** | **reads field missing architecture/domain/API/DB docs needed for impact analysis** | **P1** | **New** |
| **6-M2** | **MISALIGNED** | **new-enhancement** | **Writes to implementation-plan.md without reading it first** | **P1** | **New** |
| **6-M3** | **MISALIGNED** | **new-enhancement** | **Phase 5 version-bump before implementation** | **P2** | **New** |
| **6-M4** | **MISALIGNED** | **new-enhancement** | **Bypasses implementation-plan step's decomposition logic** | **P2** | **New** |
| 6-W1 | WEAK | implementation-playbook | Several artifacts missing from Inputs (vision, tech-stack) | P3 | New |
| 6-W2 | WEAK | implementation-playbook | coding-standards in reads but not Inputs | P3 | New |
| 6-W3 | WEAK | implementation-playbook | MVP playbooks may underspecify quality gates | P3 | New |
| 6-W4 | WEAK | Build steps | Rely on make check without verifying coverage | P3 | New |
| 6-W5 | WEAK | Knowledge context table | Missing rows for refactoring, perf, e2e tasks | P3 | New |
| **6-W6** | **WEAK** | **Build steps** | **No instruction to consult story-tests-map.md for test skeleton lookup** | **P2** | **New** |
| 6-W7 | WEAK | quick-task | No architecture docs for bug fixes | P3 | New |
| 6-W8 | WEAK | Build steps | No fallback if lessons.md doesn't exist | P3 | New |
| 6-W9 | WEAK | release, version-bump | Don't check playbook-defined gates | P3 | New |
| 6-W10 | WEAK | quick-task | Post-implementation guidance in creation step | P3 | New |

### Module 7: End-to-End Path Simulation

**Project type**: Fresh SaaS web app | **Methodology**: MVP

**R5 stuck point (implementation-plan)**: **CONFIRMED FIXED** — MVP-Specific Guidance added.

**R6 first stuck point**: implementation-plan QC self-validation — "Every architecture component has implementation tasks" contradicts MVP context where no architecture exists.

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **7-W1** | **WEAK** | **implementation-plan** | **QC "architecture component" criterion contradicts MVP context** | **P1** | **Carried/refined** |
| **7-W2** | **WEAK** | **implementation-playbook** | **Inputs marks system-architecture as "required" at MVP** | **P2** | **New** |
| 7-W3 | WEAK | user-stories → implementation-plan | MVP one-liner stories lack IDs for traceability | P3 | New |
| **7-W4** | **WEAK** | **implementation-playbook** | **MVP QC references story-tests-map.md which doesn't exist at MVP** | **P2** | **New** |
| 7-W5 | WEAK | Entire MVP path | No spec-layer artifacts — agents must infer DB/API/UX | P3 | Carried |
| 7-M1 | MISALIGNED | implementation-plan | Dependencies include disabled steps (doc clarity only) | P3 | New |

### Module 8: Meta-Eval Self-Assessment

**Current state**: 18 eval files, 71 tests, 71 passing. No change from R5.

| ID | Cat | Area | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **8-B1** | **MISSING** | **tests/evals/** | **All 6 R5-proposed evals (18 tests) not implemented** | **P2** | **New** |
| 8-M1 | MISALIGNED | build-drift.bats | Test 1 is warning-only, never fails on actual drift | P2 | New |
| 8-M2 | MISALIGNED | tests/evals/ | Module 7 has zero eval coverage | P2 | New |
| 8-M3 | MISALIGNED | methodology-content.bats | Depth tag threshold 35/60 too low (reality is 58/60) | P3 | Carried |
| 8-W1 | WEAK | build-drift.bats | Keyword overlap requires only 1/N match | P3 | New |
| 8-W2 | WEAK | quality-criteria-measurability.bats | Vague quantifier threshold is 30 | P3 | New |
| 8-W3 | WEAK | handoff-quality.bats | Keyword detection prone to false positives | P3 | New |
| 8-W4 | WEAK | skill-triggers.bats | Hardcoded phrase strings are brittle | P3 | New |
| 8-W5 | WEAK | tests/evals/ | Module 3 has lowest eval-to-finding ratio | P3 | New |

---

## False Positive Filtering

No new false-positive patterns emerged. All Engine Behavior filters from Round 5 remain valid:
- Disabled dependencies satisfied (Engine Behavior #1)
- Passive reads hints (Engine Behavior #2)
- Tool-scoped knowledge entries (Engine Behavior #4)
- context7 MCP server name (Engine Behavior #5)

---

## Priority Matrix

### P1 — Must Fix (agent failures or incorrect output)

| ID | Description | Files |
|----|-------------|-------|
| 1-M6 | review-prd UMS Detect path mismatch | pipeline/pre/review-prd.md |
| 1-M7 | implementation-plan-review UMS Detect path mismatch | pipeline/planning/implementation-plan-review.md |
| 3-X1 | 93 untagged QC criteria across 32 steps | 32 pipeline files |
| 6-B1 | new-enhancement doesn't update spec-layer artifacts | pipeline/build/new-enhancement.md |
| 6-M1 | new-enhancement reads field incomplete | pipeline/build/new-enhancement.md |
| 6-M2 | new-enhancement writes plan without reading it | pipeline/build/new-enhancement.md |
| 7-W1 | implementation-plan QC contradicts MVP context | pipeline/planning/implementation-plan.md |

### P2 — Should Fix (quality degradation)

| ID | Description | Files |
|----|-------------|-------|
| 1-M8 | implementation-plan-review MVP inputs | pipeline/planning/implementation-plan-review.md |
| 3-X2 | Review steps conflicting scope criteria | pipeline/pre/review-prd.md, review-user-stories.md, review-vision.md |
| 3-X3 | new-enhancement "thorough" language | pipeline/build/new-enhancement.md |
| 3-M1 | scope-creep-check traceability language | pipeline/validation/scope-creep-check.md |
| 3-M2 | tech-stack multi-model phrasing | pipeline/foundation/tech-stack.md |
| 3-M3 | platform-parity-review multi-model phrasing | pipeline/parity/platform-parity-review.md |
| 3-W1 | 3 review steps untagged criteria | 3 pipeline files |
| 3-W6 | story-tests untagged criteria | pipeline/quality/story-tests.md |
| 3-W12 | developer-onboarding-guide combined criterion | pipeline/finalization/developer-onboarding-guide.md |
| 4-M1 | 2 knowledge entries lack Summary/Deep Guidance | 2 knowledge files |
| 6-M3 | new-enhancement premature version-bump | pipeline/build/new-enhancement.md |
| 6-W6 | Build steps missing story-tests-map.md reference | 4 pipeline files |
| 7-W2 | implementation-playbook system-architecture required at MVP | pipeline/finalization/implementation-playbook.md |
| 7-W4 | implementation-playbook story-tests-map QC at MVP | pipeline/finalization/implementation-playbook.md |
| 8-B1 | R5-proposed evals not implemented | tests/evals/ (6 new files) |

### P3 — Polish (cosmetic, low-impact)

All remaining findings: 2-W1, 2-W2, 2-W5, 3-M4, 3-W2-W5, 3-W7-W11, 4-W1-W7, 5-W1, 6-W1-W5, 6-W7-W10, 7-W3, 7-W5, 7-M1, 8-M3, 8-W1-W5

---

## Recommended Actions (Work Packages)

### WP1: UMS Path Fixes & MVP Input Corrections (3 files)
- `pipeline/pre/review-prd.md`: Fix UMS Detect path → `pre-review-prd.md`
- `pipeline/planning/implementation-plan-review.md`: Fix UMS Detect path → `review-tasks.md`, mark MVP inputs optional, add reads field
- `pipeline/finalization/implementation-playbook.md`: Mark system-architecture optional at MVP, gate story-tests-map QC

### WP2: Multi-Model & Traceability Standardization (3 files)
- `pipeline/foundation/tech-stack.md`: Standardize to Consensus/Majority/Divergent
- `pipeline/parity/platform-parity-review.md`: Same
- `pipeline/validation/scope-creep-check.md`: "traces to" → "maps to"

### WP3: QC Depth Tagging (32 files)
- Tag all 93 untagged criteria with appropriate depth levels
- Fix review steps conflicting scope (3 files)
- Fix developer-onboarding-guide combined criterion
- Fix implementation-plan MVP QC wording

### WP4: New Enhancement Fixes (1 file)
- `pipeline/build/new-enhancement.md`: Add reads, add implementation-plan to inputs, fix Phase 5 timing, add spec-layer update guidance

### WP5: Knowledge Structure (2 files)
- Add Summary/Deep Guidance to critical-path-analysis.md and implementability-review.md

### WP6: Misc Pipeline Fixes (6 files)
- innovate-user-stories: Add docs/user-stories.md to outputs
- apply-fixes-and-freeze: "addressed" → "resolved"
- implementability-dry-run: Remove duplicate criterion
- workflow-audit: Remove duplicate tracking comment
- Build steps: Add story-tests-map.md reference

### WP7: New Evals (3-4 new files)
- depth-level-grouping.bats
- mvp-path-simulation.bats
- Harden build-drift.bats

---

## Appendix: Known False-Positive Patterns

Unchanged from Round 5:
1. **Disabled dependency satisfaction**: Steps depending on disabled steps are NOT broken
2. **Passive reads**: `reads` field does not enforce ordering — cross-phase reads are valid
3. **Path search**: Always search `pipeline/**/*.md`, never guess subdirectory
4. **context7**: Real MCP server name (`@upstash/context7-mcp`)
5. **Tool-scoped knowledge**: `knowledge/tools/*` entries referenced by commands, not pipeline steps
