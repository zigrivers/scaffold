---
description: "Show the full pipeline reference"
long-description: "Displays the complete scaffold pipeline order, dependencies, and status — useful for understanding where you are and what comes next."
---

Display the prompt pipeline order below. Do not read any files or run any commands — just print this reference directly.

> **Note:** If installed via `scripts/install.sh`, use `/user:command-name` instead of `/scaffold:command-name`.

---

## Prompt Pipeline — Quick Reference

### Phase 0 — Prerequisites (one-time)
| Action | Command |
|--------|---------|
| Install Beads | `npm install -g @beads/bd` or `brew install beads` |
| Install Playwright MCP | `claude mcp add playwright npx @playwright/mcp@latest` **(optional — web apps only)** |

### Phase 1 — Product Definition
| # | Prompt | Command |
|---|--------|---------|
| 1 | **PRD Creation** | `/scaffold:create-prd <idea or @files>` |
| 2 | **PRD Gap Analysis & Innovation** | `/scaffold:prd-gap-analysis` |

### Phase 2 — Project Foundation
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 3 | **Beads Setup** | `/scaffold:beads` | Creates CLAUDE.md — run first |
| 4 | **Tech Stack** | `/scaffold:tech-stack` | Drives all technical decisions |
| 5 | **Coding Standards** | `/scaffold:coding-standards` | References tech-stack.md |
| 6 | **TDD Standards** | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| 7 | **Project Structure** | `/scaffold:project-structure` | References all Phase 2 docs |

### Phase 3 — Development Environment
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 8 | **Dev Environment Setup** | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| 9 | **Design System** | `/scaffold:design-system` | **(optional)** Frontend projects only |
| 10 | **Git Workflow** | `/scaffold:git-workflow` | References dev-setup.md |
| 10.5 | **Automated PR Review** | `/scaffold:automated-pr-review` | **(optional)** Requires external reviewer |

### Phase 4 — Testing Integration
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 11 | **E2E Testing** | `/scaffold:add-e2e-testing` | **(optional)** Web and/or mobile apps |

### Phase 5 — Stories & Planning
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 13 | **User Stories** | `/scaffold:user-stories` | Covers every PRD feature |
| 14 | **User Stories Gap Analysis** | `/scaffold:user-stories-gaps` | UX improvements |
| 15 | **Platform Parity Review** | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |

### Phase 6 — Consolidation & Verification
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 16 | **Claude.md Optimization** | `/scaffold:claude-md-optimization` | Run BEFORE Workflow Audit |
| 17 | **Workflow Audit** | `/scaffold:workflow-audit` | Run AFTER Claude.md Optimization |

### Phase 7 — Implementation
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 18 | **Implementation Plan** | `/scaffold:implementation-plan` | Creates full task graph |
| 19 | **Implementation Plan Review** | `/scaffold:implementation-plan-review` | Second pass for quality |
| 19.5 | **Implementation Plan Multi-Model Review** | `/scaffold:multi-model-review-tasks` | **(optional)** Requires Codex/Gemini CLI |
| 20 | **Execution (single)** | `/scaffold:single-agent-start` | Single-agent execution loop |
| 20 | **Execution (multi)** | `/scaffold:multi-agent-start <agent-name>` | One per worktree |

### Ongoing
| Prompt | Command | When |
|--------|---------|------|
| **New Enhancement** | `/scaffold:new-enhancement` | Adding features to existing project |
| **Quick Task** | `/scaffold:quick-task` | Bug fixes, refactors, perf improvements |
| **Resume (single)** | `/scaffold:single-agent-resume` | Resuming single-agent after a break |
| **Resume (multi)** | `/scaffold:multi-agent-resume <agent-name>` | Resuming a worktree agent after a break |
| **Implementation Plan Review** | `/scaffold:implementation-plan-review` | After creating 5+ new tasks |
| **Platform Parity Review** | `/scaffold:platform-parity-review` | After adding platform-specific features |
| **Automated PR Review** | `/scaffold:automated-pr-review` | Runs automatically on every PR |
| **Visual Dashboard** | `/scaffold:dashboard` | Visual HTML pipeline overview in browser |
