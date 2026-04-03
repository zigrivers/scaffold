---
name: enhancement-workflow
description: Discovery and implementation workflow for adding features to existing projects
topics: [enhancement, features, planning, discovery]
---

# Enhancement Workflow

Expert knowledge for discovering, planning, and implementing enhancements to existing projects. Covers the four-phase discovery flow, impact analysis, documentation updates, and task creation patterns.

## Summary

### 4-Phase Discovery Flow

1. **Discovery** — Understand the problem space, review existing docs, challenge scope, assess impact
2. **Documentation** — Update project docs with the new feature, add user stories
3. **Task Creation** — Break the enhancement into implementable tasks with dependencies
4. **Summary** — Produce an enhancement summary with implementation order and follow-up suggestions

### Impact Analysis

Before committing to an enhancement, assess its fit within the existing architecture, its scope relative to the project, and its technical impact on existing modules.

### Documentation Updates

Every enhancement must update the project's planning and story documents with traceability markers so the change history is auditable.

### Task Creation

One task per user story for small/medium enhancements. Larger enhancements decompose into data model, backend, frontend, and polish phases with explicit dependencies.

## Deep Guidance

### Phase 1: Discovery

Discovery is the most important phase. Skipping it leads to scope creep, architectural misalignment, and wasted implementation effort.

#### Review Existing Documentation

Read these documents in order before proposing any changes:

1. **Product vision** (`docs/vision.md` or equivalent) — understand the project's purpose and direction
2. **PRD** (`docs/prd.md`) — understand existing requirements and constraints
3. **User stories** (`docs/user-stories.md`) — understand who uses the system and how
4. **Architecture** (`docs/system-architecture.md` or ADRs) — understand the technical structure
5. **Coding standards** (`docs/coding-standards.md`) — understand conventions you must follow
6. **TDD standards** (`docs/tdd-standards.md`) — understand testing expectations
7. **Project structure** (`docs/project-structure.md`) — understand where code lives
8. **Source code** — read the modules most relevant to the enhancement

#### Understand the Problem

- What user problem does this enhancement solve?
- Is the problem validated (user feedback, metrics, strategic direction)?
- Are there existing features that partially solve this problem?
- Could an existing feature be extended instead of building something new?

#### Challenge Scope

Actively resist scope expansion:

- What is the minimum viable version of this enhancement?
- What can be deferred to a follow-up?
- Is this a single feature or actually multiple features bundled together?
- Would a simpler approach solve 80% of the problem?

#### Innovation Pass

After understanding the problem and challenging the scope:

- **Competitive analysis** — how do similar products solve this problem?
- **Enhancement opportunities** — are there adjacent improvements that are low-effort but high-value?
- **AI-native possibilities** — can AI capabilities enable a better solution than a traditional approach?

#### Impact Analysis

Assess the enhancement along three dimensions:

**Fit check:**
- Does this align with the product vision?
- Does it complement existing features or conflict with them?
- Is now the right time to build this?

**Scope assessment:**
- How many modules are affected?
- How many new entities or data models are needed?
- Estimate: small (1-2 tasks), medium (3-5 tasks), or large (6+ tasks)

**Technical impact:**
- Which existing modules need modification?
- Are there performance implications?
- Does this affect the API contract (breaking changes)?
- Are there security implications?

### Phase 2: Documentation

Every enhancement must leave a documentation trail.

#### Update Planning Documents

Update `docs/plan.md` (or equivalent planning document) with the new feature:

- Add a section describing the enhancement
- Include traceability markers: `[Enhancement added YYYY-MM-DD]`
- Reference the motivation (user feedback, strategic goal, bug report)
- List affected modules and components

#### Add User Stories

Add new user stories to `docs/user-stories.md` following INVEST criteria:

- **I**ndependent — can be implemented without other new stories
- **N**egotiable — details can be discussed during implementation
- **V**aluable — delivers value to a specific user role
- **E**stimable — small enough to estimate effort
- **S**mall — completable in one task or a small number of tasks
- **T**estable — has clear acceptance criteria that can be automated

**Story format:**

```
As a [role], I want [capability] so that [benefit].

Acceptance criteria:
- [ ] Given [context], when [action], then [result]
- [ ] Given [context], when [action], then [result]
```

### Phase 3: Task Creation

Convert user stories into implementable tasks.

#### Small/Medium Enhancements (1-5 tasks)

- One task per user story
- Each task includes: description, acceptance criteria, test expectations, and affected files
- Set dependencies between tasks where ordering matters

#### Large Enhancements (6+ tasks)

Decompose into implementation phases:

1. **Data model** — schema changes, migrations, entity definitions
2. **Backend** — API endpoints, business logic, service layer
3. **Frontend** — UI components, pages, client-side logic
4. **Polish** — error handling edge cases, performance optimization, documentation

Each phase may contain multiple tasks. Dependencies flow downward: data model before backend, backend before frontend, frontend before polish.

#### Task Creation with Beads

If `.beads/` directory exists:

```bash
bd create --title "Add user endpoint" --depends-on bd-41
```

#### Task Creation Without Beads

Add tasks to the project's task tracking system (implementation plan, GitHub Issues, etc.) with:
- Unique ID
- Title and description
- Dependencies (list of blocking task IDs)
- Acceptance criteria
- Estimated scope (S/M/L)

### Phase 4: Summary

Produce an enhancement summary that includes:

1. **Enhancement description** — one paragraph summarizing what was planned
2. **Documentation changes** — list of docs updated and what was added
3. **Tasks created** — numbered list of tasks with IDs, titles, and dependencies
4. **Implementation order** — recommended sequence accounting for dependencies
5. **Follow-up suggestions** — reviews to schedule, related enhancements to consider, risks to monitor

### Complexity Gate

Not every change requires the full enhancement workflow. Use the quick-task path for simple changes and redirect to enhancement workflow when complexity exceeds a threshold.

**Redirect from quick-task to enhancement workflow when any of these are true:**

- Requires updates to planning or design documents
- Introduces a new user-facing feature (not just a fix or tweak)
- Affects 3 or more modules
- Requires new data entities, models, or schema changes
- Needs 4 or more implementation tasks
- Changes the API contract in a way that affects consumers

**Stay on quick-task path when:**
- Bug fix with clear root cause and limited scope
- Configuration change
- Documentation-only update
- Single-file refactor
- Test addition for existing behavior

## See Also

- [task-decomposition](../core/task-decomposition.md) — Breaking work into implementable tasks
- [user-stories](../core/user-stories.md) — User story writing patterns
- [task-claiming-strategy](./task-claiming-strategy.md) — How agents select and claim tasks
