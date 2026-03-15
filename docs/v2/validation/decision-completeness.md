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
| | **Proposed (unresolved, with ADRs)** | | | | |
| 55 | Context window management strategy | PRD §9, domain 15 | ADR-050 | Incomplete | TBD; resolution rec: Option D (reads field) |
| 56 | Depth downgrade policy | domain 16 | ADR-051 | Incomplete | TBD; resolution rec: Option C (interactive confirm) |
| 57 | Decision recording interface | domain 11, 15 | ADR-052 | Incomplete | TBD; resolution rec: Option A (AI writes directly) |
| 58 | Artifact context scope | domain 15 | ADR-053 | Incomplete | TBD; resolution rec: Option C (deps + reads) |
| 59 | State methodology tracking fields | domain 03, 16 | ADR-054 | Incomplete | TBD; resolution rec: Option C (dual fields) |
| | **Unresolved (no ADR)** | | | | |
| 60 | Package name: `scaffold` vs `@scaffold-cli/scaffold` | task-breakdown T-053 | — | Missing | TBD in T-053 acceptance criteria |

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
| Proposed (unresolved) | 5 | 0 | 5 | 0 | 0 |
| Unresolved (no ADR) | 1 | 0 | 0 | 1 | 0 |
| **Total** | **60** | **44** | **5** | **1** | **10** |

**ADR coverage: 73% covered (44/60), 8% partial (5/60), 2% missing (1/60), 17% implied (10/60)**

> **Note on implied decisions:** The 10 implied decisions (test framework, TDD policy, YAML conventions, etc.) are all well-documented in specification artifacts — they simply lack dedicated ADRs. For a CLI tool, these are standard engineering choices that don't typically warrant formal ADRs. No action needed unless the team prefers ADR coverage for these items.

---

## 2. ADR Quality Audit

### 2a. Complete ADRs (all sections filled)

**Accepted (35):** ADR-001, ADR-002, ADR-003, ADR-004, ADR-009, ADR-011, ADR-012, ADR-013, ADR-014, ADR-017, ADR-018, ADR-019, ADR-020, ADR-021, ADR-022, ADR-024, ADR-025, ADR-026, ADR-027, ADR-028, ADR-029, ADR-032, ADR-033, ADR-034, ADR-036, ADR-040, ADR-041, ADR-042, ADR-043, ADR-044, ADR-045, ADR-046, ADR-047, ADR-048, ADR-049

**Accepted-deferred (4):** ADR-030, ADR-031, ADR-038, ADR-039

**Superseded (10):** ADR-005, ADR-006, ADR-007, ADR-008, ADR-010, ADR-015, ADR-016, ADR-023, ADR-035, ADR-037

All 49 non-proposed ADRs have complete Context, Decision, Rationale, Alternatives Considered, and Consequences sections.

### 2b. Incomplete ADRs (TBD in required sections)

| ADR | Missing Sections | Severity |
|-----|-----------------|----------|
| ADR-050 | Decision, Rationale, Alternatives, Consequences all TBD | Major — blocks T-015, T-017 |
| ADR-051 | Decision, Rationale, Alternatives, Consequences all TBD | Minor — blocks T-012, T-029 |
| ADR-052 | Decision, Rationale, Alternatives, Consequences all TBD | Major — blocks T-009, T-017 |
| ADR-053 | Decision, Rationale, Alternatives, Consequences all TBD | Major — blocks T-015, T-017 |
| ADR-054 | Decision, Rationale, Alternatives, Consequences all TBD | Major — blocks T-007, T-018 |

All 5 incomplete ADRs have Options listed and Resolution Recommendations appended (added by traceability gap analysis).

### 2c. Proposed/Unresolved ADRs

| ADR | Topic | Blocks Tasks | Has Resolution Recommendation? |
|-----|-------|-------------|-------------------------------|
| ADR-050 | Context window management | T-015, T-017 (Phase 2) | Yes — Option D (reads field + dependency-chain defaults) |
| ADR-051 | Depth downgrade policy | T-012, T-029 (Phase 2) | Yes — Option C (interactive confirmation; --auto warns) |
| ADR-052 | Decision recording interface | T-009, T-017 (Phase 1) | Yes — Option A (AI writes directly to decisions.jsonl) |
| ADR-053 | Artifact context scope | T-015, T-017 (Phase 2) | Yes — Option C (dependency artifacts + explicit reads) |
| ADR-054 | State methodology tracking | T-007, T-018 (Phase 1) | Yes — Option C (dual fields: init + config methodology) |

**Resolution priority:** ADR-052 and ADR-054 block Phase 1 tasks and should be resolved first. ADR-050, ADR-051, ADR-053 block Phase 2 tasks.

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

### 3.3 Package name unresolved

**Decision A:** task-breakdown.md T-053 line 1633: "Set `package.json` fields: `name` (TBD -- scaffold or @scaffold/cli)"

**Decision B:** No ADR or other artifact resolves this. The name appears variously as "scaffold" in the PRD and CLI contract.

**Analysis:** This is an unresolved decision, not a contradiction. It's a packaging detail that doesn't affect architecture but must be resolved before npm publish (T-053).

**Recommended Resolution:** Decide on `@scaffold-cli/scaffold` (scoped, avoids npm name conflicts) or `scaffold-cli` (unscoped, simpler). Create a brief ADR or resolve inline in T-053.

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
| D-006 | Context window management strategy | ADR-050 (proposed) | **Yes** | **Yes** — T-015, T-017 (Phase 2) | Resolve ADR-050 before Phase 2; accept recommended Option D |
| D-007 | Depth downgrade policy | ADR-051 (proposed) | **Yes** | **Yes** — T-012, T-029 (Phase 2) | Resolve ADR-051 before Phase 2; accept recommended Option C |
| D-008 | Decision recording interface | ADR-052 (proposed) | **Yes** | **Yes** — T-009, T-017 (Phase 1) | **Resolve before Phase 1**; accept recommended Option A |
| D-009 | Artifact context scope | ADR-053 (proposed) | **Yes** | **Yes** — T-015, T-017 (Phase 2) | Resolve with ADR-050 before Phase 2; accept recommended Option C |
| D-010 | State methodology tracking fields | ADR-054 (proposed) | **Yes** | **Yes** — T-007, T-018 (Phase 1) | **Resolve before Phase 1**; accept recommended Option C |
| D-011 | Package name for npm | T-053 (TBD) | **Yes** | **Yes** — T-053 (Phase 4) | Decide before T-053; recommend scoped `@scaffold-cli/scaffold` |
| D-012 | Test framework (Jest vs Vitest) | architecture §12 line 1559 | **No** — resolved as Vitest | No | Fix stale reference in system-architecture.md |

> **Note:** D-011 and D-012 were newly discovered by this audit. D-012 is already resolved in practice (Vitest chosen) but has a stale reference.

---

## 5. Summary & Recommendations

- **Total decisions extracted:** 60
- **ADR coverage:** 73% covered (44), 8% partial/proposed (5), 2% missing (1), 17% implied (10)
- **Incomplete ADRs:** 5 (all proposed: ADR-050 through ADR-054)
- **Contradictions found:** 2 (1 stale reference, 1 documentation hygiene — both minor)
- **Unresolved deferred decisions:** 10 (5 deferred by design, 5 proposed with recommendations)
- **Newly discovered unresolved items:** 2 (package name, stale test framework reference)

### Critical findings (must resolve before implementation)

1. **ADR-052 (decision recording interface) and ADR-054 (state methodology tracking) block Phase 1 tasks.** Both have resolution recommendations. Accept the recommended options and update ADR status to `accepted` before starting T-007, T-009, or T-017.

### Major findings (resolve during Phase 0-1)

2. **ADR-050, ADR-051, ADR-053 block Phase 2 tasks.** All have resolution recommendations. Resolve before starting Phase 2 (T-012, T-015, T-017, T-029). ADR-050 and ADR-053 should be resolved together (complementary `reads` field approach).

3. **Package name (D-011) must be decided before T-053 (Phase 4).** Recommend `@scaffold-cli/scaffold` to avoid npm namespace conflicts.

### Minor findings (resolve as encountered)

4. **system-architecture.md line 1559 — stale "Jest or Vitest" text.** Fix to say Vitest. One-line edit.

5. **system-architecture.md residual mixin references — already tracked.** The cross-phase-consistency-report.md has P0/P1/P2 findings for this. No new action needed.

6. **10 implied decisions lack ADRs** (test framework, TDD policy, YAML conventions, naming conventions, error message design, security posture, license policy, npm provenance, ESM, command set composition). These are standard engineering choices well-documented in specification artifacts. Creating ADRs for these is optional — recommended only if the team values exhaustive ADR coverage.

### Decision architecture assessment

The scaffold v2 ADR system is **well-structured**. The 44 covered decisions form a coherent, interconnected network with clear cross-references. The supersession chain (ADR-041 replacing 7 earlier ADRs, ADR-044 replacing ADR-010, etc.) demonstrates healthy architectural evolution. The 5 proposed ADRs are genuine open questions with well-analyzed resolution recommendations. No systemic gaps were found — the missing/implied items are standard engineering choices that don't typically require formal decision records.
