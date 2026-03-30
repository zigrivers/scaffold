# Comprehensive Pipeline Alignment Audit — Round 7

<!-- scaffold:audit-round-7 v2.43.2 2026-03-30 -->

## Executive Summary

**Pipeline version**: v2.43.2
**Audit date**: 2026-03-30
**Prior round**: Round 6 (v2.40.1, 2026-03-29)

### Overall Health Score: **A- (Strong — Stable, with new frontmatter-outputs structural pattern and MVP coherence issue)**

All six R6 P1 findings are confirmed resolved. The 3-X1 systemic depth-tagging gap (93 untagged QC criteria, 32 steps) is reduced by 96% to 4 residual criteria. Build system remains drift-free. A new structural pattern emerged: 5 steps declare side-effect outputs (scripts, CI files, CLAUDE.md sections) in their body but not in frontmatter `outputs`, preventing the assembly engine from tracking these artifacts. The MVP path has a new P1 stuck point: `implementation-plan` MVP-Specific Guidance instructs agents to use Given/When/Then ACs that MVP `user-stories` never produces.

| Category | R5 | R6 | R7 | Trend |
|----------|----|----|----|----|
| BROKEN | 2 | 0 | 0 | → stable |
| MISALIGNED | 12 | 11 | 15 | ↑ (frontmatter-outputs pattern) |
| MISSING | 3 | 4 | 6 | ↑ (eval gaps) |
| WEAK | 20 | 43 | 43 | → stable (gains offset by new QC findings) |
| **Total** | **37** | **58** | **64** | ↑ (deeper audit + new version coverage) |

**Key findings this round:**
1. **All R6 P1 findings resolved**: 6-B1/M1/M2/M3/M4 (new-enhancement), 1-M6/M7 (UMS paths), 7-W1 (MVP stuck point)
2. **3-X1 resolved at 96%**: 4 untagged QC criteria remain (beads ×2, operations, ux-spec)
3. **New structural pattern (P2)**: 5 steps have side-effect artifacts missing from frontmatter `outputs` (1-N1 through 1-N5) — design-system, git-workflow, automated-pr-review, add-e2e-testing, implementation-plan-review
4. **New MVP stuck point (P1)**: `implementation-plan` MVP-Specific Guidance step 3 says "use ACs" but MVP `user-stories` produces no Given/When/Then ACs (7-N1)
5. **Build system clean**: Zero content drift across all 60 command/pipeline pairs
6. **Eval coverage improved**: 20 files, 78 tests (was 18 files, 71 in R6); 2 of 6 R5-proposed eval files implemented

---

## Delta from Round 6

### Resolved Findings (R6 → R7)

| R6 ID | Step/File | Evidence of Fix |
|-------|-----------|----------------|
| 1-M6 | review-prd | UMS Detect now references `docs/reviews/pre-review-prd.md` (correct) |
| 1-M7 | implementation-plan-review | UMS Detect now references `docs/reviews/review-tasks.md` (correct) |
| 1-M8 | implementation-plan-review | Inputs now mark system-architecture/domain-models as "required at deep; optional — not available in MVP" |
| 1-W4 | innovate-user-stories | Frontmatter `outputs` now includes `docs/user-stories.md` |
| 3-X2 | review-prd, review-user-stories, review-vision | Conflicting "all passes" vs "(mvp)" criteria resolved — depth tags applied |
| 3-M3 | platform-parity-review | Multi-model QC now includes full P0-P3 definitions |
| 3-W1 | review-testing, review-operations, review-security | All QC criteria now tagged with depth |
| 3-W3 | new-enhancement | "testable" strengthened to "testable Given/When/Then scenarios" |
| 3-W4 | automated-pr-review | 0 untagged criteria remain (was 7) |
| 3-W6 | story-tests | 0 untagged criteria remain (was 5) |
| 3-W10 | implementability-dry-run | Redundant criterion removed |
| 3-W11 | workflow-audit | Duplicate tracking-comment criterion removed |
| 4-M1 | critical-path-analysis, implementability-review | Both now have Summary + Deep Guidance structure |
| 4-M2 | (R5 report error) | Confirmed: 60/61 entries have Deep Guidance (one new entry added this version) |
| 4-W3 | 14 review pipeline steps | All now reference `review-step-template` in `knowledge-base` |
| 6-B1 | new-enhancement | "After This Step" now has conditional spec-artifact update guidance for DB/API/UX/Architecture changes |
| 6-M1 | new-enhancement | `reads` field now includes all required architecture/domain/API/DB docs |
| 6-M2 | new-enhancement | `implementation-plan` now in both `reads` and Inputs section |
| 6-M3 | new-enhancement | Version-bump timing corrected — deferred until after implementation |
| 6-M4 | new-enhancement | Phase 3 now operates against existing plan; `implementation-plan-review` required after 5+ new tasks |
| 6-W1 | implementation-playbook | `reads` field expanded to cover all spec-layer artifacts |
| 6-W2 | implementation-playbook | `coding-standards` now in both `reads` and Inputs |
| 6-W3 | implementation-playbook | Quality gates now include `make eval` when eval tests exist |
| 6-W6 | Build steps (single-agent-start, multi-agent-start) | Both now explicitly instruct agents to check `docs/story-tests-map.md` before writing tests |
| 6-W7 | quick-task | Bug-fix row added to knowledge base context table; `docs/implementation-playbook.md` now optional in Inputs |
| 6-W10 | quick-task | Post-implementation guidance moved entirely to "After This Step" section |
| 7-W1 | implementation-plan | QC "architecture component" criterion tagged `(deep)` — not enforced at MVP |
| 7-W2 | implementation-playbook | `docs/system-architecture.md` now marked "required at deep; optional — not available in MVP" |
| 7-W4 | implementation-playbook | `docs/story-tests-map.md` QC criterion now tagged `(deep)` |
| 7-M1 | implementation-plan | Disabled dependencies documented as "optional — not available in MVP" in body |

### Regressions

None. All R6 fixes are intact.

---

## Findings by Module

### Module 1: Dependency, Data Flow & Mode Detection

**New findings: 5 | Carried forward: 8 | Fixed: 4 | Regressions: 0 | Total active: 13**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **1-N1** | **MISALIGNED** | **implementation-plan-review** | **Frontmatter `outputs` lists 3 files but body Expected Outputs also documents `codex-review.json` and `gemini-review.json` at depth 4+; every comparable review step (review-adrs, review-architecture, review-prd) includes these in frontmatter** | **P2** | **New** |
| **1-N2** | **MISALIGNED** | **design-system** | **Frontmatter `outputs: [docs/design-system.md]` but body also produces theme config files, example page, `docs/coding-standards.md` styling section, `CLAUDE.md` design system section** | **P2** | **New** |
| **1-N3** | **MISALIGNED** | **git-workflow** | **Frontmatter `outputs: [docs/git-workflow.md]` but body also produces `scripts/setup-agent-worktree.sh`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `CLAUDE.md` updates** | **P2** | **New** |
| **1-N4** | **MISALIGNED** | **automated-pr-review** | **Frontmatter `outputs: [AGENTS.md, docs/review-standards.md]` but body also produces `scripts/cli-pr-review.sh`, `scripts/await-pr-review.sh`, `docs/git-workflow.md` update, `CLAUDE.md` update** | **P2** | **New** |
| **1-N5** | **MISALIGNED** | **add-e2e-testing** | **Frontmatter `outputs: [tests/screenshots/, maestro/]` but body also produces `playwright.config.ts/.js`, `CLAUDE.md` browser testing section, `docs/tdd-standards.md` E2E section** | **P2** | **New** |
| 1-M1 | WEAK | project-structure, dev-env-setup, git-workflow, design-system, automated-pr-review, ai-memory-setup | Six steps update `CLAUDE.md` without declaring it in frontmatter `outputs`; no mutual dependency between them | P3 | Carried |
| 1-M2 | WEAK | All review steps | Review outputs not consumed by non-review downstream steps (by design — human-facing) | P3 | Carried |
| 1-M3 | MISALIGNED | innovate-prd | No `reads` field in frontmatter; body references `docs/reviews/pre-review-prd.md` as optional context but engine has no hint to inject it | P3 | Carried |
| 1-M4 | MISALIGNED | domain-modeling | `reads: [innovate-user-stories]` but that step is `conditional: "if-needed"`; engine may attempt to inject a non-existent document if step was skipped | P3 | Carried |
| 1-M5 | WEAK | platform-parity-review | All 4 conditional dependencies (review-architecture/database/api/ux) not listed in Inputs section; agent has no guidance on which review artifacts are actually available | P3 | Carried |
| 1-W1 | WEAK | beads | `tasks/lessons.md` produced by beads but never declared in `reads` by any downstream pipeline step | P3 | Carried |
| 1-W2 | WEAK | Validation steps | "All phase output artifacts" in Inputs without specifying which conditional outputs may be absent | P3 | Carried |
| 1-W3 | WEAK | review-user-stories | Body documents `codex-review.json`/`gemini-review.json` at depth 5 but neither appears in frontmatter `outputs`; raw model traces unavailable to downstream steps | P3 | Carried |

### Module 2: Methodology Scaling Coherence

**New findings: 1 | Carried forward: 4 | Fixed: 0 (2-W4 partially, ~95% reduced) | Total active: 5**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **2-W6** | **WEAK** | **platform-parity-review** | **Depths 1 and 2 are near-identical — both perform "User stories platform check with 1 review pass"; depth 2 adds only "basic gap identification" as an adjective, not a distinct activity or deliverable** | **P3** | **New** |
| 2-W1 | WEAK | innovate-prd | Depths 1 and 2 both say "Skip (not enough context...)" verbatim — no behavioral differentiation | P3 | Carried |
| 2-W2 | WEAK | innovate-user-stories | Same as 2-W1 — identical "Skip" text at depths 1 and 2 | P3 | Carried |
| 2-W4 | WEAK | 4 steps (beads ×2, add-e2e-testing, operations, ux-spec) | 5 untagged QC criteria remain; down from 93 across 32 steps (R6) — 96% reduction, not yet zero | P3 | Carried (95% resolved) |
| 2-W5 | WEAK | 36 steps | Depth format inconsistency: 36 steps use inline prose vs 24 steps using bullet-list format for `custom:depth(1-5)` | P3 | Carried |

**Preset validity**: All three preset files (`mvp.yml`, `deep.yml`, `custom-defaults.yml`) pass — all 60 step names match exactly; enabled/disabled flags align with frontmatter `conditional` fields; `default_depth` values are internally consistent.

**MVP preset coherence**: The 19-step MVP pipeline produces a coherent minimal result. All disabled dependencies are handled correctly by the engine and documented in step bodies.

### Module 3: Quality Criteria Assessment

**New findings: 6 | Carried forward: 9 (including 3-X1 residual) | Fixed: 10 | Total active: 15**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **3-X1 (residual)** | **MISSING** | **beads, operations, ux-spec, add-e2e-testing** | **4 untagged QC criteria remain: `beads` lines 36–37 (×2), `operations` line 42, `ux-spec` line 35; all should be `(mvp)`. Down from 93 criteria across 32 steps.** | **P2** | **Carried (96% resolved)** |
| **3-N1** | **WEAK** | **implementation-plan** | **Duplicate deep criterion: both `(deep) Critical path is identified` and `(deep) Critical path identified with estimated total duration` — second supersedes first** | **P3** | **New** |
| **3-N2** | **MISALIGNED** | **adrs** | **`(mvp) Decisions trace to PRD requirements or domain model constraints` — uses "trace to" while all other steps use "maps to" (scope-creep-check was fixed in R6; adrs was not caught)** | **P2** | **New** |
| **3-N3** | **WEAK** | **review-api** | **`(deep) Error contracts complete and consistent` — no operationalization. Compare to `review-operations`: gives concrete checklist (latency, error rate, saturation)** | **P2** | **New** |
| **3-N4** | **WEAK** | **innovate-prd** | **`(mvp) Each suggestion has a clear user benefit and impact assessment` — "clear" is subjective; no measurable threshold** | **P3** | **New** |
| **3-N5** | **WEAK** | **create-prd** | **`(mvp) Features are scoped with clear boundaries (what's in, what's out)` — "clear boundaries" is subjective. Contrast with `domain-modeling`: `Entity relationships are explicit (not implied)`** | **P3** | **New** |
| 3-M1 | MISALIGNED | scope-creep-check | "traces to" instead of standard "maps to" | P2 | Carried |
| 3-M2 | MISALIGNED | tech-stack | `Multi-model recommendations synthesized` — standard is `Multi-model findings synthesized` | P2 | Carried |
| 3-M4 | MISALIGNED | innovate-prd, innovate-user-stories | Multi-model QC uses "deduplicated and synthesized" without Consensus/Majority/Divergent outcomes — no conflict-resolution criterion | P3 | Carried |
| 3-W2 | WEAK | coding-standards | Commit format QC hardcodes Beads (`[BD-<id>] type(scope): description`) unconditionally; non-Beads projects fail this criterion | P3 | Carried |
| 3-W5 | WEAK | design-system | "appropriate" in spacing criterion — subjective, no concrete threshold | P3 | Carried |
| 3-W7 | WEAK | add-e2e-testing | `(mobile) testID naming convention defined and documented` — uses `(mobile)` as depth tag instead of `(mvp) (mobile)` (non-standard) | P3 | Partially fixed |
| 3-W9 | WEAK | apply-fixes-and-freeze | `P2 findings addressed or explicitly deferred` — "addressed" is ambiguous; should mirror P0/P1 language: "fixed in source document or explicitly deferred" | P3 | Carried |
| 3-W12 | WEAK | developer-onboarding-guide | `(mvp) Development workflow is clear (branch, code, test, PR)` — "clear" not objectively measurable | P3 | Partially fixed |

**3-X1 status**: 526 total QC criteria (314 mvp, 181 deep, 26 depth 4+, 4 untagged, 1 non-standard). Only 4 untagged remain: `beads.md` lines 36–37, `operations.md` line 42, `ux-spec.md` line 35. Fix: add `(mvp)` tag to all four.

### Module 4: Knowledge System Alignment

**New findings: 2 | Carried forward: 6 | Fixed: 3 | Total active: 8**

| ID | Cat | Step/File | Description | P | Status |
|----|-----|-----------|-------------|---|--------|
| **4-M3** | **MISALIGNED** | **knowledge/tools/post-implementation-review-methodology.md** | **New entry (added in v2.41+, commit `68898d8`) uses `## Why Two Phases` / `## Phase 1` structure — no `## Summary` or `## Deep Guidance`. All 3 other tools entries have both sections. Full 101-line content always loaded regardless of depth.** | **P2** | **New** |
| **4-W8** | **WEAK** | **workflow-audit** | **`claude-md-patterns` and `git-workflow-patterns` knowledge entries directly address the step's domain (CLAUDE.md structure, commit format, branch naming) but neither is in `knowledge-base`; only `cross-phase-consistency` loaded** | **P3** | **New** |
| 4-W1 | WEAK | system-architecture | Knowledge has zero ADR references; no guidance on translating decision records into component constraints despite `reads: [adrs]` | P3 | Carried |
| 4-W2 | WEAK | story-tests | `testing-strategy` lacks pending-test syntax, skeleton-to-TDD workflow, and `story-tests-map.md` format guidance | P3 | Carried |
| 4-W4 | WEAK | 14 review entries | All lead with generic `review` as primary topic; domain-specific topic is second — low signal for targeted injection | P3 | Carried |
| 4-W5 | WEAK | implementation-plan | Only `[task-decomposition]` in knowledge-base; at deep depth, step decomposes architecture components but has no architecture decomposition knowledge | P3 | Carried |
| 4-W6 | WEAK | workflow-audit | `cross-phase-consistency` knowledge covers pipeline artifact naming/contracts — not CLAUDE.md structure or commit format rules; misaligned with step's actual domain | P3 | Carried |
| 4-W7 | WEAK | innovate-vision | Only `[vision-craft]` loaded; no dedicated innovation-methodology knowledge (contrast: `prd-innovation` and `user-story-innovation` exist for their parallel steps) | P3 | Carried |

**Knowledge inventory**: 61 entries (was 60 in R6; `post-implementation-review-methodology` added). 60/61 have Summary + Deep Guidance structure (98.4%). New entry (4-M3) is the lone exception.

### Module 5: Command ↔ Pipeline Parity (Build Drift)

**New findings: 0 | Carried forward: 1 | Fixed: 0 | Total active: 1**

| ID | Cat | File | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 5-W1 | WEAK | CI / Makefile | No automated hard-failure for build drift in CI; `build-drift.bats` test 1 warns but never fails | P3 | Carried (partially mitigated) |

**Build system is clean**: Zero content drift across all 60 command/pipeline pairs. `build-drift.bats` (added in R6) confirms mtime parity. All 15 sampled pairs are clean: create-prd, tdd, story-tests, create-evals, system-architecture, domain-modeling, implementation-plan, traceability-matrix, apply-fixes-and-freeze, implementation-playbook, review-architecture, security, operations, coding-standards, database-schema.

### Module 6: Implementation Handoff Quality

**New findings: 3 | Carried forward: 4 | Fixed: 10 | Total active: 7**

| ID | Cat | Step/File | Description | P | Status |
|----|-----|-----------|-------------|---|--------|
| **6-NEW-1** | **WEAK** | **implementation-playbook** | **`docs/vision.md` and `docs/tech-stack.md` are in `reads` frontmatter but not in the named Inputs prose (lines 20–37); catch-all "All other frozen artifacts" is too vague for agents assembling context** | **P2** | **New** |
| **6-NEW-2** | **WEAK** | **quick-task** | **Inputs section doesn't include `docs/system-architecture.md` or `docs/domain-models/` even as optional; knowledge context table lists them for bug-fix tasks but quick-task never directs agents to that table** | **P3** | **New** |
| **6-NEW-3** | **MISSING** | **new-enhancement** | **`implementation-plan-review` only triggered when 5+ new tasks are created; enhancements with 2–4 tasks bypass plan review entirely** | **P2** | **New** |
| 6-W4 | WEAK | implementation-playbook, build steps | Coverage gate (`make test-coverage`) not enforced at MVP depth | P3 | Carried |
| 6-W5 | WEAK | implementation-playbook | Knowledge context table missing rows for Refactoring, Performance, E2E task types | P3 | Carried |
| 6-W8 | WEAK | quick-task | `tasks/lessons.md` reference in Process (line 115) has no "if exists" guard; non-Beads projects have no fallback | P3 | Carried |
| 6-W9 | WEAK | release, version-bump | Neither tool references `docs/implementation-playbook.md` quality gates or `tests/evals/`; `version-bump` explicitly has "No quality gates" | P3 | Carried |

**All R6 P1 findings resolved**: 6-B1, 6-M1, 6-M2, 6-M3, 6-M4 (new-enhancement) are confirmed fixed. Task → test → eval chain is traceable at deep depth. Error recovery documentation is well-specified.

**Implementation readiness by depth**:
| Depth | Readiness | Notes |
|-------|-----------|-------|
| deep | HIGH | Full artifact coverage, complete task→test→eval chain |
| mvp | MEDIUM | Chain degrades (no story-tests-map, minimal evals), coverage gate unenforced |
| custom depth 1–2 | LOW-MEDIUM | Minimal playbook, error recovery guidance omitted |

### Module 7: End-to-End Path Simulation

**Project type**: Fresh SaaS web app | **Methodology**: MVP

**New findings: 2 | Carried forward: 2 | Fixed: 4 | Total active: 4**

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **7-N1** | **WEAK (P1)** | **implementation-plan** | **MVP-Specific Guidance step 3 (lines 78–86): "Use acceptance criteria to define task boundaries: Each AC (Given/When/Then) maps to test cases." But MVP `user-stories` at depth 1–2 produces one-liner bullets with NO Given/When/Then ACs. Agent reaches this instruction and has no ACs to use — must improvise, risking under/over-scoped tasks. First stuck point in current codebase.** | **P1** | **New** |
| **7-N2** | **WEAK** | **implementation-plan** | **`description:` frontmatter reads "Break architecture into implementable tasks with dependencies." At MVP there is no architecture — users may skip this step thinking it requires architecture docs** | **P3** | **New** |
| 7-W3 | WEAK | user-stories → implementation-plan | MVP produces one-liner stories with no IDs; traceability is text-matching only — ambiguous at scale or during updates | P3 | Carried |
| 7-W5 | WEAK | Entire MVP path | No spec-layer artifacts (DB schema, API contracts, UX spec) produced at MVP; agents must infer data model, API surface, and UI layout at implementation time | P3 | Carried |

**MVP execution order**: create-vision → review-vision → create-prd → review-prd → user-stories → review-user-stories → tech-stack → coding-standards → tdd → project-structure → dev-env-setup → implementation-plan → implementation-playbook → (build steps)

**First stuck point**: Step 12 (`implementation-plan`). MVP-Specific Guidance step 3 references ACs that don't exist. Fix: add a clause acknowledging that at MVP depth, ACs may not exist and instructing the agent to derive task boundaries from one-liner story text directly.

**Handoff readiness**: After `implementation-playbook`, an agent has vision, PRD, one-liner user stories (no IDs, no ACs), tech stack, coding standards, TDD strategy, project structure, dev environment, implementation plan, and playbook. Missing: database schema, API contracts, UX spec, system architecture — all by MVP design. The risk isn't a hard block but multi-agent implementation-time divergence is elevated.

**Deep path delta** (top 5 steps worth extra depth investment):
1. **user-stories** — Deep adds story IDs and Given/When/Then ACs; fixes 7-N1 root cause and improves all downstream traceability
2. **system-architecture** (disabled at MVP) — Explicit component boundaries make task decomposition unambiguous
3. **database-schema / api-contracts / ux-spec** (all disabled at MVP) — Pre-agreed contracts prevent implementation-time divergence in multi-agent scenarios
4. **implementation-plan** — Deep adds dependency graph, wave assignments, and critical path for parallel execution
5. **review-user-stories** — Deep builds formal REQ-xxx index and coverage matrix

### Module 8: Meta-Eval Self-Assessment

**Current state**: 20 eval files, 78 tests, 78 passing (vs 18 files, 71 tests in R6)
**New eval files added since R6**: `depth-level-grouping.bats` (3 tests), `mvp-path-simulation.bats` (3 tests)

**New findings: 3 | Carried forward: 9 | Partially fixed: 2 (8-B1, 8-M2) | Total active: 12**

| ID | Cat | File | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **8-N1** | **MISSING** | **tests/evals/** | **No eval for Update Mode Specifics path correctness; 1-M6 and 1-M7 (P1 in R6) were UMS path mismatches caught only by manual audit — no automated detection** | **P2** | **New** |
| **8-N2** | **MISSING** | **output-consumption.bats:53** | **`grep -q "$output_path"` matches anywhere in file — a step saying "do NOT write to api-contracts.md" would pass as consuming it; false negative risk** | **P2** | **New** |
| **8-N3** | **MISSING** | **tests/evals/** | **No eval for `reads` field adoption; `data-flow.bats` validates reads-when-present but doesn't flag steps whose Inputs section references artifacts not declared in `reads`** | **P3** | **New** |
| 8-B1 | MISSING | tests/evals/ | 4 of 6 R5-proposed eval files still missing: `quality-criteria-contradictions.bats`, `task-context-briefs.bats`, `playbook-update-triggers.bats`, `depth-methodology-coherence.bats` | P2 | Carried (2/6 now implemented) |
| 8-M1 | MISALIGNED | build-drift.bats:39–45 | Test 1 warning-only; final assertion is `[[ "$checked" -gt 0 ]]` — passes even with 100% drift | P2 | Carried |
| 8-M2 | MISALIGNED | tests/evals/ | Module 7 partial coverage (3 tests); uncovered: QC contradiction at MVP, "required" inputs unavailable at MVP, implementation-playbook story-tests-map QC | P2 | Carried (improved from 0%) |
| 8-M3 | MISALIGNED | methodology-content.bats:70, prompt-quality.bats:133 | Depth tag threshold `35` stale; actual is 60/60, threshold no longer distinguishes healthy from degraded (40/60 would still pass) | P3 | Carried |
| 8-W1 | WEAK | build-drift.bats:89 | Test 2 description overlap: `matched -eq 0` to fail — any single shared word passes; major topic divergence not caught | P3 | Carried |
| 8-W2 | WEAK | quality-criteria-measurability.bats:43 | Vague-quantifier threshold of 30 is now far above actual count of 2; trivially satisfied | P3 | Carried (now moot) |
| 8-W3 | WEAK | handoff-quality.bats | All 5 tests use `grep -qi 'keyword'` on full file; "this step does NOT require a playbook" would pass | P3 | Carried |
| 8-W4 | WEAK | skill-triggers.bats:13–53 | 15+ hardcoded trigger phrases brittle to SKILL.md rewrites | P3 | Carried |
| 8-W5 | WEAK | tests/evals/ | Module 3 has weakest coverage (2 tests) despite being the most common finding category (19 in R6, 15 in R7) | P3 | Carried |

**Coverage map**:
| Audit Module | Coverage Level | Primary Evals |
|---|---|---|
| M1: Dependency/Data Flow | Partial | dependency-ordering.bats, data-flow.bats, pipeline-completeness.bats |
| M2: Methodology Scaling | Partial | methodology-content.bats, depth-level-grouping.bats, mvp-path-simulation.bats |
| M3: Quality Criteria | Weak | quality-criteria-measurability.bats, prompt-quality.bats |
| M4: Knowledge System | Moderate | knowledge-quality.bats, knowledge-injection.bats, redundancy.bats |
| M5: Command Parity | Partial | channel-parity.bats, build-drift.bats |
| M6: Implementation Handoff | Partial | handoff-quality.bats, command-structure.bats |
| M7: E2E Path Simulation | Minimal | mvp-path-simulation.bats (3 tests) |
| M8: Meta-Eval | N/A | (self-referential) |

---

## False Positive Filtering

No new false-positive patterns emerged. All Engine Behavior filters from Round 6 remain valid:
- Disabled dependencies satisfied (Engine Behavior #1)
- Passive reads hints (Engine Behavior #2)
- Tool-scoped knowledge entries (Engine Behavior #4)
- context7 MCP server name (Engine Behavior #5)

---

## Priority Matrix

### P1 — Must Fix (agent failures or incorrect output)

| ID | Description | File |
|----|-------------|------|
| 7-N1 | MVP-Specific Guidance in `implementation-plan` instructs agents to use ACs that MVP `user-stories` never produces | pipeline/planning/implementation-plan.md |

### P2 — Should Fix (quality degradation or silent failures)

| ID | Description | File(s) |
|----|-------------|---------|
| 1-N1 | implementation-plan-review frontmatter missing raw model review files | pipeline/planning/implementation-plan-review.md |
| 1-N2 | design-system frontmatter missing side-effect outputs | pipeline/environment/design-system.md |
| 1-N3 | git-workflow frontmatter missing side-effect outputs | pipeline/environment/git-workflow.md |
| 1-N4 | automated-pr-review frontmatter missing side-effect outputs | pipeline/environment/automated-pr-review.md |
| 1-N5 | add-e2e-testing frontmatter missing side-effect outputs | pipeline/integration/add-e2e-testing.md |
| 3-X1 residual | 4 remaining untagged QC criteria | pipeline/foundation/beads.md, pipeline/quality/operations.md, pipeline/specification/ux-spec.md, pipeline/integration/add-e2e-testing.md |
| 3-M1 | scope-creep-check "traces to" → "maps to" | pipeline/validation/scope-creep-check.md |
| 3-M2 | tech-stack multi-model phrasing | pipeline/foundation/tech-stack.md |
| 3-N2 | adrs "trace to" → "maps to" | pipeline/decisions/adrs.md |
| 3-N3 | review-api "complete and consistent" lacks operationalization | pipeline/specification/review-api.md |
| 4-M3 | post-implementation-review-methodology missing Summary/Deep Guidance | knowledge/tools/post-implementation-review-methodology.md |
| 6-NEW-1 | implementation-playbook Inputs missing named tech-stack and vision | pipeline/finalization/implementation-playbook.md |
| 6-NEW-3 | new-enhancement: enhancements with 2–4 tasks bypass plan review | pipeline/build/new-enhancement.md |
| 8-B1 | 4 of 6 R5-proposed eval files still missing | tests/evals/ |
| 8-M1 | build-drift.bats test 1 warning-only — never fails CI | tests/evals/build-drift.bats |
| 8-M2 | Module 7 eval coverage gaps (QC contradiction at MVP, required-at-MVP inputs) | tests/evals/ |
| 8-N1 | No eval for UMS path correctness | tests/evals/ |
| 8-N2 | output-consumption.bats false negative risk | tests/evals/output-consumption.bats |

### P3 — Polish (low-impact, cosmetic)

All remaining findings: 1-M1, 1-M2, 1-M3, 1-M4, 1-M5, 1-W1, 1-W2, 1-W3, 2-W1, 2-W2, 2-W4, 2-W5, 2-W6, 3-M4, 3-N1, 3-N4, 3-N5, 3-W2, 3-W5, 3-W7, 3-W9, 3-W12, 4-W1–W8, 5-W1, 6-NEW-2, 6-W4, 6-W5, 6-W8, 6-W9, 7-N2, 7-W3, 7-W5, 8-M3, 8-N3, 8-W1–W5

---

## Recommended Actions (Work Packages)

### WP1: MVP Coherence Fix (1 file) — P1

**`pipeline/planning/implementation-plan.md`**: In MVP-Specific Guidance step 3, add: "If user stories are one-liner bullets (no Given/When/Then ACs), derive task boundaries directly from story text: treat each success condition as one task scope boundary. Generate implied ACs from the story description before proceeding."

Addresses: **7-N1**

---

### WP2: Frontmatter Outputs Alignment (5 files) — P2

For each file below, add all body-documented side-effect artifacts to the frontmatter `outputs` array:

- **`pipeline/planning/implementation-plan-review.md`**: Add `docs/reviews/implementation-plan/codex-review.json`, `docs/reviews/implementation-plan/gemini-review.json`
- **`pipeline/environment/design-system.md`**: Add theme config files, `docs/coding-standards.md` (modifier), `CLAUDE.md` (modifier)
- **`pipeline/environment/git-workflow.md`**: Add `scripts/setup-agent-worktree.sh`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `CLAUDE.md` (modifier)
- **`pipeline/environment/automated-pr-review.md`**: Add `scripts/cli-pr-review.sh`, `scripts/await-pr-review.sh`, `CLAUDE.md` (modifier)
- **`pipeline/integration/add-e2e-testing.md`**: Add `playwright.config.ts`, `CLAUDE.md` (modifier), `docs/tdd-standards.md` (modifier)

Addresses: **1-N1, 1-N2, 1-N3, 1-N4, 1-N5**

---

### WP3: QC Micro-Fixes (5 files) — P2/P3

- **`pipeline/foundation/beads.md`**: Add `(mvp)` tag to lines 36–37
- **`pipeline/quality/operations.md`**: Add `(mvp)` tag to line 42
- **`pipeline/specification/ux-spec.md`**: Add `(mvp)` tag to line 35
- **`pipeline/integration/add-e2e-testing.md`**: Change `(mobile)` → `(mvp) (mobile)` for testID criterion
- **`pipeline/decisions/adrs.md`**: Change "trace to" → "maps to" in QC
- **`pipeline/planning/implementation-plan.md`**: Remove shorter duplicate `(deep) Critical path is identified`; keep `(deep) Critical path identified with estimated total duration`
- **`pipeline/validation/scope-creep-check.md`**: Change "traces to" → "maps to" *(confirm not yet fixed)*

Addresses: **3-X1 residual, 3-N1, 3-N2, 3-M1, 3-W7**

---

### WP4: QC Language Standardization (3 files) — P2/P3

- **`pipeline/foundation/tech-stack.md`**: `Multi-model recommendations synthesized` → `Multi-model findings synthesized: Consensus (all models agree), Majority (2+ agree), Divergent (models disagree — present to user for decision)`
- **`pipeline/specification/review-api.md`**: `Error contracts complete and consistent` → `Error contracts complete: every endpoint has domain-specific error codes (≥2), human-readable reason phrases, and consistent schema`
- **`pipeline/pre/innovate-prd.md`** and **`pipeline/pre/innovate-user-stories.md`**: Add Consensus/Majority/Divergent vocabulary to multi-model QC criteria

Addresses: **3-M2, 3-M4, 3-N3**

---

### WP5: Knowledge Structure Fix (1 file) — P2

**`knowledge/tools/post-implementation-review-methodology.md`**: Restructure to add `## Summary` (2-3 sentence overview) and `## Deep Guidance` heading; place current content under Deep Guidance.

Addresses: **4-M3**

---

### WP6: Playbook & Handoff Inputs (2 files) — P2/P3

- **`pipeline/finalization/implementation-playbook.md`**: Add `docs/tech-stack.md (required)` and `docs/vision.md (optional)` as named entries in the Inputs section prose
- **`pipeline/build/new-enhancement.md`**: Lower the `implementation-plan-review` trigger threshold from 5 to 3 tasks, or make it unconditional when tasks are created

Addresses: **6-NEW-1, 6-NEW-3**

---

### WP7: Eval Improvements (4 files) — P2/P3

1. **`tests/evals/build-drift.bats`**: Change test 1 to `return 1` (fail) when drift warnings > 0; add hard CI gate
2. **`tests/evals/update-mode-specifics-paths.bats`** (new): 3 tests verifying UMS Detect paths match step `outputs` frontmatter
3. **`tests/evals/quality-criteria-contradictions.bats`** (new): 3 tests for contradictory depth-tagged criteria
4. **`tests/evals/methodology-content.bats`** and **`tests/evals/prompt-quality.bats`**: Raise depth-tag threshold from `35` to `55`
5. **`tests/evals/quality-criteria-measurability.bats`**: Tighten vague-quantifier threshold from `30` to `10`

Addresses: **8-M1, 8-N1, 8-B1 (partial), 8-M3, 8-W2**

---

## Proposed New Evals (from Module 8)

| Eval File | Tests | Invariant | Catches | Complexity |
|-----------|-------|-----------|---------|------------|
| `update-mode-specifics-paths.bats` | 3 | UMS Detect paths match step `outputs` frontmatter | P1-class UMS path mismatches (like R6's 1-M6, 1-M7) | Medium |
| `quality-criteria-contradictions.bats` | 3 | No step has contradictory depth-tagged QC criteria | Re-emergence of R4/R6 contradictory-criteria pattern (3-X2) | Medium |
| `mvp-context-coherence.bats` | 3 | MVP-enabled steps don't reference non-MVP artifacts as required | 7-N1 pattern: required inputs unavailable at MVP | Medium-High |
| `output-consumption-strict.bats` | 2 | Output consumption verified in structured sections, not full-file grep | False negatives from comment-only path mentions (8-N2) | Medium |
| `reads-field-adoption.bats` | 2 | Steps referencing artifacts in Inputs also declare them in `reads` | Implicit dependencies not tracked by engine | High |

---

## Appendix: Known False-Positive Patterns

Unchanged from Round 6:
1. **Disabled dependency satisfaction**: Steps depending on disabled steps are NOT broken; engine satisfies disabled deps automatically
2. **Passive reads**: `reads` field does not enforce ordering — cross-phase reads are valid
3. **Path search**: Always search `pipeline/**/*.md`, never guess subdirectory
4. **context7**: Real MCP server name (`@upstash/context7-mcp`)
5. **Tool-scoped knowledge**: `knowledge/tools/*` entries referenced by commands, not pipeline steps
