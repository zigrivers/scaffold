# Phase 2 Review: ADR Completeness & Quality Audit

**Phase**: 2 — Review
**Last updated**: 2026-03-13
**Status**: review
**Reviewer**: Claude Code (automated review)

---

## Executive Summary

The 32-ADR suite is structurally solid — every ADR has a clear decision statement, fair alternatives, and actionable compliance constraints. However, three systemic issues must be fixed before Phase 3: **22 broken internal links** across 16 ADR files (all caused by slug mismatches), **a phantom Domain 16 reference** in the foundational ADR-004, and **a v1 format contradiction** between ADR-017 and ADR-028. Beyond these, the review identified **5-9 missing ADRs** (depending on severity threshold), **24 implicit decisions** that should be folded into existing ADRs, and **10 missing bidirectional Related Decision links**. Total findings: 6 critical, 14 major, 12 minor.

## Findings by Severity

### Critical (must fix before Phase 3)

1. **22 broken internal links across 16 ADR files.** All caused by the same pattern: Related Decisions sections use abbreviated slugs (e.g., `ADR-009-dependency-ordering.md`) instead of actual filenames (e.g., `ADR-009-kahns-algorithm-dependency-resolution.md`). An implementer following traceability chains will hit 404s. See Pass 7 for the complete list.

2. **ADR-004 references non-existent Domain 16.** The foundational methodology ADR cites `Domain(s): 01, 06, 14, 16` in its header and links to `../domain-models/16-methodology-manifest.md` in 4 locations. Only domains 01-14 exist. Methodology manifest content lives in domain 01 and domain 06.

3. **ADR-017 and ADR-028 contradict on v1 tracking comment format.** ADR-017 says "v1 tracking comments use a different format (no version, no mixin summary)." ADR-028 says v1 format is `<!-- scaffold:<name> v<version> <date> -->` — which includes a version field. One is wrong.

4. **ADR-018 and ADR-029 have unreconciled completion mechanisms.** ADR-018 defines dual completion detection (artifact existence + state record). ADR-029 introduces "Completion Criteria" with machine-checkable assertions and claims to "replace the v1 model." These overlap without acknowledging each other.

5. **ADR-012 ambiguity on "at most one in-progress."** States "at most one prompt can be in-progress at any time" without scoping to per-state-file. Combined with ADR-019's discussion of concurrent processes and ADR-021's worktree-based parallelism, an implementer could conclude concurrent execution is architecturally forbidden.

6. **ADR-014 contains misplaced injection constraint.** The config schema ADR includes "Unresolved mixin markers MUST be errors by default" — an injection engine rule already correctly documented in ADR-006. This will confuse implementers building the config validation system.

### Major (should fix before Phase 3)

7. **5 coverage gaps from domain model ADR candidates and spec.** See Pass 1+2 for details:
   - Verb replacement scope — global vs. mixin-section only (Domain 04)
   - Condensed summary strategy for AGENTS.md entries (Domain 05)
   - Unknown config fields as warnings vs. errors (Domain 06) — also found in Pass 3 as cross-cutting
   - Prompt versioning/rollback not supported (Spec Out of Scope)
   - Pipeline Context (context.json) deferred (Spec Out of Scope)

8. **3 additional new ADRs needed from implicit decision mining.** See Pass 3 for details:
   - Re-runs do not cascade to downstream prompts (Domain 02)
   - Mixin injection is non-recursive / two-pass bounded (Domain 12)
   - `--auto` does not imply `--force` (Domain 13)

9. **2 cross-domain ADRs missing.** See Pass 6 for details:
   - Error handling philosophy (fail-fast vs. accumulate pattern across all domains)
   - Testing strategy decisions (test infrastructure, boundaries, coverage)

10. **24 implicit decisions should be folded into existing ADRs.** Pass 3 identified decisions in domain models that are architecturally significant but not captured in any ADR. Key examples: REPLACE strategy for non-depends-on fields (→ ADR-011), phases as tiebreakers not constraints (→ ADR-009), zero-byte files count as present (→ ADR-018), simple append not atomic for JSONL (→ ADR-013), build classified as read-only (→ ADR-019). See Pass 3 for the complete list.

11. **10 missing bidirectional Related Decision links.** Multiple ADRs reference each other in only one direction. Key missing links: ADR-009 ↔ ADR-020, ADR-010 → ADR-022, ADR-012 ↔ ADR-020/021, ADR-013 ↔ ADR-018, ADR-018 → ADR-029. See Pass 4 for complete list.

12. **4 ADRs understate negative consequences.** ADR-012 (commit ceremony cost), ADR-013 (duplicate ID consequences), ADR-016 (orphaned dependency risk), ADR-029 (portability regression). See Pass 5 for details.

13. **Stale "(planned)" labels in ADR-003 and ADR-004.** Five Related Decision entries reference existing ADRs as "(planned)" when all have status `accepted`.

### Minor (fix during Phase 3 or later)

14. **3 deferral ADRs use non-standard status format.** ADR-030, 031, 032 add parenthetical qualifiers to `accepted` that aren't in the template's allowed set. Consider standardizing.

15. **Spec confirmation-required policy partially covered.** ADR-021 covers sequential execution but doesn't explicitly record that every prompt requires user confirmation before execution. Could be folded into ADR-021.

16. **ADR-025 straw-mans the "Always Structured" alternative.** Presents the weakest version of single-mode output instead of the `kubectl`/`docker` pattern of structured-by-default.

17. **ADR-013 is an island node in the Mermaid diagram.** No incoming or outgoing edges. May be intentional but should be confirmed.

18. **Terminology could benefit from a glossary.** "Mixin" is overloaded (concept, file, selected value). "Resolved prompt" vs. "pre-built prompt" used interchangeably across ADRs.

19. **3 partial cross-domain coverage gaps.** Build pipeline stage ordering, file write safety, and prompt content ownership boundary are each distributed across multiple ADRs without a unifying decision. Not strictly missing but would benefit from umbrella ADRs. See Pass 6 for details.

20. **Backward compatibility contract undefined.** No ADR defines what backward compatibility means as a principle: semver policy, breaking change definition, v1 support window.

---

## Pass 1: ADR Candidate Coverage Audit

| Domain | ADR Candidate Text | Covered By | Status |
|--------|-------------------|------------|--------|
| 01 | Frontmatter `depends-on` merge strategy (union vs. replace) | ADR-011 | ✓ Covered |
| 01 | Whether customizations must have a corresponding built-in | ADR-005 | ✓ Covered |
| 02 | Dependency union vs. replacement for custom prompts | ADR-011 | ✓ Covered |
| 02 | Runtime dependency graph mutation | ADR-009 | ✓ Covered |
| 03 | Map-keyed structure vs. separate files per prompt | ADR-012 | ✓ Covered |
| 04 | `create-and-claim` as core vocabulary vs. mixin optimization | ADR-008 | ✓ Covered |
| 04 | Verb replacement scope — global vs. mixin-section only | — | ✗ MISSING |
| 05 | Condensed summary strategy for AGENTS.md entries | — | ✗ MISSING |
| 06 | Config schema versioning strategy | ADR-014 | ✓ Covered |
| 06 | Unknown fields as warnings vs. errors | — | ✗ MISSING |
| 08 | Section extraction code-fence awareness | ADR-015 | ✓ Covered |
| 08 | Frontmatter field extensibility | ADR-015 | ✓ Covered |
| 09 | yargs as CLI framework | ADR-001 | ✓ Covered |
| 09 | OutputContext strategy pattern | ADR-025 | ✓ Covered |
| 12 | Verb registry in YAML vs. embedded in markdown | ADR-008 | ✓ Covered |

**Coverage: 12/15 covered (80%). 3 items missing.**

Domains with no explicit ADR CANDIDATE items in Section 10: 07, 10, 11, 13, 14.

---

## Pass 2: Spec Decision Coverage Audit

### Key Design Decisions

| Spec Section | Decision | Covered By | Status |
|-------------|----------|------------|--------|
| Key Design Decisions | Methodology as top-level organizer | ADR-004 | ✓ |
| Key Design Decisions | Manifest-driven phase ordering | ADR-016 | ✓ |
| Key Design Decisions | Mixin injection over templating | ADR-006 | ✓ |
| Key Design Decisions | Config file over runtime flags | ADR-014 | ✓ |
| Key Design Decisions | Universal adapter always generated | ADR-022 | ✓ |
| Key Design Decisions | Standalone CLI as source of truth | ADR-003 | ✓ |
| Key Design Decisions | npm as primary distribution | ADR-002 | ✓ |
| Key Design Decisions | Homebrew as secondary distribution | ADR-002 | ✓ |

**Coverage: 8/8 (100%)**

### Resolved Design Questions

| Spec Section | Decision | Covered By | Status |
|-------------|----------|------------|--------|
| Resolved #1 | CLI implementation language: Node.js | ADR-001 | ✓ |
| Resolved #2 | Mixin granularity: Multiple markers per prompt | ADR-007 | ✓ |
| Resolved #3 | Methodology versioning: Bundled with CLI | ADR-032 | ✓ |
| Resolved #4 | Config inheritance: Deferred | ADR-030 | ✓ |
| Resolved #5 | npm package name: TBD | — | N/A (operational, not architectural) |

**Coverage: 4/4 applicable (100%)**

### Out of Scope

| Spec Section | Decision | Covered By | Status |
|-------------|----------|------------|--------|
| Out of Scope | No automatic execution without confirmation | ADR-021 (partial) | ⚠ Partial |
| Out of Scope | No prompt versioning or rollback | — | ✗ MISSING |
| Out of Scope | No remote methodology registry | ADR-031 | ✓ |
| Out of Scope | No parallel prompt execution | ADR-021 | ✓ |
| Out of Scope | No runtime prompt generation | ADR-010 | ✓ |
| Out of Scope | Pipeline Context (context.json) deferred | — | ✗ MISSING |

**Coverage: 3/6 fully covered, 1 partial, 2 missing**

### Non-Goals

| Spec Section | Decision | Covered By | Status |
|-------------|----------|------------|--------|
| Non-Goals | Not general-purpose scaffolding | — | N/A (scope statement) |
| Non-Goals | Not supporting every AI tool at launch | ADR-022 | ✓ |
| Non-Goals | No community marketplace | ADR-031 | ✓ |

**Coverage: 2/2 applicable (100%)**

---

## Pass 3: Implicit Decision Mining

### Recommended New ADRs (4)

#### 1. Re-runs do not cascade to downstream prompts
- **Source**: Domain 02, Section 8 — "Re-runs don't cascade to downstream prompts (cost, stability, user agency)"
- **Current coverage**: Not covered
- **Rationale**: Implementers might default to cascading re-runs, causing data loss of manually-edited downstream artifacts.

#### 2. Unknown fields are warnings not errors (forward compatibility policy)
- **Source**: Domain 06, Section 8; Domain 08, Section 8 — recurring across config, frontmatter, manifest
- **Current coverage**: Not covered (also identified in Pass 1 as Domain 06 ADR candidate)
- **Rationale**: Cross-cutting schema evolution policy affecting config.yml, frontmatter, and manifests. Determines forward compatibility behavior.

#### 3. Mixin injection is non-recursive (two-pass bounded)
- **Source**: Domain 12, Section 8, MQ6 — "exactly two passes, then unresolved check"
- **Current coverage**: Partially covered by ADR-006 and ADR-010
- **Rationale**: Fundamental constraint preventing infinite loops. Implementers might add recursion for convenience without understanding the design intent.

#### 4. `--auto` does not imply `--force`
- **Source**: Domain 13, Section 8, MQ6 — "auto never implies force"
- **Current coverage**: Not covered
- **Rationale**: Counterintuitive safety policy for CI/unattended contexts. Natural assumption is auto = do everything automatically.

### Recommended to Fold into Existing ADRs (24)

| # | Decision | Target ADR |
|---|----------|-----------|
| 1 | REPLACE strategy for non-depends-on array fields (produces, reads, artifact-schema) | ADR-011 |
| 2 | Extra prompts default to phase 7; unknown traits evaluate to false | ADR-005 |
| 3 | Override prompts are complete replacement, not merged with base | ADR-005 |
| 4 | Phases are tiebreakers not constraints (prompts can execute before their phase) | ADR-009 |
| 5 | Zero-byte files count as "present" (with warning) for artifact completion | ADR-018 |
| 6 | File existence only for completion detection; content validation deferred to `scaffold validate` | ADR-018 |
| 7 | Old completion data NOT preserved on re-run (overwritten) | ADR-012 |
| 8 | Single-line constraint on task verb markers | ADR-008 |
| 9 | Unsupported verb = degradation with warnings, not errors | ADR-008 |
| 10 | Every mixin must declare replacement for every verb (completeness requirement) | ADR-008 |
| 11 | Tool-name mapping applied after mixin injection (ordering dependency) | ADR-023 |
| 12 | Universal adapter strips MCP references; Codex wraps them | ADR-022 |
| 13 | Only package-manifest and source-directory sufficient to trigger brownfield | ADR-028 |
| 14 | Section extraction ignores code blocks (known limitation) | ADR-015 |
| 15 | `produces` required for built-in prompts, optional for custom | ADR-015 |
| 16 | 2000-token CLAUDE.md budget is advisory, not hard limit | ADR-026 |
| 17 | User edits to managed CLAUDE.md sections overwritten on re-run | ADR-026 |
| 18 | D-NNN sequential IDs over UUIDs for human readability | ADR-013 |
| 19 | Decision log collision detected at validation time, not write time | ADR-013 |
| 20 | Simple append (not atomic write-rename) for JSONL decision log | ADR-013 |
| 21 | Axis markers replaced BEFORE task verb markers (two-pass ordering) | ADR-010 |
| 22 | lock.json and in_progress are intentionally independent mechanisms | ADR-019 |
| 23 | File signals override keyword signals in methodology suggestion | ADR-027 |
| 24 | Auto mode v1 detection requires stronger signal (tracking comment, not just .beads/) | ADR-028 |
| 25 | `build` classified as read-only command (does not acquire lock) | ADR-019 |

---

## Pass 4: Cross-ADR Consistency Check

### Contradictions

1. **ADR-018 vs. ADR-029 on completion detection.** ADR-018 defines dual detection (artifact existence + state record). ADR-029 introduces Completion Criteria with machine-checkable assertions and claims to "replace the v1 model" — but ADR-018 already replaces it. These describe overlapping but unreconciled mechanisms. **Resolution**: ADR-018 should acknowledge Completion Criteria as a granularity layer; ADR-029 should stop claiming replacement.

2. **ADR-012 "at most one in-progress at any time" vs. ADR-019/021 concurrent processes.** ADR-012's phrasing is ambiguous about per-state-file vs. globally. Worktree parallelism means multiple state.json instances each have one in_progress. **Resolution**: ADR-012 should say "at most one prompt can be in-progress per state.json file."

3. **ADR-014 misplaced injection constraint.** Contains "Unresolved mixin markers MUST be errors by default" — an injection engine rule already in ADR-006. **Resolution**: Remove from ADR-014 or label as cross-reference to ADR-006.

4. **ADR-017 vs. ADR-028 on v1 tracking comment format.** ADR-017: "v1 format has no version." ADR-028: v1 format is `<!-- scaffold:<name> v<version> <date> -->` (includes version). **Resolution**: Reconcile against actual v1 behavior.

5. **Error handling philosophy is consistent but undocumented.** Multiple ADRs follow "structural integrity errors are fatal; advisory/compatibility issues are warnings" — but this principle is never stated, increasing risk of future inconsistency.

6. **Build-time vs. runtime boundary is consistent.** ADR-010 establishes the bright line; all other ADRs respect it. One minor blur: ADR-015's runtime section extraction for `reads` targets.

### Orphaned References

1. **ADR-004** references `Domain 16 ([16-methodology-manifest.md](../domain-models/16-methodology-manifest.md))` — does not exist.
2. **ADR-003** labels ADR-022 as "(planned)" — ADR-022 is `accepted`.
3. **ADR-004** labels ADR-005, ADR-006, ADR-016, ADR-027 as "(planned)" — all are `accepted`.

### Terminology Inconsistencies

1. **"resolved prompt" vs. "pre-built prompt"**: ADR-005 uses `ResolvedPrompt`; ADR-010 uses "pre-built prompts." Same concept, different terms.
2. **ADR-017 vs. ADR-028 v1 format description**: Contradictory (see above).
3. **"mixin" overloaded**: Used as concept, file, and selected value across ADRs. Not technically inconsistent but would benefit from a glossary.

### Missing Related Decision Links

| Source ADR | Should Reference | Reason |
|-----------|-----------------|--------|
| ADR-009 | ADR-020 | Skip semantics affect dependency resolution (ADR-009 discusses skipped prompts) |
| ADR-010 | ADR-022 | ADR-010 lists "platform output generation" as build-time; ADR-022 defines the adapters |
| ADR-012 | ADR-020 | Skip/exclude directly affects state.json entries |
| ADR-012 | ADR-021 | Sequential execution constrains in_progress to single record |
| ADR-013 | ADR-018 | Provisional entries interact with crash recovery |
| ADR-014 | ADR-027 | Config schema is the output artifact of init wizard |
| ADR-017 | ADR-029 | Tracking comments are the mechanism for CLI-handled mode detection |
| ADR-018 | ADR-029 | Completion Criteria extends the completion detection system |
| ADR-025 | ADR-013 | ADR-013 references ADR-025; reverse link missing |
| ADR-026 | ADR-029 | Both address agent context optimization / token budget |

---

## Pass 5: Quality Assessment per ADR

### ADR Quality Scores

| ADR | Clarity | Alt. Fairness | Honesty | Compliance | Traceability | Issues |
|-----|---------|---------------|---------|------------|--------------|--------|
| 001 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 002 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 003 | ✓ | ✓ | ✓ | ✓ | ⚠ | Stale "(planned)" label |
| 004 | ✓ | ✓ | ✓ | ✓ | ✗ | Phantom Domain 16; four stale "(planned)" labels |
| 005 | ✓ | ✓ | ✓ | ✓ | ⚠ | Broken link to ADR-004 |
| 006 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 007 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 008 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 009 | ✓ | ✓ | ✓ | ✓ | ⚠ | Plain-text ADR-021 ref; missing ADR-020 link |
| 010 | ✓ | ✓ | ✓ | ✓ | ⚠ | Missing ADR-022 reference |
| 011 | ✓ | ✓ | ✓ | ✓ | ⚠ | Plain-text ADR-015 ref |
| 012 | ✓ | ✓ | ⚠ | ✓ | ⚠ | Understated commit ceremony cost; broken ADR-018 link; missing ADR-020/021 refs |
| 013 | ✓ | ✓ | ⚠ | ✓ | ⚠ | Understated duplicate ID consequences; broken ADR-025 link; missing ADR-018 ref |
| 014 | ✓ | ✓ | ✓ | ✗ | ⚠ | Misplaced injection constraint; broken ADR-004 link |
| 015 | ✓ | ✓ | ✓ | ✓ | ⚠ | Three broken links |
| 016 | ✓ | ✓ | ⚠ | ✓ | ⚠ | Generic domain refs; understated orphaned-dep risk; three broken links |
| 017 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 018 | ✓ | ✓ | ✓ | ✓ | ⚠ | Two broken links; missing ADR-029 ref |
| 019 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 020 | ✓ | ✓ | ✓ | ✓ | ⚠ | Broken ADR-009 link |
| 021 | ✓ | ✓ | ✓ | ✓ | ⚠ | Broken ADR-009 link |
| 022 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 023 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 024 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 025 | ✓ | ⚠ | ✓ | ✓ | ⚠ | "Always Structured" alt straw-manned; broken ADR-014 link; missing ADR-013 ref |
| 026 | ✓ | ✓ | ✓ | ✓ | ⚠ | Two broken links; missing ADR-029 ref |
| 027 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 028 | ✓ | ✓ | ✓ | ✓ | ✓ | Clean |
| 029 | ✓ | ✓ | ⚠ | ✓ | ⚠ | Understated portability regression; broken ADR-015 link; missing ADR-017 ref |
| 030 | ✓ | ✓ | ✓ | ✓ | N/A | Clean (deferral) |
| 031 | ✓ | ✓ | ✓ | ✓ | N/A | Clean (deferral) |
| 032 | ✓ | ✓ | ✓ | ✓ | N/A | Clean (deferral) |

### Detailed Issues

#### ADR-004: Methodology as Top-Level Organizer
- **Traceability (Fail)**: References `Domain 16 ([16-methodology-manifest.md])` in header (`Domain(s): 01, 06, 14, 16`) and Related Decisions. Domain 16 does not exist. Methodology manifest content lives in domains 01 and 06.
- **Traceability (Stale)**: Four Related Decisions entries say "(planned)" for ADR-005, 006, 016, 027 — all have status `accepted`.

#### ADR-012: State File Design
- **Consequence honesty (Weak)**: Negative consequences say state commits "add noise to git history." This understates the operational cost: in a 25-prompt pipeline, that is 25 extra commits purely for state tracking, each requiring stage/commit/push. This is material workflow friction, not merely "noise."

#### ADR-013: Decision Log
- **Consequence honesty (Weak)**: Describes duplicate IDs from concurrent agents as "untidy." Actual consequence: queries by ID produce different results depending on first-match vs. last-match implementation. The "last entry wins" rule must be uniformly implemented across all consumers.

#### ADR-014: Config Schema Versioning
- **Compliance actionability (Fail)**: Contains injection engine constraint ("Unresolved mixin markers MUST be errors by default") that belongs in ADR-006. Implementers building config validation will be confused.

#### ADR-016: Methodology Manifest Format
- **Consequence honesty (Weak)**: Says orphaned dependencies "may hide real errors." Understated: if a methodology removes an optional prompt but forgets to clean up its dependency edges, prompts execute before their logical prerequisites with no error and only a `scaffold validate` flag.
- **Traceability (Weak)**: References "domain 01" and "domain 02" without section numbers. Other Core Engine ADRs cite specific sections.

#### ADR-025: CLI Output Contract
- **Alternative fairness (Weak)**: "Always Structured" alternative presented as "All output is always structured JSON. Interactive features are never used." This is a straw man. The `kubectl`/`docker` pattern (structured by default with human formatting, JSON via flag) would be the fairer comparison.

#### ADR-029: Prompt Structure Convention
- **Consequence honesty (Weak)**: Says prompts "depend on the CLI to communicate mode and navigation context." Understates significance: v1's core value was paste-able prompts. V2 prompts that can't function without CLI context represent a portability regression — sharing a single prompt, using in other AI tools, or bypassing the CLI all lose mode detection and navigation.

### Systematic Observations

- **Decision clarity is uniformly strong.** All 32 ADRs have clear, one-sentence-summarizable Decision sections.
- **Alternative fairness is strong except ADR-025.** 31/32 give alternatives genuine pros.
- **Negative consequences are honest in 28/32 cases.** ADR-012, 013, 016, 029 each understate material costs.
- **Compliance sections are actionable in 31/32 cases.** Only ADR-014 has a misplaced constraint.
- **Traceability has a systematic broken-link problem.** 16/32 ADRs have broken internal links.

---

## Pass 6: Cross-Domain Decision Completeness

| Cross-Cutting Concern | Covered By | Status | Notes |
|----------------------|------------|--------|-------|
| Build pipeline stage ordering | ADR-010, ADR-006, ADR-022 (distributed) | ⚠ Partial | No single ADR documents the end-to-end stage ordering (config → validation → resolution → injection → adapters → output). Domain 12 Section 1 has the canonical pipeline but no ADR declares it as a decision. |
| Error handling philosophy | — | ✗ MISSING | No ADR establishes the overall pattern: accumulate at build time, distinguish errors from warnings, provide escape hatches. Individual ADRs make per-domain error decisions that follow this implicit pattern but it's never stated. |
| File write safety | ADR-012 (state.json only) | ⚠ Partial | Atomic write-rename documented only for state.json. JSONL uses simple append. CLAUDE.md, lock.json, build outputs have no documented write safety strategy. |
| Multi-user concurrency model | ADR-012, ADR-013, ADR-019, ADR-021 | ✓ Effectively covered | Advisory locking (local) + merge-safe formats (cross-machine) + sequential execution. Distributed but coherent and cross-referenced. |
| Prompt content ownership boundary | ADR-005, ADR-026, ADR-003, ADR-029 (distributed) | ⚠ Partial | No ADR explicitly draws the boundary between scaffold-owned and user-owned content in produced artifacts. |
| Backward compatibility contract | ADR-014, ADR-017, ADR-028, ADR-015 (distributed) | ⚠ Partial | Config migration, v1 detection, forward compatibility via unknown-field warnings exist. But no ADR defines what backward compatibility means as a principle (semver? support window? breaking change definition?). |
| Testing strategy decisions | — | ✗ MISSING | No ADR covers test infrastructure, boundaries, mocking strategy, or coverage thresholds. ADR-001 mentions shifting from bats to jest/vitest but no decision is recorded. |

---

## Pass 7: Index and Metadata Audit

### Numbering
Sequential 001-032 with no gaps. No issues.

### Filenames
All 32 follow `ADR-NNN-short-kebab-slug.md`. No issues.

### Index Completeness
All 32 ADR files listed in index.md. Every entry corresponds to an existing file. No issues.

### Index Accuracy
One discrepancy: ADR-004's index entry lists `Domain(s): 01, 06, 14` (correct). The ADR-004 file header says `01, 06, 14, 16` (incorrect — domain 16 doesn't exist).

### Status Consistency
All 32 use `accepted`. Three deferral ADRs add non-template parenthetical qualifiers:
- ADR-030: `accepted (deferred from Phase 1-3 scope)`
- ADR-031: `accepted (deferred from Phase 1-3 scope)`
- ADR-032: `accepted (may be revisited when community/third-party methodologies emerge)`

### Header Format
All 32 follow template structure. No issues.

### Domain Model Index
Updated with Related ADRs column. All cross-references verified accurate.

### Category Coverage
All 7 categories populated:

| Category | Count | ADRs |
|----------|-------|------|
| Foundation | 4 | 001-004 |
| Core Engine | 7 | 005-011 |
| Data Formats | 6 | 012-017 |
| Runtime Behavior | 4 | 018-021 |
| Platform & Adapters | 3 | 022-024 |
| UX & Output | 5 | 025-029 |
| Scope & Deferral | 3 | 030-032 |

### Mermaid Diagram
Syntactically valid. All 32 ADRs represented. ADR-013 is an island node (no edges) — likely intentional but worth confirming.

### Internal Links — 22 Broken Links

| Broken Slug | Correct Filename | Found In |
|-------------|-----------------|----------|
| `ADR-004-methodology-manifest.md` | `ADR-004-methodology-as-top-level-organizer.md` | ADR-005 |
| `ADR-004-methodology-as-organizing-principle.md` | `ADR-004-methodology-as-top-level-organizer.md` | ADR-014, ADR-016 |
| `ADR-005-prompt-resolution-layers.md` | `ADR-005-three-layer-prompt-resolution.md` | ADR-015, ADR-016 |
| `ADR-009-dependency-ordering.md` | `ADR-009-kahns-algorithm-dependency-resolution.md` | ADR-016, ADR-020, ADR-021 |
| `ADR-011-dependency-union-semantics.md` | `ADR-011-depends-on-union-semantics.md` | ADR-015, ADR-016 |
| `ADR-014-config-validation.md` | `ADR-014-config-schema-versioning.md` | ADR-025 |
| `ADR-015-frontmatter-schema.md` | `ADR-015-prompt-frontmatter-schema.md` | ADR-018, ADR-024, ADR-029 |
| `ADR-017-tracking-comments.md` | `ADR-017-tracking-comments-artifact-provenance.md` | ADR-018, ADR-026, ADR-028 |
| `ADR-018-completion-detection.md` | `ADR-018-completion-detection-crash-recovery.md` | ADR-012, ADR-015, ADR-017 |
| `ADR-022-platform-adapters.md` | `ADR-022-three-platform-adapters.md` | ADR-026 |
| `ADR-025-cli-output-modes.md` | `ADR-025-cli-output-contract.md` | ADR-013 |
| `../domain-models/16-methodology-manifest.md` | Does not exist (domain 16) | ADR-004 |

---

## Pass 8: Downstream Readiness Assessment

### Phase 3 (System Architecture): READY with fixes

Phase 3 can reference an ADR for every major structural choice:
- Three adapters (ADR-022), CLI as source of truth (ADR-003), build-time resolution (ADR-010), state file design (ADR-012), mixin injection (ADR-006), dependency resolution (ADR-009)
- **Gap**: No single ADR for the end-to-end build pipeline stage ordering. Phase 3 will need to describe the pipeline and would benefit from an ADR to reference. Recommend creating before or during Phase 3.
- **Gap**: No error handling philosophy ADR. Phase 3 system architecture will need to describe error boundaries. Can be created during Phase 3 if critical fixes are applied first.

### Phase 4 (Data Schemas): READY

Every data file has a format ADR:
- `state.json` → ADR-012
- `config.yml` → ADR-014
- `decisions.jsonl` → ADR-013
- `lock.json` → ADR-019
- `manifest.yml` → ADR-016
- Frontmatter → ADR-015
- Tracking comments → ADR-017
- CLAUDE.md → ADR-026

### Phase 5 (API Contracts): READY

Interface boundaries have ADRs:
- Adapter interface → ADR-022
- Mixin injection interface → ADR-006, ADR-007
- CLI command contract → ADR-025
- Config validation interface → ADR-014
- Resolution interface → ADR-005

### Phase 6 (UX Spec): READY

UX-relevant decisions covered:
- CLI output modes → ADR-025
- Init wizard → ADR-027
- Detection priority → ADR-028
- Skip vs. exclude → ADR-020
- Prompt structure → ADR-029

### Summary

All downstream phases can proceed once critical fixes (broken links, phantom domain 16, v1 format contradiction) are applied. The missing cross-cutting ADRs (error handling, testing strategy, pipeline ordering) are beneficial but not blocking — they can be created during Phase 3 when their content is most naturally developed.

---

## Action Items

| # | Severity | Action | ADR(s) Affected | Domain(s) |
|---|----------|--------|-----------------|-----------|
| 1 | Critical | Fix 22 broken internal links (slug mismatches) across 16 files | ADR-005, 012-016, 018, 020-021, 024-026, 028-029 | — |
| 2 | Critical | Remove phantom Domain 16 references from header and body | ADR-004 | 01, 06, 14 |
| 3 | Critical | Reconcile v1 tracking comment format description | ADR-017, ADR-028 | 07 |
| 4 | Critical | Reconcile completion detection mechanisms (dual detection vs. Completion Criteria) | ADR-018, ADR-029 | 03, 08 |
| 5 | Critical | Clarify "at most one in-progress" is per-state-file, not global | ADR-012 | 03 |
| 6 | Critical | Remove misplaced injection constraint (belongs in ADR-006) | ADR-014 | 06 |
| 7 | Major | Create ADR: Unknown fields as warnings (forward compatibility policy) | New ADR-033 | 06, 08 |
| 8 | Major | Create ADR: Re-runs do not cascade to downstream prompts | New ADR-034 | 02 |
| 9 | Major | Create ADR: Non-recursive two-pass injection | New ADR-035 | 12 |
| 10 | Major | Create ADR: `--auto` does not imply `--force` | New ADR-036 | 13 |
| 11 | Major | Create ADR: Verb replacement scope (global) | New ADR-037 | 04 |
| 12 | Major | Create ADR: Prompt versioning not supported (deferral) | New ADR-038 | — |
| 13 | Major | Create ADR: Pipeline Context deferred | New ADR-039 | — |
| 14 | Major | Create ADR: Error handling philosophy (cross-cutting) | New ADR-040 | All |
| 15 | Major | Fold 24 implicit decisions into existing ADRs (see Pass 3 table) | ADR-005, 008-013, 015, 018-019, 022-023, 026-028 | Multiple |
| 16 | Major | Add 10 missing bidirectional Related Decision links | ADR-009-026, 029 | — |
| 17 | Major | Update stale "(planned)" labels to "(accepted)" | ADR-003, ADR-004 | — |
| 18 | Major | Strengthen negative consequences with frank assessments | ADR-012, 013, 016, 029 | 03, 11, 01, 08 |
| 19 | Minor | Standardize deferral ADR status format | ADR-030, 031, 032 | — |
| 20 | Minor | Fold confirmation-required policy into ADR-021 | ADR-021 | 03 |
| 21 | Minor | Improve "Always Structured" alternative fairness | ADR-025 | 09 |
| 22 | Minor | Create ADR: Testing strategy (when Phase 3 begins) | New | — |
| 23 | Minor | Add specific section references to domain model citations | ADR-016 | 01, 02 |
| 24 | Minor | Confirm ADR-013 Mermaid island node is intentional | index.md | — |
| 25 | Minor | Consider umbrella ADRs for pipeline ordering, file write safety, ownership boundary | New (3) | Multiple |

---

## Fix Application Record

**Date**: 2026-03-13
**Applied by**: Phase 2 fix automation

| Category | Status | Summary |
|----------|--------|---------|
| 1. Broken Links | Applied | Fixed 22 broken internal links across 16 ADR files |
| 2. Phantom Domain 16 | Applied | Removed Domain 16 references from ADR-004 |
| 3. v1 Tracking Format | Applied | Reconciled ADR-017 with v1 PRD format |
| 4. Completion Detection | Applied | Reconciled ADR-018 and ADR-029 as complementary |
| 5. in_progress Scope | Applied | Clarified per-state.json scope in ADR-012 |
| 6. Misplaced Constraint | Applied | Replaced injection rule in ADR-014 with cross-reference |
| 7. New ADRs | Applied | Created ADR-033 through ADR-040 (8 new ADRs) |
| 8. Fold-in Decisions | Applied | Folded 25 implicit decisions into existing ADRs |
| 9. Related Links | Applied | Added 10 missing bidirectional Related Decision links |
| 10. Stale Labels | Applied | Removed "(planned)" from ADR-003 and ADR-004 |
| 11. Consequences | Applied | Strengthened 4 negative consequences (ADR-012, 013, 016, 029) |
| 12. Minor Fixes | Applied | Standardized deferral status, fairness, section refs, confirmation policy |
| 13. Index Updates | Applied | Updated ADR index, domain model index, this record |
