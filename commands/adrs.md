---
description: "Document architecture decisions as ADRs with alternatives and trade-offs"
long-description: "Reads domain models and PRD, then creates docs/adrs/ with Architecture Decision Records covering technology selection, architectural patterns, data architecture, and integration decisions."
---

Read `docs/domain-models/`, `docs/prd.md`, and existing project context, then identify and document all significant architecture decisions. Create one ADR file per decision (or decision group) in `docs/adrs/` plus an `index.md` decision log overview.

## Mode Detection

Before starting, check if the `docs/adrs/` directory already exists:

**If the directory does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the directory exists -> UPDATE MODE**:
1. **Read & analyze**: Read all existing ADR files and `docs/adrs/index.md`. Check for a tracking comment on line 1 of `index.md`: `<!-- scaffold:adrs v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare existing ADRs against what this prompt would produce fresh. Categorize:
   - **ADD** — Decisions that should exist but don't have an ADR
   - **SUPERSEDE** — Existing ADRs whose context has changed, needing new ADRs
   - **PRESERVE** — Existing ADRs that are still current and accurate
3. **Cross-doc consistency**: Read related docs (`docs/domain-models/`, `docs/prd.md`) and verify ADRs align with current domain models and requirements.
4. **Preview changes**: Present the user a summary:
   | Action | ADR | Detail |
   |--------|-----|--------|
   | ADD | ... | ... |
   | SUPERSEDE | ... | ... |
   | PRESERVE | ... | ... |
   Wait for user approval before proceeding.
5. **Execute update**: Add new ADRs, supersede outdated ones (mark old as "Superseded by ADR-NNN"), preserve current ones.
6. **Update tracking comment**: Add/update on line 1 of `index.md`: `<!-- scaffold:adrs v<ver> <date> -->`
7. **Post-update summary**: Report ADRs added, superseded, preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing ADRs rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/adrs/` directory
- **Secondary output**: `docs/adrs/index.md`
- **Preserve**: All existing ADRs (never delete — mark as superseded or deprecated). User-added rationale and custom evaluation criteria.
- **Related docs**: `docs/domain-models/`, `docs/prd.md`
- **Special rules**: Never delete an ADR. Superseded or deprecated ADRs are marked, not removed. The history of decisions is valuable context.

---

## ADR Structure

Each ADR file follows the format `ADR-NNN-title.md`:

### Required Sections

**Title**: `ADR-NNN: <decision statement>` — a concise decision, not a question.
- Good: `ADR-003: Use PostgreSQL for persistent storage`
- Bad: `ADR-003: Database selection`

**Status**: Exactly one of: Proposed, Accepted, Deprecated, Superseded.

**Context**: The forces at play — what problem are we solving, what constraints exist.
- Link to PRD section or user story driving the decision
- Technical constraints (performance, team expertise, existing infrastructure)
- Business constraints (budget, timeline, compliance)
- Assumptions and their risk of being wrong

**Decision**: Clear, unambiguous, actionable, scoped statement.

**Consequences**: Both benefits AND costs — honestly.
- What does this enable? What risks does it mitigate?
- What becomes harder? What options are foreclosed?
- What operational burden is added?

**Alternatives Considered**: For each rejected alternative:
- What it was and why it was considered
- Specific reasons for rejection (not "we prefer X")

---

## What Warrants an ADR

### Technology Selection (always)
- Programming language and runtime
- Framework selection
- Database engine
- ORM or data access layer
- Infrastructure and hosting
- Authentication provider
- CI/CD platform
- Dev tooling (linter, formatter, test runner, build tool)

### Architectural Patterns (always)
- Monolith vs. microservices vs. modular monolith
- Layered vs. hexagonal vs. event-driven
- Server-side vs. client-side rendering
- Synchronous vs. event-driven communication
- Caching strategy

### Data Architecture
- Normalization level and deliberate denormalizations
- Event sourcing vs. state-based persistence
- Read/write model separation (CQRS)
- Multi-tenancy approach

### Integration Decisions
- API style (REST vs. GraphQL vs. gRPC)
- Authentication mechanism (JWT vs. session vs. API key)
- Third-party service selections
- Message broker selection

### What Does NOT Warrant an ADR
- Code style preferences (use linter config)
- Library utility choices for a single function
- Implementation details within a bounded context
- Decisions with no realistic alternatives

---

## Evaluation Framework for Technology Decisions

Assess each option against weighted criteria:

| Criterion | Description |
|-----------|-------------|
| AI familiarity | Well-represented in training data? Fewer hallucinations/bugs? |
| Fit with requirements | Naturally supports PRD features? |
| Community/ecosystem | Active maintenance, rich plugins, responsive issues? |
| Integration complexity | Composes well with other stack choices? |
| Operational complexity | What does it require in production? |
| License compatibility | Permits intended use? |
| Long-term maintenance | Likely maintained in 3-5 years? |

For significant decisions, include a weighted evaluation matrix in the ADR.

### Grouping Related Decisions
Related technology decisions can share a single ADR:
- "Backend technology stack" (language + framework + ORM + auth)
- "Frontend technology stack" (framework + state management + styling)
- "Database and data access" (engine + migration tool + caching)
- "Infrastructure and deployment" (hosting + CI/CD + monitoring)
- "Developer tooling" (linter + formatter + test runner + hooks)

---

## Quality Criteria

- Every technology in the dependency manifest has a corresponding ADR
- Every ADR traces to a requirement or constraint
- Alternatives are genuinely considered with specific rejection reasons
- Consequences are honest — every ADR lists at least one downside
- No contradictions between ADRs (or contradictions are acknowledged)
- ADR set covers all layers: backend, frontend, database, infrastructure, tooling, deployment, testing, security
- Status is current — no accepted ADRs describing how things used to work
- Cross-references are complete between related ADRs

---

## Process

1. **Read all inputs** — Read `docs/domain-models/` to understand what the architecture must support. Read `docs/prd.md` for requirements and constraints.
2. **Use AskUserQuestionTool** for these decisions:
   - **Known technology preferences**: Any pre-decided technology choices (language, framework, hosting)?
   - **Decision depth**: Full evaluation matrices for each decision, or brief rationale for obvious choices?
   - **Team context**: Team size, expertise, and familiarity with candidate technologies?
3. **Use subagents** to research technology options for the project's specific requirements in parallel
4. **Identify all decisions** that need ADRs — enumerate across all categories above
5. **Create ADR files** with the required structure, one per decision or decision group
6. **Create index.md** with a decision log table (number, title, status, date)
7. **Cross-validate** — verify no ADR contradicts another, all cross-references are complete
8. If using Beads: create a task (`bd create "docs: architecture decision records" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)
10. If this work surfaces implementation tasks or unresolved questions, create separate Beads tasks

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — Architecture Decision Records created in `docs/adrs/`. Technology choices and architectural patterns documented.

**Next:** Run `/scaffold:system-architecture` — Design system architecture from domain models and ADR decisions.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
