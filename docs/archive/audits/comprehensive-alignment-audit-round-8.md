# Comprehensive Pipeline Alignment Audit — Round 8

<!-- scaffold:audit-round-8 v3.2.0 2026-04-03 -->

## Executive Summary

**Pipeline version**: v3.2.0 (post-restructure)
**Audit date**: 2026-04-03
**Prior round**: Round 7 (v2.43.2, 2026-03-30)

### Overall Health Score: **B+ (Good — one BROKEN dependency chain in MVP, stale path references from pre-restructure, several QC/methodology contradictions)**

The v3.2.0 restructure moved all build inputs under `content/`, consolidated skills with templating, removed `commands/` (73 files), and reorganized docs. This audit is the first post-restructure round. The restructure itself was clean — no path breakage in production code or tests. However, content-level issues persist from prior rounds, and 3 stale `docs/architecture.md` references (should be `docs/system-architecture.md`) were found in tools and knowledge entries.

The most critical finding is **1-B1**: in MVP mode, `implementation-playbook` has no effective dependency on `implementation-plan` because the entire intermediate chain is disabled. The playbook becomes eligible at pipeline start.

| Category | R6 | R7 | R8 | Trend |
|----------|----|----|----|----|
| BROKEN | 0 | 0 | 4 | ↑ (MVP chain + stale paths) |
| MISALIGNED | 11 | 15 | 7 | ↓ (many R7 findings resolved by restructure) |
| MISSING | 4 | 6 | 3 | ↓ |
| WEAK | 43 | 43 | 14 | ↓ (many R7 findings resolved or out of scope post-restructure) |
| **Total** | **58** | **64** | **28** | ↓ (restructure eliminated command-parity findings) |

**Key changes from R7:**
1. Module 5 is now "Skill & Tool Alignment" (was "Command ↔ Pipeline Parity") — `commands/` no longer exists
2. All R7 command-parity findings (5-W1) are resolved by deletion
3. All R7 build-drift findings are resolved — `build-drift.bats` and `command-structure.bats` deleted
4. Eval suite: 22 files, ~67 tests (was 20 files, 78 tests in R7; decrease due to command-related test removal)
5. R7's P1 finding (7-N1: MVP implementation-plan AC reference) has been addressed with a Note at line 94

---

## Delta from Round 7

### Resolved Findings (R7 → R8)

| R7 ID | Description | Resolution |
|-------|-------------|------------|
| 5-W1 | No automated hard-failure for build drift in CI | Resolved: `commands/` removed, build-drift.bats deleted |
| 7-N1 | MVP implementation-plan instructs agents to use ACs that don't exist | Resolved: Note added at line 94 acknowledging MVP depth produces no ACs |
| 1-N1 through 1-N5 | Frontmatter outputs missing side-effect artifacts | Carried forward as P2 (not fixed in restructure) |
| 3-X1 residual | 4 untagged QC criteria | Carried forward |

### Regressions

None from prior fixes. However, the restructure introduced 3 new BROKEN findings (stale `docs/architecture.md` references in tools/knowledge that were not caught during the path update sweep).

---

## Findings by Module

### Module 1: Dependency, Data Flow & Mode Detection

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **1-B1** | **BROKEN** | **implementation-playbook** | **No effective dependency on implementation-plan in MVP. Chain: playbook → developer-onboarding-guide → apply-fixes-and-freeze → validation → implementation-plan-review → implementation-plan. Every intermediate step disabled in MVP. Engine auto-satisfies disabled deps, so playbook eligible at pipeline start before plan exists.** | **P0** | **New** |
| 1-M1 | MISALIGNED | design-system | Hardcoded `tailwind.config.js` in frontmatter outputs; actual theme config varies by tech stack | P2 | Carried from R7 (1-N2) |
| 1-M2 | MISALIGNED | review-testing | `system-architecture` in both `dependencies` and `reads` — redundant | P3 | New |
| 1-W1 | WEAK | create-prd | `reads: [create-vision]` but no dependency; both eligible simultaneously in deep mode | P3 | New |
| 1-W2 | WEAK | domain-modeling | `reads: [innovate-user-stories]` but body doesn't reference its output artifact | P3 | New |
| 1-W3 | WEAK | workflow-audit | Modifies coding-standards.md, Makefile, lessons.md without declaring as outputs | P3 | Carried (R7 1-W4) |
| 1-W4 | WEAK | story-tests | Uses system-architecture.md as required input but doesn't list `system-architecture` in reads | P3 | New |
| 1-I1 | MISSING | beads | Outputs CLAUDE.md but no downstream step declares `reads: [beads]` | P3 | Carried (R7 1-W1) |

### Module 2: Methodology Scaling Coherence

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 2-M1 | MISALIGNED | mvp.yml + implementation-plan | 4 of 5 deps disabled in MVP; handled in body text but declaration is misleading | P3 | New |
| 2-W1 | WEAK | create-prd | MVP QC criteria stricter than "1-2 page" MVP description implies | P3 | New |
| 2-W2 | WEAK | create-evals | Depth 4→5 jump adds 5 categories at once (uneven progression) | P3 | New |
| 2-W3 | WEAK | innovate-vision, innovate-user-stories | Depth 1 says "Skip" which conflicts with step being enabled | P3 | Carried (R7 2-W1, 2-W2) |

### Module 3: Quality Criteria Assessment

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **3-M1** | **MISALIGNED** | **review-domain-modeling** | **MVP QC says "all review passes executed" but methodology says "quick consistency check only"** | **P1** | **New** |
| **3-M2** | **MISALIGNED** | **review-adrs** | **MVP QC says "all ADR-specific review passes" but methodology says "contradictions only"** | **P1** | **New** |
| **3-M3** | **MISALIGNED** | **implementation-plan-review** | **MVP QC requires "architecture coverage verified (every component has tasks)" but architecture unavailable at MVP** | **P1** | **New** |
| 3-W1 | WEAK | platform-parity-review | "appropriate" in navigation criterion lacks concrete threshold | P3 | Carried (R7) |
| 3-W2 | WEAK | automated-pr-review | "matches project coding conventions" is vague | P3 | New |
| 3-M4 | MISALIGNED | adrs | "trace to" instead of standard "maps to" in QC | P2 | Carried (R7 3-N2) |
| 3-M5 | MISALIGNED | tech-stack | Multi-model phrasing inconsistency | P2 | Carried (R7 3-M2) |

### Module 4: Knowledge System Alignment

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 4-W1 | WEAK | innovate-vision | `prd-innovation` knowledge is feature-focused, not strategy-focused | P3 | Carried (R7 4-W7) |
| 4-W2 | WEAK | workflow-audit | Knowledge entries lack inconsistency detection patterns | P3 | Carried (R7 4-W6) |
| 4-M1 | MISSING | story-tests | No knowledge entry for AC-to-test-skeleton translation | P3 | New |

### Module 5: Skill & Tool Alignment

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| **5-B1** | **BROKEN** | **post-implementation-review.md** | **References `docs/architecture.md` (lines 37, 123) instead of `docs/system-architecture.md`** | **P1** | **New** |
| **5-B2** | **BROKEN** | **enhancement-workflow.md** | **References `docs/architecture.md` (line 45) instead of `docs/system-architecture.md`** | **P1** | **New** |
| **5-B3** | **BROKEN** | **post-implementation-review-methodology.md** | **References `docs/architecture.md` (line 47) instead of `docs/system-architecture.md`** | **P1** | **New** |
| **5-M1** | **MISALIGNED** | **prompt-pipeline.md** | **Missing entire vision phase (create-vision, review-vision, innovate-vision)** | **P2** | **New** |
| **5-M2** | **MISALIGNED** | **scaffold-pipeline/SKILL.md** | **Pipeline Order table missing vision phase steps** | **P2** | **New** |
| 5-W1 | WEAK | scaffold-pipeline/SKILL.md | Duplicate critical ordering constraints (items 7-10 repeat as 8-13) | P3 | New |

### Module 6: Implementation Handoff Quality

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 6-W1 | WEAK | implementation-playbook | Missing `git-workflow` in reads field despite defining git workflow content | P3 | New |
| 6-W2 | WEAK | implementation-playbook | Missing `user-stories` in reads field | P3 | New |

### Module 7: End-to-End Path Simulation

**Project type**: Fresh SaaS web app | **Methodology**: MVP

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 7-W1 | WEAK | implementation-plan | MVP user stories are one-liners without ACs; plan must infer task boundaries — quality degrades but agent not stuck (R7's 7-N1 addressed with Note at line 94) | P3 | Carried (mitigated) |

**First stuck point**: No hard stuck point. First friction at `implementation-plan` (step 12) where agent derives task boundaries from one-liner stories. Step has explicit MVP guidance for this case.

### Module 8: Meta-Eval Self-Assessment

| ID | Cat | Step | Description | P | Status |
|----|-----|------|-------------|---|--------|
| 8-W1 | WEAK | mvp-path-simulation.bats | Module 7 eval coverage tests structure not execution coherence | P3 | Carried |
| 8-W2 | WEAK | handoff-quality.bats | No eval verifies build steps consume the playbook correctly | P3 | New |
| 8-M1 | MISSING | (none) | No eval validates "After This Step" guidance references | P3 | New |

**Eval inventory**: 22 files, ~67 tests. Decrease from R7 (20 files, 78 tests → 22 files, 67 tests) due to deletion of `build-drift.bats` (3 tests), `command-structure.bats` (6 tests), and trimming of command-dependent tests in other files. New: `quality-criteria-contradictions.bats` (3 tests), `update-mode-specifics-paths.bats` (3 tests) from R7 proposals are now implemented.

---

## False Positive Filtering

Engine Behavior filters remain valid. Added:
6. **Skills are templates**: `content/skills/` contains `{{INSTRUCTIONS_FILE}}` markers by design.

---

## Priority Matrix

### P0 — Critical (agent failures)

| ID | Description | File |
|----|-------------|------|
| 1-B1 | MVP implementation-playbook has no effective dependency on implementation-plan (disabled chain) | `content/pipeline/finalization/implementation-playbook.md` |

### P1 — Must Fix (incorrect output or stale references)

| ID | Description | File |
|----|-------------|------|
| 5-B1 | `docs/architecture.md` �� `docs/system-architecture.md` | `content/tools/post-implementation-review.md` |
| 5-B2 | `docs/architecture.md` → `docs/system-architecture.md` | `content/knowledge/execution/enhancement-workflow.md` |
| 5-B3 | `docs/architecture.md` → `docs/system-architecture.md` | `content/knowledge/tools/post-implementation-review-methodology.md` |
| 3-M1 | MVP QC "all passes" contradicts methodology "quick check only" | `content/pipeline/modeling/review-domain-modeling.md` |
| 3-M2 | MVP QC "all passes" contradicts methodology "contradictions only" | `content/pipeline/decisions/review-adrs.md` |
| 3-M3 | MVP QC requires architecture coverage unavailable at MVP | `content/pipeline/planning/implementation-plan-review.md` |

### P2 — Should Fix

| ID | Description | File |
|----|-------------|------|
| 5-M1 | prompt-pipeline missing vision phase | `content/tools/prompt-pipeline.md` |
| 5-M2 | scaffold-pipeline skill missing vision in Pipeline Order | `content/skills/scaffold-pipeline/SKILL.md` |
| 1-M1 | design-system hardcodes tailwind.config.js | `content/pipeline/environment/design-system.md` |
| 3-M4 | adrs "trace to" → "maps to" | `content/pipeline/decisions/adrs.md` |
| 3-M5 | tech-stack multi-model phrasing | `content/pipeline/foundation/tech-stack.md` |

### P3 — Polish

All remaining: 1-M2, 1-W1-W4, 1-I1, 2-M1, 2-W1-W3, 3-W1-W2, 4-W1-W2, 4-M1, 5-W1, 6-W1-W2, 7-W1, 8-W1-W2, 8-M1

---

## Appendix: Known False-Positive Patterns

1. **Disabled dependency satisfaction**: Engine auto-satisfies disabled deps (eligibility.ts:29)
2. **Passive reads**: `reads` field does not enforce ordering
3. **Path search**: Always search `content/pipeline/**/*.md`
4. **context7**: Real MCP server name
5. **Tool-scoped knowledge**: `content/knowledge/tools/*` entries referenced by tools, not pipeline
6. **Skill templates**: `content/skills/` contains `{{INSTRUCTIONS_FILE}}` markers by design
