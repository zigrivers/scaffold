# Scaffold v1 — Product Requirements Document

> Reverse-engineered from the v1.18.0 codebase on `main` branch. Every feature documented here is traceable to released code, commands, or scripts.

## Overview

Scaffold is a **prompt pipeline** — a curated sequence of structured prompts that guides AI agents (primarily Claude Code) through scaffolding a new software project from idea to working implementation. The pipeline spans 7 phases (product definition through implementation) and produces a complete set of project documentation, configuration, and task tracking artifacts that enable one or more AI agents to build production-ready software with minimal human intervention.

**What it solves**: Starting a new software project with AI agents requires extensive upfront planning — PRDs, coding standards, test strategies, directory structures, CI/CD, and task breakdowns. Without this scaffolding, agents produce inconsistent, uncoordinated work. Scaffold encodes the entire planning process as a repeatable, ordered pipeline that any developer can run.

**Distribution**: Claude Code plugin (installable via `/plugin marketplace add`) or standalone user commands (via `scripts/install.sh`).

**Current version**: 1.18.0 (19 tagged releases from v1.0.0 through v1.18.0).

**License**: MIT.

## User Personas

### Solo AI-First Developer
Uses Claude Code as primary development tool. Runs the full pipeline alone, then executes with one or more parallel agent sessions. Needs the pipeline to produce unambiguous, agent-ready artifacts so implementation can proceed autonomously.

### Team Lead
Coordinates multiple developers and AI agents on a shared codebase. Uses the pipeline to establish team-wide standards (coding, testing, git workflow) before implementation begins. Values the parallel agent support and conflict prevention mechanisms.

### First-Time AI Developer
New to AI-assisted development. Needs guided, step-by-step prompts that explain what they're doing and why. Benefits from the pipeline's sequential structure and "After This Step" guidance in each command.

## Core Concepts

### Prompt Pipeline
The central organizing principle. 21 sequential prompts across 7 phases, plus 8+ ongoing/utility commands. Each prompt builds on artifacts produced by earlier ones. The pipeline is documented in `prompts.md` (source of truth) and exposed as individual command files in `commands/`.

### Phases
Prompts are grouped into 7 phases with strict ordering:
- **Phase 0**: Prerequisites (install tools)
- **Phase 1**: Product Definition (PRD)
- **Phase 2**: Project Foundation (Beads, tech stack, standards, structure)
- **Phase 3**: Development Environment (dev setup, design system, git workflow)
- **Phase 4**: Testing Integration (Playwright, Maestro — optional)
- **Phase 5**: Stories & Planning (user stories, gap analysis, reviews)
- **Phase 6**: Consolidation & Verification (CLAUDE.md optimization, workflow audit)
- **Phase 7**: Implementation (task graph, execution)

### Mode Detection
Every document-creating prompt auto-detects whether its output file exists. **Fresh mode** creates from scratch. **Update mode** reads the existing document, diffs against the current prompt structure, categorizes content as ADD/RESTRUCTURE/PRESERVE, previews changes for user approval, then executes. Tracking comments (`<!-- scaffold:<prompt-id> v<ver> <date> -->`) enable version-aware updates.

### Beads Integration
[Beads](https://github.com/beads-project/beads) (`bd` CLI) provides task tracking throughout the pipeline. Tasks have priorities (0–3), dependencies, claim/close lifecycle, and merge-safe IDs. All commits reference a Beads task ID: `[BD-<id>] type(scope): description`.

### Worktrees for Parallel Agents
Multiple Claude Code sessions work simultaneously in separate git worktrees — each worktree is an independent working directory sharing the same `.git` repository. Each agent gets an identity (`BD_ACTOR`) for Beads attribution.

### Multi-Model Review
Independent code/story review by external AI models (OpenAI Codex CLI, Google Gemini CLI). Used for user stories coverage verification and implementation plan quality audits.

---

## Feature Requirements

### FR-1: PRD Creation
- **Description**: Interactively builds a comprehensive product requirements document from a user's idea
- **User-facing commands**: `/scaffold:create-prd` (`commands/create-prd.md`)
- **Behavior**:
  - Phase 1 (Discovery): Understands vision, challenges assumptions, defines boundaries
  - Phase 2 (Planning): Scopes v1, defines technical approach, establishes user personas
  - Phase 3 (Documentation): Writes `docs/plan.md` with 10 required sections (Product Overview, User Personas, Core User Flows, Feature Requirements, Data Model, External Integrations, Non-Functional Requirements, Open Questions & Risks, Out of Scope, Success Metrics)
  - Supports fresh and update modes with tracking comment
- **Dependencies**: None (first pipeline step)

### FR-2: PRD Gap Analysis & Innovation
- **Description**: Systematic gap analysis followed by innovation ideation to strengthen the PRD before downstream decisions
- **User-facing commands**: `/scaffold:prd-gap-analysis` (`commands/prd-gap-analysis.md`)
- **Behavior**:
  - Phase 1: Gap Analysis — completeness, clarity, structural integrity, feasibility red flags
  - Phase 2: Innovation — UX improvements, missing features, AI-native opportunities, defensive thinking
  - Phase 3: Final validation and change tracking
  - Uses `AskUserQuestionTool` for innovation approvals
  - Does NOT create Beads tasks (too early in pipeline)
- **Dependencies**: FR-1 (requires `docs/plan.md`)

### FR-3: Beads Task Tracking Setup
- **Description**: Initializes Beads issue tracker for the project, creating task management infrastructure and foundational CLAUDE.md sections
- **User-facing commands**: `/scaffold:beads` (`commands/beads.md`)
- **Behavior**:
  - Runs `bd init --quiet` to create `.beads/` directory
  - Installs git hooks via `bd hooks install`
  - Creates `tasks/lessons.md` for self-improvement patterns
  - Creates or updates CLAUDE.md with Core Principles, Task Management, Self-Improvement, and Autonomous Behavior sections
  - Commits with `[BD-0]` bootstrap convention
  - One-time setup; never re-initializes existing `.beads/`
- **Dependencies**: FR-1 (runs after PRD)

### FR-4: Tech Stack Research & Documentation
- **Description**: Defines all technology choices with rationale, producing the authoritative reference for package versions and tool selection
- **User-facing commands**: `/scaffold:tech-stack` (`commands/tech-stack.md`)
- **Behavior**:
  - Asks user about preferences (language, framework, database, deployment)
  - Researches alternatives using guiding principles: AI familiarity, convention over configuration, minimal dependencies, strong typing, mature ecosystem
  - Produces `docs/tech-stack.md` covering: Architecture Overview, Backend, Database, Frontend, Infrastructure & DevOps, Developer Tooling, Third-Party Services
  - Each choice includes: What, Why, Why Not alternatives, AI compatibility note
  - Quick Reference section becomes source of truth for dependency versions
- **Dependencies**: FR-1 (references PRD)

### FR-5: Coding Standards
- **Description**: Defines code quality rules referenced by all agents during implementation
- **User-facing commands**: `/scaffold:coding-standards` (`commands/coding-standards.md`)
- **Behavior**:
  - Produces `docs/coding-standards.md` with linter/formatter configs
  - 10 sections: Project Structure & Organization, Code Patterns & Conventions, Type Safety & Data Validation, Security Standards, Database & Data Access, API Design, Logging & Observability, AI-Specific Coding Rules, Commit Messages, Code Review Checklist
  - Prescriptive with concrete examples, not abstract principles
  - Enforces commit format: `[BD-<id>] type(scope): description`
- **Dependencies**: FR-4 (references tech stack)

### FR-7: TDD Standards
- **Description**: Defines test-driven development workflow specific to the project's tech stack
- **User-facing commands**: `/scaffold:tdd` (`commands/tdd.md`)
- **Behavior**:
  - Produces `docs/tdd-standards.md`
  - 7 sections: TDD Workflow (Red-Green-Refactor), Test Architecture, Concrete Patterns for Stack, AI-Specific Testing Rules, Coverage & Quality Standards, CI/Test Execution, E2E / Visual Testing placeholder
  - Includes reference test examples for each test category
  - AI-specific rules: never test the framework, no trivial tests, assert behavior not implementation
- **Dependencies**: FR-4 (references tech stack)

### FR-8: Project Structure
- **Description**: Designs directory layout, documents file placement rules, and scaffolds actual folders
- **User-facing commands**: `/scaffold:project-structure` (`commands/project-structure.md`)
- **Behavior**:
  - Produces `docs/project-structure.md`
  - Covers: Directory Tree, Module Organization Strategy (feature/layer/hybrid), File Placement Rules, Shared Code Strategy, Import Conventions, Index/Barrel File Policy, Test File Location, Generated vs. Committed Files
  - Actually creates directories and placeholder `.gitkeep` files
  - Updates `.gitignore`
  - Adds Quick Reference table to CLAUDE.md
  - Addresses AI-specific concern: merge conflict frequency for parallel agents
- **Dependencies**: FR-6, FR-7 (references coding and TDD standards)

### FR-9: Dev Environment Setup
- **Description**: Creates one-command development experience with live reloading
- **User-facing commands**: `/scaffold:dev-env-setup` (`commands/dev-env-setup.md`)
- **Behavior**:
  - Produces `docs/dev-setup.md`, Makefile/scripts, `.env.example`
  - Configures: dev server with live reload, local database (if applicable), environment variables, simple commands (Makefile or scripts), dependency installation
  - 6-step verification checklist (install, dev start, browser load, code change→reload, test run, db commands)
  - Adds "Key Commands" table to CLAUDE.md (single source of truth for all commands)
- **Dependencies**: FR-8 (references project structure)

### FR-10: Design System (Optional — Frontend Only)
- **Description**: Creates a cohesive, professional UI design system without requiring design expertise
- **User-facing commands**: `/scaffold:design-system` (`commands/design-system.md`)
- **Behavior**:
  - Produces `docs/design-system.md` + theme config files (tailwind.config.js, theme.ts, etc.)
  - Covers: Design Foundation (colors, typography, spacing, borders, shadows), Component Patterns (buttons, forms, cards, feedback, navigation, data display), Layout System, Configuration Files
  - Asks about overall feel, color preference, reference apps, dark mode support
  - Creates example implementation demonstrating the design system
  - Updates Coding Standards and CLAUDE.md with design system sections
- **Dependencies**: FR-9 (references dev setup)

### FR-11: Git Workflow for Parallel Agents
- **Description**: Enables multiple AI agents to work simultaneously without conflicts or broken main
- **User-facing commands**: `/scaffold:git-workflow` (`commands/git-workflow.md`)
- **Behavior**:
  - Produces `docs/git-workflow.md`, `scripts/setup-agent-worktree.sh`, CI config
  - Creates permanent worktrees via `scripts/setup-agent-worktree.sh` (each agent gets isolated directory)
  - Defines `BD_ACTOR` environment variable for Beads task attribution
  - 10 documented sections: Branching Strategy (`bd-<task-id>/<short-description>`), Commit Standards, Rebase Strategy, PR Workflow (8-step), Task Closure, Crash Recovery, Branch Protection, Conflict Prevention, Repository Hygiene, Parallel Agent Setup
  - Creates branch protection rules via `gh api`
  - Generates CI workflow template and PR template
  - Updates CLAUDE.md with full workflow sections
- **Dependencies**: FR-9 (references lint/test commands)

### FR-12: Multi-Model Code Review (Optional)
- **Description**: Two-tier code review system — local AI self-review plus optional external Codex Cloud review with auto-fix loop
- **User-facing commands**: `/scaffold:automated-pr-review` (`commands/automated-pr-review.md`)
- **Behavior**:
  - Tier 1 (Local, required): AI review subagent checks `git diff origin/main...HEAD` against standards before push
  - Tier 2 (Codex Cloud, optional): Auto-review on PR via GitHub Actions, convergence loop (fix/review until approval or round cap)
  - Tier 3 (Post-merge follow-up): Creates Beads task + GitHub Issue + follow-up PR for unresolved findings
  - Produces: `AGENTS.md`, `.github/workflows/code-review-trigger.yml`, `code-review-handler.yml`, `codex-timeout.yml`, `post-merge-followup.yml`, `.github/review-prompts/fix-prompt.md`, `followup-fix-prompt.md`, `docs/review-standards.md`, `scripts/await-pr-review.sh`
  - Safety rails: round cap (max 3), bot-loop prevention, cost cap, fork protection, human override, usage-limit detection, follow-up dedup
- **Dependencies**: FR-11 (references git workflow), FR-6 (references coding standards)

### FR-13: E2E Testing Setup (Optional — Web and/or Mobile)
- **Description**: Configures end-to-end testing for web apps (Playwright) and/or mobile apps (Maestro)
- **User-facing commands**: `/scaffold:add-e2e-testing` (`commands/add-e2e-testing.md`)
- **Behavior**:
  - Detects project type (web, mobile, or both) and configures applicable frameworks
  - Playwright: configures base URL, viewports, screenshot directories, timeouts, visual testing patterns
  - Maestro: creates `maestro/` directory with flows, config, TestID requirements, package.json scripts
  - Updates CLAUDE.md and TDD Standards with E2E testing sections
  - Adds Playwright MCP permissions to `.claude/settings.json` (if web)
- **Dependencies**: FR-7 (updates TDD standards)

### FR-15: User Stories
- **Description**: Translates PRD features into structured, implementable user stories for AI agents
- **User-facing commands**: `/scaffold:user-stories` (`commands/user-stories.md`)
- **Behavior**:
  - Produces `docs/user-stories.md`
  - Structure: Best Practices Summary, User Personas (from PRD), Epics (major PRD sections), Stories (under epics)
  - Each story: ID (US-xxx), Title, Story (As a/I want/So that), Acceptance Criteria (Given/When/Then), Scope Boundary, Data/State Requirements, UI/UX Notes, Priority (Must/Should/Could/Won't)
  - Quality: INVEST criteria, 1–3 session size, unambiguous pass/fail, complete PRD coverage
  - Creates Beads task for the work
- **Dependencies**: FR-1 (references PRD), FR-6 (references coding standards)

### FR-16: User Stories Gap Analysis & Innovation
- **Description**: Strengthens user stories before implementation planning
- **User-facing commands**: `/scaffold:user-stories-gaps` (`commands/user-stories-gaps.md`)
- **Behavior**:
  - Phase 1: Gap Analysis — coverage gaps, quality weaknesses, structural issues
  - Phase 2: Innovation (UX-level only, not new features) — smart defaults, inline validation, differentiators, defensive gaps
  - Presents innovation ideas for approval via `AskUserQuestionTool`
- **Dependencies**: FR-15 (requires user stories)

### FR-18: Platform Parity Review (Optional — Multi-Platform)
- **Description**: Ensures every target platform (iOS, Android, web) is thoroughly addressed across all documentation
- **User-facing commands**: `/scaffold:platform-parity-review` (`commands/platform-parity-review.md`)
- **Behavior**:
  - Establishes platform context (targets, framework, versions)
  - Reviews all project docs for platform-specific mentions and gaps
  - Runs 8-section Platform Parity Checklist
  - Categorizes gaps by severity (Critical/High/Medium/Low)
  - Produces recommendations and executes approved updates
- **Dependencies**: FR-15 (requires user stories for coverage check)

### FR-19: CLAUDE.md Optimization
- **Description**: Consolidates accumulated CLAUDE.md sections for maximum signal density
- **User-facing commands**: `/scaffold:claude-md-optimization` (`commands/claude-md-optimization.md`)
- **Behavior**:
  - Analysis: redundancy audit, consistency check, gap audit across all sections
  - Restructures into 7 main sections
  - Optimization principles: brevity, scannability, front-load important, actionable
  - Verifies 9 critical patterns
  - Must run BEFORE Workflow Audit
- **Dependencies**: All Phase 2–4 prompts (they all add to CLAUDE.md)

### FR-20: Workflow Audit
- **Description**: Cross-references all documentation to detect contradictions, stale references, and inconsistencies
- **User-facing commands**: `/scaffold:workflow-audit` (`commands/workflow-audit.md`)
- **Behavior**:
  - Defines canonical 9-step feature workflow (with step 4.5 AI review)
  - Phase 1: Document Inventory
  - Phase 2: CLAUDE.md completeness check (35+ checkpoints)
  - Phase 3: Gap Analysis with categorization
  - Phase 4: Recommendations for each issue
  - Phase 5: Present findings
  - Phase 6: Execute approved updates
  - 28-item verification checklist
- **Dependencies**: FR-19 (runs after CLAUDE.md optimization)

### FR-21: Implementation Plan
- **Description**: Creates a full task graph from user stories for parallel agent execution
- **User-facing commands**: `/scaffold:implementation-plan` (`commands/implementation-plan.md`)
- **Behavior**:
  - Reads 8 documents (PRD, stories, standards, structure, etc.)
  - Produces `docs/implementation-plan.md` with architecture overview and task graph
  - Creates Beads tasks with dependencies for every implementable unit
  - Each task description includes: acceptance criteria, files to touch, test requirements, gotchas
  - Every user story maps to one or more tasks
- **Dependencies**: FR-15 (requires user stories), FR-6–FR-9 (references all standards)

### FR-22: Implementation Plan Review
- **Description**: Quality gate on task sizing, dependencies, and coverage
- **User-facing commands**: `/scaffold:implementation-plan-review` (`commands/implementation-plan-review.md`)
- **Behavior**:
  - Reads 10 documents for context
  - Phase 1: Coverage Audit (story → task mapping, orphan detection)
  - Phase 2: Task Quality Audit (sizing, description completeness)
  - Updates tasks, clarifies dependencies
- **Dependencies**: FR-21 (requires implementation plan)

### FR-23: Implementation Plan Multi-Model Review (Optional)
- **Description**: Independent Codex + Gemini review of task definitions
- **User-facing commands**: `/scaffold:multi-model-review-tasks` (`commands/multi-model-review-tasks.md`)
- **Behavior**:
  - Runs via `scripts/implementation-plan-mmr.sh` (parallel Codex/Gemini execution)
  - Reviews 5 dimensions: coverage gaps, description quality, dependencies, sizing, architecture consistency
  - Validates output JSON against `scripts/implementation-plan-mmr.schema.json`
  - Builds task coverage map for acceptance-criterion-to-task traceability
  - Outputs to `docs/reviews/implementation-plan/`
- **Dependencies**: FR-21 (requires implementation plan)

### FR-24: Single-Agent Execution
- **Description**: TDD execution loop for a single Claude Code session
- **User-facing commands**: `/scaffold:single-agent-start` (`commands/single-agent-start.md`), `/scaffold:single-agent-resume` (`commands/single-agent-resume.md`)
- **Behavior**:
  - Start: pulls next unblocked task via `bd ready`, writes failing tests, implements, creates PR
  - Resume: recovers session context, checks Beads status, reviews git state, resumes loop
  - Continues until `bd ready` returns no available tasks
  - Follows workflow defined in CLAUDE.md (commit format, PR process, task closure)
- **Dependencies**: FR-21 (requires task graph)

### FR-25: Multi-Agent Execution
- **Description**: Parallel agent execution in separate git worktrees
- **User-facing commands**: `/scaffold:multi-agent-start` (`commands/multi-agent-start.md`), `/scaffold:multi-agent-resume` (`commands/multi-agent-resume.md`)
- **Behavior**:
  - Start: verifies worktree setup and `BD_ACTOR`, claims task, begins TDD loop
  - Resume: syncs worktree, checks tasks/PRs, resumes or picks next task
  - Worktree-aware branching and rebasing rules
  - Agent identity via `BD_ACTOR` for task attribution
- **Dependencies**: FR-11 (requires worktree setup), FR-21 (requires task graph)

### FR-26: Visual Pipeline Dashboard
- **Description**: Self-contained HTML dashboard showing pipeline progress, task status, and next steps
- **User-facing commands**: `/scaffold:dashboard` (`commands/dashboard.md`)
- **Behavior**:
  - Generated by `scripts/generate-dashboard.sh`
  - Styled by `lib/dashboard-theme.css` ("Precision Industrial" aesthetic)
  - Shows: progress bar, summary cards, collapsible phase sections, status badges (✓ Done, ≈ Likely Done, → Skipped, ○ Pending), "What's Next" banner
  - Prompt drill-down modals (view full prompt content, copy button)
  - Beads task section with status/priority filters and detail modals
  - Light/dark mode toggle with `localStorage` persistence
  - Dual mode: overview (no `.scaffold/`) vs. progress (with `.scaffold/`)
  - CLI flags: `--no-open`, `--json-only`, `--output FILE`
  - Generates `make dashboard-test` target for visual verification
- **Dependencies**: None (standalone, usable at any point)

### FR-27: New Enhancement Workflow
- **Description**: Guides adding a feature to an existing project — updates PRD, creates stories, builds tasks
- **User-facing commands**: `/scaffold:new-enhancement` (`commands/new-enhancement.md`)
- **Behavior**:
  - Phase 1: Discovery & Impact Analysis
  - Phase 2: Documentation Updates (updates `docs/plan.md` and `docs/user-stories.md`)
  - Phase 3: Task Creation (Beads tasks with dependencies)
  - Phase 4: Summary & Approval
  - Includes inline innovation pass
  - Redirects to full PRD workflow for major pivots
- **Dependencies**: Existing pipeline artifacts (PRD, stories, standards)

### FR-28: Quick Task
- **Description**: Creates a focused Beads task for bug fixes, refactors, or small improvements
- **User-facing commands**: `/scaffold:quick-task` (`commands/quick-task.md`)
- **Behavior**:
  - Complexity Gate: auto-detects oversized tasks and redirects to Enhancement
  - Defines task with acceptance criteria, test plan, implementation notes
  - Duplicate detection via `bd list`
  - Reviews `tasks/lessons.md` for anti-patterns
  - Conventional commit task titles
  - When to use: bug fixes, refactoring, perf, a11y, test gaps, chores
- **Dependencies**: FR-3 (requires Beads)

### FR-29: Version Management
- **Description**: Version bumping and release creation for scaffolded projects
- **User-facing commands**: `/scaffold:version-bump` (`commands/version-bump.md`), `/scaffold:release` (`commands/release.md`)
- **Behavior**:
  - **Version Bump**: Lightweight milestone marker — bumps version numbers and updates changelog without tags or GitHub release. Supports auto (commit analysis), explicit (major/minor/patch), and `--dry-run`.
  - **Release**: Full release flow — conventional commit analysis, quality gates (`make check`), changelog generation, version file detection (package.json, pyproject.toml, Cargo.toml, plugin.json, etc.), git tagging, GitHub release creation via `gh release create`.
  - Release has 4 modes: standard, explicit, dry-run, rollback
  - `current` mode releases version already in files (for use after version-bump)
  - Rollback with exact-tag-name safety confirmation
  - Beads task integration in release notes
- **Dependencies**: None (standalone utility)

### FR-30: Version & Update Management
- **Description**: Check installed version and apply updates from within Claude Code
- **User-facing commands**: `/scaffold:version` (`commands/version.md`), `/scaffold:update` (`commands/update.md`)
- **Behavior**:
  - **Version**: Detects installation method (plugin vs. user commands), fetches latest version from registry, compares and reports
  - **Update**: Clones/pulls latest scaffold repo to `~/.cache/scaffold/`, shows changelog, runs `install.sh -f`, handles both plugin and user command installations
  - `scripts/update.sh` provides standalone CLI update
  - `.scaffold-version` marker file tracks installed version and git SHA
- **Dependencies**: None (standalone utility)

### FR-31: Pipeline Reference
- **Description**: Quick-reference display of the full pipeline order
- **User-facing commands**: `/scaffold:prompt-pipeline` (`commands/prompt-pipeline.md`)
- **Behavior**: Prints the complete Phase 0–7 pipeline table with all commands and notes. Does not read files or run commands — static reference display.
- **Dependencies**: None

### FR-32: Session Analyzer
- **Description**: Analyzes Claude Code session history to find patterns worth automating
- **User-facing commands**: `/scaffold:session-analyzer` (`commands/session-analyzer.md`)
- **Behavior**:
  - Phase 1: Data Collection (prompt history, activity stats, project discovery, session transcripts)
  - Phase 2: Pattern Recognition (clustering, workflows, corrections, tools, autonomy patterns)
  - Phase 3: Categorization (Skills, Plugins/Tools, Agents, CLAUDE.md rules)
  - Phase 4: Detailed Analysis (structured entries for each item)
  - Phase 5: Recommendations Report (top 10 skills, top 5 plugins, top 5 agents, CLAUDE.md additions)
  - Read-only, privacy-respecting, supports `--project`, `--depth`, `--output` flags
- **Dependencies**: None (standalone utility)

### FR-33: Worktree Setup Script
- **Description**: Creates permanent git worktrees for parallel agent sessions
- **User-facing commands**: `scripts/setup-agent-worktree.sh <agent-name>` (CLI script, referenced by FR-11)
- **Behavior**:
  - Takes agent name argument, normalizes to lowercase with hyphens
  - Creates worktree in parent directory: `{repo-name}-{agent-suffix}`
  - Creates workspace branch (`{agent-suffix}-workspace`) if not exists
  - Idempotent (succeeds if worktree already exists)
- **Dependencies**: git

### FR-34: Auto-Activated Pipeline Skill
- **Description**: Provides pipeline ordering context without user action
- **Implementation**: `skills/scaffold-pipeline/SKILL.md`
- **Behavior**:
  - Auto-activates when users ask about pipeline ordering, which command to run next, or pipeline sequence
  - Contains 20-row pipeline execution table, dependency graph, completion detection criteria
  - Reads `.scaffold/config.json` for status detection (when present)
- **Dependencies**: Claude Code skill system

---

## Pipeline Sequence

### Phase 0 — Prerequisites
| Step | Command | Output |
|------|---------|--------|
| 0.1 | Install Beads CLI | `bd` available |
| 0.2 | Install Playwright MCP (optional, web) | MCP plugin available |

### Phase 1 — Product Definition
| Step | Command | Output |
|------|---------|--------|
| 1 | `/scaffold:create-prd` | `docs/plan.md` |
| 2 | `/scaffold:prd-gap-analysis` | Updated `docs/plan.md` |

### Phase 2 — Project Foundation
| Step | Command | Output |
|------|---------|--------|
| 3 | `/scaffold:beads` | `.beads/`, `tasks/lessons.md`, CLAUDE.md |
| 4 | `/scaffold:tech-stack` | `docs/tech-stack.md` |
| 5 | `/scaffold:coding-standards` | `docs/coding-standards.md`, linter configs |
| 6 | `/scaffold:tdd` | `docs/tdd-standards.md` |
| 7 | `/scaffold:project-structure` | `docs/project-structure.md`, scaffolded dirs |

### Phase 3 — Development Environment
| Step | Command | Output |
|------|---------|--------|
| 8 | `/scaffold:dev-env-setup` | `docs/dev-setup.md`, Makefile, `.env.example` |
| 9 | `/scaffold:design-system` (optional) | `docs/design-system.md`, theme configs |
| 10 | `/scaffold:git-workflow` | `docs/git-workflow.md`, worktree script, CI |
| 10.5 | `/scaffold:automated-pr-review` (optional) | `AGENTS.md`, `docs/review-standards.md` |

### Phase 4 — Testing Integration
| Step | Command | Output |
|------|---------|--------|
| 11 | `/scaffold:add-e2e-testing` (optional, web/mobile) | Playwright config, Maestro config, test patterns |

### Phase 5 — Stories & Planning
| Step | Command | Output |
|------|---------|--------|
| 13 | `/scaffold:user-stories` | `docs/user-stories.md` |
| 14 | `/scaffold:user-stories-gaps` | Updated `docs/user-stories.md` |
| 15 | `/scaffold:platform-parity-review` (optional) | Updated docs, new stories/tasks |

### Phase 6 — Consolidation & Verification
| Step | Command | Output |
|------|---------|--------|
| 16 | `/scaffold:claude-md-optimization` | Restructured CLAUDE.md |
| 17 | `/scaffold:workflow-audit` | Fixes across all docs |

### Phase 7 — Implementation
| Step | Command | Output |
|------|---------|--------|
| 18 | `/scaffold:implementation-plan` | `docs/implementation-plan.md`, Beads tasks |
| 19 | `/scaffold:implementation-plan-review` | Updated tasks/dependencies |
| 19.5 | `/scaffold:multi-model-review-tasks` (optional) | `docs/reviews/implementation-plan/` |
| 20 | `/scaffold:single-agent-start` or `/scaffold:multi-agent-start` | Working software |

### Key Dependency Constraints
```
PRD (1) → Tech Stack (4) → Coding Standards (5) → TDD (6) → Project Structure (7)
PRD (1) → User Stories (13) → Implementation Plan (18) → Execution (20)
Beads (3) → all Phase 2+ prompts
Dev Setup (8) → Git Workflow (10)
Claude.md Optimization (16) → Workflow Audit (17)
Implementation Plan (18) → Implementation Plan Review (19)
```

---

## Plugin & Distribution

### Plugin Distribution (Primary)
- **Manifest**: `.claude-plugin/plugin.json` — name `scaffold`, version `1.18.0`, 29-prompt pipeline description
- **Installation**: `/plugin marketplace add zigrivers/scaffold` then `/plugin install scaffold@zigrivers-scaffold`
- **Update**: `/scaffold:update` or `/plugin marketplace update zigrivers-scaffold`
- **Commands exposed as**: `/scaffold:<slug>` (e.g., `/scaffold:create-prd`)

### User Command Distribution (Fallback)
- **Install**: `scripts/install.sh` copies command `.md` files to `~/.claude/commands/`
- **Uninstall**: `scripts/uninstall.sh` removes known scaffold files only (safe)
- **Update**: `scripts/update.sh` clones/pulls latest repo to `~/.cache/scaffold/`, runs install
- **Version tracking**: `.scaffold-version` marker with version + git SHA

### Command File Format
- 36 `.md` files in `commands/` directory
- YAML frontmatter with `description` (required), `argument-hint` (optional), `long-description` (optional)
- Prompt body with mode detection, process steps, and "After This Step" guidance
- Generated from `prompts.md` via `scripts/extract-commands.sh`

---

## Developer Tooling

### Build System
- **Tool**: GNU Make (`Makefile`)
- **Quality gate**: `make check` (lint + validate + test) — the authoritative quality gate

### Targets
| Target | Purpose |
|--------|---------|
| `make check` | Run all quality gates (lint + validate + test) |
| `make test` | Run bats test suite (`bats tests/`) |
| `make lint` | ShellCheck on all `.sh` files in `scripts/` and `lib/` |
| `make validate` | Validate YAML frontmatter in `commands/*.md` |
| `make setup` | Install dev dependencies (shellcheck, bats-core, jq, beads) via Homebrew |
| `make hooks` | Install pre-commit and pre-push git hooks |
| `make install` | Install commands to `~/.claude/commands/` |
| `make uninstall` | Remove commands from `~/.claude/commands/` |
| `make extract` | Extract commands from `prompts.md` |
| `make dashboard-test` | Generate test-ready dashboard HTML |

### Testing
- **Framework**: bats-core (Bash Automated Testing System)
- **Test files**: 3 files, 59 tests total
  - `tests/generate-dashboard.bats` (41 tests): HTML/JSON output, styling, Beads integration, theme toggle, modals, status badges
  - `tests/setup-agent-worktree.bats` (7 tests): worktree creation, idempotency, name normalization, branch creation
  - `tests/validate-frontmatter.bats` (11 tests): valid/invalid frontmatter, multiple files, edge cases
- **Helpers**: `tests/test_helper/` (test setup), `tests/fixtures/` (test data)
- **Visual testing**: Playwright MCP for dashboard HTML/CSS/JS changes (documented in `docs/tdd-standards.md` Section 7)

### Linting
- **Tool**: ShellCheck 0.9+ with `.shellcheckrc` configuration
- **Scope**: All `.sh` files in `scripts/` and `lib/`

### Git Hooks (via `scripts/install-hooks.sh`)
- **Pre-commit**: Beads hook → ShellCheck on staged `.sh` files → frontmatter validation on staged `commands/*.md`
- **Pre-push**: Beads hook → full bats test suite

### CI
- `.github/workflows/ci.yml` runs `make check` on all PRs to the scaffold repo itself

---

## Non-Functional Requirements

### Commit Message Format
All commits must include a Beads task ID: `[BD-<id>] type(scope): description`

Valid types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

### Task Tracking
- All work tracked in Beads — no separate todo files
- Tasks have priorities (0=blocking, 1=must-have, 2=should-have, 3=nice-to-have)
- Tasks have dependencies (`bd dep add <child> <parent>`)
- `bd ready` surfaces unblocked tasks
- `bd close <id>` marks completion (not `bd update --status`)
- **Never** use `bd edit` (breaks AI agents)

### TDD Discipline
- Write failing tests first, then make them pass, then refactor
- No implementation code without a failing test
- Exceptions: prompt text, documentation, config file edits

### Self-Improvement
- After any correction: update `tasks/lessons.md` with the pattern
- Review `tasks/lessons.md` at session start

### Autonomous Agent Behavior
- Fix bugs on sight (create Beads task and fix)
- Use subagents for research and parallel analysis
- Continue until `bd ready` returns no tasks
- Re-plan when stuck rather than pushing through

### Code Review
- Spawn review subagent before pushing to check diff against CLAUDE.md and coding-standards.md
- Fix P0/P1 findings before push
- Log recurring patterns to `tasks/lessons.md`

### Zero External Dependencies (Scaffold Itself)
- Core: Bash 3.2+ (macOS system default), Git, jq
- Pipeline: Beads CLI, Node.js 18+
- Dev-only: ShellCheck, bats-core
- Optional: Python 3, Codex CLI, Gemini CLI, Playwright MCP, gh CLI

---

## Out of Scope

The following items exist in the repository as design documents or future plans but are **NOT** part of the v1 released functionality:

### Scaffold v2 Modular Architecture
- **Source**: `docs/superpowers/specs/2026-03-12-scaffold-v2-modular-cross-platform-design.md`
- **What**: Profile-based system (web-app, cli-tool, mobile, api-service, minimal, custom), composable prompt layers (base + methodology overrides + mixin injections), cross-platform support (Codex CLI), abstract task verb convention, `scaffold init` wizard, `.scaffold/config.yml`
- **Status**: Draft design spec

### v2 PRD and User Stories
- **Source**: `docs/plan.md` (contains v2 PRD content), `docs/user-stories.md` (contains v2 user stories)
- **What**: These documents were created using the scaffold pipeline itself to plan the v2 rewrite. They describe v2 features (profiles, composability, cross-platform) not yet implemented.
- **Note**: The documents are valid artifacts of the v1 pipeline being used — but their *content* describes v2 functionality

### `.scaffold/` Configuration Directory
- **Source**: Referenced in `scripts/generate-dashboard.sh` and `skills/scaffold-pipeline/SKILL.md`
- **What**: Runtime configuration for target projects (config.json, context.json, decisions.json, profiles/)
- **Status**: Dashboard reads it when present but does not create it; it's a v2 concept

### `lib/common.sh` Shared Library
- **Source**: `docs/tech-stack.md`, `docs/coding-standards.md`
- **What**: Planned shared bash library with `scaffold_log`, `scaffold_read_config`, `scaffold_write_config`, etc.
- **Status**: Only a `.gitkeep` exists in `lib/`; the only actual file is `dashboard-theme.css`. The shared library functions are documented in tech-stack.md and coding-standards.md as v2 infrastructure.

### v2 Script Inventory
- **Source**: `docs/tech-stack.md`
- **What**: `resolve-deps.sh`, `resolve-profile.sh`, `resolve-prompt.sh`, `check-artifacts.sh`, `detect-completion.sh`, `validate-config.sh`
- **Status**: Documented in tech-stack.md but not yet implemented
