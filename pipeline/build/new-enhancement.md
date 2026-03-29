---
name: new-enhancement
description: Add a new feature to an existing project
summary: "Walks you through adding a feature the right way — updating the PRD, creating new user stories, running an innovation pass, and generating implementation tasks that integrate with your existing plan."
phase: "build"
order: 1560
dependencies: [implementation-playbook]
outputs: []
conditional: null
stateless: true
category: pipeline
knowledge-base: [enhancement-workflow, task-claiming-strategy]
reads: [create-prd, user-stories, coding-standards, tdd, project-structure, system-architecture, domain-modeling, adrs, api-contracts, database-schema, ux-spec, implementation-plan]
argument-hint: "<enhancement description>"
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
- docs/implementation-plan.md (required) — existing tasks and task numbering
- Relevant source code if needed to understand current implementation

## Expected Outputs
- Updated `docs/plan.md` with new feature requirements
- Updated `docs/user-stories.md` with new stories and acceptance criteria
- Implementation tasks created via Beads or documented in implementation plan
- Enhancement summary with implementation order

## Quality Criteria
- (mvp) Impact analysis completed before documentation changes
- (mvp) PRD feature description includes: what the feature does, which persona it serves, at least 2 acceptance criteria, and scope boundary (what it does NOT include)
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

**Note**: Version release should happen after implementation is complete, not after this documentation step. If going straight to implementation, skip to "After This Step" guidance below.

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
- If impact analysis identified **Data Model changes**: Run `/scaffold:database-schema` to update the schema.
- If impact analysis identified **API changes**: Run `/scaffold:api-contracts` to update contracts.
- If impact analysis identified **UI changes**: Run `/scaffold:ux-spec` to update the UX specification.
- If impact analysis identified **Architecture changes**: Run `/scaffold:system-architecture` to update architecture.
- Otherwise: Run `/scaffold:single-agent-start` or `/scaffold:single-agent-resume` to begin implementation (or `/scaffold:multi-agent-start <agent-name>` / `/scaffold:multi-agent-resume <agent-name>` for worktree agents).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
