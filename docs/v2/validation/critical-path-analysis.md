# Scaffold v2 Critical Path Analysis

**Date:** 2026-03-14
**Methodology:** `knowledge/validation/critical-path-analysis.md`
**Scope:** 10 critical journeys traced across 9 specification artifacts

---

## Summary

| Journey | Steps Traced | Gaps Found | Critical Gaps | Assessment |
|---------|-------------|-----------|---------------|------------|
| 1. Fresh project initialization | 12 | 0 | 0 | Complete |
| 2. Full pipeline execution | 8 | 2 | 1 | Mostly Complete |
| 3. Single step execution | 17 | 3 | 1 | Complete |
| 4. MVP-to-Deep upgrade | 9 | 3 | 1 | Complete |
| 5. Multi-agent parallel execution | 8 | 1 | 0 | Mostly Complete |
| 6. Brownfield adoption | 10 | 1 | 0 | Mostly Complete |
| 7. Step re-run with update mode | 8 | 1 | 0 | Mostly Complete |
| 8. Error recovery | 7 | 1 | 0 | Mostly Complete |
| 9. CI/CD integration | 6 | 1 | 0 | Mostly Complete |
| 10. User instruction customization | 6 | 1 | 0 | Mostly Complete |

**Overall:** 10 journeys traced, 12 unique gaps (some appear in multiple journeys), 2 critical gaps

---

## Journey 1: Fresh Project Initialization

**Description:** A user creates a new scaffold project from an empty directory, going through the init wizard to produce a configured pipeline ready for execution.
**PRD Source:** §1 (problem statement — audience scaling), §4 (methodology presets), §6 (value proposition — "scaffold init")
**Priority:** Critical

### Steps

#### Step 1: User runs `scaffold init "My REST API"`
- **CLI:** `scaffold init [idea] [flags]` — found in cli-contract.md §2 (scaffold init)
- **Component:** CLI Shell (domain 09) — found in system-architecture.md §2a
- **State:** No state exists yet — correct for greenfield
- **Config:** No config exists yet — this command creates it
- **Task:** T-033 (init wizard), T-019 (CLI framework) — found
- **Error path:** If `.scaffold/` exists → `INIT_SCAFFOLD_EXISTS` (exit 1) — found in error-messages.md §3.1
- **Connection to next:** Idea text passed to Init Wizard — verified

#### Step 2: Check for existing `.scaffold/` directory
- **CLI:** Part of `scaffold init` pre-wizard phase — found in cli-contract.md
- **Component:** CLI Shell — found
- **State:** Checks filesystem for `.scaffold/config.yml` — found in cli-contract.md
- **Config:** N/A
- **Task:** T-033 — found
- **Error path:** `INIT_SCAFFOLD_EXISTS` if exists without `--force` — found
- **Connection to next:** If absent → proceed to detection sweep — verified

#### Step 3: Project Detector runs detection sweep
- **CLI:** Internal to `scaffold init` — found
- **Component:** Project Detector (domain 07) — found in system-architecture.md §2a, §4c
- **State:** N/A
- **Config:** N/A
- **Task:** T-032 (project detector) — found
- **Error path:** Detection is informational — no error paths — correct per ADR-028
- **Connection to next:** Returns `DetectionResult` with mode (greenfield/brownfield/v1) — verified

#### Step 4: Init Wizard analyzes idea text + file signals
- **CLI:** Internal to `scaffold init` — found
- **Component:** Init Wizard (domain 14) — found in system-architecture.md §2a
- **State:** N/A
- **Config:** N/A
- **Task:** T-033 (init wizard) — found
- **Error path:** N/A (analysis, not validation)
- **Connection to next:** Produces smart methodology suggestion — verified per ADR-027

#### Step 5: Wizard presents methodology selection
- **CLI:** Interactive prompt via @inquirer/prompts — found in cli-contract.md
- **Component:** Init Wizard — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-033 — found
- **Error path:** `USER_CANCELLED` (exit 4) if user declines — found
- **Connection to next:** Selected methodology feeds platform selection — verified

#### Step 6: Wizard asks for platform selection
- **CLI:** Interactive prompt — found
- **Component:** Init Wizard — found
- **State:** N/A
- **Config:** `platforms` field populated — found in config-yml-schema.md §2
- **Task:** T-033 — found
- **Error path:** `INIT_NO_PLATFORMS` (exit 1) if none selected — found in cli-contract.md
- **Connection to next:** Platforms feed confirmation — verified

#### Step 7: User confirms configuration
- **CLI:** Interactive confirmation prompt — found
- **Component:** Init Wizard — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-033 — found
- **Error path:** `USER_CANCELLED` (exit 4) on decline — found
- **Connection to next:** Confirmation triggers file writes — verified

#### Step 8: Write `.scaffold/config.yml`
- **CLI:** Internal to `scaffold init` — found
- **Component:** Init Wizard → Config Loader (validation) — found in system-architecture.md §4c
- **State:** N/A
- **Config:** Created with version 2, methodology, platforms, project — found in config-yml-schema.md
- **Task:** T-033, T-005 (config loader for validation) — found
- **Error path:** Write failure → build error propagation — found
- **Connection to next:** Config feeds state initialization — verified

#### Step 9: Initialize `state.json` with all steps pending
- **CLI:** Internal to `scaffold init` — found
- **Component:** State Manager (domain 03) — found in system-architecture.md §4c
- **State:** Created with schema_version 2, all steps `pending`, `in_progress: null` — found in state-json-schema.md
- **Config:** Reads methodology to determine step set — found
- **Task:** T-007 (state manager), T-033 — found
- **Error path:** N/A (fresh creation)
- **Connection to next:** State feeds build — verified

#### Step 10: Create empty `decisions.jsonl`
- **CLI:** Internal to `scaffold init` — found
- **Component:** Init Wizard — found in system-architecture.md §4c
- **State:** N/A
- **Config:** N/A
- **Task:** T-033 — found
- **Error path:** N/A (fresh creation)
- **Connection to next:** Decisions log ready for pipeline execution — verified

#### Step 11: Auto-run `scaffold build`
- **CLI:** Internal to `scaffold init` (auto-invokes build pipeline from §4a) — found
- **Component:** Build Pipeline (Config Loader → Frontmatter Parser → Methodology Resolver → Dependency Resolver → Platform Adapters) — found in system-architecture.md §4a
- **State:** N/A (build is read-only for state)
- **Config:** Reads config for methodology, platforms — found
- **Task:** T-034 (build), T-039-T-042 (adapters) — found
- **Error path:** Build errors → exit 5 — found in cli-contract.md
- **Connection to next:** Generates platform wrappers — verified

#### Step 12: Print pipeline overview and next steps
- **CLI:** Success output from `scaffold init` — found in cli-contract.md
- **Component:** CLI Shell — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-033 — found
- **Error path:** N/A (display only)
- **Connection to next:** Terminal step — user runs `scaffold run` or `scaffold next`

### Gaps Found

None — this journey is fully specified across all artifacts.

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [x] All error paths documented

---

## Journey 2: Full Pipeline Execution

**Description:** A user runs all pipeline steps from Phase 1 through finalization using `scaffold next` and `scaffold run` in sequence.
**PRD Source:** §4 (meta-prompt pipeline), §9 (assembly engine), Success Criteria §18
**Priority:** Critical

### Steps

#### Step 1: User runs `scaffold status` to see pipeline state
- **CLI:** `scaffold status [flags]` — found in cli-contract.md §2
- **Component:** State Manager, Dependency Resolver, CLI Shell — found
- **State:** Reads state.json — found
- **Config:** Reads config for methodology display — found
- **Task:** T-023 (status command) — found
- **Error path:** STATE_PARSE_ERROR (exit 3) if state corrupt — found
- **Connection to next:** User sees "0/N complete" → runs `scaffold next` — verified

#### Step 2: User runs `scaffold next` to find first eligible step
- **CLI:** `scaffold next [flags]` — found in cli-contract.md §2
- **Component:** Dependency Resolver (domain 02), State Manager — found
- **State:** Reads state.json, computes eligibility — found
- **Config:** N/A
- **Task:** T-024 (next command) — found
- **Error path:** State errors (exit 3) — found
- **Connection to next:** Displays eligible step(s) with `scaffold run <step>` command — verified

#### Step 3: User runs `scaffold run <first-step>`
- **CLI:** `scaffold run <step> [flags]` — found in cli-contract.md §2
- **Component:** Full assembly engine pipeline — found in system-architecture.md §4b
- **State:** Sets in_progress, later marks completed — found
- **Config:** Reads methodology, depth — found
- **Task:** T-029 (run command) — found
- **Error path:** LOCK_HELD, DEPENDENCY_UNMET, ASSEMBLY_FAILED — found
- **Connection to next:** Shows next eligible step(s) after completion — verified

#### Step 4: Assembly engine constructs 7-section prompt
- **CLI:** Internal to `scaffold run` — found
- **Component:** Assembly Engine (domain 15) — found in system-architecture.md §4b
- **State:** N/A (reads only)
- **Config:** Reads depth, methodology — found
- **Task:** T-017 (assembly engine) — found
- **Error path:** ASSEMBLY_FAILED (exit 5) — found
- **Connection to next:** Prompt outputted to stdout — verified

#### Step 5: Prompt outputted, AI executes
- **CLI:** Assembled prompt on stdout — found in cli-contract.md (success output)
- **Component:** External (outside scaffold) — found in system-architecture.md §6a
- **State:** `in_progress` is set — found
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** Process crash → crash recovery on next invocation — found per ADR-018
- **Connection to next:** **Gap G-001** — see below

#### Step 6: State updated, decisions logged
- **CLI:** Post-completion phase of `scaffold run` — found in cli-contract.md
- **Component:** State Manager, Decision Logger — found
- **State:** Step marked `completed`, `in_progress` cleared — found
- **Config:** N/A
- **Task:** T-029, T-009 — found
- **Error path:** PSM_WRITE_FAILED (exit 3) — found
- **Connection to next:** Feeds next iteration — verified

#### Step 7: User runs `scaffold next` again, repeats for each step
- **CLI:** Same as step 2 — found
- **Component:** Same as step 2 — found
- **State:** Updated state shows new eligible steps — found
- **Config:** N/A
- **Task:** T-024 — found
- **Error path:** Same as step 2
- **Connection to next:** Loop until pipeline complete — verified

#### Step 8: Pipeline complete — `scaffold next` shows "Pipeline complete"
- **CLI:** `scaffold next` — found in cli-contract.md
- **Component:** Dependency Resolver — all steps completed → "Pipeline complete" — found
- **State:** All steps `completed` or `skipped` — found
- **Config:** N/A
- **Task:** T-024 — found
- **Error path:** N/A
- **Connection to next:** Terminal — user has completed pipeline

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-001 | AI execution lifecycle: the mechanism by which scaffold transitions from "prompt outputted" to "mark completed" is not explicitly described. The architecture shows a sequential flow (set in_progress → output prompt → agent executes → mark completed) but scaffold exits after outputting the prompt. Crash recovery (ADR-018) appears to be the de facto completion detection mechanism, but this is presented as an error recovery path, not the primary flow. | Underspecified behavior | Critical | system-architecture.md §4b, cli-contract.md (scaffold run), ADR-018 | Partially (T-008, T-029) | Add explicit specification of the completion handoff mechanism. Options: (a) scaffold blocks and presents a completion confirmation prompt, (b) crash recovery is documented as the primary completion path, (c) a `scaffold complete <step>` command is added. Document whichever approach is intended. |
| G-004 | Decision recording interface contradicts across specs. ADR-052 decides "AI writes directly to decisions.jsonl using file tools." Architecture §4b and cli-contract.md show Decision Logger (CLI component) appending decisions post-completion as step 9 of the run flow. These are incompatible approaches. | Broken connection | Major | ADR-052, system-architecture.md §4b, cli-contract.md (scaffold run §7), decisions-jsonl-schema.md | T-009 covers CLI-side; no task for ADR-052 approach | Reconcile ADR-052 with architecture. If AI writes directly, remove Decision Logger post-completion step from run flow. If CLI writes, update ADR-052 to match. Recommend CLI-writes approach since it ensures atomic ID assignment and schema validation. |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [ ] All error paths documented — **G-001**: completion handoff mechanism underspecified

---

## Journey 3: Single Step Execution

**Description:** A user runs `scaffold run create-prd` for one specific step, exercising the full assembly engine pipeline including dependency checking, prompt construction, and state management.
**PRD Source:** §9 (assembly engine 9-step sequence), §4 (pipeline step lifecycle)
**Priority:** Critical

### Steps

#### Step 1: User runs `scaffold run create-prd`
- **CLI:** `scaffold run <step>` — found in cli-contract.md §2
- **Component:** CLI Shell — found
- **State:** N/A (not yet read)
- **Config:** N/A (not yet read)
- **Task:** T-029 — found
- **Error path:** Invalid args → exit 1 — found
- **Connection to next:** Args parsed, dispatched to run handler — verified

#### Step 2: Check lock.json
- **CLI:** Internal to `scaffold run` — found
- **Component:** Lock Manager (domain 13) — found in system-architecture.md §4b
- **State:** Reads `.scaffold/lock.json` — found
- **Config:** N/A
- **Task:** T-010 (lock manager) — found
- **Error path:** LOCK_HELD (exit 3) if held and not `--force` — found
- **Connection to next:** Lock acquired → proceed to config read — verified

#### Step 3: Read + validate config.yml
- **CLI:** Internal to `scaffold run` — found
- **Component:** Config Loader (domain 06) — found
- **State:** N/A
- **Config:** Reads and validates `.scaffold/config.yml` — found
- **Task:** T-005 (config loader) — found
- **Error path:** CONFIG_* errors (exit 1) — found
- **Connection to next:** Valid config feeds state read — verified

#### Step 4: Read state.json
- **CLI:** Internal to `scaffold run` — found
- **Component:** State Manager (domain 03) — found
- **State:** Reads `.scaffold/state.json` — found
- **Config:** N/A
- **Task:** T-007 (state manager) — found
- **Error path:** STATE_PARSE_ERROR, STATE_CORRUPTED (exit 3) — found
- **Connection to next:** State feeds crash check — verified

#### Step 5: Check `in_progress` (crash recovery if non-null)
- **CLI:** Internal to `scaffold run` — found in cli-contract.md (interactive behavior §2)
- **Component:** State Manager, Completion Detection — found in system-architecture.md §4b
- **State:** Checks `in_progress` field — found
- **Config:** N/A
- **Task:** T-008 (completion detection) — found
- **Error path:** PSM_CRASH_DETECTED warning — found
- **Connection to next:** Crash resolved → proceed to eligibility — verified

#### Step 6: Compute eligible steps from dependency graph
- **CLI:** Internal to `scaffold run` — found
- **Component:** Dependency Resolver (domain 02) — found
- **State:** Reads step statuses — found
- **Config:** N/A
- **Task:** T-011 (dependency resolver) — found
- **Error path:** N/A (computation, not validation at this point)
- **Connection to next:** Target step validated — verified

#### Step 7: Validate target step exists
- **CLI:** Internal to `scaffold run` — found
- **Component:** CLI Shell — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** DEP_TARGET_MISSING (exit 2) with fuzzy match suggestion — found
- **Connection to next:** Valid target → check prerequisites — verified

#### Step 8: Check predecessor output artifacts
- **CLI:** Internal to `scaffold run` — found
- **Component:** State Manager — found in system-architecture.md §4b
- **State:** Checks predecessor `outputs` on disk — found
- **Config:** N/A
- **Task:** T-008, T-029 — found
- **Error path:** DEPENDENCY_MISSING_ARTIFACT (exit 2 in `--auto`), interactive offer in default mode — found
- **Connection to next:** Prerequisites met → set in_progress — verified

#### Step 9: Set `in_progress` in state.json
- **CLI:** Internal to `scaffold run` — found
- **Component:** State Manager — found
- **State:** Step status → `in_progress`, `in_progress` record populated — found in state-json-schema.md
- **Config:** N/A
- **Task:** T-007 — found
- **Error path:** PSM_ALREADY_IN_PROGRESS (exit 3) if another step in progress — found
- **Connection to next:** State set → assemble prompt — verified

#### Step 10: Load meta-prompt from `pipeline/pre/create-prd.md`
- **CLI:** Internal to `scaffold run` — found
- **Component:** Assembly Engine → Meta-Prompt Loader — found in system-architecture.md §4b
- **State:** N/A
- **Config:** N/A
- **Task:** T-013 (meta-prompt loader) — found
- **Error path:** ASSEMBLY_FAILED if meta-prompt missing — found
- **Connection to next:** Meta-prompt feeds knowledge base loading — verified

#### Step 11: Load knowledge base entries
- **CLI:** Internal to `scaffold run` — found
- **Component:** Assembly Engine → Knowledge Loader — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-014 (knowledge loader) — found
- **Error path:** FRONTMATTER_KB_ENTRY_MISSING if referenced entry not found — found
- **Connection to next:** KB entries feed context gathering — verified

#### Step 12: Gather project context (artifacts, config, state, decisions)
- **CLI:** Internal to `scaffold run` — found
- **Component:** Assembly Engine → Context Gatherer — found in system-architecture.md §4b
- **State:** Reads completed artifacts, state snapshot — found
- **Config:** Reads config snapshot — found
- **Task:** T-015 (context gatherer) — found
- **Error path:** Missing artifact files → warning (continues) — found
- **Connection to next:** Context feeds instruction loading — verified

#### Step 13: Load user instructions (three layers)
- **CLI:** Internal to `scaffold run` — found
- **Component:** Assembly Engine → Instruction Loader — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-016 (instruction loader) — found
- **Error path:** Missing files silently skipped; empty file → ASM_INSTRUCTION_EMPTY warning — found
- **Connection to next:** Instructions feed depth resolution — verified

#### Step 14: Determine depth from methodology config
- **CLI:** Internal to `scaffold run` — found
- **Component:** Assembly Engine → Depth Resolver — found in system-architecture.md §4b
- **State:** N/A
- **Config:** Reads methodology preset, custom overrides — found
- **Task:** T-012 (depth resolution) — found
- **Error path:** N/A (uses defaults if not specified)
- **Connection to next:** Depth feeds prompt construction — verified
- **Gap:** G-005 — see below

#### Step 15: Construct 7-section assembled prompt
- **CLI:** Internal to `scaffold run` — found
- **Component:** Assembly Engine (domain 15) — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-017 (assembly engine) — found
- **Error path:** ASSEMBLY_FAILED (exit 5) — found
- **Connection to next:** Prompt → stdout — verified

#### Step 16: Output assembled prompt to stdout
- **CLI:** stdout output — found in cli-contract.md (success output)
- **Component:** CLI Shell — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** N/A
- **Connection to next:** **Gap G-001** (completion handoff) — see Journey 2

#### Step 17: Post-completion — mark completed, log decisions, fill CLAUDE.md, release lock, show next
- **CLI:** Post-completion phase — found in cli-contract.md
- **Component:** State Manager, Decision Logger, CLAUDE.md Manager, Lock Manager — found
- **State:** Step → `completed`, `in_progress` → null, decisions appended — found
- **Config:** N/A
- **Task:** T-007, T-009, T-043, T-010, T-029 — found
- **Error path:** PSM_WRITE_FAILED (exit 3) — found
- **Connection to next:** Terminal — user sees next eligible step

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-001 | (Same as Journey 2) AI execution lifecycle handoff | Underspecified behavior | Critical | system-architecture.md §4b, cli-contract.md | Partially (T-008, T-029) | See Journey 2 recommendation |
| G-004 | (Same as Journey 2) Decision recording interface contradiction | Broken connection | Major | ADR-052, system-architecture.md §4b, cli-contract.md | T-009 | See Journey 2 recommendation |
| G-005 | `--depth` flag missing from CLI contract. The depth resolver (T-012) and system-architecture.md §10b reference a CLI `--depth` flag as the highest-priority depth override. Task T-029 lists `--depth` in its description. But cli-contract.md §2 (scaffold run) only defines `--instructions` and `--force` as command-specific flags — no `--depth`. | Missing endpoint/command | Major | cli-contract.md (scaffold run flags), system-architecture.md §10b, task-breakdown.md T-012/T-029 | T-012 (depth resolver), T-029 (run command) | Add `--depth <1-5>` to scaffold run's command-specific flags in cli-contract.md. Update json-output-schemas.md RunData to include the depth override source. |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [ ] All error paths documented — **G-001** completion handoff, **G-005** missing --depth flag

---

## Journey 4: MVP-to-Deep Upgrade

**Description:** A user initializes with MVP methodology, completes some steps, then changes methodology to Deep and re-runs completed steps at higher depth.
**PRD Source:** §6 (value proposition — methodology flexibility), §4 (methodology presets)
**Priority:** High

### Steps

#### Step 1: User runs `scaffold init --methodology mvp`
- **CLI:** `scaffold init [idea] --methodology mvp` — found in cli-contract.md
- **Component:** Init Wizard — found
- **State:** Created with 4 steps (MVP preset), all `pending` — found
- **Config:** `methodology: mvp` — found
- **Task:** T-033 — found
- **Error path:** Standard init errors — found
- **Connection to next:** MVP pipeline ready — verified

#### Step 2: User completes 2 MVP steps (create-prd, implementation-tasks)
- **CLI:** `scaffold run create-prd`, `scaffold run implementation-tasks` — found
- **Component:** Full run pipeline — found
- **State:** 2 steps `completed` at depth 1 — found
- **Config:** methodology: mvp, default_depth: 1 — found
- **Task:** T-029 — found
- **Error path:** Standard run errors — found
- **Connection to next:** Partial completion → user decides to upgrade — verified

#### Step 3: User edits config.yml to change `methodology: deep`
- **CLI:** Manual file edit (no scaffold command) — correct per ADR-049
- **Component:** N/A (user action)
- **State:** Not yet updated — config is source of truth for current methodology
- **Config:** `methodology: deep` — found in config-yml-schema.md
- **Task:** N/A
- **Error path:** N/A
- **Connection to next:** Next `scaffold run` detects change — verified per ADR-049

#### Step 4: User runs `scaffold run <next-step>`
- **CLI:** `scaffold run <step>` — found
- **Component:** Config Loader, Methodology Resolver — found
- **State:** Reads state, detects methodology mismatch — found
- **Config:** `methodology: deep` (changed) — found
- **Task:** T-012 (methodology resolver), T-018 (methodology change detection), T-029 — found
- **Error path:** N/A (mismatch is a warning, not an error)
- **Connection to next:** Methodology change detected — verified

#### Step 5: CLI detects methodology change and emits warning
- **CLI:** Internal to `scaffold run` — found in cli-contract.md (interactive behavior §5)
- **Component:** Methodology Resolver (domain 16) — found
- **State:** Compares state.json methodology with config.yml methodology — found
- **Config:** N/A
- **Task:** T-018 (methodology change detection) — found
- **Error path:** ASM_METHODOLOGY_CHANGED warning, PSM_METHODOLOGY_MISMATCH warning — found
- **Connection to next:** Pending steps re-resolved — verified
- **Gap:** G-003 — see below

#### Step 6: Pending steps re-resolved with new methodology
- **CLI:** Internal to `scaffold run` — found
- **Component:** Methodology Resolver — found
- **State:** New steps added as `pending`, orphaned steps preserved — found per ADR-049, system-architecture.md §5b
- **Config:** Deep preset loaded — found
- **Task:** T-012 — found
- **Error path:** N/A
- **Connection to next:** New eligible steps available — verified

#### Step 7: Completed steps preserved with lower-depth warnings
- **CLI:** Warnings emitted per cli-contract.md — found
- **Component:** Methodology Resolver — found
- **State:** Completed steps retain original depth and timestamp — found per ADR-049
- **Config:** N/A
- **Task:** T-018 — found
- **Error path:** ASM_COMPLETED_AT_LOWER_DEPTH warning per completed step — found
- **Connection to next:** User may choose to re-run at higher depth — verified

#### Step 8: User re-runs completed step at higher depth
- **CLI:** `scaffold run create-prd` (already completed at depth 1, now depth 5) — found
- **Component:** Assembly Engine with update mode — found per ADR-048
- **State:** Step transitions completed → in_progress → completed (overwritten) — found
- **Config:** Depth 5 from deep preset — found
- **Task:** T-018 (update mode) — found
- **Error path:** N/A (depth upgrade proceeds without confirmation per ADR-051)
- **Connection to next:** Artifact updated at new depth — verified

#### Step 9: User re-runs step at lower depth (Deep→MVP switch back)
- **CLI:** `scaffold run create-prd` at depth 1 (previously depth 5) — found
- **Component:** Assembly Engine, depth downgrade detection — found per ADR-051
- **State:** N/A
- **Config:** methodology: mvp (switched back) — found
- **Task:** T-012, T-029 — found
- **Error path:** Interactive confirmation per ADR-051; `--auto` mode proceeds with DEPTH_DOWNGRADE warning — found in ADR-051
- **Connection to next:** N/A (terminal)
- **Gap:** G-008 — see below

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-003 | state-json-schema.md does not define `init_methodology` field. ADR-054 (accepted) decided on dual methodology tracking fields: `init_methodology` (set at init, never updated) and `config_methodology` (updated on every command). The state schema only has `config_methodology` (from the original schema). Without `init_methodology`, the system cannot distinguish between "methodology was always X" and "methodology was changed to X." | Missing state transition | Critical | state-json-schema.md, ADR-054 | No | Add `init_methodology` field to state-json-schema.md §2 (formal schema) and §3 (field reference). Add migration note for existing state files (default `init_methodology` = `config_methodology`). Update T-007 to set both fields during initialization. |
| G-002 | frontmatter-schema.md explicitly lists `reads` as "Removed" (§1 disposition table). ADR-050 (accepted) and ADR-053 (accepted) establish that meta-prompts need a `reads` frontmatter field for cross-cutting artifact references beyond the dependency chain. The frontmatter schema is inconsistent with these accepted ADRs. | Missing state transition | Major | frontmatter-schema.md §1/§2, ADR-050, ADR-053 | No | Add optional `reads` field to frontmatter-schema.md §2 (formal schema definition) as `array of string, kebab-case step names, default []`. Add validation rules (§7): `reads` entries must reference valid step names. Update the §1 disposition table to show `reads` as "Re-introduced" with note citing ADR-050/053. |
| G-008 | Depth downgrade confirmation (ADR-051) not reflected in CLI contract. ADR-051 specifies: interactive mode shows confirmation prompt on depth downgrade, `--auto` emits DEPTH_DOWNGRADE warning and proceeds, `--force` skips both. The cli-contract.md scaffold run interactive behavior section (§2) does not mention depth downgrade confirmation. | Missing error path | Major | cli-contract.md (scaffold run interactive behavior), ADR-051 | T-012, T-029 describe the behavior | Add depth downgrade confirmation to cli-contract.md scaffold run interactive behavior between steps 4 (methodology change check) and 5 (execution). Include the three-mode behavior (interactive/auto/force). Add DEPTH_DOWNGRADE to the error conditions table as a warning. |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [ ] All steps have state transitions — **G-003**: `init_methodology` field missing from state schema
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [ ] All error paths documented — **G-008**: depth downgrade confirmation not in CLI contract

---

## Journey 5: Multi-Agent Parallel Execution

**Description:** Multiple AI agents work on the pipeline simultaneously in separate git worktrees, each running scaffold independently.
**PRD Source:** §1 (problem statement — parallel agents), §6 (value proposition — multi-agent)
**Priority:** High

### Steps

#### Step 1: User creates git worktrees for each agent
- **CLI:** N/A — git operation, not a scaffold command
- **Component:** N/A (external to scaffold)
- **State:** Each worktree gets its own `.scaffold/` directory — found in system-architecture.md §6b
- **Config:** Each worktree has identical config.yml (git-tracked) — found
- **Task:** No scaffold task — see G-006
- **Error path:** N/A
- **Connection to next:** Each agent has independent scaffold environment — verified

#### Step 2: Agent A runs `scaffold run create-prd` in worktree-a
- **CLI:** `scaffold run create-prd` — found
- **Component:** Full run pipeline — found
- **State:** Worktree-a state.json updated — found
- **Config:** Reads worktree-a config — found
- **Task:** T-029 — found
- **Error path:** Standard run errors — found
- **Connection to next:** Agent A completes, state updated in worktree-a — verified

#### Step 3: Agent B runs `scaffold run tech-stack` in worktree-b (concurrently)
- **CLI:** `scaffold run tech-stack` — found
- **Component:** Full run pipeline — found
- **State:** Worktree-b state.json updated independently — found per system-architecture.md §6b
- **Config:** Same config — found
- **Task:** T-029 — found
- **Error path:** Standard run errors — found
- **Connection to next:** Both agents work independently — verified

#### Step 4: Each agent completes and pushes branch
- **CLI:** N/A (git operations)
- **Component:** N/A
- **State:** N/A
- **Config:** N/A
- **Task:** N/A
- **Error path:** N/A
- **Connection to next:** PRs created — verified

#### Step 5: PRs merged to main — state.json merges cleanly
- **CLI:** N/A (git merge)
- **Component:** N/A
- **State:** Map-keyed state.json → different keys → non-overlapping diff hunks — found per ADR-012, system-architecture.md §6b
- **Config:** N/A
- **Task:** N/A
- **Error path:** Same-step conflict requires manual merge (unlikely) — found
- **Connection to next:** Main has combined state — verified

#### Step 6: decisions.jsonl merges cleanly (append-only)
- **CLI:** N/A
- **Component:** N/A
- **State:** JSONL appends → git auto-merges — found per ADR-013, system-architecture.md §6b
- **Config:** N/A
- **Task:** N/A
- **Error path:** Decision ID collision → detectable by `scaffold validate` — found
- **Connection to next:** Combined decision log — verified

#### Step 7: Agent pulls updated main, sees combined progress
- **CLI:** `scaffold status` — found
- **Component:** State Manager — found
- **State:** Shows combined progress from all agents — found
- **Config:** N/A
- **Task:** T-023 — found
- **Error path:** N/A
- **Connection to next:** Agent continues with next eligible step — verified

#### Step 8: Agents coordinate which steps to work on
- **CLI:** `scaffold next` shows eligible steps — found
- **Component:** Dependency Resolver — found
- **State:** Eligibility computed from combined state — found
- **Config:** N/A
- **Task:** T-024 — found
- **Error path:** Two agents may pick the same step (race condition) — found in system-architecture.md §6c
- **Connection to next:** Agents pick different eligible steps — mostly verified

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-006 | No scaffold command for worktree setup or agent coordination. The PRD references multi-agent parallel execution, and the architecture (§6b) documents the model (separate worktrees, independent state). But there is no `scaffold worktree create` or `scaffold agent setup` command. V1 used `scripts/setup-agent-worktree.sh`. V2 relies on users setting up worktrees manually with git. Additionally, there is no step-claiming mechanism to prevent two agents from selecting the same eligible step — `scaffold next` shows all eligible steps but provides no lock/claim. | Missing endpoint/command | Major | cli-contract.md (no worktree/agent commands), system-architecture.md §6b (model described but no supporting commands), PRD §6 (multi-agent as value proposition) | No | For v2.0, document the manual worktree setup process in the migration guide (T-054). Consider adding `scaffold worktree setup <name>` in a future release. For step claiming, `scaffold next` could support a `--claim` flag or scaffold could integrate with external task trackers. This is acceptable as a v2.1 enhancement since git worktrees are a standard tool. |

### Journey Assessment
- [x] All steps have CLI commands (scaffold commands available; worktree setup is git)
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [x] All error paths documented

---

## Journey 6: Brownfield Adoption

**Description:** A user runs scaffold in an existing project that already has documentation artifacts (docs/plan.md, docs/tech-stack.md, etc.), using either `scaffold init` (brownfield detection path) or `scaffold adopt`.
**PRD Source:** §1 (problem statement — brownfield), §4 (brownfield/v1 migration)
**Priority:** High

### Steps

#### Step 1: User runs `scaffold init` in existing project
- **CLI:** `scaffold init` — found in cli-contract.md
- **Component:** CLI Shell → Project Detector — found
- **State:** No `.scaffold/` exists — correct
- **Config:** N/A
- **Task:** T-032, T-033 — found
- **Error path:** INIT_SCAFFOLD_EXISTS if already initialized — found
- **Connection to next:** Detection sweep begins — verified

#### Step 2: Project Detector finds brownfield signals
- **CLI:** Internal to `scaffold init` — found
- **Component:** Project Detector (domain 07) — found in system-architecture.md §4c
- **State:** N/A
- **Config:** N/A
- **Task:** T-032 — found
- **Error path:** N/A (detection is informational)
- **Connection to next:** Brownfield mode selected (priority 2 after v1 check) — verified per ADR-028

#### Step 3: Project Detector maps existing artifacts to pipeline steps
- **CLI:** Internal — found
- **Component:** Project Detector + Frontmatter Parser (for `outputs` field matching) — found in system-architecture.md §2b
- **State:** N/A
- **Config:** N/A
- **Task:** T-032 — found
- **Error path:** Ambiguous mapping → warning — found
- **Connection to next:** Artifact matches feed wizard — verified

#### Step 4: Init Wizard adapts questions based on brownfield detection
- **CLI:** Wizard flow — found in cli-contract.md
- **Component:** Init Wizard — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-033 — found
- **Error path:** USER_CANCELLED — found
- **Connection to next:** User selects methodology — verified per ADR-027

#### Step 5: Config written, state initialized with brownfield adaptations
- **CLI:** Internal — found
- **Component:** State Manager — found
- **State:** All steps `pending` (brownfield mode adapts at runtime, not init-time) — found in system-architecture.md §4c
- **Config:** Written with detected methodology suggestion — found
- **Task:** T-033, T-007 — found
- **Error path:** N/A
- **Connection to next:** Build auto-runs — verified

#### Step 6: Alternative path — user runs `scaffold adopt`
- **CLI:** `scaffold adopt [flags]` — found in cli-contract.md §2
- **Component:** Project Detector, State Manager — found
- **State:** Writes state.json with pre-completed entries — found
- **Config:** Optionally updates config.yml based on inferred tooling — found in cli-contract.md
- **Task:** T-035 (adopt) — found
- **Error path:** ADOPT_NO_SIGNALS, ADOPT_SCAFFOLD_EXISTS — found in error-messages.md §3.12
- **Connection to next:** State ready, user runs pipeline — verified

#### Step 7: Matched artifacts result in pre-completed steps
- **CLI:** Internal to adopt — found
- **Component:** Project Detector — found
- **State:** Matched steps set to `completed` with artifact verification — found
- **Config:** N/A
- **Task:** T-035 — found
- **Error path:** ADOPT_PARTIAL_MATCH, ADOPT_FUZZY_PATH_MATCH warnings — found
- **Connection to next:** Remaining steps are `pending` — verified

#### Step 8: User runs `scaffold status` to see adopted state
- **CLI:** `scaffold status` — found
- **Component:** State Manager, CLI Shell — found
- **State:** Shows mix of pre-completed and pending — found
- **Config:** N/A
- **Task:** T-023 — found
- **Error path:** N/A
- **Connection to next:** User continues from where adoption left off — verified

#### Step 9: User runs `scaffold run <next-step>` for first non-adopted step
- **CLI:** `scaffold run <step>` — found
- **Component:** Assembly Engine — found
- **State:** Dependency resolver checks adopted steps as completed — found
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** DEPENDENCY_MISSING_ARTIFACT if adopted step's artifact was removed — found
- **Connection to next:** Pipeline continues — verified

#### Step 10: Adopted step re-run in update mode
- **CLI:** `scaffold run <adopted-step>` — found
- **Component:** Assembly Engine with update mode — found per ADR-048
- **State:** Existing artifact included as ExistingArtifact — found
- **Config:** N/A
- **Task:** T-018 — found
- **Error path:** N/A
- **Connection to next:** Artifact updated — verified

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-009 | `scaffold adopt` config creation behavior is ambiguous. cli-contract.md says adopt "Requires project: No (creates `.scaffold/` directory)" and includes `ADOPT_CONFIG_WRITE_FAILED` error code. But it also lists `CONFIG_NOT_FOUND` as an error condition. It's unclear whether adopt creates config from scratch (like init but without the wizard), requires an existing config, or optionally creates one. The adopt side effects say "Optionally updates `.scaffold/config.yml`" — "updates" implies it already exists. | Underspecified behavior | Minor | cli-contract.md (scaffold adopt), error-messages.md §3.12 | T-035 | Clarify in cli-contract.md: adopt either (a) requires existing config.yml (created by a prior `scaffold init`) and only writes state.json, or (b) creates a minimal config from detected signals. The former is simpler and avoids overlap with `scaffold init`. Update "Requires project" accordingly. |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [x] All error paths documented

---

## Journey 7: Step Re-Run with Update Mode

**Description:** A user re-runs a completed step to update its artifact with diff-based changes rather than regenerating from scratch.
**PRD Source:** §9 (update mode), ADR-048
**Priority:** High

### Steps

#### Step 1: User has completed create-prd at depth 3
- **CLI:** Previously ran `scaffold run create-prd` — found
- **Component:** N/A (historical)
- **State:** create-prd → `completed`, depth 3, timestamp, artifacts_verified: true — found
- **Config:** N/A
- **Task:** N/A
- **Error path:** N/A
- **Connection to next:** User decides to re-run — verified

#### Step 2: User runs `scaffold run create-prd` again
- **CLI:** `scaffold run create-prd` — found
- **Component:** CLI Shell → run handler — found
- **State:** Detects step is `completed` — found
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** N/A
- **Connection to next:** Update mode detection — verified

#### Step 3: CLI detects completed step, activates update mode
- **CLI:** cli-contract.md §2 scaffold run interactive behavior §4 — found
- **Component:** Update Mode Detection (T-018) — found in system-architecture.md §4b
- **State:** Checks artifact existence AND completion status — found per ADR-048
- **Config:** N/A
- **Task:** T-018 (update mode) — found
- **Error path:** N/A (auto-detected, no error)
- **Connection to next:** Existing artifact loaded — verified

#### Step 4: Existing artifact loaded as ExistingArtifact in context
- **CLI:** Internal to assembly — found
- **Component:** Context Gatherer — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-015, T-018 — found
- **Error path:** Missing artifact → falls back to full creation mode — found per ADR-048
- **Connection to next:** Feeds prompt assembly — verified

#### Step 5: Assembled prompt includes diff-based update instructions
- **CLI:** Internal to assembly — found
- **Component:** Assembly Engine — found per ADR-048
- **State:** N/A
- **Config:** Depth level for update — found
- **Task:** T-017, T-018 — found
- **Error path:** N/A
- **Connection to next:** Prompt outputted — verified

#### Step 6: AI reviews existing artifact and proposes targeted changes
- **CLI:** Assembled prompt on stdout — found
- **Component:** External (AI execution) — found
- **State:** `in_progress` set — found
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** Same as standard execution (crash recovery) — found
- **Connection to next:** Artifact updated — verified

#### Step 7: State updated (overwriting previous completion data)
- **CLI:** Post-completion — found
- **Component:** State Manager — found
- **State:** Completion timestamp/depth overwritten with new values — found per system-architecture.md §4b
- **Config:** N/A
- **Task:** T-007, T-029 — found
- **Error path:** PSM_WRITE_FAILED — found
- **Connection to next:** Warning about stale downstream steps — verified

#### Step 8: Downstream stale warning emitted
- **CLI:** Post-completion output — found in cli-contract.md (interactive behavior §8)
- **Component:** Dependency Resolver — found per ADR-034
- **State:** N/A
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** DEP_RERUN_STALE_DOWNSTREAM warning — found in system-architecture.md §7c
- **Connection to next:** Terminal — user may re-run downstream steps manually

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-010 | User instruction "override" vs "concatenate" semantics slightly ambiguous. ADR-047 says "later layers override earlier layers." System-architecture.md §10b says "Instructions are concatenated into the Instructions section." Task T-016 says "Returns all three layers separately (for display with provenance)." These three statements are reconcilable (all layers are included in the prompt, with the AI interpreting later ones as higher priority) but could be stated more precisely. | Underspecified behavior | Minor | ADR-047, system-architecture.md §10b, task-breakdown.md T-016 | T-016 | Add a clarification note to ADR-047: "Override means semantic priority, not deletion. All instruction layers are included in the assembled prompt with clear provenance labels. The AI interprets later layers as taking precedence when instructions conflict." |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [x] All error paths documented

---

## Journey 8: Error Recovery

**Description:** A user recovers from a crashed/interrupted step where the process exited mid-execution, leaving `in_progress` set and potentially a stale lock file.
**PRD Source:** §9 (crash recovery), ADR-018
**Priority:** High

### Steps

#### Step 1: Process crashes during `scaffold run create-prd`
- **CLI:** Process exits abnormally — N/A
- **Component:** N/A (crash)
- **State:** `in_progress` = `{ step: "create-prd", started: "...", pid: ... }`, create-prd status = `in_progress` — found in state-json-schema.md
- **Config:** N/A
- **Task:** N/A
- **Error path:** Graceful shutdown handlers (SIGTERM/SIGINT) should call releaseLock() — found per ADR-019. If crash is hard (SIGKILL), lock persists.
- **Connection to next:** Next scaffold invocation triggers recovery — verified

#### Step 2: User runs `scaffold run` (any step)
- **CLI:** `scaffold run <step>` — found
- **Component:** CLI Shell — found
- **State:** Reads state.json — found
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** N/A
- **Connection to next:** Lock check → crash recovery — verified

#### Step 3: Lock Manager checks lock.json
- **CLI:** Internal — found
- **Component:** Lock Manager (domain 13) — found
- **State:** lock.json may exist with dead PID — found
- **Config:** N/A
- **Task:** T-010 — found
- **Error path:** If PID alive and not recycled → LOCK_HELD. If PID dead or recycled → LOCK_STALE_DETECTED, auto-clear — found per ADR-019
- **Connection to next:** Lock cleared or acquired — verified

#### Step 4: State Manager detects `in_progress` is non-null
- **CLI:** Internal — found in cli-contract.md (scaffold run interactive behavior §2)
- **Component:** State Manager, Completion Detection — found in system-architecture.md §4b
- **State:** `in_progress` field is non-null — found
- **Config:** N/A
- **Task:** T-008 (completion detection) — found
- **Error path:** PSM_CRASH_DETECTED warning — found
- **Connection to next:** Artifact check — verified

#### Step 5: Crash recovery decision matrix applied
- **CLI:** Interactive prompts for crash recovery — found in cli-contract.md
- **Component:** Completion Detection — found
- **State:** Checks `outputs` artifacts on disk — found
- **Config:** N/A
- **Task:** T-008 — found
- **Error path:** Three paths: all present → auto-complete; none → re-run offer; partial → user choice — found per ADR-018, system-architecture.md §4b
- **Connection to next:** Recovery action taken — verified

#### Step 6: Auto-complete (all artifacts present) or re-run (no artifacts)
- **CLI:** Auto-completion happens silently; re-run triggers normal flow — found
- **Component:** State Manager — found
- **State:** Step marked `completed` (auto-complete) or returned to `pending` for re-run — found
- **Config:** N/A
- **Task:** T-008, T-007 — found
- **Error path:** N/A
- **Connection to next:** Normal flow resumes — verified

#### Step 7: Normal flow resumes with requested step
- **CLI:** `scaffold run <step>` continues — found
- **Component:** Full run pipeline — found
- **State:** Normal state transitions — found
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** Standard run errors — found
- **Connection to next:** Terminal — step executes normally

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-001 | (Same as Journey 2) The crash recovery path is well-specified, but it functions as what appears to be the PRIMARY completion detection mechanism, not a backup. See Journey 2 G-001 for full description. | Underspecified behavior | Critical | system-architecture.md §4b, cli-contract.md | Partially (T-008, T-029) | See Journey 2 |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [x] All error paths documented

---

## Journey 9: CI/CD Integration

**Description:** A CI/CD pipeline runs scaffold in non-interactive mode with JSON output for automated pipeline execution.
**PRD Source:** §18 (non-functional requirements — CI/CD compatibility), ADR-025 (output contract)
**Priority:** High

### Steps

#### Step 1: CI runs `scaffold init --auto --methodology deep`
- **CLI:** `scaffold init --auto --methodology deep` — found in cli-contract.md
- **Component:** Init Wizard (auto mode — safe defaults, no prompts) — found
- **State:** Created — found
- **Config:** Created with methodology: deep — found
- **Task:** T-033 — found
- **Error path:** Standard init errors; `--auto` suppresses prompts — found
- **Connection to next:** Project initialized — verified

#### Step 2: CI runs `scaffold next --format json` to get first step
- **CLI:** `scaffold next --format json` — found
- **Component:** Dependency Resolver, State Manager — found
- **State:** Reads state — found
- **Config:** N/A
- **Task:** T-024 — found
- **Error path:** JSON envelope with errors array — found in json-output-schemas.md
- **Connection to next:** CI parses JSON to get eligible step slug — verified

#### Step 3: CI runs `scaffold run <step> --auto --format json`
- **CLI:** `scaffold run <step> --auto --format json` — found in cli-contract.md
- **Component:** Full run pipeline — found
- **State:** in_progress → completed — found
- **Config:** N/A
- **Task:** T-029 — found
- **Error path:** Lock held → exit 3 (auto does NOT force). Missing deps → exit 2. — found per ADR-036
- **Connection to next:** JSON envelope indicates success/failure — verified

#### Step 4: CI parses JSON envelope for success/failure
- **CLI:** N/A (CI logic)
- **Component:** N/A
- **State:** N/A
- **Config:** N/A
- **Task:** N/A
- **Error path:** Exit codes 0-5 for CI decision logic — found in cli-contract.md §1b
- **Connection to next:** CI decides next action — verified

#### Step 5: CI loops `scaffold next` → `scaffold run` until pipeline complete
- **CLI:** Repeated `scaffold next --format json` + `scaffold run <step> --auto --format json` — found
- **Component:** All run components — found
- **State:** Progressive completion — found
- **Config:** N/A
- **Task:** T-024, T-029 — found
- **Error path:** Exit code 2 if steps have unmet dependencies — found
- **Connection to next:** Pipeline complete when `scaffold next` returns empty eligible list — verified

#### Step 6: CI runs `scaffold status --format json` for final report
- **CLI:** `scaffold status --format json` — found
- **Component:** State Manager — found
- **State:** All completed — found
- **Config:** N/A
- **Task:** T-023 — found
- **Error path:** N/A
- **Connection to next:** Terminal — CI reports success

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-007 | No batch/pipeline orchestration mode. CI must script the `next → run → next → run` loop itself. There is no `scaffold run --all` or `scaffold pipeline` command that executes all eligible steps in sequence. This is acceptable for v2.0 (simplicity) but worth documenting as a known limitation and potential v2.1 enhancement. | Missing endpoint/command | Minor | cli-contract.md (no batch command), PRD §18 (CI/CD as non-functional requirement) | No | Document the `next → run` loop pattern in the migration guide (T-054) and README. Consider a `scaffold run --all --auto --format json` mode for v2.1 that internally loops `next → run` until pipeline complete or error. |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [x] All error paths documented

---

## Journey 10: User Instruction Customization

**Description:** A user creates global and per-step instruction files, then runs a step with inline instructions, exercising the three-layer instruction precedence.
**PRD Source:** §9 (user instructions), ADR-047
**Priority:** High

### Steps

#### Step 1: User creates `.scaffold/instructions/global.md`
- **CLI:** N/A (manual file creation) — correct per ADR-047
- **Component:** N/A
- **State:** N/A
- **Config:** N/A
- **Task:** N/A (user action)
- **Error path:** N/A
- **Connection to next:** File available for assembly engine — verified

#### Step 2: User creates `.scaffold/instructions/create-prd.md`
- **CLI:** N/A (manual file creation) — correct per ADR-047
- **Component:** N/A
- **State:** N/A
- **Config:** N/A
- **Task:** N/A (user action)
- **Error path:** N/A
- **Connection to next:** File available for assembly engine — verified

#### Step 3: User runs `scaffold run create-prd --instructions "Focus on mobile users"`
- **CLI:** `scaffold run create-prd --instructions "..."` — found in cli-contract.md §2 (scaffold run flags)
- **Component:** CLI Shell → Assembly Engine — found
- **State:** Standard run state transitions — found
- **Config:** N/A
- **Task:** T-029, T-016 — found
- **Error path:** Standard run errors — found
- **Connection to next:** Assembly engine loads instructions — verified

#### Step 4: Instruction Loader loads all three layers
- **CLI:** Internal to assembly — found
- **Component:** Instruction Loader — found in system-architecture.md §4b (step 5)
- **State:** N/A
- **Config:** N/A
- **Task:** T-016 (instruction loader) — found
- **Error path:** Missing files silently skipped; empty file → ASM_INSTRUCTION_EMPTY warning — found
- **Connection to next:** Three layers passed to assembly engine — verified

#### Step 5: Assembled prompt includes all three instruction layers with provenance
- **CLI:** Assembled prompt on stdout — found
- **Component:** Assembly Engine — found
- **State:** N/A
- **Config:** N/A
- **Task:** T-017 — found
- **Error path:** N/A
- **Connection to next:** AI reads all instructions — verified

#### Step 6: AI uses instructions during execution
- **CLI:** N/A (AI execution)
- **Component:** External — found
- **State:** N/A
- **Config:** N/A
- **Task:** N/A
- **Error path:** N/A
- **Connection to next:** Terminal — artifacts produced with instruction influence

### Gaps Found

| # | Gap | Type | Severity | Affected Specs | Has Task? | Recommendation |
|---|-----|------|----------|---------------|-----------|----------------|
| G-010 | (Same as Journey 7) Instruction "override" vs "concatenate" semantics slightly ambiguous. | Underspecified behavior | Minor | ADR-047, system-architecture.md §10b | T-016 | See Journey 7 |

### Journey Assessment
- [x] All steps have CLI commands
- [x] All steps have architecture components
- [x] All steps have state transitions (where applicable)
- [x] All steps have implementation tasks
- [x] All step-to-step connections verified
- [x] All error paths documented

---

## Cross-Journey Gap Patterns

### Handoff Gaps

**Assembly Engine → AI Execution → Post-Completion (G-001):** The most significant handoff gap across multiple journeys (2, 3, 8). The specification describes a sequential flow from prompt output to completion recording, but the mechanism bridging "AI executes outside scaffold" and "scaffold records completion" is not explicitly documented. This affects Journeys 2, 3, and 8 directly, and indirectly affects every journey that involves `scaffold run`.

**AI → Decision Logger (G-004):** ADR-052 says AI writes decisions directly; the architecture and CLI contract show the CLI's Decision Logger component writing post-completion. This handoff is contradictory and must be reconciled.

### State Transition Gaps

**`init_methodology` field missing (G-003):** ADR-054 established dual methodology tracking, but the state-json-schema has not been updated. This affects Journey 4 directly. Without `init_methodology`, the system cannot reliably detect whether a methodology was changed versus originally configured.

**`reads` field missing from frontmatter (G-002):** ADR-050 and ADR-053 established the `reads` field for cross-cutting artifact references, but the frontmatter schema marks it as "Removed." This does not block any traced journey directly but will affect assembly correctness when implementing the context gatherer (T-015) — the gatherer needs to know which cross-cutting artifacts to load.

### Async Gaps

**AI execution lifecycle (G-001):** The primary async gap. Scaffold outputs the assembled prompt and (presumably) returns control. How does post-completion processing trigger? The crash recovery mechanism (ADR-018) handles the case where scaffold was interrupted, but the NORMAL completion path is not explicitly specified. Three interpretations exist:
1. Scaffold blocks and presents a completion confirmation prompt (implied by cli-contract.md "After the agent completes and the user confirms completion")
2. Crash recovery is the primary mechanism (scaffold exits, next invocation detects artifacts)
3. There's an implicit completion callback via the plugin architecture

The specification should explicitly state which mechanism is used.

### First-Time User Gaps

**No gaps found.** `scaffold init` works from zero state. `scaffold status` works before any steps are run (shows all pending). `scaffold next` shows first eligible step(s). The first-time user path is well-specified.

### Flag Interaction Gaps

**`--depth` flag missing (G-005):** The depth resolver references a CLI `--depth` flag as highest-priority override, and task T-029 mentions it, but the CLI contract does not define it for `scaffold run`. This means the four-level depth precedence described in system-architecture.md §10b (CLI flag > custom per-step > preset default > built-in) is incomplete.

**Depth downgrade + `--auto`/`--force` (G-008):** ADR-051 specifies three-mode behavior for depth downgrades (interactive confirmation / auto warning / force skip), but this is not reflected in the CLI contract's scaffold run interactive behavior section.

---

## Gap Inventory

| # | Gap | Journey(s) | Type | Severity | Has Task? | Recommendation | Status |
|---|-----|-----------|------|----------|-----------|----------------|--------|
| G-001 | AI execution lifecycle: completion handoff mechanism between "prompt outputted" and "mark completed" is not explicitly specified | J2, J3, J8 | Underspecified behavior | Critical | Partially (T-008, T-029) | Explicitly document the completion mechanism in system-architecture.md §4b and cli-contract.md. | **Resolved** |
| G-002 | `reads` field marked "Removed" in frontmatter-schema.md but re-introduced by ADR-050 and ADR-053 (both accepted) | J4 | Missing state transition | Major | No | Add `reads` field to frontmatter-schema.md §2 formal schema as optional `string[]`. Update §1 disposition table. Add validation rules in §7. | **Resolved** |
| G-003 | `init_methodology` field missing from state-json-schema.md despite ADR-054 (accepted) establishing dual methodology tracking | J4 | Missing state transition | Critical | No | Add `init_methodology` field to state-json-schema.md §2 formal schema. Set by `scaffold init`, never updated. Migration: default to `config_methodology` value. | **Resolved** |
| G-004 | Decision recording interface contradicts: ADR-052 says AI writes directly, architecture §4b and cli-contract.md show CLI Decision Logger writing post-completion | J2, J3 | Broken connection | Major | T-009 (CLI side) | Reconcile. Recommend updating ADR-052 to match CLI-writes approach (ensures atomic ID assignment, schema validation, crash safety). | **Resolved** |
| G-005 | `--depth` flag missing from CLI contract for `scaffold run` but referenced in architecture §10b and task T-029 | J3 | Missing endpoint/command | Major | T-012, T-029 | Add `--depth <1-5>` to scaffold run command-specific flags in cli-contract.md. | **Resolved** |
| G-006 | No scaffold command for worktree setup or multi-agent step coordination | J5 | Missing endpoint/command | Major | No | Document manual worktree setup pattern. Consider `scaffold worktree setup` for v2.1. Acceptable limitation for v2.0. | **Resolved** |
| G-007 | No batch/pipeline execution mode for CI; CI must script `next → run` loop | J9 | Missing endpoint/command | Minor | No | Document the loop pattern. Consider `scaffold run --all` for v2.1. | **Resolved** |
| G-008 | Depth downgrade confirmation (ADR-051) not in CLI contract interactive behavior for scaffold run | J4 | Missing error path | Major | T-012, T-029 | Add depth downgrade confirmation to cli-contract.md scaffold run interactive behavior section. | **Resolved** |
| G-009 | `scaffold adopt` config creation behavior ambiguous — "Requires project: No" but also errors on CONFIG_NOT_FOUND | J6 | Underspecified behavior | Minor | T-035 | Clarify in cli-contract.md whether adopt requires existing config or creates one. | **Resolved** |
| G-010 | User instruction "override" vs "concatenate" semantics slightly ambiguous across ADR-047, architecture, and task breakdown | J7, J10 | Underspecified behavior | Minor | T-016 | Add clarification note to ADR-047: all layers included with provenance, "override" means semantic priority for the AI. | **Resolved** |
| G-011 | System-architecture.md §12a traceability matrix still shows ADR-050 through ADR-054 as "proposed" despite all being accepted | — | Underspecified behavior | Minor | No | Update §12a status column for ADR-050-054 from "proposed" to "current". | **Resolved** |
| G-012 | Error-messages.md references removed mixin-related codes (FIELD_INVALID_MIXIN_AXIS, FIELD_INVALID_MIXIN_VALUE) with only "Removed" notes, and some RESOLUTION_* codes reference Domain 01 which is superseded | — | Underspecified behavior | Minor | No | Remove or clearly mark as superseded. Consistent with ADR-041 cleanup. | **Resolved** |

### Gap Statistics
- Total gaps: 12
- Critical: 2 (G-001 completion lifecycle, G-003 init_methodology)
- Major: 5 (G-002 reads field, G-004 decision recording, G-005 --depth flag, G-006 multi-agent, G-008 depth downgrade)
- Minor: 5 (G-007 batch mode, G-009 adopt config, G-010 instruction semantics, G-011 traceability matrix, G-012 stale error codes)
- **Resolved: 12 / 12** — all gaps addressed by spec edits
- Gaps needing new tasks: 0

---

## Recommendations

### Critical (must fix before implementation)

1. **G-001 — Specify the completion handoff mechanism.** The system architecture and CLI contract must explicitly state how `scaffold run` transitions from "prompt outputted" to "mark completed." If scaffold blocks for user confirmation (the most likely interpretation from cli-contract.md), add the confirmation prompt to the interactive behavior flow and describe the auto-mode behavior. If crash recovery is the primary mechanism, document this clearly and remove the suggestion that completion happens in the same invocation. This affects every journey that uses `scaffold run`.

2. **G-003 — Add `init_methodology` to state-json-schema.md.** ADR-054 is accepted and the dual-field approach is the decided design. Without `init_methodology` in the schema, the methodology change detection (Journey 4) cannot distinguish initial configuration from changes. Add the field, define its lifecycle (set at init, never updated), and add a migration note.

### Major (fix during implementation phases)

3. **G-002 — Add `reads` field to frontmatter-schema.md.** Re-introduce `reads` as an optional field per ADR-050/053. This is needed by the context gatherer (T-015) during Phase 2 implementation.

4. **G-004 — Reconcile decision recording interface.** Update ADR-052 to align with the CLI-writes approach shown in the architecture. The CLI Decision Logger provides better guarantees (atomic ID assignment, schema validation, crash safety). The AI should not write directly to decisions.jsonl.

5. **G-005 — Add `--depth` flag to scaffold run.** The four-level depth precedence chain is incomplete without this flag. Add to cli-contract.md and json-output-schemas.md.

6. **G-008 — Add depth downgrade confirmation to CLI contract.** ADR-051's three-mode behavior needs to be reflected in the scaffold run interactive behavior section.

7. **G-006 — Document multi-agent setup pattern.** For v2.0, document the manual worktree setup process. The migration guide (T-054) should include a section on multi-agent execution with git worktrees.

### Minor (fix as encountered)

8. **G-007 — Document CI/CD `next → run` loop pattern.** Add to migration guide or README.

9. **G-009 — Clarify `scaffold adopt` config requirements.** Update cli-contract.md to resolve the "Requires project: No" vs CONFIG_NOT_FOUND ambiguity.

10. **G-010 — Clarify instruction semantics.** Add a note to ADR-047 about concatenation with provenance.

11. **G-011, G-012 — Update stale documentation references.** Update traceability matrix status and clean up removed mixin error code references. These can be bundled into a documentation cleanup task.

### Resolution Record

All 12 gaps were resolved by direct spec edits (no new implementation tasks needed):

| Gap | Resolution | Commit |
|-----|-----------|--------|
| G-001 | Added completion gate to cli-contract.md scaffold run and system-architecture.md §4b | `[BD-scaffold-v2] docs(v2): specify completion handoff and add init_methodology to state schema` |
| G-002 | Re-introduced `reads` field to frontmatter-schema.md (disposition table, formal schema, field reference, validation rules, examples) | `[BD-scaffold-v2] docs(v2): add reads field, --depth flag, and depth downgrade to specs` |
| G-003 | Added `init_methodology` and `config_methodology` to state-json-schema.md (formal schema, field reference, migration note) | `[BD-scaffold-v2] docs(v2): specify completion handoff and add init_methodology to state schema` |
| G-004 | Rewrote ADR-052 to match CLI-mediated decision recording (Decision, Rationale, Alternatives, Consequences, Constraints) | `[BD-scaffold-v2] docs(v2): reconcile ADR-052 decision recording with CLI-writes approach` |
| G-005 | Added `--depth <1-5>` flag and `depth_source` to cli-contract.md scaffold run | `[BD-scaffold-v2] docs(v2): add reads field, --depth flag, and depth downgrade to specs` |
| G-006 | Added multi-agent worktree setup pattern to cli-contract.md §2b | `[BD-scaffold-v2] docs(v2): document operational patterns and resolve minor spec gaps` |
| G-007 | Added CI/CD pipeline loop pattern to cli-contract.md §2b | `[BD-scaffold-v2] docs(v2): document operational patterns and resolve minor spec gaps` |
| G-008 | Added depth downgrade check to cli-contract.md scaffold run interactive behavior and auto mode | `[BD-scaffold-v2] docs(v2): add reads field, --depth flag, and depth downgrade to specs` |
| G-009 | Clarified scaffold adopt requires config.yml (Partial project requirement) | `[BD-scaffold-v2] docs(v2): document operational patterns and resolve minor spec gaps` |
| G-010 | Added semantics note to ADR-047 (override = priority, not deletion) | `[BD-scaffold-v2] docs(v2): document operational patterns and resolve minor spec gaps` |
| G-011 | Updated system-architecture.md §12a — ADR-050-054 status from proposed to current | `[BD-scaffold-v2] docs(v2): document operational patterns and resolve minor spec gaps` |
| G-012 | Added supersession note to error-messages.md §3.5 (Domain 01 → Domain 15) | `[BD-scaffold-v2] docs(v2): document operational patterns and resolve minor spec gaps` |
