---
name: implementation-playbook
description: Create the playbook that AI agents follow during implementation
summary: "Writes the playbook agents reference during every coding session — task execution order, which docs to read before each task, the TDD loop to follow, quality gates to pass, and the handoff format between agents."
phase: "finalization"
order: 1430
dependencies: [developer-onboarding-guide]
outputs: [docs/implementation-playbook.md]
reads: [story-tests, create-evals, implementation-plan, database-schema, api-contracts, ux-spec, design-system, system-architecture, tdd, coding-standards, security, operations]
conditional: null
knowledge-base: [implementation-playbook]
---

## Purpose
Create the implementation playbook — the operational document that AI agents
reference during implementation. Defines task ordering, context requirements
per task, coding standards, git workflow (branching/PR strategy), handoff
format between agents, and success criteria.

## Inputs
- docs/implementation-plan.md (required) — tasks to sequence
- docs/system-architecture.md (required) — architecture context
- docs/tdd-standards.md (required) — testing requirements
- tests/acceptance/ (required if exists) — test skeletons agents implement during TDD
- docs/story-tests-map.md (required if exists) — story-to-test mapping for progress tracking
- tests/evals/ (required if exists) — project eval checks to run as quality gates
- docs/eval-standards.md (required if exists) — what evals check and what they don't
- docs/plan.md (optional) — PRD for requirement traceability
- docs/user-stories.md (optional) — acceptance criteria source
- docs/database-schema.md (optional) — for data-layer task context
- docs/api-contracts.md (optional) — for API endpoint task context
- docs/ux-spec.md (optional) — for UI task context
- docs/design-system.md (optional) — for styling task context
- docs/security-review.md (optional) — for security control task context
- docs/operations-runbook.md (optional) — for deployment task context
- docs/onboarding-guide.md (optional — not available in MVP) — agents should read for project context before playbook
- All other frozen artifacts

## Expected Outputs
- docs/implementation-playbook.md — agent implementation playbook

## Quality Criteria
- (mvp) Task execution order is clear and respects dependencies
- (deep) Each task has context requirements (which docs to read before starting)
- (mvp) Coding standards are defined (naming, patterns, error handling)
- (mvp) Git workflow is defined (branching strategy, commit format, PR process)
- (mvp) Success criteria per task (how to know it's done)
- (deep) Handoff format between agents (what to communicate when passing work)
- (mvp) Quality gates are defined (what must pass before a task is complete)
- Quality gates include `make eval` (or equivalent) as a required check
- (deep) Agent workflow references test skeleton implementation from tests/acceptance/
- (deep) Handoff format includes at minimum: implementation summary, assumptions made, known limitations, gotchas, and files modified

## Methodology Scaling
- **deep**: Full playbook. Detailed coding standards, git workflow with
  examples, per-task context briefs, inter-agent communication protocol,
  rollback procedures for failed tasks.
- **mvp**: Minimal playbook with task execution order, basic coding conventions
  reference, commit format, and quality gate commands from CLAUDE.md. Skip
  per-task context blocks, wave assignments, and inter-agent handoff format.
  Reference docs/coding-standards.md and docs/tdd-standards.md directly.
- **custom:depth(1-5)**: Depth 1-2: task execution order, basic coding conventions reference, commit format, and quality gate commands. Depth 3: add per-task context requirements, wave assignments, and quality gates per wave. Depth 4: add inter-agent communication protocol, handoff format, and error recovery procedures. Depth 5: full playbook with rollback procedures, eval integration, and per-task minimum context blocks.

## Mode Detection
Check if `docs/implementation-playbook.md` already exists.
- If exists: UPDATE MODE — read current playbook, identify changes in implementation plan or upstream docs, update per-task context blocks and wave assignments while preserving completed task status and agent allocation history.
- If not: FRESH MODE — generate from scratch using implementation plan and all supporting docs.

## Update Mode Specifics

- **Detect**: `docs/implementation-playbook.md` exists with tracking comment
- **Preserve**: Completed task statuses, agent handoff notes, established patterns, quality gate results
- **Triggers**: New tasks added, wave assignments changed, quality gate definitions updated
- **Conflict resolution**: New tasks append to existing waves; never remove completed task records
