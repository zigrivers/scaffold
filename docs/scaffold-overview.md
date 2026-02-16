# Scaffold Overview

## What is Scaffold

Scaffold is a prompt pipeline for scaffolding new software projects with Claude Code. It provides a curated sequence of 25+ structured prompts that guide you from a raw product idea through to working software, producing documentation, standards, task graphs, and implementation along the way.

Scaffold is distributed as a **Claude Code plugin** (installable via `/plugin marketplace add`) and also as standalone **user commands** (copyable to `~/.claude/commands/`).

## How It Works

Scaffold follows a **7-phase sequential pipeline**. Each prompt builds on artifacts produced by earlier ones — a PRD drives the tech stack, which drives coding standards, which drive TDD standards, and so on. This artifact-driven approach ensures consistency across the entire project setup.

Phases are run in order, with explicit dependency constraints between prompts. Some prompts are optional and only apply to specific project types (web apps, mobile/Expo, multi-platform). The pipeline culminates in an implementation plan broken into Beads tasks, which agents then execute — either single-agent or multi-agent via git worktrees.

## Key Features

- **Structured 7-phase pipeline** (Phase 0-7) — from product definition through implementation
- **Beads task tracking** — integrated task management with `@beads/bd` throughout the pipeline
- **Parallel agent execution** — git worktrees enable multiple Claude Code sessions working simultaneously
- **Multi-model code review** (optional) — automated PR review using Codex Cloud with Claude-powered fixes
- **Project type awareness** — optional prompts for web apps (Playwright), mobile/Expo (Maestro), and multi-platform projects
- **Migration support** — dedicated prompts for updating projects created with older pipeline versions
- **Auto-activated pipeline skill** — provides ordering context so Claude Code knows which command to suggest next
- **Enhancement workflow** — add features to existing projects without re-running the full pipeline

## Pipeline Phases & Commands

### Phase 0 — Prerequisites (one-time setup)

| Action | Notes |
|--------|-------|
| Install Beads (`npm install -g @beads/bd` or `brew install beads`) | Required for task tracking |
| Install Playwright MCP | **(optional)** Web apps only |

### Phase 1 — Product Definition

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 1 | `create-prd` | Create a product requirements document from an idea | |
| 2 | `prd-gap-analysis` | Analyze PRD for gaps, then innovate | |

### Phase 2 — Project Foundation

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 3 | `beads` | Initialize Beads task tracking in this project | |
| 4 | `tech-stack` | Research and document tech stack decisions | |
| 5 | `claude-code-permissions` | Configure Claude Code permissions for agents | |
| 6 | `coding-standards` | Create coding standards for the tech stack | |
| 7 | `tdd` | Create TDD standards for the tech stack | |
| 8 | `project-structure` | Define and scaffold project directory structure | |

### Phase 3 — Development Environment

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 9 | `dev-env-setup` | Set up local dev environment with live reload | |
| 10 | `design-system` | Create a cohesive design system for frontend | **(optional)** Frontend projects only |
| 11 | `git-workflow` | Configure git workflow for parallel agents | |
| 11.5 | `multi-model-review` | Set up multi-model code review on PRs | **(optional)** Requires ChatGPT Pro |

### Phase 4 — Testing Integration

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 12 | `add-playwright` | Configure Playwright for web app testing | **(optional)** Web apps only |
| 13 | `add-maestro` | Configure Maestro for mobile app testing | **(optional)** Mobile/Expo apps only |

### Phase 5 — Stories & Planning

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 14 | `user-stories` | Create user stories covering every PRD feature | |
| 15 | `user-stories-gaps` | Gap analysis and UX innovation for user stories | |
| 16 | `platform-parity-review` | Audit platform coverage across all docs | **(optional)** Multi-platform projects only |

### Phase 6 — Consolidation & Verification

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 17 | `claude-md-optimization` | Consolidate and optimize CLAUDE.md | |
| 18 | `workflow-audit` | Verify workflow consistency across all docs | |

### Phase 7 — Implementation

| # | Command | Description | Optional |
|---|---------|-------------|----------|
| 19 | `implementation-plan` | Create task graph from stories and standards | |
| 20 | `implementation-plan-review` | Review task quality, coverage, and dependencies | |
| 21 | `single-agent-start` | Start single-agent execution loop | |
| 21 | `multi-agent-start` | Start multi-agent execution loop in a worktree | |

### Standalone Commands

| Command | Description |
|---------|-------------|
| `single-agent-resume` | Resume work after a break |
| `multi-agent-resume` | Resume multi-agent work after a break |
| `new-enhancement` | Add a new feature to an existing project |
| `prompt-pipeline` | Show the full pipeline reference |
| `update` | Check for and apply scaffold updates |
| `version` | Show installed and latest scaffold version |

### Migration Commands

| Command | Description |
|---------|-------------|
| Beads Migration | Updates bd commands, commit format, removes duplicate workflow |
| Workflow Migration | Updates git commands, PR workflow, worktree patterns |
| Permissions Migration | Restructures project/user settings layers |

## Key Dependencies

```
PRD --> Tech Stack --> Coding Standards --> TDD Standards --> Project Structure
                                                                  |
PRD --> User Stories --> Implementation Plan --> Execution
                                    |
Dev Setup --> Git Workflow --> Claude.md Optimization --> Workflow Audit
                                                                  |
                                                  Implementation Plan Review
```

**Critical ordering constraints:**

1. **Beads Setup before everything else in Phase 2** — creates CLAUDE.md
2. **Tech Stack before Permissions, Coding Standards, and TDD** — they reference it
3. **Dev Setup before Git Workflow** — Git Workflow references lint/test commands
4. **Claude.md Optimization before Workflow Audit** — optimize first, verify second
5. **Implementation Plan before Implementation Plan Review** — can't review what doesn't exist

## Documentation Outputs

The pipeline generates the following project documents:

| Document | Produced By | Description |
|----------|-------------|-------------|
| `docs/plan.md` | PRD Creation (#1) | Product requirements document |
| `CLAUDE.md` | Beads Setup (#3) | Claude Code project instructions |
| `docs/tech-stack.md` | Tech Stack (#4) | Technology choices and rationale |
| `.claude/settings.json` | Claude Code Permissions (#5) | Project-level permissions |
| `docs/coding-standards.md` | Coding Standards (#6) | Code style and conventions |
| `docs/tdd-standards.md` | TDD Standards (#7) | Testing approach and patterns |
| `docs/project-structure.md` | Project Structure (#8) | Directory layout and conventions |
| `docs/dev-setup.md` | Dev Environment Setup (#9) | Local development instructions |
| `docs/design-system.md` | Design System (#10) | Theme, tokens, component patterns |
| `docs/git-workflow.md` | Git Workflow (#11) | Branching, PR, and agent workflow |
| `AGENTS.md` | Multi-Model Review (#11.5) | Codex Cloud review configuration |
| `docs/review-standards.md` | Multi-Model Review (#11.5) | Code review criteria |
| `docs/user-stories.md` | User Stories (#14) | Implementable user stories |
| `docs/implementation-plan.md` | Implementation Plan (#19) | Full task graph with dependencies |

## Installation

### As a Plugin (recommended)

```
/plugin marketplace add scaffold
```

Commands are available as `/scaffold:<command-name>` (e.g., `/scaffold:create-prd`).

### As User Commands

```bash
git clone <repo-url>
cd scaffold
./scripts/install.sh
```

Commands are copied to `~/.claude/commands/` and available as `/user:<command-name>`.

Use `./scripts/install.sh -f` to force overwrite existing files.

## Key Concepts

| Term | Definition |
|------|------------|
| **Beads** | Task tracking tool (`@beads/bd`) used throughout the pipeline for creating, managing, and executing implementation tasks |
| **Worktrees** | Git worktrees that enable parallel Claude Code agent sessions, each working on separate tasks in isolated directories |
| **CLAUDE.md** | Project instruction file that Claude Code reads automatically; accumulates rules from each pipeline phase |
| **MCP** | Model Context Protocol — used for tool integrations like Playwright browser testing |
| **PRD** | Product Requirements Document — the foundational artifact that drives all downstream decisions |
| **TDD** | Test-Driven Development — the pipeline enforces writing tests before implementation |
| **Frontmatter** | YAML metadata at the top of command files, containing name, description, and argument hints |
| **Pipeline Skill** | Auto-activated skill that gives Claude Code awareness of pipeline ordering so it can suggest the next command |
