# Scaffold v2 — Documentation Plan & Directory Structure

## Purpose

This document defines the directory structure, naming conventions, and workflow for producing all v2 design documentation. It covers 10 documentation phases, a validation phase, and a finalization phase — all completed before implementation begins.

Every document produced during these phases will be consumed by AI agents during implementation. Write for that audience: precise, unambiguous, machine-parseable where possible, with explicit cross-references between documents.

> **Single Source of Truth**: `scaffold-v2-prd.md` is the authoritative PRD for scaffold v2. All other v2 documents (domain models, ADRs, data schemas, API contracts, UX specs) are subordinate. When any v2 document conflicts with the PRD, the PRD wins. The PRD consolidates the original v2 spec with the meta-prompt architecture design.

## Directory Structure

All v2 documentation lives under `docs/v2/`. This directory is separate from the existing `docs/` which contains v1 pipeline output documents.

```
docs/v2/
├── README.md                              # This file — index of all v2 docs
├── scaffold-v2-prd.md                     # Product Requirements Document (SINGLE SOURCE OF TRUTH)
├── domain-models/                         # Phase 1: Deep domain modeling
│   ├── 02-dependency-resolution.md            # Current
│   ├── 03-pipeline-state-machine.md            # Current
│   ├── 05-platform-adapters.md                 # Transformed
│   ├── 06-config-validation.md                 # Transformed
│   ├── 07-brownfield-adopt.md                  # Current
│   ├── 08-prompt-frontmatter.md                # Transformed
│   ├── 09-cli-architecture.md                  # Transformed
│   ├── 10-claude-md-management.md              # Current
│   ├── 11-decision-log.md                      # Current
│   ├── 13-pipeline-locking.md                  # Current
│   └── 14-init-wizard.md                       # Transformed
├── adrs/                                  # Phase 2: Architecture Decision Records
│   ├── template.md
│   ├── ADR-001-cli-language-nodejs.md
│   ├── ADR-002-....md
│   └── index.md                           # ADR index with status
├── architecture/                          # Phase 3: System architecture
│   ├── system-architecture.md             # Top-level architecture doc
│   ├── component-diagrams.md              # Component interaction diagrams
│   └── data-flow.md                       # Data flow across the system
├── data/                                  # Phase 4: Data schemas
│   ├── state-json-schema.md
│   ├── config-yml-schema.md
│   ├── decisions-jsonl-schema.md
│   ├── manifest-yml-schema.md
│   ├── frontmatter-schema.md
│   └── lock-json-schema.md
├── api/                                   # Phase 5: API / CLI contracts
│   ├── cli-contract.md                    # All CLI commands, args, flags, exit codes
│   ├── adapter-interface.md               # Platform adapter contract (transformed)
│   └── json-output-schemas.md             # --format json envelope per command
├── ux/                                    # Phase 6: UX specification
│   ├── init-wizard-flow.md                # Wizard screens, branching, defaults
│   ├── cli-output-formats.md              # Human-readable output templates
│   ├── error-messages.md                  # Error message catalog
│   └── dashboard-spec.md                  # Dashboard HTML generation
├── tasks/                                 # Phase 7: Implementation task breakdown
│   ├── task-graph.md                      # Full task dependency graph
│   ├── phase-1-foundation.md              # Tasks for migration phase 1
│   ├── phase-2-cross-platform.md          # Tasks for migration phase 2
│   └── phase-3-new-content.md             # Tasks for migration phase 3
├── testing/                               # Phase 8: Testing & quality strategy
│   ├── test-strategy.md                   # Overall approach
│   ├── unit-test-plan.md                  # Unit test coverage plan
│   ├── integration-test-plan.md           # Integration test scenarios
│   └── acceptance-criteria.md             # Per-feature acceptance criteria
├── operations/                            # Phase 9: Operations & deployment
│   ├── release-runbook.md                 # npm + Homebrew release process
│   ├── ci-cd-pipeline.md                  # CI/CD configuration
│   └── migration-guide.md                 # v1 -> v2 user migration
├── security/                              # Phase 10: Security review
│   ├── threat-model.md
│   └── security-review.md
├── validation/                            # Validation phase outputs
│   ├── consistency-audit.md
│   ├── traceability-matrix.md
│   ├── decision-completeness.md
│   ├── critical-path-walkthrough.md
│   ├── implementability-dry-run.md
│   ├── dependency-graph-validation.md
│   └── scope-creep-check.md
├── reference/                             # Historical reference documents
│   └── scaffold-v2-spec.md               # Original v2 spec (superseded by PRD)
├── archive/                               # Superseded documents (historical reference)
│   ├── domain-models/                     # Superseded domain models (01, 04, 12)
│   ├── api/                               # Superseded API contracts (mixin-injection)
│   ├── superpowers-specs/                 # Design specs consolidated into PRD
│   └── superpowers-plans/                 # Completed implementation plans
└── final/                                 # Finalization phase
    ├── developer-onboarding.md
    └── implementation-playbook.md
```

## Naming Conventions

- All filenames: **kebab-case**, `.md` extension
- Domain model files: prefixed with two-digit number matching the domain ID (01-14)
- ADRs: prefixed with `ADR-NNN-` and a short slug
- No nested subdirectories beyond what's shown above

## Cross-Reference Convention

When one document references another, use a relative path from the `docs/v2/` root:

```
See [Pipeline State Machine](domain-models/03-pipeline-state-machine.md) for state transition details.
Decided in [ADR-003](adrs/ADR-003-state-json-map-keyed.md).
```

## Document Header Convention

Every document starts with:

```markdown
# [Title]

**Domain**: [domain-id if applicable]
**Phase**: [1-10, validation, or final]
**Depends on**: [list of prerequisite docs by relative path]
**Last updated**: [ISO date]
**Status**: [draft | review | approved | frozen]

---
```

## Workflow

### Phase 1 (Domain Modeling)
Run the domain modeling prompt for each of the 14 domains. Each produces one file in `domain-models/`. These are the foundation — all subsequent phases reference them.

### Phase 2 (ADRs)
Review domain models for decisions that need recording. Create ADRs for significant architectural choices. Update `adrs/index.md`.

### Phase 3-10
Each phase reads prior phase outputs and produces its deliverables. Later phases must not contradict earlier ones — if a conflict is found, update the earlier doc and note the change.

### Validation Phase
Seven validation exercises run against the full doc set. Each produces a findings document. Findings that require changes are tracked as action items within the validation doc.

### Finalization
Apply all validation fixes. Freeze docs (set status to `frozen`). Produce the onboarding guide and implementation playbook.

## Domain ID Reference

| ID | Domain | File | Status |
|----|--------|------|--------|
| 01 | Layered Prompt Resolution System | `domain-models/01-prompt-resolution.md` | **superseded** (ADR-041) |
| 02 | Dependency Resolution & Pipeline Ordering | `domain-models/02-dependency-resolution.md` | current |
| 03 | Pipeline State Machine | `domain-models/03-pipeline-state-machine.md` | current |
| 04 | Abstract Task Verb System | `domain-models/04-abstract-task-verbs.md` | **superseded** (ADR-041) |
| 05 | Platform Adapter System | `domain-models/05-platform-adapters.md` | **transformed** (ADR-041) |
| 06 | Config Schema & Validation System | `domain-models/06-config-validation.md` | **transformed** (ADR-041, ADR-043) |
| 07 | Brownfield Mode & scaffold adopt | `domain-models/07-brownfield-adopt.md` | current |
| 08 | Meta-Prompt Frontmatter Schema | `domain-models/08-prompt-frontmatter.md` | **transformed** (ADR-041, ADR-045) |
| 09 | CLI Command Architecture | `domain-models/09-cli-architecture.md` | **transformed** (ADR-041) |
| 10 | CLAUDE.md Management Model | `domain-models/10-claude-md-management.md` | current |
| 11 | Decision Log Lifecycle | `domain-models/11-decision-log.md` | current |
| 12 | Mixin Injection Mechanics | `domain-models/12-mixin-injection.md` | **superseded** (ADR-041) |
| 13 | Pipeline Execution Locking | `domain-models/13-pipeline-locking.md` | current |
| 14 | Init Wizard & Methodology Selection | `domain-models/14-init-wizard.md` | **transformed** (ADR-041, ADR-043) |
