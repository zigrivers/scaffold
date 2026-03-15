---
name: implementation-playbook
description: Create the playbook that AI agents follow during implementation
phase: "finalization"
order: 36
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
