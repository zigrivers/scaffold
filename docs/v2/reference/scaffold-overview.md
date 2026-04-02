# Scaffold Overview

> **Note:** This document retains v1-era overview material (for example the older 7-phase / 29-prompt framing). Current project-local agent integration includes Gemini support via `.agents/skills/`, `GEMINI.md`, and `.gemini/commands/scaffold/`. See `README.md` for the current high-level product description.

## What is Scaffold

Scaffold is a prompt pipeline for scaffolding new software projects with Claude Code, Gemini, and other supported AI tools. It provides a curated sequence of 29 structured prompts that guide you from a raw product idea through to working software, producing documentation, standards, task graphs, and implementation along the way.

Scaffold is distributed as a plugin (installable via `/plugin marketplace add`) and also as a standalone CLI. CLI-only projects use `scaffold skill install` to copy the shared runner skills into `.claude/skills/` and `.agents/skills/`; Gemini projects additionally use a managed root `GEMINI.md` plus `.gemini/commands/scaffold/` slash commands.

## How It Works

Scaffold follows a **7-phase sequential pipeline**. Each prompt builds on artifacts produced by earlier ones — a PRD drives the tech stack, which drives coding standards, which drive TDD standards, and so on. This artifact-driven approach ensures consistency across the entire project setup.

Phases are run in order, with explicit dependency constraints between prompts. Some prompts are optional and only apply to specific project types (web apps, mobile/Expo, multi-platform). The pipeline can optionally culminate in an implementation plan broken into Beads tasks for downstream projects Scaffold generates, which agents then execute — either single-agent or multi-agent via git worktrees. This is separate from the task-tracking workflow used to maintain Scaffold itself.

## Key Features

- **Structured 7-phase pipeline** (Phase 0-7) — from product definition through implementation
- **Beads task tracking** — optional downstream task management with `@beads/bd` for generated projects
- **Parallel agent execution** — git worktrees enable multiple Claude Code sessions working simultaneously
- **Multi-model code review** (optional) — automated PR review using Codex Cloud with Claude-powered fixes
- **Project type awareness** — optional prompts for web apps (Playwright), mobile/Expo (Maestro), and multi-platform projects
- **Update mode** — all document-creating prompts auto-detect fresh vs. update mode, replacing dedicated migration prompts
- **Auto-activated pipeline skill** — provides ordering context so Claude Code knows which command to suggest next
- **Gemini project-local integration** — managed `GEMINI.md`, shared `.agents/skills/`, and `.gemini/commands/scaffold/` commands for plain prompts and explicit slash commands
- **Enhancement workflow** — add features to existing projects without re-running the full pipeline
- **Interactive pipeline dashboard** — visual status view for Scaffold runs with light/dark theme, filters, and modal task details
- **Release management** — project-defined release workflow with changelog generation, release-artifact support, and rollback guidance

## Pipeline Phases & Commands

### Phase 0 — Prerequisites (one-time setup)

| Action | Notes |
|--------|-------|
| Install Beads (`npm install -g @beads/bd` or `brew install beads`) | Required only if you enable Beads task tracking for a downstream project |
| Install Playwright MCP | **(optional)** Web apps only |

### Phase 1 — Product Definition

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 1 | `create-prd` | Create a product requirements document from an idea | |
| 2 | `review-prd` | Review PRD for quality and completeness | |
| 3 | `innovate-prd` | Discover innovation opportunities for the PRD | **(if-needed)** |

### Phase 2 — Project Foundation

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 3 | `beads` | Initialize optional Beads task tracking in this downstream project | **(optional)** Downstream projects only |
| 4 | `tech-stack` | Research and document tech stack decisions | |
| 5 | `coding-standards` | Create coding standards for the tech stack | |
| 6 | `tdd` | Create TDD standards for the tech stack | |
| 7 | `project-structure` | Define and scaffold project directory structure | |

### Phase 3 — Development Environment

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 8 | `dev-env-setup` | Set up local dev environment with live reload | |
| 9 | `design-system` | Create a cohesive design system for frontend | **(optional)** Frontend projects only |
| 10 | `git-workflow` | Configure git workflow for parallel agents | |
| 10.5 | `automated-pr-review` | Set up automated PR review with external reviewers | **(optional)** Requires external reviewer |

### Phase 4 — Testing Integration

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 11 | `add-e2e-testing` | Configure E2E testing (Playwright/Maestro) | **(optional)** Web and/or mobile apps |

### Phase 5 — Stories & Planning

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 13 | `user-stories` | Create user stories covering every PRD feature | |
| 14 | `user-stories-gaps` | Gap analysis and UX innovation for user stories | |
| 15 | `platform-parity-review` | Audit platform coverage across all docs | **(optional)** Multi-platform projects only |

### Phase 6 — Consolidation & Verification

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 16 | `claude-md-optimization` | Consolidate and optimize CLAUDE.md | |
| 17 | `workflow-audit` | Verify workflow consistency across all docs | |

### Phase 7 — Implementation

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 18 | `implementation-plan` | Create task graph from stories and standards | |
| 19 | `implementation-plan-review` | Review task quality, coverage, and dependencies | |
| 19.5 | `multi-model-review-tasks` | Multi-model review of implementation plan tasks | **(optional)** Requires Codex/Gemini CLI |
| 20 | `single-agent-start` | Start single-agent execution loop | |
| 20 | `multi-agent-start` | Start multi-agent execution loop in a worktree | |

### Ongoing — After Initial Setup

| Command | Description |
|---------|-------------|
| `new-enhancement` | Add a new feature to an existing project |
| `quick-task` | Bug fixes, refactors, and small improvements without full discovery |
| `version-bump` | Bump version and update changelog without tagging or releasing |
| `release` | Run the target project's release ceremony with changelog generation and project-specific release artifacts |

### Standalone Commands

| Command | Description |
|---------|-------------|
| `single-agent-resume` | Resume work after a break |
| `multi-agent-resume` | Resume multi-agent work after a break |
| `dashboard` | Open the visual pipeline dashboard for this Scaffold run in your browser |
| `session-analyzer` | Analyze Claude Code session history |
| `prompt-pipeline` | Show the full pipeline reference |
| `update` | Check for and apply scaffold updates |
| `version` | Show installed and latest scaffold version |

### Update Mode — Replaces Migrations

All document-creating prompts now include **Mode Detection** — they automatically detect whether their output file already exists and switch between fresh (create from scratch) and update (preserve project-specific content, add missing sections) modes. This replaces the previous dedicated migration prompts.

## Key Dependencies

```
PRD → Tech Stack → Coding Standards → TDD Standards → Project Structure
                                                            ↓
PRD → User Stories → Implementation Plan → Execution
                                    ↓
Dev Setup → Git Workflow → Claude.md Optimization → Workflow Audit
                                                            ↓
                                              Implementation Plan Review
```

**Critical ordering constraints:**

1. **Beads Setup before everything else in Phase 2** — when enabled, creates CLAUDE.md for the downstream project
2. **Tech Stack before Coding Standards and TDD** — they reference it
3. **Dev Setup before Git Workflow** — Git Workflow references lint/test commands
4. **Claude.md Optimization before Workflow Audit** — optimize first, verify second
5. **Implementation Plan before Implementation Plan Review** — can't review what doesn't exist

## Documentation Outputs

The pipeline can generate the following project documents, depending on the selected prompts and enabled features:

| Document | Produced By | Description |
|----------|-------------|-------------|
| `docs/plan.md` | PRD Creation (#1) | Product requirements document |
| `CLAUDE.md` | Beads Setup (#3) | Claude Code project instructions for Beads-enabled downstream projects |
| `GEMINI.md` | Gemini support | Project-local instructions with a managed Scaffold import block |
| `docs/tech-stack.md` | Tech Stack (#4) | Technology choices and rationale |
| `docs/coding-standards.md` | Coding Standards (#5) | Code style and conventions |
| `docs/tdd-standards.md` | TDD Standards (#6) | Testing approach and patterns |
| `docs/project-structure.md` | Project Structure (#7) | Directory layout and conventions |
| `docs/dev-setup.md` | Dev Environment Setup (#8) | Local development instructions |
| `docs/design-system.md` | Design System (#9) | Theme, tokens, component patterns |
| `docs/git-workflow.md` | Git Workflow (#10) | Branching, PR, and agent workflow |
| `AGENTS.md` | Multi-Model Review (#10.5) | Codex Cloud review configuration |
| `docs/review-standards.md` | Multi-Model Review (#10.5) | Code review criteria |
| `docs/user-stories.md` | User Stories (#13) | Implementable user stories |
| `docs/reviews/user-stories/` | User Stories Multi-Model Review (#14.5) | Codex/Gemini review data, coverage analysis |
| `docs/implementation-plan.md` | Implementation Plan (#18) | Full task graph with dependencies |
| `docs/reviews/implementation-plan/` | Implementation Plan Multi-Model Review (#19.5) | Codex/Gemini review of task quality |

## Installation

### As a Plugin (recommended)

```
/plugin marketplace add scaffold
```

Commands are available as `/scaffold:<command-name>` (e.g., `/scaffold:create-prd`).

### As a Standalone CLI

```bash
npm install -g @zigrivers/scaffold
cd your-project
scaffold skill install
```

This installs the shared Scaffold Runner and Pipeline skills into `.claude/skills/` and `.agents/skills/` for the current project. Gemini projects additionally use the managed `GEMINI.md` and `.gemini/commands/scaffold/` outputs from `scaffold build`.

## Key Concepts

| Term | Definition |
|------|------------|
| **Beads** | Optional downstream task tracking tool (`@beads/bd`) used when Scaffold generates Beads-based implementation workflows |
| **Worktrees** | Git worktrees that enable parallel Claude Code agent sessions, each working on separate tasks in isolated directories |
| **CLAUDE.md** | Project instruction file that Claude Code reads automatically; accumulates rules from each pipeline phase |
| **GEMINI.md** | Gemini project instruction file that loads the managed Scaffold runner block automatically |
| **MCP** | Model Context Protocol — used for tool integrations like Playwright browser testing |
| **PRD** | Product Requirements Document — the foundational artifact that drives all downstream decisions |
| **TDD** | Test-Driven Development — the pipeline enforces writing tests before implementation |
| **Frontmatter** | YAML metadata at the top of command files, containing name, description, and argument hints |
| **Pipeline Skill** | Auto-activated skill that gives Claude Code awareness of pipeline ordering so it can suggest the next command |
| **Dashboard** | Visual pipeline dashboard for Scaffold runs; Beads-enabled downstream projects may also surface a Beads dashboard artifact |
| **Update Mode** | All document-creating prompts auto-detect if output exists and switch between fresh/update modes — replaces dedicated migrations |
| **Quick Task** | Lightweight workflow for bug fixes, refactors, and small improvements without full discovery |
| **Release** | Project-defined release workflow with changelog generation, project-specific release artifacts, and rollback support |
