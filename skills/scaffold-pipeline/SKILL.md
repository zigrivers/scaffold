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

## Phases

14 phases, each with a slug (used in frontmatter) and display name. Canonical source: `src/types/frontmatter.ts` `PHASES` constant.

| # | Slug | Display Name |
|---|------|-------------|
| 1 | `pre` | Product Definition |
| 2 | `foundation` | Project Foundation |
| 3 | `environment` | Development Environment |
| 4 | `integration` | Testing Integration |
| 5 | `modeling` | Domain Modeling |
| 6 | `decisions` | Architecture Decisions |
| 7 | `architecture` | System Architecture |
| 8 | `specification` | Specifications |
| 9 | `quality` | Quality Gates |
| 10 | `stories` | Stories & Reviews |
| 11 | `consolidation` | Consolidation |
| 12 | `planning` | Planning |
| 13 | `validation` | Validation |
| 14 | `finalization` | Finalization |

## Pipeline Order

| Phase | Command | Notes |
|-------|---------|-------|
| 1. Product Definition | `/scaffold:create-prd` | Interactive — requires user input |
| | `/scaffold:review-prd` | Multi-pass PRD review |
| | `/scaffold:innovate-prd` | **(optional)** Feature-level innovation |
| | `/scaffold:user-stories` | Covers every PRD feature |
| | `/scaffold:review-user-stories` | Multi-pass story review; depth 4+ adds requirements index |
| | `/scaffold:innovate-user-stories` | **(optional)** UX-level enhancements |
| 2. Project Foundation | `/scaffold:beads` | **(optional)** Creates CLAUDE.md + task tracking |
| | `/scaffold:tech-stack` | Drives all technical decisions |
| | `/scaffold:coding-standards` | References tech-stack.md |
| | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| | `/scaffold:project-structure` | References all Phase 2 docs |
| 3. Dev Environment | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| | `/scaffold:design-system` | **(optional)** Frontend projects only |
| | `/scaffold:git-workflow` | Branching, CI, worktrees, permissions |
| | `/scaffold:automated-pr-review` | **(optional)** Local CLI or external reviewer |
| | `/scaffold:ai-memory-setup` | Modular rules, optional MCP memory + external docs |
| 4. Testing Integration | `/scaffold:add-e2e-testing` | **(optional)** Playwright (web) and/or Maestro (mobile) |
| 5. Domain Modeling | `/scaffold:domain-modeling` | Entities, aggregates, events, bounded contexts |
| | `/scaffold:review-domain-modeling` | 10-pass domain model review |
| 6. Architecture Decisions | `/scaffold:adrs` | Architecture Decision Records |
| | `/scaffold:review-adrs` | Review for contradictions, missing decisions |
| 7. System Architecture | `/scaffold:system-architecture` | Components, data flows, module structure |
| | `/scaffold:review-architecture` | Coverage gaps, constraint violations |
| 8. Specifications | `/scaffold:database-schema` | **(optional)** Tables, indexes, constraints |
| | `/scaffold:review-database` | **(optional)** Schema review |
| | `/scaffold:api-contracts` | **(optional)** Endpoints, error codes, auth |
| | `/scaffold:review-api` | **(optional)** API contracts review |
| | `/scaffold:ux-spec` | **(optional)** Flows, states, accessibility |
| | `/scaffold:review-ux` | **(optional)** UX spec review |
| 9. Quality Gates | `/scaffold:review-testing` | Reviews TDD strategy for coverage gaps |
| | `/scaffold:create-evals` | Generates eval checks from standards docs |
| | `/scaffold:operations` | Deployment, monitoring, incident response |
| | `/scaffold:review-operations` | Reviews operations runbook |
| | `/scaffold:security` | Threat model, auth, data protection |
| | `/scaffold:review-security` | Reviews security posture |
| 10. Stories & Reviews | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |
| 11. Consolidation | `/scaffold:claude-md-optimization` | Run BEFORE workflow-audit |
| | `/scaffold:workflow-audit` | Run AFTER claude-md-optimization |
| 12. Planning | `/scaffold:implementation-plan` | Creates full task graph |
| | `/scaffold:implementation-plan-review` | Second pass for quality + multi-model validation (depth 4+) |
| 13. Validation | `/scaffold:cross-phase-consistency` | Naming, assumptions, interfaces |
| | `/scaffold:traceability-matrix` | PRD → Stories → Architecture → Tasks |
| | `/scaffold:decision-completeness` | All decisions recorded and justified |
| | `/scaffold:critical-path-walkthrough` | End-to-end critical journey trace |
| | `/scaffold:implementability-dry-run` | Simulate agent picking up tasks |
| | `/scaffold:dependency-graph-validation` | Verify task DAG is acyclic |
| | `/scaffold:scope-creep-check` | Specs stay within PRD boundaries |
| 14. Finalization | `/scaffold:apply-fixes-and-freeze` | Apply findings, freeze docs |
| | `/scaffold:developer-onboarding-guide` | "Start here" for new devs/agents |
| | `/scaffold:implementation-playbook` | Operational guide for agent execution |
| Execution (post-pipeline) | `/scaffold:single-agent-start` | Single-agent TDD execution loop |
| | `/scaffold:multi-agent-start` | Multi-agent — one per worktree |

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
                              Implementation Plan → Review → Validation (7 parallel checks)
                                                                    ↓
                                                    Apply Fixes & Freeze → Onboarding → Playbook
                                                                                          ↓
                                                                                      Execution
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
11. **Implementation Plan Review before Validation** — 7 checks run after plan review
12. **All 7 Validation checks before Apply Fixes & Freeze** — freeze requires all findings
13. **Finalization before Execution** — agents need frozen docs and playbook

## Status & Navigation

For all status, progress, and navigation queries, use the `scaffold-runner` skill, which delegates to the `scaffold` CLI:

- `scaffold status` — current pipeline progress
- `scaffold status --compact` — show only actionable steps (pending/in-progress)
- `scaffold next` — next eligible steps
- `scaffold list` — full pipeline with status indicators
- `scaffold skip <step> [<step2>...] --reason "..."` — skip one or more steps
- `scaffold reset <step> --force` — reset a step to re-run it
