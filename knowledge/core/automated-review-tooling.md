---
name: automated-review-tooling
description: Patterns for setting up automated PR code review using AI models (Codex, Gemini) via local CLI, including dual-model review, reconciliation, and CI integration
topics: [code-review, automation, codex, gemini, pull-requests, ci-cd, review-tooling]
---

# Automated Review Tooling

Automated PR review leverages AI models to provide consistent, thorough code review without manual reviewer bottlenecks. This knowledge covers the local CLI approach (no GitHub Actions), dual-model review patterns, and integration with the PR workflow.

## Summary

### Architecture: Local CLI Review

The scaffold approach uses local CLI review rather than GitHub Actions:
- **No CI secrets required** — models run locally via CLI tools
- **Dual-model review** — run Codex and Gemini (when available) for independent perspectives
- **Agent-managed loop** — Claude orchestrates the review-fix cycle locally

Components:
- `AGENTS.md` — reviewer instructions with project-specific rules
- `docs/review-standards.md` — severity definitions (P0-P3) and criteria
- `scripts/cli-pr-review.sh` — dual-model review script
- `scripts/await-pr-review.sh` — polling script for external bot mode

### Review Severity Levels

Consistent with the pipeline's review step severity:
- **P0 (blocking)** — must fix before merge (security, data loss, broken functionality)
- **P1 (important)** — should fix before merge (bugs, missing tests, performance)
- **P2 (suggestion)** — consider fixing (style, naming, documentation)
- **P3 (nit)** — optional (personal preference, minor optimization)

### Dual-Model Review Pattern

When both Codex CLI and Gemini CLI are available:
1. Run both reviewers independently on the PR diff
2. Collect findings from each
3. Reconcile: consensus findings get higher confidence
4. Disagreements are flagged for the implementing agent to resolve

### Integration with PR Workflow

The review step integrates into the standard PR flow:
1. Agent creates PR
2. Agent runs `scripts/cli-pr-review.sh` (or review runs automatically)
3. Review findings are posted as PR comments or written to a local file
4. Agent addresses P0/P1/P2 findings, pushes fixes
5. Re-review until no P0/P1/P2 findings remain
6. PR is ready for merge

## Deep Guidance

### AGENTS.md Structure

The `AGENTS.md` file provides reviewer instructions:

```markdown
# Code Review Instructions

## Project Context
[Brief description of what this project does]

## Review Focus Areas
- Security: [project-specific security concerns]
- Performance: [known hot paths or constraints]
- Testing: [coverage requirements, test patterns]

## Coding Standards Reference
See docs/coding-standards.md for:
- Naming conventions
- Error handling patterns
- Logging standards

## Known Patterns
[Project-specific patterns reviewers should enforce]

## Out of Scope
[Things reviewers should NOT flag]
```

### CLI Review Script Pattern

The `cli-pr-review.sh` script follows this structure:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Get the PR diff
diff=$(gh pr diff "$PR_NUMBER")

# 2. Run Codex review (if available)
if command -v codex &>/dev/null; then
  codex_findings=$(echo "$diff" | codex review --context AGENTS.md)
fi

# 3. Run Gemini review (if available)
if command -v gemini &>/dev/null; then
  gemini_findings=$(echo "$diff" | gemini review --context AGENTS.md)
fi

# 4. Reconcile findings
# - Findings from both models: HIGH confidence
# - Findings from one model: MEDIUM confidence
# - Contradictions: flagged for human review
```

### Review Standards Document

`docs/review-standards.md` should define:
- Severity levels with concrete examples per project
- What constitutes a blocking review (P0/P1/P2 threshold)
- Auto-approve criteria (when review can be skipped)
- Review SLA (how long before auto-approve kicks in)

### Fallback When Models Unavailable

If neither Codex nor Gemini CLI is available:
1. Claude performs an enhanced self-review of the diff
2. Focus on the AGENTS.md review criteria
3. Apply the same severity classification
4. Document that the review was single-model

### Updating Review Standards Over Time

As the project evolves:
- Add new review focus areas when new patterns emerge
- Remove rules that linters now enforce automatically
- Update AGENTS.md when architecture changes
- Track false-positive rates and adjust thresholds

### Review Finding Reconciliation

When running dual-model review, reconcile findings systematically:

```
Finding Classification:
┌─────────────────┬──────────┬──────────┬───────────────────┐
│                 │ Codex    │ Gemini   │ Action            │
├─────────────────┼──────────┼──────────┼───────────────────┤
│ Same issue      │ Found    │ Found    │ HIGH confidence   │
│ Unique finding  │ Found    │ -        │ MEDIUM confidence │
│ Unique finding  │ -        │ Found    │ MEDIUM confidence │
│ Contradiction   │ Fix X    │ Keep X   │ Flag for agent    │
└─────────────────┴──────────┴──────────┴───────────────────┘
```

HIGH confidence findings are always addressed. MEDIUM confidence findings are addressed if P0/P1/P2. Contradictions require the implementing agent to make a judgment call and document the reasoning.

### Security-Focused Review Checklist

Every automated review should check:
- No secrets or credentials in the diff (API keys, passwords, tokens)
- No `eval()` or equivalent unsafe operations introduced
- SQL queries use parameterized queries (no string concatenation)
- User input is validated before use
- Authentication/authorization checks are present on new endpoints
- Dependencies added are from trusted sources with known versions

### Performance Review Patterns

Look for these performance anti-patterns:
- N+1 queries (loop with individual DB calls)
- Missing pagination on list endpoints
- Synchronous operations that should be async
- Large objects passed by value instead of reference
- Missing caching for expensive computations
- Unbounded growth in arrays or maps

### Integration with CLAUDE.md

The workflow-audit step should add review commands to CLAUDE.md:

```markdown
## Code Review
| Command | Purpose |
|---------|---------|
| `scripts/cli-pr-review.sh <PR#>` | Run dual-model review |
| `scripts/await-pr-review.sh <PR#>` | Poll for external review |
```

This ensures agents always know how to trigger reviews without consulting separate docs.

### Common False Positives

Track and suppress recurring false positives:
- Test files flagged for "hardcoded values" (test fixtures are intentional)
- Migration files flagged for "raw SQL" (migrations must use raw SQL)
- Generated files flagged for style issues (generated code has its own conventions)

Add suppressions to AGENTS.md under "Out of Scope" to prevent repeated false findings.

### Review Metrics and Continuous Improvement

Track these metrics over time to improve review quality:
- **False positive rate** — findings that are dismissed without action
- **Escape rate** — bugs that reach production despite review
- **Time to resolve** — average time between finding and fix
- **Coverage** — percentage of PRs that receive automated review
- **Model agreement rate** — how often Codex and Gemini agree

Use these metrics to calibrate severity thresholds and update AGENTS.md focus areas.
