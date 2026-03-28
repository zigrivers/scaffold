---
name: git-workflow
description: Configure git workflow with branching, PRs, CI, and worktree scripts for parallel agents
phase: "environment"
order: 330
dependencies: [dev-env-setup]
outputs: [docs/git-workflow.md]
conditional: null
knowledge-base: [dev-environment, git-workflow-patterns]
---

## Purpose
Configure the repository for parallel Claude Code sessions working simultaneously.
Define branching strategy (one task = one branch = one PR), commit standards
(with Beads task IDs if configured, conventional commits otherwise), rebase
strategy, PR workflow with squash-merge and auto-merge, worktree setup for
parallel agents, CI pipeline, branch protection, and conflict prevention rules.

## Inputs
- CLAUDE.md (required) — Key Commands table for lint/test/install commands
- docs/tech-stack.md (required) — CI environment setup (language, runtime)
- docs/coding-standards.md (required) — commit message format reference

## Expected Outputs
- docs/git-workflow.md — branching strategy, commit standards, rebase strategy,
  PR workflow (8 sub-steps), task closure, agent crash recovery, branch protection,
  conflict prevention, and worktree documentation
- scripts/setup-agent-worktree.sh — permanent worktree creation script
- .github/workflows/ci.yml — CI workflow with lint and test jobs
- .github/pull_request_template.md — PR template with task ID format
- CLAUDE.md updated with Committing/PR Workflow, Task Closure, Parallel Sessions,
  Worktree Awareness, and Code Review sections

## Quality Criteria
- Branch naming format is consistent (Beads: bd-<task-id>/<desc>. Non-Beads: <type>/<desc>)
- Commit format is consistent (Beads: [BD-<id>] type(scope): desc. Non-Beads: type(scope): desc)
- PR workflow includes all 8 sub-steps (commit, AI review, rebase, push, create,
  auto-merge with --delete-branch, watch CI, confirm merge)
- Worktree script creates permanent worktrees with workspace branches
- If Beads: BD_ACTOR environment variable documented for agent identity
- CI workflow job name matches branch protection context
- Branch cleanup documented for both single-agent and worktree-agent variants
- Agent crash recovery procedure documented
- Conflict prevention rule: don't parallelize tasks touching same files

## Methodology Scaling
- **deep**: Full git workflow with all sections, CI pipeline, branch protection
  via gh api, worktree script, PR template, agent crash recovery, batch branch
  cleanup, and comprehensive CLAUDE.md updates.
- **mvp**: Branching strategy, commit format, basic PR workflow, CI config.
  Skip worktree script and crash recovery. Minimal CLAUDE.md updates.
- **custom:depth(1-5)**: Depth 1-2: branching + commits + CI. Depth 3: add PR
  workflow and branch protection. Depth 4: add worktrees and crash recovery.
  Depth 5: full suite with all sections.

## Mode Detection
Update mode if docs/git-workflow.md exists. In update mode: never rename CI jobs
without checking branch protection rules, preserve worktree directory naming,
keep setup-agent-worktree.sh customizations intact.

## Update Mode Specifics
- **Detect prior artifact**: docs/git-workflow.md exists
- **Preserve**: branch naming convention, commit message format, CI job names,
  branch protection rules, worktree directory structure, PR template fields,
  setup-agent-worktree.sh customizations
- **Triggers for update**: coding-standards.md changed commit format, new CI
  stages needed (e.g., evals added), Beads status changed (added or removed),
  new worktree patterns needed for parallel execution
- **Conflict resolution**: if CI job rename is required, update branch
  protection rules in the same operation; verify CLAUDE.md workflow section
  stays consistent after any changes
