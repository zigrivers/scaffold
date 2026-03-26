# Changelog

All notable changes to Scaffold are documented here.

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
