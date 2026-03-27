---
description: "Design system architecture with components, data flows, and module structure"
long-description: "Reads domain models and ADRs, then creates docs/system-architecture.md defining component design, data flows, module organization, state management, and extension points."
---

Read `docs/domain-models/`, `docs/adrs/`, and `docs/plan.md`, then design and document the system architecture. Create `docs/system-architecture.md` translating domain models and ADR decisions into a concrete component structure, data flows, and module organization.

## Mode Detection

Before starting, check if `docs/system-architecture.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:system-architecture v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing sections against what this prompt would produce fresh. Categorize:
   - **ADD** — Required sections missing from the existing document
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific component decisions, custom data flows, directory structure choices
3. **Cross-doc consistency**: Read related docs (`docs/domain-models/`, `docs/adrs/`, `docs/plan.md`) and verify architecture aligns with current domain models and decisions. Skip any that don't exist.
4. **Preview changes**: Present the user a summary table. Wait for approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve project-specific content.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:system-architecture v<ver> <date> -->`
7. **Post-update summary**: Report sections added, restructured, preserved, and cross-doc issues found.

**In both modes**, follow all instructions below.

### Update Mode Specifics
- **Primary output**: `docs/system-architecture.md`
- **Preserve**: Component decisions, custom data flow diagrams, module organization choices, directory structure, extension point designs
- **Related docs**: `docs/domain-models/`, `docs/adrs/`, `docs/plan.md`
- **Special rules**: Never remove extension points that are already implemented. Preserve directory structure decisions that are reflected in the codebase.

---

## What the Document Must Cover

### 1. Architecture Pattern
State the chosen architecture pattern (from ADRs) and justify it for this project:
- Modular monolith, hexagonal, event-driven, microservices, or layered
- Why this pattern fits the project's domain, team size, and requirements
- Trade-offs accepted

### 2. Component Design
Map domain models to architecture components:

| Domain Concept | Architecture Component |
|----------------|----------------------|
| Bounded Context | Top-level module/package |
| Aggregate | Service class or sub-module |
| Domain Event | Event interface / message type |
| Repository | Data access interface |
| Domain Service | Application service |
| Value Object | Shared type within the module |

For each component, define:
- Public interface (methods/endpoints, parameters, return types, error conditions)
- Dependencies (what it requires, what it provides)
- Internal structure (sub-components, if applicable)

### 3. Dependency Management
Define the dependency direction rules:
```
Presentation -> Application -> Domain <- Infrastructure
```
- Domain has zero external dependencies
- Application orchestrates domain objects
- Infrastructure implements domain interfaces
- Presentation depends on application services
- Dependencies must be acyclic — no circular references

### 4. Data Flow Design

**Request/response flows** — trace the path of major user requests through every component:
```
Client Request -> Router -> Controller -> Application Service -> Domain Model -> Repository
```

For each major user flow from the PRD:
- Trace through every component it touches
- Identify data transformations at each boundary (DTO -> Command -> Entity -> Persistence Model)
- Document error paths (what happens when the database is down, the external API fails, validation rejects input)

**Event flows** — for event-driven interactions:
- Producing aggregate and triggering action
- Event name and payload schema
- All consumers and resulting actions
- Error handling for consumer failures

### 5. Module Organization / Project Directory Structure

Define the project directory structure with file-level granularity. Choose the organization approach:

**Feature-based (vertical slices)** — self-contained features, best for parallel agents:
```
src/features/<name>/controllers/ services/ models/ repositories/ events/ tests/
```

**Hybrid (layers within features)** — feature isolation with clear infrastructure separation:
```
src/features/<name>/<name>.controller.ts, <name>.service.ts, etc.
src/shared/ middleware/ utils/
src/infrastructure/ database/ messaging/ external-apis/
```

Include:
- File naming conventions (kebab-case, snake_case, PascalCase — match the stack)
- Module boundary rules (barrel/index files, no reaching into another module's internals)
- Import ordering convention and path aliases

### 6. State Management
Define where state lives and who owns it:
- **Server-side**: Database (persistent), cache (derived), session store, application memory
- **Client-side** (if applicable): URL params (navigational), component state (UI), client store (shared), local storage (persistent)
- Consistency strategy per data type (strong, eventual, optimistic)
- Caching decisions (only with evidence of performance need)

### 7. Cross-Cutting Concerns
- **Logging**: Structured JSON, log levels, what to log vs. what NEVER to log, correlation IDs
- **Error handling**: Fail fast, error type distinctions (client/server/domain), translation between layers, retry with backoff
- **Configuration**: Environment-based, validated at startup, typed, secrets separated
- **Feature flags**: Runtime toggles with cleanup plan (if applicable)

### 8. Extension Points
Document designed extension points (not speculative):
- Plugin systems, middleware pipelines, configuration-driven behavior, event hooks
- Each must have a defined interface, documented constraints, and default implementation

---

## Quality Criteria

- Every domain model lands in a component or module
- Every ADR constraint is respected in the architecture
- All components appear in at least one data flow diagram
- Extension points are designed, not just listed
- Project directory structure is defined with file-level granularity
- Error paths are documented for every external dependency
- No orphaned components (every component appears in a data flow)
- Diagrams and prose are consistent (no contradictions between text and structure)

---

## Process

1. **Read all inputs** — Read `docs/domain-models/`, `docs/adrs/`, and `docs/plan.md` completely.
2. **Use AskUserQuestionTool** for these decisions:
   - **Architecture depth**: Full specification with detailed data flows, or high-level component overview sufficient for agents to build without ambiguity?
   - **Directory structure preference**: Feature-based, layer-based, or hybrid? Any existing conventions to follow?
   - **State management approach**: Any preferences for client-side state management (if applicable)?
3. **Use subagents** to research architecture patterns for the project's specific stack and domain
4. **Map domain to components** — translate bounded contexts, aggregates, and events into concrete architecture components
5. **Design data flows** — trace every major user flow through the component structure
6. **Define directory structure** — specify file naming, module boundaries, and import rules
7. **Document cross-cutting concerns** — logging, error handling, configuration, feature flags
8. **Cross-validate** — verify every domain model has a home, every ADR is respected, no orphaned components
9. If using Beads: create a task (`bd create "docs: system architecture" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — `docs/system-architecture.md` created with component design, data flows, and module structure.

**Next:** Run `/scaffold:database-schema` (if project uses a database) or `/scaffold:api-contracts` (if project exposes APIs) — begin specification phase.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
