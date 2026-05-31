---
name: materialize-plan-to-beads
description: Materialize the implementation plan into Beads issues before the build phase
summary: "When Beads is enabled, converts docs/implementation-plan.md into Beads issues — creating, updating, and reconciling tasks/stories/epics and their dependencies idempotently — so the build phase has a populated tracker to claim from."
phase: "finalization"
order: 1440
dependencies: [implementation-playbook]
outputs: []
conditional: "if-needed"
stateless: true
category: pipeline
knowledge-base: [task-tracking]
---

## Purpose
Materialize the frozen implementation plan into Beads (`bd`) issues so the build
phase has a populated tracker to claim work from. Reads
`docs/implementation-plan.md` and creates, updates, and reconciles the
corresponding epics, stories, tasks, and dependency edges in Beads.

## Inputs
_Authored in the next task._

## Expected Outputs
_Authored in the next task._

## Methodology Scaling
_Authored in the next task._

## Mode Detection
This step is idempotent and re-runnable: running it again reconciles the current
plan against existing Beads issues rather than duplicating them. Detect whether
Beads already contains issues for this plan and branch into fresh creation or
reconciliation accordingly.

## Update Mode Specifics
Reconcile plan changes into Beads without clobbering started work — preserve the
status, assignees, and history of issues already in progress while applying
additions, edits, and dependency changes from the updated plan.

## Instructions
_Authored in the next task._

## After This Step
_Authored in the next task._
