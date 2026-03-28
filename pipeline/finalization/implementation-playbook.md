---
name: implementation-playbook
description: Create the playbook that AI agents follow during implementation
phase: "finalization"
order: 1430
dependencies: [developer-onboarding-guide]
outputs: [docs/implementation-playbook.md]
reads: [story-tests, create-evals, implementation-plan]
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
- Quality gates include `make eval` (or equivalent) as a required check
- Agent workflow references test skeleton implementation from tests/acceptance/

## Methodology Scaling
- **deep**: Full playbook. Detailed coding standards, git workflow with
  examples, per-task context briefs, inter-agent communication protocol,
  rollback procedures for failed tasks.
- **mvp**: Task order, basic coding conventions, commit format, "run tests
  before marking done."
- **custom:depth(1-5)**: Scale detail with depth.

## Mode Detection
Update mode if playbook exists.
