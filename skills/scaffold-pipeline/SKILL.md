---
name: scaffold-pipeline
description: Provides pipeline ordering context for the scaffold prompt pipeline. Auto-activates when users ask about scaffolding sequence, which command to run next, or pipeline ordering.
---

# Scaffold Pipeline Reference

This skill provides context about the scaffold prompt pipeline ordering. When the user asks about which command to run next, what order to follow, or how the pipeline works, use this reference.

## Pipeline Order

| # | Phase | Command | Notes |
|---|-------|---------|-------|
| 1 | Product Definition | `/scaffold:create-prd` | Interactive — requires user input |
| 2 | Product Definition | `/scaffold:prd-gap-analysis` | Last chance to strengthen PRD |
| 3 | Project Foundation | `/scaffold:beads` | Creates CLAUDE.md — run first in Phase 2 |
| 4 | Project Foundation | `/scaffold:tech-stack` | Drives all technical decisions |
| 5 | Project Foundation | `/scaffold:claude-code-permissions` | Enables autonomous agents |
| 6 | Project Foundation | `/scaffold:coding-standards` | References tech-stack.md |
| 7 | Project Foundation | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| 8 | Project Foundation | `/scaffold:project-structure` | References all Phase 2 docs |
| 9 | Dev Environment | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| 10 | Dev Environment | `/scaffold:design-system` | **(optional)** Frontend projects only |
| 11 | Dev Environment | `/scaffold:git-workflow` | References dev-setup.md |
| 11.5 | Dev Environment | `/scaffold:multi-model-review` | **(optional)** Requires ChatGPT Pro |
| 12 | Testing | `/scaffold:add-playwright` | **(optional)** Web apps only |
| 13 | Testing | `/scaffold:add-maestro` | **(optional)** Mobile/Expo apps only |
| 14 | Stories & Planning | `/scaffold:user-stories` | Covers every PRD feature |
| 15 | Stories & Planning | `/scaffold:user-stories-gaps` | UX improvements |
| 16 | Stories & Planning | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |
| 17 | Consolidation | `/scaffold:claude-md-optimization` | Run BEFORE workflow-audit |
| 18 | Consolidation | `/scaffold:workflow-audit` | Run AFTER claude-md-optimization |
| 19 | Implementation | `/scaffold:implementation-plan` | Creates full task graph |
| 20 | Implementation | `/scaffold:implementation-plan-review` | Second pass for quality |
| 21 | Implementation | `/scaffold:single-agent-start` | Single-agent execution loop |
| 21 | Implementation | `/scaffold:multi-agent-start` | Multi-agent — one per worktree |

## Standalone Commands

| Command | When to Use |
|---------|-------------|
| `/scaffold:single-agent-resume` | Resume work after a break |
| `/scaffold:multi-agent-resume` | Resume multi-agent work after a break |
| `/scaffold:new-enhancement` | Add a feature to an existing project |
| `/scaffold:prompt-pipeline` | Show the full pipeline reference |

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

## Critical Ordering Constraints

1. **Beads Setup before everything else in Phase 2** — creates CLAUDE.md
2. **Tech Stack before Permissions, Coding Standards, and TDD** — they reference it
3. **Dev Setup before Git Workflow** — Git Workflow references lint/test commands
4. **Claude.md Optimization before Workflow Audit** — optimize first, verify second
5. **Implementation Plan before Implementation Plan Review** — can't review what doesn't exist
