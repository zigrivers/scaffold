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
| 15.5 | Stories & Planning | `/scaffold:user-stories-multi-model-review` | **(optional)** Requires Codex/Gemini CLI |
| 16 | Stories & Planning | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |
| 17 | Consolidation | `/scaffold:claude-md-optimization` | Run BEFORE workflow-audit |
| 18 | Consolidation | `/scaffold:workflow-audit` | Run AFTER claude-md-optimization |
| 19 | Implementation | `/scaffold:implementation-plan` | Creates full task graph |
| 20 | Implementation | `/scaffold:implementation-plan-review` | Second pass for quality |
| 20.5 | Implementation | `/scaffold:multi-model-review-tasks` | **(optional)** Requires Codex/Gemini CLI |
| 21 | Implementation | `/scaffold:single-agent-start` | Single-agent execution loop |
| 21 | Implementation | `/scaffold:multi-agent-start` | Multi-agent — one per worktree |

## Standalone Commands

| Command | When to Use |
|---------|-------------|
| `/scaffold:single-agent-resume` | Resume work after a break |
| `/scaffold:multi-agent-resume` | Resume multi-agent work after a break |
| `/scaffold:new-enhancement` | Add a feature to an existing project |
| `/scaffold:quick-task` | Create a focused task for a bug fix, refactor, or small improvement |
| `/scaffold:prompt-pipeline` | Show the full pipeline reference |
| `/scaffold:dashboard` | Open visual pipeline dashboard in browser |

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

## Completion Detection

When checking pipeline status, use these detection criteria:

| # | Step | Check file exists | Tracking comment to search for |
|---|------|-------------------|-------------------------------|
| 1 | PRD Creation | `docs/plan.md` | `<!-- scaffold:prd ` |
| 2 | PRD Gap Analysis | `docs/plan.md` | `<!-- scaffold:prd-gap-analysis ` |
| 3 | Beads Setup | `.beads/config.yaml` | N/A |
| 4 | Tech Stack | `docs/tech-stack.md` | `<!-- scaffold:tech-stack ` |
| 5 | Claude Code Permissions | `.claude/settings.json` | N/A |
| 6 | Coding Standards | `docs/coding-standards.md` | `<!-- scaffold:coding-standards ` |
| 7 | TDD Standards | `docs/tdd-standards.md` | `<!-- scaffold:tdd-standards ` |
| 8 | Project Structure | `docs/project-structure.md` | `<!-- scaffold:project-structure ` |
| 9 | Dev Env Setup | `docs/dev-setup.md` | `<!-- scaffold:dev-setup ` |
| 10 | Design System | `docs/design-system.md` | `<!-- scaffold:design-system ` |
| 11 | Git Workflow | `docs/git-workflow.md` | `<!-- scaffold:git-workflow ` |
| 11.5 | Multi-Model Review | `AGENTS.md` | `<!-- scaffold:multi-model-review ` |
| 12 | Playwright | `playwright.config.ts` | `// scaffold:playwright ` |
| 13 | Maestro | `maestro/config.yaml` | `# scaffold:maestro ` |
| 14 | User Stories | `docs/user-stories.md` | `<!-- scaffold:user-stories ` |
| 15 | User Stories Gaps | `docs/user-stories.md` | `<!-- scaffold:user-stories-gaps ` |
| 15.5 | User Stories MMR | `docs/reviews/user-stories/review-summary.md` | `<!-- scaffold:user-stories-mmr ` |
| 16 | Platform Parity | `docs/user-stories.md` | `<!-- scaffold:platform-parity ` |
| 17 | Claude.md Optimization | `CLAUDE.md` | `<!-- scaffold:claude-md-optimization ` |
| 18 | Workflow Audit | `CLAUDE.md` | `<!-- scaffold:workflow-audit ` |
| 19 | Implementation Plan | `docs/implementation-plan.md` | `<!-- scaffold:implementation-plan ` |
| 20 | Impl Plan Review | `docs/implementation-plan.md` | `<!-- scaffold:implementation-plan-review ` |
| 20.5 | Impl Plan MMR | `docs/reviews/implementation-plan/review-summary.md` | `<!-- scaffold:implementation-plan-mmr ` |

**Detection rules:**
- If the file exists → step was likely run (even without tracking comment — older projects lack them)
- If the tracking comment exists in the file → step was definitively run
- For update-only steps (2, 15, 16, 17, 18, 20): file existence alone only confirms the prerequisite ran; check for the specific tracking comment to confirm the update step itself
