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
| 10 | `parity` | Platform Parity |
| 11 | `consolidation` | Consolidation |
| 12 | `planning` | Planning |
| 13 | `validation` | Validation |
| 14 | `finalization` | Finalization |

## Pipeline Order

| # | Phase | Command | Notes |
|---|-------|---------|-------|
| 1 | Product Definition | `/scaffold:create-prd` | Interactive — requires user input |
| 2 | Product Definition | `/scaffold:review-prd` | Multi-pass PRD review |
| 2.5 | Product Definition | `/scaffold:innovate-prd` | **(optional)** Feature-level innovation |
| 3 | Product Definition | `/scaffold:user-stories` | Covers every PRD feature |
| 4 | Product Definition | `/scaffold:review-user-stories` | Multi-pass story review; depth 4+ adds requirements index |
| 4.5 | Product Definition | `/scaffold:innovate-user-stories` | **(optional)** UX-level enhancements |
| 5 | Project Foundation | `/scaffold:beads` | **(optional)** Creates CLAUDE.md + task tracking |
| 6 | Project Foundation | `/scaffold:tech-stack` | Drives all technical decisions |
| 7 | Project Foundation | `/scaffold:coding-standards` | References tech-stack.md |
| 8 | Project Foundation | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| 9 | Project Foundation | `/scaffold:project-structure` | References all Phase 2 docs |
| 10 | Dev Environment | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| 11 | Dev Environment | `/scaffold:design-system` | **(optional)** Frontend projects only |
| 12 | Dev Environment | `/scaffold:git-workflow` | Branching, CI, worktrees, permissions |
| 12.5 | Dev Environment | `/scaffold:automated-pr-review` | **(optional)** Local CLI or external reviewer |
| 13 | Dev Environment | `/scaffold:ai-memory-setup` | Modular rules, optional MCP memory + external docs |
| 14 | Testing Integration | `/scaffold:add-e2e-testing` | **(optional)** Playwright (web) and/or Maestro (mobile) |
| 15 | Domain Modeling | `/scaffold:domain-modeling` | Entities, aggregates, events, bounded contexts |
| 16 | Domain Modeling | `/scaffold:review-domain-modeling` | 10-pass domain model review |
| 17 | Architecture Decisions | `/scaffold:adrs` | Architecture Decision Records |
| 18 | Architecture Decisions | `/scaffold:review-adrs` | Review for contradictions, missing decisions |
| 19 | System Architecture | `/scaffold:system-architecture` | Components, data flows, module structure |
| 20 | System Architecture | `/scaffold:review-architecture` | Coverage gaps, constraint violations |
| 21 | Specifications | `/scaffold:database-schema` | **(optional)** Tables, indexes, constraints |
| 22 | Specifications | `/scaffold:review-database` | **(optional)** Schema review |
| 23 | Specifications | `/scaffold:api-contracts` | **(optional)** Endpoints, error codes, auth |
| 24 | Specifications | `/scaffold:review-api` | **(optional)** API contracts review |
| 25 | Specifications | `/scaffold:ux-spec` | **(optional)** Flows, states, accessibility |
| 26 | Specifications | `/scaffold:review-ux` | **(optional)** UX spec review |
| 27 | Quality Gates | `/scaffold:review-testing` | Reviews TDD strategy for coverage gaps |
| 28 | Quality Gates | `/scaffold:create-evals` | Generates eval checks from standards docs |
| 29 | Quality Gates | `/scaffold:operations` | Deployment, monitoring, incident response |
| 30 | Quality Gates | `/scaffold:review-operations` | Reviews operations runbook |
| 31 | Quality Gates | `/scaffold:security` | Threat model, auth, data protection |
| 32 | Quality Gates | `/scaffold:review-security` | Reviews security posture |
| 33 | Platform Parity | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |
| 34 | Consolidation | `/scaffold:claude-md-optimization` | Run BEFORE workflow-audit |
| 35 | Consolidation | `/scaffold:workflow-audit` | Run AFTER claude-md-optimization |
| 36 | Planning | `/scaffold:implementation-plan` | Creates full task graph |
| 37 | Planning | `/scaffold:implementation-plan-review` | Second pass for quality + multi-model validation (depth 4+) |
| 38 | Validation | `/scaffold:cross-phase-consistency` | Naming, assumptions, interfaces |
| 39 | Validation | `/scaffold:traceability-matrix` | PRD → Stories → Architecture → Tasks |
| 40 | Validation | `/scaffold:decision-completeness` | All decisions recorded and justified |
| 41 | Validation | `/scaffold:critical-path-walkthrough` | End-to-end critical journey trace |
| 42 | Validation | `/scaffold:implementability-dry-run` | Simulate agent picking up tasks |
| 43 | Validation | `/scaffold:dependency-graph-validation` | Verify task DAG is acyclic |
| 44 | Validation | `/scaffold:scope-creep-check` | Specs stay within PRD boundaries |
| 45 | Finalization | `/scaffold:apply-fixes-and-freeze` | Apply findings, freeze docs |
| 46 | Finalization | `/scaffold:developer-onboarding-guide` | "Start here" for new devs/agents |
| 47 | Finalization | `/scaffold:implementation-playbook` | Operational guide for agent execution |
| 48 | Execution | `/scaffold:single-agent-start` | Single-agent TDD execution loop |
| 48 | Execution | `/scaffold:multi-agent-start` | Multi-agent — one per worktree |

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

## Execution Model

### Two Parallel Tracks

After Phase 1 (Product Definition), the pipeline splits into **two independent tracks** that can run concurrently. They converge at Phase 12 (Planning).

```
                           ┌─ Track A: Infrastructure ──────────────────────┐
                           │                                                │
Phase 1                    │  Phase 2 (foundation)                          │
create-prd ─→ review-prd  │    tech-stack → coding-standards → tdd         │
    ↓                      │                     ↓                          │
user-stories               │    project-structure → dev-env-setup           │
    ↓                      │         ↓                                      │
review-user-stories ──┐    │    git-workflow → claude-md-optimization       │
                      │    │         ↓              ↓                       │
                      │    │    ai-memory-setup  workflow-audit              │
                      │    │                                                │
                      │    └────────────────────────────────────────────────┘
                      │
                      │    ┌─ Track B: Domain & Quality ───────────────────┐
                      │    │                                                │
                      └──→ │  Phase 5-8: domain-modeling → adrs →           │
                           │    system-architecture → specs (DB/API/UX)     │
                           │                                                │
                           │  Phase 9: tdd → review-testing → operations    │
                           │    → security (+ reviews for each)             │
                           │                                                │
                           └────────────────────────────────────────────────┘
                                              ↓
                              ┌───────────────┴───────────────┐
                              │   Phase 12: Planning          │
                              │   (convergence point —        │
                              │    depends on both tracks)    │
                              └───────────────┬───────────────┘
                                              ↓
                              Phase 13: Validation (7 parallel checks)
                                              ↓
                              Phase 14: Finalization → Execution
```

### How Order Numbers Work

The `order` field is a **tiebreaker**, not a sequence number. Execution order is determined by:

1. **Dependency graph** (primary) — topological sort ensures prerequisites complete first
2. **Order field** (secondary) — when multiple steps are eligible simultaneously, lower order runs first

Order numbers are **phase-aligned**: Phase N uses orders in the N00 range (Phase 1 = 100s, Phase 2 = 200s, etc.). This makes it easy to identify which phase a step belongs to from its order alone.

### Which Phases Can Run in Parallel

Steps within the same track that don't depend on each other can run in parallel (in separate sessions/worktrees):

- **Track A** and **Track B** are fully independent until Phase 12
- Within Track B, specification steps (Phase 8) can parallelize: DB schema, API contracts, and UX spec all depend on review-architecture but not each other
- Validation steps (Phase 13) all depend on implementation-plan-review but not each other — all 7 can run in parallel

## Critical Ordering Constraints

1. **Tech Stack before Coding Standards and TDD** — they reference it
2. **Dev Setup before Git Workflow** — Git Workflow references lint/test commands
3. **Git Workflow before AI Memory Setup** — memory rules are extracted from project docs
4. **User Stories before Domain Modeling** — domain models derive from stories
5. **Domain Modeling → ADRs → Architecture** — linear chain through modeling phases
6. **Architecture before Specification** — DB, API, UX specs derive from architecture (can parallelize)
7. **TDD → Review Testing → Operations → Security** — quality gate chain
8. **Both tracks converge at Implementation Plan** — depends on tdd, operations, security, AND review-architecture
9. **All 7 Validation checks before Apply Fixes & Freeze** — freeze requires all findings
10. **Finalization before Execution** — agents need frozen docs and playbook
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
