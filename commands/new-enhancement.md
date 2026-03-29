---
description: "Add a new feature to an existing project"
long-description: "Walks you through adding a feature the right way — updating the PRD, creating new user stories, running an innovation pass, and generating implementation tasks that integrate with your existing plan."
---

## Purpose
Guide the addition of a new feature or significant enhancement to an existing
project. Walks through discovery and impact analysis, updates the PRD and
user stories, creates implementation tasks, and optionally begins execution.
This is the full-weight entry point for work that goes beyond a quick fix.

## Inputs
- $ARGUMENTS (required) — description of the enhancement to add
- docs/plan.md (required) — current PRD: vision, personas, features, data model
- docs/user-stories.md (required) — existing stories and epics (note the last story ID used)
- docs/tech-stack.md (required) — technical constraints and patterns
- docs/coding-standards.md (required) — code conventions, styling rules, commit format
- docs/project-structure.md (required) — where new files should go
- docs/tdd-standards.md (required) — test categories and patterns for task descriptions
- docs/design-system.md (optional) — design tokens, component patterns (if frontend changes)
- CLAUDE.md (required) — project conventions, key commands, workflow
- .beads/ (conditional) — Beads task tracking if configured
- Relevant source code if needed to understand current implementation

## Expected Outputs
- Updated `docs/plan.md` with new feature requirements
- Updated `docs/user-stories.md` with new stories and acceptance criteria
- Implementation tasks created via Beads or documented in implementation plan
- Enhancement summary with implementation order

## Quality Criteria
- (mvp) Impact analysis completed before documentation changes
- (mvp) PRD feature description is thorough enough for an AI agent to build without follow-up questions
- (mvp) User stories follow INVEST criteria
- (mvp) Acceptance criteria are testable Given/When/Then scenarios
- (mvp) Task dependencies are identified and documented
- (deep) Innovation pass explores competitive landscape and AI-native possibilities
- (deep) Cross-reference check verifies consistency between PRD and user stories
- (deep) Frozen artifact handling preserves version history
- (deep) Follow-up review recommendations based on enhancement scope

## Methodology Scaling
- **deep**: Full discovery with innovation pass, competitive analysis,
  detailed impact analysis, comprehensive PRD and story updates, dependency
  graph, implementation order, follow-up review recommendations.
- **mvp**: Streamlined discovery, basic impact analysis, PRD feature addition,
  minimal user stories with acceptance criteria, task list with dependencies.
  Skip innovation pass, competitive analysis, and follow-up recommendations.
- **custom:depth(1-5)**: Depth 1: basic PRD feature addition, minimal user stories,
  task creation. Depth 2: add impact check and dependency identification. Depth 3:
  add detailed impact analysis, dependency management, cross-reference check. Depth 4:
  add innovation pass, frozen artifact handling, migration considerations. Depth 5:
  full workflow with competitive analysis, AI-native possibilities, and follow-up
  review recommendations.

## Mode Detection
This is a document-modifying execution command. It updates existing documents
(plan.md, user-stories.md) in place but does not create a new standalone output.
- Always operates in ENHANCEMENT MODE.
- PRD and user stories are updated in place (append, do not replace).

## Update Mode Specifics
- **Detect**: `docs/plan.md` and `docs/user-stories.md` exist with content
- **Preserve**: All existing features, stories, and epics — append only
- **Triggers**: User requests a new feature or significant change
- **Conflict resolution**: New features append to existing sections; never remove existing content
- **Frozen artifacts**: If freeze markers exist, update the amended date rather than removing the marker

## Instructions

I want to add an enhancement to this project. Help me evaluate it, document it properly, and create tasks for implementation.

### The Enhancement

$ARGUMENTS

---

### Phase 1: Discovery & Impact Analysis

#### Review Existing Context
Before asking questions, thoroughly review:
- `docs/plan.md` — Current PRD: vision, personas, features, data model
- `docs/user-stories.md` — Existing stories and epics (note the last story ID used)
- `docs/tech-stack.md` — Technical constraints and patterns
- `docs/coding-standards.md` — Code conventions, styling rules, commit format
- `docs/project-structure.md` — Where new files should go
- `docs/tdd-standards.md` — Test categories and patterns for task descriptions
- `docs/design-system.md` — Design tokens, component patterns, styling approach (if frontend changes)
- `CLAUDE.md` — Project conventions, Key Commands, workflow
- Relevant source code if needed to understand current implementation

#### Understand the Enhancement
Use AskUserQuestionTool to batch these questions:
- What problem does this solve? Who benefits? (Which persona?)
- What is the user flow? Walk me through it step by step.
- What triggers this feature? (User action, system event, time-based?)
- What does success look like? How will we measure it?

#### Challenge and Refine
Push back where appropriate:
- Is this the simplest solution? Propose alternatives if you see a better way.
- Should the scope be smaller for a v1 of this enhancement?
- Are there edge cases or error states not mentioned?
- Does this conflict with or duplicate existing functionality?
- What are the riskiest assumptions?

#### Innovation Pass

Before finalizing the enhancement scope, research and consider:

**Competitive Analysis** (use subagents for research):
- How do similar apps handle this feature?
- What do they do well? Where do they fall short?
- Is there a standard UX pattern users will expect?

**Enhancement Opportunities**:
- What would make this feature "delightful" vs just "functional"?
- Are there adjacent features that would multiply the value? (e.g., if adding notifications, should we add notification preferences too?)
- What would a user complain about if we ship the minimal version?

**AI-Native Possibilities**:
- Could AI make this smarter? (smart defaults, predictions, natural language)
- Is there manual work we could automate?

**Present innovation ideas with**:
- **What**: The enhancement to the enhancement
- **Why**: User benefit
- **Cost**: Trivial / Moderate / Significant effort
- **Recommendation**: Include in this enhancement, or backlog for later

Use AskUserQuestionTool to present innovation ideas for approval BEFORE proceeding.

#### Impact Analysis
Report what this enhancement affects:

1. **Fit Check**
   - Does this align with the product vision in the PRD?
   - Which persona(s) does this serve?
   - Does it conflict with any existing features or design decisions?

2. **Scope Assessment**
   - Is this a v1 feature or should it be deferred?
   - Complexity estimate: Small (1-2 tasks), Medium (3-5 tasks), Large (6+ tasks)
   - Dependencies on existing features or new infrastructure?

3. **Technical Impact**
   - **Data Model**: New entities? Changes to existing ones? Migrations needed?
   - **UI Changes**: New screens? Modifications to existing ones?
   - **API Changes**: New endpoints? Changes to existing ones?
   - **External Integrations**: New third-party services?

4. **Recommendation**
   - Proceed as described
   - Proceed with modifications (explain)
   - Defer to a future version (explain why)
   - Reconsider (if it conflicts with product vision)

**Wait for user approval before proceeding to Phase 2.**

---

### Phase 2: Documentation Updates

After approval, update the relevant documentation.

#### Update `docs/plan.md`

Add the enhancement to the PRD (do NOT remove or significantly alter existing content):

1. **Feature Requirements section** — Add the new feature with:
   - Clear description of what it does
   - Why it exists (tied to user need/persona)
   - Priority: Must-have / Should-have / Future
   - Business rules or logic that are not obvious
   - Concrete examples where behavior might be misinterpreted
   - Mark with: `[Enhancement added YYYY-MM-DD]` for traceability

2. **Data Model Overview** (if applicable):
   - New entities with their key attributes
   - Changes to existing entities
   - New relationships between entities

3. **Core User Flows** (if applicable):
   - New flow, or modifications to existing flows
   - Include happy path AND error/edge cases
   - Be specific: "when X happens, the user sees Y" not "handle errors gracefully"

4. **External Integrations** (if applicable):
   - New third-party services or APIs
   - What data flows in/out

5. **Non-Functional Requirements** (if applicable):
   - Performance implications
   - Security considerations
   - Accessibility needs

#### Update `docs/user-stories.md`

Add new user stories following the existing document structure and the User Stories prompt format:

1. **Determine Epic Placement**
   - Does this fit under an existing epic?
   - Or does it need a new epic? (Only if it is a significant new area — match existing naming patterns)

2. **Create User Stories** — Each story MUST include ALL of these fields:
   - **ID**: Continue the existing numbering sequence (check the last ID in the file)
   - **Title**: Short, scannable summary
   - **Story**: "As a [persona], I want [action], so that [outcome]"
   - **Acceptance Criteria**: Written as testable Given/When/Then scenarios
     - These become TDD test cases — be explicit
     - Cover happy path AND edge cases
     - Include error states
   - **Scope Boundary**: What this story does NOT include (prevents scope creep)
   - **Data/State Requirements**: What data models, state, or dependencies are implied
   - **UI/UX Notes**: What the user sees, key interactions, error states, loading states
   - **Priority**: MoSCoW (Must/Should/Could/Won't)
   - **Enhancement Reference**: `[Enhancement added YYYY-MM-DD]`

3. **Story Quality Checks** — Before finalizing, verify:
   - Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
   - No story is so large it could not be implemented in 1-3 focused Claude Code sessions
   - Acceptance criteria are specific enough that pass/fail is unambiguous
   - Edge cases and error states are covered explicitly

#### Cross-Reference Check

After updating both documents:
- Verify every new PRD feature maps to at least one user story
- Verify terminology is consistent with existing documentation
- Verify no contradictions were introduced with existing features
- Check that personas referenced exist in the PRD

#### Frozen Artifact Handling

If documents have a freeze marker (`<!-- FROZEN: ... -->` or `<!-- scaffold:freeze ... -->`), this is an authorized post-freeze change. Note the amendment date and update the freeze marker (e.g., `<!-- FROZEN: original-date, amended YYYY-MM-DD for enhancement -->`).

Freeze marker format: `<!-- scaffold:step-name vN YYYY-MM-DD, amended YYYY-MM-DD -->`
When updating a frozen document, change the "amended" date to today's date. Do not remove the original version date.

---

### Phase 3: Task Creation

Create tasks for implementation.

#### Task Creation Guidelines

For each user story (or logical grouping of small stories):

**If Beads:**
```bash
bd create "US-XXX: <imperative title>" -p <priority>
# Priority: 0=blocking release, 1=must-have, 2=should-have, 3=nice-to-have
```

**Without Beads:** Document tasks as a structured list in `docs/implementation-plan.md` with title, priority, dependencies, and description.

#### Task Titles and Descriptions

- **Title format**: `US-XXX: <imperative action>` (e.g., "US-048: Add streak notification settings")
- **Description should include**:
  - Reference to user story: `Implements US-XXX`
  - Key acceptance criteria summary
  - Technical notes or gotchas from analysis
  - Migration notes if data model changes

#### Task Sizing

- **One task per story** for small/medium stories
- **Multiple tasks per story** for large stories — break down by:
  - Data model/migrations first
  - Backend API second
  - Frontend/UI third
  - Edge cases and polish last

#### Dependency Management

**If Beads:**
```bash
# Set up dependencies (child is blocked by parent)
bd dep add <child-task-id> <parent-task-id>

# Verify the dependency graph
bd dep tree <task-id>
```

**Without Beads:** Note dependencies inline (e.g., "depends on: US-045 migration task").

Common dependency patterns:
- Migrations before features that use new models
- Backend before frontend
- Core functionality before edge cases
- Shared components before features that use them

#### Migration Considerations

If the enhancement requires data model changes:
- Create a dedicated migration task as the first dependency
- Note if existing data needs transformation
- Consider: can this be deployed incrementally or does it require coordination?
- Document rollback strategy if the migration is risky

---

### Phase 4: Summary & Approval

After completing all updates, provide a clear summary:

#### 1. Enhancement Summary
One paragraph: what this adds and why it matters.

#### 2. Documentation Changes
- **docs/plan.md**: What sections were added/modified
- **docs/user-stories.md**: List new story IDs with titles

#### 3. Tasks Created
```
| Task ID | Title | Priority | Depends On |
|---------|-------|----------|------------|
| xxx-abc | US-048: Add notification settings | 1 | - |
| xxx-def | US-049: Send streak reminders | 1 | xxx-abc |
```

#### 4. Implementation Order
Recommended sequence based on dependencies:
1. First: [task(s)]
2. Then: [task(s)] (can be parallelized)
3. Finally: [task(s)]

#### 5. Ready to Implement
```bash
bd ready  # Show what's available to work on now
```

#### 6. Open Questions (if any)
- Decisions deferred to implementation time
- Areas that may need refinement during development
- Risks to monitor

#### 7. Consider Follow-Up Reviews

Depending on the enhancement scope, you may want to re-run these prompts:
- **Implementation Plan Review**: If you created 5+ tasks, run it to verify sizing, dependencies, and coverage
- **Platform Parity Review**: If the enhancement has platform-specific behavior (web vs. mobile differences), re-run to check platform coverage
- **Workflow Audit**: Only if the enhancement changed project infrastructure or conventions (rare)

---

### Process Rules

- **Do not skip discovery** — Even if the enhancement seems simple, do the impact analysis
- **Use subagents for research** — Competitive analysis and UX best practices can run in parallel with other work
- **Batch questions** — Use AskUserQuestionTool to group related questions — do not ask one at a time
- **Present innovations before documenting** — Get approval on scope expansions before writing them up
- **Challenge assumptions** — If something seems overengineered or could be simpler, say so
- **Maintain consistency** — Match terminology, format, and style of existing docs exactly
- **Add traceability** — Mark enhancements with dates so we know when features were added
- **Right-size the scope** — Push back if the enhancement is too large — suggest phasing
- **Check for conflicts** — If Beads, review `bd list` for in-progress work that might be affected

---

### When to Use This Prompt

- Adding a new feature to an existing product
- Expanding an existing feature with new capabilities
- Adding a new user flow or journey
- Any change that requires updating the PRD or user stories

### When NOT to Use This Prompt

- **Bug fixes**: Use `/scaffold:quick-task` instead — it creates focused, well-defined tasks
- **Refactoring**: Use `/scaffold:quick-task` instead — no doc updates needed, just a task with clear acceptance criteria
- **Performance improvements**: Use `/scaffold:quick-task` instead — targeted fixes do not need full discovery
- **Initial product creation**: Use the PRD prompt instead
- **Major pivots**: If this changes the core product direction, revisit the full PRD first
- **Exploratory ideas**: If you are not sure you want this, discuss before documenting

### Optional: Skip Innovation Pass

If you just want to document a well-defined enhancement without competitive research and innovation brainstorming, add this to your request:

> Skip the innovation pass — just document and create tasks for what I described.

This is appropriate when:
- The enhancement is already well-researched
- You are porting a feature from a competitor you have already analyzed
- Time pressure requires moving fast
- The enhancement is truly trivial (but consider: does it even need this prompt?)

---

### Quality Standards

#### From the PRD prompt — apply these to enhancement documentation:
- Every feature must be described thoroughly enough that an AI agent can build it without asking follow-up questions
- Avoid ambiguity: specify what errors can occur and what the user sees for each
- Include concrete examples where behavior might be misinterpreted
- Use consistent terminology throughout
- Non-functional requirements are specific and measurable (not "fast" — how fast?)

#### From the User Stories prompt — apply these to new stories:
- Stories follow INVEST criteria (Independent, Negotiable, Valuable, Estimable, Small, Testable)
- Acceptance criteria are specific enough that pass/fail is unambiguous
- No story is so large it could not be implemented in 1-3 focused sessions
- Every story has scope boundaries to prevent creep during implementation

#### From the Gap Analysis prompts — verify before finishing:
- Every new PRD feature maps to at least one user story
- Happy paths AND error/edge cases are covered in acceptance criteria
- No vague language that could be misinterpreted ("intuitive," "user-friendly," "seamless," "handles gracefully")
- Dependencies between stories are identified (they become Beads dependencies)
- Priority assignments make sense relative to existing features

### Phase 5: Version Release

After all changes are applied and verified:

1. Determine release type based on change scope:
   - **patch**: Bug fix or minor documentation update
   - **minor**: New feature, new user story, or significant enhancement
   - **major**: Breaking change to existing behavior or architecture
2. Run `/scaffold:version-bump` to increment the version
3. Create a release with changelog entry documenting the enhancement

---

## After This Step

When this step is complete, tell the user:

---
**Enhancement documented** — PRD updated, user stories created, tasks ready.

**Next (if applicable):**
- If `docs/implementation-playbook.md` exists: Run `/scaffold:implementation-playbook` to update wave assignments and add per-task context blocks for new tasks. **This is required** to keep the playbook in sync with the implementation plan.
- If you created **5+ tasks**: Run `/scaffold:implementation-plan-review` — Review task quality, coverage, and dependencies.
- If the enhancement has **platform-specific behavior**: Run `/scaffold:platform-parity-review` — Check platform coverage.
- If user stories were added or changed: Run `/scaffold:story-tests` — Regenerate test skeletons for new user stories.
- If scope changed materially: Run `/scaffold:create-evals` — Update eval checks for new scope.
- Otherwise: Run `/scaffold:single-agent-start` or `/scaffold:single-agent-resume` to begin implementation (or `/scaffold:multi-agent-start <agent-name>` / `/scaffold:multi-agent-resume <agent-name>` for worktree agents).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

---

## Domain Knowledge

### enhancement-workflow

*Discovery and implementation workflow for adding features to existing projects*

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
4. **Architecture** (`docs/architecture.md` or ADRs) — understand the technical structure
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

---

### task-claiming-strategy

*Task selection and management patterns for AI agent execution*

# Task Claiming Strategy

Expert knowledge for how AI agents select, claim, and manage tasks during implementation. Covers deterministic selection algorithms, dependency awareness, and multi-agent conflict avoidance patterns.

## Summary

### Task Selection Algorithm

Select the lowest-ID unblocked task. This provides deterministic, conflict-free ordering when multiple agents operate on the same task list.

### Dependency Awareness

Before starting a task, verify all its blockers are resolved. After completing each task, re-check the dependency graph — your completion may have unblocked downstream tasks.

### Multi-Agent Conflict Avoidance

- Claim the task before starting work (branch creation = claim)
- Communicate via git branches — branch existence signals ownership
- Detect file overlap in implementation plans before starting — if two tasks modify the same files, they should not run in parallel

## Deep Guidance

### Task Selection — Extended

**The algorithm:**
1. List all tasks in the backlog
2. Filter to tasks with status "ready" or "unblocked"
3. Sort by task ID (ascending)
4. Select the first task in the sorted list
5. Claim it by creating a feature branch

**Why lowest-ID first:**
- Deterministic — two agents independently applying this rule will never pick the same task (the first agent claims it, the second sees it as taken)
- Dependency-friendly — lower IDs are typically earlier in the plan and have fewer blockers
- Predictable — humans can anticipate which tasks agents will pick next

**Exceptions:**
- If the lowest-ID task requires skills or context the agent doesn't have, skip it and document why
- If a task is labeled "high priority" or "urgent," it takes precedence over ID ordering
- If a human has assigned a specific task to the agent, honor the assignment

### Dependency Awareness — Extended

**Before starting a task:**
1. Read the task's dependency list (blockers, prerequisites)
2. Verify each blocker is in "done" or "merged" state
3. If any blocker is incomplete, skip this task and select the next eligible one
4. Pull the latest main branch to ensure you have the outputs from completed blockers

**After completing a task:**
1. Check which downstream tasks list the completed task as a blocker
2. If any downstream tasks are now fully unblocked, they become eligible for selection
3. If you're continuing work, re-run the selection algorithm — the next task may have changed

**Dependency types:**
- **Hard dependency** — cannot start until blocker is merged (e.g., "implement auth" blocks "implement protected routes")
- **Soft dependency** — can start with a stub/mock, but must integrate before PR (e.g., "design API" informs "implement client," but the client can start with a contract)
- **Data dependency** — needs output artifacts from another task (e.g., database schema must exist before writing queries)

### Multi-Agent Conflict Avoidance — Extended

**Claiming a task:**
- Creating a feature branch (e.g., `bd-42/add-user-endpoint`) is the claim signal
- Other agents should check for existing branches before claiming the same task
- If two agents accidentally claim the same task, the one with fewer commits yields

**Detecting file overlap:**
- Before starting, review the implementation plan for file-level scope
- If two tasks both modify `src/auth/middleware.ts`, they should not run in parallel
- When overlap is detected: serialize the tasks (one blocks the other), or split the overlapping file into two files first

**Communication via branches:**
- Branch exists = task claimed
- Branch merged = task complete
- Branch deleted without merge = task abandoned, available for re-claim

### What to Do When Blocked

When no eligible tasks remain (all are blocked or claimed):

1. **Document the blocker** — note which task you need and what it produces
2. **Skip to the next available task** — don't wait idle; there may be non-dependent tasks further down the list
3. **Look for prep work** — can you write tests, set up scaffolding, or create stubs for the blocked task?
4. **If truly nothing is available** — report status and wait for new tasks to become unblocked

**Never:**
- Start a blocked task hoping the blocker will finish soon
- Work on the same task as another agent without coordination
- Sit idle without communicating status

### Conditional Beads Integration

Beads is an optional task-tracking tool. Detect its presence and adapt.

**When `.beads/` directory exists:**
- Use `bd ready` to list tasks that are ready for work
- Use `bd claim <id>` to claim a task (if available)
- Use `bd close <id>` after PR is merged to mark task complete
- Task IDs come from Beads (`bd-42`, `bd-43`, etc.)
- Branch naming follows Beads convention: `bd-<id>/<short-desc>`

**Without Beads:**
- Parse `implementation-plan.md` task list for task IDs and dependencies
- Or use the project's task tracking system (GitHub Issues, Linear, Jira)
- Branch naming uses the project's convention (e.g., `feat/US-001-slug`)
- Task status is tracked via PR state: open PR = in progress, merged PR = done

### Task Completion Criteria

A task is complete when all of the following are true:

1. **All acceptance criteria met** — every criterion listed in the task description is satisfied
2. **Tests passing** — new tests written for the task, plus the full existing suite, all pass
3. **PR created** — code is pushed and a pull request is open with a structured description
4. **CI passing** — all automated quality gates pass on the PR
5. **No regressions** — existing functionality is unchanged unless the task explicitly modifies it

Only after all five criteria are met should the task be marked as done.

## See Also

- [tdd-execution-loop](./tdd-execution-loop.md) — Red-green-refactor cycle and commit timing
- [worktree-management](./worktree-management.md) — Parallel agent worktree setup
- [task-tracking](../core/task-tracking.md) — Task tracking systems and conventions
