# Meta-Prompt Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace scaffold's hard-coded prompt pipeline with a meta-prompt + knowledge base architecture supporting three methodology tiers (Deep Domain Modeling, MVP, Custom).

**Architecture:** Meta-prompts declare step intent (30-80 lines each). Knowledge base provides domain expertise. At runtime, the CLI assembles meta-prompt + knowledge + project context + user instructions into a single prompt, and the AI generates and executes the working prompt. Methodology presets control which steps are active and at what depth (1-5).

**Tech Stack:** Markdown (meta-prompts, knowledge base), YAML (methodology presets, ADR frontmatter)

**Spec:** `docs/superpowers/specs/2026-03-14-meta-prompt-architecture-design.md`

**Scope:** This plan covers **content authoring only** — meta-prompts, knowledge base, methodology presets, ADRs, and domain model updates. The assembly engine (CLI code that loads and assembles prompts at runtime) and CLI command updates are separate implementation plans that depend on these content artifacts existing first.

---

## File Structure

### New Files (67 total)

**pipeline/** — 32 meta-prompt files
```
pipeline/pre/create-prd.md
pipeline/pre/prd-gap-analysis.md
pipeline/phase-01-domain-modeling.md
pipeline/phase-01a-review-domain-modeling.md
pipeline/phase-02-adrs.md
pipeline/phase-02a-review-adrs.md
pipeline/phase-03-system-architecture.md
pipeline/phase-03a-review-architecture.md
pipeline/phase-04-database-schema.md
pipeline/phase-04a-review-database.md
pipeline/phase-05-api-contracts.md
pipeline/phase-05a-review-api.md
pipeline/phase-06-ux-spec.md
pipeline/phase-06a-review-ux.md
pipeline/phase-07-implementation-tasks.md
pipeline/phase-07a-review-tasks.md
pipeline/phase-08-testing-strategy.md
pipeline/phase-08a-review-testing.md
pipeline/phase-09-operations.md
pipeline/phase-09a-review-operations.md
pipeline/phase-10-security.md
pipeline/phase-10a-review-security.md
pipeline/validation/cross-phase-consistency.md
pipeline/validation/traceability-matrix.md
pipeline/validation/decision-completeness.md
pipeline/validation/critical-path-walkthrough.md
pipeline/validation/implementability-dry-run.md
pipeline/validation/dependency-graph-validation.md
pipeline/validation/scope-creep-check.md
pipeline/finalization/apply-fixes-and-freeze.md
pipeline/finalization/developer-onboarding-guide.md
pipeline/finalization/implementation-playbook.md
```

**knowledge/** — 32 knowledge base documents
```
knowledge/core/domain-modeling.md
knowledge/core/adr-craft.md
knowledge/core/system-architecture.md
knowledge/core/database-design.md
knowledge/core/api-design.md
knowledge/core/ux-specification.md
knowledge/core/task-decomposition.md
knowledge/core/testing-strategy.md
knowledge/core/operations-runbook.md
knowledge/core/security-review.md
knowledge/review/review-methodology.md
knowledge/review/review-domain-modeling.md
knowledge/review/review-adr.md
knowledge/review/review-system-architecture.md
knowledge/review/review-database-schema.md
knowledge/review/review-api-contracts.md
knowledge/review/review-ux-spec.md
knowledge/review/review-implementation-tasks.md
knowledge/review/review-testing-strategy.md
knowledge/review/review-operations.md
knowledge/review/review-security.md
knowledge/validation/cross-phase-consistency.md
knowledge/validation/traceability.md
knowledge/validation/decision-completeness.md
knowledge/validation/critical-path-analysis.md
knowledge/validation/implementability-review.md
knowledge/validation/dependency-validation.md
knowledge/validation/scope-management.md
knowledge/product/prd-craft.md
knowledge/product/gap-analysis.md
knowledge/finalization/developer-onboarding.md
knowledge/finalization/implementation-playbook.md
```

**methodology/** — 3 preset files
```
methodology/deep.yml
methodology/mvp.yml
methodology/custom-defaults.yml
```

### Modified Files (8 domain models)

```
docs/v2/domain-models/01-prompt-resolution.md      # Mark as superseded
docs/v2/domain-models/04-abstract-task-verbs.md     # Mark as superseded
docs/v2/domain-models/12-mixin-injection.md         # Mark as superseded
docs/v2/domain-models/05-platform-adapters.md       # Transform
docs/v2/domain-models/06-config-validation.md           # Transform
docs/v2/domain-models/08-prompt-frontmatter.md      # Transform
docs/v2/domain-models/09-cli-architecture.md        # Transform
docs/v2/domain-models/14-init-wizard.md             # Transform
```

### New ADRs (6 files)

```
docs/v2/adrs/ADR-041-meta-prompt-architecture.md
docs/v2/adrs/ADR-042-knowledge-base-layer.md
docs/v2/adrs/ADR-043-depth-scale.md
docs/v2/adrs/ADR-044-runtime-prompt-generation.md
docs/v2/adrs/ADR-045-assembled-prompt-structure.md
docs/v2/adrs/ADR-046-phase-specific-reviews.md
```

---

## Chunk 1: Foundation & Configuration

### Task 1: Create Directory Structure

**Files:**
- Create: `pipeline/pre/`, `pipeline/validation/`, `pipeline/finalization/`
- Create: `knowledge/core/`, `knowledge/review/`, `knowledge/validation/`, `knowledge/product/`, `knowledge/finalization/`
- Create: `methodology/`

- [ ] **Step 1: Create all directories**

```bash
mkdir -p pipeline/pre pipeline/validation pipeline/finalization
mkdir -p knowledge/core knowledge/review knowledge/validation knowledge/product knowledge/finalization
mkdir -p methodology
```

- [ ] **Step 2: Verify structure**

```bash
find pipeline knowledge methodology -type d | sort
```

Expected:
```
knowledge
knowledge/core
knowledge/finalization
knowledge/product
knowledge/review
knowledge/validation
methodology
pipeline
pipeline/finalization
pipeline/pre
pipeline/validation
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/ knowledge/ methodology/
git commit -m "chore: create directory structure for meta-prompt architecture"
```

### Task 2: Create Methodology Presets

**Files:**
- Create: `methodology/deep.yml`
- Create: `methodology/mvp.yml`
- Create: `methodology/custom-defaults.yml`

- [ ] **Step 1: Create deep.yml**

```yaml
# methodology/deep.yml
name: Deep Domain Modeling
description: Comprehensive documentation for complex systems — full analysis at every phase
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

- [ ] **Step 2: Create mvp.yml**

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

- [ ] **Step 3: Create custom-defaults.yml**

```yaml
# methodology/custom-defaults.yml
name: Custom
description: Choose which steps to include and how deep to go
default_depth: 3

# All steps enabled by default at depth 3 — user overrides individual steps
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

- [ ] **Step 4: Commit**

```bash
git add methodology/
git commit -m "feat: add methodology preset files (deep, mvp, custom-defaults)"
```

---

## Chunk 2: Meta-Prompts — Pre-Pipeline & Phases 1-5

Each meta-prompt follows the structure defined in spec Section 3. Full content provided for each file.

### Task 3: Pre-Pipeline Meta-Prompts

**Files:**
- Create: `pipeline/pre/create-prd.md`
- Create: `pipeline/pre/prd-gap-analysis.md`

- [ ] **Step 1: Create create-prd.md**

```markdown
---
name: create-prd
description: Create a product requirements document from a project idea
phase: "pre"
dependencies: []
outputs: [docs/prd.md]
conditional: null
knowledge-base: [prd-craft]
---

## Purpose
Transform a project idea into a structured product requirements document that
defines the problem, target users, features, constraints, and success criteria.
This is the foundation document that all subsequent phases reference.

## Inputs
- Project idea (provided by user verbally or in a brief)
- Existing project files (if brownfield — any README, docs, or code)

## Expected Outputs
- docs/prd.md — Product requirements document

## Quality Criteria
- Problem statement is specific and testable (not vague aspirations)
- Target users are identified with their needs
- Features are scoped with clear boundaries (what's in, what's out)
- Success criteria are measurable
- Constraints (technical, timeline, budget, team) are documented
- Non-functional requirements are explicit (performance, security, accessibility)

## Methodology Scaling
- **deep**: Comprehensive PRD. Competitive analysis, detailed user personas,
  feature prioritization matrix (MoSCoW or similar), risk assessment, phased
  delivery plan. 15-20 pages.
- **mvp**: Problem statement, core features list, primary user description,
  success criteria. 1-2 pages. Just enough to start building.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add user personas
  and feature prioritization. Depth 4-5: full competitive analysis and
  phased delivery.

## Mode Detection
If docs/prd.md exists, operate in update mode: read existing content, identify
what has changed or been learned since it was written, propose targeted updates.
Preserve existing decisions unless explicitly revisiting them.
```

- [ ] **Step 2: Create prd-gap-analysis.md**

```markdown
---
name: prd-gap-analysis
description: Systematically find gaps in the product requirements document
phase: "pre"
dependencies: [create-prd]
outputs: [docs/prd-gap-analysis.md]
conditional: null
knowledge-base: [gap-analysis, prd-craft]
---

## Purpose
Systematically analyze the PRD for gaps, ambiguities, contradictions, and
missing requirements. Produce a report of findings and update the PRD to
address them.

## Inputs
- docs/prd.md (required) — the PRD to analyze

## Expected Outputs
- docs/prd-gap-analysis.md — analysis report with findings and recommendations
- docs/prd.md — updated with fixes for identified gaps

## Quality Criteria
- Every section of the PRD is examined for completeness
- Ambiguous requirements are identified and clarified
- Missing edge cases and error scenarios are surfaced
- Contradictions between sections are resolved
- Non-functional requirements gaps are identified
- User journey gaps are found (paths not covered)

## Methodology Scaling
- **deep**: Multi-pass analysis. Separate passes for completeness, consistency,
  edge cases, NFRs, user journeys, and security implications. Categorized
  findings with severity. Innovation suggestions for missed opportunities.
- **mvp**: Single-pass review focused on blocking gaps — requirements that are
  too vague to implement. Brief findings list.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add edge case and
  NFR passes. Depth 4-5: full multi-pass with innovation suggestions.

## Mode Detection
If docs/prd-gap-analysis.md exists, operate in update mode: re-analyze the
PRD (which may have been updated), identify new gaps or gaps that were
previously found but not addressed.
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/pre/
git commit -m "feat: add pre-pipeline meta-prompts (create-prd, prd-gap-analysis)"
```

### Task 4: Phase 1 Meta-Prompts (Domain Modeling)

**Files:**
- Create: `pipeline/phase-01-domain-modeling.md`
- Create: `pipeline/phase-01a-review-domain-modeling.md`

- [ ] **Step 1: Create phase-01-domain-modeling.md**

```markdown
---
name: phase-01-domain-modeling
description: Deep domain modeling across all identified project domains
phase: "1"
dependencies: [create-prd]
outputs: [docs/domain-models/]
conditional: null
knowledge-base: [domain-modeling]
---

## Purpose
Identify and model all domains in the project. For each domain, define entities,
value objects, aggregates, domain events, invariants, and bounded context
boundaries. Establish the ubiquitous language that all subsequent phases use.

## Inputs
- docs/prd.md (required) — requirements defining the problem space
- docs/prd-gap-analysis.md (optional) — refined requirements

## Expected Outputs
- docs/domain-models/ — one file per domain, each containing:
  - Entity definitions with attributes and relationships
  - Value objects and their validation rules
  - Aggregate boundaries and roots
  - Domain events and their triggers
  - Invariants (business rules that must always hold)
  - Bounded context boundary and its interfaces to other contexts
- docs/domain-models/index.md — overview of all domains and their relationships

## Quality Criteria
- Every PRD feature maps to at least one domain
- Entity relationships are explicit (not implied)
- Aggregate boundaries are justified (why this grouping?)
- Domain events cover all state transitions
- Invariants are testable assertions, not vague rules
- Ubiquitous language is consistent across all domain models
- Cross-domain relationships are documented at context boundaries

## Methodology Scaling
- **deep**: Full DDD tactical patterns. Detailed entity specs with TypeScript-style
  interfaces. Domain event flows with sequence diagrams. Context maps showing
  relationships between bounded contexts. Separate file per domain.
- **mvp**: Key entities and their relationships in a single file. Core business
  rules listed. Enough to inform architecture decisions.
- **custom:depth(1-5)**: Depth 1-2: single-file entity overview. Depth 3: separate
  files per domain with entities and events. Depth 4-5: full DDD approach with
  context maps and detailed invariants.

## Mode Detection
If docs/domain-models/ exists, operate in update mode: read existing models,
identify changes needed based on updated PRD or new understanding. Preserve
existing decisions unless explicitly revisiting them.
```

- [ ] **Step 2: Create phase-01a-review-domain-modeling.md**

```markdown
---
name: phase-01a-review-domain-modeling
description: Review domain models for completeness, consistency, and downstream readiness
phase: "1a"
dependencies: [phase-01-domain-modeling]
outputs: [docs/reviews/phase-01a-review.md]
conditional: null
knowledge-base: [review-methodology, review-domain-modeling]
---

## Purpose
Deep multi-pass review of the domain models, targeting the specific failure modes
of domain modeling artifacts. Identify issues, create a fix plan, execute fixes,
and re-validate.

## Inputs
- docs/domain-models/ (required) — domain models to review
- docs/prd.md (required) — source requirements for coverage checking

## Expected Outputs
- docs/reviews/phase-01a-review.md — review findings, fix plan, and resolution log
- docs/domain-models/ — updated with fixes

## Quality Criteria
- All review passes executed with findings documented
- Every finding categorized by severity (P0-P3)
- Fix plan created for P0 and P1 findings
- Fixes applied and re-validated
- Downstream readiness confirmed (Phase 2 can proceed)

## Methodology Scaling
- **deep**: All review passes from the knowledge base. Full findings report
  with severity categorization. Fixes applied and re-validated.
- **mvp**: Quick consistency check. Focus on blocking issues only.
- **custom:depth(1-5)**: Depth 1-2: blocking issues only. Depth 3: add coverage
  and consistency passes. Depth 4-5: full multi-pass review.

## Mode Detection
If docs/reviews/phase-01a-review.md exists, this is a re-review. Read previous
findings, check which were addressed, run review passes again on updated models.
```

- [ ] **Step 3: Commit**

```bash
git add pipeline/phase-01-domain-modeling.md pipeline/phase-01a-review-domain-modeling.md
git commit -m "feat: add Phase 1 meta-prompts (domain modeling + review)"
```

### Task 5: Phase 2-3 Meta-Prompts (ADRs & Architecture)

**Files:**
- Create: `pipeline/phase-02-adrs.md`
- Create: `pipeline/phase-02a-review-adrs.md`
- Create: `pipeline/phase-03-system-architecture.md`
- Create: `pipeline/phase-03a-review-architecture.md`

- [ ] **Step 1: Create phase-02-adrs.md**

```markdown
---
name: phase-02-adrs
description: Document architecture decisions as ADRs
phase: "2"
dependencies: [phase-01-domain-modeling]
outputs: [docs/adrs/]
conditional: null
knowledge-base: [adr-craft]
---

## Purpose
Identify and document all significant architecture decisions. Each decision gets
its own ADR with context, options considered, decision made, and consequences.
Technology selection (language, framework, database, infrastructure) is a key
ADR category — tech stack decisions are documented here.

## Inputs
- docs/domain-models/ (required) — domain structure driving architecture choices
- docs/prd.md (required) — requirements and constraints

## Expected Outputs
- docs/adrs/ — one ADR file per decision (ADR-NNN-title.md format)
- docs/adrs/index.md — decision log overview

## Quality Criteria
- Every significant decision has an ADR (technology, patterns, trade-offs)
- Each ADR documents alternatives considered with pros/cons
- Decisions trace to PRD requirements or domain model constraints
- No ADR contradicts another without explicit acknowledgment
- Technology selections include team expertise and maintenance considerations

## Methodology Scaling
- **deep**: Comprehensive ADR set. 3+ alternatives per decision with detailed
  evaluation. Risk assessment for each decision. Cross-references between
  related ADRs. Supersession tracking.
- **mvp**: Core technology choices only (language, framework, database, hosting).
  Brief rationale. Single-paragraph ADRs.
- **custom:depth(1-5)**: Depth 1-2: core tech choices. Depth 3: add pattern
  and integration decisions. Depth 4-5: full evaluation with risk assessment.

## Mode Detection
If docs/adrs/ exists, operate in update mode: review existing ADRs against
current domain models and requirements. Add new ADRs for undocumented decisions.
Supersede ADRs whose context has changed.
```

- [ ] **Step 2: Create phase-02a-review-adrs.md**

```markdown
---
name: phase-02a-review-adrs
description: Review ADRs for completeness, consistency, and decision quality
phase: "2a"
dependencies: [phase-02-adrs]
outputs: [docs/reviews/phase-02a-review.md]
conditional: null
knowledge-base: [review-methodology, review-adr]
---

## Purpose
Multi-pass review of ADRs targeting ADR-specific failure modes: contradictory
decisions, missing rationale, implied-but-unrecorded decisions, and unresolved
trade-offs.

## Inputs
- docs/adrs/ (required) — ADRs to review
- docs/domain-models/ (required) — for coverage checking
- docs/prd.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/phase-02a-review.md — findings and resolution log
- docs/adrs/ — updated with fixes

## Quality Criteria
- All ADR-specific review passes executed
- Every finding categorized by severity
- Missing decisions identified and documented
- Contradictions resolved
- Downstream readiness confirmed (Phase 3 can proceed)

## Methodology Scaling
- **deep**: All review passes. Full findings report. Fixes applied and re-validated.
- **mvp**: Quick consistency check for contradictions only.
- **custom:depth(1-5)**: Scale number of review passes with depth.

## Mode Detection
Re-review mode if previous review exists. Check which findings were addressed.
```

- [ ] **Step 3: Create phase-03-system-architecture.md**

Use the example from the spec (Section 3) as the content for this file. The spec already provides the full meta-prompt content.

```markdown
---
name: phase-03-system-architecture
description: Design and document system architecture
phase: "3"
dependencies: [phase-02-adrs]
outputs: [docs/system-architecture.md]
conditional: null
knowledge-base: [system-architecture]
---

## Purpose
Design and document the system architecture, translating domain models and ADR
decisions into a concrete component structure, data flows, and module
organization. Project directory structure and module organization are defined here.

## Inputs
- docs/domain-models/ (required) — domain models from phase 1
- docs/adrs/ (required) — architecture decisions from phase 2
- docs/prd.md (required) — requirements driving architecture

## Expected Outputs
- docs/system-architecture.md — architecture document with component design,
  data flows, module structure, and extension points

## Quality Criteria
- Every domain model lands in a component or module
- Every ADR constraint is respected in the architecture
- All components appear in at least one data flow diagram
- Extension points are both documented and designed (not just listed)
- Project directory structure is defined with file-level granularity

## Methodology Scaling
- **deep**: Full architecture document. Component diagrams, data flow diagrams,
  module structure with file-level detail, state management design, extension
  point inventory, deployment topology.
- **mvp**: High-level component overview. Key data flows. Enough structure for
  an agent to start building without ambiguity.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add component diagrams
  and module boundaries. Depth 4-5: full architecture approach.

## Mode Detection
If outputs already exist, operate in update mode: read existing content, diff
against current project state and new ADRs, propose targeted updates rather
than regenerating.
```

- [ ] **Step 4: Create phase-03a-review-architecture.md**

```markdown
---
name: phase-03a-review-architecture
description: Review system architecture for completeness and downstream readiness
phase: "3a"
dependencies: [phase-03-system-architecture]
outputs: [docs/reviews/phase-03a-review.md]
conditional: null
knowledge-base: [review-methodology, review-system-architecture]
---

## Purpose
Multi-pass review of the system architecture targeting architecture-specific
failure modes: domain coverage gaps, ADR constraint violations, data flow
orphans, module structure issues, state inconsistencies, diagram/prose drift,
and downstream readiness.

## Inputs
- docs/system-architecture.md (required) — architecture to review
- docs/domain-models/ (required) — for coverage checking
- docs/adrs/ (required) — for constraint compliance
- docs/prd.md (required) — for requirement tracing

## Expected Outputs
- docs/reviews/phase-03a-review.md — findings and resolution log
- docs/system-architecture.md — updated with fixes

## Quality Criteria
- All architecture-specific review passes executed
- Domain model coverage verified (every model maps to a component)
- ADR constraint compliance verified
- Data flow completeness verified (no orphaned components)
- Module structure validated for practical concerns
- Downstream readiness confirmed (Phases 4-7 can proceed)

## Methodology Scaling
- **deep**: All 10 review passes (coverage, constraints, data flows, module
  structure, state consistency, diagram integrity, extension points,
  invariants, downstream readiness, internal consistency).
- **mvp**: Domain coverage and ADR compliance checks only.
- **custom:depth(1-5)**: Scale number of passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase-02-adrs.md pipeline/phase-02a-review-adrs.md
git add pipeline/phase-03-system-architecture.md pipeline/phase-03a-review-architecture.md
git commit -m "feat: add Phase 2-3 meta-prompts (ADRs, architecture + reviews)"
```

### Task 6: Phase 4-5 Meta-Prompts (Database & API)

**Files:**
- Create: `pipeline/phase-04-database-schema.md`
- Create: `pipeline/phase-04a-review-database.md`
- Create: `pipeline/phase-05-api-contracts.md`
- Create: `pipeline/phase-05a-review-api.md`

- [ ] **Step 1: Create phase-04-database-schema.md**

```markdown
---
name: phase-04-database-schema
description: Design database schema from domain models
phase: "4"
dependencies: [phase-03-system-architecture]
outputs: [docs/database-schema.md]
conditional: "if-needed"
knowledge-base: [database-design]
---

## Purpose
Translate domain models into a concrete database schema. Define tables/collections,
relationships, indexes, constraints, and migration strategy.

## Inputs
- docs/domain-models/ (required) — entities and relationships to model
- docs/system-architecture.md (required) — data layer architecture decisions
- docs/adrs/ (required) — technology choices (database type, ORM)

## Expected Outputs
- docs/database-schema.md — schema design with tables, relationships, indexes,
  constraints, and migration strategy

## Quality Criteria
- Every domain entity maps to a table/collection (or justified denormalization)
- Relationships match domain model relationships
- Indexes cover known query patterns from architecture data flows
- Constraints enforce domain invariants at the database level
- Migration strategy handles schema evolution

## Methodology Scaling
- **deep**: Full schema specification. CREATE TABLE statements or equivalent.
  Index justification with query patterns. Normalization analysis. Migration
  plan with rollback strategy. Seed data strategy.
- **mvp**: Entity-to-table mapping. Key relationships. Primary indexes only.
- **custom:depth(1-5)**: Depth 1-2: mapping only. Depth 3: add indexes and
  constraints. Depth 4-5: full specification with migrations.

## Mode Detection
Update mode if schema exists. Diff against current domain models.
```

- [ ] **Step 2: Create phase-04a-review-database.md**

```markdown
---
name: phase-04a-review-database
description: Review database schema for correctness and completeness
phase: "4a"
dependencies: [phase-04-database-schema]
outputs: [docs/reviews/phase-04a-review.md]
conditional: "if-needed"
knowledge-base: [review-methodology, review-database-schema]
---

## Purpose
Review database schema targeting schema-specific failure modes: entity coverage
gaps, normalization trade-off issues, missing indexes, migration safety, and
referential integrity vs. domain invariants.

## Inputs
- docs/database-schema.md (required) — schema to review
- docs/domain-models/ (required) — for entity coverage
- docs/system-architecture.md (required) — for query pattern coverage

## Expected Outputs
- docs/reviews/phase-04a-review.md — findings and resolution log
- docs/database-schema.md — updated with fixes

## Quality Criteria
- Entity coverage verified
- Normalization decisions justified
- Index coverage for known query patterns verified
- Migration safety assessed
- Referential integrity matches domain invariants

## Methodology Scaling
- **deep**: Full multi-pass review targeting all schema failure modes.
- **mvp**: Entity coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 3: Create phase-05-api-contracts.md**

```markdown
---
name: phase-05-api-contracts
description: Specify API contracts for all system interfaces
phase: "5"
dependencies: [phase-03-system-architecture]
outputs: [docs/api-contracts.md]
conditional: "if-needed"
knowledge-base: [api-design]
---

## Purpose
Define API contracts for all system interfaces — REST endpoints, GraphQL schema,
WebSocket events, or inter-service communication. Each endpoint specifies request/
response shapes, error codes, authentication requirements, and rate limits.

## Inputs
- docs/system-architecture.md (required) — component interfaces to specify
- docs/domain-models/ (required) — domain operations to expose
- docs/adrs/ (required) — API style decisions (REST vs GraphQL, versioning)

## Expected Outputs
- docs/api-contracts.md — API specification with endpoints, request/response
  shapes, error contracts, auth requirements

## Quality Criteria
- Every domain operation that crosses a component boundary has an API endpoint
- Error contracts are explicit (not just "500 Internal Server Error")
- Authentication and authorization requirements per endpoint
- Versioning strategy documented (if applicable)
- Pagination, filtering, and sorting for list endpoints
- Idempotency documented for mutating operations

## Methodology Scaling
- **deep**: OpenAPI-style specification. Full request/response schemas with
  examples. Error catalog. Auth flow diagrams. Rate limiting strategy.
  SDK generation considerations.
- **mvp**: Endpoint list with HTTP methods and brief descriptions. Key
  request/response shapes. Auth approach.
- **custom:depth(1-5)**: Depth 1-2: endpoint list. Depth 3: add schemas and
  error contracts. Depth 4-5: full OpenAPI-style spec.

## Mode Detection
Update mode if contracts exist. Diff against architecture changes.
```

- [ ] **Step 4: Create phase-05a-review-api.md**

```markdown
---
name: phase-05a-review-api
description: Review API contracts for completeness and consistency
phase: "5a"
dependencies: [phase-05-api-contracts]
outputs: [docs/reviews/phase-05a-review.md]
conditional: "if-needed"
knowledge-base: [review-methodology, review-api-contracts]
---

## Purpose
Review API contracts targeting API-specific failure modes: operation coverage
gaps, error contract incompleteness, auth/authz gaps, versioning inconsistencies,
payload shape mismatches with domain entities, and idempotency gaps.

## Inputs
- docs/api-contracts.md (required) — contracts to review
- docs/domain-models/ (required) — for operation coverage
- docs/adrs/ (required) — for consistency checking
- docs/system-architecture.md (required) — for interface coverage

## Expected Outputs
- docs/reviews/phase-05a-review.md — findings and resolution log
- docs/api-contracts.md — updated with fixes

## Quality Criteria
- Operation coverage against domain model verified
- Error contracts complete and consistent
- Auth requirements specified for every endpoint
- Versioning strategy consistent with ADRs
- Idempotency documented for all mutating operations

## Methodology Scaling
- **deep**: Full multi-pass review targeting all API failure modes.
- **mvp**: Operation coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase-04-database-schema.md pipeline/phase-04a-review-database.md
git add pipeline/phase-05-api-contracts.md pipeline/phase-05a-review-api.md
git commit -m "feat: add Phase 4-5 meta-prompts (database, API + reviews)"
```

---

## Chunk 3: Meta-Prompts — Phases 6-10 & Validation & Finalization

### Task 7: Phase 6-7 Meta-Prompts (UX & Implementation Tasks)

**Files:**
- Create: `pipeline/phase-06-ux-spec.md`
- Create: `pipeline/phase-06a-review-ux.md`
- Create: `pipeline/phase-07-implementation-tasks.md`
- Create: `pipeline/phase-07a-review-tasks.md`

- [ ] **Step 1: Create phase-06-ux-spec.md**

```markdown
---
name: phase-06-ux-spec
description: Specify UI/UX design including design system
phase: "6"
dependencies: [phase-03-system-architecture]
outputs: [docs/ux-spec.md]
conditional: "if-needed"
knowledge-base: [ux-specification]
---

## Purpose
Define the user experience specification: user flows, wireframes, component
hierarchy, interaction patterns, and design system (tokens, components, patterns).
This is the visual and interaction blueprint for the frontend.

## Inputs
- docs/prd.md (required) — user requirements and personas
- docs/system-architecture.md (required) — frontend architecture
- docs/api-contracts.md (optional) — data shapes for UI components

## Expected Outputs
- docs/ux-spec.md — UX specification with flows, components, design system

## Quality Criteria
- Every PRD user journey has a corresponding flow
- Component hierarchy covers all UI states (loading, error, empty, populated)
- Design system defines tokens (colors, spacing, typography) and base components
- Accessibility requirements documented (WCAG level, keyboard nav, screen readers)
- Responsive breakpoints defined with behavior per breakpoint
- Error states documented for every user action that can fail

## Methodology Scaling
- **deep**: Full UX specification. Detailed wireframes described in prose.
  Complete design system. Interaction state machines. Accessibility audit
  checklist. Animation and transition specs.
- **mvp**: Key user flows. Core component list. Basic design tokens.
- **custom:depth(1-5)**: Depth 1-2: flows and components. Depth 3: add design
  system. Depth 4-5: full specification with accessibility.

## Mode Detection
Update mode if spec exists.
```

- [ ] **Step 2: Create phase-06a-review-ux.md**

```markdown
---
name: phase-06a-review-ux
description: Review UX specification for completeness and usability
phase: "6a"
dependencies: [phase-06-ux-spec]
outputs: [docs/reviews/phase-06a-review.md]
conditional: "if-needed"
knowledge-base: [review-methodology, review-ux-spec]
---

## Purpose
Review UX specification targeting UX-specific failure modes: user journey gaps,
accessibility issues, incomplete interaction states, design system inconsistencies,
and missing error states.

## Inputs
- docs/ux-spec.md (required) — spec to review
- docs/prd.md (required) — for journey coverage
- docs/api-contracts.md (optional) — for data shape alignment

## Expected Outputs
- docs/reviews/phase-06a-review.md — findings and resolution log
- docs/ux-spec.md — updated with fixes

## Quality Criteria
- User journey coverage verified against PRD
- Accessibility compliance checked
- All interaction states covered
- Design system consistency verified
- Error states present for all failure-capable actions

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: Journey coverage only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 3: Create phase-07-implementation-tasks.md**

```markdown
---
name: phase-07-implementation-tasks
description: Break architecture into implementable tasks with dependencies
phase: "7"
dependencies: [phase-03-system-architecture]
outputs: [docs/implementation-tasks.md]
conditional: null
knowledge-base: [task-decomposition]
---

## Purpose
Decompose the system architecture into concrete, implementable tasks suitable
for AI agents. Each task should be independently executable, have clear inputs/
outputs, and be small enough for a single agent session. User stories inform
task creation — features map to stories map to tasks.

## Inputs
- docs/system-architecture.md (required) — components to implement
- docs/domain-models/ (required) — domain logic to implement
- docs/adrs/ (required) — technology constraints
- docs/prd.md (required) — features to trace tasks back to
- docs/database-schema.md (optional) — data layer tasks
- docs/api-contracts.md (optional) — API implementation tasks
- docs/ux-spec.md (optional) — frontend tasks

## Expected Outputs
- docs/implementation-tasks.md — task list with dependencies, sizing, and
  assignment recommendations

## Quality Criteria
- Every architecture component has implementation tasks
- Task dependencies form a valid DAG (no cycles)
- Each task is scoped for a single agent session (not too large, not too small)
- Tasks include acceptance criteria (how to know it's done)
- Critical path is identified
- Parallelization opportunities are marked

## Methodology Scaling
- **deep**: Detailed task breakdown with story-to-task tracing. Dependency graph.
  Sizing estimates. Parallelization plan. Agent context requirements per task.
  Phased delivery milestones.
- **mvp**: Ordered task list with brief descriptions. Key dependencies noted.
  Enough to start working sequentially.
- **custom:depth(1-5)**: Depth 1-2: ordered list. Depth 3: add dependencies
  and sizing. Depth 4-5: full breakdown with parallelization.

## Mode Detection
Update mode if tasks exist. Re-derive from updated architecture.
```

- [ ] **Step 4: Create phase-07a-review-tasks.md**

```markdown
---
name: phase-07a-review-tasks
description: Review implementation tasks for coverage and feasibility
phase: "7a"
dependencies: [phase-07-implementation-tasks]
outputs: [docs/reviews/phase-07a-review.md]
conditional: null
knowledge-base: [review-methodology, review-implementation-tasks]
---

## Purpose
Review implementation tasks targeting task-specific failure modes: architecture
coverage gaps, missing dependencies, tasks too large or too vague for agents,
critical path inaccuracy, and invalid parallelization assumptions.

## Inputs
- docs/implementation-tasks.md (required) — tasks to review
- docs/system-architecture.md (required) — for coverage checking
- docs/domain-models/ (required) — for completeness

## Expected Outputs
- docs/reviews/phase-07a-review.md — findings and resolution log
- docs/implementation-tasks.md — updated with fixes

## Quality Criteria
- Architecture coverage verified (every component has tasks)
- Dependency graph is valid DAG
- No task is too large for a single agent session
- Critical path is accurate
- Parallelization assumptions are valid

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: Coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 5: Commit**

```bash
git add pipeline/phase-06-ux-spec.md pipeline/phase-06a-review-ux.md
git add pipeline/phase-07-implementation-tasks.md pipeline/phase-07a-review-tasks.md
git commit -m "feat: add Phase 6-7 meta-prompts (UX, implementation tasks + reviews)"
```

### Task 8: Phase 8-10 Meta-Prompts (Testing, Operations, Security)

**Files:**
- Create: `pipeline/phase-08-testing-strategy.md`
- Create: `pipeline/phase-08a-review-testing.md`
- Create: `pipeline/phase-09-operations.md`
- Create: `pipeline/phase-09a-review-operations.md`
- Create: `pipeline/phase-10-security.md`
- Create: `pipeline/phase-10a-review-security.md`

- [ ] **Step 1: Create phase-08-testing-strategy.md**

```markdown
---
name: phase-08-testing-strategy
description: Define testing and quality strategy across all layers
phase: "8"
dependencies: [phase-07-implementation-tasks]
outputs: [docs/testing-strategy.md]
conditional: null
knowledge-base: [testing-strategy]
---

## Purpose
Define the testing strategy: test pyramid, coverage goals per layer, testing
patterns, quality gates, and performance testing approach. This tells agents
how to test the code they write.

## Inputs
- docs/system-architecture.md (required) — layers to test
- docs/domain-models/ (required) — business rules to verify
- docs/adrs/ (required) — testing technology choices
- docs/api-contracts.md (optional) — API test scenarios
- docs/database-schema.md (optional) — data layer test scenarios

## Expected Outputs
- docs/testing-strategy.md — testing approach with coverage goals and patterns

## Quality Criteria
- Test pyramid defined with coverage targets per layer
- Testing patterns specified for each layer (unit, integration, e2e)
- Quality gates defined (what must pass before merge)
- Edge cases from domain invariants are test scenarios
- Performance testing approach for critical paths

## Methodology Scaling
- **deep**: Comprehensive strategy. Test matrix by layer and component. Specific
  test patterns per architecture pattern. Performance benchmarks. CI integration.
  Test data strategy. Mutation testing approach.
- **mvp**: Test pyramid overview. Key testing patterns. What must pass before deploy.
- **custom:depth(1-5)**: Scale detail with depth.

## Mode Detection
Update mode if strategy exists.
```

- [ ] **Step 2: Create phase-08a-review-testing.md**

```markdown
---
name: phase-08a-review-testing
description: Review testing strategy for coverage gaps and feasibility
phase: "8a"
dependencies: [phase-08-testing-strategy]
outputs: [docs/reviews/phase-08a-review.md]
conditional: null
knowledge-base: [review-methodology, review-testing-strategy]
---

## Purpose
Review testing strategy targeting testing-specific failure modes: coverage gaps
by layer, missing edge cases from domain invariants, unrealistic test environment
assumptions, inadequate performance test coverage, and missing integration boundaries.

## Inputs
- docs/testing-strategy.md (required) — strategy to review
- docs/domain-models/ (required) — for invariant test case coverage
- docs/system-architecture.md (required) — for layer coverage

## Expected Outputs
- docs/reviews/phase-08a-review.md — findings and resolution log
- docs/testing-strategy.md — updated with fixes

## Quality Criteria
- Coverage gaps by layer identified
- Domain invariant test cases verified
- Test environment assumptions validated
- Performance test coverage assessed against NFRs
- Integration boundaries have integration tests defined

## Methodology Scaling
- **deep**: Full multi-pass review targeting all testing failure modes.
- **mvp**: Coverage gap check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 3: Create phase-09-operations.md**

```markdown
---
name: phase-09-operations
description: Define operations, deployment, and dev environment strategy
phase: "9"
dependencies: [phase-08-testing-strategy]
outputs: [docs/operations-runbook.md]
conditional: null
knowledge-base: [operations-runbook]
---

## Purpose
Define the operational strategy: CI/CD pipeline, deployment approach, monitoring
and alerting, incident response, rollback procedures, and dev environment setup.
This is both the production operations guide and the local development workflow.

## Inputs
- docs/system-architecture.md (required) — what to deploy
- docs/testing-strategy.md (required) — CI pipeline test stages
- docs/adrs/ (required) — infrastructure decisions

## Expected Outputs
- docs/operations-runbook.md — operations and deployment runbook

## Quality Criteria
- CI/CD pipeline defined with all stages (build, test, lint, deploy)
- Deployment strategy chosen with rollback procedure
- Monitoring covers key metrics (latency, error rate, saturation)
- Alerting thresholds are justified, not arbitrary
- Dev environment setup is documented and reproducible
- Incident response process defined

## Methodology Scaling
- **deep**: Full runbook. Deployment topology diagrams. Monitoring dashboard
  specs. Alert playbooks. DR plan. Capacity planning. Local dev with
  containers matching production.
- **mvp**: Basic CI/CD pipeline. Deploy command. How to run locally.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add monitoring and
  alerts. Depth 4-5: full runbook with DR.

## Mode Detection
Update mode if runbook exists.
```

- [ ] **Step 4: Create phase-09a-review-operations.md**

```markdown
---
name: phase-09a-review-operations
description: Review operations runbook for completeness and safety
phase: "9a"
dependencies: [phase-09-operations]
outputs: [docs/reviews/phase-09a-review.md]
conditional: null
knowledge-base: [review-methodology, review-operations]
---

## Purpose
Review operations runbook targeting operations-specific failure modes: deployment
strategy gaps, missing rollback procedures, monitoring blind spots, unjustified
alerting thresholds, missing runbook scenarios, and DR coverage gaps.

## Inputs
- docs/operations-runbook.md (required) — runbook to review
- docs/system-architecture.md (required) — for deployment coverage

## Expected Outputs
- docs/reviews/phase-09a-review.md — findings and resolution log
- docs/operations-runbook.md — updated with fixes

## Quality Criteria
- Deployment lifecycle fully documented (deploy, verify, rollback)
- Monitoring covers all critical metrics
- Alert thresholds have rationale
- Common failure scenarios have runbook entries
- Dev environment parity assessed

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: Deployment coverage only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 5: Create phase-10-security.md**

```markdown
---
name: phase-10-security
description: Security review and documentation
phase: "10"
dependencies: [phase-09-operations]
outputs: [docs/security-review.md]
conditional: null
knowledge-base: [security-best-practices]
---

## Purpose
Conduct a security review of the entire system design. Document security
controls, threat model, auth/authz approach, data protection, secrets
management, and dependency audit strategy.

## Inputs
- docs/system-architecture.md (required) — attack surface
- docs/api-contracts.md (optional) — auth/authz boundaries
- docs/database-schema.md (optional) — data protection needs
- docs/operations-runbook.md (required) — secrets and deployment security

## Expected Outputs
- docs/security-review.md — security review and controls document

## Quality Criteria
- OWASP top 10 addressed for this specific project
- Auth/authz boundaries defined and consistent with API contracts
- Data classified by sensitivity with handling requirements
- Secrets management strategy defined (no secrets in code)
- Threat model covers all trust boundaries
- Dependency audit integrated into CI

## Methodology Scaling
- **deep**: Full threat model (STRIDE). OWASP analysis per component.
  Data classification matrix. Secrets rotation plan. Penetration testing
  scope. Compliance checklist (if applicable).
- **mvp**: Key security controls. Auth approach. No secrets in code.
  Basic input validation strategy.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add threat model.
  Depth 4-5: full security review.

## Mode Detection
Update mode if review exists.
```

- [ ] **Step 6: Create phase-10a-review-security.md**

```markdown
---
name: phase-10a-review-security
description: Review security document for coverage and correctness
phase: "10a"
dependencies: [phase-10-security]
outputs: [docs/reviews/phase-10a-review.md]
conditional: null
knowledge-base: [review-methodology, review-security]
---

## Purpose
Review security document targeting security-specific failure modes: OWASP coverage
gaps, auth/authz boundary mismatches with API contracts, secrets management gaps,
insufficient dependency audit coverage, missing threat model scenarios, and data
classification gaps.

## Inputs
- docs/security-review.md (required) — security doc to review
- docs/api-contracts.md (optional) — for auth boundary alignment
- docs/system-architecture.md (required) — for attack surface coverage

## Expected Outputs
- docs/reviews/phase-10a-review.md — findings and resolution log
- docs/security-review.md — updated with fixes

## Quality Criteria
- OWASP coverage verified for this project
- Auth boundaries match API contract auth requirements
- Secrets management is complete (no gaps)
- Dependency audit scope covers all dependencies
- Threat model covers all trust boundaries
- Data classification is complete

## Methodology Scaling
- **deep**: Full multi-pass review. **mvp**: OWASP coverage check only.
- **custom:depth(1-5)**: Scale passes with depth.

## Mode Detection
Re-review mode if previous review exists.
```

- [ ] **Step 7: Commit**

```bash
git add pipeline/phase-08-testing-strategy.md pipeline/phase-08a-review-testing.md
git add pipeline/phase-09-operations.md pipeline/phase-09a-review-operations.md
git add pipeline/phase-10-security.md pipeline/phase-10a-review-security.md
git commit -m "feat: add Phase 8-10 meta-prompts (testing, operations, security + reviews)"
```

### Task 9: Validation Meta-Prompts

**Files:**
- Create: 7 files in `pipeline/validation/`

- [ ] **Step 1: Create all validation meta-prompts**

Each validation step follows this pattern — create all 7:

| File | name | dependencies | knowledge-base | Purpose |
|------|------|-------------|----------------|---------|
| `cross-phase-consistency.md` | cross-phase-consistency | [phase-10a-review-security] | [cross-phase-consistency] | Audit naming, assumptions, data flows, interface contracts across all phases |
| `traceability-matrix.md` | traceability-matrix | [phase-10a-review-security] | [traceability] | Build traceability from PRD requirements through architecture to implementation tasks |
| `decision-completeness.md` | decision-completeness | [phase-10a-review-security] | [decision-completeness] | Verify all decisions are recorded, justified, non-contradictory |
| `critical-path-walkthrough.md` | critical-path-walkthrough | [phase-10a-review-security] | [critical-path-analysis] | Walk critical user journeys end-to-end across all specs |
| `implementability-dry-run.md` | implementability-dry-run | [phase-10a-review-security] | [implementability-review] | Dry-run specs as implementing agent, catching ambiguity |
| `dependency-graph-validation.md` | dependency-graph-validation | [phase-10a-review-security] | [dependency-validation] | Verify task dependency graphs are acyclic, complete, correctly ordered |
| `scope-creep-check.md` | scope-creep-check | [phase-10a-review-security] | [scope-management] | Verify specs stay aligned to PRD boundaries |

Note: All 7 validation steps depend only on the final review phase completing (all artifacts available). They are independent of each other and can run in parallel.

All validation steps:
- phase: "validation"
- conditional: null
- outputs: [docs/validation/<step-name>.md]
- Inputs: all phase output artifacts (read-only analysis)
- No mode detection needed (validation is always fresh)

Body structure for each:
```markdown
## Purpose
[One paragraph from the table above]

## Inputs
- All phase output artifacts (docs/prd.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/<step-name>.md — findings report

## Quality Criteria
- Analysis is comprehensive (not superficial)
- Findings are actionable (specific file, section, and issue)
- Severity categorization (P0-P3)

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**: Scale thoroughness with depth.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts.
```

- [ ] **Step 2: Commit**

```bash
git add pipeline/validation/
git commit -m "feat: add validation phase meta-prompts (7 validation steps)"
```

### Task 10: Finalization Meta-Prompts

**Files:**
- Create: `pipeline/finalization/apply-fixes-and-freeze.md`
- Create: `pipeline/finalization/developer-onboarding-guide.md`
- Create: `pipeline/finalization/implementation-playbook.md`

- [ ] **Step 1: Create apply-fixes-and-freeze.md**

```markdown
---
name: apply-fixes-and-freeze
description: Apply validation findings and freeze documentation
phase: "finalization"
dependencies: [cross-phase-consistency, traceability-matrix, decision-completeness, critical-path-walkthrough, implementability-dry-run, dependency-graph-validation, scope-creep-check]
outputs: [docs/validation/fix-log.md]
conditional: null
knowledge-base: []
---

## Purpose
Review all validation phase findings, create a prioritized fix plan, apply fixes
to the relevant documents, and mark the documentation as frozen (ready for
implementation). After this step, documents should not change unless a specific
issue is discovered during implementation.

## Inputs
- docs/validation/*.md (required) — all validation findings
- All phase output artifacts (to apply fixes to)

## Expected Outputs
- docs/validation/fix-log.md — log of all fixes applied
- Updated phase artifacts with fixes applied
- Freeze marker added to each document (tracking comment)

## Quality Criteria
- All P0 and P1 validation findings addressed
- P2 findings addressed or explicitly deferred with rationale
- Fix log documents what changed and why
- All documents pass a final consistency check after fixes

## Methodology Scaling
- **deep**: All findings addressed. Full fix log. Final consistency check.
- **mvp**: P0 findings only. Brief fix log.
- **custom:depth(1-5)**: Scale with depth.

## Mode Detection
Not applicable — this step runs once after validation.
```

- [ ] **Step 2: Create developer-onboarding-guide.md**

```markdown
---
name: developer-onboarding-guide
description: Create a guide for developers (human or AI) joining the project
phase: "finalization"
dependencies: [apply-fixes-and-freeze]
outputs: [docs/onboarding-guide.md]
conditional: null
knowledge-base: [developer-onboarding]
---

## Purpose
Create a comprehensive onboarding guide that gives any developer (human or AI
agent) everything they need to understand the project and start contributing.
This is the "start here" document.

## Inputs
- All frozen phase artifacts

## Expected Outputs
- docs/onboarding-guide.md — developer onboarding guide

## Quality Criteria
- Covers: project purpose, architecture overview, key patterns, where to find what
- A new developer can set up and run the project following this guide
- Key architectural decisions are summarized (with pointers to ADRs)
- Development workflow is clear (branch, code, test, PR)

## Methodology Scaling
- **deep**: Comprehensive guide. Architecture walkthrough, key pattern explanations,
  common tasks with examples, troubleshooting section.
- **mvp**: Quick start. Setup instructions, key files, how to run tests.
- **custom:depth(1-5)**: Scale detail with depth.

## Mode Detection
Update mode if guide exists.
```

- [ ] **Step 3: Create implementation-playbook.md**

```markdown
---
name: implementation-playbook
description: Create the playbook that AI agents follow during implementation
phase: "finalization"
dependencies: [developer-onboarding-guide]
outputs: [docs/implementation-playbook.md]
conditional: null
knowledge-base: [implementation-playbook]
---

## Purpose
Create the implementation playbook — the operational document that AI agents
reference during implementation. Defines task ordering, context requirements
per task, coding standards, git workflow (branching/PR strategy), handoff
format between agents, and success criteria.

## Inputs
- docs/implementation-tasks.md (required) — tasks to sequence
- docs/system-architecture.md (required) — architecture context
- docs/testing-strategy.md (required) — testing requirements
- All other frozen artifacts

## Expected Outputs
- docs/implementation-playbook.md — agent implementation playbook

## Quality Criteria
- Task execution order is clear and respects dependencies
- Each task has context requirements (which docs to read before starting)
- Coding standards are defined (naming, patterns, error handling)
- Git workflow is defined (branching strategy, commit format, PR process)
- Success criteria per task (how to know it's done)
- Handoff format between agents (what to communicate when passing work)
- Quality gates are defined (what must pass before a task is complete)

## Methodology Scaling
- **deep**: Full playbook. Detailed coding standards, git workflow with
  examples, per-task context briefs, inter-agent communication protocol,
  rollback procedures for failed tasks.
- **mvp**: Task order, basic coding conventions, commit format, "run tests
  before marking done."
- **custom:depth(1-5)**: Scale detail with depth.

## Mode Detection
Update mode if playbook exists.
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/finalization/
git commit -m "feat: add finalization phase meta-prompts (freeze, onboarding, playbook)"
```

---

## Chunk 4: Knowledge Base — Core Domain Expertise

The knowledge base documents are the highest-value artifacts. Each must be a comprehensive domain expertise document, not a summary or checklist. These are reference material that the AI draws on when generating working prompts.

**Source material:** Extract domain knowledge from current `prompts.md` hard-coded prompts. Create new content for domains not covered by existing prompts.

**Effort note:** Each knowledge base document requires substantial content development — these are comprehensive domain expertise references, not summaries. The sections listed below define the structure and key points; the implementing agent must expand each into thorough, actionable content (typically 200-500 lines per file). Reference existing v2 domain models and `prompts.md` for source material where available. For topics not covered by existing sources, the agent should draw on general domain expertise.

### Task 11: Core Knowledge Base — Domain Modeling & ADRs

**Files:**
- Create: `knowledge/core/domain-modeling.md`
- Create: `knowledge/core/adr-craft.md`

- [ ] **Step 1: Create domain-modeling.md**

```yaml
---
name: domain-modeling
description: Domain-driven design patterns for identifying and modeling project domains
topics: [ddd, domain-modeling, entities, aggregates, bounded-contexts]
---
```

**Required sections:**

- **Strategic DDD Patterns** — Bounded contexts, context mapping (shared kernel, customer-supplier, conformist, anticorruption layer, open host service, published language), subdomains (core, supporting, generic)
- **Tactical DDD Patterns** — Entities (identity, lifecycle), value objects (immutability, equality by value), aggregates (consistency boundaries, aggregate roots, invariant enforcement), domain events (naming conventions, payload design, event flows), domain services (stateless operations that don't belong to entities), repositories (collection-like interface, persistence ignorance)
- **Domain Discovery Process** — Event storming, domain expert interviews, identifying bounded contexts from organizational structure, finding aggregate boundaries
- **Modeling Artifacts** — What a domain model document should contain: entity definitions with TypeScript-style interfaces, relationship diagrams, invariant specifications, event flow diagrams, context map
- **Common Pitfalls** — Anemic domain models (entities as data bags), leaky abstractions across context boundaries, over-sized aggregates, missing domain events for state transitions, conflating entities with database rows
- **Quality Indicators** — How to know the model is good: ubiquitous language consistency, aggregate boundaries match transaction boundaries, domain events capture all business-meaningful state changes

- [ ] **Step 2: Create adr-craft.md**

```yaml
---
name: adr-craft
description: Writing effective architecture decision records including technology selection
topics: [adr, architecture-decisions, tech-stack, decision-documentation]
---
```

**Required sections:**

- **What Warrants an ADR** — Decisions with significant impact: technology choices, architectural patterns, integration approaches, security strategies, data modeling approaches. Include tech stack selection as a key category (language, framework, database, infrastructure, dev tooling)
- **ADR Structure** — Title, status (proposed/accepted/deprecated/superseded), context (forces at play), decision (what was decided), consequences (trade-offs accepted), alternatives considered
- **Evaluation Framework** — For technology decisions: team expertise, community size, fit with constraints, integration complexity, operational complexity, license compatibility, long-term maintenance
- **ADR Lifecycle** — When to create, when to supersede, when to deprecate. Cross-referencing between related ADRs. Recording implicit decisions that were never formalized
- **Common Pitfalls** — Recording decisions without alternatives, missing rationale, contradicting other ADRs without acknowledgment, failing to record decisions implied by architecture, technology hype bias
- **Quality Indicators** — Each ADR traceable to a requirement or constraint, alternatives genuinely considered (not straw-manned), consequences are honest (include downsides)

- [ ] **Step 3: Commit**

```bash
git add knowledge/core/domain-modeling.md knowledge/core/adr-craft.md
git commit -m "feat: add knowledge base — domain modeling and ADR craft"
```

### Task 12: Core Knowledge Base — Architecture, Database, API

**Files:**
- Create: `knowledge/core/system-architecture.md`
- Create: `knowledge/core/database-design.md`
- Create: `knowledge/core/api-design.md`

- [ ] **Step 1: Create system-architecture.md**

```yaml
---
name: system-architecture
description: Architecture patterns, component design, and project structure
topics: [architecture, components, modules, data-flows, project-structure]
---
```

**Required sections:**

- **Architecture Patterns** — Layered, hexagonal/ports-and-adapters, event-driven, microservices, modular monolith. When to use each. Trade-offs.
- **Component Design** — Identifying components from domain models, defining interfaces between components, managing dependencies (dependency inversion), separating concerns
- **Data Flow Design** — Request/response flows, event flows, data transformation pipelines. Diagramming conventions.
- **Module Organization** — Project directory structure, file naming conventions, module boundaries, import/dependency rules, preventing circular dependencies
- **State Management** — Where state lives, consistency strategies, caching approaches, session management
- **Extension Points** — Designing for extensibility: plugin systems, hooks, middleware, configuration-driven behavior. Extension points must be designed, not just documented.
- **Cross-Cutting Concerns** — Logging, error handling, monitoring, configuration management, feature flags
- **Common Pitfalls** — Over-architecting (microservices for a todo app), under-specifying interfaces, orphaned components, diagram/prose drift

- [ ] **Step 2: Create database-design.md**

```yaml
---
name: database-design
description: Database schema design, normalization, indexing, and migration patterns
topics: [database, schema, sql, nosql, migrations, indexing]
---
```

**Required sections:**

- **From Domain Models to Schema** — Mapping entities to tables, handling aggregates, representing value objects, modeling relationships (1:1, 1:N, M:N)
- **Normalization Decisions** — Normal forms, when to denormalize for performance, read-model vs write-model separation
- **Indexing Strategy** — Primary keys, foreign keys, covering indexes, partial indexes, composite indexes. Deriving index needs from known query patterns.
- **Constraint Design** — CHECK constraints from domain invariants, foreign key constraints from relationships, unique constraints from business rules
- **Migration Patterns** — Schema versioning, backwards-compatible migrations, data migrations, rollback strategies, zero-downtime migrations
- **NoSQL Considerations** — Document design, denormalization by default, embedding vs referencing, partition key selection
- **Common Pitfalls** — Over-normalization, missing indexes for common queries, migration ordering issues, not testing rollbacks

- [ ] **Step 3: Create api-design.md**

```yaml
---
name: api-design
description: API design principles for REST, GraphQL, and inter-service communication
topics: [api, rest, graphql, endpoints, contracts, versioning]
---
```

**Required sections:**

- **API-First Development** — Designing contracts before implementation, consumer-driven contract testing, API documentation as source of truth
- **REST Design** — Resource modeling, HTTP methods, status codes, URL structure, HATEOAS (when appropriate), content negotiation
- **GraphQL Design** — Schema-first design, type system, query complexity, N+1 prevention, subscription patterns
- **Error Contracts** — Structured error responses, error codes vs HTTP status codes, error categorization (client error, server error, validation error), error documentation
- **Authentication & Authorization** — Auth patterns per endpoint, token management, scope/permission models, API keys vs OAuth vs JWT
- **Pagination, Filtering, Sorting** — Cursor vs offset pagination, filter parameter design, sort parameter design, total count considerations
- **Versioning** — URL versioning, header versioning, evolution without versioning, breaking vs non-breaking changes
- **Idempotency** — Idempotency keys, safe retries, exactly-once semantics
- **Common Pitfalls** — Chatty APIs, missing error contracts, auth as afterthought, not designing for pagination from the start

- [ ] **Step 4: Commit**

```bash
git add knowledge/core/system-architecture.md knowledge/core/database-design.md knowledge/core/api-design.md
git commit -m "feat: add knowledge base — architecture, database, API design"
```

### Task 13: Core Knowledge Base — UX, Tasks, Testing, Operations, Security

**Files:**
- Create: `knowledge/core/ux-specification.md`
- Create: `knowledge/core/task-decomposition.md`
- Create: `knowledge/core/testing-strategy.md`
- Create: `knowledge/core/operations-runbook.md`
- Create: `knowledge/core/security-review.md`

- [ ] **Step 1: Create all 5 files**

Each follows the same format: YAML frontmatter + comprehensive sections.

**ux-specification.md** (topics: [ux, design-system, accessibility, wireframes]):
- User Flow Documentation — Journey mapping, state diagrams for interactions, happy path and error paths
- Component Architecture — Component hierarchy, prop/data flow, composition patterns, shared vs page-specific components
- Design System — Design tokens (colors, spacing, typography, shadows), base components, pattern library, dark/light mode
- Accessibility — WCAG compliance levels, keyboard navigation, screen reader support, color contrast, focus management
- Responsive Design — Breakpoint strategy, mobile-first vs desktop-first, layout behavior per breakpoint
- Common Pitfalls — Designing for happy path only, accessibility as afterthought, inconsistent spacing/typography

**task-decomposition.md** (topics: [tasks, decomposition, dependencies, user-stories]):
- User Stories to Tasks — Mapping features to stories, stories to implementation tasks, maintaining traceability
- Task Sizing — Right-sizing for agent sessions, splitting too-large tasks, combining too-small tasks, definition of "done"
- Dependency Analysis — Identifying task dependencies, building DAGs, detecting cycles, finding critical path
- Parallelization — Identifying independent tasks, managing shared-state tasks, merge strategies for parallel work
- Agent Context — What context each task needs (which docs to read), handoff information, assumed prior work
- Common Pitfalls — Tasks too vague ("implement backend"), missing dependencies, unrealistic parallelization

**testing-strategy.md** (topics: [testing, tdd, test-pyramid, quality-gates]):
- Test Pyramid — Unit, integration, e2e proportions. What to test at each level. Cost/benefit per level.
- Testing Patterns — Arrange/Act/Assert, Given/When/Then, test doubles (mocks, stubs, spies, fakes), snapshot testing, contract testing
- Coverage Strategy — Coverage targets per layer, meaningful vs vanity coverage, mutation testing
- Quality Gates — Pre-commit checks, CI pipeline checks, pre-merge requirements, performance benchmarks
- Test Data — Fixtures, factories, seeds, test database management, realistic vs minimal test data
- Common Pitfalls — Testing implementation details, flaky tests, slow test suites, testing through the UI for unit-level concerns

**operations-runbook.md** (topics: [operations, cicd, deployment, monitoring, dev-environment]):
- Dev Environment Setup — Local development prerequisites, environment variables, database setup, running the app locally, hot reload configuration
- CI/CD Pipeline — Build, test, lint, deploy stages. Parallelization. Caching. Artifact management.
- Deployment Strategies — Blue-green, canary, rolling, feature flags. Rollback procedures.
- Monitoring & Alerting — What to monitor (latency, error rate, saturation, traffic), alerting thresholds, dashboard design, on-call rotation
- Incident Response — Runbook format, escalation paths, post-mortem template, SLA definitions
- Common Pitfalls — Missing rollback procedures, alert fatigue, no local dev story, manual deployment steps

**security-review.md** (topics: [security, owasp, authentication, authorization, threat-modeling]):
- OWASP Top 10 — Injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, using components with known vulnerabilities, insufficient logging
- Authentication Patterns — Session-based, JWT, OAuth 2.0, OIDC, API keys, multi-factor
- Authorization Patterns — RBAC, ABAC, policy-based, resource-level permissions
- Data Protection — Encryption at rest, encryption in transit, PII handling, data classification, retention policies
- Secrets Management — Environment variables, vault systems, key rotation, never committing secrets
- Threat Modeling — STRIDE model, attack surface analysis, trust boundaries, data flow analysis for threats
- Dependency Auditing — Known vulnerability scanning, license compliance, supply chain security
- Common Pitfalls — Auth as afterthought, overly permissive defaults, missing input validation at boundaries, logging sensitive data

- [ ] **Step 2: Commit**

```bash
git add knowledge/core/ux-specification.md knowledge/core/task-decomposition.md
git add knowledge/core/testing-strategy.md knowledge/core/operations-runbook.md
git add knowledge/core/security-review.md
git commit -m "feat: add knowledge base — UX, tasks, testing, operations, security"
```

---

## Chunk 5: Knowledge Base — Review Expertise

Each review knowledge base document encodes the specific failure modes and multi-pass review criteria for its artifact type. These are the most critical knowledge base entries — they must contain actionable, specific review passes, not generic advice.

### Task 14: Review Knowledge Base — Methodology & Domain Modeling

**Files:**
- Create: `knowledge/review/review-methodology.md`
- Create: `knowledge/review/review-domain-modeling.md`

- [ ] **Step 1: Create review-methodology.md**

```yaml
---
name: review-methodology
description: Shared process for conducting multi-pass reviews of documentation artifacts
topics: [review, methodology, quality-assurance, multi-pass]
---
```

**Required sections:**

- **Multi-Pass Review Structure** — Why multiple focused passes beat a single read-through. Each pass targets one failure mode category. Passes should be ordered: coverage first, then consistency, then structural integrity, then downstream readiness.
- **Finding Categorization** — P0 (blocks next phase), P1 (significant gap), P2 (improvement opportunity), P3 (nice-to-have). Only P0 and P1 require fixes before proceeding.
- **Fix Planning** — Group related findings, estimate effort, prioritize by downstream impact. Create a fix plan before making changes (not ad hoc fixes).
- **Re-Validation** — After applying fixes, re-run the passes that produced findings. Verify fixes didn't introduce new issues.
- **Downstream Readiness Gate** — The final pass in every review: can the next phase proceed with these artifacts? What specific information does the next phase need?
- **Review Report Format** — Structured output: executive summary, per-pass findings, fix plan, fix log, re-validation results, downstream readiness assessment.

- [ ] **Step 2: Create review-domain-modeling.md**

```yaml
---
name: review-domain-modeling
description: Failure modes and review passes specific to domain modeling artifacts
topics: [review, domain-modeling, ddd, bounded-contexts]
---
```

**Required sections (each section is a review pass):**

- **Pass 1: PRD Coverage Audit** — Every PRD feature maps to at least one domain. No orphaned requirements. No phantom domains (domains with no PRD traceability).
- **Pass 2: Bounded Context Integrity** — Context boundaries are clean: no entity appears in multiple contexts without an explicit relationship. Shared kernel, if any, is documented. Anticorruption layers at context boundaries.
- **Pass 3: Entity vs Value Object Classification** — Entities have identity and lifecycle; value objects are immutable and compared by value. Misclassification is a common error. Check: does this "entity" actually need an identity? Does this "value object" actually have a lifecycle?
- **Pass 4: Aggregate Boundary Validation** — Aggregates enforce consistency boundaries. Too-large aggregates cause contention; too-small miss invariants. Check: can this invariant be enforced within a single aggregate? Does this aggregate need to reference another aggregate directly?
- **Pass 5: Domain Event Completeness** — Every state transition has a corresponding domain event. Events capture business-meaningful changes, not CRUD operations. Event payloads carry sufficient context for consumers.
- **Pass 6: Invariant Specification** — Invariants are testable assertions, not vague rules. Each invariant specifies: what must be true, when it must be true (always? only in certain states?), what happens on violation.
- **Pass 7: Ubiquitous Language Consistency** — Terminology is consistent across all domain models. No synonyms for the same concept. No homonyms (same term, different meanings in different contexts — these indicate a context boundary).
- **Pass 8: Cross-Domain Relationship Clarity** — Relationships between domains are explicit. Direction of dependency is clear. Communication mechanism is specified (events, direct calls, shared data).
- **Pass 9: Downstream Readiness** — Phase 2 (ADRs) needs: clear domain boundaries, technology-relevant constraints, performance-sensitive operations identified. Are these present?
- **Pass 10: Internal Consistency** — Cross-references resolve. Terminology doesn't drift within a single model. No contradictions between entity definitions and relationship diagrams.

- [ ] **Step 3: Commit**

```bash
git add knowledge/review/review-methodology.md knowledge/review/review-domain-modeling.md
git commit -m "feat: add knowledge base — review methodology and domain modeling review"
```

### Task 15: Review Knowledge Base — ADR, Architecture, Database, API

**Files:**
- Create: `knowledge/review/review-adr.md`
- Create: `knowledge/review/review-system-architecture.md`
- Create: `knowledge/review/review-database-schema.md`
- Create: `knowledge/review/review-api-contracts.md`

- [ ] **Step 1: Create all 4 review knowledge base files**

Each follows the multi-pass structure from review-methodology.md. Key passes per file:

**review-adr.md** (topics: [review, adr, decisions]):
- Pass 1: Decision Coverage — Every significant decision in the architecture has an ADR
- Pass 2: Rationale Quality — Each ADR has genuine alternatives (not straw-manned), honest consequences
- Pass 3: Contradiction Detection — No two ADRs make contradictory decisions without explicit acknowledgment
- Pass 4: Implied Decision Mining — Decisions visible in architecture/code but never formally recorded
- Pass 5: Status Hygiene — No stale "proposed" ADRs, supersession chains are clean
- Pass 6: Cross-Reference Integrity — ADRs referencing each other do so correctly
- Pass 7: Downstream Readiness — Phase 3 needs technology choices and pattern decisions finalized

**review-system-architecture.md** (topics: [review, architecture, components]):
- Pass 1: Domain Model Coverage — Every domain model maps to at least one component
- Pass 2: ADR Constraint Compliance — Architecture respects every ADR decision
- Pass 3: Data Flow Completeness — Every component appears in at least one data flow
- Pass 4: Module Structure Integrity — No circular imports, reasonable file sizes, clear module boundaries
- Pass 5: State Consistency — State management design handles all identified state files and their interactions
- Pass 6: Diagram/Prose Consistency — Diagrams and prose tell the same story
- Pass 7: Extension Point Integrity — Extension points are designed (not just documented)
- Pass 8: Invariant Verification — Architecture preserves domain invariants
- Pass 9: Downstream Readiness — Phases 4-7 can proceed with this architecture
- Pass 10: Internal Consistency — Terminology, cross-references, no contradictions

**review-database-schema.md** (topics: [review, database, schema]):
- Pass 1: Entity Coverage — Every domain entity maps to a table/collection
- Pass 2: Relationship Fidelity — Schema relationships match domain model relationships
- Pass 3: Normalization Justification — Normalization level justified for each table
- Pass 4: Index Coverage — Indexes cover known query patterns from architecture data flows
- Pass 5: Constraint Enforcement — Database constraints enforce domain invariants where possible
- Pass 6: Migration Safety — Migration plan handles rollbacks and data preservation
- Pass 7: Cross-Schema Consistency — If multiple schemas/databases, consistency across them
- Pass 8: Downstream Readiness — API contracts can be built on this schema

**review-api-contracts.md** (topics: [review, api, contracts]):
- Pass 1: Operation Coverage — Every domain operation that crosses a boundary has an endpoint
- Pass 2: Error Contract Completeness — Every endpoint has explicit error responses
- Pass 3: Auth/Authz Coverage — Every endpoint specifies auth requirements
- Pass 4: Versioning Consistency — Versioning strategy consistent with ADRs
- Pass 5: Payload Shape vs Domain Entities — Request/response shapes align with domain model
- Pass 6: Idempotency — Mutating operations document idempotency behavior
- Pass 7: Pagination/Filtering — List endpoints have pagination designed
- Pass 8: Downstream Readiness — Implementation tasks can be derived from these contracts

- [ ] **Step 2: Commit**

```bash
git add knowledge/review/review-adr.md knowledge/review/review-system-architecture.md
git add knowledge/review/review-database-schema.md knowledge/review/review-api-contracts.md
git commit -m "feat: add knowledge base — ADR, architecture, database, API reviews"
```

### Task 16: Review Knowledge Base — UX, Tasks, Testing, Operations, Security

**Files:**
- Create: `knowledge/review/review-ux-spec.md`
- Create: `knowledge/review/review-implementation-tasks.md`
- Create: `knowledge/review/review-testing-strategy.md`
- Create: `knowledge/review/review-operations.md`
- Create: `knowledge/review/review-security.md`

- [ ] **Step 1: Create all 5 review knowledge base files**

**review-ux-spec.md** (topics: [review, ux, design]):
- Pass 1: User Journey Coverage vs PRD
- Pass 2: Accessibility Compliance (WCAG level, keyboard nav, screen readers)
- Pass 3: Interaction State Completeness (loading, error, empty, populated for every component)
- Pass 4: Design System Consistency (tokens used consistently, no one-off values)
- Pass 5: Responsive Breakpoint Coverage (behavior defined for all breakpoints)
- Pass 6: Error State Handling (every user action that can fail has an error state)
- Pass 7: Component Hierarchy vs Architecture (frontend components align with architecture)

**review-implementation-tasks.md** (topics: [review, tasks, planning]):
- Pass 1: Architecture Coverage — Every component has implementation tasks
- Pass 2: Missing Dependencies — Tasks reference prerequisites correctly
- Pass 3: Task Sizing — No task too large for a single agent session, no task too small to be meaningful
- Pass 4: Acceptance Criteria — Every task has clear "done" criteria
- Pass 5: Critical Path Accuracy — Critical path identifies the actual bottleneck
- Pass 6: Parallelization Validity — Parallel tasks are truly independent
- Pass 7: Agent Context — Each task specifies which docs to read before starting

**review-testing-strategy.md** (topics: [review, testing, quality]):
- Pass 1: Coverage Gaps by Layer — Each architecture layer has test coverage defined
- Pass 2: Domain Invariant Test Cases — Every domain invariant has corresponding test scenarios
- Pass 3: Test Environment Assumptions — Test environment matches production constraints
- Pass 4: Performance Test Coverage — Performance-critical paths have benchmarks defined
- Pass 5: Integration Boundary Coverage — All component integration points have integration tests
- Pass 6: Quality Gate Completeness — CI pipeline catches all intended issues

**review-operations.md** (topics: [review, operations, deployment]):
- Pass 1: Deployment Strategy Completeness — Full deploy/rollback lifecycle documented
- Pass 2: Rollback Procedures — Every deployment type has a rollback procedure
- Pass 3: Monitoring Coverage — All critical metrics identified, dashboards defined
- Pass 4: Alerting Thresholds — Alerts have justified thresholds (not arbitrary)
- Pass 5: Runbook Scenarios — Common failure scenarios have runbook entries
- Pass 6: Dev Environment Parity — Local dev environment reasonably matches production
- Pass 7: DR/Backup Coverage — Disaster recovery approach documented

**review-security.md** (topics: [review, security, owasp]):
- Pass 1: OWASP Coverage — Each OWASP top 10 category addressed for this project
- Pass 2: Auth/Authz Boundary Alignment — Security boundaries match API contract auth requirements
- Pass 3: Secrets Management — No secrets in code, rotation strategy, vault integration
- Pass 4: Dependency Audit Coverage — Known vulnerability scanning in CI pipeline
- Pass 5: Threat Model Scenarios — Threats identified for all trust boundaries
- Pass 6: Data Classification — Data categorized by sensitivity, handling requirements per category
- Pass 7: Input Validation — Validation at all system boundaries (not just frontend)

- [ ] **Step 2: Commit**

```bash
git add knowledge/review/review-ux-spec.md knowledge/review/review-implementation-tasks.md
git add knowledge/review/review-testing-strategy.md knowledge/review/review-operations.md
git add knowledge/review/review-security.md
git commit -m "feat: add knowledge base — UX, tasks, testing, operations, security reviews"
```

---

## Chunk 6: Knowledge Base — Validation, Product, Finalization + Domain Model Updates + ADRs

### Task 17: Validation & Product & Finalization Knowledge Base

**Files:**
- Create: 7 files in `knowledge/validation/`
- Create: 2 files in `knowledge/product/`
- Create: 2 files in `knowledge/finalization/`

- [ ] **Step 1: Create all validation knowledge base files**

Each validation knowledge entry defines how to perform that specific validation. Format: frontmatter + sections covering process, what to check, how to check it, common issues found.

| File | name | Key content |
|------|------|-------------|
| `cross-phase-consistency.md` | cross-phase-consistency | Check naming consistency across all docs. Verify assumptions in later phases still hold from earlier phases. Validate interface contracts match on both sides. Check data shape consistency from domain model through schema through API through UI. |
| `traceability.md` | traceability | Build a matrix: PRD requirement → domain model → ADR → architecture component → implementation task. Every row should be complete. Missing cells indicate gaps. |
| `decision-completeness.md` | decision-completeness | Extract every decision from all docs (explicit and implied). Verify each has an ADR. Check for contradictions. Verify no "we'll decide later" items remain unresolved. |
| `critical-path-analysis.md` | critical-path-analysis | For each critical user journey from PRD: trace through architecture (which components), API (which endpoints), database (which queries), UX (which screens). Verify no gaps. |
| `implementability-review.md` | implementability-review | Read specs as an implementing agent. For each task: is there enough information to start? Are ambiguities resolved? Are error cases handled? Would you need to ask questions? Every question you'd ask is a gap. |
| `dependency-validation.md` | dependency-validation | Extract all dependency relationships between tasks. Build graph. Check for cycles. Verify ordering matches architectural constraints. Check that parallel tasks don't share state. |
| `scope-management.md` | scope-management | Compare every spec against PRD boundaries. Flag anything not traceable to a PRD requirement. Flag requirements that grew in scope during documentation phases. Identify gold-plating. |

- [ ] **Step 2: Create product knowledge base files**

**product/prd-craft.md** (topics: [prd, requirements, product]):
- Problem Statement — Specific, testable, not aspirational. "Users can't X because Y" not "make X better"
- Target Users — Identified personas with needs, not generic "users"
- Feature Scoping — What's in, what's out, what's deferred. MoSCoW or similar prioritization.
- Success Criteria — Measurable outcomes, not vanity metrics
- Constraints — Technical, timeline, budget, team, regulatory
- Non-Functional Requirements — Performance, security, accessibility, scalability. Quantified where possible.
- Competitive Context — What exists, how this is different, why users would switch

**product/gap-analysis.md** (topics: [gap-analysis, requirements, completeness]):
- Systematic Analysis Approach — Section-by-section review, cross-reference checking, edge case enumeration
- Ambiguity Detection — Requirements that could be interpreted multiple ways. "The system should be fast" vs "p95 latency under 200ms"
- Edge Case Discovery — Error scenarios, boundary conditions, concurrent access, data migration, empty states
- NFR Gap Patterns — Performance requirements missing, security requirements vague, accessibility not mentioned
- Contradiction Detection — Requirements that conflict (e.g., "real-time" and "batch processing")
- Innovation Opportunities — Missing features that would significantly improve the product

- [ ] **Step 3: Create finalization knowledge base files**

**finalization/developer-onboarding.md** (topics: [onboarding, documentation, getting-started]):
- Guide Structure — Purpose → Architecture overview → Key patterns → Setup → Common tasks → Where to find things → Troubleshooting
- Architecture Walkthrough — High-level diagram with narrative, key decisions summarized, pointer to ADRs for depth
- Getting Started — Prerequisites, clone, install, configure, run, verify. Must be copy-paste executable.
- Common Tasks — Adding a feature, fixing a bug, running tests, creating a PR. Step-by-step.
- Where to Find Things — File/directory map, key configuration files, important entry points

**finalization/implementation-playbook.md** (topics: [playbook, agents, implementation, coding-standards, git-workflow]):
- Task Execution Protocol — How agents pick tasks, claim them, execute, and hand off
- Coding Standards — Naming conventions, error handling patterns, logging patterns, import ordering, file structure. These are the standards agents MUST follow.
- Git Workflow — Branching strategy (trunk-based, feature branches, etc.), commit message format, PR process, merge strategy, CI requirements
- Context Requirements — Per-task context brief: which docs to read, what patterns to follow, what to avoid
- Quality Gates — What must pass before a task is considered complete: tests, lint, type check, review
- Inter-Agent Handoff — What to communicate when passing work: what was done, what assumptions were made, what's left

- [ ] **Step 4: Commit**

```bash
git add knowledge/validation/ knowledge/product/ knowledge/finalization/
git commit -m "feat: add knowledge base — validation, product, and finalization expertise"
```

### Task 18: New ADRs

**Files:**
- Create: 6 files in `docs/v2/adrs/`

- [ ] **Step 1: Determine next ADR number**

Check existing ADR files to find the highest number:
```bash
ls docs/v2/adrs/ | sort -n | tail -5
```

Use the next available number as `$NEXT` below. As of writing, the highest is ADR-040, so `$NEXT=041`. Adjust all numbers if ADRs have been added since.

- [ ] **Step 2: Create 6 new ADRs**

Each ADR follows the standard format: Title, Status, Context, Decision, Consequences.

**ADR supersession mapping:**
| New ADR | Supersedes |
|---------|-----------|
| ADR-$NEXT+0 (Meta-Prompt Architecture) | ADR-005, ADR-006, ADR-007, ADR-008, ADR-023, ADR-035, ADR-037 |
| ADR-$NEXT+1 (Knowledge Base) | — (new concept) |
| ADR-$NEXT+2 (Depth Scale) | ADR-016 |
| ADR-$NEXT+3 (Runtime Generation) | ADR-010 |
| ADR-$NEXT+4 (Assembled Prompt) | ADR-015 |
| ADR-$NEXT+5 (Phase-Specific Reviews) | — (new concept) |

**ADR-041: Meta-Prompt Architecture Over Hard-Coded Prompts**
- Context: Maintaining 29+ hard-coded prompts is costly. AI can generate contextual prompts at runtime.
- Decision: Replace hard-coded prompts with meta-prompts that declare intent. AI generates working prompts at runtime from meta-prompt + knowledge base + project context.
- Consequences: Dramatically reduces maintenance. Introduces non-determinism (bounded by knowledge base). Requires knowledge base to be comprehensive. Supersedes ADR-005, ADR-006, ADR-007, ADR-008, ADR-023, ADR-035, ADR-037.

**ADR-042: Knowledge Base as Domain Expertise Layer**
- Context: Domain expertise is currently embedded in hard-coded prompt text. This couples expertise to execution instructions.
- Decision: Separate domain expertise into a knowledge base (topic-organized markdown files). Meta-prompts reference knowledge base entries. Knowledge base is methodology-independent.
- Consequences: Domain expertise is reusable across pipeline steps. Can be improved independently. Must be comprehensive — quality of system depends on it.

**ADR-043: Depth Scale (1-5) Over Methodology-Specific Prompt Variants**
- Context: v2 proposed methodology-specific overrides and extensions (three-layer resolution). This creates a combinatorial maintenance problem.
- Decision: Use a 1-5 depth scale. Each meta-prompt defines concrete scaling guidance per depth level. Three preset methodologies (Deep=5, MVP=1, Custom=user-specified).
- Consequences: Single prompt per step (not per-methodology variants). Scaling guidance must be specific enough for AI to produce meaningfully different outputs.

**ADR-044: Runtime Prompt Generation Over Build-Time Resolution**
- Context: ADR-010 established build-time resolution. The meta-prompt approach requires runtime assembly (context + knowledge + instructions assembled at execution time).
- Decision: Prompt assembly happens at runtime (when `scaffold run` is invoked), not at build time. Supersedes ADR-010.
- Consequences: Prompts are always fresh with latest context. No stale built prompts. Assembly engine must be deterministic even though generation is not.

**ADR-045: Assembled Prompt Structure**
- Context: The AI receives a single assembled prompt containing meta-prompt + knowledge + context + instructions. The structure of this prompt affects output quality.
- Decision: Assembled prompt has defined sections in fixed order: system framing, meta-prompt, knowledge base, project context, methodology, user instructions, execution instruction.
- Consequences: Consistent prompt structure across all steps. Clear separation of concerns within the prompt.

**ADR-046: Phase-Specific Review Criteria Over Generic Review Template**
- Context: Each documentation artifact type has different failure modes. A generic review checklist misses artifact-specific issues.
- Decision: Each review phase (1a-10a) has its own meta-prompt AND its own knowledge base entry encoding failure modes specific to that artifact type. Reviews are not parameterized from a template.
- Consequences: 10 review meta-prompts + 10 review knowledge entries (plus shared methodology). Higher maintenance but dramatically better review quality.

- [ ] **Step 3: Commit**

```bash
git add docs/v2/adrs/ADR-041*.md docs/v2/adrs/ADR-042*.md docs/v2/adrs/ADR-043*.md
git add docs/v2/adrs/ADR-044*.md docs/v2/adrs/ADR-045*.md docs/v2/adrs/ADR-046*.md
git commit -m "feat: add ADRs for meta-prompt architecture decisions (041-046)"
```

### Task 19: Domain Model Updates

**Files:**
- Modify: 3 domain models to mark as superseded
- Modify: 5 domain models to transform

- [ ] **Step 1: Mark superseded domain models**

For each of these 3 files, add a supersession notice at the top (after the title):

- `docs/v2/domain-models/01-prompt-resolution.md` — "**Status: Superseded** by meta-prompt architecture (ADR-041). The three-layer prompt resolution system has been replaced by runtime prompt generation from meta-prompts + knowledge base."
- `docs/v2/domain-models/04-abstract-task-verbs.md` — "**Status: Superseded** by meta-prompt architecture (ADR-041). Abstract task verb markers are unnecessary; the AI knows tool preferences from project configuration."
- `docs/v2/domain-models/12-mixin-injection.md` — "**Status: Superseded** by meta-prompt architecture (ADR-041). Mixin injection is unnecessary; the AI adapts prompt content natively based on project context."

Do NOT delete the content — preserve it as historical reference.

- [ ] **Step 2: Transform domain models**

For each of these 5 files, add a transformation notice and update the content to match the new architecture:

- `docs/v2/domain-models/05-platform-adapters.md` — Simplify to thin delivery wrappers. Remove prompt content transformation. Keep platform-specific output formatting.
- `docs/v2/domain-models/06-config-validation.md` — Remove mixin axes. Add methodology + depth configuration. Update schema definition.
- `docs/v2/domain-models/08-prompt-frontmatter.md` — Rewrite for meta-prompt frontmatter (name, description, phase, dependencies, outputs, conditional, knowledge-base). Remove section targeting.
- `docs/v2/domain-models/09-cli-architecture.md` — Add `scaffold run` command. Remove `scaffold add`. Update `scaffold build` and `scaffold init` descriptions.
- `docs/v2/domain-models/14-init-wizard.md` — Replace mixin configuration with methodology selection (Deep/MVP/Custom). Simplify detection heuristics to conditional step suggestions.

- [ ] **Step 3: Supersede ADRs**

For each superseded ADR, update the status field to "Superseded" and add a pointer to the replacement ADR:

| ADR to Supersede | Superseded By | Reason |
|-----------------|---------------|--------|
| ADR-005 (three-layer resolution) | ADR-041 | Replaced by meta-prompt architecture |
| ADR-006 (mixin injection) | ADR-041 | AI adapts natively |
| ADR-007 (mixin markers) | ADR-041 | No markers needed |
| ADR-008 (abstract-task-verbs) | ADR-041 | Tied to retired domain model 04 |
| ADR-010 (build-time resolution) | ADR-044 | Runtime assembly |
| ADR-015 (prompt frontmatter) | ADR-045 | New meta-prompt frontmatter |
| ADR-016 (methodology manifest) | ADR-043 | Depth scale replaces manifests |
| ADR-023 (phrase-level-tool-mapping) | ADR-041 | Tied to abstract task verbs |
| ADR-035 (non-recursive-injection) | ADR-041 | Tied to mixin injection |
| ADR-037 (task-verb-global-scope) | ADR-041 | Tied to abstract task verbs |

Format for each:
```markdown
**Status:** Superseded by ADR-0XX (title)
```

- [ ] **Step 4: Commit**

```bash
git add docs/v2/domain-models/ docs/v2/adrs/
git commit -m "docs: update domain models (3 superseded, 5 transformed) and supersede 6 ADRs"
```

### Task 20: Final Validation

- [ ] **Step 1: Verify file counts**

```bash
echo "Meta-prompts:" && find pipeline -name '*.md' | wc -l  # expect 32
echo "Knowledge base:" && find knowledge -name '*.md' | wc -l  # expect 32
echo "Methodology presets:" && find methodology -name '*.yml' | wc -l  # expect 3
echo "New ADRs:" && ls docs/v2/adrs/ADR-04[1-6]*.md | wc -l  # expect 6
```

- [ ] **Step 2: Verify cross-references**

Check that every `knowledge-base` reference in meta-prompt frontmatter matches an actual knowledge base file name:

```bash
# Extract all knowledge-base references from meta-prompts
grep -r 'knowledge-base:' pipeline/ | grep -oP '\[.*?\]'

# Extract all name fields from knowledge base files
grep -r '^name:' knowledge/
```

Every name referenced in meta-prompt frontmatter must exist in knowledge base files.

- [ ] **Step 3: Verify dependency chain**

Check that every `dependencies` reference in meta-prompt frontmatter matches an actual meta-prompt `name`:

```bash
# Extract all dependencies
grep -r 'dependencies:' pipeline/ | grep -oP '\[.*?\]'

# Extract all names
grep -r '^name:' pipeline/
```

Every dependency must resolve to an existing meta-prompt name.

- [ ] **Step 4: Update index files**

Update `docs/v2/domain-models/index.md` to reflect superseded (01, 04, 12) and transformed (05, 06, 08, 09, 14) domain models.

Update `docs/v2/adrs/index.md` (if it exists) to include the 6 new ADRs and mark the 10 superseded ADRs.

- [ ] **Step 5: Commit any fixes**

```bash
git add pipeline/ knowledge/ docs/v2/domain-models/index.md docs/v2/adrs/
git commit -m "fix: resolve cross-reference issues and update indexes from final validation"
```
