# Meta-Prompt Architecture Design

**Date:** 2026-03-14
**Status:** Draft
**Scope:** Replace hard-coded prompt pipeline with meta-prompt + knowledge base architecture supporting three methodology tiers

---

## 1. Problem Statement

Scaffold v1 uses 29+ hard-coded prompts in a monolithic `prompts.md` file. The v2 design introduced a three-layer prompt resolution system (base/override/extension) with mixin injection and methodology manifests — adding architectural complexity without solving the core maintenance burden.

Two insights drive this redesign:

1. **AI can generate prompts at runtime.** Instead of maintaining detailed hard-coded prompts, we can describe the *intent* of each step and let the AI generate the appropriate working prompt based on project context and methodology depth.

2. **Users need methodology tiers.** Not every project needs the same level of documentation rigor. A solo hackathon project and a complex enterprise system should go through fundamentally different levels of preparation.

## 2. Architecture Overview

### Three Core Components

**Meta-Prompts** — One per pipeline step (32 files). Each is a compact declaration (30-80 lines) of what the step should accomplish: purpose, inputs, outputs, quality criteria, and methodology-scaling rules. They do NOT contain the actual prompt text the AI executes.

**Knowledge Base** — Domain expertise organized by topic (32 files). Contains what makes a good PRD, how to review an architecture document, what failure modes to check in API contracts, etc. Reusable across steps — multiple meta-prompts can reference the same knowledge entry.

**Methodology Configuration** — Controls which pipeline steps are active and the depth level (1-5) for each. Three presets: Deep Domain Modeling (all steps, depth 5), MVP (minimal steps, depth 1), Custom (user picks steps and depth per step).

### How They Interact at Runtime

```
User invokes a pipeline step
  -> CLI loads the meta-prompt for that step
  -> CLI gathers project context (prior artifacts, config, decisions)
  -> CLI loads relevant knowledge base entries (from meta-prompt frontmatter)
  -> CLI loads user instructions (global, per-step, and inline)
  -> CLI assembles everything into a single prompt
  -> AI generates a working prompt tailored to project + methodology
  -> AI executes the working prompt, producing output artifacts
  -> CLI updates pipeline state
```

### What This Replaces from v2

- Three-layer prompt resolution (domain model 01) -> replaced by meta-prompt + knowledge base
- Mixin injection (domain model 12) -> unnecessary; AI adapts natively
- Methodology manifests with overrides/extensions -> replaced by methodology YAML presets
- Abstract task verb markers (domain model 04) -> unnecessary; AI knows tool preferences from config
- Hard-coded prompt text in `prompts.md` and `commands/` -> replaced by meta-prompts

### What This Keeps from v2

- Dependency resolution & pipeline ordering (domain model 02)
- Pipeline state machine (domain model 03)
- Brownfield mode / scaffold adopt (domain model 07)
- CLAUDE.md management (domain model 10)
- Decision log lifecycle (domain model 11)
- Pipeline execution locking (domain model 13)
- CLI command architecture (domain model 09, modified)
- Config schema (domain model 06, simplified)
- Prompt frontmatter (domain model 08, rewritten for meta-prompts)
- Init wizard (domain model 14, simplified)
- Platform adapter (domain model 05, simplified)

## 3. Meta-Prompt Structure

Each meta-prompt is a markdown file with YAML frontmatter and a structured body.

### Frontmatter Schema

```yaml
---
name: string                     # Step identifier (e.g., "phase-03-system-architecture")
description: string              # One-line purpose
phase: string                    # Pipeline phase (pre, 1-10, validation, finalization)
dependencies: string[]           # Steps that must complete first
outputs: string[]                # Artifact paths this step produces
conditional: string | null       # "if-needed" or null; see Conditional Step Evaluation
knowledge-base: string[]         # Knowledge entries to load during assembly
---
```

### Conditional Step Evaluation

Steps marked `conditional: "if-needed"` (phases 4, 5, 6 and their reviews) are evaluated in two ways:

1. **Init wizard detection:** During `scaffold init`, the wizard examines project signals (existing database files, API routes, frontend frameworks, `project.platforms` config) and pre-sets conditional steps to enabled or disabled in `.scaffold/config.yml`.
2. **User override:** Users can always manually enable or disable conditional steps via config, regardless of what the wizard detected. The wizard's detection is a suggestion, not a constraint.

Conditional steps that are disabled are skipped during `scaffold next` and `scaffold run` but remain visible in `scaffold list` (marked as skipped). Users can enable them later and run them at any point.

### Body Sections

```markdown
## Purpose
What this step accomplishes and why it matters.

## Inputs
- artifact-path (required|optional) -- what it provides

## Expected Outputs
- artifact-path -- what gets produced

## Quality Criteria
Methodology-independent definition of "good" output.
These criteria apply regardless of depth level.

## Methodology Scaling
- **deep**: Specific guidance for depth 5 output
- **mvp**: Specific guidance for depth 1 output
- **custom:depth(1-5)**: How to interpolate between extremes

## Mode Detection
Instructions for handling re-runs on existing artifacts.
```

### Example: System Architecture Meta-Prompt

```yaml
---
name: phase-03-system-architecture
description: Design and document system architecture
phase: "3"
dependencies: [phase-02-adrs]
outputs: [docs/system-architecture.md]
knowledge-base: [system-architecture]
---
```

```markdown
## Purpose
Design and document the system architecture, translating domain models
and ADR decisions into a concrete component structure, data flows,
and module organization.

## Inputs
- docs/domain-models/ (required) -- domain models from phase 1
- docs/adrs/ (required) -- architecture decisions from phase 2
- docs/prd.md (required) -- requirements driving architecture

## Expected Outputs
- docs/system-architecture.md -- architecture document with component
  design, data flows, module structure, and extension points

## Quality Criteria
- Every domain model lands in a component or module
- Every ADR constraint is respected in the architecture
- All components appear in at least one data flow diagram
- Extension points are both documented and designed (not just listed)

## Methodology Scaling
- **deep**: Full architecture document. Component diagrams, data flow
  diagrams, module structure with file-level detail, state management
  design, extension point inventory, deployment topology.
- **mvp**: High-level component overview. Key data flows. Enough
  structure for an agent to start building without ambiguity.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add component
  diagrams and module boundaries. Depth 4-5: full architecture approach.

## Mode Detection
If outputs already exist, operate in update mode: read existing content,
diff against current project state and new ADRs, propose targeted
updates rather than regenerating.
```

### What Is NOT in a Meta-Prompt

- The actual prompt text the AI executes
- Tool-specific commands (no `bd create`, no `gh issue`)
- Platform-specific formatting
- Detailed domain knowledge (that belongs in the knowledge base)

## 4. Knowledge Base

### Design Principles

- **Topic-organized, not step-organized.** A knowledge entry like `decision-documentation.md` gets referenced by multiple meta-prompts. No duplication.
- **Methodology-independent.** Entries describe what "good" looks like in general. The meta-prompt's scaling rules determine how much to apply.
- **Maintained independently.** Improving domain knowledge improves every methodology automatically without touching meta-prompts.

### Knowledge Base Entry Format

```yaml
---
name: string                     # Entry identifier
description: string              # One-line description
topics: string[]                 # Discoverability tags
---
```

Followed by markdown content organized into sections covering expertise, patterns, pitfalls, and criteria relevant to the topic.

### Complete Knowledge Base Inventory (32 documents)

#### Core Domain Expertise (10)

| Document | Purpose |
|----------|---------|
| `core/domain-modeling.md` | Identifying domains, bounded contexts, entities, aggregates, domain events, invariants. DDD tactical and strategic patterns. |
| `core/adr-craft.md` | Writing effective ADRs. What decisions warrant recording, evaluation criteria, status lifecycle. Includes technology selection decisions (language, framework, database, infrastructure) as a key ADR category. |
| `core/system-architecture.md` | Architecture patterns (layered, hexagonal, event-driven, microservices). Component design, integration, scalability, resilience. Includes project directory structure and module organization. |
| `core/database-design.md` | Schema design principles, normalization trade-offs, indexing strategies, migration patterns, data modeling from domain models. |
| `core/api-design.md` | REST/GraphQL design, versioning, error contracts, pagination, auth patterns, API-first development. |
| `core/ux-specification.md` | UX documentation patterns, wireframe-to-spec, interaction flows, accessibility, responsive design, component architecture. Includes design system definition (tokens, components, patterns). |
| `core/task-decomposition.md` | Breaking architecture into implementable tasks. Dependency identification, sizing, parallelization, critical path. Includes deriving tasks from user stories. |
| `core/testing-strategy.md` | Test pyramid, coverage strategies by layer, testing patterns, quality gates, performance testing. |
| `core/operations-runbook.md` | CI/CD pipeline design, deployment strategies, monitoring/alerting, incident response, rollback procedures. Includes dev environment setup and local development workflow. |
| `core/security-review.md` | OWASP top 10, auth/authz patterns, data protection, secrets management, dependency auditing, threat modeling. |

#### Phase-Specific Review Expertise (11)

Each review knowledge base entry encodes the specific failure modes and multi-pass review criteria for its artifact type. These are NOT generic checklists — each targets the known ways that specific artifact type fails.

| Document | Key Failure Modes |
|----------|-------------------|
| `review/review-methodology.md` | How to structure multi-pass reviews, prioritize findings, write fix plans, re-validate. (Shared process, not shared content.) |
| `review/review-domain-modeling.md` | Bounded context boundary leaks, missing aggregates, entity vs. value object misclassification, incomplete domain event flows, invariant gaps, ubiquitous language inconsistencies, cross-domain relationship ambiguities. |
| `review/review-adr.md` | Contradictory decisions, missing rationale, implied-but-unrecorded decisions, unresolved trade-offs. |
| `review/review-system-architecture.md` | Domain coverage gaps, ADR constraint violations, data flow orphans, module structure issues, state inconsistencies, diagram/prose drift, extension point integrity, downstream readiness. |
| `review/review-database-schema.md` | Entity coverage from domain models, normalization vs. access patterns, index coverage for known queries, migration safety, referential integrity vs. domain invariants. |
| `review/review-api-contracts.md` | Operation coverage vs. domain model, error contract completeness, auth/authz coverage, versioning consistency with ADRs, payload shape vs. domain entities, idempotency gaps. |
| `review/review-ux-spec.md` | User journey coverage vs. PRD, accessibility gaps, interaction state completeness, component hierarchy vs. design system, responsive breakpoint coverage, error state handling. |
| `review/review-implementation-tasks.md` | Coverage gaps vs. architecture, missing dependencies, tasks too large/vague for agents, critical path accuracy, parallelization assumptions. |
| `review/review-testing-strategy.md` | Coverage gaps by layer, missing edge cases from domain invariants, test environment assumptions, performance test coverage vs. NFRs, missing integration boundaries. |
| `review/review-operations.md` | Deployment strategy gaps, missing rollback procedures, monitoring blind spots, alerting threshold rationale, missing runbook scenarios, DR coverage. |
| `review/review-security.md` | OWASP coverage gaps, auth/authz boundary mismatches vs. API contracts, secrets management gaps, dependency audit coverage, missing threat model scenarios, data classification gaps. |

#### Validation Expertise (7)

| Document | Purpose |
|----------|---------|
| `validation/cross-phase-consistency.md` | Auditing consistency across phases — naming, assumptions, data flows, interface contracts. |
| `validation/traceability.md` | Building traceability matrices from requirements through architecture to tasks. |
| `validation/decision-completeness.md` | Verifying all architectural decisions are recorded, justified, and non-contradictory. |
| `validation/critical-path-analysis.md` | Walking through critical user journeys end-to-end across all specs. |
| `validation/implementability-review.md` | Dry-running specs as if you were the implementing agent — catching ambiguity and missing detail. |
| `validation/dependency-validation.md` | Verifying dependency graphs are acyclic, complete, and correctly ordered. |
| `validation/scope-management.md` | Detecting scope creep, ensuring specs stay aligned to PRD boundaries. |

#### Product & Finalization Expertise (4)

| Document | Purpose |
|----------|---------|
| `product/prd-craft.md` | What makes a good PRD. Problem framing, feature scoping, success criteria, competitive context. |
| `product/gap-analysis.md` | Systematic approaches to finding gaps in requirements and specifications. |
| `finalization/developer-onboarding.md` | What an effective onboarding guide covers — repo setup, architecture overview, key patterns. |
| `finalization/implementation-playbook.md` | Structuring work for AI agents — task ordering, context needed, handoff format, success criteria. Includes coding standards, git workflow (branching, PR strategy), and all conventions agents must follow. |

### What Goes In vs. Stays Out

- **In:** Domain expertise, quality patterns, common pitfalls, evaluation frameworks, failure modes
- **Out:** Project-specific context (comes from artifacts at runtime), tool-specific commands (AI handles), scaffold's own architectural decisions (stay in ADRs)

### Source Material

Knowledge base content is extracted from:
1. **Current prompts.md** — Hard-coded prompts contain deep domain knowledge about what each artifact should look like. Extract "what good looks like" content; discard execution instructions.
2. **V2 domain models being retired** (01, 04, 12) — May contain domain insights worth preserving even though the architectural model is retired.
3. **New expertise documents** — Created specifically for phases and review criteria not covered by existing sources, particularly the Deep Domain Modeling phases and their specific review failure modes.

Existing v1 docs (coding-standards.md, tdd-standards.md, git-workflow.md) are NOT sources — each project generates its own via the pipeline.

## 5. Methodology System

### Three Presets

| | Deep Domain Modeling | MVP | Custom |
|---|---|---|---|
| **Who it's for** | Teams building complex/long-lived systems | Solo devs, hackathons, proofs of concept | Everyone else |
| **Steps** | All steps active | Minimal subset | User chooses |
| **Depth** | 5 (maximum) at every step | 1 (minimum) at every step | User sets per step (1-5) |
| **Output volume** | Comprehensive docs, full analysis | Lean docs, just enough to start | Varies |

### Depth Scale (1-5)

- **1 (MVP floor):** Minimum viable artifact. Core decisions only, no alternatives analysis, brief rationale.
- **2:** Key trade-offs noted but not explored in depth.
- **3 (Balanced):** Solid documentation. Alternatives considered for major decisions. Team-onboardable.
- **4:** Thorough analysis. Edge cases, risk assessment, detailed rationale.
- **5 (Deep ceiling):** Comprehensive. Full evaluation matrices, domain modeling, gap analysis, migration paths, operational considerations.

### MVP Default Steps

Enabled:
- create-prd (depth 1)
- phase-07-implementation-tasks (depth 1)
- phase-08-testing-strategy (depth 1)
- implementation-playbook (depth 1)

Skipped by default (all review, validation, and finalization steps except implementation-playbook):
- prd-gap-analysis, all phases 1-6, all review phases, all validation steps, operations, security, developer-onboarding-guide, apply-fixes-and-freeze

### Configuration Format

```yaml
# .scaffold/config.yml
version: 2
methodology: deep | mvp | custom

# Only when methodology: custom
custom:
  default_depth: 3
  steps:
    create-prd:
      enabled: true
      depth: 4
    prd-gap-analysis:
      enabled: false
    phase-03-system-architecture:
      enabled: true
      depth: 2
    # Steps not listed inherit defaults

platforms: [claude-code]
project:
  name: "My Project"
  platforms: [web, mobile]       # Informs conditional steps
```

### Methodology is Changeable

Starting MVP doesn't lock you in. Users can re-run any step at a higher depth, enable previously skipped steps, or switch methodologies entirely. The pipeline state tracks what's completed; re-running at higher depth triggers update mode.

## 6. Complete Pipeline

### Pipeline Goal

Get the user from idea to the point where AI agents can begin implementation with comprehensive context.

### Pre-Pipeline: Project Definition
- **create-prd** — Product requirements document
- **prd-gap-analysis** — Find gaps in requirements

### Phase 1: Domain Modeling
- **phase-01-domain-modeling** — Deep domain modeling across all identified project domains (entities, aggregates, bounded contexts, domain events, invariants)
- **phase-01a-review-domain-modeling** — Review domain models for completeness, consistency, and downstream readiness

### Phases 2-10: Core Documentation (each with review)

| Phase | Step | Review Step | Conditional |
|-------|------|-------------|-------------|
| 2 | Architecture Decision Records | 2a: Review ADRs | No |
| 3 | System Architecture Document | 3a: Review Architecture | No |
| 4 | Database Schema Design | 4a: Review Database | if-needed |
| 5 | API Contract Specification | 5a: Review API | if-needed |
| 6 | UI/UX Specification | 6a: Review UX | if-needed |
| 7 | Implementation Task Breakdown | 7a: Review Tasks | No |
| 8 | Testing & Quality Strategy | 8a: Review Testing | No |
| 9 | Operations & Deployment Runbook | 9a: Review Operations | No |
| 10 | Security Review and Document | 10a: Review Security | No |

### Review Phase Pattern

Each review phase (1a through 10a) has its own meta-prompt and its own knowledge base entry encoding failure modes specific to that artifact type. Reviews are NOT generic — each targets the known ways that specific artifact type fails.

Example: Phase 3a (System Architecture Review) uses multi-pass review with passes for domain model coverage in components, ADR constraint compliance, data flow completeness, module structure integrity, state consistency, diagram/prose drift, extension point verification, invariant verification, downstream readiness, and internal consistency.

Each review:
1. Re-reads all artifacts from the phase
2. Checks against quality criteria from the phase's meta-prompt
3. Checks cross-references to prior phases' artifacts
4. Runs failure-mode-specific passes from the knowledge base
5. Identifies gaps, inconsistencies, ambiguities
6. Produces a prioritized issues list
7. Creates a fix plan
8. Executes fixes
9. Re-validates

### Validation Phase
1. **Cross-Phase Consistency Audit** — Naming, assumptions, data flows, interface contracts across all phases
2. **Traceability Matrix** — Requirements through architecture to tasks
3. **Decision Completeness Check** — All decisions recorded, justified, non-contradictory
4. **Critical Path Walkthrough** — Critical user journeys end-to-end across all specs
5. **Implementability Dry Run** — Specs dry-run as if you were the implementing agent
6. **Dependency Graph Validation** — Acyclic, complete, correctly ordered
7. **Scope Creep Check** — Specs aligned to PRD boundaries

### Finalization Phase
1. **Apply Validation Fixes and Freeze Docs** — Address validation findings, mark docs as frozen
2. **Developer Onboarding Guide** — Repo setup, architecture overview, key patterns
3. **Implementation Playbook** — Task ordering, context for agents, handoff format, success criteria

-> **Hand off to AI agents for implementation**

## 7. Pipeline Execution Flow

### Step Execution Sequence

```
1. User invokes step
   scaffold run <step> [--instructions "..."]

2. CLI checks prerequisites
   - Pipeline state: completed? (offer re-run in update mode)
   - Dependencies: prior steps completed?
   - Lock: another step running?

3. CLI assembles the generation prompt
   - Load meta-prompt (pipeline/<step>.md)
   - Load knowledge base entries (from frontmatter refs)
   - Gather project context:
     - Completed artifacts (docs/*.md, etc.)
     - .scaffold/config.yml (methodology, depth)
     - .scaffold/state.json (completion status)
     - .scaffold/decisions.jsonl (prior decisions)
   - Load user instructions:
     - .scaffold/instructions/global.md (if exists)
     - .scaffold/instructions/<step>.md (if exists)
     - --instructions flag value (if provided)
   - Determine depth level for this step

4. CLI constructs assembled prompt
   - System section: role and task framing
   - Meta-prompt section: purpose, inputs, outputs, quality criteria
   - Knowledge base section: relevant domain expertise
   - Context section: project artifacts and state
   - Methodology section: depth level + scaling guidance
   - Instructions section: global + per-step + inline
   - Instruction: "Generate the working prompt, then execute it."

5. AI generates and executes
   - Reads assembled prompt
   - Generates working prompt tailored to project + methodology + instructions
   - Executes it, producing output artifact(s)

6. CLI updates state
   - Mark step completed in state.json
   - Record decisions in decisions.jsonl
   - Show next available step(s)
```

### User Instructions (Three Layers)

Users can inject additional guidance at three levels, all optional:

1. **Inline (one-off):** `scaffold run <step> --instructions "Use hexagonal architecture"`
2. **Per-step (persistent):** `.scaffold/instructions/<step-name>.md`
3. **Global (persistent):** `.scaffold/instructions/global.md`

Assembly order (lower overrides higher on conflict):
```
Meta-prompt + Knowledge base + Project context
  + Global instructions
    + Per-step instructions
      + Inline instructions
```

### Platform Delivery

The assembled prompt is platform-neutral. Delivery adapters wrap it:

- **Claude Code plugin:** Command files trigger assembly and pass result to Claude
- **Codex:** AGENTS.md entries point to assembly pipeline
- **Universal/Manual:** `scaffold run <step>` outputs assembled prompt to stdout or file

### Generate-Then-Execute

The assembled prompt instructs the AI to generate a working prompt and then execute it in a single turn. This is intentional — the meta-prompt's quality criteria and the knowledge base's domain expertise provide sufficient guardrails that a separate "review the generated prompt" step would add friction without meaningfully improving output quality. The assembled prompt's structure (system section, meta-prompt section, knowledge section, context section, methodology section, instructions section) gives the AI enough scaffolding to produce a well-structured working prompt without an intermediate approval gate.

### Update Mode

When a step is re-run on existing artifacts, the assembled prompt includes the existing artifact as additional context, and the meta-prompt's mode detection section instructs the AI to diff and propose targeted updates.

## 8. File & Directory Structure

```
scaffold/
  pipeline/                           # Meta-prompts (one per step)
    pre/
      create-prd.md
      prd-gap-analysis.md
    phase-01-domain-modeling.md
    phase-01a-review-domain-modeling.md
    phase-02-adrs.md
    phase-02a-review-adrs.md
    phase-03-system-architecture.md
    phase-03a-review-architecture.md
    phase-04-database-schema.md
    phase-04a-review-database.md
    phase-05-api-contracts.md
    phase-05a-review-api.md
    phase-06-ux-spec.md
    phase-06a-review-ux.md
    phase-07-implementation-tasks.md
    phase-07a-review-tasks.md
    phase-08-testing-strategy.md
    phase-08a-review-testing.md
    phase-09-operations.md
    phase-09a-review-operations.md
    phase-10-security.md
    phase-10a-review-security.md
    validation/
      cross-phase-consistency.md
      traceability-matrix.md
      decision-completeness.md
      critical-path-walkthrough.md
      implementability-dry-run.md
      dependency-graph-validation.md
      scope-creep-check.md
    finalization/
      apply-fixes-and-freeze.md
      developer-onboarding-guide.md
      implementation-playbook.md

  knowledge/                          # Domain expertise
    core/
      domain-modeling.md
      adr-craft.md
      system-architecture.md
      database-design.md
      api-design.md
      ux-specification.md
      task-decomposition.md
      testing-strategy.md
      operations-runbook.md
      security-review.md
    review/
      review-methodology.md
      review-domain-modeling.md
      review-adr.md
      review-system-architecture.md
      review-database-schema.md
      review-api-contracts.md
      review-ux-spec.md
      review-implementation-tasks.md
      review-testing-strategy.md
      review-operations.md
      review-security.md
    validation/
      cross-phase-consistency.md
      traceability.md
      decision-completeness.md
      critical-path-analysis.md
      implementability-review.md
      dependency-validation.md
      scope-management.md
    product/
      prd-craft.md
      gap-analysis.md
    finalization/
      developer-onboarding.md
      implementation-playbook.md

  methodology/                        # Methodology presets
    deep.yml
    mvp.yml
    custom-defaults.yml

  commands/                           # Generated plugin wrappers (thin)
  docs/v2/                            # Existing v2 docs (audit applies)
  prompts.md                          # v1 legacy (extraction source)
```

### Methodology Preset Format

```yaml
# methodology/deep.yml
name: Deep Domain Modeling
description: Comprehensive documentation for complex systems
default_depth: 5

steps:
  create-prd: { enabled: true }
  prd-gap-analysis: { enabled: true }
  phase-01-domain-modeling: { enabled: true }
  phase-01a-review-domain-modeling: { enabled: true }
  phase-02-adrs: { enabled: true }
  phase-02a-review-adrs: { enabled: true }
  phase-03-system-architecture: { enabled: true }
  phase-03a-review-architecture: { enabled: true }
  phase-04-database-schema: { enabled: true, conditional: "if-needed" }
  phase-04a-review-database: { enabled: true, conditional: "if-needed" }
  phase-05-api-contracts: { enabled: true, conditional: "if-needed" }
  phase-05a-review-api: { enabled: true, conditional: "if-needed" }
  phase-06-ux-spec: { enabled: true, conditional: "if-needed" }
  phase-06a-review-ux: { enabled: true, conditional: "if-needed" }
  phase-07-implementation-tasks: { enabled: true }
  phase-07a-review-tasks: { enabled: true }
  phase-08-testing-strategy: { enabled: true }
  phase-08a-review-testing: { enabled: true }
  phase-09-operations: { enabled: true }
  phase-09a-review-operations: { enabled: true }
  phase-10-security: { enabled: true }
  phase-10a-review-security: { enabled: true }
  cross-phase-consistency: { enabled: true }
  traceability-matrix: { enabled: true }
  decision-completeness: { enabled: true }
  critical-path-walkthrough: { enabled: true }
  implementability-dry-run: { enabled: true }
  dependency-graph-validation: { enabled: true }
  scope-creep-check: { enabled: true }
  apply-fixes-and-freeze: { enabled: true }
  developer-onboarding-guide: { enabled: true }
  implementation-playbook: { enabled: true }
```

```yaml
# methodology/mvp.yml
name: MVP
description: Get to code fast with minimal ceremony
default_depth: 1

steps:
  create-prd: { enabled: true }
  prd-gap-analysis: { enabled: false }
  phase-01-domain-modeling: { enabled: false }
  phase-01a-review-domain-modeling: { enabled: false }
  phase-02-adrs: { enabled: false }
  phase-02a-review-adrs: { enabled: false }
  phase-03-system-architecture: { enabled: false }
  phase-03a-review-architecture: { enabled: false }
  phase-04-database-schema: { enabled: false }
  phase-04a-review-database: { enabled: false }
  phase-05-api-contracts: { enabled: false }
  phase-05a-review-api: { enabled: false }
  phase-06-ux-spec: { enabled: false }
  phase-06a-review-ux: { enabled: false }
  phase-07-implementation-tasks: { enabled: true }
  phase-07a-review-tasks: { enabled: false }
  phase-08-testing-strategy: { enabled: true }
  phase-08a-review-testing: { enabled: false }
  phase-09-operations: { enabled: false }
  phase-09a-review-operations: { enabled: false }
  phase-10-security: { enabled: false }
  phase-10a-review-security: { enabled: false }
  cross-phase-consistency: { enabled: false }
  traceability-matrix: { enabled: false }
  decision-completeness: { enabled: false }
  critical-path-walkthrough: { enabled: false }
  implementability-dry-run: { enabled: false }
  dependency-graph-validation: { enabled: false }
  scope-creep-check: { enabled: false }
  apply-fixes-and-freeze: { enabled: false }
  developer-onboarding-guide: { enabled: false }
  implementation-playbook: { enabled: true }
```

## 9. V2 Documentation Audit

### Domain Models

| # | Domain | Verdict | Rationale |
|---|--------|---------|-----------|
| 01 | Layered Prompt Resolution | **Retire** | Replaced by meta-prompt + knowledge base |
| 02 | Dependency Resolution | **Keep** | Steps still have dependencies; Kahn's algorithm still valid |
| 03 | Pipeline State Machine | **Keep** | Still tracking completion, crash recovery, resumption |
| 04 | Abstract Task Verb System | **Retire** | AI knows tool preferences from config; no markers needed |
| 05 | Platform Adapter System | **Transform** | Simplified to thin delivery wrappers |
| 06 | Config Schema | **Transform** | Simplified; mixin axes removed, methodology + depth added |
| 07 | Brownfield Mode | **Keep** | Artifact detection unchanged |
| 08 | Prompt Frontmatter | **Transform** | Rewritten for meta-prompt frontmatter; section targeting removed |
| 09 | CLI Command Architecture | **Transform** | Core structure kept; commands updated (add `run`, remove `add`) |
| 10 | CLAUDE.md Management | **Keep** | Orthogonal to meta-prompts |
| 11 | Decision Log Lifecycle | **Keep** | Unchanged |
| 12 | Mixin Injection | **Retire** | Completely replaced by AI adaptation |
| 13 | Pipeline Execution Locking | **Keep** | Unchanged |
| 14 | Init Wizard | **Transform** | Methodology selection instead of mixin configuration |

**Summary: 3 retire, 6 keep, 5 transform**

### ADRs

**Keep:** ADR-001 (Node.js), ADR-002 (distribution), ADR-003 (standalone CLI), ADR-004 (methodology as top-level organizer — principle preserved, mechanism amended), ADR-009 (Kahn's algorithm), ADR-012 (state.json), ADR-013 (decisions.jsonl), ADR-018 (completion detection), ADR-019 (advisory locking), ADR-021 (sequential execution), ADR-025 (CLI output contract), ADR-036 (--auto != --force), plus others tied to kept domain models.

**Supersede:** ADR-005 (three-layer resolution), ADR-006 (mixin injection), ADR-007 (mixin markers), ADR-010 (build-time resolution — fully superseded by runtime assembly), ADR-015 (prompt frontmatter), ADR-016 (methodology manifest format — replaced by simplified methodology presets).

**New ADRs needed:**
- Meta-prompt architecture over hard-coded prompts
- Knowledge base as domain expertise layer
- Depth scale (1-5) over methodology-specific prompt variants
- Runtime prompt generation over build-time prompt resolution
- Assembled prompt structure
- Phase-specific review criteria over generic review template

### Domain Model Transformations

**05 Platform Adapter -> Simplified Delivery Wrappers:** Adapter no longer transforms prompt content. It wraps the assembly trigger in platform-specific format (Claude Code command files, Codex AGENTS.md entries, stdout for manual use).

**06 Config Schema -> Simplified:** Mixin axes removed. New schema: `version`, `methodology` (deep|mvp|custom), `custom` block (default_depth + per-step overrides), `platforms`, `project` metadata.

**08 Prompt Frontmatter -> Meta-Prompt Frontmatter:** New fields: `name`, `description`, `phase`, `dependencies`, `outputs`, `conditional`, `knowledge-base`. Removed: mixin markers, section targeting.

**09 CLI Commands -> Updated:** Added: `scaffold run <step> [--instructions "..."]`. Removed: `scaffold add <axis> <value>`. Modified: `scaffold build` (generates command wrappers from meta-prompts), `scaffold init` (methodology wizard). Kept: `scaffold status`, `scaffold next`, `scaffold skip`, `scaffold list`, `scaffold validate`, `scaffold info`, `scaffold version`, `scaffold update`, `scaffold dashboard`, `scaffold decisions`, `scaffold adopt`, `scaffold reset`.

**14 Init Wizard -> Methodology-Focused:** Asks methodology (Deep/MVP/Custom). For Custom: presents step list with toggle and depth. Detects existing project files to suggest conditional steps (database? API? UI?). Writes `.scaffold/config.yml`.

## 10. Migration & Compatibility

### From v1

The v1 `prompts.md` and `commands/` directory serve as source material for:
1. Extracting domain knowledge into knowledge base entries
2. Understanding the pipeline step inventory
3. Preserving the mode detection pattern

They are not carried forward as-is.

### From v2 Docs

The v2 documentation represents significant design thinking. Per the audit:
- 6 domain models are kept with minor terminology updates
- 5 domain models are transformed to match the new architecture
- 3 domain models are retired (their concepts are no longer needed)
- ADRs are kept, superseded, or supplemented as documented above

### The `.scaffold/` Directory

The new architecture introduces a `.scaffold/` directory in target projects (created by `scaffold init`), containing `config.yml`, `state.json`, `decisions.jsonl`, `instructions/`, and `lock.json`. This directory does not exist in v1 projects. Migration from v1 requires running `scaffold init` or `scaffold adopt` to create it.

### Plugin Compatibility

The `commands/` directory continues to serve as the plugin delivery mechanism. Command files become thin wrappers that trigger the assembly pipeline rather than containing hard-coded prompt text. The `.claude-plugin/plugin.json` manifest format is unchanged.

## 11. Implementation Scope

### New Artifacts to Create

- **32 meta-prompt files** in `pipeline/`
- **32 knowledge base documents** in `knowledge/`
- **3 methodology preset files** in `methodology/`
- **~6 new ADRs** documenting architectural decisions
- **5 transformed domain models** (updates to existing files)
- **Updated CLI commands** (modifications to domain model 09)
- **Updated config schema** (modifications to domain model 06)
- **Assembly engine** (CLI code that loads meta-prompt + knowledge + context + instructions and constructs the assembled prompt)

### Artifacts to Retire

- **3 domain models** (01, 04, 12 — mark as superseded, do not delete)
- **~6 superseded ADRs** (mark status as superseded with pointer to replacement)
- **Hard-coded prompt content** in `prompts.md` (preserved as historical reference)

### v1 Project Setup Steps: Folded Into Existing Phases

The v1 pipeline includes project-setup steps that are not separate phases in the new pipeline. Instead, they are folded into the phases where they naturally belong:

| v1 Step | Folded Into | Rationale |
|---------|-------------|-----------|
| Tech Stack | Phase 2: ADRs | Technology choices are architectural decisions |
| Coding Standards | Finalization: Implementation Playbook | Agents need these at implementation time; the playbook is their reference |
| Project Structure | Phase 3: System Architecture | Directory layout is part of architecture |
| Dev Environment Setup | Phase 9: Operations & Deployment Runbook | Dev env is an operational concern |
| Git Workflow | Finalization: Implementation Playbook | Agents need branching/PR strategy when they start work |
| Design System | Phase 6: UI/UX Specification | Design system is part of UX spec (conditional, if-needed) |
| User Stories | Phase 7: Implementation Task Breakdown | Stories inform and become tasks |

The knowledge base entries for these phases must include domain expertise covering these folded-in concerns. For example, `core/adr-craft.md` must cover technology selection decisions, and `finalization/implementation-playbook.md` must cover coding standards and git workflow as part of the agent handoff.

### Key Risk

The knowledge base documents are the highest-effort, highest-value artifacts. The quality of the entire system depends on the domain expertise encoded in these 30 files. They should be written with the same rigor as the v2 domain models — these are not summaries or checklists, they are comprehensive domain expertise documents.
