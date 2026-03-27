---
name: scaffold-pipeline
description: Static reference for scaffold pipeline ordering, dependencies, and phase structure. Use ONLY for questions about pipeline design, step ordering, or dependency constraints — NOT for status, progress, or "what's next" queries (those go through scaffold-runner).
---

# Scaffold Pipeline Reference

This skill is a **static reference** for pipeline ordering and dependency constraints. It does NOT handle status checks, progress queries, or navigation.

**Activation boundary:** If the user asks "where am I?", "what's next?", "pipeline status", or anything about their current progress → **do not use this skill**. The `scaffold-runner` skill handles all status/navigation via the `scaffold` CLI.

Use this skill ONLY when the user asks about:
- Pipeline design: "what phases are there?", "what's the ordering?"
- Dependency rules: "what depends on what?", "can I run X before Y?"
- Step reference: "what commands are in phase 3?", "is design-system optional?"

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
| `/scaffold:version-bump` | Bump version and update changelog without tagging or releasing |
| `/scaffold:release` | Create a versioned release with changelog and GitHub release |
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

## Status & Navigation

For all status, progress, and navigation queries, use the `scaffold-runner` skill, which delegates to the `scaffold` CLI:

- `scaffold status` — current pipeline progress
- `scaffold status --compact` — show only actionable steps (pending/in-progress)
- `scaffold next` — next eligible steps
- `scaffold list` — full pipeline with status indicators
- `scaffold skip <step> [<step2>...] --reason "..."` — skip one or more steps
- `scaffold reset <step> --force` — reset a step to re-run it
