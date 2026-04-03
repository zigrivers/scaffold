# Cross-Phase Consistency Audit Report

**Date:** 2026-03-14
**Methodology:** `knowledge/validation/cross-phase-consistency.md`
**Scope:** All scaffold v2 documentation artifacts

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **P0 — Contradiction** | 5 |
| **P1 — Missing reference** | 11 |
| **P2 — Naming drift** | 6 |
| **P3 — Minor inconsistency** | 3 |
| **Total** | 25 |

The v2 documentation suite has **5 contradictions (P0)** that will cause implementation confusion if not resolved. The most impactful are: (1) testing-strategy.md references source file paths that disagree with the architecture's canonical source tree, (2) the architecture's content directory still describes the pre-ADR-043 methodology system (deep/mvp with manifest.yml), and (3) testing-strategy.md's `PipelineState` test factory uses different field names and values than the schema defined in task-breakdown and ADR-012.

The 11 P1 findings are missing cross-references — concepts defined in one document but absent or named differently in documents that should reference them. The most impactful: multiple ADRs still use `scaffold resume` (the pre-meta-prompt command name) instead of `scaffold run`.

**Overall assessment:** The PRD and architecture are internally consistent with each other. The ADRs are consistent with each other but several haven't been updated for ADR-041 (meta-prompt architecture). The testing-strategy.md has the most inconsistencies — its file path tree and test factories diverge from the architecture's source tree and the schema documents. The task-breakdown.md is mostly consistent with the architecture but has a few file path mismatches.

---

## Entity Registry Findings (Pass 1)

| # | Severity | Concept | Document A says | Document B says | Resolution |
|---|----------|---------|----------------|----------------|------------|
| 1 | P0 | Source file paths for unit tests | testing-strategy.md §3 lists `src/core/frontmatter/parser.ts`, `src/core/dependency/resolver.ts`, `src/core/depth/resolver.ts`, `src/core/lock/manager.ts`, `src/core/decisions/logger.ts`, `src/state/manager.ts`, `src/config/validator.ts` | system-architecture.md §3a lists `src/project/frontmatter.ts`, `src/core/dependency/dependency.ts`, `src/core/assembly/depth-resolver.ts`, `src/state/lock-manager.ts`, `src/state/decision-logger.ts`, `src/state/state-manager.ts`, `src/validation/config-validator.ts` | **Update testing-strategy.md §3** to match architecture source tree. Architecture is the source of truth for module structure. 7 file paths must be corrected. |
| 2 | P0 | Methodology directory & naming | system-architecture.md §3c describes `content/methodologies/deep/manifest.yml` and `content/methodologies/mvp/manifest.yml` | scaffold-v2-prd.md §4 defines three presets: "Deep Domain Modeling", "MVP", "Custom" in `methodology/` directory. ADR-043 confirms `methodology/deep.yml`, `methodology/mvp.yml`, `methodology/custom-defaults.yml` | **Update system-architecture.md §3c** content directory structure to replace `content/methodologies/deep/` with `methodology/deep.yml`, `methodology/mvp.yml`, `methodology/custom-defaults.yml` per ADR-043. The manifest.yml format is superseded. |
| 3 | P0 | `PipelineState` field names | task-breakdown.md T-002 says `PipelineState` has fields: `schema_version`, `config_methodology`, `prompts`, `in_progress`. ADR-012 confirms `prompts` map. | testing-strategy.md §5 factory uses fields: `schema_version`, `methodology`, `in_progress`, `steps` | **Update testing-strategy.md** factories to use `prompts` (not `steps`) and `config_methodology` (not `methodology`). The schema documents are authoritative. |
| 4 | P0 | `schema_version` value | task-breakdown.md T-007 acceptance criteria: "schema_version must be 2" | testing-strategy.md §5 factory: `schema_version: 1` | **Update testing-strategy.md** factory to use `schema_version: 2`. T-007 is the implementation spec. |
| 5 | P0 | Methodology preset loader file path | task-breakdown.md T-006 creates `src/core/methodology/preset-loader.ts`. testing-strategy.md §4a references `src/core/methodology/preset-loader.ts` | system-architecture.md §3a-§3b maps Domain 16 to `src/core/assembly/` with files `depth-resolver.ts` and `methodology-resolver.ts`. No `src/core/methodology/` directory exists in architecture. | **Resolve disagreement:** Either update architecture to add `src/core/methodology/` as a directory, or update task-breakdown T-006 and testing-strategy to place the preset loader in `src/core/assembly/`. Architecture note in §3b mentions Domain 16 shares `src/core/assembly/` with Domain 15. Recommend following architecture — move T-006 files to `src/core/assembly/preset-loader.ts`. |
| 6 | P1 | `scaffold resume` vs `scaffold run` | ADR-012, ADR-019, ADR-040 use `scaffold resume` as the command name | scaffold-v2-prd.md §4/§9, system-architecture.md §1/§4b, testing-strategy.md, task-breakdown.md, domain 09 all use `scaffold run` | **Update ADRs 012, 019, 040** to replace `scaffold resume` with `scaffold run`. The PRD is the source of truth. ADR-034 correctly uses `scaffold run --from`. |
| 7 | P1 | Barrel/index files policy | system-architecture.md §3a line 341: "No barrel/index files — every import uses a direct path" | task-breakdown.md T-002 creates `src/types/index.ts` that "re-exports all types" | **Resolve disagreement:** Either (a) remove `src/types/index.ts` from T-002 and update all imports to use direct paths, or (b) add an exception to the architecture for `src/types/` (types are a reasonable barrel file exception). Recommend option (b) — add a note to architecture §3a acknowledging `src/types/index.ts` as the sole exception. |
| 8 | P1 | Operations contributor workflow paths | operations-runbook.md §8.2 says "Register command in `src/cli/commands/index.ts`" | system-architecture.md §3a: no barrel files; CLI entry point is `src/cli/index.ts` (not `src/cli/commands/index.ts`) | **Update operations-runbook.md §8.2** to say "Register command in `src/cli/index.ts`" (the yargs setup file). |
| 9 | P1 | Operations assembly engine path | operations-runbook.md §2.4 and §8.2 reference `src/core/assembly-engine.ts` | system-architecture.md §3a: `src/core/assembly/engine.ts` (nested directory) | **Update operations-runbook.md** to use `src/core/assembly/engine.ts`. |
| 10 | P1 | Frontmatter field: `outputs` vs `produces` | task-breakdown.md T-004 defines frontmatter field `outputs` (required, array of relative paths) | system-architecture.md §5a references `produces` field in frontmatter: "tracked via `produces` in frontmatter" | **Standardize on one name.** Check domain 08 for the canonical field name. Both documents should use the same name. If `outputs` is canonical (per T-004), update architecture §5a references to `outputs`. |
| 11 | P1 | Frontmatter `reads` field | system-architecture.md §4b step annotations and §5a reference a `reads` frontmatter field: "downstream prompts (via `reads` frontmatter)" | task-breakdown.md T-004 defines frontmatter fields: name, description, phase, dependencies, outputs, conditional, knowledge-base — no `reads` field | **Resolve disagreement:** Either add `reads` to T-004's frontmatter schema, or remove `reads` references from architecture. Check domain 08 for whether `reads` is part of the meta-prompt frontmatter schema. |
| 12 | P1 | Dependency resolver filename | task-breakdown.md T-011 creates `src/core/dependency/resolver.ts` | system-architecture.md §3a has `src/core/dependency/dependency.ts` | **Align filenames.** T-011 also creates `graph.ts` and `eligibility.ts` which match architecture. The primary file is `resolver.ts` (T-011) vs `dependency.ts` (architecture). Update one to match the other. |
| 13 | P2 | "step" vs "prompt" terminology | PRD, CLI commands, architecture use "step": `scaffold run <step>`, "pipeline step", "step completion" | ADR-012: `prompts` map. Domain models: `PromptStateEntry`, `PromptPhaseInfo`. Domain index: "prompt" throughout | **Document the convention:** "step" is the user-facing term (CLI, docs), "prompt" is the data model term (state.json key name, type names). Add a note to the architecture or a glossary mapping the terms. |
| 14 | P2 | Duplicate `info.ts` in source tree | system-architecture.md §3a lines 253-254 lists `info.ts` twice: one for "scaffold info — show current project config" and one for "scaffold info <step> — show step details" | N/A — should be one file handling both use cases | **Fix architecture §3a:** Remove the duplicate line. One `info.ts` handles both `scaffold info` and `scaffold info <step>`. |
| 15 | P2 | Testing strategy unit test directory grouping | testing-strategy.md §3 groups lock, decisions, and depth under `src/core/` | system-architecture.md §3a places lock and decisions under `src/state/`, depth under `src/core/assembly/`, frontmatter under `src/project/` | **Already covered by finding #1** — testing-strategy paths need wholesale update. |
| 16 | P3 | Validator command file path | testing-strategy.md §4g references `src/cli/commands/validate.ts` for the Validator | system-architecture.md §3a lists `src/cli/commands/validate.ts` (matches) but §3b domain-to-module mapping says "scaffold validate CLI command (src/cli/commands/validate.ts) invokes this orchestrator" | No inconsistency — both agree. Included for completeness. |

---

## Data Shape Findings (Pass 2)

| # | Severity | Data Structure | Document A says | Document B says | Resolution |
|---|----------|---------------|----------------|----------------|------------|
| 1 | P0 | `state.json` top-level map key | ADR-012: `prompts: { "tech-stack": {...} }`. state-json-schema.md: `prompts` field. task-breakdown T-002: `prompts` field. | testing-strategy.md §5 factory: `steps: Record<string, PromptStateEntry>` | **Update testing-strategy.md** factory to use `prompts` key. This is the same as Entity Registry finding #3 but from a data shape perspective. |
| 2 | P0 | `PipelineState.schema_version` value | task-breakdown T-007: "schema_version must be 2". T-002: "schema_version" in PipelineState interface. | testing-strategy.md §5 factory: `schema_version: 1` | **Update testing-strategy.md** factory. Same as Entity Registry finding #4. |
| 3 | P1 | Depth resolution precedence levels | testing-strategy.md §4b: 4-level — "CLI flag `--depth 3` (highest) > custom per-step override > methodology preset `default_depth` > built-in default (3)". task-breakdown T-012: 4-level same. | system-architecture.md §3b: "3-level depth precedence" in Domain 16 mapping. ADR-043: describes preset default + custom override but doesn't count "built-in default" as a separate level. | **Update architecture §3b** to say "4-level depth precedence" or document the 4th level. The testing strategy and task breakdown are more specific — they include the built-in fallback default (depth 3) as the 4th level. Architecture's "3-level" likely counts preset < custom.default_depth < custom.steps.step.depth, omitting the hardcoded fallback. |
| 4 | P1 | `PipelineState` field `config_methodology` | task-breakdown T-002: `config_methodology` | testing-strategy.md §5 factory: `methodology` | **Update testing-strategy.md** factory to use `config_methodology`. T-002 specifies the canonical interface. |
| 5 | P1 | Config schema `custom.steps` structure | task-breakdown T-005: "custom (optional object with default_depth 1-5 and steps map)". ADR-043 config example: `custom.steps.create-prd.depth: 4` | testing-strategy.md: no explicit test of `custom.steps` structure beyond T-005's acceptance criteria | No cross-document inconsistency, but testing-strategy §4b depth resolver tests reference `config.yml custom.steps.<step>.depth: 4` which is consistent. Noting for completeness. |
| 6 | P2 | Decision log `completed_by` field | task-breakdown T-009: `completed_by` as required field | testing-strategy.md §5 factory `createTestDecision()`: `completed_by: 'test'` | Consistent. No finding. |
| 7 | P2 | Methodology preset YAML structure | task-breakdown T-006: `name`, `description`, `default_depth`, `steps` map | ADR-043: implicit structure with `default_depth` and methodology names. Architecture §3c uses `manifest.yml` with different structure (superseded). | Architecture §3c content directory must be updated (covered by Entity Registry finding #2). |

---

## Flow Walking Findings (Pass 3)

| # | Severity | Flow | Step | Document A says | Document B says | Resolution |
|---|----------|------|------|----------------|----------------|------------|
| 1 | P1 | `scaffold run` flow | Lock acquisition commands | ADR-019 constraints: "Write commands (`scaffold resume`, `scaffold skip`, `scaffold reset`) MUST acquire the lock" | PRD/architecture/testing: command is `scaffold run`, not `scaffold resume` | **Update ADR-019** constraints section. Replace `scaffold resume` with `scaffold run` in the lockable commands list. |
| 2 | P1 | `scaffold run` flow | Assembly → state update | system-architecture.md §4b: `scaffold run --from X` re-runs step X | ADR-012: `scaffold resume --from` — uses old command name | **Update ADR-012** to use `scaffold run --from`. |
| 3 | P1 | `scaffold build` flow | Platform output directories | system-architecture.md §4a Codex adapter output: `AGENTS.md`, `codex-prompts/*.md` | security-practices.md §7 "What Scaffold Writes": lists `commands/*.md` and `AGENTS.md` but not `codex-prompts/*.md` | **Update security-practices.md §7** write table to include `codex-prompts/*.md` if Codex adapter is part of the build. |
| 4 | P1 | `scaffold init` flow | Build pipeline integration | system-architecture.md §4c: init auto-runs `scaffold build` after writing config | operations-runbook.md §8.2 "Adding a new CLI command" workflow: no mention of init→build auto-trigger | Not a contradiction — operations is a contributor guide, not a flow spec. But the init→build dependency should be mentioned in operations §8.2 for completeness. |
| 5 | P2 | `scaffold run` flow | ADR-040 exit code enumeration | ADR-040: "Exit code 0: No errors, Exit code 1: One or more errors, Exit code 2: Usage error" (3 codes for build-time) | testing-strategy.md §4d and task-breakdown T-029: 6 exit codes (0-5) for `scaffold run` | Not a contradiction — ADR-040 describes the general build-time pattern. `scaffold run` is a runtime command with its own exit code mapping per ADR-025. But ADR-040's constraints section references "exit codes follow the standard convention (0 = success, 1 = error, 2 = usage error, 3 = lock contention)" which omits codes 4 (user cancel) and 5 (assembly failure). The 6-code mapping for `scaffold run` is documented in testing-strategy and task-breakdown. |
| 6 | P2 | Release flow | Homebrew tap naming | operations-runbook.md §4.7: "zigrivers/homebrew-scaffold" | ADR-002: does not specify the tap name | No contradiction — ADR-002 defers tap details to operations. |
| 7 | P3 | `scaffold run` flow | Operations Node.js version status | operations-runbook.md §7.3: "Node 18 reaches EOL (April 2025 — already EOL)" but same section says "As of 2026: Node 18 is the minimum" and CI matrix still includes Node 18 | N/A — internal inconsistency within operations-runbook.md | **Update operations-runbook.md §7.3** to decide: either drop Node 18 from CI (it's EOL) and update `engines.node` to `>=20`, or document why Node 18 is retained despite being EOL. |

---

## Constraint Propagation Findings (Pass 4)

| # | Severity | ADR/Constraint | Downstream Doc | Issue | Resolution |
|---|----------|---------------|----------------|-------|------------|
| 1 | P0 | ADR-041 (meta-prompt architecture) + ADR-043 (depth scale) supersede methodology manifests | system-architecture.md §3c | Architecture §3c content directory structure still describes `content/methodologies/deep/manifest.yml` and `content/methodologies/mvp/manifest.yml` with `overrides/` and `extensions/` subdirectories. This is the ADR-016 manifest format, superseded by ADR-043. | **Rewrite architecture §3c** to reflect the current methodology structure: `methodology/deep.yml`, `methodology/mvp.yml`, `methodology/custom-defaults.yml` as flat YAML preset files. Remove `manifest.yml`, `overrides/`, `extensions/` references. |
| 2 | P0 | ADR-041 supersedes mixin injection | system-architecture.md §3c | Architecture §3c still includes `content/mixins/` directory with 5 mixin axes (task-tracking, tdd, git-workflow, agent-mode, interaction-style). Mixin injection was eliminated by ADR-041. | **Remove or mark as superseded** the `content/mixins/` section in architecture §3c. If mixin content files are retained as knowledge base references, note this explicitly. |
| 3 | P1 | ADR-043 (depth scale 1-5, 3 presets) | system-architecture.md §3b | Architecture §3b says Domain 16 has "3-level depth precedence". Testing and task-breakdown describe a 4-level precedence (CLI flag > custom override > preset default > built-in fallback). | **Update architecture §3b** Domain 16 complexity description to say "4-level depth precedence" if the built-in fallback counts as a level. |
| 4 | P1 | ADR-012 (state.json map-keyed) | testing-strategy.md §5 | Testing strategy factories use `steps` as the map key name instead of `prompts` (per ADR-012). | **Update testing-strategy.md** factories. Covered by finding Entity #3. |
| 5 | P1 | ADR-019 (advisory locking) | ADR-019 constraints | ADR-019 constraints list `scaffold resume` as a lockable command. This was renamed to `scaffold run` per ADR-041/PRD. | **Update ADR-019** constraints. Covered by finding Entity #6. |
| 6 | P1 | ADR-001 (yargs, vitest) | system-architecture.md §3a | Architecture source tree lists `src/cli/index.ts` as "Application entry point, yargs setup, global flags" — consistent with ADR-001. No issue. | No finding. |
| 7 | P1 | ADR-009 (Kahn's algorithm) | task-breakdown T-011 | T-011 creates `src/core/dependency/resolver.ts` but architecture has `src/core/dependency/dependency.ts`. Both describe the same Kahn's algorithm implementation. | **Align filenames** between task-breakdown and architecture. Covered by finding Entity #12. |
| 8 | P1 | ADR-041 (meta-prompt architecture) | system-architecture.md §3c | Architecture §3c note at bottom mentions "mixin injection at build time is superseded" but the full directory listing above still shows the mixin structure in detail. | **Remove the detailed mixin directory listing** — the note acknowledges supersession but the listing remains confusing. |
| 9 | P1 | ADR-002 (npm primary, Homebrew secondary) | operations-runbook.md §4.4 | Operations lists package contents as `dist/`, `pipeline/`, `knowledge/`, `methodology/`. Architecture §3c shows content under `content/base/`, `content/methodologies/`, not at the package root. | **Clarify content directory mapping:** Does `npm pack` flatten `content/` to root-level directories (`pipeline/`, `knowledge/`, `methodology/`), or are they at `content/`? The operations-runbook and architecture must agree on the packaged directory structure. |
| 10 | P2 | ADR-040 (error handling) | testing-strategy.md §4d | Testing strategy error handling integration tests (§7) reference ADR-040 correctly: build-time accumulation, runtime fail-fast, short-circuit behavior. | No finding — consistent. |
| 11 | P2 | ADR-041 supersedes ADR-005/006/007/008/023/035/037 | system-architecture.md §3c | Architecture §3c `content/adapters/codex/tool-map.yml` references "Phrase-level tool-name mapping patterns" — this is ADR-023 which is superseded by ADR-041. | **Remove or update** `tool-map.yml` reference in architecture §3c. If the adapter still uses tool mapping, document it as an adapter concern, not a mixin/injection concern. |
| 12 | P3 | ADR-041 supersedes domain models 01, 04, 12 | domain-models/index.md | Domain model index correctly marks domains 01, 04, 12 as "superseded (archived)" with links to archived files. | No issue — properly handled. |
| 13 | P3 | ADR-003 (CLI as source of truth) | ADR-003 | ADR-003 has an "Architecture update" note acknowledging it predates ADR-041 and references to domain 01/12 are outdated. The core principle is still valid. | Acceptable — the note provides sufficient context. |

---

## Recommended Fix Order

Fix upstream documents first so downstream documents can reference corrected versions.

### Priority 1 — Fix P0s (5 findings, 3 documents to update)

1. **system-architecture.md §3c** — Rewrite content directory structure:
   - Replace `content/methodologies/deep/` and `mvp/` with `methodology/deep.yml`, `methodology/mvp.yml`, `methodology/custom-defaults.yml`
   - Remove or mark superseded: `content/mixins/` directory listing
   - Remove `manifest.yml`, `overrides/`, `extensions/` references
   - Update `content/adapters/codex/tool-map.yml` reference
   - Fix duplicate `info.ts` in §3a source tree (P2, fix while editing)

2. **testing-strategy.md** — Fix `PipelineState` factory and file paths:
   - §3 co-located test tree: update all 7 file paths to match architecture §3a
   - §5 `createTestState()` factory: change `steps` → `prompts`, `methodology` → `config_methodology`, `schema_version: 1` → `schema_version: 2`

3. **task-breakdown.md T-006** — Align file path:
   - Change `src/core/methodology/preset-loader.ts` to `src/core/assembly/preset-loader.ts` (or add `src/core/methodology/` to architecture)

### Priority 2 — Fix P1s (11 findings, 5 documents to update)

4. **ADR-012, ADR-019, ADR-040** — Replace `scaffold resume` with `scaffold run`:
   - ADR-012: `scaffold resume --from` → `scaffold run --from`
   - ADR-019: lockable commands list: `scaffold resume` → `scaffold run`
   - ADR-040: runtime commands list: `scaffold resume` → `scaffold run`

5. **system-architecture.md §3a** — Add barrel file exception:
   - Add note: "`src/types/index.ts` is the sole exception — type re-exports avoid excessive import paths"

6. **system-architecture.md §3b** — Fix depth precedence:
   - Domain 16 complexity: "3-level" → "4-level" depth precedence

7. **system-architecture.md §5a** — Standardize frontmatter field names:
   - Verify `outputs` vs `produces` — use the domain 08 canonical name consistently
   - Verify whether `reads` is a frontmatter field — if so, add to T-004; if not, remove from architecture

8. **operations-runbook.md §8.2** — Fix file paths and barrel file reference:
   - `src/core/assembly-engine.ts` → `src/core/assembly/engine.ts`
   - `src/cli/commands/index.ts` → `src/cli/index.ts`

9. **security-practices.md §7** — Add missing write entry:
   - Add `codex-prompts/*.md` to "What Scaffold Writes" table (if Codex adapter generates these)

10. **task-breakdown.md T-011** — Align filename:
    - `src/core/dependency/resolver.ts` → `src/core/dependency/dependency.ts` (or update architecture)

11. **operations-runbook.md** — Clarify content directory mapping for npm package vs source layout

### Priority 3 — Fix P2s and P3s (9 findings)

12. Add a terminology glossary note mapping "step" (user-facing) ↔ "prompt" (data model)
13. Operations-runbook.md §7.3: Resolve Node 18 EOL status vs CI matrix
14. Fix remaining minor naming drift items

---

## Fix Status

**All 25 findings addressed.** Date: 2026-03-14.

Documents modified:
- `system-architecture.md` — P0-2 (content directory rewrite), P2-14 (duplicate info.ts), P1-7 (barrel file exception), P1-3 (4-level depth), P1-10/P1-11 (`produces` → `outputs`, removed `reads` frontmatter), Constraint-1/2/9/11 (methodology/mixin/adapter cleanup), `Resume` → `Run` in §5a
- `testing-strategy.md` — P0-1 (7 file paths), P0-3 (factory fields), P0-4 (schema_version), P0-5 co-fix (preset loader path), P1-4 (config_methodology), remaining §4 paths, §9 coverage table paths
- `task-breakdown.md` — P0-5 (T-006 path), P1-12 (T-011 filename)
- `operations-runbook.md` — P1-8 (§8.2 barrel file), P1-9 (§2.4/§8.2 assembly path), P3 (§7.3 Node 18 clarification)
- `security-practices.md` — P1 Flow Walking #3 (added `codex-prompts/*.md`, `prompts/*.md`, `scaffold-pipeline.md`, `CLAUDE.md` to writes table)
- `ADR-012-state-file-design.md` — `scaffold resume` → `scaffold run`
- `ADR-019-advisory-locking.md` — `scaffold resume` → `scaffold run`
- `ADR-040-error-handling-philosophy.md` — `scaffold resume` → `scaffold run`
