---
name: automated-pr-review
description: Agent-driven automated PR review with external reviewers (Codex Cloud, Gemini Code Assist, or custom)
phase: "environment"
order: 53
dependencies: [git-workflow]
outputs: [AGENTS.md, docs/review-standards.md]
conditional: "if-needed"
knowledge-base: [review-methodology]
---

## Purpose
Configure an agent-driven automated PR review system that integrates external
AI reviewers (Codex Cloud, Gemini Code Assist, or custom) without requiring
GitHub Actions workflows. The agent manages the entire review-fix-push loop
locally, using `gh api` calls to poll for reviews (zero Actions minutes).

## Inputs
- docs/coding-standards.md (required) — review criteria reference
- docs/tdd-standards.md (required) — test coverage expectations
- docs/git-workflow.md (required) — PR workflow to integrate with
- CLAUDE.md (required) — workflow sections to update

## Expected Outputs
- AGENTS.md — External reviewer instructions with project-specific rules
- docs/review-standards.md — severity definitions (P0-P3) and review criteria
- scripts/await-pr-review.sh — enhanced polling script with JSON output,
  round tracking, and configurable reviewer
- docs/git-workflow.md updated with review loop integration
- CLAUDE.md updated with agent-driven review workflow

## Quality Criteria
- External reviewer configured and verified (AGENTS.md created)
- Review standards document matches project coding conventions
- Await script handles all exit conditions (approved, findings, cap, skip, timeout)
- CLAUDE.md workflow documents the agent-driven loop
- No GitHub Actions workflows created (zero Actions minutes)
- No ANTHROPIC_API_KEY secret required
- Legacy GitHub Actions workflows detected and cleanup offered

## Methodology Scaling
- **deep**: Full external review setup with configurable reviewer choice,
  enhanced await script with JSON output, comprehensive review-standards.md,
  and agent-driven loop documented in CLAUDE.md.
- **mvp**: Step is disabled. Local self-review from git-workflow suffices.
- **custom:depth(1-5)**: Depth 1-2: disabled. Depth 3: basic AGENTS.md +
  review-standards.md. Depth 4: add enhanced await script. Depth 5: full
  suite with reviewer choice and legacy cleanup.

## Mode Detection
Update mode if AGENTS.md exists. In update mode: preserve custom review rules,
reviewer bot name, and round cap settings. Detect legacy GitHub Actions
workflows (code-review-trigger.yml, code-review-handler.yml) and offer removal.
