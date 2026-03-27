---
description: "Model project domains using DDD tactical and strategic patterns"
long-description: "Reads the PRD and user stories, then creates docs/domain-models/ with bounded contexts, entities, value objects, aggregates, domain events, and invariants using Domain-Driven Design."
---

Read `docs/prd.md` and `docs/user-stories.md`, then create a complete domain model for the project using Domain-Driven Design. Produce one file per bounded context in `docs/domain-models/` plus an `index.md` overview of all domains and their relationships.

## Mode Detection

Before starting, check if the `docs/domain-models/` directory already exists:

**If the directory does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the directory exists -> UPDATE MODE**:
1. **Read & analyze**: Read all existing model files and `docs/domain-models/index.md`. Check for a tracking comment on line 1 of `index.md`: `<!-- scaffold:domain-modeling v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing models against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing models
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific entity decisions, relationship choices, invariant customizations
3. **Cross-doc consistency**: Read related docs (`docs/prd.md`, `docs/user-stories.md`) and verify models align with current requirements. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Domain/Section | Detail |
   |--------|----------------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Models have been significantly customized. Update will add missing elements but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Update models from current docs (respecting preserve rules). Verify cross-domain consistency.
6. **Update tracking comment**: Add/update on line 1 of `index.md`: `<!-- scaffold:domain-modeling v<ver> <date> -->`
7. **Post-update summary**: Report domains added, sections restructured, content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing models rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/domain-models/` directory
- **Secondary output**: `docs/domain-models/index.md`
- **Preserve**: Entity relationship decisions, aggregate boundary justifications, domain-specific invariants, ubiquitous language glossary entries
- **Related docs**: `docs/prd.md`, `docs/user-stories.md`, `docs/prd-innovation.md`
- **Special rules**: Never delete user-customized invariants or relationship decisions without explicit approval. Preserve ubiquitous language terms that have been refined.

---

## Domain Discovery

### From User Stories
- Extract nouns from acceptance criteria — these are candidate entities
- Extract state changes ("when X happens, Y changes to Z") — these are candidate domain events
- Identify where multiple entities must change atomically — these suggest aggregate boundaries
- Group stories by the entities they reference — entity clusters suggest bounded contexts

### From PRD
- Group features by the nouns they operate on. Features sharing nouns likely share a context.
- Look for natural transaction boundaries. Features requiring atomic consistency share a context.
- Identify where the same word means different things — that marks a context boundary.

### Subdomain Classification
Classify each domain by strategic value:
- **Core Domain** — Differentiates the product. Deserves the most rigorous modeling.
- **Supporting Domain** — Necessary but not a differentiator. Solid modeling, less investment.
- **Generic Domain** — Solved problems (auth, email, logging). Use existing solutions.

---

## What Each Domain Model File Must Contain

### Entity Definitions
For each entity:
- Name and bounded context
- Identity mechanism (UUID, natural key, etc.)
- Attributes with types (use TypeScript-style interfaces)
- State machine (valid states and transitions)
- Invariants (business rules that must always hold)
- Relationships to other entities (with cardinality and direction)

### Value Objects
For each value object:
- Attributes and validation rules
- Self-validation on construction (invalid value objects must never exist)
- Immutability — all "modification" operations return new instances
- Common candidates: Money, EmailAddress, DateRange, Address

### Aggregates
For each aggregate:
- Aggregate root (single entry point for modifications)
- Internal entities (not accessible outside the aggregate)
- Invariants spanning multiple entities within the aggregate
- Cross-aggregate references by ID only, never direct object references
- Size justification — why this grouping represents the smallest consistency boundary

### Domain Events
For each event:
- Past-tense name: `OrderPlaced`, `UserRegistered`, `PaymentProcessed`
- Triggering aggregate and action
- Payload (aggregate ID, timestamp, changed data, correlation ID)
- Consumers and their resulting actions
- Timing expectations (synchronous or eventual consistency)

### Domain Services
Stateless operations that don't belong to any single entity:
- Operations involving multiple aggregates
- Operations requiring external information
- Only when placing the operation on an entity would violate single responsibility

---

## Index File (docs/domain-models/index.md)

The index must contain:
- Overview of all bounded contexts with one-sentence descriptions
- Context map showing relationships between contexts (Shared Kernel, Customer-Supplier, Anticorruption Layer, etc.)
- Integration mechanisms between contexts (REST, events, shared database)
- Data flow direction between contexts
- Ubiquitous language glossary — every term used across models with its definition

---

## Quality Criteria

- Every PRD feature maps to at least one domain
- Entity relationships are explicit (not implied)
- Aggregate boundaries are justified (why this grouping?)
- Domain events cover all state transitions from user stories
- Invariants are testable assertions, not vague rules
- Ubiquitous language is consistent across all domain models
- Cross-domain relationships are documented at context boundaries
- Value objects outnumber entities (most concepts are values, not identities)

---

## Process

1. **Read all inputs** — Read `docs/prd.md` and `docs/user-stories.md` completely. Read `docs/prd-innovation.md` if it exists.
2. **Use AskUserQuestionTool** for these decisions:
   - **Modeling depth**: Full DDD (separate files per domain, detailed tactical patterns) or lightweight (single-file entity overview with key relationships)?
   - **Any known domain boundaries**: Does the user already have opinions about how domains should be organized?
3. **Use subagents** to research domain patterns for the project's specific problem space in parallel
4. **Discover domains** using the techniques above — extract entities from stories, identify bounded contexts from noun clusters
5. **Create domain model files** — one per bounded context with all required sections
6. **Create index.md** with context map, relationships, and ubiquitous language glossary
7. **Cross-validate** — verify every PRD feature and every user story maps to at least one domain entity
8. If using Beads: create a task (`bd create "docs: domain modeling" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)
10. If this work surfaces implementation tasks (missing requirements, ambiguous stories), create separate Beads tasks — don't try to resolve them now

## After This Step

When this step is complete, tell the user:

---
**Phase 1 complete** — Domain models created in `docs/domain-models/`. Ubiquitous language established.

**Next:** Run `/scaffold:adrs` — Document architecture decisions including technology selection.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
