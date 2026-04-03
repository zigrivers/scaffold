# Comprehensive Pipeline Alignment Audit — Round 3

**Date**: 2026-03-29
**Scope**: 54 pipeline steps, 53 knowledge entries, 25+ commands, 3 methodology presets, 14 eval files
**Previous audit**: Round 2 (2026-03-28) — 203 findings → resolved in v2.34.0

## Executive Summary

**Overall pipeline health**: 8.5/10 — Significant improvement from Round 2 (7.5/10). The Round 2 remediation was thorough: vision phase is now in all presets, MVP methodology sections explicitly handle missing upstream artifacts, knowledge entries are well-aligned, and the eval system has grown from 46 to 57+ tests. The remaining issues are primarily **depth tagging gaps** (35 of 54 steps lack Quality Criteria depth tags) and **structural inconsistencies** in Update Mode Specifics.

**Finding totals**: 119 findings across 8 modules

| Severity | Count | Description |
|----------|-------|-------------|
| BROKEN | 2 | Will cause failures or incorrect output |
| MISALIGNED | 18 | Exists but connections are wrong |
| MISSING | 27 | Should exist but doesn't |
| WEAK | 72 | Exists but insufficient quality |

**Comparison with Round 2**: Down from 203 to 119 findings (-41%). BROKEN dropped from 7 to 2 (-71%). MISALIGNED dropped from 38 to 18 (-53%).

**Key insight**: The engine's soft-dependency behavior (disabled deps count as satisfied, per `eligibility.ts:29`) means the MVP path executes correctly despite implementation-plan and implementation-playbook having dependencies on disabled steps. Several agent findings were false positives due to not understanding this engine behavior — this is itself a finding (the dependency model is non-obvious).

---

## Findings by Module

### Module 1: Dependency & Data Flow Integrity

**15 findings** (0 BROKEN, 4 MISALIGNED, 4 MISSING, 7 WEAK)

**Agent false positives filtered**: 5 findings from the audit agent were false positives:
- `tdd reads system-architecture` flagged as BROKEN — actually works because `reads` is a data flow hint, not an execution dependency. The body correctly says "(optional — if available)".
- `story-tests reads phase 8 artifacts` flagged as BROKEN — reads doesn't enforce ordering; story-tests' hard deps are [tdd, review-user-stories, review-architecture], and the artifacts in reads are available by the time story-tests executes (phase 9 runs after phase 8).
- `create-prd reads create-vision but create-vision is optional` — body correctly handles missing vision.md with branching logic. Not broken.
- `create-evals reads security before it exists` — create-evals (920) comes before security (950) in order numbering, but both are in the same phase (quality). Same-phase reads are architectural decisions, not ordering violations.
- `implementability-dry-run/review-security stale data risk` — validation phase runs last, all data is available.

**Valid findings**:

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 1-MA1 | MISALIGNED | `system-architecture` has `reads: []` but body requires `docs/domain-models/`, `docs/adrs/`, `docs/plan.md`. Reads field doesn't reflect body's actual inputs. | pipeline/architecture/system-architecture.md |
| 1-MA2 | MISALIGNED | `review-architecture` has `reads: []` but Inputs section requires `docs/domain-models/` for coverage checking. | pipeline/architecture/review-architecture.md |
| 1-MA3 | MISALIGNED | `database-schema` has `reads: []` and no dependencies, but Inputs section requires `docs/domain-models/`, `docs/system-architecture.md`, `docs/adrs/`. Frontmatter doesn't reflect body requirements. | pipeline/specification/database-schema.md |
| 1-MA4 | MISALIGNED | `ux-spec` reads `design-system` which is conditional. If design-system is skipped, ux-spec body should handle gracefully but no explicit guard documented. | pipeline/specification/ux-spec.md |
| 1-MS1 | MISSING | No fallback artifact when `innovate-prd` is skipped. `user-stories` reads `innovate-prd` but `docs/prd-innovation.md` won't exist if the step is skipped. Body should handle this gracefully. | pipeline/pre/user-stories.md, pipeline/pre/innovate-prd.md |
| 1-MS2 | MISSING | Same pattern: `innovate-user-stories` is conditional, but `review-user-stories` and downstream steps may reference `docs/user-stories-innovation.md`. | pipeline/pre/innovate-user-stories.md |
| 1-MS3 | MISSING | Same pattern: `innovate-vision` is conditional, but `create-prd` may reference `docs/vision-innovation.md`. | pipeline/vision/innovate-vision.md |
| 1-MS4 | MISSING | No path consistency validation exists. When step A produces `docs/foo.md` and step B references it, path matching is assumed but not enforced anywhere. | systemic |
| 1-W1 | WEAK | `story-tests` has long reads list mixing required and optional. No distinction in frontmatter between "must have" and "nice to have" reads. | pipeline/quality/story-tests.md |
| 1-W2 | WEAK | `create-evals` has long reads list (security, dev-env-setup, api-contracts, database-schema, ux-spec) — many optional per body but reads field doesn't distinguish. | pipeline/quality/create-evals.md |
| 1-W3 | WEAK | `ux-spec` is conditional but `review-ux` unconditionally depends on it. If ux-spec is skipped, review-ux is unblocked (disabled dep = satisfied) but runs with no input artifact. | pipeline/specification/review-ux.md |
| 1-W4 | WEAK | Same pattern for conditional spec steps: review-database depends on database-schema, review-api depends on api-contracts. All conditional chains where review step is also conditional, but the coupling is implicit. | systemic |
| 1-W5 | WEAK | `implementation-plan` reads `story-tests`, `create-evals` — these are quality phase artifacts. If running MVP with these disabled, implementation-plan works from PRD+stories only (correct behavior documented in Methodology Scaling). But the reads field doesn't signal optionality. | pipeline/planning/implementation-plan.md |
| 1-W6 | WEAK | Reads field semantics are non-obvious: `reads` provides data flow hints but doesn't enforce ordering or require artifacts to exist. This design choice is correct but undocumented — agents and auditors consistently misinterpret it. | systemic (methodology/README.md) |
| 1-W7 | WEAK | No step explicitly documents which of its reads are "required reads" vs "optional reads." The body Inputs section uses "(optional)" markers but the frontmatter reads field is flat. | systemic |

---

### Module 2: Methodology Scaling Coherence

**12 findings** (0 BROKEN, 2 MISALIGNED, 1 MISSING, 9 WEAK)

**Agent false positives filtered**: 2 findings flagged as BROKEN were false positives:
- `implementation-plan MVP deps unsatisfiable` — FALSE. Engine treats disabled deps as satisfied (`eligibility.ts:29`). The step's MVP methodology explicitly says "work from PRD features and user stories only."
- `implementation-playbook MVP depends on disabled developer-onboarding-guide` — FALSE. Same soft-dependency behavior. Playbook's MVP methodology says "skip per-task context blocks, reference docs directly."

**Valid findings**:

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 2-MA1 | MISALIGNED | **35 of 54 pipeline steps lack Quality Criteria depth tags** despite having depth-differentiated Methodology Scaling sections. This means an agent at depth 1 cannot distinguish which criteria apply to it. All review steps (11), all validation steps (7), finalization steps (3), plus tdd, tech-stack, story-tests, and others. | 35 pipeline files (list below) |
| 2-MA2 | MISALIGNED | `create-prd` tags "each non-functional requirement has a measurable target" as `(deep)` but NFRs are essential even for MVP PRDs. Should be `(mvp)`. | pipeline/pre/create-prd.md |
| 2-MS1 | MISSING | Some conditional steps (add-e2e-testing, design-system, platform-parity-review, automated-pr-review) lack explicit Conditional Evaluation sections explaining when to enable them. Users must infer from context. | 4 pipeline files |
| 2-W1 | WEAK | Innovation steps specify "mvp: Not applicable — skip" but have no fallback for "what if user enables at depth 1?" Edge case, but creates ambiguity. | pipeline/pre/innovate-*.md, pipeline/vision/innovate-vision.md |
| 2-W2 | WEAK | `tech-stack` depth 1-2 says "core stack" but doesn't define which technologies are "core" vs optional. Agent must guess. | pipeline/foundation/tech-stack.md |
| 2-W3 | WEAK | Multi-model review fallback for depth 4+ mentions "graceful fallback to Claude-only enhanced review" but the fallback behavior is not formally defined. | systemic (review steps) |
| 2-W4 | WEAK | `review-architecture` methodology says MVP runs "domain coverage and ADR compliance only" but Quality Criteria don't tag which of the 10 review passes apply at each depth. | pipeline/architecture/review-architecture.md |
| 2-W5 | WEAK | Validation phase has depth-scaled methodology (depth 1 = identify path, depth 5 = multi-model simulation) but zero Quality Criteria depth tags in any of the 7 validation steps. | pipeline/validation/*.md |
| 2-W6 | WEAK | `tdd` methodology scales coverage targets by depth but criteria don't distinguish MVP (test pyramid overview) from deep (contract testing, visual regression). | pipeline/foundation/tdd.md |
| 2-W7 | WEAK | `story-tests` methodology says depth 1 = "must-have stories only" but criteria don't tag scope. | pipeline/quality/story-tests.md |
| 2-W8 | WEAK | `implementation-plan-review` has no depth tags despite methodology scaling from "quick sanity check" to "full coverage audit." | pipeline/planning/implementation-plan-review.md |
| 2-W9 | WEAK | `database-schema` tags "constraints enforce domain invariants" as `(deep)` but this should be `(mvp)` — missing constraints cause runtime failures. | pipeline/specification/database-schema.md |

**Files without Quality Criteria depth tags** (35 of 54):
add-e2e-testing, ai-memory-setup, apply-fixes-and-freeze, automated-pr-review, beads, claude-md-optimization, critical-path-walkthrough, cross-phase-consistency, decision-completeness, dependency-graph-validation, dev-env-setup, developer-onboarding-guide, implementability-dry-run, implementation-plan-review, implementation-playbook, innovate-vision, platform-parity-review, review-adrs, review-api, review-architecture, review-database, review-domain-modeling, review-operations, review-prd, review-security, review-testing, review-user-stories, review-ux, review-vision, scope-creep-check, story-tests, tdd, tech-stack, traceability-matrix, workflow-audit

---

### Module 3: Mode Detection & Update Mode Completeness

**14 findings** (1 BROKEN, 3 MISALIGNED, 2 MISSING, 8 WEAK)

**Agent false positives filtered**: Several Module 3 findings were inflated or speculative. Filtered to verified issues.

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 3-B1 | BROKEN | `review-user-stories` Update Mode Specifics Detect field says `docs/reviews/review-user-stories.md` but actual output is `docs/reviews/pre-review-user-stories.md`. Path mismatch means update mode detection will fail — agent will regenerate from scratch on re-run, losing resolution decisions. | pipeline/pre/review-user-stories.md:64 |
| 3-MA1 | MISALIGNED | `domain-modeling` Mode Detection checks for `docs/domain-models/` directory existence, but doesn't distinguish between completed models, empty directory from failed run, or partial models from abandoned session. | pipeline/modeling/domain-modeling.md:55-58 |
| 3-MA2 | MISALIGNED | `api-contracts` preserve rule says "never remove or rename existing endpoints without explicit user approval" but conflict resolution only covers "if architecture moved an operation to a different component" — not fundamental endpoint renames or auth model changes. Agent would deadlock. | pipeline/specification/api-contracts.md:53-61 |
| 3-MA3 | MISALIGNED | `platform-parity-review` is conditional `"if-needed"` but has no Conditional Evaluation section explaining when it should run. Other conditional steps (create-vision, design-system, beads) have these sections. | pipeline/parity/platform-parity-review.md |
| 3-MS1 | MISSING | Validation steps (7 files) all say "validation always runs fresh" but don't define Update Mode Specifics for their multi-model artifacts (`docs/validation/<step>/codex-review.json` etc.). If these exist from prior run, agent doesn't know whether to preserve, merge, or regenerate. | pipeline/validation/*.md |
| 3-MS2 | MISSING | `coding-standards` Update Mode triggers don't include "commit format changed in git-workflow.md." Standards and git workflow can drift out of sync. | pipeline/foundation/coding-standards.md |
| 3-W1 | WEAK | `reads` field is passive metadata — it doesn't trigger re-runs. If user updates the PRD, steps that have `reads: [create-prd]` won't auto-detect the change. Only hard dependencies trigger cascading updates. This is a design choice but undocumented. | systemic |
| 3-W2 | WEAK | `tdd` preserve rule mentions "custom assertions" but doesn't define patterns or naming conventions to distinguish custom assertions from framework-provided ones. | pipeline/foundation/tdd.md:55 |
| 3-W3 | WEAK | `implementation-plan` preserve rule says "preserve completed and in-progress task statuses" but doesn't define what constitutes "completed" (merged PR? tests passing? user approval?). | pipeline/planning/implementation-plan.md:75-76 |
| 3-W4 | WEAK | `create-evals` update mode references "exclusions" but doesn't explain the mechanism (comments? separate file? frontmatter?). | pipeline/quality/create-evals.md:95-97 |
| 3-W5 | WEAK | `design-system` preserve rule says "never change color values without user approval" but doesn't address cascading WCAG compliance (light mode change requiring dark mode update). | pipeline/environment/design-system.md:64-74 |
| 3-W6 | WEAK | `implementation-plan` preserve rule says "preserve wave assignments for tasks already started" but doesn't handle new tasks that must run before existing ones (dependency insertion). | pipeline/planning/implementation-plan.md:75-76 |
| 3-W7 | WEAK | Review steps have brief Update Mode Specifics that say "upstream artifact changed" without specifying WHICH artifact specifically triggers re-review. | systemic (11 review steps) |
| 3-W8 | WEAK | Pipeline ↔ Command Mode Detection is consistent for sampled files but commands have shorter Update Mode Specifics. This is intentional (commands are user-facing) but creates an information asymmetry. | systemic |

---

### Module 4: Quality Criteria Assessment

**34 findings** (1 BROKEN, 2 MISALIGNED, 14 MISSING, 17 WEAK)

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 4-B1 | BROKEN | All 3 innovation steps (innovate-vision, innovate-prd, innovate-user-stories) have unmeasurable approval criteria. "User approval documented with date/method" — no format specified (JSON? markdown? comment?). Agent cannot verify pass/fail. | pipeline/*/innovate-*.md |
| 4-MA1 | MISALIGNED | `create-prd`: "each non-functional requirement has a measurable target" tagged `(deep)` but NFRs are essential at all depths. | pipeline/pre/create-prd.md |
| 4-MA2 | MISALIGNED | `database-schema`: "constraints enforce domain invariants at the database level" tagged `(deep)` but missing constraints cause runtime failures at any depth. | pipeline/specification/database-schema.md |
| 4-MS1 | MISSING | `create-vision`: No criterion for alignment with PRD (if PRD exists in update mode). | pipeline/vision/create-vision.md |
| 4-MS2 | MISSING | `create-prd`: No self-consistency check (no contradictions within the PRD). | pipeline/pre/create-prd.md |
| 4-MS3 | MISSING | `user-stories`: No story independence criterion (can stories be reordered?). | pipeline/pre/user-stories.md |
| 4-MS4 | MISSING | `domain-modeling`: No ubiquitous language coverage criterion. | pipeline/modeling/domain-modeling.md |
| 4-MS5 | MISSING | `adrs`: No decision dependency criterion (does decision A depend on decision B?). | pipeline/decisions/adrs.md |
| 4-MS6 | MISSING | `api-contracts`: No request body schema validation examples or pagination schema criterion. | pipeline/specification/api-contracts.md |
| 4-MS7 | MISSING | `database-schema`: No rollback safety criterion (can migrations be safely rolled back?). | pipeline/specification/database-schema.md |
| 4-MS8 | MISSING | `ux-spec`: No responsive design consistency criterion. | pipeline/specification/ux-spec.md |
| 4-MS9 | MISSING | `operations`: No RTO/RPO criterion. | pipeline/quality/operations.md |
| 4-MS10 | MISSING | `security`: No secret rotation testing criterion. | pipeline/quality/security.md |
| 4-MS11 | MISSING | `implementation-plan`: No task locality criterion (minimal file contention). | pipeline/planning/implementation-plan.md |
| 4-MS12 | MISSING | `story-tests`: No test data dependencies criterion. | pipeline/quality/story-tests.md |
| 4-MS13 | MISSING | `create-evals`: No eval false-positive rate criterion. | pipeline/quality/create-evals.md |
| 4-MS14 | MISSING | Review steps lack context-specific P0-P3 severity definitions. `review-vision` has them (excellent), but most review steps use generic definitions. | systemic (10 review steps) |
| 4-W1 | WEAK | `create-vision`: "Vision statement describes positive change, not a product feature" — no heuristic for agent to distinguish. | pipeline/vision/create-vision.md |
| 4-W2 | WEAK | `api-contracts`: "domain-specific error beyond 500" — "domain-specific" is vague. | pipeline/specification/api-contracts.md |
| 4-W3 | WEAK | `database-schema`: "Indexes cover known query patterns" — no definition of "known patterns." | pipeline/specification/database-schema.md |
| 4-W4 | WEAK | `domain-modeling`: "Invariants are testable assertions, not vague rules" — no examples of testable vs vague. | pipeline/modeling/domain-modeling.md |
| 4-W5 | WEAK | `adrs`: "Technology selections include team expertise" — not testable without team access. | pipeline/decisions/adrs.md |
| 4-W6 | WEAK | `story-tests`: "Single-function ACs → unit; cross-component ACs → integration" — "single-function" boundary is subjective. | pipeline/quality/story-tests.md |
| 4-W7 | WEAK | `security`: "Input validation rules defined for each user-facing field" — no format specified. | pipeline/quality/security.md |
| 4-W8 | WEAK | `operations`: "Alert thresholds are justified, not arbitrary" — "justified" is subjective. | pipeline/quality/operations.md |
| 4-W9 | WEAK | `implementation-plan`: 500-line limit for tasks is debatable (tests? comments? generated code?). | pipeline/planning/implementation-plan.md |
| 4-W10 | WEAK | Multi-model synthesis wording inconsistent across steps — some say "consensus/disagreement analysis," others say "unique ideas highlighted." | systemic |
| 4-W11 | WEAK | Traceability tagging inconsistent: story-tests uses "story ID and AC ID," review-user-stories uses "REQ-xxx IDs," implementation-plan-review uses "AC-to-task coverage matrix." Three different schemes. | systemic |
| 4-W12 | WEAK | Approval documentation inconsistent: innovate-prd requires "documented with date/method," create-evals requires "make eval runs," security has no approval gate. | systemic |
| 4-W13 | WEAK | `create-prd`: "Problem statement is specific and testable" — no criteria for "testable." | pipeline/pre/create-prd.md |
| 4-W14 | WEAK | Review step boilerplate: "All X passes executed with findings documented" appears in all 11 review steps but doesn't specify output format for "documented." | systemic |
| 4-W15 | WEAK | "Comprehensive" and "thorough" appear in some criteria without quantification. | scattered |
| 4-W16 | WEAK | Specification steps have inconsistent error-handling vocabulary: API has "error contract," DB has "referential integrity," UX has "error states." | systemic |
| 4-W17 | WEAK | Innovation steps: "strategic-level, not feature-level" distinction lacks examples. | pipeline/*/innovate-*.md |

---

### Module 5: Knowledge System Alignment

**8 findings** (0 BROKEN, 1 MISALIGNED, 0 MISSING, 7 WEAK)

**Agent false positive filtered**: "context7" in ai-memory-management.md topics was flagged as a typo — it's actually a real MCP server name (@upstash/context7-mcp). Not a bug.

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 5-MA1 | MISALIGNED | 11 review knowledge files (215-268 lines) use pass-based structure instead of Summary + Deep Guidance convention used by other entries. Functionally fine but breaks convention, complicating assembly optimization. | knowledge/review/*.md |
| 5-W1 | WEAK | `user-story-innovation.md` (228 lines) lacks Deep Guidance header despite length. | knowledge/core/user-story-innovation.md |
| 5-W2 | WEAK | `ux-specification.md` (237 lines) lacks Deep Guidance header despite length. | knowledge/core/ux-specification.md |
| 5-W3 | WEAK | `apply-fixes-and-freeze.md` (244 lines) lacks Summary/Deep Guidance headers. | knowledge/finalization/apply-fixes-and-freeze.md |
| 5-W4 | WEAK | 5 validation knowledge entries (181-233 lines) lack Deep Guidance structure. Adequate for purpose but shorter than ideal. | knowledge/validation/*.md |
| 5-W5 | WEAK | `prd-innovation.md` (204 lines) lacks Summary/Deep Guidance headers. | knowledge/product/prd-innovation.md |
| 5-W6 | WEAK | Review knowledge entries use "Pass 1, Pass 2" structure. If the assembly system ever optimizes for Summary/Deep Guidance, these 11 entries would need restructuring. | knowledge/review/*.md |
| 5-W7 | WEAK | 20 knowledge entries (>200 lines) lack Summary/Deep Guidance structure. This represents 38% of all entries. Won't cause failures but reduces assembly efficiency. | 20 knowledge files |

**Strengths**: 100% coverage (all 54 steps have appropriate knowledge-base entries). Zero unused entries (all 53 referenced). 202 unique topics with no duplicates. Excellent alignment for all 10 representative steps tested.

---

### Module 6: Command ↔ Pipeline Parity

**6 findings** (0 BROKEN, 1 MISALIGNED, 0 MISSING, 5 WEAK)

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 6-MA1 | MISALIGNED | Commands always produce full-depth (deep) output. The depth disclaimer tells users to use `scaffold run --preset mvp` for lighter execution, but commands themselves cannot scale by methodology depth. This is intentional but creates asymmetry. | All 25 command files |
| 6-W1 | WEAK | `create-prd` command preserve rules mention "enhancement markers" without clarifying this is for future scope additions. | commands/create-prd.md |
| 6-W2 | WEAK | `tdd` command preserve rules mention "Playwright/Maestro prompts" that don't exist in current pipeline. | commands/tdd.md |
| 6-W3 | WEAK | `traceability-matrix` and `review-architecture` commands reference multi-model dispatch skills that may not work in slash command context. | commands/traceability-matrix.md, commands/review-architecture.md |
| 6-W4 | WEAK | `create-evals` command has multiple complex preserve rules (adherence, security, error-handling exclusions) without consolidated explanation. | commands/create-evals.md |
| 6-W5 | WEAK | Commands have more detailed section structure than pipeline steps (intentionally, as user-facing). But no documentation explains the relationship between command and pipeline versions. | systemic |

**Strengths**: All 15 sampled commands have accurate After This Step guidance matching the dependency graph. All Mode Detection sections match pipeline counterparts. No structural parity issues found.

---

### Module 7: Implementation Handoff Quality

**16 findings** (1 BROKEN, 3 MISALIGNED, 5 MISSING, 7 WEAK)

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 7-B1 | BROKEN | `implementation-playbook` reads field is missing critical docs: `system-architecture`, `tdd`, `coding-standards`, `security`, `operations`. The playbook is the primary agent reference but doesn't declare reads on 9 key upstream artifacts. MVP methodology works from docs directly, but deep playbook needs full context. | pipeline/finalization/implementation-playbook.md |
| 7-MA1 | MISALIGNED | No document maps tasks to eval categories. Agent knows to run `make eval` but doesn't know which of the 13 eval categories matter for their specific task. Task → test skeleton chain exists but task → eval chain is implicit. | systemic |
| 7-MA2 | MISALIGNED | Agent start commands (single-agent-start, multi-agent-start) reference playbook and onboarding guide correctly but agent must cross-reference 3 documents (onboarding → playbook → implementation plan). No single entry point. | commands/single-agent-start.md, commands/multi-agent-start.md |
| 7-MA3 | MISALIGNED | `new-enhancement` recommends follow-up commands ("if 5+ tasks, run implementation-plan-review") but doesn't mandate them. Post-pipeline validation is advisory, not enforced. | commands/new-enhancement.md |
| 7-MS1 | MISSING | No eval failure recovery guidance. Playbook defines `make eval` as Gate 6 but doesn't explain what to do when specific eval categories fail. Agent must discover `docs/eval-standards.md` on their own. | pipeline/finalization/implementation-playbook.md |
| 7-MS2 | MISSING | No dependency failure recovery protocol. If a task's dependency hasn't merged, agent has no guidance on whether to wait, skip, or escalate. | pipeline/finalization/implementation-playbook.md |
| 7-MS3 | MISSING | No version release integration in post-pipeline workflows. User preference is "always do a version release after every meaningful change" but neither new-enhancement nor quick-task mention versioning. | commands/new-enhancement.md, commands/quick-task.md |
| 7-MS4 | MISSING | Freeze marker format not documented in new-enhancement. The command says "if documents have a freeze marker, update it" but doesn't specify the format. | commands/new-enhancement.md |
| 7-MS5 | MISSING | Multi-agent conflict arbitration protocol not defined. Playbook mentions "merge conflicts" but doesn't specify who arbitrates when two agents modify the same file. | pipeline/finalization/implementation-playbook.md |
| 7-W1 | WEAK | Story → test skeleton chain exists (story-tests-map.md) but test skeleton → task mapping is implicit. Agent must match story IDs between implementation-plan.md and story-tests-map.md manually. | systemic |
| 7-W2 | WEAK | Quality gates (6 defined) may miss project-specific gates defined in CLAUDE.md. Playbook doesn't read CLAUDE.md as an input source. | pipeline/finalization/implementation-playbook.md |
| 7-W3 | WEAK | Per-task context blocks (which docs to read per task type) exist in knowledge base playbook but may be skipped at MVP depth. | pipeline/finalization/implementation-playbook.md |
| 7-W4 | WEAK | Error recovery for test failures exists but doesn't explicitly address "revert and retry" vs "fix in place" decision-making. | knowledge/finalization/implementation-playbook.md |
| 7-W5 | WEAK | `quick-task` reads implementation-playbook for quality gates but not all project docs, creating an inconsistent context window compared to new-enhancement. | commands/quick-task.md |
| 7-W6 | WEAK | new-enhancement says to run story-tests if stories changed, but this is a "should" not a "must." Updated stories without regenerated test skeletons create coverage gaps. | commands/new-enhancement.md |
| 7-W7 | WEAK | Post-pipeline workflows don't validate that updated docs still satisfy the pipeline's Quality Criteria. Changes can regress quality without detection. | systemic |

---

### Module 8: Meta-Eval Self-Assessment

**14 findings** (0 BROKEN, 2 MISALIGNED, 6 MISSING, 6 WEAK)

**Eval coverage by audit module**:

| Module | Coverage | Evals | Key Gap |
|--------|----------|-------|---------|
| 1. Dependency & Data Flow | 85% | dependency-ordering, data-flow, pipeline-completeness, output-consumption | Reads-as-data-flow not validated |
| 2. Methodology Scaling | 20% | prompt-quality (format only), preset-exhaustiveness | No MVP path validation, no depth tag enforcement |
| 3. Mode Detection | 40% | prompt-quality, pipeline-completeness, cross-channel | Update Mode content not validated |
| 4. Quality Criteria | 15% | prompt-quality (soft check) | No measurability check, no completeness check |
| 5. Knowledge System | 60% | knowledge-quality, pipeline-completeness, cross-channel, redundancy | Content quality proxy (line count only) |
| 6. Command Parity | 50% | channel-parity, command-structure, cross-channel | Content alignment not validated |
| 7. Implementation Handoff | 0% | None | **CRITICAL gap** — no eval validates handoff quality |

| ID | Severity | Finding | File(s) |
|----|----------|---------|---------|
| 8-MA1 | MISALIGNED | `data-flow.bats` has PHASE_ORDERING_EXEMPT list with 37+ entries making it effectively a warning-only gate. Returns success despite violations. | tests/evals/data-flow.bats |
| 8-MA2 | MISALIGNED | `output-consumption.bats` uses grep-based detection — a path mentioned in prose or comments counts as "consumed." False negatives possible. | tests/evals/output-consumption.bats |
| 8-MS1 | MISSING | No `handoff-quality.bats` eval validates finalization artifacts are referenced by agent start commands. Module 7 has zero eval coverage. | proposed: tests/evals/handoff-quality.bats |
| 8-MS2 | MISSING | No `methodology-content.bats` eval validates MVP vs deep produce meaningfully different execution paths. | proposed: tests/evals/methodology-content.bats |
| 8-MS3 | MISSING | No eval validates Quality Criteria measurability (vague words like "appropriate," "sufficient," "adequate"). | proposed: tests/evals/quality-criteria-measurability.bats |
| 8-MS4 | MISSING | No eval validates knowledge injection into assembled commands. | proposed: tests/evals/knowledge-injection.bats |
| 8-MS5 | MISSING | `prompt-quality.bats` Quality Criteria depth tags check is soft (warns but doesn't fail). Should be promoted to hard gate now that Round 2 added tags to 19 files. | tests/evals/prompt-quality.bats |
| 8-MS6 | MISSING | `pipeline-completeness.bats` Update Mode Specifics check is warning-only. Should be promoted to hard gate. | tests/evals/pipeline-completeness.bats |
| 8-W1 | WEAK | `command-structure.bats` dead-end warnings don't fail. Detected but not enforced. | tests/evals/command-structure.bats |
| 8-W2 | WEAK | `skill-triggers.bats` has hardcoded trigger phrases that break on rewording. Should extract to config. | tests/evals/skill-triggers.bats |
| 8-W3 | WEAK | `eval_helper.bash` has duplicated phase mappings (get_phase_order_range + get_phase_number both hardcode 15 phases). | tests/evals/eval_helper.bash |
| 8-W4 | WEAK | `exemptions.bash` has validation functions (validate_exempt_terminal_outputs, validate_exempt_phase_ordering) but exemption-audit.bats doesn't call validate_exempt_terminal_outputs. | tests/evals/exemptions.bash, tests/evals/exemption-audit.bats |
| 8-W5 | WEAK | `channel-parity.bats` checks file names only, not content alignment. | tests/evals/channel-parity.bats |
| 8-W6 | WEAK | `knowledge-quality.bats` uses line count as quality proxy — a shallow 200-line entry passes the same as a rich 200-line entry. | tests/evals/knowledge-quality.bats |

---

## Priority Matrix

### P0: Blocks correct pipeline execution (2 findings)

| ID | Finding | Impact | Fix |
|----|---------|--------|-----|
| 3-B1 | review-user-stories Update Mode Specifics Detect path mismatch (`review-user-stories.md` vs `pre-review-user-stories.md`) | Update mode fails silently on re-run, losing resolution decisions | Fix path in pipeline/pre/review-user-stories.md:64 |
| 7-B1 | implementation-playbook reads field missing 9 key upstream artifacts | Deep playbook generated without system-architecture, tdd, coding-standards, security, operations context | Add reads entries to pipeline/finalization/implementation-playbook.md |

### P1: Significant quality reduction (18 findings)

| ID | Finding | Impact |
|----|---------|--------|
| 2-MA1 | 35 pipeline steps lack Quality Criteria depth tags | Agents can't self-assess at correct depth |
| 4-B1 | Innovation step approval criteria unmeasurable | Agent can't verify approval pass/fail |
| 7-MA1 | No task-to-eval category mapping | Agent guesses which evals matter per task |
| 7-MS1 | No eval failure recovery guidance | Agent stuck when evals fail |
| 7-MS3 | No version release in post-pipeline workflows | User preference violated |
| 8-MS1 | No handoff-quality eval | Module 7 issues will regress undetected |
| 8-MS2 | No methodology-content eval | MVP path issues will regress undetected |
| 1-MA1 | system-architecture reads field empty despite body listing 3 required inputs | Data flow tracking inaccurate |
| 1-MA2 | review-architecture reads field empty | Same |
| 1-MA3 | database-schema reads field empty and no dependencies | Same |
| 3-MA2 | api-contracts preserve rule blocks endpoint renames without approval mechanism | Agent deadlocks on arch-driven breaking changes |
| 3-MA3 | platform-parity-review missing Conditional Evaluation section | Agent doesn't know when step should run |
| 3-MS1 | Validation steps lack Update Mode Specifics for multi-model artifacts | Prior fix decisions lost on re-run |
| 4-MA1 | create-prd NFR criterion mistagged as (deep) | MVP PRDs skip NFR measurability |
| 4-MA2 | database-schema constraint criterion mistagged as (deep) | MVP schemas skip constraint enforcement |
| 4-MS14 | Review steps lack context-specific severity definitions | Inconsistent P0-P3 thresholds |
| 7-MS2 | No dependency failure recovery protocol | Agent stuck when upstream task fails |
| 7-MS5 | No multi-agent conflict arbitration | Agents silently overwrite each other |

### P2: Minor quality issues (27 findings)

Remaining MISSING findings (4-MS1 through 4-MS13) plus systemic WEAK findings (1-W6, 1-W7, 3-W1, 3-W7, 4-W10-W17, etc.)

### P3: Observations for future improvement (72 findings)

All remaining WEAK findings — vague criteria language, knowledge structure inconsistencies, command depth limitations, etc.

---

## Recommended Actions

### Work Package 1: Critical Fixes (P0)
**Files**: 2 pipeline files
**Effort**: 15 minutes

1. Fix `review-user-stories.md:64` — change `docs/reviews/review-user-stories.md` to `docs/reviews/pre-review-user-stories.md`
2. Add reads to `implementation-playbook.md` — add `system-architecture`, `tdd`, `coding-standards`, `security`, `operations` to reads field

### Work Package 2: Quality Criteria Depth Tags (P1)
**Files**: 35 pipeline files
**Effort**: 2-3 hours

Add `(mvp)` and `(deep)` tags to Quality Criteria in all 35 untagged files. For each file:
- Read the Methodology Scaling section to understand depth boundaries
- Tag criteria that apply at all depths as unmarked
- Tag MVP-only criteria as `(mvp)`
- Tag deep-only criteria as `(deep)`
- Tag depth 4+ criteria as `(depth 4+)`

Also fix 2 mistagged criteria:
- `create-prd.md`: NFR criterion from `(deep)` → `(mvp)`
- `database-schema.md`: constraint criterion from `(deep)` → `(mvp)`

### Work Package 3: Missing Reads Fields (P1)
**Files**: 3 pipeline files
**Effort**: 15 minutes

Add reads entries to reflect body Inputs sections:
- `system-architecture.md`: add `[create-prd, domain-modeling, adrs]` to reads
- `review-architecture.md`: add `[domain-modeling]` to reads
- `database-schema.md`: add `[domain-modeling, system-architecture, adrs]` to reads

### Work Package 4: Innovation Step Criteria (P1)
**Files**: 3 pipeline files
**Effort**: 30 minutes

Replace vague approval criteria in innovate-vision, innovate-prd, innovate-user-stories with:
- Each innovation categorized (market opportunity, positioning, AI-native, ecosystem, contrarian)
- Each includes: what, why, impact (high/medium/low), cost (trivial/moderate/significant)
- Recommended disposition: must-have, backlog, or reject with rationale
- User approval format: question, option, response logged

### Work Package 5: New Evals (P1)
**Files**: 2 new eval files
**Effort**: 1-2 hours

1. `tests/evals/handoff-quality.bats` (~100 lines): Validate implementation-playbook reads cover upstream artifacts. Validate agent start commands reference playbook and onboarding guide.
2. `tests/evals/methodology-content.bats` (~80 lines): Validate MVP preset behavior differs meaningfully from deep. Validate Quality Criteria depth tags present on enabled steps.

### Work Package 6: Mode Detection Fixes (P1)
**Files**: 8 pipeline files
**Effort**: 1 hour

1. Add Conditional Evaluation section to `platform-parity-review.md`
2. Add Update Mode Specifics for multi-model artifacts to 7 validation steps
3. Add git-workflow.md change trigger to `coding-standards.md` Update Mode triggers

### Work Package 7: Implementation Handoff Improvements (P1)
**Files**: 3 command files, 1 pipeline file
**Effort**: 1 hour

1. Add eval failure recovery section to implementation-playbook knowledge entry
2. Add dependency failure protocol to playbook
3. Add version release step to new-enhancement and quick-task commands
4. Document freeze marker format in new-enhancement

### Work Package 8: Quality Criteria Completeness (P2)
**Files**: 14 pipeline files
**Effort**: 2 hours

Add missing criteria identified in 4-MS1 through 4-MS14:
- PRD self-consistency, story independence, ubiquitous language coverage, decision dependencies, pagination schema, rollback safety, responsive design, RTO/RPO, secret rotation, task locality, test data deps, eval false-positive rate, review-specific severity definitions

### Work Package 9: Quality Criteria Measurability (P2)
**Files**: ~15 pipeline files
**Effort**: 2 hours

Replace vague criteria with measurable alternatives:
- "domain-specific error" → specific examples/count requirements
- "known query patterns" → "all queries referenced in api-contracts"
- "testable assertions" → "boolean condition checkable in code"
- "justified thresholds" → "each includes metric, threshold, business impact, mitigation"
- Standardize traceability tagging scheme (story ID, AC ID, REQ-xxx)

### Work Package 10: Knowledge Structure (P3)
**Files**: 20 knowledge files
**Effort**: 2-3 hours

Add Summary/Deep Guidance structure to the 20 entries >200 lines that lack it. Priority order: review entries (11), validation entries (5), remaining core/product entries (4).

---

## Proposed New Evals (from Module 8)

| Eval | Invariant | Catches | Complexity | Priority |
|------|-----------|---------|------------|----------|
| `handoff-quality.bats` | Finalization artifacts referenced by agent commands; playbook reads cover 80%+ upstream outputs | Missing playbook context, orphaned finalization artifacts | Medium | P1 |
| `methodology-content.bats` | MVP/deep presets differ meaningfully; depth tags present on enabled steps | MVP path breakage, depth tag regression | Medium | P1 |
| `quality-criteria-measurability.bats` | No vague words ("appropriate", "sufficient") in criteria without quantification | Unmeasurable criteria accumulating | High | P2 |
| `knowledge-injection.bats` | Knowledge-base entries appear in assembled commands | Commands missing domain expertise | High | P3 |

Also recommended: promote existing soft checks to hard gates:
- `prompt-quality.bats` Quality Criteria depth tags → hard gate
- `pipeline-completeness.bats` Update Mode Specifics → hard gate
- `data-flow.bats` → reduce PHASE_ORDERING_EXEMPT to legitimate entries only

---

## Comparison with Prior Audits

| Metric | Round 1 | Round 2 | Round 3 | Trend |
|--------|---------|---------|---------|-------|
| Total findings | 196 | 203 | 119 | -42% from R2 |
| BROKEN | 4 | 7 | 2 | -71% from R2 |
| MISALIGNED | 31 | 38 | 18 | -53% from R2 |
| MISSING | 56 | 63 | 27 | -57% from R2 |
| WEAK | 105 | 95 | 72 | -24% from R2 |
| Pipeline steps | 51 | 54 | 54 | Stable |
| Knowledge entries | 51 | 53 | 53 | Stable |
| Eval tests | 46 | 57 | 57+ | Growing |
| Health score | ~6/10 | 7.5/10 | 8.5/10 | Improving |

**Key improvements since Round 2**:
- Vision phase in all presets (was invisible)
- MVP methodology sections handle missing upstream artifacts
- Knowledge entries well-aligned (100% coverage, 0 unused)
- Eval system expanded (build-drift, exemption-audit, preset-exhaustiveness)
- 19 pipeline files now have Quality Criteria depth tags (was 0)

**Remaining systemic issues**:
1. Quality Criteria depth tagging incomplete (35 of 54 files)
2. `reads` field semantics undocumented (passive hint vs active dependency)
3. Implementation handoff has zero eval coverage
4. 20 knowledge entries lack Summary/Deep Guidance optimization
