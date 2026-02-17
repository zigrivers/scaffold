# Changelog

All notable changes to Scaffold are documented here.

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
