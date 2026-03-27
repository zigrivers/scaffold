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
| Install Beads | `npm install -g @beads/bd` or `brew install beads` **(optional)** |
| Install Playwright MCP | `claude mcp add playwright npx @playwright/mcp@latest` **(optional — web apps only)** |

### Phase 1 — Product Definition
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 1 | **PRD Creation** | `/scaffold:create-prd <idea or @files>` | Interactive — requires user input |
| 2 | **Review PRD** | `/scaffold:review-prd` | Multi-pass PRD review |
| 2.5 | **Innovate PRD** | `/scaffold:innovate-prd` | **(optional)** Feature-level innovation |
| 3 | **User Stories** | `/scaffold:user-stories` | Covers every PRD feature |
| 4 | **Review User Stories** | `/scaffold:review-user-stories` | Multi-pass story review; depth 4+ adds requirements index |
| 4.5 | **Innovate User Stories** | `/scaffold:innovate-user-stories` | **(optional)** UX-level enhancements |

### Phase 2 — Project Foundation
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 5 | **Beads Setup** | `/scaffold:beads` | **(optional)** Creates CLAUDE.md + task tracking |
| 6 | **Tech Stack** | `/scaffold:tech-stack` | Drives all technical decisions |
| 7 | **Coding Standards** | `/scaffold:coding-standards` | References tech-stack.md |
| 8 | **TDD Standards** | `/scaffold:tdd` | References tech-stack.md + coding-standards.md |
| 9 | **Project Structure** | `/scaffold:project-structure` | References all Phase 2 docs |

### Phase 3 — Development Environment
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 10 | **Dev Environment Setup** | `/scaffold:dev-env-setup` | Creates lint/test/install commands |
| 11 | **Design System** | `/scaffold:design-system` | **(optional)** Frontend projects only |
| 12 | **Git Workflow** | `/scaffold:git-workflow` | Branching, CI, worktrees, permissions |
| 12.5 | **Automated PR Review** | `/scaffold:automated-pr-review` | **(optional)** Local CLI or external reviewer |
| 13 | **AI Memory Setup** | `/scaffold:ai-memory-setup` | Modular rules, optional MCP memory + external docs |

### Phase 4 — Testing Integration
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 14 | **E2E Testing** | `/scaffold:add-e2e-testing` | **(optional)** Playwright (web) and/or Maestro (mobile) |

### Phase 5 — Stories & Reviews
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 15 | **Platform Parity Review** | `/scaffold:platform-parity-review` | **(optional)** Multi-platform projects |

### Phase 5b — Domain Modeling
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 16 | **Domain Modeling** | `/scaffold:domain-modeling` | Entities, aggregates, events, bounded contexts |
| 17 | **Review Domain Modeling** | `/scaffold:review-domain-modeling` | 10-pass domain model review |

### Phase 5c — Architecture Decisions
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 18 | **ADRs** | `/scaffold:adrs` | Architecture Decision Records |
| 19 | **Review ADRs** | `/scaffold:review-adrs` | Review for contradictions, missing decisions |
| 20 | **System Architecture** | `/scaffold:system-architecture` | Components, data flows, module structure |
| 21 | **Review Architecture** | `/scaffold:review-architecture` | Coverage gaps, constraint violations |

### Phase 5d — Specification (all optional)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 22 | **Database Schema** | `/scaffold:database-schema` | **(optional)** Tables, indexes, constraints |
| 23 | **Review Database** | `/scaffold:review-database` | **(optional)** Schema review |
| 24 | **API Contracts** | `/scaffold:api-contracts` | **(optional)** Endpoints, error codes, auth |
| 25 | **Review API** | `/scaffold:review-api` | **(optional)** API contracts review |
| 26 | **UX Spec** | `/scaffold:ux-spec` | **(optional)** Flows, states, accessibility |
| 27 | **Review UX** | `/scaffold:review-ux` | **(optional)** UX spec review |

### Phase 5e — Quality Gates
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 28 | **Review Testing** | `/scaffold:review-testing` | Reviews TDD strategy |
| 29 | **Create Evals** | `/scaffold:create-evals` | Generates eval checks from standards docs |
| 30 | **Operations** | `/scaffold:operations` | Deployment, monitoring, incident response |
| 31 | **Review Operations** | `/scaffold:review-operations` | Reviews operations runbook |
| 32 | **Security** | `/scaffold:security` | Threat model, auth, data protection |
| 33 | **Review Security** | `/scaffold:review-security` | Reviews security posture |

### Phase 6 — Consolidation
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 34 | **Claude.md Optimization** | `/scaffold:claude-md-optimization` | Run BEFORE Workflow Audit |
| 35 | **Workflow Audit** | `/scaffold:workflow-audit` | Run AFTER Claude.md Optimization |

### Phase 7 — Planning
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 36 | **Implementation Plan** | `/scaffold:implementation-plan` | Creates full task graph |
| 37 | **Implementation Plan Review** | `/scaffold:implementation-plan-review` | Second pass for quality |
| 37.5 | **Multi-Model Review Tasks** | `/scaffold:multi-model-review-tasks` | **(optional)** Requires Codex/Gemini CLI |

### Phase 7b — Validation (7 parallel checks)
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 38 | **Cross-Phase Consistency** | `/scaffold:cross-phase-consistency` | Naming, assumptions, interfaces |
| 39 | **Traceability Matrix** | `/scaffold:traceability-matrix` | PRD → Stories → Architecture → Tasks |
| 40 | **Decision Completeness** | `/scaffold:decision-completeness` | All decisions recorded and justified |
| 41 | **Critical Path Walkthrough** | `/scaffold:critical-path-walkthrough` | End-to-end critical journey trace |
| 42 | **Implementability Dry Run** | `/scaffold:implementability-dry-run` | Simulate agent picking up tasks |
| 43 | **Dependency Graph Validation** | `/scaffold:dependency-graph-validation` | Verify task DAG is acyclic |
| 44 | **Scope Creep Check** | `/scaffold:scope-creep-check` | Specs stay within PRD boundaries |

### Phase 7c — Finalization
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 45 | **Apply Fixes & Freeze** | `/scaffold:apply-fixes-and-freeze` | Apply findings, freeze docs |
| 46 | **Developer Onboarding Guide** | `/scaffold:developer-onboarding-guide` | "Start here" for new devs/agents |
| 47 | **Implementation Playbook** | `/scaffold:implementation-playbook` | Operational guide for agent execution |

### Phase 8 — Execution
| # | Prompt | Command | Notes |
|---|--------|---------|-------|
| 48 | **Single Agent Start** | `/scaffold:single-agent-start` | TDD execution loop |
| 48 | **Multi Agent Start** | `/scaffold:multi-agent-start <agent-name>` | One per worktree |

### Standalone / Ongoing
| Prompt | Command | When |
|--------|---------|------|
| **New Enhancement** | `/scaffold:new-enhancement` | Adding features to existing project |
| **Quick Task** | `/scaffold:quick-task` | Bug fixes, refactors, perf improvements |
| **Resume (single)** | `/scaffold:single-agent-resume` | Resuming single-agent after a break |
| **Resume (multi)** | `/scaffold:multi-agent-resume <agent-name>` | Resuming a worktree agent after a break |
| **Version Bump** | `/scaffold:version-bump` | Bump version + changelog (no tag/release) |
| **Release** | `/scaffold:release` | Full release with tag + GitHub release |
| **Visual Dashboard** | `/scaffold:dashboard` | HTML pipeline overview in browser |
