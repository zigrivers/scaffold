---
name: prompt-pipeline
description: Display full pipeline reference
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: []
---

## Purpose

Display the prompt pipeline order as a quick reference. This is a pure
information display — no files are read or commands run.

## Instructions

Print the following reference directly. Do not read any files or run any commands.

> **Note:** If installed via `scripts/install.sh`, use `/user:command-name` instead of `/scaffold:command-name`.

---

### Phase 0 — Prerequisites (one-time)
| Action | Command |
|--------|---------|
| Install Beads | `npm install -g @beads/bd` or `brew install beads` **(optional)** |
| Install Playwright MCP | `claude mcp add playwright npx @playwright/mcp@latest` **(optional — web apps only)** |

### Phase 1 — Product Definition (`pre`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 1 | **PRD Creation** | `/scaffold:create-prd <idea or @files>` | Interactive — requires user input |
| 2 | **Review PRD** | `/scaffold:review-prd` | Multi-pass PRD review |
| 2.5 | **Innovate PRD** | `/scaffold:innovate-prd` | **(optional)** Feature-level innovation |
| 3 | **User Stories** | `/scaffold:user-stories` | Covers every PRD feature |
| 4 | **Review User Stories** | `/scaffold:review-user-stories` | Multi-pass story review; depth 4+ adds requirements index |
| 4.5 | **Innovate User Stories** | `/scaffold:innovate-user-stories` | **(optional)** UX-level enhancements |

### Phase 2 — Project Foundation (`foundation`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 5 | **Beads Setup** | `/scaffold:beads` | **(optional)** Creates CLAUDE.md + task tracking |
| 6 | **Tech Stack** | `/scaffold:tech-stack` | Drives all technical decisions |
| 7 | **Coding Standards** | `/scaffold:coding-standards` | References tech-stack.md |
| 8 | **TDD Standards** | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| 9 | **Project Structure** | `/scaffold:project-structure` | References all Phase 2 docs |

### Phase 3 — Development Environment (`environment`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 10 | **Dev Environment Setup** | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| 11 | **Design System** | `/scaffold:design-system` | **(optional)** Frontend projects only |
| 12 | **Git Workflow** | `/scaffold:git-workflow` | Branching, CI, worktrees, permissions |
| 12.5 | **Automated PR Review** | `/scaffold:automated-pr-review` | **(optional)** Local CLI or external reviewer |
| 13 | **AI Memory Setup** | `/scaffold:ai-memory-setup` | Modular rules, optional MCP memory + external docs |

### Phase 4 — Testing Integration (`integration`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 14 | **E2E Testing** | `/scaffold:add-e2e-testing` | **(optional)** Playwright (web) and/or Maestro (mobile) |

### Phase 5 — Domain Modeling (`modeling`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 15 | **Domain Modeling** | `/scaffold:domain-modeling` | Entities, aggregates, events, bounded contexts |
| 16 | **Review Domain Modeling** | `/scaffold:review-domain-modeling` | 10-pass domain model review |

### Phase 6 — Architecture Decisions (`decisions`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 17 | **ADRs** | `/scaffold:adrs` | Architecture Decision Records |
| 18 | **Review ADRs** | `/scaffold:review-adrs` | Review for contradictions, missing decisions |

### Phase 7 — System Architecture (`architecture`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 19 | **System Architecture** | `/scaffold:system-architecture` | Components, data flows, module structure |
| 20 | **Review Architecture** | `/scaffold:review-architecture` | Coverage gaps, constraint violations |

### Phase 8 — Specifications (`specification`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 21 | **Database Schema** | `/scaffold:database-schema` | **(optional)** Tables, indexes, constraints |
| 22 | **Review Database** | `/scaffold:review-database` | **(optional)** Schema review |
| 23 | **API Contracts** | `/scaffold:api-contracts` | **(optional)** Endpoints, error codes, auth |
| 24 | **Review API** | `/scaffold:review-api` | **(optional)** API contracts review |
| 25 | **UX Spec** | `/scaffold:ux-spec` | **(optional)** Flows, states, accessibility |
| 26 | **Review UX** | `/scaffold:review-ux` | **(optional)** UX spec review |

### Phase 9 — Quality Gates (`quality`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 27 | **Review Testing** | `/scaffold:review-testing` | Reviews TDD strategy |
| 27.5 | **Story Tests** | `/scaffold:story-tests` | Generates tagged test skeletons from user story ACs |
| 28 | **Create Evals** | `/scaffold:create-evals` | Generates eval checks from standards docs |
| 29 | **Operations** | `/scaffold:operations` | Deployment, monitoring, incident response |
| 30 | **Review Operations** | `/scaffold:review-operations` | Reviews operations runbook |
| 31 | **Security** | `/scaffold:security` | Threat model, auth, data protection |
| 32 | **Review Security** | `/scaffold:review-security` | Reviews security posture |

### Phase 10 — Platform Parity (`parity`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 33 | **Platform Parity Review** | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |

### Phase 11 — Consolidation (`consolidation`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 34 | **Claude.md Optimization** | `/scaffold:claude-md-optimization` | Run BEFORE Workflow Audit |
| 35 | **Workflow Audit** | `/scaffold:workflow-audit` | Run AFTER Claude.md Optimization |

### Phase 12 — Planning (`planning`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 36 | **Implementation Plan** | `/scaffold:implementation-plan` | Creates full task graph |
| 37 | **Implementation Plan Review** | `/scaffold:implementation-plan-review` | Second pass for quality + multi-model validation (depth 4+) |

### Phase 13 — Validation (`validation`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 38 | **Cross-Phase Consistency** | `/scaffold:cross-phase-consistency` | Naming, assumptions, interfaces |
| 39 | **Traceability Matrix** | `/scaffold:traceability-matrix` | PRD to Stories to Architecture to Tasks |
| 40 | **Decision Completeness** | `/scaffold:decision-completeness` | All decisions recorded and justified |
| 41 | **Critical Path Walkthrough** | `/scaffold:critical-path-walkthrough` | End-to-end critical journey trace |
| 42 | **Implementability Dry Run** | `/scaffold:implementability-dry-run` | Simulate agent picking up tasks |
| 43 | **Dependency Graph Validation** | `/scaffold:dependency-graph-validation` | Verify task DAG is acyclic |
| 44 | **Scope Creep Check** | `/scaffold:scope-creep-check` | Specs stay within PRD boundaries |

### Phase 14 — Finalization (`finalization`)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 45 | **Apply Fixes & Freeze** | `/scaffold:apply-fixes-and-freeze` | Apply findings, freeze docs |
| 46 | **Developer Onboarding Guide** | `/scaffold:developer-onboarding-guide` | "Start here" for new devs/agents |
| 47 | **Implementation Playbook** | `/scaffold:implementation-playbook` | Operational guide for agent execution |

### Execution (post-pipeline)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| — | **Single Agent Start** | `/scaffold:single-agent-start` | TDD execution loop |
| — | **Multi Agent Start** | `/scaffold:multi-agent-start <agent-name>` | One per worktree |

### Standalone / Ongoing
| Prompt | Command | When |
|--------|---------|------|
| **New Enhancement** | `/scaffold:new-enhancement` | Adding features to existing project |
| **Quick Task** | `/scaffold:quick-task` | Bug fixes, refactors, perf improvements |
| **Resume (single)** | `/scaffold:single-agent-resume` | Resuming single-agent after a break |
| **Resume (multi)** | `/scaffold:multi-agent-resume <agent-name>` | Resuming a worktree agent after a break |
| **Version Bump** | `/scaffold:version-bump` | Bump version + changelog (no tag/release) |
| **Release** | `/scaffold:release` | Project-defined release ceremony with changelog + relevant release artifacts |
| **Visual Dashboard** | `/scaffold:dashboard` | HTML pipeline overview in browser |

## Process Rules

1. **Read-only** — this is a pure display command. Do not read any files or run any commands.
2. Print the reference above exactly as shown.
