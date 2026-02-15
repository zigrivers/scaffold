---
description: "Show the full pipeline reference"
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
| 5 | **Claude Code Permissions** | `/scaffold:claude-code-permissions` | Enables autonomous agents |
| 6 | **Coding Standards** | `/scaffold:coding-standards` | References tech-stack.md |
| 7 | **TDD Standards** | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| 8 | **Project Structure** | `/scaffold:project-structure` | References all Phase 2 docs |

### Phase 3 — Development Environment
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 9 | **Dev Environment Setup** | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| 10 | **Design System** | `/scaffold:design-system` | **(optional)** Frontend projects only |
| 11 | **Git Workflow** | `/scaffold:git-workflow` | References dev-setup.md |
| 11.5 | **Multi-Model Code Review** | `/scaffold:multi-model-review` | **(optional)** Requires ChatGPT Pro |

### Phase 4 — Testing Integration
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 12 | **Playwright Integration** | `/scaffold:add-playwright` | **(optional)** Web apps |
| 13 | **Maestro Setup** | `/scaffold:add-maestro` | **(optional)** Expo/mobile apps |

### Phase 5 — Stories & Planning
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 14 | **User Stories** | `/scaffold:user-stories` | Covers every PRD feature |
| 15 | **User Stories Gap Analysis** | `/scaffold:user-stories-gaps` | UX improvements |
| 16 | **Platform Parity Review** | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |

### Phase 6 — Consolidation & Verification
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 17 | **Claude.md Optimization** | `/scaffold:claude-md-optimization` | Run BEFORE Workflow Audit |
| 18 | **Workflow Audit** | `/scaffold:workflow-audit` | Run AFTER Claude.md Optimization |

### Phase 7 — Implementation
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 19 | **Implementation Plan** | `/scaffold:implementation-plan` | Creates full task graph |
| 20 | **Implementation Plan Review** | `/scaffold:implementation-plan-review` | Second pass for quality |
| 21 | **Execution** | `/scaffold:single-agent-start` | Autonomous execution loop |

### Ongoing
| Prompt | Command | When |
|--------|---------|------|
| **New Enhancement** | `/scaffold:new-enhancement` | Adding features to existing project |
| **Resume Work** | `/scaffold:single-agent-resume` | Resuming after a break |
| **Implementation Plan Review** | `/scaffold:implementation-plan-review` | After creating 5+ new tasks |
| **Platform Parity Review** | `/scaffold:platform-parity-review` | After adding platform-specific features |
| **Multi-Model Code Review** | `/scaffold:multi-model-review` | Runs automatically on every PR |
