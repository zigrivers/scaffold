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
| 5 | Project Foundation | `/scaffold:coding-standards` | References tech-stack.md |
| 6 | Project Foundation | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| 7 | Project Foundation | `/scaffold:project-structure` | References all Phase 2 docs |
| 8 | Dev Environment | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| 9 | Dev Environment | `/scaffold:design-system` | **(optional)** Frontend projects only |
| 10 | Dev Environment | `/scaffold:git-workflow` | References dev-setup.md |
| 10.5 | Dev Environment | `/scaffold:automated-pr-review` | **(optional)** Requires external reviewer |
| 10.8 | Dev Environment | `/scaffold:ai-memory-setup` | Modular rules, optional MCP memory + external docs |
| 11 | Testing | `/scaffold:add-e2e-testing` | **(optional)** Web and/or mobile apps |
| 13 | Stories & Planning | `/scaffold:user-stories` | Covers every PRD feature |
| 14 | Stories & Planning | `/scaffold:user-stories-gaps` | UX improvements |
| 15 | Stories & Planning | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |
| 15.1 | Domain Modeling | `/scaffold:domain-modeling` | Entities, aggregates, events, bounded contexts |
| 15.2 | Domain Modeling | `/scaffold:review-domain-modeling` | 10-pass domain model review |
| 15.3 | Architecture | `/scaffold:adrs` | Architecture Decision Records |
| 15.4 | Architecture | `/scaffold:review-adrs` | Review for contradictions, missing decisions |
| 15.5 | Architecture | `/scaffold:system-architecture` | Components, data flows, module structure |
| 15.6 | Architecture | `/scaffold:review-architecture` | Coverage gaps, constraint violations |
| 15.7 | Specification | `/scaffold:database-schema` | **(optional)** Tables, indexes, constraints |
| 15.8 | Specification | `/scaffold:review-database` | **(optional)** Schema review |
| 15.9 | Specification | `/scaffold:api-contracts` | **(optional)** Endpoints, error codes, auth |
| 15.10 | Specification | `/scaffold:review-api` | **(optional)** API contracts review |
| 15.11 | Specification | `/scaffold:ux-spec` | **(optional)** Flows, states, accessibility |
| 15.12 | Specification | `/scaffold:review-ux` | **(optional)** UX spec review |
| 15.13 | Quality Gates | `/scaffold:review-testing` | Reviews TDD strategy for coverage gaps |
| 15.14 | Quality Gates | `/scaffold:create-evals` | Generates eval checks from standards docs |
| 15.15 | Quality Gates | `/scaffold:operations` | Deployment, monitoring, incident response |
| 15.16 | Quality Gates | `/scaffold:review-operations` | Reviews operations runbook |
| 15.17 | Quality Gates | `/scaffold:security` | Threat model, auth, data protection |
| 15.18 | Quality Gates | `/scaffold:review-security` | Reviews security posture |
| 16 | Consolidation | `/scaffold:claude-md-optimization` | Run BEFORE workflow-audit |
| 17 | Consolidation | `/scaffold:workflow-audit` | Run AFTER claude-md-optimization |
| 18 | Implementation | `/scaffold:implementation-plan` | Creates full task graph |
| 19 | Implementation | `/scaffold:implementation-plan-review` | Second pass for quality |
| 19.5 | Implementation | `/scaffold:multi-model-review-tasks` | **(optional)** Requires Codex/Gemini CLI |
| 20 | Implementation | `/scaffold:single-agent-start` | Single-agent execution loop |
| 20 | Implementation | `/scaffold:multi-agent-start` | Multi-agent — one per worktree |

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
PRD → User Stories → Domain Modeling → ADRs → System Architecture
                                                      ↓
                                               ┌──────┼──────┐
                                            DB Schema  API   UX Spec
                                                      ↓
                        TDD → Review Testing → Create Evals
                                    ↓
                              Operations → Security (+ reviews)
                                                      ↓
Dev Setup → Git Workflow → AI Memory Setup → Claude.md Optimization → Workflow Audit
                                                            ↓
                                              Implementation Plan → Review → Execution
```

## Critical Ordering Constraints

1. **Beads Setup before everything else in Phase 2** — creates CLAUDE.md
2. **Tech Stack before Coding Standards and TDD** — they reference it
3. **Dev Setup before Git Workflow** — Git Workflow references lint/test commands
4. **Git Workflow before AI Memory Setup** — memory rules are extracted from project docs created by earlier steps
5. **User Stories before Domain Modeling** — domain models derive from stories
6. **Domain Modeling → ADRs → Architecture** — linear chain through modeling phases
7. **Architecture before Specification** — DB, API, UX specs derive from architecture (can parallelize)
8. **TDD → Review Testing → Operations → Security** — quality gate chain
9. **Quality Gates before Consolidation** — consolidation verifies all docs including operations/security
10. **Claude.md Optimization before Workflow Audit** — optimize first, verify second
11. **Implementation Plan before Implementation Plan Review** — can't review what doesn't exist

## Status & Navigation

For all status, progress, and navigation queries, use the `scaffold-runner` skill, which delegates to the `scaffold` CLI:

- `scaffold status` — current pipeline progress
- `scaffold status --compact` — show only actionable steps (pending/in-progress)
- `scaffold next` — next eligible steps
- `scaffold list` — full pipeline with status indicators
- `scaffold skip <step> [<step2>...] --reason "..."` — skip one or more steps
- `scaffold reset <step> --force` — reset a step to re-run it
