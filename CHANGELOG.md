# Changelog

All notable changes to Scaffold are documented here.

## [2.44.1] — 2026-03-31

### Fixed

- **`cli-contract.md` updated for `scaffold list --section tools`** — The API contract document now reflects the new `tools` section choice, `--verbose` flag, updated JSON shape (`data.tools.build` + `data.tools.utility`), and added examples. Caught by Codex code review as a P2 discrepancy.

## [2.44.0] — 2026-03-31

### Added

- **`scaffold list --section tools`** — Lists all scaffold tools in two grouped sections: Build Tools (stateless pipeline steps from `pipeline/build/`) and Utility Tools (from `tools/`). Completeness is guaranteed by filesystem scan — adding a tool file automatically includes it with no other changes required.
  - Compact text output by default
  - `--verbose` adds an Arguments column showing `argument-hint` values
  - `--format json` returns `{ tools: { build: [...], utility: [...] } }` for machine-readable use
- **`scaffold-runner` skill updated** — "What tools are available?" now calls `scaffold list --section tools --format json` and renders an enriched two-section display with "when to use" context. If the CLI returns a tool not in the skill's table, it falls back to the CLI's `description` field (graceful degradation).

## [2.43.5] — 2026-03-31

### Fixed

- **`tools/` missing from npm package** — The `tools/` directory (containing all utility tools like `post-implementation-review`, `version`, `release`, etc.) was not listed in `package.json` `files`, so globally installed scaffold had no tools directory and all `scaffold run <tool>` calls returned `STEP_NOT_FOUND`.
- **`scaffold version` showed wrong latest version** — `version.ts` was checking the `scaffold` package on npm instead of `@zigrivers/scaffold`, returning an unrelated package's version as the "latest".
- **URL encoding for scoped npm package names** — Registry lookups for `@zigrivers/scaffold` used the raw package name in the URL path, causing 404s. The `@` and `/` characters are now percent-encoded (`%40zigrivers%2Fscaffold`).

## [2.43.0] — 2026-03-30

### Added

- **`/scaffold:post-implementation-review` tool** — Systematic three-channel code review of an entire scaffold-generated codebase after an AI agent completes all implementation tasks. Unlike `review-pr` (which reviews a git diff), this tool reviews the full implemented codebase against requirements and coding standards. Two-phase approach: Phase 1 cross-cutting sweep (architecture, security, error handling, coverage, complexity, dependencies) runs across the whole codebase; Phase 2 parallel per-user-story review checks each story's acceptance criteria. Three modes: `review+fix` (default), `--report-only`, and auto-detected Update Mode (load prior report, skip re-review). All three channels run independently per phase; findings deduplicated and sorted P0→P1→P2→P3 before fix execution.
- **`post-implementation-review-methodology` knowledge entry** — Documents the two-phase review structure, context-bundling strategy for whole-codebase CLI review, deduplication logic, file-to-story mapping approach, grouping rules for small/large projects, and Update Mode shortcut.

## [2.42.1] — 2026-03-29

### Changed

- **Code reviews now fix P0/P1/P2 findings** — Previously only P0/P1 (blocking/important) findings were mandatory. Now P2 (improvement) findings are also required before proceeding. Updated across all 4 build steps, review-pr tool, multi-model-dispatch skill templates, automated-review-tooling knowledge base, hooks, and CLAUDE.md. Only P3 (trivial nits) are skipped.

## [2.42.0] — 2026-03-29

### Added

- **`/scaffold:review-pr` tool** — Single entry point for running all three code review channels (Codex CLI, Gemini CLI, Superpowers code-reviewer subagent) on a PR. Handles auth verification, independent dispatch, finding reconciliation, and fix loops with user override for unresolved findings. Agents call this once instead of remembering three separate invocations.
- **Mandatory review step in all 4 build commands** — `single-agent-start`, `single-agent-resume`, `multi-agent-start`, and `multi-agent-resume` all now require agents to run all 3 review channels after every PR. Instructions are install-method-agnostic (work for both CLI and plugin installs).
- **Review enforcement hook** — `automated-pr-review` now configures a Claude Code `PostToolUse` hook on `gh pr create` in target projects. The hook injects a self-contained reminder with exact CLI invocations, preventing context decay from causing missed reviews.
- **scaffold-runner updated** — `review-pr` added to the runner's tool list and navigation table (`scaffold run review-pr`).

### Fixed

- **3-round merge escape removed** — Unresolved P0/P1 findings after 3 fix rounds now require user override instead of auto-merging (caught by Codex + Gemini review).
- **Duplicate step numbering** in `multi-agent-resume` — two steps were numbered `4.` (caught by Superpowers code-reviewer).
- **Hook auth check** used pipe (`|`) instead of separate commands between Codex and Gemini auth checks (caught by Gemini review).

## [2.41.0] — 2026-03-29

### Added

- **Round 6 alignment audit** — `docs/comprehensive-alignment-audit-round-6.md` with 58 findings across 8 modules. Zero BROKEN findings (R5 regressions confirmed fixed). Identified systemic QC tagging gap.
- **New eval: depth-level-grouping.bats** — 3 tests preventing grouped depth levels (catches the recurring 2-R1 regression class)
- **New eval: mvp-path-simulation.bats** — 3 tests validating MVP preset dependency chain integrity and step count
- **Hardened build-drift.bats** — New test 3 validates QC phrase parity between pipeline and command files (78 total eval tests, up from 71)

### Fixed

- **93 untagged QC criteria** — Added depth tags (mvp/deep) to QC criteria across 32 pipeline steps. Agents at MVP depth can now distinguish required vs optional criteria.
- **UMS Detect path mismatches** — `review-prd` and `implementation-plan-review` had wrong file paths in Update Mode Specifics Detect field, causing update-mode detection to look for nonexistent files.
- **MVP input availability** — `implementation-plan-review` and `implementation-playbook` marked inputs as "required" that don't exist at MVP depth. Now correctly documented as "required at deep; optional — not available in MVP".
- **implementation-plan QC contradiction** — "Every architecture component has implementation tasks" changed to (deep); new (mvp) criterion "Every user story has implementation tasks" added.
- **new-enhancement gaps** — Added reads for architecture/domain/API/DB/UX docs for impact analysis; added implementation-plan.md to Inputs; added spec-layer artifact update guidance in After This Step; fixed premature version-bump in Phase 5.
- **Multi-model consensus standardization** — `tech-stack` and `platform-parity-review` aligned to Consensus/Majority/Divergent taxonomy (was non-standard phrasing).
- **Traceability language** — `scope-creep-check` changed "traces to" to standard "maps to".
- **Knowledge structure** — Added Summary + Deep Guidance to `critical-path-analysis` and `implementability-review` (now 60/60 entries with proper structure).
- **QC measurability** — Fixed vague "thorough" (new-enhancement), "addressed" (apply-fixes-and-freeze); removed redundant criteria (implementability-dry-run, workflow-audit); split mixed-depth criterion (developer-onboarding-guide).
- **Review scope conflicts** — "All review passes executed" tagged (deep) in review-prd, review-user-stories, review-vision to resolve conflict with MVP-scoped "passes 1-2 only".
- **Build step story-tests-map** — single-agent-start and multi-agent-start now reference docs/story-tests-map.md for test skeleton lookup.
- **innovate-user-stories outputs** — Added docs/user-stories.md to frontmatter outputs (matching pattern of other innovate steps).

## [2.40.1] — 2026-03-29

### Added

- **Stale command detection in `scaffold status`** — Compares modification timestamps of pipeline/knowledge sources against generated commands. Warns when commands are out of date with count and fix command. Also available in JSON output as `staleCommands` field.
- **Pre-commit hook for build drift** — New step 4 in the composite pre-commit hook blocks commits that stage `pipeline/` or `knowledge/` files without corresponding `commands/` changes. Prompts to run `scaffold build`.
- **Alignment audit prompt** — Reusable 8-module audit prompt at `docs/alignment-audit-prompt.md` for periodic pipeline quality audits.
- **Round 5 audit report** — `docs/comprehensive-alignment-audit-round-5.md` with 37 findings (down 57% from Round 4), including new End-to-End Path Simulation module.

### Fixed

- **Flaky `lock-manager.test.ts`** — Tests used wall-clock time for `processStartedAt` instead of actual process start time from `ps`. On slow CI runners, the >2s PID-recycling threshold triggered incorrectly. Now uses real process start time.
- **MVP task decomposition stuck point** — `implementation-plan.md` now has "MVP-Specific Guidance" section explaining layer-based task decomposition when no architecture document exists.
- **Depth regressions** — `operations.md` and `security.md` grouped depth levels (missed in Round 4 fix) expanded to per-level descriptions.

## [2.40.0] — 2026-03-29

### Changed

- **QC measurability** — Standardized traceability language to "maps to >= N" across all spec/planning steps; added framework fallbacks to tdd, coding-standards, story-tests, create-evals; added conditional fallbacks to 4 spec steps for missing domain models
- **Multi-model consensus** — All 19 multi-model steps now define Consensus/Majority/Divergent/Unique classification; multi-model-review-dispatch knowledge entry updated with consensus framework
- **Innovation approval** — 3 innovate steps now require approval status (approved/deferred/rejected) with timestamp
- **Implementation handoff** — Playbook knowledge deepened: story-tests-map in context table for all task types, dependency-failure recovery expanded (status check + 30min pivot + escalation), eval failure category-to-root-cause mapping added
- **Post-pipeline workflows** — new-enhancement now requires playbook update (was optional); quick-task explicitly references playbook quality gates
- **Command rebuild** — All 60 commands regenerated from updated pipeline sources via `scaffold build`

## [2.39.0] — 2026-03-29

### Added

- **New eval: quality-criteria-measurability.bats** — 2 tests validating that Quality Criteria use measurable language and multi-model criteria define consensus thresholds
- **New eval: knowledge-injection.bats** — 3 tests validating knowledge entry structure (Summary+Deep Guidance), reference resolution, and entry count limits
- **Handoff quality improvements** — Implementation playbook now reads domain-models, ADRs, vision, and project-structure; includes test skeleton discovery and dependency-failure recovery guidance

### Changed

- **Depth documentation** — All 45 pipeline steps with grouped depth levels (e.g., "Depth 1-2") now have explicit per-level descriptions (Depth 1 through Depth 5)
- **Quality Criteria measurability** — Fixed 3 BROKEN criteria (create-evals contradiction, implementation-playbook make eval at MVP, system-architecture directory structure duplication) and improved 30+ vague criteria across all phases with measurable thresholds
- **P0-P3 severity standardization** — All review steps now use consistent definitions: P0=Breaks downstream work, P1=Prevents quality milestone, P2=Known tech debt, P3=Polish
- **Mode Detection accuracy** — new-enhancement correctly labeled as "document-modifying" (was "stateless"); quick-task clarifies Beads vs inline persistence
- **Knowledge deepening** — eval-craft (per-category guidance), task-decomposition (critical path/wave planning), prd-craft (NFR quantification), testing-strategy (AC-to-test mapping)
- **Eval gate promotions** — prompt-quality depth tags (threshold 5→35), pipeline-completeness Update Mode Specifics (warning→hard fail), command-structure dead-ends (warning→max 3)

## [2.38.1] — 2026-03-29

### Fixed

- **`scaffold complete`** — Now records `at` timestamp and `completed_by: 'user'` when marking steps as completed. Previously these fields were missing, causing the dashboard to show "—" for completion date on manually completed steps.

## [2.38.0] — 2026-03-29

### Added

- **Phase descriptions** — All 16 phases in the PHASES constant now include a 2-3 sentence `description` field explaining what the phase accomplishes and why it matters.
- **Step summaries** — New optional `summary` frontmatter field (max 500 chars) on all 60 pipeline meta-prompts, providing action-oriented descriptions of what each step does and produces.
- **Dashboard v3** — Complete rewrite of the pipeline dashboard with phase-grouped layout, collapsible sections, step detail modals (with meta-prompt body), What's Next banner, decision log, dark/light theme, responsive design.
- **Dashboard step drill-down** — Click any step to see its summary, metadata (status, date, depth, dependencies, outputs), and the meta-prompt that drives it.

### Changed

- **README Quick Start** — Comprehensive rewrite for less technical users, featuring scaffold runner skill as primary interface with greenfield and brownfield examples.
- **README Pipeline section** — All 16 phase descriptions and 60 step descriptions rewritten in plain language explaining what Claude does and what the user gets.
- **README Multi-Model Review** — Tiered rewrite with code review analogy, quick setup guide, and streamlined structure. Raw CLI invocation moved to FAQ.
- **`scaffold next`** — Now shows step summary (falls back to description) for richer output.
- **`scaffold info`** — Now shows step summary in both human-readable and JSON output.
- **`scaffold build`** — Prefers step summary for longDescription in generated command files.
- **Scaffold Runner skill** — Phase reference table now includes descriptions; batch progress and rework pause templates use step summaries and phase descriptions.
- **Scaffold Pipeline skill** — Phases table now includes descriptions and missing Phase 0 (vision).
- **Dashboard generator** — Extended with phase grouping, enriched step metadata, next eligible computation, and scaffold version.
- **Dashboard template** — Replaced barebones flat list with full-featured phase-grouped UI.
- **Dashboard CLI** — Now loads meta-prompts to provide enriched data to the dashboard.
- **Dashboard tool meta-prompt** — Updated to reference v2 CLI instead of v1 bash script.

## [2.37.0] — 2026-03-29

### Added

- **Phase 15: Build** — New pipeline phase with 6 stateless execution steps (`single-agent-start`, `single-agent-resume`, `multi-agent-start`, `multi-agent-resume`, `quick-task`, `new-enhancement`). Appears in `scaffold next` once phase 14 is complete, always available for repeated use.
- **Tools category** — 7 utility commands (`version-bump`, `release`, `version`, `update`, `dashboard`, `prompt-pipeline`, `session-analyzer`) in new `tools/` directory. Orthogonal to the pipeline, usable at any time.
- **`stateless` frontmatter field** — Steps that don't track completion state. Used by build phase steps and tools.
- **`category` frontmatter field** — Distinguishes pipeline steps (`category: pipeline`) from utility tools (`category: tool`).
- **4 execution knowledge entries** — `tdd-execution-loop`, `task-claiming-strategy`, `worktree-management`, `enhancement-workflow` in `knowledge/execution/`.
- **3 tool knowledge entries** — `release-management`, `version-strategy`, `session-analysis` in `knowledge/tools/`.
- **Scaffold-runner: stateless step support** — Runner handles build phase and tool execution without completion tracking; resume steps conditionally visible.
- **Scaffold-runner: tool execution** — Tools skip eligibility checks, support argument passthrough.

### Changed

- **Build system** scans both `pipeline/` and `tools/` directories for meta-prompts.
- **Dependency graph** excludes tools from topological sort.
- **Eligibility system** shows build phase steps as "available (on-demand)" once dependencies met.
- **13 operational commands** migrated from manually-maintained v1 files to v2 build-generated output with knowledge injection.
- **Agent execution commands** enriched with deep TDD, task claiming, and worktree management knowledge (previously ~10 lines each).

### Fixed

- **V1/V2 parity gap** — 13 commands that bypassed the build system now flow through `scaffold build` with full knowledge-base injection, adapter support, and frontmatter validation.

## [2.36.0] — 2026-03-29

### Added

- **Agent Executability Heuristics** — Five formalized rules for AI-agent-friendly task sizing added to the `task-decomposition` knowledge base: Three-File Rule (max 3 application files), 150-Line Budget (~150 lines net-new code), Single-Concern Rule (no "and" connecting unrelated work), Decision-Free Execution (all design decisions resolved upfront), and Test Co-location (tests in the same task as the code they test). Hard rules with an escape hatch (`<!-- agent-size-exception: reason -->`).
- **Pass 8: Agent Executability** — New review pass in `implementation-plan-review` that evaluates every task against the 5 agent sizing rules. Flags oversized tasks with specific split recommendations. Severity: P0 for 6+ files or 300+ lines, P1 for rule violations without justification.

### Changed

- **Task sizing limits tightened** — `implementation-plan` quality criteria updated from "≤500 lines / 5 files" to "~150 lines / 3 files" with mandatory decision-free execution and test co-location requirements.
- **Implementation plan review** now includes agent executability as a quality gate at all methodology depths (mvp through deep).

## [2.35.0] — 2026-03-29

### Added

- **Round 3 alignment audit** — 119 findings (2 BROKEN, 18 MISALIGNED, 27 MISSING, 72 WEAK), all addressed. Health score improved from 7.5/10 to 8.5/10.
- **Quality Criteria depth tags** — All 54 pipeline steps now have `(mvp)`, `(deep)`, and `(depth 4+)` tags on Quality Criteria items, enabling agents to self-assess at the correct methodology depth
- **New evals: handoff-quality.bats** — 5 tests validating implementation handoff completeness (playbook reads, agent start command references)
- **New evals: methodology-content.bats** — 4 tests validating MVP/deep preset differences and depth tag coverage
- **Eval failure recovery** — Implementation playbook knowledge entry now includes eval-specific troubleshooting guide
- **Dependency failure protocol** — Playbook knowledge entry covers upstream task failure handling
- **Version release integration** — new-enhancement and quick-task commands now reference version-bump after changes
- **Freeze marker format** — Documented exact format in new-enhancement command
- **Conditional Evaluation** — platform-parity-review now documents when to enable/skip
- **Update Mode Specifics** — All 7 validation steps now have multi-model artifact handling guidance

### Changed

- **Quality Criteria measurability** — Replaced vague criteria in 15+ files (domain-modeling invariants, api-contracts errors, database-schema indexes, operations alerts, security validation, implementation-plan task sizing)
- **Quality Criteria completeness** — Added missing criteria to 14 pipeline files (ubiquitous language, decision dependencies, pagination schema, rollback safety, responsive design, RTO/RPO, secret rotation, task locality, test fixtures, eval false-positives)
- **Depth tag corrections** — create-prd NFR criterion moved from (deep) to (mvp); database-schema constraints moved from (deep) to (mvp)
- **Knowledge structure** — 20 knowledge entries (200+ lines) now have Summary + Deep Guidance headers for assembly optimization
- **Missing reads fields** — system-architecture, review-architecture, database-schema, implementation-playbook frontmatter now reflect body input requirements
- **Innovation criteria** — innovate-vision, innovate-prd, innovate-user-stories now have measurable approval documentation criteria
- **coding-standards triggers** — Update Mode now detects git-workflow.md commit format changes

### Fixed

- **review-user-stories path mismatch** — Update Mode Specifics Detect field corrected from `docs/reviews/review-user-stories.md` to `docs/reviews/pre-review-user-stories.md`

## [2.34.0] — 2026-03-29

### Added

- **Round 2 alignment audit** — Comprehensive 8-module audit with 203 findings (7 BROKEN, 38 MISALIGNED, 63 MISSING, 95 WEAK), all addressed
- **Vision steps in methodology presets** — All 3 vision steps now appear in mvp.yml, deep.yml, and custom-defaults.yml (Phase 0 section)
- **Methodology depth documentation** — New `methodology/README.md` explaining depth levels 1-5, preset philosophy, and depth tag semantics
- **Update Mode Specifics for 15 pipeline steps** — All 13 review steps and 3 finalization steps now have complete 4-field Update Mode Specifics blocks (Detect, Preserve, Triggers, Conflict resolution)
- **`review-vision` knowledge entry** — New knowledge entry with 5 vision-specific review passes, severity examples, and finding report template
- **Multi-model dispatch knowledge** — Added `multi-model-review-dispatch` to 9 pipeline steps (6 validation, 2 innovation, tech-stack) that reference depth 4+ dispatch
- **4 new eval tests** — `build-drift.bats` (command freshness), `exemption-audit.bats` (exemption list bounds), `preset-exhaustiveness.bats` (preset coverage), and phase-sync eval in pipeline-completeness
- **Data flow hard gate** — `data-flow.bats` promoted from warning-only to hard failure with phase-ordering exemption list
- **14 missing quality criteria** — Added output-to-criterion mappings for linter config validity, .gitkeep scaffolding, CI YAML validity, `make eval` execution, freeze markers, handoff format, and more

### Changed

- **MVP path coherence** — `implementation-plan` and `implementation-playbook` now have explicit MVP-mode instructions for working without architecture/domain models. Required inputs downgraded to optional where unavailable in MVP.
- **Agent start/resume commands** — All 4 commands now prioritize playbook over plan, reference onboarding guide, test skeletons, and `make eval` as quality gate
- **new-enhancement command** — Now updates implementation playbook and handles frozen artifact amendments
- **quick-task command** — Now references playbook quality gates and eval gate
- **8 After This Step corrections** — Commands now recommend review steps before specification steps (create-prd→review-prd, domain-modeling→review-domain-modeling, system-architecture→review-architecture, etc.)
- **13 commands gain depth note** — All 15 representative commands now carry "use pipeline engine with presets for lighter execution" note
- **19 methodology scaling sections** — Replaced generic "scale with depth" text with step-specific depth breakdowns for 4 finalization steps, 7 validation steps, 6 review steps, and 2 innovation steps
- **11 vague quality criteria replaced** — Measurable thresholds for vision conciseness, competitive honesty, guiding principles, anti-vision specificity, code review checklist actionability, and more
- **6 steps gain depth-tagged criteria** — create-prd, create-vision, user-stories, adrs, innovate-prd, innovate-user-stories now have (mvp)/(deep) tags
- **22 missing reads[] entries added** — Closes data flow gaps across dev-env-setup, project-structure, operations, workflow-audit, create-evals, tdd, story-tests, implementation-plan, security, ux-spec, and 10 more
- **Mode Detection alignment** — automated-pr-review and ai-memory-setup pipeline detection now matches command logic (existence-first, then tracking comment)
- **3 topic inconsistencies fixed** — `cicd`→`ci-cd`, `responsive`→`responsive-design`, `adrs`→`adr`
- **3 knowledge entries gain Summary/Deep Guidance** — gap-analysis, review-domain-modeling, review-system-architecture restructured for CLI assembly optimization
- **custom-defaults.yml comment** — Now accurately states "Most steps enabled by default" (was "All steps enabled")
- **Eval system hardened** — Dynamic FINALIZATION_COMMANDS derivation, `validate_exempt_terminal_outputs` now invoked, stemming in build-drift description matching

### Fixed

- **review-testing race condition** — Added `system-architecture` to dependencies (was only in reads, which doesn't enforce ordering in parallel execution)
- **innovate-prd missing output** — Added `docs/plan.md` to outputs array
- **platform-parity-review impossible input** — Marked `docs/implementation-plan.md` as unavailable (runs before implementation-plan)
- **review-domain-modeling had zero domain-specific criteria** — Added entity coverage, aggregate boundary, and ubiquitous language checks
- **platform-parity-review missing review-methodology** — Added to knowledge-base
- **platform-parity-review command missing Mode Detection** — Added full detection section with output path references

## [2.33.0] — 2026-03-29

### Added

- **Phase 0: Product Vision** — New pipeline phase with three steps (`create-vision`, `review-vision`, `innovate-vision`) that produce a strategic product vision document (`docs/vision.md`) before the PRD. The vision document establishes the product's purpose, target audience, competitive positioning, guiding principles, and success criteria — serving as the North Star for all downstream pipeline steps.
- **`create-vision` step** — Hybrid framework combining Geoffrey Moore's elevator pitch, Roman Pichler's Vision Board, Reforge's narrative approach, and Amazon's Working Backwards methodology. Supports fresh and update modes. Produces a 12-section comprehensive vision document.
- **`review-vision` step** — 5-pass structured review targeting vision-specific failure modes: vision clarity, audience precision, competitive rigor, strategic coherence, and downstream readiness.
- **`innovate-vision` step** (conditional) — Strategic innovation across 5 dimensions: market opportunity expansion, positioning alternatives, AI-native rethinking, ecosystem thinking, and contrarian bets. Updates `docs/vision.md` directly with approved innovations.
- **`vision-craft` knowledge base entry** — Product vision best practices synthesized from Geoffrey Moore, Roman Pichler, Marty Cagan, Reforge, and Amazon Working Backwards. Referenced by all three vision steps.

### Changed

- **`create-prd` now reads `docs/vision.md`** — When a vision document exists, the PRD step uses it as strategic foundation and skips its own vision discovery questions. The PRD works unchanged when no vision document exists (soft read, not hard dependency).
- **PHASES constant updated** — Added Phase 0 `vision` (display name: "Product Vision") to `src/types/frontmatter.ts`.
- **Zod phase enum derived from PHASES** — The frontmatter validation schema now derives its phase enum from the canonical PHASES constant instead of maintaining a separate hardcoded list.
- **Runner skill updated** — Phase name reference table includes the new vision phase for batch execution and navigation.

## [2.32.0] — 2026-03-28

### Fixed

- **Broken dependency chains in quality phase** — `review-testing` now declares `reads: [domain-modeling, system-architecture]`, `operations` declares `reads: [system-architecture, adrs]`, and `security` declares `reads: [system-architecture]`. Previously these steps required artifacts with no formal path to their producers.
- **Missing reads in consolidation/environment phase** — `claude-md-optimization` now declares `reads: [create-prd, tdd]`, `automated-pr-review` declares `reads: [tdd]`, and `design-system` declares `reads: [create-prd]`. Ensures formal data flow for all required inputs.
- **Malformed mvp bullets in 3 review steps** — `review-ux`, `review-operations`, and `review-security` had their `**mvp**` bullet indented under `**deep**`, making it invisible to methodology parsers. Now properly formatted as separate bullets.
- **Generic validation step quality criteria** — All 7 validation steps (`cross-phase-consistency`, `traceability-matrix`, `decision-completeness`, `critical-path-walkthrough`, `implementability-dry-run`, `dependency-graph-validation`, `scope-creep-check`) had identical copy-paste criteria ("analysis is comprehensive"). Replaced with step-specific, measurable criteria derived from each step's Purpose section.
- **Mode Detection mismatches** — Added Mode Detection sections to `commands/claude-md-optimization.md` and `commands/workflow-audit.md` (previously omitted entirely). Updated `apply-fixes-and-freeze` pipeline to acknowledge update mode (was "N/A"). Expanded stub Mode Detection in `developer-onboarding-guide` and `implementation-playbook` pipeline files.
- **Quality criteria depth tags** — Added `(mvp)`/`(deep)` tags to 9 pipeline steps: `operations`, `security`, `api-contracts`, `database-schema`, `ux-spec`, `design-system`, `system-architecture`, `domain-modeling`, `implementation-plan`. Criteria now clearly indicate which apply at which methodology depth.
- **Review step Pattern A normalization** — Added missing Pattern A criteria (P0-P3 categorization, fix plan, downstream readiness) to 6 Pattern C review steps: `review-api`, `review-database`, `review-ux`, `review-operations`, `review-security`, `review-testing`.
- **Implementation handoff improvements** — Added task-type minimum-context taxonomy, `make eval` quality gate, specification artifact inputs, error recovery documentation to playbook knowledge. Added `story-tests` and `create-evals` follow-up to `new-enhancement` command. Added `docs/onboarding-guide.md` to playbook inputs.

- **Deep Guidance optimization** — Added Summary/Deep Guidance structure to 10 large knowledge entries (527→321 lines each), improving assembly engine efficiency. Normalized topic names (`data-flows`→`data-flow`, `naming-conventions`→`naming`, `gaps`→`gap-analysis`).
- **Remaining findings sweep (WP10)** — Removed redundant reads entries, added conditional dependency handling for innovate steps, tightened Mode Detection false-positive logic, harmonized preserve rules, replaced 23 vague quality criteria with measurable thresholds, added missing criteria to 8 steps, added conditionality guidance and prerequisite warnings to commands, documented depth-5 limitation, replaced hardcoded npm commands with stack-agnostic placeholders, raised eval minimum from 2 to 4 lines, added self-validating exempt lists and dead-end detection.

### Added

- **Dependency coherence validation for presets** — New `validateDependencyCoherence()` function in preset-loader warns when enabled steps have disabled dependencies. The engine already treats disabled deps as satisfied (soft-dependency), but users now get explicit warnings about potential quality gaps.
- **Wired orphaned knowledge entries** — Added `multi-model-review-dispatch` and `review-step-template` to all 13 review steps + `traceability-matrix`. These entries existed but were unreferenced.
- **New knowledge entries** — Created `git-workflow-patterns` (branching, commits, PRs, merge policies, worktrees) and `automated-review-tooling` (dual-model CLI review, reconciliation, CI integration). Wired to `git-workflow` and `automated-pr-review` pipeline steps.
- **5 new meta-evals** (39 → 44 total) — Methodology scaling format check, quality criteria depth tag tracking, Update Mode Specifics companion check, data flow transitive dependency validation, orphan knowledge detection.
- **Fixed cross-channel.bats test 2 no-op** — Added actual assertions to the After This Step / dependency alignment check (was performing no assertions, always passing).
- **Consolidated exempt lists** — Extracted `COMMAND_EXEMPT`, `TERMINAL_OUTPUT_EXEMPT`, `TERMINAL_PATH_PATTERNS`, `AFTER_STEP_EXEMPT`, and `CONSOLIDATION_COMMANDS` into shared `tests/evals/exemptions.bash`.
- **`docs/comprehensive-alignment-audit.md`** — 8-module alignment audit covering dependency flow, methodology scaling, mode detection, quality criteria, knowledge system, command parity, implementation handoff, and meta-eval coverage.

## [2.31.0] — 2026-03-29

### Added

- **`scaffold rework` command** — Re-run all steps within selected phases at configurable depth. Supports `--phases`, `--through`, `--exclude` for phase selection, `--fix` for auto-fixing review step issues (default on), `--fresh` for clean re-runs, and persistent sessions (`.scaffold/rework.json`) that survive context resets. Session management via `--resume`, `--clear`, and `--advance` flags.
- **Rework mode in scaffold-runner skill** — Runner skill auto-detects active rework sessions, executes steps sequentially, pauses at phase boundaries, and supports natural language triggers ("rework phases 1-5", "resume rework", "rework status").
- **`reworkFix` assembly option** — Assembly engine injects auto-fix instructions for review steps during rework mode, directing Claude to apply fixes directly to artifacts instead of just listing issues.
- **41 new tests** — ReworkManager unit tests (17), phase-selector unit tests (18), E2E lifecycle tests (6), plus 11 CLI command tests and 3 assembly engine tests.

## [2.30.0] — 2026-03-28

### Fixed

- **`implementation-plan` disconnected from story-tests outputs** — Added `reads: [story-tests]` so implementation tasks reference test skeletons from `tests/acceptance/`. Tasks now include which pending tests to implement rather than generic "write tests" instructions.
- **`implementation-playbook` missing quality artifact references** — Added `reads: [story-tests, create-evals, implementation-plan]` and input references to `tests/acceptance/`, `docs/story-tests-map.md`, `tests/evals/`, and `docs/eval-standards.md`. Agents following the playbook now know about test skeletons and eval quality gates.
- **`traceability-matrix` didn't trace Stories → Test Cases** — Added `reads: [story-tests, create-evals]` and input references to `docs/story-tests-map.md`. Traceability now verifies the full chain: PRD → Stories → Test Cases → Tasks.
- **`output-consumption.bats` incorrectly exempted `story-tests`** — Removed from `TERMINAL_OUTPUT_EXEMPT` since `create-evals` consumes its outputs.
- **Generic quality criteria** in `traceability-matrix`, `implementation-plan`, and `implementation-playbook` strengthened with specific test/eval gate references.
- **`implementation-plan` command Required Reading** — Added `tests/acceptance/` and `docs/story-tests-map.md` to the table.

### Added

- **`docs/alignment-audit.md`** — Full audit of the test/eval/implementation artifact chain with dependency map, findings, and proposed changes.

## [2.29.0] — 2026-03-28

### Added

- **TypeScript tests in CI** — CI workflow now installs Node.js, runs `npm run lint`, `npm run type-check`, `npm test`, and `npm run build` on every PR. Previously only bash tests ran.
- **Coverage thresholds** — vitest enforces 84/80/88/84 (statements/branches/functions/lines) minimums. Any PR that drops coverage below these floors fails CI.
- **`make check-all` target** — Unified quality gate that runs both bash gates (`make check`) and TypeScript gates (`ts-check`) in one command.
- **4 new validation test files** — Dedicated tests for `config-validator.ts`, `dependency-validator.ts`, `frontmatter-validator.ts`, `state-validator.ts` (87 tests, 57% → 92% branch coverage).
- **3 new meta-eval files** — `output-consumption.bats` (pipeline outputs consumed downstream), `dependency-ordering.bats` (transitive ordering + cycle detection), `prompt-quality.bats` (section content, placeholders, Mode Detection phrasing). 7 new eval tests.
- **4 extended meta-evals** — `pipeline-completeness.bats` (conditional step validity), `command-structure.bats` (After This Step chain integrity), `cross-channel.bats` (knowledge-base reference quality).
- **`vitest.e2e.config.ts`** — Dedicated E2E test config. The `test:e2e` npm script was previously broken (referenced a missing file).
- **`tests/install-uninstall.bats`** — 15 tests for install.sh and uninstall.sh scripts using mocked HOME directory.
- **`tests/helpers/fixtures.ts`** — Shared test fixture factory for MetaPrompt, Config, State, Preset, DependencyGraph, and AssemblyResult types.
- **`src/core/dependency/graph.test.ts`** — 12 dedicated unit tests for DAG construction.
- **`src/wizard/suggestion.test.ts`** — 29 tests for methodology suggestion engine.

### Changed

- **Overall test coverage: 84% → 90%** — 997 TypeScript tests (was 772), 70 bats tests (was 54), 39 meta-evals (was 28).
- **`skill.ts` coverage: 47% → 96% branches** — 12 tests covering install/remove/list in all modes.
- **`run.ts` coverage: 68% → 86% branches** — 33 tests covering crash recovery, update mode, depth downgrade, interactive flows.
- **`reset.ts` coverage: 68% → 95% branches** — 29 tests covering interactive confirmation, lock failures, force overrides.
- **`validation/` coverage: 57% → 92% branches** — 4 dedicated test files with 87 tests.
- **`knowledge-loader.ts` coverage: 68% → 95% statements** — 47 tests covering Deep Guidance extraction, overrides, edge cases.
- **`update.ts` coverage: 57% → 91% statements** — 19 tests covering version checks, network errors, CLI auth.
- **`version.ts` coverage: 59% → 98% statements** — 16 tests covering JSON output, registry fetch, error handling.
- **Renamed `test:bench` to `test:perf`** in package.json (performance tests use `.test.ts`, not `.bench.ts`).

### Fixed

- **64 ESLint errors** — All fixed (unused vars, line length, `any` types, quotes, trailing commas). Zero lint errors remaining.
- **Broken `test:e2e` script** — Created missing `vitest.e2e.config.ts`.

## [2.28.1] — 2026-03-28

### Fixed

- **TypeScript build error in `status.test.ts`** — Fixed TS2352/TS2493 cast error on mock call args by routing through `unknown` first. Caused Homebrew install failure.

## [2.28.0] — 2026-03-28

### Fixed

- **`story-tests` missing from `scaffold status` in existing projects** — New `reconcileWithPipeline()` method in StateManager detects pipeline steps absent from the project's `state.json` and inserts them as pending. Called from both `status` and `next` commands.
- **`add-e2e-testing` wrong dependencies and outputs** — Added missing `tdd` dependency. Removed `docs/tdd-standards.md` from outputs (the step modifies it, not creates it). Added `reads: [tdd, coding-standards]` for soft artifact references.
- **`platform-parity-review` wrong directory and weak dependencies** — Moved from `pipeline/stories/` to `pipeline/parity/` to match the phase slug. Dependencies now include `review-architecture`, `review-database`, `review-api`, `review-ux` instead of just `user-stories`.

### Added

- **Depth 4+ outputs in review frontmatter** — 21 review step frontmatter files now declare multi-model outputs (`review-summary.md`, `codex-review.json`, `gemini-review.json`) for correct completion detection at higher depths.
- **`reads` field across pipeline** — 13 pipeline files now declare soft artifact references via the `reads` frontmatter field, making implicit cross-phase dependencies explicit without creating hard blocks.
- **Update Mode Specifics** — 27 creation steps now include `## Update Mode Specifics` sections explaining what to preserve, what triggers updates, and how to handle conflicts in brownfield/update mode.
- **Expanded Mode Detection** — Terse 1-line Mode Detection blocks in `tdd`, `database-schema`, `api-contracts`, `ux-spec`, consolidation steps, and others expanded to 4-8 lines with concrete guidance.
- **3 new knowledge entries** — `task-tracking` (Beads patterns), `claude-md-patterns` (CLAUDE.md structure and merge strategy across 7 steps), `multi-model-review-dispatch` (depth 4+ external model guidance).
- **`review-step-template` knowledge entry** — Shared template documenting the common structure across 15+ review pipeline steps.
- **Finding Disposition sections** — All 7 validation steps now include P0-P3 severity handling guidance (who decides, when to fix, how tasks reorder).
- **Conditional Evaluation sections** — 6 conditional steps now document the project signals that trigger enable/disable decisions.
- **Strengthened Quality Criteria** — `operations.md`, `security.md` now match the specificity of specification-phase criteria. `create-evals.md` criteria vary by depth (mvp vs deep).
- **`docs/glossary.md`** — 11 pipeline term definitions (greenfield, brownfield, depth levels, wave plan, conditional step, etc.).
- **`design-system-tokens.md` completed** — Expanded from 168 to 465 lines. WIP marker removed. Full coverage of color tokens, spacing, responsive breakpoints, accessibility, and all component patterns.
- **Knowledge cross-references** — 8 knowledge entries now include "See Also" sections linking to related entries.

### Changed

- **Knowledge entry renames** — `review-api-contracts` → `review-api-design`, `review-database-schema` → `review-database-design`, `review-ux-spec` → `review-ux-specification` (aligned with creation-step knowledge names).
- **CLAUDE.md cleanup** — Removed stale "Process" section reference (v1 artifact). Updated prompts.md sync guidance to v2-accurate `scaffold build` workflow.
- **`beads` and `claude-md-optimization`** now reference their new knowledge entries (`task-tracking`, `claude-md-patterns`).

## [2.27.0] — 2026-03-28

### Added

- **Multi-LLM verification across all review, validation, innovation, and research steps** — 21 pipeline steps now support depth-gated Codex/Gemini CLI dispatch (depth 4: one external model, depth 5: full multi-model reconciliation) with graceful fallback to Claude-only when CLIs are unavailable. Follows the established pattern from `review-user-stories` and `implementation-plan-review`. Covers 11 review steps, 7 validation steps, 2 innovation steps, and tech-stack research.

## [2.26.0] — 2026-03-28

### Added

- **`story-tests` pipeline step** (Phase 9, order 915) — Generates tagged, pending test skeletons from user story acceptance criteria. Creates one test file per story in `tests/acceptance/`, one test case per AC tagged with `[US-xxx:AC-y]` for traceability. Assigns test layer (unit/integration/e2e) based on AC type. Produces `docs/story-tests-map.md` traceability matrix. Replaces approximate keyword matching with precise tag-based AC-to-test coverage.
- **`create-evals` now depends on `story-tests`** — Coverage evals can verify AC tags instead of keyword co-occurrence, providing precise rather than approximate coverage checking.

## [2.25.0] — 2026-03-28

### Added

- **8 new conditional eval categories in `create-evals`** — Expands from 5 to 13 document-driven eval categories. Each is only generated when its source document exists: architecture conformance (system-architecture.md), API contract validation (api-contracts.md), security pattern verification (security-review.md), database schema conformance (database-schema.md), accessibility compliance (ux-spec.md), performance budget (plan.md NFRs), configuration validation (dev-setup.md), error handling completeness (coding-standards.md).
- **Deep Guidance for all new categories** in eval-craft knowledge base — implementation patterns per stack, false positive mitigation, exclusion mechanisms, and anti-patterns.
- **Methodology depth scaling** — Depth 1-2: 2 categories, Depth 3: 4, Depth 4: 8, Depth 5: all 13.

## [2.24.0] — 2026-03-28

### Added

- **Phase-alignment meta-eval** — Verifies every pipeline step's order number falls within its phase's expected range (Phase N → N00-N99). Catches ordering drift automatically.
- **Dependency-direction meta-eval** — Verifies all dependencies point to same or earlier phase (no forward dependencies).
- **Skill trigger evals** (`tests/evals/skill-triggers.bats`) — 7 tests verifying skill activation patterns: runner triggers for run/batch/status, pipeline has activation boundary, dispatch activates for review context, no skill overlap.
- **Cross-document consistency eval category** in `create-evals` — 5th category checking technology, path, terminology, and cross-reference consistency across scaffold-produced docs. Generated in user projects alongside existing 4 categories.
- **Meta-evals in CI** — `make check` now includes `make eval`, so all 29 meta-evals run on every PR automatically.
- **`implementation-plan` depends on `create-evals`** — Quality gate: evals must pass before task decomposition begins.

### Fixed

- **Pre-existing cross-channel.bats failures** — `((checked++))` fails under bash `set -e` when `checked=0` (bash treats `((0))` as false). Replaced with `checked=$((checked + 1))`.
- **design-system-tokens.md** marked as eval-wip (166 lines, below 200-line core minimum).

## [2.23.0] — 2026-03-28

### Changed

- **Phase-aligned order numbers** — All 50 pipeline steps renumbered so Phase N uses orders in the N00 range (Phase 1 = 110-160, Phase 2 = 210-250, ..., Phase 14 = 1410-1430). Steps spaced by 10 for future insertions. Previously Phase 5 had orders 7-8 and Phase 2 had orders 40-45 — now you can tell which phase a step belongs to from its order alone. Also eliminates the fractional order (create-evals was 20.5, now 920).
- **Phase 10 renamed** — "Stories & Reviews" (`stories`) → "Platform Parity" (`parity`). The phase contains only `platform-parity-review`, which audits cross-platform coverage, not stories.
- **Methodology YAML comments** — Reordered from scrambled (Phase 2, 3, 4, 1...) to sequential (Phase 1 through 14).

### Fixed

- **Missing dependency: `implementation-plan` → `review-architecture`** — The step's Required Reading lists `docs/system-architecture.md`, `docs/domain-models/`, and `docs/adrs/` as REQUIRED inputs, but the dependency graph didn't guarantee these were ready. `review-architecture` transitively covers all three through the modeling→decisions→architecture chain.

### Added

- **Execution model documentation** in scaffold-pipeline skill — explains the two parallel tracks (infrastructure vs domain/quality), convergence at planning, how order numbers work as tiebreakers, and which phases can run in parallel.

## [2.22.1] — 2026-03-28

### Fixed

- **`multi-model-review-tasks` not removed from existing projects** — Added `multi-model-review-tasks` to `RETIRED_STEPS` in state migration so existing projects auto-remove the retired step from `state.json` on next `scaffold status` or `scaffold run`. Without this, upgraded projects showed the step as pending with a total of 51 instead of 50.

## [2.22.0] — 2026-03-28

### Changed

- **Standardized phase definitions across codebase** — Created a canonical `PHASES` constant in `src/types/frontmatter.ts` as the single source of truth for all 14 phase slugs, numbers, and display names. Fixed stale references that listed only 9 phases in the TypeScript type comment, frontmatter schema doc, and pipeline skill. Rewrote `prompt-pipeline` command from old sub-phase numbering (5b/5c/7b/7c) to canonical 14-phase structure. Updated CLAUDE.md to reference v2 architecture as source of truth. Added v1 deprecation notice to `docs/scaffold-overview.md`.

### Added

- `PHASES` constant, `PhaseSlug` type, and `PHASE_BY_SLUG` lookup map in `src/types/frontmatter.ts`
- Phase reference table in `scaffold-pipeline` skill with all 14 phases (number, slug, display name)

## [2.21.0] — 2026-03-27

### Added

- **Batch execution in scaffold runner skill** — The runner can now handle multi-step requests like "re-run all reviews", "run phases 5-8", "run the next 5 steps", or "finish the pipeline". Resolves natural language to ordered step lists, executes sequentially, carries forward session preferences (depth, decisions), and continues autonomously — stopping only on blockers requiring human intervention. Includes batch summary reporting and interrupted batch resumption.

## [2.20.1] — 2026-03-27

### Fixed

- **README step counts** — Updated all pipeline step count references from 51 to 50 after merging `multi-model-review-tasks` into `implementation-plan-review`.

## [2.20.0] — 2026-03-27

### Changed

- **Merged `multi-model-review-tasks` into `implementation-plan-review`** — The standalone multi-model review pipeline step was redundant with the review's own multi-model validation section. The review now handles everything in an 8-phase structure: coverage audit (produces `task-coverage.json`), task quality, dependencies, standards alignment, risk assessment, present/fix, execute changes, and multi-model validation (depth 4+). Planning phase reduced from 3 steps to 2.

### Added

- **Risk assessment in planning phase** — `implementation-plan` now flags high-risk tasks (technology, integration, complexity, critical path) with severity and mitigation. `implementation-plan-review` Phase 5 verifies risk flags.
- **Wave plan & parallelism output** — `implementation-plan` now produces a wave summary showing tasks per wave and maximum useful agent count, helping users plan worktree/agent allocation before execution.

### Removed

- **`multi-model-review-tasks` pipeline step and command** — Absorbed into `implementation-plan-review`. The `scripts/implementation-plan-mmr.sh` script and schema are preserved (now invoked by the review's Phase 8).

## [2.19.3] — 2026-03-27

### Fixed

- **Build error: `'complete'` not assignable to `LockableCommand`** — The `scaffold complete` command (v2.19.0) passed `'complete'` to `acquireLock()` but the `LockableCommand` type union didn't include it. TypeScript caught this during `brew install` build. Added `'complete'` to the union type.

## [2.19.2] — 2026-03-27

### Fixed

- **MCP memory server recommendations** — ai-memory-setup recommended Engram, hmem, and Claude-Mem, but none exist as installable npm/brew packages. Replaced with `@modelcontextprotocol/server-memory` (official MCP Knowledge Graph server, stable, zero-setup via `npx`). Updated command, knowledge base, runner skill, and check command detection. Net -90 lines of non-functional configurations removed.

## [2.19.1] — 2026-03-27

### Fixed

- **State manager crash on new pipeline steps** — `scaffold run ai-memory-setup` (or any step added after project initialization) crashed with "Cannot set properties of undefined (setting 'status')". The `setInProgress()` method now auto-creates a pending step entry before transitioning to in_progress, handling the case where the pipeline has new steps not in the original `state.json`.

## [2.19.0] — 2026-03-27

### Added

- **`scaffold complete <step>` command** — Marks a step as completed for steps executed outside `scaffold run` (e.g., via `scaffold run --auto` + manual execution). Handles `in_progress → completed`, `pending → completed`, already-completed clean exit, `in_progress` record cleanup, and fuzzy step name matching. 8 new tests.
- **README updated** — CLI commands table, test counts, architecture section updated for all v2.13-v2.18 changes (51 steps, 19 multi-model commands, 45 knowledge entries, TDD in foundation, NO_BROWSER=true, finalization order).

## [2.18.0] — 2026-03-27

### Fixed

- **SKILL.md v2 step names** — Pipeline Order table used v1 combined names (`prd-gap-analysis`, `user-stories-gaps`) instead of v2 individual steps (`review-prd` + `innovate-prd`, `review-user-stories` + `innovate-user-stories`). Now matches prompt-pipeline.md.

### Verified (Final Cross-Phase Audit)

Complete systematic verification of all 51 pipeline steps:
- Zero remaining `docs/prd.md` references (commands, pipeline, knowledge, prompts.md)
- All Gemini invocations have `NO_BROWSER=true` (commands, skills, scripts)
- All 19 review/validation commands have Multi-Model Validation with auth pre-flight
- All 19 have explicit dispatch step in Process section
- All execution/task commands handle both Beads and non-Beads
- All 51 steps present in all 3 methodology presets
- After This Step chains complete from create-prd through execution
- All document-creating commands have Mode Detection
- prompts.md, SKILL.md, and prompt-pipeline.md all have complete step coverage

## [2.17.7] — 2026-03-27

### Enhanced

- **developer-onboarding-guide** now references `.claude/rules/`, `docs/ai-memory-setup.md`, and `docs/decisions/` in its Inputs table and "Where to Find Things" section (conditional on existence).

## [2.17.6] — 2026-03-27

### Fixed

- **3 validation commands missing Multi-Model Validation** — `decision-completeness`, `dependency-graph-validation`, and `scope-creep-check` were missing the entire Multi-Model Validation (Depth 4-5) section that the other 4 validation commands had. Added full section with `NO_BROWSER=true`, auth pre-flight, command-specific review bundles, and explicit Process step. All 7 validation commands now have consistent multi-model support.

## [2.17.5] — 2026-03-27

### Fixed

- **implementation-plan-mmr.sh Gemini hang** — Added `NO_BROWSER=true` to both Gemini invocations (initial + retry) in the multi-model review script. Without this, Gemini hangs on consent prompt in non-TTY shells.
- **implementation-plan.md missing upstream docs** — Required Reading table was missing 8 docs: system-architecture, domain-models/, adrs/, operations-runbook, security-review, database-schema, api-contracts, ux-spec. These are needed to create comprehensive implementation tasks.

## [2.17.4] — 2026-03-27

### Fixed

- **workflow-audit After This Step** — Pointed to create-evals (which now runs in Phase 5e before consolidation since v2.16.1). Now correctly points to implementation-plan (Phase 7).

## [2.17.3] — 2026-03-27

### Fixed

- **Quality phase After This Step chains** — 3 commands pointed to wrong next steps: `security.md` → create-evals (already done), `create-evals.md` → implementation-plan (skips operations/security), `review-security.md` → implementation-plan (skips consolidation). All now correctly point to the next step in the pipeline execution order.

## [2.17.2] — 2026-03-27

### Enhanced

- **Specification phase upstream reads** — database-schema now reads `docs/tech-stack.md` (database engine) and `docs/user-stories.md` (query patterns). api-contracts now reads `docs/tech-stack.md` (API framework). ux-spec now reads `docs/coding-standards.md` (component naming).
- **Cross-references between spec commands** — database-schema and api-contracts now conditionally read each other's output for payload-to-schema alignment validation.
- **After This Step chains clarified** — Each spec command now guides: create → review → next applicable spec → quality gates. Removed ambiguous branching.
- **Multi-model validation bundles completed** — review-database added `docs/adrs/` and `docs/api-contracts.md`. review-api added `docs/adrs/` and `docs/database-schema.md`. review-ux added `docs/api-contracts.md`.

## [2.17.1] — 2026-03-27

### Fixed

- **prompt-pipeline.md rewritten** — The `/scaffold:prompt-pipeline` command was severely outdated (showed 20 steps in 7 phases). Rewritten to show the complete 48-step pipeline across all phases including modeling, architecture, specification, quality gates, validation, finalization, and ai-memory-setup.
- **Resume commands non-Beads fallback** — `single-agent-resume` and `multi-agent-resume` assumed Beads with no fallback. Now handle non-Beads projects (read `docs/implementation-plan.md` for task tracking).

## [2.17.0] — 2026-03-27

### Added

- **10 validation/finalization steps added to prompts.md and pipeline skill** — 7 validation checks (cross-phase-consistency through scope-creep-check) and 3 finalization steps (apply-fixes-and-freeze, developer-onboarding-guide, implementation-playbook) added as Phase 7b and 7c. Execution split to Phase 8.
- **Full pipeline path now documented**: Plan Review → Validation (7 parallel checks) → Apply Fixes & Freeze → Onboarding Guide → Implementation Playbook → Execution

### Fixed

- **implementation-plan-review After This Step** — Previously jumped directly to execution, bypassing 10 steps. Now references validation phase with MVP skip option.
- **single-agent-start / multi-agent-start** — No longer assume Beads is configured. Non-Beads projects read `docs/implementation-plan.md` for task list.

## [2.16.2] — 2026-03-27

### Fixed

- **Gemini CLI hang in non-TTY shells** — Added `NO_BROWSER=true` to all Gemini invocations across 20 files. Root cause: Gemini relaunches as a child process and shows a consent prompt ("Do you want to continue? [Y/n]") that hangs when stdin is not a TTY. `NO_BROWSER=true` suppresses this prompt and uses cached credentials directly. OAuth tokens were always persisted — the issue was purely the consent prompt blocking, not missing auth.

## [2.16.1] — 2026-03-27

### Added

- **6 quality gate steps added to prompts.md and pipeline skill** — review-testing, create-evals, operations, review-operations, security, review-security were in pipeline files but missing from documentation. Added as Phase 5e (Quality Gates). Updated dependency graphs with quality gate chain.

### Changed

- **create-evals moved from Phase 6 to Phase 5e** — Was listed after workflow-audit in prompts.md, but the v2 pipeline places it in the quality phase (after tdd). Now correctly positioned before consolidation.

## [2.16.0] — 2026-03-27

### Added

- **12 v2 steps added to prompts.md and pipeline skill** — Domain modeling, ADRs, system architecture, and specification phases (12 steps + reviews) were in pipeline files and methodology presets but missing from prompts.md Setup Order table and scaffold-pipeline SKILL.md. Added as Phase 5b (Domain Modeling), Phase 5c (Architecture Decisions), and Phase 5d (Specification). Updated dependency graphs in both files.

### Fixed

- **ux-spec / review-ux After This Step** — Pointed to `/scaffold:tdd` (foundation phase, already complete). Now correctly points to `/scaffold:claude-md-optimization`.
- **database-schema.md** — Added `docs/plan.md` to initial read instruction for PRD context.
- **api-contracts.md** — Added `docs/user-stories.md` to initial read instruction (was in Process section but missing from intro).

## [2.15.2] — 2026-03-27

### Enhanced

- **dev-env-setup now reads docs/tdd-standards.md** — Since TDD moved to foundation phase (v2.14.0), tdd-standards.md exists before dev-env-setup runs. Test commands now match what TDD standards specify (test runner, flags, coverage thresholds, quality gates).
- **cli-pr-review.sh template includes auth pre-flight** — The generated PR review script now verifies CLI authentication before dispatching (codex login status, gemini minimal prompt). Skips unauthenticated CLIs with warning instead of hanging.
- **automated-pr-review Process step 4** — Now specifies exact auth verification commands instead of vague "verify prerequisites".

## [2.15.1] — 2026-03-27

### Fixed

- **Multi-model dispatch now in Process section** — All 15 review/validation commands had multi-model validation as a disconnected section above the Process checklist. Agents followed the Process steps and skipped CLI dispatch. Now an explicit numbered step: "(Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes".
- **Previous auth failures no longer exempt subsequent dispatches** — Added "MANDATORY at depth 4+" label, inline auth pre-flight checks, and explicit "Previous auth failures do NOT exempt this dispatch — re-check before each review step" rule to all 15 commands and the multi-model-dispatch skill.

## [2.15.0] — 2026-03-27

### Fixed

- **PRD filename standardized to `docs/plan.md`** — Replaced `docs/prd.md` references across 42 files (22 pipeline, 17 commands, 2 knowledge, 1 README). The create-prd command always produced `docs/plan.md` but pipeline files incorrectly referenced `docs/prd.md`. The create-prd pipeline meta-prompt was self-contradictory (outputs said `plan.md`, Expected Outputs said `prd.md`).

### Improved

- **Innovation commands now reference knowledge base instead of duplicating content** — Removed 171 lines of verbatim-duplicated content from `innovate-prd.md` (decision matrix, 5 innovation categories) and `innovate-user-stories.md` (enhancement categories, evaluation framework). Commands now reference their knowledge base entries (`prd-innovation`, `user-story-innovation`) which the v2 engine assembles automatically.

## [2.14.1] — 2026-03-27

### Fixed

- **CLI auth pre-flight checks** — Multi-model dispatch now verifies authentication before dispatching reviews, not just CLI installation. Gemini exit code 41 (auth failure) and Codex stderr auth messages are detected specifically. Auth failures surface to the user with interactive recovery commands (`! codex login` / `! gemini -p "hello"`) instead of silently falling back to Claude-only review.

## [2.14.0] — 2026-03-27

### Changed

- **TDD moved to foundation phase** — Pipeline step relocated from `pipeline/quality/` (order 19, after review-architecture) to `pipeline/foundation/` (order 44, after coding-standards). Now runs as Phase 2 item #6, matching `prompts.md` intent. Dependencies changed from `[review-architecture]` to `[coding-standards]`. Architecture docs are optional inputs (available when re-running later). Project-structure order bumped to 45.

### Fixed

- **Beads/non-Beads commit format consistency** — Six commands had Beads-only commit format documentation. Non-Beads projects (the majority) now have documented conventional commit format:
  - `coding-standards.md` — Added Beads detection, documents both `[BD-<id>] type(scope): desc` and conventional `type(scope): desc` with examples
  - `create-evals.md` — Fixed hard-coded `[BD-\w+]` regex to detect `.beads/` and use appropriate format check
  - `beads.md` — Added note that non-Beads projects use conventional commits
  - `release.md` / `version-bump.md` — Clarified task ID is conditional on `.beads/` existing

## [2.13.2] — 2026-03-27

### Fixed

- **claude-md-optimization** now detects `.claude/rules/` and reinforces the pointer pattern instead of re-inlining conventions. Targets CLAUDE.md under 200 lines when rules exist.
- **workflow-audit** now includes a "Memory & Rules Consistency Check" section — verifies rule files match source docs, globs match real files, and CLAUDE.md uses pointer pattern.
- **Lifecycle hooks** in ai-memory-setup now integrate with the configured MCP memory server (Engram/hmem) instead of echoing to `/dev/null`. File-logging fallback for Tier 1-only setups.
- **Missing .gitignore update** — added consolidated Step 2.3b to add MCP database directories to .gitignore.
- **Decision log vs ADRs** — added comparison table and Beads task ID field to decision entry format.
- **coding-standards** After This Step now notes that ai-memory-setup rules may need re-syncing after updates.

## [2.13.1] — 2026-03-27

### Fixed

- **Codex CLI "Not inside a trusted directory"** — Added `--skip-git-repo-check` flag to all `codex exec` invocations across multi-model-dispatch skill, command files, scripts, runner skill, and README. Required when running reviews before git is initialized.

## [2.13.0] — 2026-03-27

### Added

- **`ai-memory-setup` pipeline step** — New Phase 3 environment step (order 58, after git-workflow) that configures a tiered AI memory stack:
  - **Tier 1 — Modular Rules**: Extracts conventions from coding-standards.md, tech-stack.md, and git-workflow.md into path-scoped `.claude/rules/` files. Keeps CLAUDE.md lean under 200 lines.
  - **Tier 2 — Persistent Memory**: Configures MCP memory server (Engram/hmem/Claude-Mem), lifecycle hooks (PreCompact, Stop, PreToolUse), and structured decision logging in `docs/decisions/`.
  - **Tier 3 — External Context**: Adds library documentation server (Context7/Nia/Docfork) to prevent API hallucination.
- **`ai-memory-management` knowledge base** — New domain expertise file with research-backed memory best practices including the ETH Zurich findings on context file effectiveness.
- **`scaffold check ai-memory-setup`** — Detects existing `.claude/rules/`, MCP memory server configuration, lifecycle hooks, and decision logging structure.

### Enhanced

- **README.md** — Comprehensive rewrite reflecting all v2.7–v2.12 changes (batch skip, compact status, unified E2E testing, automated PR review, multi-model dispatch, retired steps).
- **Pipeline cross-references** — git-workflow and automated-pr-review "After This Step" sections now reference ai-memory-setup.

## [2.12.0] — 2026-03-28

### Added

- **`multi-model-dispatch` skill** — New auto-activated skill documenting correct Codex CLI (`codex exec`) and Gemini CLI (`gemini -p`) invocation patterns for headless operation from Claude Code. Covers context bundling templates, dual-model reconciliation rules, output parsing, and fallback handling.
- **Multi-model validation on all review/validation steps** — All 11 domain review commands and 4 validation commands now include a "Multi-Model Validation (Depth 4-5)" section that dispatches to available Codex/Gemini CLIs for independent validation.

### Fixed

- **Codex CLI invocation** — Fixed `automated-pr-review` to use `codex exec` (headless mode) instead of bare `codex` (interactive TUI that fails with "stdin is not a terminal"). Added explicit invocation commands to `review-user-stories` depth 5 section.

## [2.11.0] — 2026-03-28

### Removed

- **Retired `claude-code-permissions`** as a standalone pipeline step — most users run with `--dangerously-skip-permissions`, making the step inert. Deny rules folded into `git-workflow` (project-level) and `tech-stack` (stack-specific). State migration removes the step from existing projects.

### Enhanced

- **`git-workflow`** now creates `.claude/settings.json` with project-level deny rules (no force push to main, no rm -rf, no git reset --hard, etc.)
- **`tech-stack`** now adds stack-specific deny rules to `.claude/settings.json` (Prisma reset, DROP TABLE, kubectl delete, etc.)

## [2.10.1] — 2026-03-28

### Added

- **Local CLI review mode** — `automated-pr-review` now supports running Codex and/or Gemini CLI locally against the PR diff for immediate results. No external bot, no polling. When both CLIs are available, runs both independently and reconciles findings by confidence level (dual-model review).
- **CLI detection in `scaffold check`** — `scaffold check automated-pr-review` now reports available CLIs and recommends local-cli vs external-bot mode.

## [2.10.0] — 2026-03-28

### Added

- **`automated-pr-review` step** — Replaces `multi-model-review` with an agent-driven architecture that uses zero GitHub Actions minutes. The agent polls for external reviews via `gh api` and handles fixes locally.
- **Configurable reviewer** — Choose between Codex Cloud (default), Gemini Code Assist, or a custom reviewer bot.
- **Applicability check** — `scaffold check automated-pr-review` detects GitHub remote and CI configuration.

### Removed

- **`multi-model-review`** as a pipeline step (replaced by `automated-pr-review`). State migration handles the rename.
- **GitHub Actions review workflows** — No more `code-review-trigger.yml`, `code-review-handler.yml`, `codex-timeout.yml`, or `post-merge-followup.yml`.
- **ANTHROPIC_API_KEY requirement** — Fixes run locally, not via Claude Code Action in CI.

### Changed

- **Prompt reduced by ~2,900 lines** — Focused on configuration decisions rather than YAML workflow generation.

## [2.9.1] — 2026-03-28

### Fixed

- **Remove retired `user-stories-multi-model-review` from project state** — Projects initialized before v2.8.0 still had this step as pending in `state.json`, causing it to appear in `scaffold status`. New `RETIRED_STEPS` migration phase removes orphaned entries on next state load.

## [2.9.0] — 2026-03-27

### Added

- **Unified `add-e2e-testing` step** — Replaces separate `add-playwright` and `add-maestro` steps with a single step that auto-detects project platform from `tech-stack.md` and `package.json`. Configures Playwright for web, Maestro for mobile, or both. Self-skips for backend-only projects.
- **`scaffold check` command** — New CLI command to preview step applicability without executing: `scaffold check add-e2e-testing` shows platform detection, brownfield status, and recommended mode.
- **Brownfield detection** — Detects existing Playwright config or Maestro flows and auto-enters update mode.
- **Framework-specific Playwright config** — Generates correct `webServer` configuration for Next.js, Vite, Remix, Gatsby, SvelteKit, and Angular.
- **Expo-specific Maestro detection** — Detects SDK version, EAS Build, and managed vs bare workflow.

### Removed

- **`add-playwright`** and **`add-maestro`** as separate pipeline steps (replaced by `add-e2e-testing`). State migration handles projects with either or both old step names.

## [2.8.1] — 2026-03-27

### Fixed

- **scaffold-runner skill compatibility** — Updated scaffold-runner skill for v2.8.0 changes: added depth-aware guidance for `review-user-stories` (depth 4 adds requirements index, depth 5 adds multi-model dispatch), mapped "run multi-model review" requests to `review-user-stories` at depth 5, and added CLI availability check guidance for Codex/Gemini fallback.

## [2.8.0] — 2026-03-27

### Removed

- **Retired `user-stories-multi-model-review`** — Standalone pipeline step (order 62) removed along with its command file, shell script (`scripts/user-stories-mmr.sh`), JSON schema, and setup guide. The step was positioned too late in the pipeline (after downstream steps had already consumed the stories) and duplicated much of `review-user-stories`.

### Enhanced

- **`review-user-stories` now includes requirements traceability and multi-model review** — Depth 4 adds a formal requirements index (REQ-xxx IDs) and coverage matrix (coverage.json) for 100% PRD traceability. Depth 5 adds multi-model dispatch to Codex/Gemini with graceful fallback to Claude-only enhanced review when external CLIs aren't available. This puts the quality gate at order 5 (before downstream steps) instead of order 62.

## [2.7.0] — 2026-03-27

### Added

- **Batch skip** — `scaffold skip step1 step2 --reason "..."` skips multiple pipeline steps in one command. Each step is validated independently; partial failures don't block valid skips. Exit code 2 for partial failure, JSON output includes a `results` array.
- **Compact status** — `scaffold status --compact` hides completed and skipped steps, showing only a summary count line plus pending/in-progress steps. Both interactive and JSON modes supported.

### Updated

- **scaffold-runner skill** — Documents batch skip usage, compact status, new navigation mappings ("Skip X, Y, Z", "What's left?"), and updated session preferences table.
- **scaffold-pipeline skill** — Added `--compact` and batch skip to the Status & Navigation reference.

## [2.6.0] — 2026-03-27

### Refactored

- **Deduplicate design-system and ux-spec prompts** — Extracted design token content (colors, typography, spacing, shadows, dark mode, base components, pattern library) from `knowledge/core/ux-specification.md` into a new `knowledge/core/design-system-tokens.md`. ux-spec now references `docs/design-system.md` for visual tokens instead of redefining them. Clear boundary: design-system owns appearance, ux-spec owns behavior.
- **Deduplicate operations runbook** — Operations CI/CD section now references existing CI from git-workflow instead of redefining stages 1-2. Dev environment section replaced with reference to `docs/dev-setup.md`. Knowledge file trimmed by ~200 lines.

### Fixed

- **Make Beads truly optional across entire pipeline** — Beads was declared `conditional: "if-needed"` but ~30 commands hardcoded it as mandatory. Added `.beads/` directory detection throughout. Non-Beads projects get conventional commits (`type(scope): description`), standard branch naming (`<type>/<desc>`), and skip all `bd` CLI references. Affected 31 files across commands/ and pipeline/.

### Enhanced

- **Workflow audit cross-validates operations runbook** — workflow-audit now includes `docs/operations-runbook.md` in its document inventory and consistency checks. Verifies the runbook references (not redefines) base CI and dev-setup, and doesn't hardcode commands that differ from the Key Commands table.

## [2.5.2] — 2026-03-27

### Fixed

- **Directory artifact crash** — Fix `EISDIR: illegal operation on a directory, read` crash when re-running pipeline steps whose outputs include directory paths (e.g., `docs/domain-models/`). `detectUpdateMode` now skips directory entries.

## [2.5.1] — 2026-03-27

### Fixed

- **Beads no longer a tech-stack dependency** — Removed Beads from tech-stack prompt's dependency list since it's an optional tool, not a tech stack choice.

## [2.5.0] — 2026-03-27

### Enhanced

- **CLAUDE.md optimization prompt** — Added best practices for anti-sycophancy guidance, scope discipline, structured formats for critical rules, and Key Commands as single source of truth.

## [2.4.3] — 2026-03-26

### Fixed

- **Skill activation conflict** — scaffold-pipeline skill no longer activates for status/progress queries ("where am I?", "what's next?"). Removed v1 Completion Detection section (file-existence checks) and narrowed activation to static reference only. Status and navigation now correctly route to scaffold-runner, which uses the `scaffold` CLI.

## [2.4.2] — 2026-03-26

### Added

- **`scaffold reset <step>`** — reset a single step back to pending so you can re-run it. Validates step exists (with typo suggestions), confirms before resetting completed steps, warns on in_progress steps.

### Changed

- **Scaffold Runner skill** — now handles "re-run X", "redo X", "reset X" by running `scaffold reset <step> --force` then the full execution workflow
- **Scaffold Pipeline skill** — added "Re-running Steps" section explaining reset + update mode

## [2.4.0] — 2026-03-26

### Fixed

- **"Next eligible: none" bug** — `scaffold next` and `scaffold status` now correctly compute eligible steps by loading the methodology preset. Previously they built the dependency graph with an empty preset map, breaking eligibility computation for all projects.
- **`scaffold init --force` preserves completed steps** — re-initialization now reads old state before backup, applies step name migrations, and merges completed/skipped steps into the new state. Previously all progress was lost on re-init.
- **`scaffold status` shows live eligibility** — computes eligible steps fresh instead of displaying stale cache from state.json

## [2.3.6] — 2026-03-26

### Fixed

- **New pipeline phases not recognized** — frontmatter validator only allowed the original 9 phases. Added `foundation`, `environment`, `integration`, `stories`, `consolidation` to the schema.
- **Order range too restrictive** — `order` was limited to integers 1-36. Now allows numbers 1-100 (including decimals like 20.5) to accommodate the expanded pipeline.

## [2.3.5] — 2026-03-26

### Fixed

- **Skills installed to wrong directory structure** — `scaffold skill install` was creating `.claude/skills/<name>.md` (flat files) but Claude Code expects `.claude/skills/<name>/SKILL.md` (subdirectories). Now creates the correct structure. Also cleans up old flat files from v2.3.2-2.3.4 on re-install.

## [2.3.4] — 2026-03-26

### Fixed

- **Skills not shipped in npm package** — `skills/` directory was missing from `package.json` `files` array, so `scaffold skill install` couldn't find source files after Homebrew/npm install

## [2.3.3] — 2026-03-26

### Fixed

- **`scaffold skill install` path resolution** — skills directory was incorrectly resolved relative to `dist/` instead of the package root. Now uses `getPackageRoot()` consistent with pipeline/knowledge/methodology resolution.

## [2.3.2] — 2026-03-26

### Added

- **`scaffold skill` CLI command** — one-command skill installation for CLI-only users. `scaffold skill install` copies skills to `.claude/skills/`, `scaffold skill list` shows status, `scaffold skill remove` cleans up.

### Changed

- **README simplified** — plugin install (Step 2) is now the recommended path and includes both skills automatically. CLI-only users get `scaffold skill install` as a one-liner alternative.

## [2.3.1] — 2026-03-26

### Added

- **Scaffold Runner skill** (`skills/scaffold-runner/SKILL.md`) — Claude Code skill that wraps the scaffold CLI with intelligent decision point surfacing. Previews assembled prompts, extracts AskUserQuestion patterns (depth, strictness, optional sections), presents them as interactive questions, and executes with answers baked in.
- **README installation instructions** for the skill, with usage examples

## [2.3.0] — 2026-03-26

### Added

- **`scaffold build` command generation** (T-039-T-042) — generates rich command files from pipeline steps + knowledge base entries. Plugin users (`/scaffold:`) now get domain expertise in every command, closing the quality gap between the CLI and Plugin channels.
- **`loadFullEntries()`** in knowledge loader — returns complete knowledge content (Summary + Deep Guidance) for build-time use, while `loadEntries()` continues returning Deep Guidance only for CLI assembly

### Changed

- **`AdapterStepInput` extended** with `body`, `sections`, `knowledgeEntries`, `conditional`, `longDescription` — adapters now receive full step content for richer output generation
- **`ClaudeCodeAdapter` rewritten** — generates self-contained command files with meta-prompt body, domain knowledge content, and dependency-derived navigation instead of simple wrappers

## [2.2.2] — 2026-03-26

### Added

- **Automatic state migration** — upgrading from v2.1 to v2.2 is now frictionless. On first `scaffold status` or `scaffold run`, the state manager automatically renames `testing-strategy` → `tdd`, `implementation-tasks` → `implementation-plan`, `review-tasks` → `implementation-plan-review` in `.scaffold/state.json`
- **PRD path flexibility** — projects using `docs/prd.md` (v1 convention) or `docs/plan.md` (v2 convention) now work interchangeably. The context gatherer resolves aliased artifact paths, and the project detector recognizes both filenames

## [2.2.1] — 2026-03-26

### Added

- **Meta-evals** — 6 bats-based eval files in `tests/evals/` (20 tests) that verify cross-system consistency: channel parity, knowledge quality gates, pipeline step completeness, command structure, cross-channel consistency, redundancy detection
- **`make eval` target** — runs meta-evals separately from `make test` and `make check` (opt-in for CI)

### Fixed

- **10 knowledge quality gaps** caught by the new evals: `user-story-innovation.md` expanded to 228 lines, code blocks added to 9 files (adr-craft + 8 review files)
- **`create-prd` pipeline output path** — corrected from `docs/prd.md` to `docs/plan.md` to match the actual command behavior

## [2.2.0] — 2026-03-26

### Added

- **Full pipeline/command/knowledge parity** — every pipeline step now has a matching Claude Code slash command and knowledge base reference. 53 pipeline steps, 69 commands, 43 knowledge entries.
- **31 new commands** — domain-modeling, adrs, system-architecture, database-schema, api-contracts, ux-spec, 11 review commands, 7 validation commands, operations, security, innovate-prd, innovate-user-stories, apply-fixes-and-freeze, developer-onboarding-guide, implementation-playbook
- **16 new pipeline steps** across 5 new phases (foundation, environment, integration, stories, consolidation) — beads, tech-stack, claude-code-permissions, coding-standards, project-structure, dev-env-setup, design-system, git-workflow, multi-model-review, add-playwright, add-maestro, user-stories-multi-model-review, platform-parity-review, claude-md-optimization, workflow-audit, multi-model-review-tasks
- **4 new knowledge files** — tech-stack-selection, coding-conventions, project-structure-patterns, dev-environment
- **Create Evals command** (`/scaffold:create-evals`) — generates project-specific eval checks from standards documentation with eval-craft knowledge base (843 lines)
- **Deep Guidance engine support** — `knowledge-loader.ts` now loads only the `## Deep Guidance` section from restructured knowledge files, reducing CLI prompt redundancy by 50-70%
- **Meta-eval specification** — `docs/eval-spec.md` documents 6 automated eval checks for maintaining cross-system consistency
- **Completeness audit prompt** — `prompts/scaffold-completeness-audit.md` for running full dual-channel architecture audits

### Changed

- **Pipeline step naming aligned to commands** — `testing-strategy` → `tdd`, `implementation-tasks` → `implementation-plan`, `review-tasks` → `implementation-plan-review`
- **Knowledge file `security-review` renamed** to `security-best-practices` to avoid confusion with the review knowledge file
- **5 knowledge files restructured** with Summary/Deep Guidance sections — eval-craft, prd-craft, user-stories, task-decomposition, testing-strategy
- **6 knowledge files improved** — apply-fixes-and-freeze expanded from 94 to 244 lines; 5 review files gained anti-patterns sections with concrete finding examples
- **Methodology presets updated** — deep.yml, mvp.yml, custom-defaults.yml now include all 53 pipeline steps with proper conditional markers
- **Step 4.5 AI Review enhanced** — optional acceptance criteria verification when task references user stories
- **README updated** — 14 phases, 53 steps, CLI vs plugin usage clarification, Deep Guidance documentation

## [2.1.2] — 2026-03-25

### Fixed

- **Meta-prompt loading with FAILSAFE_SCHEMA** — `conditional: null` in pipeline frontmatter was parsed as the string `"null"` instead of actual `null`, causing all 36 meta-prompts to be skipped with "Required field conditional is missing"

## [2.1.1] — 2026-03-25

### Fixed

- **Global install path resolution** — `scaffold next`, `scaffold run`, and other commands now correctly find the bundled `pipeline/`, `knowledge/`, and `methodology/` directories when installed via npm or Homebrew, instead of looking in the user's project directory
- **Package renamed** — npm package is now `@zigrivers/scaffold` (was `@scaffold-cli/scaffold`)
- **Update command** — `scaffold update` now checks the correct package name on the npm registry
- **Homebrew formula** — added missing `require "language/node"` for compatibility with current Homebrew

### Changed

- **README rewritten** — reflects v2 architecture (assembly engine, meta-prompts, 9 phases, 36 steps, methodology presets, knowledge system, CLI commands)
- **Installation docs** — clarified that CLI (npm/brew) and plugin (`/scaffold:` slash commands) are separate installs

## [2.1.0] — 2026-03-17

### Added

- **`scaffold knowledge` subcommand namespace** — four subcommands for managing project-local knowledge base overrides:
  - `scaffold knowledge update <target> [instructions...]` — generates a Claude prompt to create or refresh `.scaffold/knowledge/<name>.md`; `<target>` resolves as an entry name or step name (auto-detected), with `--step` flag to force step resolution and `--entry` to target a single entry from a step's set
  - `scaffold knowledge list` — shows all entries (global and local overrides) with NAME/SOURCE/DESCRIPTION columns; `--format json` supported
  - `scaffold knowledge show <name>` — prints the effective content for an entry (local override wins if present)
  - `scaffold knowledge reset <name>` — removes a local override, reverting to global; respects `--auto` flag to bypass uncommitted-changes confirmation
- **`buildIndexWithOverrides()`** — `scaffold run` now automatically loads project-local knowledge overrides from `.scaffold/knowledge/` during prompt assembly, layering them over global entries without any extra configuration
- **`/scaffold:knowledge` slash command** — Claude Code integration for the full knowledge namespace
- **Project-local knowledge overrides** — committable `.scaffold/knowledge/` files let teams share enriched, project-specific knowledge entries across the whole team

## [2.0.0] — 2026-03-16

### Breaking Changes

This is a complete rewrite of Scaffold. The v1 hard-coded Bash prompt pipeline has been replaced with a composable TypeScript CLI and meta-prompt architecture.

**Migration:** See `docs/v2/migration-guide.md` for step-by-step upgrade instructions.

### Added

- **TypeScript CLI** (`dist/index.js`) — fully typed, ESM, Node 18+ with 15 commands
- **Meta-prompt architecture** — 30-80 line intent declaration `.md` files in `pipeline/` assembled at runtime into structured 7-section prompts
- **Assembly engine** (`scaffold run <step>`) — loads meta-prompt, knowledge base, context, instructions, depth; constructs and outputs the full prompt for AI execution
- **Dependency graph** — DAG with topological sort (Kahn's algorithm), cycle detection, and eligibility computation
- **State manager** — atomic writes via `<file>.tmp` → `fs.renameSync()`, crash recovery, `in_progress` tracking
- **Advisory lock manager** — `lock.json` with `wx` flag and PID liveness detection
- **Decision logger** — append-only `decisions.jsonl` with `D-NNN` sequential IDs
- **Three methodology presets** — `deep` (depth 5, 36 steps), `mvp` (depth 1, 7 steps), `custom` (depth 3, configurable)
- **Depth scale 1-5** — 4-level precedence: CLI flag > step-override > custom-default > preset-default
- **Platform adapters** — Claude Code (`commands/*.md`), Codex (`AGENTS.md`), Universal (`prompts/README.md`)
- **Project detector** — greenfield / brownfield / v1-migration detection via file system signals
- **CLAUDE.md manager** — ownership markers, 2000-token budget, section management
- **Init wizard** (`scaffold init`) — interactive or `--auto` mode; writes config, state, decisions log
- **Adopt command** (`scaffold adopt`) — scans existing artifacts to bootstrap state for brownfield projects
- **Dashboard** (`scaffold dashboard`) — self-contained HTML with progress bars, status badges, light/dark theme
- **Validate command** (`scaffold validate`) — checks meta-prompts, config, state, and dependency graph
- **15 CLI commands total**: `init`, `run`, `build`, `adopt`, `skip`, `reset`, `status`, `next`, `validate`, `list`, `info`, `version`, `update`, `dashboard`, `decisions`
- **OutputContext strategy pattern** — `interactive` (ANSI, spinner), `json` (envelope), `auto` (silent defaults)
- **E2E test suite** — 39 tests covering real temp-directory workflows
- **Performance benchmarks** — assembly p95 < 500ms, state I/O p95 < 100ms, graph build p95 < 2s
- **npm packaging** — `@zigrivers/scaffold`, `files` array, `publishConfig`
- **Migration guide** — `docs/v2/migration-guide.md` with v1→v2 concept mapping and step-by-step instructions

### Changed

- Plugin description updated to reflect meta-prompt architecture
- `pipeline/` now contains composable `.md` meta-prompts instead of hard-coded Bash prompt text
- `methodology/` contains YAML preset files consumed at runtime

### Completed Tasks

- [BD-scaffold-v2] Complete v2 spec suite — domains, ADRs, schemas, API, UX, and implementation tasks
- [BD-3hj] fix(v2): resolve scope creep check findings
- [BD-11m] fix(v2): resolve dependency graph validation findings
- [BD-0nx] fix(v2): resolve implementability dry-run audit findings
- [BD-zcp] fix(v2): resolve decision completeness audit findings
- [BD-eg0] fix(v2): resolve traceability matrix audit findings
- [BD-p2m] fix(v2): resolve cross-phase consistency audit findings
- [BD-045] fix(v2): post-rename documentation review fixes

## [1.18.0] — 2026-03-08

### Added
- **Session Analyzer command** (`/scaffold:session-analyzer`) — analyzes Claude Code session history across all projects to identify repeated tasks and workflows, then recommends what to automate as skills, plugins, agents, and CLAUDE.md rules
- **CI workflow** — `.github/workflows/ci.yml` runs `make check` on all pull requests to the scaffold repo itself

### Fixed
- `bd hook` invocation corrected (`bd hooks run` → `bd hook pre-commit`)
- Removed broken `bd worktree create` call from `setup-agent-worktree.sh`

### Changed
- `AGENTS.md` simplified: removed `--claim` flag from `bd update`, streamlined landing-the-plane workflow to focus on pushing
- Minor wording updates across `commands/` and `README.md`

### Completed Tasks
- [BD-scaffold-smx] fix(workflow): streamline workflow docs and fix friction points

## [1.17.0] — 2026-02-19

### Added
- **AI review subagent step** — Git Workflow prompt now includes an AI review step (step 4.5) in the PR workflow: spawn a review subagent to check `git diff origin/main...HEAD` against CLAUDE.md and docs/coding-standards.md; P0/P1 findings block push; recurring patterns feed into `tasks/lessons.md`
- **Code Review section in CLAUDE.md** — scaffold's own CLAUDE.md now documents the review subagent approach as a dedicated section

### Fixed
- **Inaccurate Tier 1 claim** — Multi-Model Code Review prompt previously claimed `claude -p` was built into the Git Workflow prompt; replaced with the correct subagent approach using the Task tool (available in all Claude Code sessions)
- Removed all `claude -p` references from active workflow steps across `prompts.md`, `commands/`, `docs/`, and `CLAUDE.md`

### Changed
- Git Workflow Section 4 PR workflow updated: step 2 is now AI review (subagent), not `claude -p`
- CLAUDE.md Optimization Implementation Loop updated: references AI review subagent, not `claude -p`
- Workflow Audit canonical step 4.5 updated: describes review subagent approach and compound learning loop
- Multi-Model Code Review Tier 1 architecture diagram and description updated for accuracy
- `docs/add-multi-model-review.md` Phase 3.1 and 3.3 updated: subagent approach replaces `claude -p`
- PR workflow sub-step count updated from 7 to 8 (commit + AI review + rebase + push + create + auto-merge + watch + confirm)

### Completed Tasks
- [BD-scaffold-smx] fix(workflow): streamline Beads workflow docs and fix friction points
- [BD-scaffold-cga] feat(workflow): add AI review subagent step to pipeline

## [1.16.0] — 2026-02-18

### Added
- **Remove CI as merge gate** — scaffold pipeline no longer generates a CI workflow; local verification (`make check` + git hooks) is the authoritative quality gate for all scaffolded projects
- **Dashboard task modals** — click any Beads task to see full detail, dependencies, priority, and status in a pop-up; standalone command cards now also show the full prompt on click ([BD-scaffold-06k])

### Changed
- `gh pr merge` commands throughout drop `--auto` (which required CI status checks) in favor of direct squash-merge
- Branch protection config changed from `required_status_checks` to `null` — PRs required, no CI gate
- Section 9 "Repository Hygiene" updated: code quality git hooks (`make hooks`) are now the quality gate
- Git Workflow prompt removes the CI workflow file template entirely
- Multi-Model Review agent workflow updated: "Wait for CI" step removed

### Fixed
- Standalone command modals now show prompt content when clicked ([BD-scaffold-906])
- `mktemp` on macOS no longer fails when template has extension after XXXXXX ([BD-scaffold-ojr])

### Other
- Relocated loose root files (`add-multi-model-review.md`, research docs) to `docs/` ([BD-scaffold-9ot])

### Completed Tasks
- [BD-scaffold-33d] Remove CI as merge gate from scaffold pipeline
- [BD-scaffold-06k] Dashboard: task modals, status tags, command pop-ups
- [BD-scaffold-906] fix(dashboard): standalone command modals show nothing when clicked
- [BD-scaffold-ojr] fix(dashboard): mktemp uses literal XXXXXX on macOS due to trailing slash in TMPDIR
- [BD-scaffold-9ot] chore: relocate loose root files to docs/

## [1.15.0] — 2026-02-17

### Added
- **Version Bump** command (`/scaffold:version-bump`) — lightweight companion to `/scaffold:release` for marking development milestones; bumps version numbers and updates changelog without tags, push, or GitHub release; supports auto (commit analysis), explicit (`major`/`minor`/`patch`), and `--dry-run` modes; first-bump detection creates version files for new projects
- **`current` mode** for `/scaffold:release` — tag and release the version already in files without bumping further; ideal after `/scaffold:version-bump`
- **Version mismatch detection** in `/scaffold:release` (Phase 0.6) — when version in files exceeds the last tag, asks whether to release as-is or bump further
- US-12.10 (version bump milestone) and US-12.11 (release detects pre-bumped version) user stories in Epic 12

### Changed
- F-SC-2 (Release Management) expanded to cover both `version-bump` and `release` commands with interaction patterns
- F-SC-1 standalone commands list updated to include `version-bump`
- Release command "After This Step" updated to mention `/scaffold:version-bump`
- Prompt count updated from 28 to 29 across README, plugin.json, and prompts.md
- Plugin version bumped from 1.14.0 to 1.15.0

## [1.14.0] — 2026-02-17

### Added
- **Release** command (`/scaffold:release`) — automates versioned releases with conventional commit analysis, quality gates, changelog generation, version file detection and bump, git tagging, and GitHub release creation
- 7-phase release flow: project detection → version analysis → pre-release validation → changelog & release notes → version bump & commit → tag & publish → post-release summary
- 4 modes: standard (auto-suggest bump), explicit (`major`/`minor`/`patch`), dry-run (`--dry-run`), and rollback
- Version file auto-detection for `package.json`, `pyproject.toml`, `Cargo.toml`, `.claude-plugin/plugin.json`, `pubspec.yaml`, `setup.cfg`, `version.txt`
- Branch-aware publishing: direct flow on `main`/`master`, PR flow on feature branches with fallback
- Rollback with exact-tag-name safety confirmation, partial-failure reporting, and manual cleanup instructions
- Beads task integration in release notes (conditional on `.beads/` presence)
- First-release bootstrapping for projects with no existing tags
- Epic 12 (Release Management) with 9 user stories (US-12.1–12.9) in `docs/user-stories.md`
- F-SC-2 feature requirement in `docs/plan.md`

## [1.13.0] — 2026-02-17

### Fixed
- **`bd q` bug** — post-merge follow-up workflow used `bd q` (non-existent command) instead of `bd create` for creating Beads tasks from unresolved findings

### Added
- **Await PR review script** (`scripts/await-pr-review.sh`) — new artifact in multi-model-review prompt; polling script that agents call to wait for Codex Cloud review before merging, with distinct exit codes for approved/findings/timeout/skipped/error
- **Agent merge gate** safety rail — forces agents to wait for Codex review when `--auto` is unavailable, preventing race conditions between agents and the review loop
- **`--admin` prohibition** — agents are explicitly prohibited from using `gh pr merge --admin` in the CLAUDE.md workflow to prevent bypassing all protections
- **9-step PR workflow** in CLAUDE.md section — replaces the basic 5-step workflow with full Codex review waiting (step 7), merge-state checking (step 8), and error recovery table
- **`--auto` fallback** in handler and timeout workflows — tries `--auto` first, falls back to direct merge when `allow_auto_merge` is disabled on the repo
- Error Recovery table in CLAUDE.md section covering `--auto` failures, branch protection blocks, review timeouts, and merge conflicts
- Process steps for await script creation (step 5) and `docs/git-workflow.md` update (step 9)
- Test verification items for await script exit codes and `--auto` fallback behavior

### Changed
- Architecture "What Triggers What" step 5 updated from hardcoded `--auto` command to fallback description
- CLAUDE.md section expanded from simple overview to complete PR workflow that replaces git-workflow's basic version
- Process section renumbered from 9 to 11 steps to include await script and git-workflow.md update
- Commit step updated to include `scripts/await-pr-review.sh` and `docs/git-workflow.md` in staged files
- Secondary outputs list updated to include `scripts/await-pr-review.sh` and `docs/git-workflow.md`

## [1.12.1] — 2026-02-17

### Fixed
- **MCP `mcp__*` wildcard bug** — `mcp__*` doesn't reliably match all MCP tools ([known issue](https://github.com/anthropics/claude-code/issues/3107)); added bare server-name entries (`mcp__plugin_playwright_playwright`, `mcp__plugin_context7_context7`) alongside the wildcard as a more reliable alternative
- **Incorrect Playwright tool names** — `browser_fill`, `browser_select`, `browser_scroll`, `browser_get_text`, `browser_get_attribute` replaced with actual MCP tool names (`browser_fill_form`, `browser_select_option`, `browser_evaluate`, etc.)
- **Incomplete Playwright tool list** — `.claude/settings.local.json` listed 8 of 22 tools; now includes all 22 Playwright MCP tools

### Added
- MCP detection step in permissions Process section — discovers installed plugins and adds bare server-name entries
- Playwright Permissions section (section 7) in `add-playwright` command with complete 22-tool fallback list
- Troubleshooting item 6 for `mcp__*` wildcard bug in permissions command
- MCP smoke test instructions in Tier 2 verification

### Changed
- Permissions command JSON example includes bare server-name entries alongside `mcp__*`
- Cautious mode MCP entries changed from `__*` suffix to bare server names
- Playwright "Available MCP Commands" expanded from 13 to 22 tools across 3 reorganized categories

## [1.12.0] — 2026-02-17

### Fixed
- **Beads detection bug** — dashboard detection checked for `.beads/ directory` (awk parser produced invalid path); now checks `.beads/config.yaml`
- **Beads task count bug** — `bd list --json` only returned open tasks; now uses `bd list --all --json` for complete data
- **jq self-reference bug** — checkFile enrichment compared `.step == .step` (always true); now captures outer step variable with `(.step) as $s`
- **SKILL.md detection entries** — fixed `AGENTS.md + .github/workflows/...` (+ syntax confused parser) and `Playwright config file` (descriptive text, not a path); added defensive `sub(/ .*/, "", check)` strip in awk parser

### Added
- **Light/dark mode toggle** — sun/moon toggle button in header with `localStorage` persistence; defaults to dark mode; CSS uses `[data-theme="dark"]` selector instead of `@media prefers-color-scheme`
- **Status badges with legend** — replaced status dots with icon+label pill badges (`✓ Done`, `≈ Likely Done`, `→ Skipped`, `○ Pending`); added status legend below header
- **Long descriptions** — added `long-description` frontmatter field to all 33 command files with 1-2 sentence expanded descriptions; displayed below short description on prompt cards
- **Prompt drill-down modal** — click any prompt card to view full prompt content in a modal overlay; includes "Copy Full Prompt" button, close via X/Escape/backdrop click
- **Beads task section** — new section showing all Beads tasks with priority badges, status icons, and Open/Closed/All filter buttons
- 13 new bats tests covering all enhancements (43 total)
- Design system documentation for 6 new components (theme toggle, status badge, status legend, prompt modal, beads section, long description)

### Changed
- `lib/dashboard-theme.css` — dark mode mechanism from `@media` query to `[data-theme]` selector; added styles for all new components (theme toggle, status badges, legend, modal, beads section, long descriptions)
- `scripts/generate-dashboard.sh` — added data pipelines for long descriptions, prompt content, and full beads task data; added all interactive JS (theme toggle, modal, beads filters)

## [1.11.0] — 2026-02-17

### Added
- **Dashboard Design System** — extracted and redesigned all dashboard CSS into `lib/dashboard-theme.css` with a "Precision Industrial" visual identity: deep navy dark mode with indigo accents, cool-white light mode with emerald/amber status colors, gradient progress rail with glow effects, lifted hover cards, pulsing "What's Next" banner, and status dots with ring halos
- `lib/dashboard-theme.css` — standalone CSS file with 40+ design tokens (light + dark mode), 4-px spacing scale, multi-layer shadow system, and all 10 component styles; embedded into generated HTML by `generate-dashboard.sh`
- `docs/design-system.md` — comprehensive design system documentation covering tokens, typography, spacing, components, interaction patterns, dark mode philosophy, and extension guide
- Section 10 "Styling / Dashboard Design System" in `docs/coding-standards.md` — rules for using CSS custom properties and maintaining self-contained HTML
- Design System section and docs table entry in `CLAUDE.md`

### Changed
- `scripts/generate-dashboard.sh` — replaced ~200 lines of inline CSS with external `cat lib/dashboard-theme.css` embedding; split heredoc into HTMLPRE/CSS/HTMLPOST; added `.wrap` container div for layout control
- `docs/project-structure.md` — added `dashboard-theme.css` to `lib/` listing, `design-system.md` to `docs/` listing, CSS file placement rule to table

## [1.10.0] — 2026-02-17

### Added
- **Visual Pipeline Dashboard** command (`/scaffold:dashboard`) — generates a self-contained HTML file and opens it in the browser, showing a visual overview of the full pipeline with completion status, descriptions, dependency indicators, "what's next" guidance, and optional Beads task counts
- `scripts/generate-dashboard.sh` — Bash 3.2-compatible script that parses pipeline metadata from SKILL.md, detects completion status from `.scaffold/config.json` and artifact files, computes dependency-aware "what's next", and generates inline HTML/CSS/JS with automatic dark/light mode
- 16 bats tests covering exit codes, HTML validation, JSON payload structure, status detection, and all CLI flags
- F-UX-13 feature requirement in `docs/plan.md`
- Epic 11 with 4 user stories (US-11.1–11.4) in `docs/user-stories.md`
- Dual mode: overview mode (no `.scaffold/`) shows full pipeline as reference; progress mode (with `.scaffold/`) shows actual completion status
- CLI flags: `--no-open` (generate only), `--json-only` (JSON to stdout), `--output FILE` (custom path)

## [1.9.0] — 2026-02-17

### Added
- **Implementation Plan Multi-Model Review** command (`/scaffold:multi-model-review-tasks`) — optional quality gate (step 20.5) that runs Codex and Gemini as independent reviewers of the Beads task graph, checking coverage gaps, description quality, dependency correctness, sizing, and architecture coherence
- `scripts/implementation-plan-mmr.sh` — automation script for parallel Codex/Gemini CLI review of implementation tasks with graceful degradation, auto-retry, and JSON validation
- `scripts/implementation-plan-mmr.schema.json` — structured output schema with 6 review dimensions: coverage_gaps, description_issues, dependency_issues, sizing_issues, architecture_issues, review_summary
- Task coverage map (`docs/reviews/implementation-plan/task-coverage.json`) for verifiable acceptance-criterion-to-task traceability

### Changed
- Implementation Plan Review "After This Step" updated to mention optional multi-model review before execution
- Pipeline tables updated across `prompts.md`, `commands/prompt-pipeline.md`, `skills/scaffold-pipeline/SKILL.md` with step 20.5
- Completion detection table updated with `review-summary.md` check for step 20.5
- `scripts/extract-commands.sh` updated with FRONTMATTER, HEADING_TO_SLUG, and next-steps mappings for new command

## [1.8.0] — 2026-02-17

### Added
- **Post-Merge Follow-Up** system integrated into `multi-model-review` command — when PRs merge with unresolved P0/P1 findings (round cap, timeout, or late Codex review), automatically creates a Beads task, GitHub Issue, and follow-up PR to address escaped findings
- New workflow template: `.github/workflows/post-merge-followup.yml` — fires on `pull_request: [closed]` and `pull_request_review: [submitted]` with 6 safety gates (merged, not-followup, no-duplicate, not-fork, trigger-specific, findings-exist)
- New fix prompt template: `.github/review-prompts/followup-fix-prompt.md` — instructs Claude Code to fix findings using `diff_hunk` context (line numbers may shift after merge)
- `FOLLOWUP_ON_CAP` env var in handler workflow — configurable cap behavior: `"auto-merge-followup"` (default) merges and follows up, `"block-merge"` blocks merge and adds `needs-human-review` label
- New labels: `followup-created` (dedup), `followup-fix` (recursion prevention), `needs-human-review` (block-merge mode)
- Tier 3 added to architecture diagram showing the post-merge follow-up flow
- "Configuring Cap Behavior" customization section
- Follow-up test scenarios added to Process step 8

### Changed
- Handler workflow convergence check now splits `capped` verdict into `capped` (auto-merge + follow-up) and `capped-blocked` (block merge) based on `FOLLOWUP_ON_CAP` setting
- `capped` verdict message updated to mention follow-up PR
- CLAUDE.md template updated with Post-Merge Follow-Up subsection and 3 new label descriptions
- Mode Detection read list expanded to include `post-merge-followup.yml` and `followup-fix-prompt.md`
- Update Mode Specifics expanded with new secondary outputs and `FOLLOWUP_ON_CAP` preserve rule

## [1.7.2] — 2026-02-16

### Fixed
- Normalize 5 prompt headings in `prompts.md` from `##` to `#` — Tech Stack, Coding Standards, TDD, Project Structure, and Integrate Playwright now match the `# Name (Prompt)` convention used by all other prompts

## [1.7.1] — 2026-02-16

### Fixed
- `prompt-pipeline` command now includes step 15.5 (User Stories Multi-Model Review) in the Phase 5 table — was missing from the quick-reference display despite being defined everywhere else

## [1.7.0] — 2026-02-16

### Added
- **Pipeline Completion Detection** — `scaffold-pipeline` skill now includes a `## Completion Detection` section with exact file paths and tracking comment patterns for all 20 pipeline steps, enabling accurate status checks
- Tracking comment instructions for 6 update-only prompts: PRD Gap Analysis, User Stories Gaps, Platform Parity Review, Claude.md Optimization, Workflow Audit, and Implementation Plan Review — each now writes a `<!-- scaffold:<step-id> v1 YYYY-MM-DD -->` marker so completion is detectable

### Fixed
- Pipeline status detection no longer guesses file paths (e.g., checking `docs/prd.md` instead of the actual `docs/plan.md`)
- Update-only steps (2, 15, 16, 17, 18, 20) are now distinguishable from their prerequisite steps via unique tracking comments

## [1.6.1] — 2026-02-16

### Added
- `docs/multi-model-stories-review-setup.md` — beginner-friendly setup guide for Codex CLI and Gemini CLI installation, authentication, and troubleshooting
- README: "Codex CLI and/or Gemini CLI" entry in Optional prerequisites section with link to setup guide
- README: `/scaffold:user-stories-multi-model-review` entry in Other optional steps section with link to setup guide

## [1.6.0] — 2026-02-16

### Added
- **User Stories Multi-Model Review** command (`/scaffold:user-stories-multi-model-review`) — optional quality gate that runs Codex and Gemini as independent reviewers of user stories, enforcing 100% PRD coverage with hard traceability
- `scripts/user-stories-mmr.sh` — automation script for parallel Codex/Gemini CLI review execution with graceful degradation, auto-retry, and JSON validation
- `scripts/user-stories-mmr.schema.json` — structured output schema for review JSON (used by Codex `--output-schema` and Gemini output validation)
- Atomic PRD requirements index (`docs/reviews/user-stories/requirements-index.md`) and coverage map (`docs/reviews/user-stories/coverage.json`) for verifiable PRD-to-story traceability

### Changed
- Prompt count updated from 26 to 27 across all references
- User Stories Gap Analysis "After This Step" updated to mention optional multi-model review

## [1.5.0] — 2026-02-16

### Added
- **Quick Task** command (`/scaffold:quick-task`) — Create focused Beads tasks for bug fixes, refactors, performance improvements, and small refinements without full Enhancement discovery
- Phase 0 Complexity Gate auto-detects when a "quick task" is actually an enhancement and redirects to `/scaffold:new-enhancement`
- Duplicate detection via `bd list` before creating tasks (matches Implementation Plan prompt pattern)
- `tasks/lessons.md` review as first-class input during task definition — surfaces anti-patterns early
- Conventional commit task titles (`type(scope): description`) that feed directly into commit messages
- Cross-reference from Enhancement prompt's "When NOT to Use" section pointing to Quick Task for bug fixes, refactoring, and performance work

### Changed
- Enhancement prompt "When NOT to Use" updated to reference `/scaffold:quick-task` instead of generic advice
- Prompt count updated from 25 to 26 across all references

## [1.4.0] — 2026-02-16

### Added
- **Universal Update Mode** for all 14 document-creating prompts — each prompt now auto-detects whether its output file already exists and switches between fresh (create from scratch) and update (preserve project-specific content, add missing sections) modes
- Mode Detection protocol: read existing doc, diff against current prompt structure, categorize content as ADD/RESTRUCTURE/PRESERVE, preview changes for user approval, execute update, add version tracking comment
- Per-prompt Update Mode Specifics with primary/secondary outputs, preserve rules, related docs for consistency checks, and special merge rules
- Version tracking comments (`<!-- scaffold:<prompt-id> v<ver> <date> -->`) added to all generated documents for update mode detection
- "Update Mode" section in setup order table explaining that re-running any prompt brings its output up to date

### Removed
- Migration Prompts section (Beads Migration, Workflow Migration, Permissions Migration stubs) — replaced by universal update mode. Every prompt is now its own migration.

### Changed
- "Ongoing" section updated to note that any prompt can be re-run in update mode

## [1.3.8] — 2026-02-16

### Breaking Changes
- Single `code-review.yml` workflow replaced by three event-driven files: `code-review-trigger.yml`, `code-review-handler.yml`, and `codex-timeout.yml` (optional)
- AGENTS.md heading changed from `## Code Review Instructions` to `## Review guidelines`
- Approval signal changed from `APPROVED: No P0/P1/P2 issues found.` to `APPROVED: No P0/P1 issues found.`

### Added
- Fully event-driven review loop — handler fires on `pull_request_review` events, no more 10-minute polling
- Fork and draft PR blocking in gate job (security hardening)
- Codex usage-limit detection — labels PR `ai-review-blocked` and requires human merge when credits are exhausted
- Stale review detection — handler compares review `commit_id` to HEAD SHA, skips outdated reviews
- `commit_id` filtering in fix prompt — only reads findings for the current commit

### Fixed
- Shell `git diff | grep | wc -l` pipelines replaced with `gh api` + `jq` (fixes pipefail crashes on zero matches)
- Human override now verified via `author_association` (prevents non-members from bypassing review)
- Removed unnecessary `actions/checkout` from trigger workflow

### Changed
- Tier-2 (Codex Cloud) review scoped to P0/P1 only, matching real Codex behavior (P2/P3 handled by self-review)
- Cost model updated from "subscription-based (no per-review cost)" to credit-based (~25 credits/review, weekly limits)
- Convergence logic reordered: approval signal → zero findings → round cap → fix
- Prerequisites updated to accept ChatGPT Plus/Pro/Team (not just Pro)
- README updated to reflect credit-based pricing

## [1.3.7] — 2026-02-15

### Added
- Tiered model selection for `claude-fix` job — round 1 uses Sonnet (~40% cheaper), round 2+ escalates to Opus when prior fix didn't satisfy reviewer
- Updated Safety Rails cost cap documentation to reflect tiered pricing

## [1.3.6] — 2026-02-15

### Fixed
- `/scaffold:update` now actively updates plugin installs by pulling the marketplace clone in-place, instead of telling the user to run a manual command
- `/scaffold:version` dynamically detects the installed version from the marketplace clone's `plugin.json`, replacing the hardcoded version that went stale after updates

## [1.3.5] — 2026-02-15

### Added
- MCP tool permissions (`mcp__*`) to Claude Code Permissions prompt — auto-approves all MCP plugin tools (Context7, Playwright, etc.) so agents aren't prompted on every MCP call
- Per-server MCP wildcards added to cautious mode
- MCP troubleshooting and verification guidance

## [1.3.4] — 2026-02-15

### Added
- `docs/scaffold-overview.md` — central reference document covering purpose, all 29 commands, pipeline phases, dependencies, documentation outputs, and key concepts

## [1.3.1] — 2026-02-15

### Added
- `.claude-plugin/marketplace.json` — enables two-step plugin install via `/plugin marketplace add`

### Fixed
- Update install flow from single-command `/plugin install scaffold@zigrivers/scaffold` to two-step marketplace flow (`/plugin marketplace add` + `/plugin install scaffold@zigrivers-scaffold`)
- Update all docs and commands to use `/plugin marketplace update zigrivers-scaffold` instead of re-running install

## [1.3.0] — 2026-02-15

### Added
- `/scaffold:multi-agent-start` command — start multi-agent execution loop in a worktree
- `/scaffold:multi-agent-resume` command — resume multi-agent work after a break

## [1.2.0] — 2025-02-15

### Added
- `/scaffold:version` command — check installed vs. latest version without updating

## [1.1.0] — 2025-02-15

### Added
- `/scaffold:update` command — check for and apply scaffold updates from within Claude Code
- `scripts/update.sh` — standalone CLI update script for terminal use
- `.scaffold-version` marker file written on install for version tracking
- This changelog

### Fixed
- Permissions prompt restructured to fix compound command prompting (`78fda92`)

## [1.0.0] — 2025-02-01

### Added
- Initial release — 25-prompt pipeline for scaffolding new software projects
- Plugin install via `/plugin marketplace add zigrivers/scaffold` + `/plugin install scaffold@zigrivers-scaffold`
- User command install via `scripts/install.sh`
- Auto-activated pipeline context skill
- Full pipeline from product definition (Phase 1) through implementation (Phase 7)
