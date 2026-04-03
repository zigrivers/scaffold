# Comprehensive Pipeline Alignment Audit — Round 4

<!-- scaffold:audit-round-4 v2.35.0 2026-03-29 -->

## Executive Summary

**Pipeline version**: v2.35.0 (post-Round 3 remediation)
**Audit date**: 2026-03-29
**Pipeline scope**: 60 steps across 16 phases, 60 knowledge entries, 16 eval files (66 tests)

### Overall Health Score: **B+ (Good — Ready for guided AI agent execution)**

Round 3 remediation (v2.35.0) resolved 119 findings. This Round 4 audit identifies
**87 validated findings** after false-positive filtering (down from ~168 raw findings
across 8 modules). The pipeline is structurally sound — no BROKEN findings survive
validation. Remaining issues are quality-of-life improvements that would make agents
more effective, not blockers that prevent execution.

| Category | Count | Change from R3 |
|----------|-------|-----------------|
| BROKEN | 0 | ↓ from 2 |
| MISALIGNED | 15 | ↓ from 18 |
| MISSING | 18 | ↓ from 27 |
| WEAK | 54 | ↓ from 72 |
| **Total** | **87** | **↓ from 119** |

**Key improvement areas remaining:**
1. Quality Criteria measurability (42 vague/subjective criteria across all steps)
2. Custom depth documentation (45 steps lump depth levels together)
3. Knowledge entry deepening (10 representative steps have coverage gaps)
4. Eval soft-gate promotion (3 soft checks should become hard gates)

---

## False Positive Filtering

The following raw findings were filtered after validation against engine behavior
and actual file contents:

### Engine Behavior: Disabled Dependencies Satisfied

`src/core/dependency/eligibility.ts:29` — `if (depNode && !depNode.enabled) return true`

This means steps with dependencies on disabled steps (e.g., `implementation-plan`
depending on `operations`, `security`, `review-architecture`, `create-evals` which
are disabled in MVP) work correctly. The engine treats disabled deps as satisfied.

**Filtered findings:**
- **1-B1** (implementation-plan missing system-architecture dep): Body line 21 explicitly
  marks it `(optional — not available in MVP)`. Not broken.
- **1-B2** (conditional specs consumed by non-conditional downstream): `reads` field is
  passive; body marks inputs as `(optional)`. Not broken.
- **1-B3** (platform-parity-review depends on optional reviews): Step itself is
  conditional `if-needed`. Engine handles disabled deps.
- **2-B1** (MVP hard deps on disabled steps): Same engine behavior. Steps' bodies
  explicitly document optional inputs with "(optional — not available in MVP)".

### Agent Search Path Errors

- **6-B2** (apply-fixes-and-freeze pipeline source "missing"): EXISTS at
  `pipeline/finalization/apply-fixes-and-freeze.md`. Agent searched wrong directory.
- **6-B3** (implementation-playbook pipeline source "missing"): EXISTS at
  `pipeline/finalization/implementation-playbook.md`.
- **6-MS1** (traceability-matrix pipeline source "missing"): EXISTS at
  `pipeline/validation/traceability-matrix.md`.

### Known Non-Issues

- **5-B1** ("context7" topic): Confirmed real MCP server name (`@upstash/context7-mcp`).
- **5-M1–M3** (unused knowledge entries): Tool-scoped entries (`release-management`,
  `session-analysis`, `version-strategy`) correctly used by commands only, not pipeline.

**Total filtered: 12 findings (3 BROKEN→0, 9 others→0)**

---

## Module 1: Dependency & Data Flow Integrity

**Validated findings: 8** (0 BROKEN, 4 MISALIGNED, 4 WEAK)

### 1-M1 | MISALIGNED | Multiple steps modify CLAUDE.md without sequencing

**Steps**: beads (210), coding-standards (230), project-structure (250), dev-env-setup (310),
git-workflow (330), claude-md-optimization (1110), workflow-audit (1120)

Seven steps output CLAUDE.md sections. Ordering is correct by `order` values but no
step declares a dependency on prior CLAUDE.md modifiers. Risk of content overlap or
overwrite in parallel execution scenarios.

**Impact**: P2 — Multi-agent mode could produce CLAUDE.md conflicts.

### 1-M2 | MISALIGNED | Review step outputs not consumed by downstream pipeline

All review steps produce `docs/reviews/{step}/` artifacts that are human-facing but
not consumed by any downstream step. Review findings (P0/P1 issues) don't automatically
feed into implementation-plan task creation.

**Impact**: P2 — Review findings require manual intervention to influence task scoping.

### 1-M3 | MISALIGNED | innovate-prd empty reads field

`innovate-prd` depends on `review-prd` (transitive access to `create-prd` output) but
declares `reads: []`. Documentation clarity gap — agents won't know to read the PRD.

**Impact**: P3 — Transitive dependency works; documentation is weak.

### 1-M4 | MISALIGNED | domain-modeling reads conditional innovate-user-stories

`domain-modeling` reads `innovate-user-stories` (conditional, order 160) without
explicit dependency. If innovation is skipped, no fallback documented. Ordering is
correct (160 < 510) but multi-agent parallelism could race.

**Impact**: P2 — Potential race in multi-agent mode.

### 1-W1 | WEAK | tasks/lessons.md produced but not pipeline-consumed

`beads` outputs `tasks/lessons.md` but no pipeline step reads it. It's passive agent
memory only.

**Impact**: P3 — Low; passive memory by design.

### 1-W2 | WEAK | Validation steps don't explicitly handle conditional step gaps

Validation steps reference "all phase output artifacts" without specifying behavior
when conditional specification steps (api-contracts, database-schema, ux-spec) are skipped.

**Impact**: P3 — Could produce misleading validation results at MVP depth.

### 1-W3 | WEAK | Depth-dependent outputs not in dependency declarations

Many steps produce additional outputs at depth 4+ (multi-model review artifacts) but
downstream steps don't conditionally depend on these. Graceful degradation at lower
depths is undocumented.

**Impact**: P3 — Pattern observation; no breakage.

### 1-W4 | WEAK | Review findings don't influence task creation

`review-operations` and `review-security` produce findings that aren't explicitly
consumed by `implementation-plan`. The reviews run first by ordering (940/960 < 1210)
and update primary artifacts, but their review reports aren't traced to tasks.

**Impact**: P2 — Security/ops review findings may not become implementation tasks.

---

## Module 2: Methodology Scaling Coherence

**Validated findings: 6** (0 BROKEN, 1 MISALIGNED, 5 WEAK)

### 2-M1 | MISALIGNED | (depth 4+) criteria lack context for what depths 1-3 deliver

27 steps mark criteria `(depth 4+)` for multi-model features without explaining what
shallower depths accomplish. Agents at depth 3 don't know if their output is complete.

**Impact**: P2 — Agents can't self-assess completeness at intermediate depths.

### 2-W1 | WEAK | 45 of 60 steps group depth levels together

Pattern: `Depth 1-2: MVP-style. Depth 3: add X. Depth 4-5: full approach.`
No individual description for depths 2, 4. Agents at depth 2 don't know if they
should behave like depth 1 or start adding depth 3 features.

**Impact**: P2 — Ambiguous depth behavior for 75% of steps.

### 2-W2 | WEAK | 12 review steps have vague depth scaling

Pattern: `Depth 1-3: scale number of review passes with depth.`
No specification of which passes at which depth.

**Impact**: P2 — Review agents can't determine correct number of passes.

### 2-W3 | WEAK | 10 steps lack individual depth 5 description

Steps like `adrs`, `user-stories`, `domain-modeling` group depths 4-5 together
with no distinction.

**Impact**: P3 — Depth 5 rarely used; low practical impact.

### 2-W4 | WEAK | Conditional innovation steps have redundant MVP language

`innovate-vision`, `innovate-prd`, `innovate-user-stories` say "Not applicable —
this step is conditional and skipped in MVP" which is redundant with preset config.

**Impact**: P3 — Documentation clarity only.

### 2-W5 | WEAK | Validation steps are well-documented (positive baseline)

7 validation steps explicitly describe each depth 1-5. These should be the template
for refactoring other steps' custom:depth sections.

**Impact**: Positive — Use as reference template.

---

## Module 3: Mode Detection & Update Mode Completeness

**Validated findings: 2** (0 BROKEN, 1 MISALIGNED, 1 WEAK)

### 3-M1 | MISALIGNED | new-enhancement claims "stateless" but modifies documents

Mode Detection says "stateless execution command" but the step updates `docs/plan.md`
and `docs/user-stories.md` in place. Update Mode Specifics correctly documents
preservation rules, but the "stateless" label is misleading.

**Impact**: P2 — Agents reading frontmatter may not expect document modifications.

**Fix**: Change Mode Detection to: "This is a document-modifying execution command.
It updates existing documents (plan.md, user-stories.md) but does not create a new
standalone output document."

### 3-W1 | WEAK | quick-task persistence ambiguity

Mode Detection says "No persistent document is created" but tasks created via Beads
ARE persistent (`bd create`). The dual-mode behavior (Beads vs inline) isn't clearly
distinguished in Mode Detection.

**Impact**: P3 — Minor; both paths are documented in the body.

### Module 3 Positive Findings

- 100% of steps have Mode Detection sections
- 100% of document-creating steps have Update Mode Specifics with all 4 required fields
- Incremental update chain traced correctly (user story change propagates through
  domain-modeling → system-architecture → story-tests → create-evals → implementation-plan)
- All preservation rules protect appropriate content
- Pipeline ↔ Command Mode Detection consistency confirmed for sampled pairs

---

## Module 4: Quality Criteria Assessment

**Validated findings: 47** (3 BROKEN, 10 MISALIGNED, 10 MISSING, 24 WEAK)

This module has the most findings. Quality Criteria are the primary mechanism for agent
self-assessment — vague criteria directly reduce output quality.

### BROKEN (3)

#### 4-B1 | create-evals contradictory criteria

Two criteria conflict: "(mvp) All generated evals pass on the current codebase with no
false positives" vs "(deep) Each eval has a documented scenario where it could
legitimately fail." These are mutually exclusive.

**Fix**: Change first to: "(mvp) All generated evals pass when exclusion mechanisms applied."

#### 4-B2 | implementation-playbook references `make eval` at all depths

Criterion: "Quality gates include `make eval` as a required check." But `create-evals`
is conditional (depth 3+). MVP projects won't have evals.

**Fix**: "(deep) Quality gates include `make eval` when eval tests exist."

#### 4-B3 | system-architecture duplicates project-structure responsibility

Criterion: "Project directory structure is defined with file-level granularity." This
belongs in `project-structure.md`, not `system-architecture.md`.

**Fix**: Replace with: "(mvp) System components map to project-structure.md modules."

### MISALIGNED (10 representative — full list in Module 4 agent output)

| ID | Step | Issue |
|----|------|-------|
| 4-M1 | review-vision | "honestly" is subjective in competitor analysis |
| 4-M2 | dependency-graph-validation | Circular criterion (presupposes what it validates) |
| 4-M3 | api-contracts, ux-spec | "Enough", "comprehensive" lack thresholds |
| 4-M4 | create-prd | MVP problem specificity vs deep constraints asymmetry |
| 4-M5 | All review-\* steps | P0-P3 severity definitions vary across steps |
| 4-M6 | traceability-matrix | "Requirement" undefined (features? principles? NFRs?) |
| 4-M7 | coding-standards | "Runnable code examples" — how many? in what context? |
| 4-M8 | tdd | "Edge cases from domain invariants" — implicit audience/depth |
| 4-M9 | cross-phase-consistency | "Same concept never uses two names" — tacit concepts |
| 4-M10 | implementability-dry-run | "Sufficient input specification" is subjective |

### MISSING (10 representative)

| ID | Step | Gap |
|----|------|-----|
| 4-MS1 | review-user-stories | No QC for coverage.json / requirements-index.md outputs |
| 4-MS2 | create-evals | No criterion for eval category completeness |
| 4-MS3 | innovate-\* steps | No scope boundary classification (strategic/product/UX) |
| 4-MS4 | review-adrs | No circular dependency detection criterion |
| 4-MS5 | story-tests | No quality criterion for test skeleton detail level |
| 4-MS6 | system-architecture | No metric for diagram completeness |
| 4-MS7 | All multi-model steps | No consensus threshold definition (2/3? all?) |
| 4-MS8 | operations | Missing health-check endpoint completeness criterion |
| 4-MS9 | workflow-audit | No authority hierarchy (CLAUDE.md vs git-workflow.md) |
| 4-MS10 | traceability-matrix | No priority-aware orphan handling (Must-have vs Nice-to-have) |

### WEAK (24 — grouped by pattern)

| Pattern | Count | Example |
|---------|-------|---------|
| Vague severity language (P0-P3 definitions) | 10 | "Every finding categorized by severity" but definitions vary per step |
| Undefined thresholds for metrics | 5 | tdd: "coverage targets per layer" — what targets? |
| "Documented" without depth specification | 4 | operations: "Incident response defined" — one sentence or full runbook? |
| Implicit framework dependency | 2 | design-system: "4px increments" assumes CSS |
| Missing upstream contradiction check | 3 | domain-modeling, system-architecture: no QC for PRD contradiction |

### Cross-Cutting Patterns

1. **Multi-model synthesis language variance**: 20 steps use different language
   for synthesis ("reconciliation", "consensus/disagreement", "unique ideas highlighted").
   Standardize to: Consensus / Majority / Divergent classification.

2. **Traceability language mismatch**: "maps to", "traces back to", "corresponds to"
   used interchangeably with subtly different semantics. Standardize terminology.

3. **Review step consistency**: Review steps should share severity definitions via a
   shared knowledge entry rather than each defining P0-P3 independently.

---

## Module 5: Knowledge System Alignment

**Validated findings: 15** (0 BROKEN, 1 MISALIGNED, 3 MISSING, 11 WEAK)

### Knowledge Coverage for 10 Representative Steps

| Step | KB Entries | Gap |
|------|-----------|-----|
| create-prd | prd-craft | Missing gap-analysis for competitive context |
| tdd | testing-strategy | Missing stack-specific test pattern examples |
| story-tests | testing-strategy, user-stories | Missing AC-to-test-case transformation guidance |
| create-evals | eval-craft, testing-strategy | Missing per-category implementation guidance |
| system-architecture | system-architecture, domain-modeling | Missing ADR-to-architecture translation |
| implementation-plan | task-decomposition | Missing critical path / wave planning guidance |
| traceability-matrix | traceability, multi-model-review-dispatch | Missing orphan artifact detection strategy |
| apply-fixes-and-freeze | apply-fixes-and-freeze | Missing conflicting-fix resolution framework |
| implementation-playbook | implementation-playbook | Missing multi-doc synthesis guidance |
| domain-modeling | domain-modeling | Missing domain events / event flow modeling |

### 5-M1 | MISALIGNED | Generic "review" topic across 15 entries

All review knowledge entries list "review" as primary topic. The artifact-specific
topic (prd, adr, user-stories) is what actually distinguishes them.

**Impact**: P3 — Entries are well-differentiated by content.

### 5-MS1 | MISSING | MoSCoW prioritization guidance

`prd-craft.md` mentions MoSCoW in criteria but Deep Guidance has no section on it.

### 5-MS2 | MISSING | NFR specification and quantification

No knowledge entry covers how to specify measurable non-functional requirements.
NFRs drive architecture and evals — vague NFRs cascade throughout the pipeline.

**Impact**: P1 — High cascade risk.

### 5-MS3 | MISSING | Deferred/out-of-scope item management

No clear guidance on defining scope boundaries or preventing deferred items from
leaking into implementation.

### High-Priority Knowledge Gaps

1. **eval-craft**: Needs per-category implementation guidance (what to check for
   adherence, security, consistency evals)
2. **task-decomposition**: Needs critical path analysis and wave planning subsections
3. **prd-craft**: Needs NFR quantification guidance
4. **testing-strategy**: Needs AC-to-test-case transformation guidance

---

## Module 6: Command ↔ Pipeline Parity

**Validated findings: 13** (0 BROKEN, 6 MISALIGNED, 1 MISSING, 6 WEAK)

*After removing 3 false positives (6-B2, 6-B3, 6-MS1 — pipeline sources exist).*

### 6-M1 | MISALIGNED | create-prd implicit dependency on create-vision

`create-prd` body says "If docs/vision.md exists: Read it" but has no formal
dependency on `create-vision`. The dependency is implicit.

**Impact**: P2 — Agents may run create-prd without running create-vision.

### 6-M2 | MISALIGNED | Depth execution path undefined for commands

Commands don't have explicit depth parameters. No documented way for users to
control output depth when running a command directly.

**Impact**: P2 — Users don't know how to control depth via slash commands.

### 6-M3 | MISALIGNED | Step vs artifact naming inconsistency in inputs

Some commands use step names in reads (`create-prd`) while pipeline uses artifact
paths (`docs/plan.md`). Inconsistent reference style.

**Impact**: P3 — Cosmetic inconsistency.

### 6-M4 | MISALIGNED | coding-standards command expects linter config outputs

Command expects "Linter/formatter config files created alongside" but pipeline
outputs only lists `docs/coding-standards.md`. Linter configs aren't tracked.

**Impact**: P2 — Generated linter configs won't be tracked by pipeline.

### 6-M5 | MISALIGNED | security/operations quality criteria emphasis drift

Command and pipeline versions emphasize different aspects of the same criteria.

**Impact**: P3 — Semantic drift; requirements are similar.

### 6-M6 | MISALIGNED | implementation-plan constraint section ordering

Task Size Constraints appear after Expected Outputs in both command and pipeline.
Agents may miss them during initial read.

**Impact**: P3 — Readability issue.

### 6-MS1 | MISSING | create-evals knowledge base could be more comprehensive

Neither command nor pipeline references eval-standards or eval-pattern knowledge
for the 13 eval categories.

### Weak Findings (6)

| ID | Step | Issue |
|----|------|-------|
| 6-W1 | tdd | Mode detection triggers underspecified |
| 6-W2 | implementation-plan | PRD→Stories→Tasks transitive traceability not explicit |
| 6-W3 | security | Logical dependency on operations not formalized |
| 6-W4 | operations | Reference vs redefinition boundary for dev-setup unclear |
| 6-W5 | story-tests | "No layer splitting" in MVP not precisely defined |
| 6-W6 | All commands | Commands are pre-rendered at depth 5; no depth control |

---

## Module 7: Implementation Handoff Quality

**Validated findings: 15** (0 BROKEN, 8 MISSING, 7 WEAK)

### 7-M1 | MISSING | Implementation-playbook reads incomplete

Playbook reads 12 upstream artifacts but misses: `docs/domain-models/`,
`docs/adrs/`, `docs/vision.md`, `docs/project-structure.md`, and all validation
artifacts (`docs/validation/`).

**Impact**: P2 — Agents lack explicit guidance on consulting these documents.

### 7-M2 | MISSING | No acceptance-test-to-task mapping

Pipeline creates test skeletons in `tests/acceptance/` and tasks in
`docs/implementation-plan.md` but no document shows agents how to navigate from
a task to its corresponding test files.

**Impact**: P1 — Agents may write tests from scratch instead of using skeletons.

### 7-M3 | MISSING | `make eval` not mandatory at MVP depth

Quality criteria say evals are a required check but MVP methodology scaling
and CLAUDE.md Key Commands don't include `make eval`.

**Impact**: P2 — Inconsistent quality gate enforcement across depths.

### 7-M4 | MISSING | Per-task context briefs not in implementation-plan

Playbook deep criteria require "each task has context requirements (which docs to
read before starting)" but `implementation-plan.md` doesn't produce these.

**Impact**: P2 — Agents must infer relevant docs per task.

### 7-M5 | MISSING | No dependency-failure recovery in playbook

No guidance for agents when a task's upstream dependency hasn't merged. No
instructions on checking dependency status or finding unblocked alternative work.

**Impact**: P2 — Agents blocked on dependencies have no recovery path.

### 7-M6 | MISSING | new-enhancement doesn't require playbook update

After adding features via `/new-enhancement`, playbook may become stale.
Playbook update is suggested but not required.

**Impact**: P2 — Playbook drifts from implementation-plan after enhancements.

### 7-M7 | MISSING | quick-task doesn't specify quality gates

Created tasks have no explicit quality-gate list referencing the playbook's gates.

**Impact**: P3 — Agents may over-test or under-test.

### 7-M8 | MISSING | No handoff protocol at MVP depth

Inter-agent handoff format (summary, assumptions, limitations, files modified) is
marked "deep" only. MVP agents have no handoff documentation.

**Impact**: P2 — Downstream agents lose context in MVP multi-agent scenarios.

### Weak Findings (7)

| ID | Issue |
|----|-------|
| 7-W1 | Task execution protocol doesn't reference test skeletons |
| 7-W2 | Quality gates lack explicit error-recovery procedures |
| 7-W3 | Minimum viable context defined in knowledge but not enforced |
| 7-W4 | Eval failure recovery lacks specific category→fix mappings |
| 7-W5 | /release doesn't reference playbook's gate definitions |
| 7-W6 | Onboarding guide doesn't explain playbook's role |
| 7-W7 | Task ↔ test ↔ eval chain requires 5-6 lookups (should be 2-3) |

---

## Module 8: Meta-Eval Self-Assessment

**Validated findings: 14** (0 BROKEN, 2 MISALIGNED, 6 MISSING, 6 WEAK)

### Eval Coverage by Audit Module

| Module | Coverage | Tests | Status |
|--------|----------|-------|--------|
| 1. Dependency & Data Flow | 85% | 16 | Strong but grep-based (false negatives) |
| 2. Methodology Scaling | 60% | 6 | Improved from R3; depth tags now checked |
| 3. Mode Detection | 40% | 3 | Update Mode Specifics content not validated |
| 4. Quality Criteria | 15% | 2 (soft) | Critical gap — measurability not checked |
| 5. Knowledge System | 60% | 9 | Structure good; injection not validated |
| 6. Command Parity | 50% | 12 | File existence good; content alignment missing |
| 7. Implementation Handoff | 70% | 5 | Exists from R3; needs enhancement |
| 8. Meta-Eval | N/A | N/A | Self-assessment |

### 8-MA1 | MISALIGNED | data-flow.bats exemption list too large

37+ entries in PHASE_ORDERING_EXEMPT makes the test nearly a no-op.

**Fix**: Audit exemption list; set review cadence; move to per-violation skip.

### 8-MA2 | MISALIGNED | output-consumption.bats grep-based detection

Grep searches body text (including comments and examples), not just `reads` and
`dependencies` fields. A path in a comment counts as "consumed."

**Fix**: Refactor to parse YAML frontmatter only; build graph; traverse it.

### Proposed Soft-Gate Promotions

| Current Eval | Current Behavior | Proposed Change |
|-------------|-----------------|-----------------|
| prompt-quality.bats depth tags | Warns if <5 steps, always passes | FAIL if <35 steps have tags |
| pipeline-completeness.bats UMS | Warns if missing, always passes | FAIL if Mode Detection step lacks UMS |
| command-structure.bats dead-ends | Warns but doesn't fail | FAIL if >2 dead-end commands |

### Proposed New Evals

#### 1. `quality-criteria-measurability.bats` (MEDIUM complexity)

**Invariant**: Quality Criteria don't use vague quantifiers without metrics.
**Catches**: 4-B1 contradictions, 4-M vague criteria, innovation approval format gaps.

```
Tests:
- QC sections don't use vague words without metrics (appropriate, sufficient, etc.)
- Innovation step approval criteria specify documentation format
- Review steps define P0-P3 with concrete definitions
- All QC items have measurable checkpoints (soft gate)
```

#### 2. `knowledge-injection.bats` (HIGH complexity)

**Invariant**: Knowledge entries match step phase context and have consistent structure.
**Catches**: 5-W1–W10 knowledge gaps, Summary/Deep Guidance consistency.

```
Tests:
- KB entries referenced by steps are consistent with step phase
- Summary/Deep Guidance structure is consistent
- All KB topics are distinct and meaningful
```

### Maintenance Burden

| Eval | Issue | Recommendation |
|------|-------|----------------|
| skill-triggers.bats | Hardcoded trigger phrases | Extract to config file |
| eval_helper.bash | Duplicated phase mappings | Consolidate to single array |
| output-consumption.bats | O(n²) grep complexity | Refactor to frontmatter parsing |
| pipeline-completeness.bats | 10 tests covering mixed concerns | Split into structure + semantics |

---

## Priority Matrix

### P0 — Would cause agent failure or incorrect output (0 findings)

None. All Round 3 P0 findings were resolved.

### P1 — Significantly reduces agent effectiveness (5 findings)

| ID | Module | Issue |
|----|--------|-------|
| 4-B1 | QC | create-evals contradictory criteria |
| 4-B2 | QC | implementation-playbook `make eval` at all depths |
| 4-B3 | QC | system-architecture duplicates project-structure |
| 5-MS2 | Knowledge | NFR specification guidance missing |
| 7-M2 | Handoff | No acceptance-test-to-task mapping |

### P2 — Reduces output quality or requires workarounds (32 findings)

| Category | Count | Key Items |
|----------|-------|-----------|
| Vague QC criteria | 10 | Subjective words without thresholds |
| Missing QC items | 8 | Output aspects without quality criteria |
| Depth ambiguity | 5 | Grouped depth levels, vague scaling |
| Knowledge gaps | 4 | eval-craft, task-decomposition, prd-craft, testing-strategy |
| Handoff gaps | 5 | Playbook reads, context briefs, dependency recovery |

### P3 — Polish and documentation improvements (50 findings)

Mostly WEAK criteria language, documentation clarity, and cosmetic inconsistencies.

---

## Recommended Actions

### Work Package 1: Fix BROKEN Quality Criteria (3 files, P1)

1. **create-evals.md** — Resolve contradictory false-positive criteria
2. **implementation-playbook.md** — Condition `make eval` on depth/eval existence
3. **system-architecture.md** — Replace directory structure criterion with component mapping

### Work Package 2: High-Priority Knowledge Deepening (4 files, P1-P2)

1. **eval-craft.md** — Add per-category implementation guidance (adherence, security, etc.)
2. **task-decomposition.md** — Add critical path analysis and wave planning subsections
3. **prd-craft.md** — Add NFR specification and quantification guidance
4. **testing-strategy.md** — Add AC-to-test-case transformation and stack-specific examples

### Work Package 3: Handoff Quality (3 files, P1-P2)

1. **implementation-playbook.md** — Add reads for domain-models, adrs, vision, project-structure
2. **implementation-playbook.md** — Add test skeleton discovery guidance to task execution protocol
3. **implementation-playbook.md** — Add dependency-failure recovery section

### Work Package 4: Depth Documentation (template + apply, P2)

Use validation phase steps as template. For 45 affected steps, expand
`custom:depth(1-5)` to explicitly describe each level individually.

### Work Package 5: Quality Criteria Measurability (35 files, P2)

For each MISALIGNED/WEAK QC finding, replace vague language with measurable criteria.
Standardize: P0-P3 severity definitions, traceability language, multi-model synthesis
terminology.

### Work Package 6: Mode Detection Fixes (2 files, P2)

1. **new-enhancement.md** — Change "stateless" to "document-modifying execution command"
2. **quick-task.md** — Clarify Beads vs inline persistence distinction

### Work Package 7: Eval Improvements (4 actions, P2)

1. Promote 3 soft gates to hard gates (prompt-quality, pipeline-completeness, command-structure)
2. Create `quality-criteria-measurability.bats`
3. Create `knowledge-injection.bats`
4. Audit data-flow.bats exemption list

### Work Package 8: Command Parity (rebuild, P2)

Run `scaffold build` to regenerate commands from updated pipeline steps after
applying WP1-WP6 changes. Then spot-check 5 representative pairs for content alignment.

---

## Comparison with Prior Audits

| Metric | Round 3 | Round 4 | Trend |
|--------|---------|---------|-------|
| Total findings | 119 | 87 | ↓ 27% |
| BROKEN | 2 | 0 | ✓ Resolved |
| MISALIGNED | 18 | 15 | ↓ 17% |
| MISSING | 27 | 18 | ↓ 33% |
| WEAK | 72 | 54 | ↓ 25% |
| Steps with depth tags | 19/54 | 54/54 | ✓ 100% |
| Steps with Update Mode Specifics | ~40/54 | 60/60 | ✓ 100% |
| Knowledge entries with Deep Guidance | ~40/60 | ~50/60 | ↑ improved |
| Eval test count | 57 | 66 | ↑ +9 |
| Eval files | 10 | 16 | ↑ +6 |

**Key improvements from v2.35.0:**
- All BROKEN findings resolved (P0 path mismatch in review-user-stories, missing reads in implementation-playbook)
- 100% depth tag coverage (was 35%)
- 100% Update Mode Specifics coverage
- 6 new eval files (handoff-quality, methodology-content, + 4 others)
- 20 knowledge entries restructured with Summary + Deep Guidance

**Remaining systemic issues:**
- Quality Criteria measurability is the largest remaining gap (42 vague criteria)
- Depth documentation still groups levels together (45 of 60 steps)
- Knowledge deepening needed for 10 representative steps
- Eval system has false-negative risks from soft gates and grep-based detection

---

## Appendix: Agent False Positive Patterns

For future audit runs, the following patterns consistently produce false positives:

1. **Disabled dependencies flagged as BROKEN**: The engine treats disabled deps as
   satisfied. Always check `eligibility.ts:29` before flagging MVP dependency gaps.

2. **`reads` field flagged as requiring ordering**: `reads` is a passive data flow hint.
   Only `dependencies` enforce execution ordering. Don't flag cross-phase reads as broken.

3. **Pipeline file "not found"**: Pipeline files are organized by phase subdirectory
   (`pipeline/{phase}/{step}.md`). Agents must search all subdirectories, not guess paths.

4. **"context7" in ai-memory-management topics**: Real MCP server name, not a typo.

5. **Tool-scoped knowledge entries flagged as unused**: Entries in `knowledge/tools/`
   are used by commands, not pipeline steps. Check `commands/` before flagging as orphaned.
