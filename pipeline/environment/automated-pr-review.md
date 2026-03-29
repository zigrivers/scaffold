---
name: automated-pr-review
description: Agent-driven automated PR review with external reviewers (Codex Cloud, Gemini Code Assist, or custom)
phase: "environment"
order: 340
dependencies: [git-workflow]
outputs: [AGENTS.md, docs/review-standards.md]
reads: [tdd]
conditional: "if-needed"
knowledge-base: [review-methodology, automated-review-tooling]
---

## Purpose
Configure an agent-driven automated PR review system using local CLI reviewers
(Codex, Gemini — runs both when available for dual-model quality) or external
GitHub App reviewers. Zero GitHub Actions workflows. The agent manages the
entire review-fix loop locally.

## Inputs
- docs/coding-standards.md (required) — review criteria reference
- docs/tdd-standards.md (required) — test coverage expectations
- docs/git-workflow.md (required) — PR workflow to integrate with
- CLAUDE.md (required) — workflow sections to update

## Expected Outputs
- AGENTS.md — Reviewer instructions with project-specific rules
- docs/review-standards.md — severity definitions (P0-P3) and review criteria
- scripts/cli-pr-review.sh (local CLI mode) — dual-model review with reconciliation
- scripts/await-pr-review.sh (external bot mode) — polling script with JSON output
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
- (deep) Dual-model review enabled when both CLIs available

## Methodology Scaling
- **deep**: Full setup with local CLI review (dual-model when both available),
  review-standards.md, AGENTS.md, and comprehensive CLAUDE.md workflow.
  Falls back to external bot review if no CLIs available.
- **mvp**: Step is disabled. Local self-review from git-workflow suffices.
- **custom:depth(1-5)**: Depth 1-2: disabled. Depth 3: basic review-standards.md
  + single-CLI review. Depth 4: add dual-model review. Depth 5: full suite
  with all options and legacy cleanup.

## Conditional Evaluation
Enable when: project uses GitHub for version control, team size > 1 or CI/CD is
configured, or git-workflow.md establishes a PR-based workflow. Skip when: solo
developer with no CI, depth < 3, or project uses a non-GitHub VCS host.

## Mode Detection
Check if AGENTS.md exists first. If it exists, check for scaffold tracking comment
(`<!-- scaffold:automated-pr-review -->`).
- If AGENTS.md exists with tracking comment: UPDATE MODE — preserve custom review rules,
  reviewer bot name, and round cap settings. Detect legacy GitHub Actions
  workflows (code-review-trigger.yml, code-review-handler.yml) and offer removal.
- If AGENTS.md does not exist: FRESH MODE — configure from scratch.

## Update Mode Specifics
- **Detect prior artifact**: AGENTS.md exists
- **Preserve**: custom review rules, reviewer bot configuration, round cap
  settings, severity definitions in docs/review-standards.md, CLI review
  script customizations
- **Triggers for update**: coding-standards.md changed (new review criteria),
  tdd-standards.md changed (coverage expectations), new external reviewer
  CLI became available, git-workflow.md changed PR workflow steps
- **Conflict resolution**: if review criteria changed in coding-standards.md,
  update AGENTS.md review rules to match; if both CLI reviewers are now
  available, offer to enable dual-model review
