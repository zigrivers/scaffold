# Scaffold v2 Decision Completeness Audit

**Date:** 2026-03-14
**Methodology:** `knowledge/validation/decision-completeness.md`
**Scope:** All v2 specification artifacts -> ADR inventory (54 ADRs, 13 supporting artifacts)

---

## 1. Decision Inventory

| # | Decision | Source | ADR? | Quality | Notes |
|---|----------|--------|------|---------|-------|
| | **Infrastructure & Platform** | | | | |
| 1 | Implementation language: Node.js with TypeScript | PRD §4, architecture §1 | ADR-001 | Covered | Rationale: npm ecosystem, TypeScript safety, cross-platform |
| 2 | CLI framework: yargs | architecture §3a, security §4 | ADR-001 | Covered | Documented within ADR-001; traced as C-002 |
| 3 | Distribution: npm primary, Homebrew secondary | PRD §4, architecture §1 | ADR-002 | Covered | Two-channel strategy with fallback |
| 4 | Standalone CLI as source of truth (not plugin) | PRD §2, architecture §1 | ADR-003 | Covered | Plugins are thin wrappers over CLI |
| 5 | Module system: ESM | architecture §3a (implicit) | — | Implied | Inferred from TypeScript + Node 18+ stack; no explicit ADR |
| | **Data & File Formats** | | | | |
| 6 | State file: JSON, map-keyed by step, atomic writes, git-committed | PRD §11, state-json-schema | ADR-012 | Covered | Map-keyed for git merge safety |
| 7 | Config file: YAML with integer versioning and forward-only migration | PRD §7, config-yml-schema | ADR-014 | Covered | Auto-migration on version mismatch |
| 8 | Decision log: JSONL append-only format | PRD §11, json-output-schemas | ADR-013 | Covered | Git-mergeable across agents |
| 9 | Lock file: advisory, PID-based, local-only, gitignored | PRD §8, state-json-schema | ADR-019 | Covered | Not distributed; PID liveness checking |
| 10 | Frontmatter schema: YAML in markdown with declarative fields | frontmatter-schema | ADR-045 | Covered | ADR-015 superseded; ADR-045 is current |
| 11 | Forward compatibility: unknown fields produce warnings, not errors | config-yml-schema §validation, frontmatter-schema §validation | ADR-033 | Covered | Fields preserved in memory for round-trip |
| 12 | YAML conventions: 1.2, no anchors/aliases/tags, kebab-case keys, UTF-8, .yml extension | frontmatter-schema §6, config-yml-schema §6 | — | Implied | Standard conventions; documented in schema docs but no ADR |
| 13 | Step name convention: kebab-case (`^[a-z][a-z0-9-]*$`) | frontmatter-schema §2 | — | Implied | Enforced by frontmatter validation; no dedicated ADR |
| | **CLI & UX** | | | | |
| 14 | Command set: 14 commands (init, run, next, status, skip, list, validate, build, adopt, reset, info, version, update, dashboard, decisions) | PRD §8, cli-contract §2 | — | Implied | No ADR for command set itself; individual behaviors have ADRs |
| 15 | Flag conventions: --auto (suppress prompts), --force (override safety), --format json | cli-contract §1 | ADR-036, ADR-025 | Covered | --auto does NOT imply --force |
| 16 | Exit code semantics: 0-5 structured codes | cli-contract §1, json-output-schemas §1 | ADR-025 | Covered | Enables fine-grained CI branching |
| 17 | Output modes: interactive, JSON (--format json), auto (--auto) | cli-contract §1, json-output-schemas §1 | ADR-025 | Covered | Three audiences: humans, CI, agents |
| 18 | Error handling: build-time accumulate, runtime fail-fast | cli-contract §1, architecture §7 | ADR-040 | Covered | Cross-cutting philosophy with escape hatches |
| 19 | Interactive prompts: @inquirer/prompts library | PRD §8 (init wizard) | ADR-027 | Covered | Documented within init wizard ADR |
| 20 | Skip vs exclude semantics | cli-contract §2 (skip) | ADR-020 | Covered | Skip marks complete; exclude removes from pipeline |
| 21 | Init wizard: three-phase (detect, questions, confirm) with smart suggestion | PRD §8, cli-contract §2 | ADR-027 | Covered | Auto-runs build after init |
| 22 | Detection priority: v1 > brownfield > greenfield | cli-contract §2 (init), architecture §5a | ADR-028 | Covered | Only 4 prompts adapt to brownfield |
| 23 | Error message design: three-icon system, fuzzy matching (Levenshtein <= 2), structured format | error-messages.md §1-2 | — | Implied | Comprehensive UX guidelines; no dedicated ADR |
| | **Architecture & Patterns** | | | | |
| 24 | Runtime assembly (not build-time) | PRD §9, architecture §4 | ADR-044 | Covered | Supersedes ADR-010 (build-time) |
| 25 | Meta-prompt architecture (replaces hard-coded prompts) | PRD §4, architecture §1 | ADR-041 | Covered | Supersedes 7 prior ADRs (005-008, 023, 035, 037) |
| 26 | Knowledge base as domain expertise layer (32 topic-organized docs) | PRD §4, architecture §3c | ADR-042 | Covered | Topic-organized, not step-organized |
| 27 | Assembled prompt structure: 7 fixed sections, later-overrides-earlier | PRD §9, architecture §4 | ADR-045 | Covered | System, Meta-prompt, KB, Context, Methodology, Instructions, Execution |
| 28 | Dependency resolution: Kahn's algorithm with phase tiebreaker | PRD §3.3, architecture §4 | ADR-009 | Covered | Topological sort with deterministic ordering |
| 29 | Depth scale: 1-5 integer with 3 presets (deep/mvp/custom) | PRD §6, config-yml-schema §2 | ADR-043 | Covered | Supersedes ADR-016 (methodology manifests) |
| 30 | Methodology as top-level organizer | PRD §6, config-yml-schema §2 | ADR-004 | Covered | Three preset names: deep, mvp, custom |
| 31 | Platform adapters: 3 (Claude Code, Codex, Universal) | PRD §4, architecture §4b | ADR-022 | Covered | Universal always generated |
| 32 | Completion detection: dual (artifact-based primary, state secondary) | PRD §11, state-json-schema §2 | ADR-018 | Covered | Crash recovery via completion detection |
| 33 | Advisory locking: PID-based, local | PRD §8, architecture §7 | ADR-019 | Covered | Only write commands acquire |
| 34 | Sequential execution (no parallel prompts) | PRD §3.3, architecture §4 | ADR-021 | Covered | Parallelism at implementation level via worktrees |
| 35 | Re-run: no cascade to downstream prompts | cli-contract §2 (run) | ADR-034 | Covered | Warning lists affected downstreams |
| 36 | CLAUDE.md section registry with token budget | architecture §4a, PRD §9 | ADR-026 | Covered | 2000-token advisory budget; ownership markers |
| 37 | Prompt structure convention: agent-optimized ordering | architecture §3c | ADR-029 | Covered | What to Produce first, Process before Specs |
| 38 | Tracking comments for artifact provenance | architecture §7 | ADR-017 | Covered | Machine-readable markers in generated artifacts |
| 39 | Capabilities as warnings (not hard errors) | architecture §3c | ADR-024 | Covered | Fixed set of 5 capabilities |
| 40 | Methodology versioning bundled with CLI | config-yml-schema §5 | ADR-032 | Covered | No independent methodology version numbers |
| 41 | Phase-specific review criteria (not generic template) | PRD §5 (review phases) | ADR-046 | Covered | 10 review meta-prompts + 11 KB entries |
| | **User Customization** | | | | |
| 42 | User instruction precedence: 3 layers (global < per-step < inline) | PRD §10, cli-contract §2 (run) | ADR-047 | Covered | Git-committed files + ephemeral inline flag |
| 43 | Update mode: diff over regeneration | PRD §9, cli-contract §2 (run) | ADR-048 | Covered | Automatic detection; preserves user edits |
| 44 | Methodology changeable mid-pipeline | PRD §6, config-yml-schema §3 | ADR-049 | Covered | Completed steps preserved; warnings emitted |
| | **Quality & Process** | | | | |
| 45 | Test framework: Vitest | task-breakdown tech stack, operations-runbook §2 | — | Implied | Mentioned in ADR-001 context but no dedicated ADR |
| 46 | TDD mandatory (red-green-refactor) | testing-strategy §1 | — | Implied | Non-negotiable principle; no ADR |
| 47 | Test co-location pattern (test files next to source) | testing-strategy §3 | — | Implied | Standard convention choice; no ADR |
| 48 | Security posture: not a server/database/network client | security-practices §1 | — | Implied | Architectural boundary; no ADR |
| 49 | License policy: MIT/ISC/BSD/Apache OK; no GPL/AGPL | security-practices §5 | — | Implied | Legal constraint; no ADR |
| 50 | npm provenance attestation for package integrity | security-practices §2 | — | Implied | STRIDE mitigation choice; no ADR |
| | **Deferred (with ADRs)** | | | | |
| 51 | Config inheritance deferred | PRD non-goal | ADR-030 | Covered | Per-project config only for Phase 1 |
| 52 | Community marketplace deferred | PRD non-goal | ADR-031 | Covered | Share via git/npm instead |
| 53 | Prompt versioning deferred | architecture (implied) | ADR-038 | Covered | Use git for history; pin CLI version |
| 54 | Pipeline context store deferred | architecture (implied) | ADR-039 | Covered | Use `reads` field + decisions.jsonl instead |
| | **Resolved (formerly proposed)** | | | | |
| 55 | Context window management: reads field + dependency-chain defaults | PRD §9, domain 15 | ADR-050 | Covered | Resolved — accepted Option D |
| 56 | Depth downgrade: interactive confirmation, --auto warns | domain 16 | ADR-051 | Covered | Resolved — accepted Option C |
| 57 | Decision recording: AI writes directly to decisions.jsonl | domain 11, 15 | ADR-052 | Covered | Resolved — accepted Option A |
| 58 | Artifact context scope: dependency artifacts + explicit reads | domain 15 | ADR-053 | Covered | Resolved — accepted Option C |
| 59 | State methodology tracking: dual fields (init + config) | domain 03, 16 | ADR-054 | Covered | Resolved — accepted Option C |
| | **Resolved (formerly unresolved)** | | | | |
| 60 | Package name: `@scaffold-cli/scaffold` | task-breakdown T-053 | ADR-002 | Covered | Resolved as `@scaffold-cli/scaffold`; covered by ADR-002 distribution strategy |

### 1a. Coverage Summary

| Category | Decisions Found | Covered by ADR | Partial | Missing ADR | Implied Only |
|----------|----------------|----------------|---------|-------------|-------------|
| Infrastructure & Platform | 5 | 4 | 0 | 0 | 1 |
| Data & File Formats | 8 | 6 | 0 | 0 | 2 |
| CLI & UX | 10 | 9 | 0 | 0 | 1 |
| Architecture & Patterns | 18 | 18 | 0 | 0 | 0 |
| User Customization | 3 | 3 | 0 | 0 | 0 |
| Quality & Process | 6 | 0 | 0 | 0 | 6 |
| Deferred | 4 | 4 | 0 | 0 | 0 |
| Resolved (formerly proposed) | 5 | 5 | 0 | 0 | 0 |
| Resolved (formerly unresolved) | 1 | 1 | 0 | 0 | 0 |
| **Total** | **60** | **50** | **0** | **0** | **10** |

**ADR coverage: 83% covered (50/60), 0% partial (0/60), 0% missing (0/60), 17% implied (10/60)**

> **Note on implied decisions:** The 10 implied decisions (test framework, TDD policy, YAML conventions, etc.) are all well-documented in specification artifacts — they simply lack dedicated ADRs. For a CLI tool, these are standard engineering choices that don't typically warrant formal ADRs. No action needed unless the team prefers ADR coverage for these items.

---

## 2. ADR Quality Audit

### 2a. Complete ADRs (all sections filled)

**Accepted (40):** ADR-001, ADR-002, ADR-003, ADR-004, ADR-009, ADR-011, ADR-012, ADR-013, ADR-014, ADR-017, ADR-018, ADR-019, ADR-020, ADR-021, ADR-022, ADR-024, ADR-025, ADR-026, ADR-027, ADR-028, ADR-029, ADR-032, ADR-033, ADR-034, ADR-036, ADR-040, ADR-041, ADR-042, ADR-043, ADR-044, ADR-045, ADR-046, ADR-047, ADR-048, ADR-049, ADR-050, ADR-051, ADR-052, ADR-053, ADR-054

**Accepted-deferred (4):** ADR-030, ADR-031, ADR-038, ADR-039

**Superseded (10):** ADR-005, ADR-006, ADR-007, ADR-008, ADR-010, ADR-015, ADR-016, ADR-023, ADR-035, ADR-037

All 54 ADRs have complete Context, Decision, Rationale, Alternatives Considered, and Consequences sections.

### 2b. Incomplete ADRs (TBD in required sections)

None — all proposed ADRs resolved.

### 2c. Proposed/Unresolved ADRs

None — all 5 proposed ADRs accepted (ADR-050 through ADR-054).

---

## 3. Contradiction Report

### 3.1 Test framework undecided vs decided

**Decision A:** system-architecture.md line 1559: "**Test framework**: Jest or Vitest (to be decided in implementation; both are compatible with the TypeScript + Node.js stack)."

**Decision B:** system-architecture.md line 1383: `vitest` listed as test runner. task-breakdown.md line 9: "vitest (tests)" in Tech Stack. operations-runbook.md: 20+ references to Vitest with full configuration details. ADR-001: mentions Vitest in tech stack context.

**Analysis:** The decision HAS been made — Vitest is the test framework. Line 1559 is a stale reference from an earlier draft that wasn't updated when the rest of the document was finalized. The same file contradicts itself (line 1383 vs 1559).

**Recommended Resolution:** Update system-architecture.md line 1559 to read: "**Test framework**: Vitest — fast test execution with native TypeScript support (see operations-runbook.md for configuration)." Minor fix.

### 3.2 Residual mixin references in system-architecture.md

**Decision A:** ADR-041 (accepted): Meta-prompt architecture replaces mixin injection. system-architecture.md line 8 transformation notice: "Build-time prompt resolution and mixin injection replaced by runtime assembly engine."

**Decision B:** system-architecture.md contains 25+ references to mixins, mixin axes, mixin injection, and mixin directories throughout the document body. Some are struck through or annotated as superseded, others are not (e.g., line 251 `list.ts # show methodologies and mixins`, line 602 wizard diagram with "mixin axes", line 843 "5 mixin axes" in build performance, line 914/915 mixin-related error/warning examples).

**Analysis:** This is a documentation hygiene issue, not a decision contradiction. The transformation notice at line 8 correctly states the current architecture. The cross-phase-consistency-report.md (P0 finding #2, P1 finding #8, P2 finding #11) has already flagged this. The residual references create confusion about whether mixins are still part of the architecture.

**Recommended Resolution:** Already tracked in cross-phase-consistency-report.md. Complete the system-architecture.md cleanup per that report's recommendations. No new action needed.

### 3.3 Package name — resolved

**Previously:** task-breakdown.md T-053 had TBD for package name ("scaffold or @scaffold/cli").

**Resolution:** Resolved as `@scaffold-cli/scaffold` (scoped package avoids npm namespace conflicts). Updated inline in T-053; covered by ADR-002 (distribution strategy). No separate ADR needed.

### 3.4 No further contradictions detected

The following areas were checked and found consistent:

- **ADR-036 (--auto != --force) vs cli-contract.md**: Consistent. cli-contract.md §1 and §4 correctly reflect the separation.
- **Depth scale 1-5**: Consistent across ADR-043, config-yml-schema §2 (`minimum: 1, maximum: 5`), cli-contract.md §2 (`depth` integer 1-5), domain 16, and PRD §6.
- **Methodology names (deep/mvp/custom)**: Consistent across config-yml-schema §2 (`enum: [deep, mvp, custom]`), PRD §6, cli-contract.md §2 (init --methodology), and ADR-043.
- **ADR-040 (error accumulate/fail-fast) vs per-command behavior**: Consistent. cli-contract.md §1 correctly applies accumulate to build-time commands and fail-fast to runtime commands.
- **ADR-041 vs superseded domains**: domain-models/index.md correctly marks domains 01, 04, 12 as "Superseded (archived)". Non-superseded domains reference the current meta-prompt architecture.
- **ADR-050 vs ADR-053 (related proposed ADRs)**: Resolution recommendations are complementary (both recommend `reads` field approach). No conflict.
- **ADR-049 vs ADR-054**: ADR-054's recommended dual-fields approach is consistent with ADR-049's principle that "config is source of truth for current methodology; state is historical record."

---

## 4. Deferred Decision Report

| # | Item | Source | Still Unresolved? | Blocks Implementation? | Recommendation |
|---|------|--------|-------------------|----------------------|----------------|
| D-001 | Community methodology marketplace | ADR-031 | Yes (deferred by design) | No — Phase 1 uses bundled methodologies | No action needed for v2 launch |
| D-002 | Prompt versioning and rollback | ADR-038 | Yes (deferred by design) | No — git provides version history | No action needed for v2 launch |
| D-003 | Parallel step execution | PRD §2 non-goal | N/A — explicit non-goal | No | No action needed |
| D-004 | Config inheritance (global defaults) | ADR-030 | Yes (deferred by design) | No — per-project config covers Phase 1 | No action needed for v2 launch |
| D-005 | Pipeline context store (context.json) | ADR-039 | Yes (deferred by design) | No — `reads` field and decisions.jsonl suffice | No action needed for v2 launch |
| D-006 | Context window management strategy | ADR-050 (accepted) | No — resolved | No | Resolved: ADR-050 accepted (reads field + dependency-chain defaults) |
| D-007 | Depth downgrade policy | ADR-051 (accepted) | No — resolved | No | Resolved: ADR-051 accepted (interactive confirmation; --auto warns) |
| D-008 | Decision recording interface | ADR-052 (accepted) | No — resolved | No | Resolved: ADR-052 accepted (AI writes directly to decisions.jsonl) |
| D-009 | Artifact context scope | ADR-053 (accepted) | No — resolved | No | Resolved: ADR-053 accepted (dependency artifacts + explicit reads) |
| D-010 | State methodology tracking fields | ADR-054 (accepted) | No — resolved | No | Resolved: ADR-054 accepted (dual fields: init + config methodology) |
| D-011 | Package name for npm | T-053 | No — resolved as `@scaffold-cli/scaffold` | No | Resolved inline in T-053; covered by ADR-002 |
| D-012 | Test framework (Jest vs Vitest) | architecture §12 line 1559 | No — resolved as Vitest | No | Stale reference fixed in system-architecture.md |

> **Note:** D-006 through D-012 were all resolved in the decision completeness address-findings pass (2026-03-14).

---

## 5. Summary & Recommendations

- **Total decisions extracted:** 60
- **ADR coverage:** 83% covered (50), 0% partial (0), 0% missing (0), 17% implied (10)
- **Incomplete ADRs:** 0
- **Contradictions found:** 1 (documentation hygiene — mixin references, already tracked)
- **Unresolved deferred decisions:** 5 (all deferred by design: D-001 through D-005)
- **Resolved in this pass:** 7 items (ADR-050 through ADR-054, package name, stale test framework reference)

### Resolved findings

1. **~~ADR-052 and ADR-054 (Phase 1 blockers)~~** — Resolved. Both accepted with complete sections. No longer blocks T-007, T-009, T-017, T-018.

2. **~~ADR-050, ADR-051, ADR-053 (Phase 2 blockers)~~** — Resolved. All three accepted with complete sections. No longer blocks T-012, T-015, T-017, T-029.

3. **~~Package name (D-011)~~** — Resolved as `@scaffold-cli/scaffold` in T-053. Covered by ADR-002 distribution strategy.

4. **~~system-architecture.md stale "Jest or Vitest" text~~** — Fixed. Now reads "Vitest" consistently with all other docs.

### Remaining minor findings

5. **system-architecture.md residual mixin references — already tracked.** The cross-phase-consistency-report.md has P0/P1/P2 findings for this. No new action needed.

6. **10 implied decisions lack ADRs** (test framework, TDD policy, YAML conventions, naming conventions, error message design, security posture, license policy, npm provenance, ESM, command set composition). These are standard engineering choices well-documented in specification artifacts. Creating ADRs for these is optional — recommended only if the team values exhaustive ADR coverage.

### Decision architecture assessment

The scaffold v2 ADR system is **well-structured**. The 50 covered decisions form a coherent, interconnected network with clear cross-references. The supersession chain (ADR-041 replacing 7 earlier ADRs, ADR-044 replacing ADR-010, etc.) demonstrates healthy architectural evolution. All 54 ADRs are now in terminal states (accepted, accepted-deferred, or superseded) — no proposed or incomplete ADRs remain. No systemic gaps were found — the remaining implied items are standard engineering choices that don't typically require formal decision records.
