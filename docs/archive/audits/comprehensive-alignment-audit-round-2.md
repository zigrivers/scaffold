# Comprehensive Pipeline Alignment Audit — Round 2

**Date**: 2026-03-28
**Scope**: 54 pipeline steps, 51 knowledge entries, 25+ commands, 3 methodology presets, 13 eval files
**Previous audit**: Round 1 (2026-03-26) — 196 findings → all resolved in v2.32.0

## Executive Summary

**Overall pipeline health**: 7.5/10 — Improved significantly from Round 1 (~6/10). The structural foundation is solid: dependency cycles are eliminated, knowledge entries all have consumers, and the eval system catches most structural regressions. However, three systemic issues reduce end-to-end AI agent success:

1. **Vision phase invisible to methodology system** — 3 pipeline steps exist outside all presets
2. **Commands lack knowledge injection** — Hand-crafted commands diverge from pipeline sources, missing domain expertise
3. **Implementation handoff bypassed** — Agent start commands don't reference the playbook/onboarding artifacts the pipeline produces

**Finding totals**: 203 findings across 8 modules

| Severity | Count | Description |
|----------|-------|-------------|
| BROKEN | 7 | Will cause failures or incorrect output |
| MISALIGNED | 38 | Exists but connections are wrong |
| MISSING | 63 | Should exist but doesn't |
| WEAK | 95 | Exists but insufficient quality |

---

## Findings by Module

### Module 1: Dependency & Data Flow Integrity

**22 findings** (0 BROKEN, 3 MISALIGNED, 6 MISSING, 13 WEAK)

The dependency graph is structurally sound (no cycles, topological sort works). The systemic issue is a gap between what `Inputs` sections document and what `reads[]` frontmatter declares — the engine uses `reads[]` to inject artifacts, so unreferenced producers are invisible.

#### MISALIGNED

| ID | Step | Description | Fix |
|----|------|-------------|-----|
| 1-M1 | platform-parity-review | Inputs references `docs/implementation-plan.md` (optional) but implementation-plan runs later (order 1210 vs 1010) — artifact cannot exist | Remove from Inputs |
| 1-M2 | review-testing | Inputs marks `docs/domain-models/` and `docs/system-architecture.md` as **required**, `reads` declared but only dep is `[tdd]`. In parallel execution, review-testing could dispatch before domain-modeling or system-architecture finish. `reads[]` does NOT enforce ordering. | Add `system-architecture` to `dependencies[]`, or demote inputs to optional |
| 1-M3 | innovate-prd | Body lists `docs/plan.md` as Expected Output but it's NOT in frontmatter `outputs[]` | Add to `outputs[]` |

#### MISSING (reads gaps)

| ID | Step | Missing reads | Fix |
|----|------|---------------|-----|
| 1-MS1 | dev-env-setup | `tdd` (references `docs/tdd-standards.md`) | Add to `reads[]` |
| 1-MS2 | project-structure | `tdd` (references `docs/tdd-standards.md`) | Add to `reads[]` |
| 1-MS3 | operations | `dev-env-setup`, `git-workflow` (references their outputs) | Add to `reads[]` |
| 1-MS4 | workflow-audit | `operations` (references `docs/operations-runbook.md`) | Add to `reads[]` |
| 1-MS5 | create-evals | `security`, `dev-env-setup` (references their outputs) | Add to `reads[]` |
| 1-MS6 | tdd | `system-architecture` (references arch/domain/ADR docs in update mode) | Add to `reads[]` |

#### WEAK (13 — optional artifacts from conditional steps not in reads)

Systemic pattern: steps reference optional artifacts from conditional steps (api-contracts, database-schema, ux-spec, design-system) in Inputs but don't declare `reads[]`. Affected steps: story-tests, create-evals, implementation-plan, implementation-playbook, security, review-security, ux-spec, review-ux, platform-parity-review, claude-md-optimization, add-e2e-testing. Also: innovate-user-stories output appears unconsumed downstream.

---

### Module 2: Methodology Scaling Coherence

**31 findings** (3 BROKEN, 6 MISALIGNED, 12 MISSING, 10 WEAK)

The MVP path is broken at the planning/finalization boundary. Vision phase is invisible to all presets.

#### BROKEN

| ID | Step | Description | Fix |
|----|------|-------------|-----|
| 2-B1 | implementation-plan | Dependencies `[tdd, operations, security, review-architecture, create-evals]` — only `tdd` enabled in MVP. Engine soft-dep behavior resolves this at runtime, but step's "required" inputs (architecture, domain models, ADRs) won't exist. | Redefine MVP behavior to work from PRD + user stories + tech stack only |
| 2-B2 | implementation-playbook | Depends on `developer-onboarding-guide` which is disabled in MVP | Same soft-dep resolution, but playbook needs explicit MVP-mode instructions |
| 2-B3 | Vision phase (3 steps) | `create-vision`, `review-vision`, `innovate-vision` missing from ALL 3 methodology presets | Add to all presets with appropriate enabled/disabled flags |

#### MISALIGNED

| ID | Step | Description |
|----|------|-------------|
| 2-M1 | All presets | Phase comments skip Phase 0 (vision) |
| 2-M2 | review-testing | Inputs marks domain-modeling and system-architecture outputs as "required" but they're only in `reads`, not `dependencies` |
| 2-M3 | story-tests | Depends on `review-architecture` (disabled in MVP, but story-tests also disabled — latent risk) |
| 2-M4 | create-evals | Depends on `story-tests` — both disabled in MVP, valid in custom (latent if user enables one without other) |
| 2-M5 | 8 steps | Quality Criteria `(mvp)` tags on steps disabled in MVP — misleading (tag means depth 1-2, not "runs in MVP preset") |
| 2-M6 | implementation-plan | MVP produces incoherent task list without architecture/domain models to decompose |

#### MISSING (12)

- **MS1**: Vision steps have no preset control (3 steps × 3 presets)
- **MS2-MS5**: 4 steps have no custom depth breakdown (`tdd`, `apply-fixes-and-freeze`, `developer-onboarding-guide`, `implementation-playbook` — all say "Scale with depth" with zero guidance)
- **MS6**: 7 validation steps share identical generic scaling (no step-specific guidance)
- **MS7**: 6 review steps use "scale passes with depth" without specifying which passes at which depth
- **MS8**: 32 steps have no depth-tagged Quality Criteria despite having multi-depth scaling
- **MS9**: No system-level documentation of what depth 1-5 means
- **MS10**: `review-vision` disabled in MVP but `create-prd` reads vision output (unreviewed vision feeds PRD)
- **MS11**: `innovate-prd`/`innovate-user-stories` — MVP says "Not applicable" but custom depth 1-2 gives instructions (contradictory)
- **MS12**: No automated validation that preset step names are exhaustive

#### WEAK (10)

- **W1**: Depth 2 almost never individually described (49 of 54 steps lump 1-2 together — effectively a 4-point scale)
- **W2**: 14 steps lump depth 4-5 together
- **W3-W4**: `review-architecture` and `review-adrs` custom scaling says "scale passes" without specifics
- **W5**: MVP path produces incomplete pipeline result (no architecture, domain models, specifications)
- **W6**: `innovate-vision` lumps depth 4-5 unlike its peer innovation steps
- **W7**: `create-evals` is a well-documented outlier — demonstrates the pattern others should follow
- **W8**: Depth tag convention inconsistent (`(mvp)`, `(deep)`, `(depth 4+)` used interchangeably)
- **W9**: Deep preset enables conditional steps without documenting how conditional evaluation works
- **W10**: `custom-defaults.yml` comment says "All steps enabled" but 3 are disabled

---

### Module 3: Mode Detection & Update Mode Completeness

**25 findings** (0 BROKEN, 5 MISALIGNED, 8 MISSING, 12 WEAK)

All steps that HAVE Update Mode Specifics are complete with all 4 required fields. The gap is that 16 pipeline steps that create documents are missing Update Mode Specifics entirely.

#### MISALIGNED (5)

| ID | Step | Description |
|----|------|-------------|
| 3-MA1 | All review steps | Commands have detailed 6-step re-review protocol; pipeline steps have 2-3 sentences |
| 3-MA2 | automated-pr-review | Pipeline checks tracking comment; command checks file existence first (more robust) |
| 3-MA3 | ai-memory-setup | Pipeline checks tracking comments; command checks directory existence only |
| 3-MA4 | platform-parity-review | Command has NO Mode Detection despite pipeline having full detection + Update Mode Specifics |
| 3-MA5 | review-vision | Minor — pipeline has Update Mode Specifics; command adds instructions at different level |

#### MISSING (8 — Update Mode Specifics blocks)

All 13 review pipeline steps are missing Update Mode Specifics (review-prd, review-user-stories, review-domain-modeling, review-adrs, review-architecture, review-testing, review-operations, review-security, review-database, review-api, review-ux, implementation-plan-review). Three finalization steps also missing (apply-fixes-and-freeze, developer-onboarding-guide, implementation-playbook) — these exist in commands but not pipeline source.

#### WEAK (12)

- **W1-W6**: Detection logic concerns (beads checks specific files, ai-memory-setup tracking comment sensitivity, automated-pr-review divergence, innovate-vision embeds in parent file, consolidation steps assume CLAUDE.md exists, add-e2e-testing checks file not in outputs)
- **W7-W9**: Preserve rules (create-prd doesn't explain enhancement markers, system-architecture doesn't mention directory structure, implementation-plan preserves wrong artifacts)
- **W10**: No automatic propagation mechanism — user must manually re-run affected steps
- **W11**: Review steps don't track upstream version (re-reviews unchanged artifacts)
- **W12**: Validation steps always run fresh (correct but no incremental mode)

---

### Module 4: Quality Criteria Assessment

**48 findings** (0 BROKEN, 6 MISALIGNED, 14 MISSING, 28 WEAK)

~60% of criteria are highly automatable (binary pass/fail). ~25% partially automatable (heuristic). ~15% inherently subjective.

#### MISALIGNED (6 — missing depth tags)

| ID | Step | Issue |
|----|------|-------|
| 4-MA1 | create-prd | All 6 criteria untagged — NFR and constraints criteria excessive for MVP |
| 4-MA2 | create-vision | All 9 criteria untagged — anti-vision, business model, competitive landscape are depth 3+ |
| 4-MA3 | user-stories | "INVEST criteria" and "max 7 AC" are deep-level for MVP's one-liner stories |
| 4-MA4 | adrs | "Alternatives with pros/cons" contradicts MVP's single-paragraph ADRs |
| 4-MA5 | innovate-prd | Missing depth tags on impact assessment criteria |
| 4-MA6 | innovate-user-stories | Same pattern as MA5 |

#### MISSING (14 — outputs with no quality criterion)

Key gaps: coding-standards (no linter config validity), project-structure (no .gitkeep scaffolding or CLAUDE.md accuracy check), dev-env-setup (no .env.example completeness), git-workflow (no CI YAML validity), create-evals (no `make eval` runs check), implementation-playbook (no test skeleton reference accuracy), apply-fixes-and-freeze (no freeze marker verification), tdd (no reference examples criterion), platform-parity-review (no fix plan), add-e2e-testing (no framework accuracy check), validation steps (no finding disposition requirement).

#### WEAK (28)

**Vague criteria** (11): create-vision has 5 subjective criteria ("concise enough to remember", "honest about strengths", "real tradeoffs", "specific traps", "specific enough to guide PRD"), coding-standards ("actionable, not vague" is meta-vague), create-prd ("explicit" undefined), innovate-prd/vision ("same standard"), developer-onboarding-guide ("key patterns" unspecified), implementation-playbook ("defined" is tautological).

**Review step inconsistencies** (10): review-domain-modeling has zero domain-specific criteria (only generic review boilerplate), review-architecture missing finding format and fix plan criterion, review-adrs missing structured finding format, review-prd limited domain-specific verification, review-user-stories and review-vision "downstream readiness confirmed" is vague, all review steps "all passes executed" is tautological.

**Testability concerns** (7): Vision criteria ("positive change", "behaviors not demographics"), user-stories ("behavior not implementation"), domain-modeling and cross-phase-consistency ("consistent terminology"), claude-md-optimization ("no verbatim repetition", "prominent patterns").

---

### Module 5: Knowledge System Alignment

**21 findings** (0 BROKEN, 3 MISALIGNED, 4 MISSING, 14 WEAK)

All 51 knowledge entries are referenced by at least one step (no orphans). 26 of 51 (51%) have Summary + Deep Guidance structure. The 10 representative step-knowledge pairings are all GOOD or ADEQUATE.

#### MISALIGNED (3)

| ID | Entry/Step | Description |
|----|------------|-------------|
| 5-MA1 | platform-parity-review | Missing `review-methodology` — only review step without it |
| 5-MA2 | operations-runbook | Topic `cicd` vs `ci-cd` used elsewhere |
| 5-MA3 | review-ux-specification | Topic `responsive` vs `responsive-design` used elsewhere |

#### MISSING (4)

| ID | Entry/Step | Description |
|----|------------|-------------|
| 5-MS1 | review-vision | No dedicated `review-vision` knowledge entry — only review step without one |
| 5-MS2 | review-vision | Missing `multi-model-review-dispatch` and `review-step-template` — all 13 other review steps have them |
| 5-MS3 | 6 validation steps | Missing `multi-model-review-dispatch` despite mentioning depth 4+ dispatch in Purpose |
| 5-MS4 | innovate-prd, innovate-user-stories, tech-stack | Missing `multi-model-review-dispatch` despite depth 4+ dispatch |

#### WEAK (14)

**Missing Summary/Deep Guidance structure**: 3 entries >300 lines without it (gap-analysis 305, review-domain-modeling 321, review-system-architecture 324). 10 review entries (227-268 lines) lack it for consistency. 7 validation entries (181-252 lines) lack it. Plus 4 individual entries (ux-specification, apply-fixes-and-freeze, prd-innovation, user-story-innovation). Minor topic inconsistency: `adr` vs `adrs`.

---

### Module 6: Command ↔ Pipeline Parity

**21 findings** (2 BROKEN, 8 MISALIGNED, 5 MISSING, 6 WEAK)

Key architectural observation: commands/ are hand-crafted, not generated by `scaffold build`. Bidirectional divergence exists — pipeline has content commands lack (knowledge, reads, methodology, explicit I/O) and commands have content pipeline lacks (detailed process instructions, examples, 7-step update protocol).

#### BROKEN (2)

| ID | Step | Description |
|----|------|-------------|
| 6-B1 | create-prd | Pipeline has vision.md detection branching (skip discovery if vision exists); command lacks it entirely |
| 6-B2 | All 15 commands | No "Domain Knowledge" sections despite pipeline knowledge-base references — commands lack the domain expertise the engine would inject |

#### MISALIGNED (8 — After This Step recommendations)

| ID | Step | Recommends | Should Recommend |
|----|------|-----------|-----------------|
| 6-M1 | create-prd | prd-gap-analysis | review-prd (direct dependent) |
| 6-M2 | tdd | project-structure | review-testing or story-tests (actual dependents) |
| 6-M3 | create-evals | operations | implementation-plan (actual dependent) |
| 6-M4 | domain-modeling | adrs | review-domain-modeling → adrs |
| 6-M5 | system-architecture | database-schema/api-contracts | review-architecture first |
| 6-M6 | traceability-matrix | decision-completeness | apply-fixes-and-freeze (both are siblings) |
| 6-M7 | security | claude-md-optimization as alternative | review-security only |
| 6-M8 | traceability-matrix | Mode Detection differs (pipeline says "always fresh", command has none) | Add explicit "always fresh" note to command |

#### MISSING (5)

- **MS1**: 13 of 15 commands missing methodology/depth note
- **MS2**: Pipeline `Inputs` sections not replicated as structured tables in commands
- **MS3**: Pipeline `Expected Outputs` sections absent from all commands
- **MS4**: Pipeline `reads` cross-references not reflected in commands
- **MS5**: Quality Criteria sections missing from 4 commands (create-prd, tdd, story-tests, create-evals)

#### WEAK (6)

Commands always produce full-depth output (architectural limitation), command update mode is more detailed than pipeline's, review-architecture Mode Detection checks different artifacts, system-architecture pipeline Mode Detection is vague, traceability-matrix Finding Disposition not in command, create-prd command has unique sections not in pipeline.

---

### Module 7: Implementation Handoff Quality

**17 findings** (2 BROKEN, 4 MISALIGNED, 6 MISSING, 5 WEAK)

The most significant systemic issue: agent start commands barely reference finalization artifacts. The pipeline invests significant effort producing onboarding guide, playbook, and evals, but implementation agents don't use them.

#### BROKEN (2)

| ID | Step | Description |
|----|------|-------------|
| 7-B1 | single/multi-agent-start/resume (4 commands) | Don't reference playbook, onboarding guide, or evals. Treats playbook as fallback alternative to plan instead of primary reference. Entire finalization phase effectively bypassed. |
| 7-B2 | new-enhancement | Never updates implementation-playbook. Playbook becomes stale after first enhancement. |

#### MISALIGNED (4)

| ID | Step | Description |
|----|------|-------------|
| 7-MA1 | Playbook knowledge | Hard-coded `make test`, `make build` etc. instead of dynamic detection from CLAUDE.md |
| 7-MA2 | Playbook inputs | 54 steps produce 40+ artifacts but playbook lists only 15 — missing ADRs, domain models, validation fix log, AI memory rules |
| 7-MA3 | Task→test→eval chain | Chain exists but is implicit — agent must discover: task → story ID → story-tests-map.md → test file → eval |
| 7-MA4 | Quality gates | Knowledge defines 6 gates, command defines per-task/per-wave/final gates — structures don't match |

#### MISSING (6)

- **MS1**: No minimum viable context definition in playbook for task types (missing: background jobs, data migrations, E2E tests, doc tasks)
- **MS2**: No error recovery guidance in onboarding guide; playbook's error recovery is depth-dependent (may be omitted at MVP)
- **MS3**: quick-task doesn't reference evals or playbook quality gates
- **MS4**: No post-pipeline playbook update path for quick-task outcomes
- **MS5**: Review artifacts (20+ files in docs/reviews/ and docs/validation/) not referenced by playbook
- **MS6**: No guidance on how ongoing commands integrate with frozen artifacts

#### WEAK (5)

single-agent-start treats playbook as fallback, developer-onboarding-guide has vague quality criteria (missing 4 of 7 knowledge-recommended sections), release/version-bump don't reference pipeline artifacts, error recovery is depth-gated (may be omitted at MVP), handoff format not enforced by quality criteria.

---

### Module 8: Meta-Eval Self-Assessment

**18 findings** (0 BROKEN, 3 MISALIGNED, 8 MISSING, 7 WEAK)

46 tests currently pass. The system has no broken evals but significant coverage gaps and several tests that pass vacuously.

#### Coverage Map

| Audit Module | Coverage Level | Covering Evals |
|---|---|---|
| 1. Dependency & Data Flow | **Strong** | dependency-ordering, data-flow, pipeline-completeness, output-consumption |
| 2. Methodology Scaling | **Weak** | prompt-quality (format only) |
| 3. Mode Detection | **Moderate** | prompt-quality, pipeline-completeness, cross-channel |
| 4. Quality Criteria | **Weak** | prompt-quality (depth tags warning-only) |
| 5. Knowledge System | **Moderate** | knowledge-quality, cross-channel, pipeline-completeness, redundancy |
| 6. Command Parity | **Moderate** | channel-parity (name only), command-structure, cross-channel |
| 7. Implementation Handoff | **Zero** | command-structure (finalization commands exempted) |

#### MISALIGNED (3 — false negative risks)

| ID | Eval | Risk |
|----|------|------|
| 8-MA1 | output-consumption | Grep-based detection: path in prose passes even if not structurally consumed |
| 8-MA2 | data-flow | Always returns success (warning-only) — 37 reads violations accumulate silently |
| 8-MA3 | command-structure | Dead-end detection prints warnings but always passes |

#### MISSING (8 — proposed new evals)

| ID | Eval | Invariant | Complexity |
|----|------|-----------|------------|
| 8-MS1 | build-drift.bats | Command files reflect current pipeline content | Medium |
| 8-MS2 | handoff-quality.bats | Finalization steps reference upstream artifacts | Medium |
| 8-MS3 | methodology-content.bats | Deep and MVP produce meaningfully different behavior | Medium |
| 8-MS4 | quality-criteria-measurability.bats | Criteria contain verifiable statements | High |
| 8-MS5 | reads-dependency-alignment (promote data-flow) | Reads match transitive dependency closure (hard gate) | Low |
| 8-MS6 | exemption-audit.bats | Exemption lists stay minimal with documented reasons | Low |
| 8-MS7 | phase-definition-sync.bats | eval_helper.bash phases match frontmatter.ts | Low |
| 8-MS8 | knowledge-injection.bats | Knowledge content appears in assembled commands | High |

#### WEAK (7)

- data-flow.bats always passes (warning-only)
- cross-channel output/Mode Detection check uses grep (semantic correctness unchecked)
- channel-parity checks names only, not content alignment
- Quality Criteria depth tags soft check (always passes)
- Update Mode Specifics check warning-only
- knowledge-quality uses line count as crude proxy
- skill-triggers hardcodes trigger phrases (brittle)
- dependency-ordering only 1-level transitivity for ordering check

#### Maintenance concerns

- **Brittle**: skill-triggers.bats (hardcoded phrases), command-structure.bats (hardcoded FINALIZATION_COMMANDS), eval_helper.bash (duplicated phase mappings)
- **Uncalled**: `validate_exempt_terminal_outputs` exists in exemptions.bash but no test invokes it

---

## Priority Matrix

### P0 — BROKEN (7 findings, fix immediately)

| ID | Module | Description | Impact |
|----|--------|-------------|--------|
| 2-B3 | Methodology | Vision phase (3 steps) missing from ALL presets | Vision steps uncontrollable |
| 2-B1 | Methodology | implementation-plan MVP dependencies unsatisfiable + required inputs absent | MVP planning broken |
| 2-B2 | Methodology | implementation-playbook MVP dependency unsatisfiable | MVP playbook broken |
| 7-B1 | Handoff | Agent start commands don't reference playbook/onboarding/evals | Finalization phase bypassed |
| 7-B2 | Handoff | new-enhancement never updates playbook | Playbook goes stale |
| 6-B1 | Parity | create-prd command missing vision.md detection | Vision ignored in command mode |
| 6-B2 | Parity | All commands missing Domain Knowledge sections | Commands lack domain expertise |

### P1 — High-impact MISALIGNED/MISSING (25 findings)

**Dependency & Data Flow** (9): 3 misaligned (review-testing required inputs race, platform-parity-review impossible input, innovate-prd missing output), 6 missing reads.

**Methodology** (6): MVP path incoherence (2-M6), depth tag confusion (2-M5), review-vision/MVP (MS10), no preset validation (MS12), contradictory innovation scaling (MS11), no depth documentation (MS9).

**Mode Detection** (2): 16 pipeline steps missing Update Mode Specifics, pipeline-command detection divergence for automated-pr-review and ai-memory-setup.

**Quality Criteria** (6): Depth tags missing on create-prd, create-vision, user-stories, adrs, innovate-prd, innovate-user-stories.

**Command Parity** (2): 8 After This Step recommendations skip review steps or recommend unrelated steps.

### P2 — Medium-impact (50+ findings)

- 32 steps with no depth-tagged Quality Criteria
- 14 missing output-to-criterion mappings
- 11 vague criteria needing measurable thresholds
- 10 review step criteria inconsistencies
- 13 optional artifact reads gaps (conditional steps)
- 9 steps missing multi-model-review-dispatch knowledge
- 25 knowledge entries missing Summary/Deep Guidance structure
- 5 command structural gaps (missing depth notes, inputs, outputs, reads, criteria)
- 8 proposed new evals

### P3 — Low-impact improvements (50+ findings)

- Depth 2 almost never individually described (cosmetic — 4-point scale works)
- Depth 4-5 lumped together in non-review steps
- 7 validation steps share generic scaling
- 3 topic inconsistencies in knowledge entries
- Review step "all passes executed" tautological criteria
- Inherently subjective criteria (vision, terminology consistency)
- Eval maintenance (brittle skill-triggers, hardcoded finalization list, duplicated phases)
- Warning-only evals that should be hard gates

---

## Recommended Actions — Work Packages

### WP1: Vision Phase & Preset Fixes (P0)
**Files**: `methodology/mvp.yml`, `methodology/deep.yml`, `methodology/custom-defaults.yml`
- Add 3 vision steps to all 3 presets
- Add Phase 0 comment sections
- Fix `custom-defaults.yml` comment accuracy (W10)
- Add preset exhaustiveness validation to `make validate` or evals

### WP2: MVP Path Coherence (P0)
**Files**: `pipeline/planning/implementation-plan.md`, `pipeline/finalization/implementation-playbook.md`, `pipeline/finalization/developer-onboarding-guide.md`
- Add explicit MVP-mode instructions to implementation-plan (work from PRD + user stories + tech stack only)
- Add explicit MVP-mode instructions to implementation-playbook
- Document system-level depth semantics in `methodology/README.md` or similar

### WP3: Implementation Handoff (P0)
**Files**: `commands/single-agent-start.md`, `commands/multi-agent-start.md`, `commands/single-agent-resume.md`, `commands/multi-agent-resume.md`, `commands/new-enhancement.md`, `commands/quick-task.md`
- Rewrite agent start commands to: read onboarding guide first, use playbook as primary (plan as fallback), reference tests/acceptance/, include `make eval`
- Add playbook update to new-enhancement After This Step
- Add eval/playbook references to quick-task
- Add frozen artifact guidance to new-enhancement and quick-task

### WP4: Dependency & Data Flow Fixes (P1)
**Files**: 11 pipeline step files
- Add missing `reads[]` entries (6 findings: dev-env-setup, project-structure, operations, workflow-audit, create-evals, tdd)
- Fix review-testing: add system-architecture to dependencies or demote inputs to optional
- Fix platform-parity-review: remove impossible input reference
- Fix innovate-prd: add docs/plan.md to outputs
- Add reads for conditional step artifacts (13 weak findings)

### WP5: Quality Criteria Depth Tags & Measurability (P1-P2)
**Files**: ~20 pipeline step files
- Add depth tags to create-prd, create-vision, user-stories, adrs, innovate-prd, innovate-user-stories (6 misaligned)
- Replace 11 vague criteria with measurable thresholds
- Add domain-specific criteria to review-domain-modeling
- Add finding format consistency to review-adrs and review-architecture
- Add fix plan criterion to platform-parity-review
- Add 14 missing output-to-criterion mappings

### WP6: Mode Detection & Update Mode Specifics (P1-P2)
**Files**: ~16 pipeline step files, 1 command file
- Add Update Mode Specifics to all 13 review pipeline steps
- Add Update Mode Specifics to 3 finalization pipeline steps
- Align detection logic for automated-pr-review and ai-memory-setup
- Add Mode Detection to platform-parity-review command

### WP7: Command-Pipeline Alignment (P1-P2)
**Files**: ~15 command files
- Fix 8 After This Step recommendations (add review steps, fix sibling confusion)
- Add vision.md detection to create-prd command
- Add methodology/depth notes to 13 commands
- Add structured Input tables and Output lists
- Add Quality Criteria sections to 4 commands missing them
- Consider running `scaffold build` to inject knowledge

### WP8: Knowledge System Gaps (P2)
**Files**: ~10 knowledge entries, ~10 pipeline step files
- Create `knowledge/review/review-vision.md`
- Add `multi-model-review-dispatch` to 9 steps (6 validation + 2 innovation + tech-stack)
- Add `review-methodology` to platform-parity-review
- Fix 3 topic inconsistencies (cicd→ci-cd, responsive→responsive-design, adrs→adr)
- Add Summary/Deep Guidance to 3 entries >300 lines

### WP9: Methodology Scaling Content (P2-P3)
**Files**: ~25 pipeline step files
- Add custom depth breakdowns to 4 finalization/foundation steps
- Add step-specific scaling to 7 validation steps (replace generic copy-paste)
- Specify which review passes run at each depth for 6 review steps
- Resolve innovate-prd/innovate-user-stories MVP vs custom contradiction

### WP10: Eval System Hardening (P2-P3)
**Files**: `tests/evals/` directory
- Promote data-flow.bats from warning-only to hard gate (with exemption list)
- Add `validate_exempt_terminal_outputs` call to an existing test
- Create 3 low-complexity evals: reads-dependency-alignment, exemption-audit, phase-definition-sync
- Create 3 medium-complexity evals: build-drift, handoff-quality, methodology-content
- Derive FINALIZATION_COMMANDS dynamically instead of hardcoding
- Fix eval_helper.bash phase duplication concern

---

## Proposed New Evals (from Module 8)

| Eval | Invariant | Catches | Complexity | Priority |
|------|-----------|---------|------------|----------|
| reads-dependency-alignment | Reads match transitive dep closure | Race conditions in parallel execution | Low | High |
| exemption-audit | Exemption lists stay minimal | Over-broad exemptions hiding issues | Low | High |
| phase-definition-sync | eval_helper phases match frontmatter.ts | Phase additions breaking evals silently | Low | High |
| build-drift | Commands reflect pipeline content | Stale commands after pipeline edits | Medium | Medium |
| handoff-quality | Finalization steps reference upstream | Incomplete implementation handoff | Medium | Medium |
| methodology-content | Deep/MVP produce different behavior | Methodology selection meaningless | Medium | Medium |
| quality-criteria-measurability | Criteria are verifiable statements | Vague criteria agents can't self-assess | High | Low |
| knowledge-injection | Knowledge appears in assembled commands | Commands lacking domain expertise | High | Low |

---

## Comparison with Round 1

| Dimension | Round 1 (v2.31.0) | Round 2 (v2.33.0) | Delta |
|-----------|-------------------|-------------------|-------|
| Total findings | 196 | 203 | +7 |
| BROKEN | 21 | 7 | -14 (67% reduction) |
| MISALIGNED | 52 | 38 | -14 (27% reduction) |
| MISSING | 50 | 63 | +13 (deeper audit) |
| WEAK | 73 | 95 | +22 (higher bar) |
| Dependency cycles | Present | None | Fixed |
| Knowledge orphans | Present | None | Fixed |
| Eval coverage | 39 tests | 46 tests | +7 |
| Soft-dep validation | None | Implemented | New |

The increase in MISSING and WEAK findings reflects a higher audit bar (Round 2 examined methodology content quality, depth tag completeness, and command structural parity more deeply), not regression. The BROKEN count dropped by 67%, confirming Round 1 fixes were effective. The remaining 7 BROKEN findings are in areas Round 1 didn't fully address (vision phase presets, handoff commands, command knowledge injection).
