# Comprehensive Pipeline Alignment Audit

<!-- scaffold:comprehensive-alignment-audit v1 2026-03-28 -->

## Executive Summary

**Audit date:** 2026-03-28
**Scope:** All 51 pipeline steps, 48 knowledge entries, 50+ commands, 3 methodology presets, 10 eval files (39 tests)

### Overall Pipeline Health: B-

The scaffold pipeline is structurally sound with strong dependency graph validation, comprehensive knowledge coverage, and well-designed finalization steps. However, several systemic issues reduce confidence in end-to-end AI agent execution:

1. **The MVP path is unrunnable** — `implementation-plan` and `implementation-playbook` are enabled in MVP but their hard dependencies are disabled
2. **5 pipeline steps have broken dependency chains** — `review-testing`, `operations`, and `security` require artifacts from steps they don't formally depend on
3. **All 7 validation steps share copy-paste quality criteria** — agents cannot self-assess against "analysis is comprehensive"
4. **Commands are locked to depth-5** — no methodology scaling in any slash command, and no knowledge base injection
5. **Mode Detection diverges between pipeline and commands** — 3 commands entirely omit their pipeline's mode detection, and the Update Mode Specifics schema differs systematically

### Aggregate Finding Counts

| Severity | Mod 1 | Mod 2 | Mod 3 | Mod 4 | Mod 5 | Mod 6 | Mod 7 | Mod 8 | Total |
|----------|-------|-------|-------|-------|-------|-------|-------|-------|-------|
| BROKEN | 5 | 2 | 7 | 4 | 0 | 2 | 0 | 1 | **21** |
| MISALIGNED | 8 | 4 | 8 | 12 | 2 | 14 | 2 | 2 | **52** |
| MISSING | 6 | 2 | 12 | 8 | 2 | 8 | 4 | 8 | **50** |
| WEAK | 4 | 3 | 9 | 23 | 14 | 7 | 6 | 7 | **73** |
| **Total** | **23** | **11** | **36** | **47** | **18** | **31** | **12** | **18** | **196** |

---

## Module 1: Dependency & Data Flow Integrity

**Question:** Does every step receive what it needs and produce what downstream steps expect?

### BROKEN

| ID | Step | Issue | Fix |
|----|------|-------|-----|
| B1-1 | `review-testing` | Requires `docs/domain-models/` and `docs/system-architecture.md` but dependency chain (`tdd -> coding-standards -> tech-stack`) provides neither | Add `reads: [domain-modeling, system-architecture]` |
| B1-2 | `review-testing` | Same as above for `docs/system-architecture.md` | (covered by B1-1 fix) |
| B1-3 | `operations` | Requires `docs/system-architecture.md` and `docs/adrs/` — no path to either | Add `reads: [system-architecture, adrs]` |
| B1-4 | `operations` | Same step, second missing artifact | (covered by B1-3 fix) |
| B1-5 | `security` | Requires `docs/system-architecture.md` — no path through `review-operations -> operations -> review-testing -> tdd` | Add `reads: [system-architecture]` |

### MISSING

| ID | Step | Issue | Fix |
|----|------|-------|-----|
| N1-1 | `claude-md-optimization` | Requires `docs/plan.md` and `docs/tdd-standards.md` — not in transitive chain from `git-workflow` | Add `reads: [create-prd, tdd]` |
| N1-2 | `automated-pr-review` | Requires `docs/tdd-standards.md` — no path to `tdd` | Add `reads: [tdd]` |
| N1-3 | `design-system` | Requires `docs/plan.md` — no path to `create-prd` | Add `reads: [create-prd]` |

### MISALIGNED

| ID | Step | Issue |
|----|------|-------|
| M1-1 | `add-e2e-testing` | `tdd` in both `dependencies` and `reads` (redundant) |
| M1-2 | `create-evals` | `story-tests` in both `dependencies` and `reads` (redundant) |
| M1-3 | `system-architecture` | `reads: [create-prd]` is redundant — transitively reachable |
| M1-4 | `claude-md-optimization` | Sole dependency `[git-workflow]` doesn't cover all required inputs |
| M1-5 | `workflow-audit` | Optional inputs from quality phase undeclared |

### WEAK

| ID | Step | Issue |
|----|------|-------|
| W1-1 | `platform-parity-review` | Depends on 3 conditional steps (`review-database`, `review-api`, `review-ux`) — if skipped, step may be blocked |
| W1-2 | `implementation-plan` | Inherits broken dependency chains from `operations` and `security` |
| W1-3 | `user-stories` | May race with sibling `innovate-prd` — both depend on `review-prd` with no ordering |
| W1-4 | `domain-modeling` | May race with sibling `innovate-user-stories` |

### Positive Findings

- All artifact paths are consistently referenced (no path mismatches like `docs/plan.md` vs `docs/prd.md`)
- All terminal outputs are genuinely human-facing — no orphaned outputs
- The core dependency DAG (phases 1-8) is well-structured

---

## Module 2: Methodology Scaling Coherence

**Question:** Does each depth level produce meaningfully different output, and do presets correctly control the pipeline?

### BROKEN

| ID | Issue | Impact |
|----|-------|--------|
| B2-1 | **MVP preset has broken dependency chains.** `implementation-plan` (enabled) depends on `operations`, `security`, `review-architecture`, `create-evals` — all disabled in MVP. `implementation-playbook` (enabled) depends on `developer-onboarding-guide` -> `apply-fixes-and-freeze` -> 7 validation steps — all disabled. | The MVP pipeline is unrunnable end-to-end under strict dependency enforcement |
| B2-2 | **3 review steps have malformed `mvp` bullets.** In `review-ux`, `review-operations`, `review-security`, the `**mvp**` line is indented as continuation of `**deep**`, not a separate bullet. Parsers extracting methodology bullets will miss them. | MVP behavior for these 3 steps is invisible to automated processing |

### MISALIGNED

| ID | Issue |
|----|-------|
| M2-1 | **96% of steps lump at least two depth levels.** Only `review-user-stories` and `story-tests` define all 5 depths individually. The 5-level scale is misleading when most steps treat depths 1-2 (or 1-3) identically. |
| M2-2 | **3 steps have conditional drift.** `innovate-prd`, `innovate-user-stories`, `automated-pr-review` have `conditional: "if-needed"` in pipeline but no conditional flag in `custom-defaults.yml`. |
| M2-3 | **Innovation steps have non-monotonic depth guidance.** Depth 1-2 says "not typically enabled" (vague discouragement) rather than providing actionable output definition. |
| M2-4 | **MVP artifact chain is incomplete.** MVP skips `git-workflow` — no CI, no branching strategy, no PR template. Yet `implementation-playbook` references git workflow. |

### MISSING

| ID | Issue |
|----|-------|
| N2-1 | **No "standard" preset.** Only `mvp` (depth 1), `custom-defaults` (depth 3), and `deep` (depth 5). The `custom-defaults` name implies user customization, not a recommended middle ground. |
| N2-2 | **No preset-level dependency coherence validation.** The preset loader validates step names and field formats but does NOT validate that enabled steps have their dependencies also enabled. |

### WEAK

| ID | Issue |
|----|-------|
| W2-1 | **4 steps have zero depth guidance.** `tdd`, `implementation-playbook`, `developer-onboarding-guide`, `apply-fixes-and-freeze` all say only "Scale detail with depth." |
| W2-2 | **15 steps lump depths 1-3.** All 7 validation + 8 generic review steps say "Depth 1-3: scale thoroughness with depth" with no concrete differentiation. |
| W2-3 | **Only 1 step (`create-evals`) uses `(mvp)`/`(deep)` tags in Quality Criteria.** The remaining 50 steps have untagged criteria. |

---

## Module 3: Mode Detection & Update Mode Completeness

**Question:** Can an AI agent correctly detect fresh vs update mode, and does update mode preserve the right things?

### BROKEN

| ID | Issue | Files |
|----|-------|-------|
| B3-1 | `system-architecture` pipeline uses vague "If outputs already exist" instead of naming `docs/system-architecture.md` | `pipeline/architecture/system-architecture.md` |
| B3-2 | `apply-fixes-and-freeze` pipeline says "Not applicable" but command has full update mode with `docs/validation/fix-log.md` detection | Pipeline vs command disagree fundamentally |
| B3-3 | `developer-onboarding-guide` pipeline has stub "Update mode if guide exists" — no file path, no procedure | `pipeline/finalization/developer-onboarding-guide.md` |
| B3-4 | `implementation-playbook` pipeline has stub "Update mode if playbook exists" | `pipeline/finalization/implementation-playbook.md` |
| B3-5 | `claude-md-optimization` command entirely omits pipeline's mode detection logic | `commands/claude-md-optimization.md` |
| B3-6 | `workflow-audit` command entirely omits pipeline's mode detection logic | `commands/workflow-audit.md` |
| B3-7 | Validation step commands don't instruct "overwrite previous" — an agent re-running validation may merge with stale findings | All 7 validation commands |

### MISALIGNED

| ID | Issue |
|----|-------|
| M3-1 | **Systematic schema difference.** Pipeline Update Mode Specifics uses (Detect, Preserve, Triggers, Conflict resolution). Commands use (Primary output, Preserve, Related docs, Special rules). "Triggers for update" is entirely lost in commands. |
| M3-2-7 | `apply-fixes-and-freeze`, `developer-onboarding-guide`, `implementation-playbook`, `platform-parity-review`, `claude-md-optimization`, `workflow-audit` all have pipeline/command Mode Detection mismatches |
| M3-8 | All 12 review commands expand the pipeline's terse "Re-review mode if previous review exists" into detailed 6-step procedures — pipeline is not the source of truth |

### MISSING

| ID | Issue |
|----|-------|
| N3-1 | **All 12 review steps lack Update Mode Specifics** in pipeline — they create output documents and support re-review mode but have no structured preserve rules |
| N3-2 | `platform-parity-review` lacks Update Mode Specifics anywhere |
| N3-3 | `add-e2e-testing` lacks Update Mode Specifics in pipeline (command has it) |
| N3-4 | **No automated cascade detection.** Every step must be manually re-run; no mechanism detects which downstream steps are stale when an upstream artifact changes |
| N3-5 | Consolidation steps have no upstream change triggers |

### WEAK

| ID | Issue |
|----|-------|
| W3-1 | `ai-memory-setup` checks directory existence (`.claude/rules/`) — false positive if directory exists for other reasons |
| W3-2 | `beads` detects via `.beads/` directory — could be from incomplete previous setup |
| W3-3 | `automated-pr-review` detects via `AGENTS.md` — standard GitHub file for Copilot agents |
| W3-4 | `add-e2e-testing` command adds `tests/screenshots/` as detection path beyond pipeline |
| W3-5-7 | Pipeline preserve rules for `create-prd`, `user-stories`, `implementation-plan` are less protective than their command counterparts |

---

## Module 4: Quality Criteria Assessment

**Question:** Are Quality Criteria specific enough that an AI agent can self-assess pass/fail?

### BROKEN

| ID | Issue | Impact |
|----|-------|--------|
| B4-1 | **All 7 validation steps share identical generic criteria** instead of step-specific ones. All say "Analysis is comprehensive (not superficial)" and "Findings are actionable." No criterion references the specific analysis each step performs. | Agents cannot self-assess against "comprehensive" — the quality gate is a no-op |
| B4-2 | `traceability-matrix` has two additional criteria (AC->test, test->task) but misses PRD->story, story->domain, domain->architecture links from its Purpose | Half the traceability chain is unchecked |
| B4-3 | `critical-path-walkthrough` Purpose says to use acceptance criteria as correctness baseline but Quality Criteria doesn't require it | Core methodology not enforced |
| B4-4 | `review-operations` criterion "Dev environment parity assessed" is misplaced — not mentioned in operations step | Leaked from another concern area |

### MISALIGNED (12 findings)

Key items:
- `tech-stack` criterion "Stack optimizes for AI familiarity, convention over configuration..." — 5 desiderata with no thresholds
- `operations` has 12 criteria but no depth tags — MVP is "deploy + monitoring + rollback" but all 12 apply
- `security` has overlapping/redundant criteria (two nearly identical secrets management items)
- `design-system` criterion "Typography scale is consistent and readable" — no objective threshold
- `coding-standards` criterion "No aspirational standards" — agent cannot distinguish aspirational from enforceable
- `claude-md-optimization` criterion "agent can skim in 30 seconds" — unmeasurable

### MISSING (8 findings)

Key items:
- `innovate-prd`/`innovate-user-stories` lack criterion for documenting user approval
- `add-e2e-testing` lacks criteria for CLAUDE.md/tdd-standards documentation updates
- All 7 validation steps lack minimum scope criteria (no floor on items examined)
- `project-structure` lacks criterion for CLAUDE.md Quick Reference update

### WEAK (23 findings)

Systemic vague language patterns:
- **"comprehensive"** — 8 occurrences across validation steps (no threshold)
- **"well-structured"/"consistent"** — undefined structural definitions
- **"downstream readiness confirmed"** — repeated in 5 review steps, never defines "ready"
- **"thorough"** — implied but not defined in review depth context
- **"justified"** — domain-modeling aggregate boundaries (self-assessed tautology)

### Depth-Tagging Gap

Only `create-evals` uses `(mvp)`/`(deep)` tags. Steps needing them most:
- `operations` (8 of 12 criteria are deep-only)
- `security` (6 of 11 criteria are deep-only)
- `api-contracts` (pagination, idempotency — depth 3+ only)
- `design-system` (dark mode, responsive — deep only)

### Eval Automation Potential

~40% of criteria could be fully automated (file existence, section checks, cross-references, format compliance). ~25% partially automated. ~35% inherently subjective.

---

## Module 5: Knowledge System Alignment

**Question:** Does each step get the right knowledge, and does the knowledge cover what the step needs?

### MISALIGNED

| ID | Issue | Impact |
|----|-------|--------|
| M5-1 | `multi-model-review-dispatch` knowledge (250 lines) is orphaned — not referenced by any of the 14 steps that perform multi-model dispatch at depth 4+ | Multi-model dispatch guidance is unavailable to the steps that need it |
| M5-2 | `review-step-template` knowledge (247 lines) is orphaned — not referenced by any of the 13 review steps that should follow its structural template | Severity taxonomy, resolution workflow not available to review steps |

### MISSING

| ID | Issue |
|----|-------|
| N5-1 | No git workflow knowledge entry exists. `git-workflow` step references `dev-environment` which doesn't cover branching, commits, or PR workflows. |
| N5-2 | No automated review tooling knowledge entry exists. `automated-pr-review` references `review-methodology` which covers manual document review, not CI/CD review automation. |

### WEAK (14 findings)

Key items:
- **10 knowledge entries > 300 lines lack Summary/Deep Guidance split** — full body is injected, wasting context. Largest: `security-best-practices` (527 lines), `api-design` (505 lines), `design-system-tokens` (465 lines)
- `git-workflow` assigned `dev-environment` knowledge — tangentially related
- `automated-pr-review` assigned `review-methodology` — wrong domain
- Topic name inconsistencies: `data-flow` vs `data-flows`, `naming` vs `naming-conventions`

### Positive Findings

- 46 of 48 knowledge entries are referenced by at least one pipeline step
- All 10 representative steps have well-aligned primary knowledge
- 14 entries already have proper Summary/Deep Guidance structure
- Knowledge system has strong eval coverage (best-covered dimension)

---

## Module 6: Command ↔ Pipeline Parity

**Question:** Do slash commands produce equivalent results to CLI execution?

### BROKEN

| ID | Issue |
|----|-------|
| B6-1 | `apply-fixes-and-freeze` — pipeline says "Mode Detection N/A" but command has full update mode |
| B6-2 | `database-schema` — pipeline marks as `conditional: "if-needed"` but command has no indication of conditionality |

### Systemic Issues (all 15 audited pairs)

| Issue | Scope | Severity |
|-------|-------|----------|
| **No depth handling in any command** — always produce depth-5 output | All commands | MISSING |
| **No knowledge base injection** — 16 referenced KB entries never reach commands | All commands | MISSING |
| **Quality criteria diverge** in both directions — sometimes pipeline richer, sometimes command richer | 9 of 15 pairs | MISALIGNED |
| **Backward dependencies not surfaced** — commands don't warn about prerequisites | 4+ commands | WEAK |

### Per-Pair Quality Criteria Divergence

| Step | Pipeline Count | Command Count | Direction |
|------|---------------|---------------|-----------|
| `operations` | 13 | 9 | Pipeline richer |
| `security` | 12 | 8 | Pipeline richer |
| `system-architecture` | 5 | 8 | Command richer |
| `database-schema` | 5 | 8 | Command richer |
| `apply-fixes-and-freeze` | 4 | 8 | Command richer |

### Positive Findings

- Mode Detection artifacts match in 14 of 15 pairs
- After This Step recommendations generally align with dependency graph
- Output file paths are consistent between pipeline and commands

---

## Module 7: Implementation Handoff Quality

**Question:** When the pipeline is complete, do implementation agents have everything they need?

### MISALIGNED

| ID | Issue |
|----|-------|
| M7-1 | `new-enhancement` command creates new user stories but does NOT regenerate test skeletons (`tests/acceptance/`) or update `docs/story-tests-map.md`. Does not suggest running `story-tests`. |
| M7-2 | Playbook knowledge base lists 5 quality gates but omits `make eval` despite pipeline step mandating it |

### MISSING

| ID | Issue |
|----|-------|
| N7-1 | **No task-type minimum-context taxonomy.** No mapping from task types (API, UI, migration, infrastructure, bug fix) to their required document sets. Agents depend entirely on per-task context blocks being correct. |
| N7-2 | **No explicit error recovery process** for quality gate failures (test failures, CI failures, spec gap discovery during implementation) |
| N7-3 | **No E2E test gate** in quality gates despite pipeline creating Playwright/Maestro infrastructure |
| N7-4 | **No reference to onboarding guide from playbook** — agents should read it first for project context |

### WEAK

| ID | Issue |
|----|-------|
| W7-1 | Specification artifacts (`database-schema`, `api-contracts`, `ux-spec`, `design-system`, `security-review`, `operations-runbook`) not in playbook's input list |
| W7-2 | Task-to-eval mapping is collective (`make eval`), not per-task |
| W7-3 | Test skeleton references in tasks are "where applicable" not mandatory |
| W7-4 | Playbook knowledge base uses hardcoded `npm` commands — not stack-agnostic |
| W7-5 | PRD and user-stories not in playbook's explicit input list |
| W7-6 | CLAUDE.md error recovery content is not guaranteed at MVP depth |

### Positive Findings

- The story-tests step creates direct, traceable links from ACs to tagged test skeletons
- The eval system provides automated quality verification
- Inter-agent handoff format is well-defined with 5 clear categories
- `quick-task` and `release` commands integrate well with pipeline artifacts

---

## Module 8: Meta-Eval Self-Assessment

**Question:** Do our 39 meta-evals catch the alignment dimensions above?

### BROKEN

| ID | Issue |
|----|-------|
| B8-1 | **`cross-channel.bats` test 2 is a no-op.** The After This Step / dependency alignment check performs no assertions — the inner loop reads data but never asserts anything. Always passes. |

### MISALIGNED

| ID | Issue |
|----|-------|
| M8-1 | `eval-spec.md` specifies phrase-overlap detection for Eval 6 (Redundancy), but `redundancy.bats` only checks structural properties |
| M8-2 | `eval-spec.md` specifies command `long-description` as required, but `command-structure.bats` only checks `description` |

### Coverage by Dimension

| Audit Module | Eval Coverage | Verdict |
|-------------|---------------|---------|
| 1. Dependency & Data Flow | 6 tests (structural deps strong; semantic data flow missing) | MODERATE |
| 2. Methodology Scaling | 1 test (existence only) | **WEAK** |
| 3. Mode Detection | 3 tests (Update Mode Specifics missing) | MODERATE |
| 4. Quality Criteria | 2 tests (methodology tag alignment missing) | **WEAK** |
| 5. Knowledge System | 9 tests | **STRONG** |
| 6. Command Parity | 8 tests (description consistency missing) | STRONG |
| 7. Implementation Handoff | 4 tests (readiness signal missing) | MODERATE |

### False Negative Risks

- `output-consumption.bats` — 9 terminal-exempt steps + 6 path patterns create large blind spots
- `pipeline-completeness.bats` — conditional documentation check uses overly broad regex
- `command-structure.bats` — numbered-list fallback means any numbered list passes Process check
- `prompt-quality.bats` — minimum 2-line bar is trivially satisfiable
- `knowledge-quality.bats` — `<!-- eval-wip -->` escape hatch has no expiry

### Proposed New Evals (Priority Order)

| # | Eval | Catches | Complexity |
|---|------|---------|------------|
| P1 | **Fix `cross-channel.bats` test 2** — add actual assertions | No-op test providing false confidence | Small |
| P2 | Methodology Scaling format consistency (deep/mvp/custom present) | Empty or malformed scaling sections | Small |
| P3 | Quality Criteria methodology tag alignment (`(mvp)`/`(deep)` markers) | Criteria that don't differentiate by depth | Small |
| P4 | Update Mode Specifics companion check | Steps with Mode Detection but no Update Mode Specifics | Small |
| P5 | Data flow input availability (`reads` in transitive dep closure) | Steps reading artifacts they don't formally depend on | Medium |
| P6 | Orphan knowledge entry detection | Orphaned entries wasting context tokens | Small |
| P7 | Command description consistency | Pipeline/command descriptions drifting apart | Medium |
| P8 | After This Step dead-end detection | Commands that leave users stranded | Small |
| P9 | WIP knowledge file aging (30-day expiry via git blame) | Permanent eval-wip escape hatch abuse | Medium |

### Maintenance Recommendations

- **Extract exempt lists to shared config** — 4+ lists scattered across 3 files
- **Add self-validating exempt lists** — verify entries actually exist as commands/steps
- **Derive skill trigger tests from structured data** instead of hardcoded phrases

---

## Priority Matrix

All findings ranked by impact on implementation agent success.

### P0 — Will Cause Failures (fix immediately)

| # | Module | Finding | Fix |
|---|--------|---------|-----|
| 1 | M1 | `review-testing`, `operations`, `security` have broken dependency chains — missing reads for `system-architecture`, `domain-modeling`, `adrs` | Add `reads` fields to 3 pipeline files |
| 2 | M2 | MVP preset enables `implementation-plan`/`implementation-playbook` but disables their hard dependencies | Either enable minimal chain for MVP or add soft-dependency mechanism |
| 3 | M4 | All 7 validation steps share copy-paste generic criteria — agents cannot self-assess | Write step-specific criteria derived from each step's Purpose |
| 4 | M8 | `cross-channel.bats` test 2 is a no-op — performs no assertions | Add actual assertion inside the inner loop |
| 5 | M2 | 3 review steps have malformed `mvp` bullets (indented under `deep`) | Fix bullet indentation in `review-ux`, `review-operations`, `review-security` |

### P1 — Reduces Quality Significantly (fix soon)

| # | Module | Finding | Fix |
|---|--------|---------|-----|
| 6 | M3 | `claude-md-optimization` and `workflow-audit` commands omit pipeline's mode detection | Add Mode Detection sections to both commands |
| 7 | M3 | Pipeline/command Update Mode Specifics use different field schemas | Standardize on merged schema (keep all fields from both) |
| 8 | M3 | 12 review steps lack Update Mode Specifics in pipeline | Add structured preserve rules to all review steps |
| 9 | M3 | `apply-fixes-and-freeze` pipeline says "N/A" but command has update mode | Update pipeline to acknowledge update mode |
| 10 | M5 | `multi-model-review-dispatch` and `review-step-template` knowledge entries are orphaned | Wire to all 13 review steps + traceability-matrix |
| 11 | M6 | Quality criteria diverge between pipeline and commands (9 of 15 pairs) | Reconcile — make pipeline the source of truth, regenerate commands |
| 12 | M7 | Playbook knowledge base omits `make eval` from quality gates | Add eval gate to knowledge base template |
| 13 | M7 | No task-type minimum-context taxonomy | Add to playbook knowledge base and pipeline step |
| 14 | M1 | `claude-md-optimization`, `automated-pr-review`, `design-system` missing formal reads | Add `reads` fields to 3 pipeline files |

### P2 — Reduces Quality Moderately (address in next cycle)

| # | Module | Finding | Fix |
|---|--------|---------|-----|
| 15 | M4 | `operations` and `security` criteria lack depth tags (8+ criteria are deep-only) | Add `(mvp)`/`(deep)` tags |
| 16 | M4 | Review steps split into 3 quality tiers — Pattern C steps much weaker | Normalize all to Pattern A template |
| 17 | M2 | 4 steps have zero depth guidance ("Scale detail with depth") | Expand to describe per-level output |
| 18 | M2 | 15 steps lump depths 1-3 identically | Define distinct behavior for at least depth 1 vs 3 |
| 19 | M5 | 10 knowledge entries > 300 lines lack Summary/Deep Guidance split | Add structure to largest entries first |
| 20 | M5 | No git workflow knowledge entry; no automated review knowledge entry | Create 2 new knowledge entries |
| 21 | M7 | `new-enhancement` doesn't regenerate test skeletons | Add `story-tests` to follow-up suggestions |
| 22 | M7 | Specification artifacts not in playbook's input list | Add as optional inputs |
| 23 | M3 | Pipeline stubs for `developer-onboarding-guide` and `implementation-playbook` Mode Detection | Expand to match command detail |
| 24 | M6 | `database-schema` command has no conditional indicator despite pipeline `if-needed` | Add conditionality guidance to command |

### P3 — Nice to Have (backlog)

| # | Module | Finding | Fix |
|---|--------|---------|-----|
| 25 | M4 | Replace 23 vague criteria terms ("comprehensive", "thorough", "justified") with measurable thresholds | Rewrite criteria per Module 4 suggestions |
| 26 | M2 | No "standard" preset (only mvp/custom/deep) | Rename `custom-defaults` or add `standard` preset |
| 27 | M2 | No preset dependency coherence validation in loader | Add validation to `preset-loader.ts` |
| 28 | M5 | Topic name inconsistencies (`data-flow` vs `data-flows`) | Normalize topic names |
| 29 | M1 | Redundant `reads` entries in `add-e2e-testing` and `create-evals` | Remove duplicate entries |
| 30 | M7 | No error recovery documentation for quality gate failures | Add to playbook knowledge base |
| 31 | M8 | Prompt quality minimum bar is 2 lines (trivially satisfiable) | Raise to 4+ lines |
| 32 | M8 | Exempt list maintenance scattered across 3+ files | Consolidate to shared config |
| 33 | M6 | Commands locked to depth-5 with no methodology scaling | By-design for slash commands, but document the limitation |
| 34 | M6 | Knowledge base entries never injected into commands | By-design for pre-rendered commands, but consider embedding summaries |

---

## Recommended Actions

### Work Package 1: Fix Broken Dependency Chains (P0, ~30 min)

**Files to edit:**
- `pipeline/quality/review-testing.md` — add `reads: [domain-modeling, system-architecture]`
- `pipeline/quality/operations.md` — add `reads: [system-architecture, adrs]`
- `pipeline/quality/security.md` — add `reads: [system-architecture]`
- `pipeline/consolidation/claude-md-optimization.md` — add `reads: [create-prd, tdd]`
- `pipeline/environment/automated-pr-review.md` — add `reads: [tdd]`
- `pipeline/environment/design-system.md` — add `reads: [create-prd]`

### Work Package 2: Fix MVP Preset (P0, ~1 hr)

**Options (pick one):**
- **Option A**: Enable minimal dependency chain for MVP: `git-workflow`, `review-architecture`, `operations`, `security`, `create-evals`, `apply-fixes-and-freeze`, `developer-onboarding-guide` (7 additional steps, all at depth 1)
- **Option B**: Add soft-dependency support to the engine — when a dependency is disabled, skip it rather than blocking
- **Option C**: Create MVP-specific dependency overrides that bypass deep-only requirements

**Also fix:**
- `methodology/mvp.yml` — whatever option is chosen
- `src/core/assembly/preset-loader.ts` — add dependency coherence validation

### Work Package 3: Rewrite Validation Step Quality Criteria (P0, ~2 hrs)

**Files to edit:** All 7 validation step files in `pipeline/validation/`

Each step needs criteria derived from its Purpose. Examples:
- `traceability-matrix`: "Every PRD requirement traces to >= 1 user story", "Every user story traces to >= 1 task", "No orphan items in either direction"
- `dependency-graph-validation`: "Graph verified as acyclic", "Every task dependency is present in the graph"
- `scope-creep-check`: "Every user story traces back to a PRD feature", "Items beyond PRD scope flagged with disposition"

### Work Package 4: Fix Mode Detection Mismatches (P1, ~2 hrs)

**Files to edit:**
- `commands/claude-md-optimization.md` — add Mode Detection section
- `commands/workflow-audit.md` — add Mode Detection section
- `pipeline/finalization/apply-fixes-and-freeze.md` — acknowledge update mode
- `pipeline/finalization/developer-onboarding-guide.md` — expand Mode Detection stub
- `pipeline/finalization/implementation-playbook.md` — expand Mode Detection stub
- `pipeline/specification/review-ux.md` — fix malformed mvp bullet
- `pipeline/quality/review-operations.md` — fix malformed mvp bullet
- `pipeline/quality/review-security.md` — fix malformed mvp bullet

### Work Package 5: Wire Orphaned Knowledge (P1, ~1 hr)

**Files to edit:**
- All 13 review step pipeline files — add `multi-model-review-dispatch` and `review-step-template` to `knowledge-base`
- `pipeline/validation/traceability-matrix.md` — add `multi-model-review-dispatch`
- Create `knowledge/core/git-workflow-patterns.md`
- Create `knowledge/environment/automated-review-tooling.md`

### Work Package 6: Fix Meta-Eval No-Op (P0, ~30 min)

**File to edit:** `tests/evals/cross-channel.bats` — add actual assertion inside the After This Step / dependency alignment inner loop

### Work Package 7: Add Missing Evals (P2, ~3 hrs)

**New/modified files:**
- `tests/evals/prompt-quality.bats` — add methodology scaling format + quality criteria tag alignment tests
- `tests/evals/pipeline-completeness.bats` — add Update Mode Specifics companion check
- `tests/evals/data-flow.bats` (new) — transitive dependency closure validation for `reads`
- `tests/evals/knowledge-quality.bats` — add orphan detection + WIP aging

### Work Package 8: Reconcile Quality Criteria (P1-P2, ~4 hrs)

**Scope:** Make pipeline the source of truth for quality criteria, then regenerate commands.
- Add `(mvp)`/`(deep)` tags to `operations`, `security`, `api-contracts`, `database-schema`, `ux-spec`, `design-system`, `system-architecture`, `domain-modeling`, `implementation-plan`
- Normalize all review steps to Pattern A template (passes + findings + fix plan + revalidation + readiness)
- Reconcile per-step criteria counts between pipeline and commands

### Work Package 9: Implementation Handoff Improvements (P1-P2, ~2 hrs)

- Add task-type minimum-context taxonomy to `knowledge/finalization/implementation-playbook.md`
- Add `make eval` as Gate 6 in playbook knowledge base
- Add specification artifacts as optional inputs to playbook pipeline step
- Add `story-tests` to `new-enhancement` command's follow-up suggestions
- Add `docs/onboarding-guide.md` to playbook's input list

---

## Proposed New Evals

| # | Name | Invariant | File | Complexity |
|---|------|-----------|------|------------|
| 1 | Fix cross-channel dep alignment | After This Step targets match dependency graph | `cross-channel.bats` (fix existing) | Small |
| 2 | Methodology scaling format | Every step has `deep`/`mvp`/`custom` entries | `prompt-quality.bats` (extend) | Small |
| 3 | Quality criteria depth tags | Criteria have `(mvp)`/`(deep)` markers | `prompt-quality.bats` (extend) | Small |
| 4 | Update Mode Specifics companion | Mode Detection implies Update Mode Specifics exists | `pipeline-completeness.bats` (extend) | Small |
| 5 | Data flow input availability | `reads` entries in transitive dep closure | `data-flow.bats` (new) | Medium |
| 6 | Orphan knowledge detection | Every KB entry referenced by >= 1 step | `knowledge-quality.bats` (extend) | Small |
| 7 | Command description consistency | Command description matches pipeline step | `channel-parity.bats` (extend) | Medium |
| 8 | After This Step dead-ends | Non-finalization commands have next-step refs | `command-structure.bats` (extend) | Small |
| 9 | WIP knowledge aging | No `eval-wip` marker older than 30 days | `knowledge-quality.bats` (extend) | Medium |
