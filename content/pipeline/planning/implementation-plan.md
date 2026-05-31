---
name: implementation-plan
description: Break deliverables into implementable tasks with dependencies, ordered by priority and dependencies
summary: "Breaks your user stories and architecture into concrete tasks — each scoped to ~150 lines of code and 3 files max, with clear acceptance criteria, no ambiguous decisions, and explicit dependencies."
phase: "planning"
order: 1210
dependencies: [tdd, operations, security, review-architecture, create-evals]
outputs: [docs/implementation-plan.md]
reads: [create-prd, story-tests, database-schema, api-contracts, ux-spec]
conditional: null
knowledge-base: [task-decomposition, system-architecture]
---

## Purpose
Decompose user stories and system architecture into concrete, implementable
tasks suitable for AI agents. Each task should be independently executable,
have clear inputs/outputs, and be small enough for a single agent session.
The primary mapping is Story → Task(s), with PRD as the traceability root.

## Inputs
- docs/system-architecture.md (optional — not available in MVP) — components to implement
- docs/domain-models/ (optional — not available in MVP) — domain logic to implement
- docs/adrs/ (optional — not available in MVP) — technology constraints
- docs/plan.md (required) — features to trace tasks back to
- docs/user-stories.md (required) — stories to derive tasks from
- docs/tdd-standards.md (required) — testing requirements to incorporate into tasks
- docs/operations-runbook.md (optional) — ops requirements to incorporate into tasks
- docs/security-review.md (optional) — security requirements to incorporate into tasks
- docs/database-schema.md (optional) — data layer tasks
- docs/api-contracts.md (optional) — API implementation tasks
- docs/ux-spec.md (optional) — frontend tasks
- tests/acceptance/ (optional) — test skeletons to reference in task descriptions
- docs/story-tests-map.md (optional) — AC-to-test mapping for task coverage verification

## Expected Outputs
- docs/implementation-plan.md — task list with dependencies, sizing, and
  assignment recommendations

## Plan Output Contract

The plan is consumed not only by humans but by an automated materializer that
upserts it into a task tracker (Beads). That tool needs **stable join keys** and
a **machine-readable structure** to parse and reconcile against. Every plan
therefore MUST satisfy the following contract. These rules apply at all depths
unless a clause is explicitly marked **(deep)** — container IDs, waves, and risk
are deep-only; stable task IDs, the per-task block, and referential integrity are
required at **every** depth.

1. **Stable task IDs.** Every task carries a unique, format-defined ID of the
   form `T-001`, `T-002`, … (zero-padded, monotonically increasing). IDs are
   assigned fresh in initial mode and are **never reused** — once `T-007`
   exists, that number is retired even if the task is later removed. In update
   mode, existing task IDs are **preserved verbatim**; new tasks take the next
   unused number. The ID is the stable join key the materializer uses to upsert
   idempotently, so retitling or reordering a task must never change its ID.

2. **Stable container IDs (deep).** Every story carries an ID of the form
   `S-001`, `S-002`, … and every epic an ID of the form `E-001`, `E-002`, …,
   under the same stability rules as task IDs (unique, monotonic, never reused,
   preserved across update-mode runs). These become the `plan_story_id` /
   `plan_epic_id` join keys so re-runs reconcile rather than duplicate parents.

3. **Per-task field block.** Each task is serialized with a per-task heading
   plus a fenced metadata block carrying these fields:
   - `id` — the task's `T-NNN` ID
   - `title` — a short verb-first task name
   - `priority` — optional; one of `P0`–`P3`
   - `wave` — (deep) integer wave number
   - `risk` — (deep) short risk-type string
   - `story` / `epic` — (deep) the parent container ID(s) this task belongs to
   - `depends_on` — list of task IDs this task depends on (the DAG edges); empty
     list if none
   - `acceptance_criteria` — a delimited block copied verbatim into the tracker
     issue body

4. **Per-container field block (deep).** Each story and epic is serialized in
   the same parseable form as tasks, with a per-container heading plus a fenced
   metadata block carrying: `id` (its `S-NNN` / `E-NNN` ID), `title`, `priority`
   (optional), `wave` / `risk` (if assigned), and a `description` / acceptance
   block (the container body). A story's `epic` parent is **optional** — epics
   appear only in the deepest hierarchy, so a plan with stories but no epics has
   stories with no `epic` parent, which is valid (not a dangling ref).

5. **Canonical serialization.** Use one unambiguous markdown shape for every
   item so the materializer has a single parsing rule: a per-item heading
   followed immediately by a fenced key/value (e.g. `yaml`) metadata block
   containing the fields above. Apply the identical shape to tasks **and**
   containers. Example task block:

   ```yaml
   id: T-001
   title: Create users table migration
   priority: P1
   wave: 1
   risk: data-loss
   story: S-002
   depends_on: []
   acceptance_criteria: |
     - Migration creates a `users` table with id, email, created_at
     - Rolling the migration back drops the table cleanly
   ```

6. **Referential integrity.** Every `story` / `epic` parent reference (on a
   task, and the optional `epic` parent on a story) **and every `depends_on`
   entry** must **resolve to a declared ID** in this plan — there must be **no
   dangling refs** in either the hierarchy or the dependency graph. A dangling
   `depends_on` would let the materializer silently skip an edge and allow tasks
   to be claimed out of order; a dangling parent ref would orphan a task. The
   implementation-plan **review** step validates this referential integrity (see
   `implementation-plan-review.md`).

## Quality Criteria
- (deep) Every architecture component has implementation tasks
- (mvp) Every user story has implementation tasks
- (mvp) Task dependencies form a valid DAG (no cycles, verified by checking no task depends on a later-ordered task)
- (mvp) Each task produces 150 +/- 50 lines of net-new application code (excluding tests and generated files)
- (mvp) Tasks include acceptance criteria (how to know it's done)
- (mvp) Tasks incorporate testing requirements from the testing strategy
- (deep) Tasks reference corresponding test skeletons from tests/acceptance/ where applicable
- (deep) Tasks incorporate security controls from the security review where applicable
- (deep) Tasks incorporate operational requirements (monitoring, deployment) where applicable
- (deep) Parallelization opportunities are marked with wave plan
- (mvp) Every user story maps to >= 1 task
- (mvp) Every PRD feature maps to >= 1 user story, and every user story maps to >= 1 task (transitive traceability)
- (deep) High-risk tasks are flagged with risk type and mitigation
- (deep) Wave summary produced with agent allocation recommendation
- (mvp) No task modifies more than 3 application files (test files excluded; exceptions require justification)
- (mvp) No task contains unresolved design decisions (agents implement, they don't architect)
- (mvp) Every code-producing task includes co-located test requirements
- (deep) Critical path identified with estimated total duration

## Methodology Scaling
- **deep**: Detailed task breakdown with story-to-task tracing. Dependency graph.
  Sizing estimates. Parallelization plan. Agent context requirements per task.
  Phased delivery milestones.
- **mvp**: Ordered task list derived from PRD features and user stories only
  (architecture, domain models, and ADRs are not available at this depth).
  Each task has a brief description, rough size estimate, and key dependency.
  Enough to start working sequentially. Skip architecture decomposition —
  work directly from user story acceptance criteria.
- **custom:depth(1-5)**:
  - Depth 1: ordered task list derived from PRD features only.
  - Depth 2: ordered list with rough size estimates per task.
  - Depth 3: add explicit dependencies and sizing (150-line budget, 3-file rule).
  - Depth 4: full breakdown with dependency graph and parallelization plan.
  - Depth 5: full breakdown with parallelization, wave assignments, agent allocation, and critical path analysis.

## MVP-Specific Guidance (No Architecture Available)

At MVP depth, the system architecture document does not exist. Task decomposition
must work directly from user stories without explicit component definitions.

**How to decompose stories into tasks without architecture:**

1. **Derive implicit layers from tech stack**: Read docs/tech-stack.md. For a web
   app: API layer (backend), UI layer (frontend), Data layer (database). Each
   story typically decomposes into one task per affected layer.

2. **Map each story to layers**: "User can register" → 3 tasks: API endpoint,
   UI form, database table. "User can view dashboard" → 2 tasks: API data
   endpoint, UI display component.

3. **Use acceptance criteria to define task boundaries**: Each AC (Given/When/Then)
   maps to test cases. Group test cases by layer. Each layer's test cases become
   one task.

   > **Note**: If user stories are one-liner bullets without Given/When/Then ACs (MVP depth 1–2), derive task boundaries directly from the story text instead: treat each story's success condition as defining one task scope. Infer implied acceptance criteria from the story description before decomposing into tasks.

4. **Order tasks by dependency**: Database migrations first, then API endpoints,
   then UI components (bottom-up).

5. **Split within layers when tasks exceed 150 lines**: Happy path in one task,
   validation/error handling in another, edge cases in a third.

## Mode Detection
Check for docs/implementation-plan.md. If it exists, operate in update mode:
read existing task list and diff against current architecture, user stories,
and specification documents. Preserve completed task statuses and existing
dependency relationships. Add new tasks for new stories or architecture
components. Re-derive wave plan if dependencies changed. Never remove tasks
that are in-progress or completed.

## Update Mode Specifics
- **Detect prior artifact**: docs/implementation-plan.md exists
- **Preserve**: completed and in-progress task statuses, existing task IDs,
  dependency relationships for stable tasks, wave assignments for tasks
  already started, agent allocation history, architecture decisions,
  component boundaries
- **Triggers for update**: architecture changed (new components need tasks),
  user stories added or changed, security review identified new requirements,
  operations runbook added deployment tasks, specification docs changed
- **Conflict resolution**: if architecture restructured a component that has
  in-progress tasks, flag for user review rather than silently reassigning;
  re-derive critical path only for unstarted tasks

## Task Size Constraints

Before finalizing the implementation plan, scan every task against the five agent
executability rules from the task-decomposition knowledge base:

1. **Three-File Rule** — Count application files each task modifies (exclude test files).
   Any task touching 4+ files must be split by layer or concern.
2. **150-Line Budget** — Estimate net-new application code lines per task. Any task
   likely to produce 200+ lines must be split by feature slice or entity.
3. **Single-Concern Rule** — Check each task description for "and" connecting unrelated
   work. Split if the task spans multiple architectural layers or feature domains.
4. **Decision-Free Execution** — Verify all design decisions are resolved in the task
   description. No "choose", "determine", "decide", or "evaluate options" language.
   Resolve decisions inline before presenting the plan.
5. **Test Co-location** — Confirm every code-producing task includes its test
   requirements. No "write tests later" aggregation tasks.

Tasks that fail any rule should be split inline. If a task genuinely can't be split
further, annotate with `<!-- agent-size-exception: reason -->`. The implementation
plan review will flag unjustified exceptions.
