---
name: multi-model-review
description: Set up multi-model code review with Codex Cloud and CI fix loops on PRs
phase: "environment"
order: 53
dependencies: [git-workflow]
outputs: [AGENTS.md, docs/review-standards.md]
conditional: "if-needed"
knowledge-base: [review-methodology]
---

## Purpose
Configure a two-tier automated code review system: a local self-review subagent
before every push (required, no extra cost) and an optional external Codex Cloud
review loop that auto-fixes findings and auto-merges after CI passes. Includes
post-merge follow-up for escaped findings.

## Inputs
- docs/coding-standards.md (required) — review criteria reference
- docs/tdd-standards.md (required) — test coverage expectations
- docs/git-workflow.md (required) — PR workflow to integrate with
- CLAUDE.md (required) — workflow sections to update

## Expected Outputs
- AGENTS.md — Codex Cloud review instructions with project-specific rules
- docs/review-standards.md — severity definitions (P0-P3) and review criteria
- .github/workflows/code-review-trigger.yml — gate check and round labeling
- .github/workflows/code-review-handler.yml — convergence check and auto-merge
- .github/workflows/codex-timeout.yml — stale review timeout handler
- .github/workflows/post-merge-followup.yml — escaped findings follow-up
- .github/review-prompts/fix-prompt.md — Claude Code Action fix instructions
- .github/review-prompts/followup-fix-prompt.md — post-merge fix instructions
- scripts/await-pr-review.sh — review wait utility
- docs/git-workflow.md updated with review loop integration

## Quality Criteria
- Tier 1 (local review subagent) is documented in the PR workflow
- Tier 2 (Codex Cloud) workflows are event-driven (no polling)
- Round cap is enforced (max 3 rounds before auto-merge)
- Bot-loop prevention is implemented (skip if fix bot + round cap hit)
- Cost caps are documented (max-turns, model escalation, credit limits)
- Codex Cloud has read-only access (only Claude Code Action has write)
- Post-merge follow-up creates Beads task + GitHub Issue for tracking
- Severity definitions (P0-P3) are consistent with review subagent usage

## Methodology Scaling
- **deep**: Full two-tier system with Codex Cloud integration, all GitHub Actions
  workflows, post-merge follow-up, cost analysis, model escalation strategy,
  and comprehensive review-standards.md.
- **mvp**: Tier 1 only (local review subagent documented in PR workflow). Skip
  Codex Cloud integration entirely. Create basic review-standards.md with
  severity definitions.
- **custom:depth(1-5)**: Depth 1-2: Tier 1 only. Depth 3: add AGENTS.md and
  basic Codex integration. Depth 4: add fix loop and timeout. Depth 5: full
  suite with post-merge follow-up and cost analysis.

## Mode Detection
Update mode if AGENTS.md exists. In update mode: preserve custom review rules
in AGENTS.md, CODEX_BOT_NAME setting, MAX_REVIEW_ROUNDS setting, and
repository-specific secrets configuration. Never change CODEX_BOT_NAME without
verifying the actual bot username.
