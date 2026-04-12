---
name: automated-review-tooling
description: Patterns for setting up automated PR code review using AI models (Codex, Gemini) via local CLI, including dual-model review, reconciliation, and CI integration
topics: [code-review, automation, codex, gemini, pull-requests, ci-cd, review-tooling]
---

# Automated Review Tooling

Automated PR review leverages AI models to provide consistent, thorough code review without manual reviewer bottlenecks. This knowledge covers the local CLI approach (no GitHub Actions), dual-model review patterns, and integration with the PR workflow.

## Summary

### Review Severity and Reconciliation

See `review-methodology` for severity definitions (P0-P3). See `multi-model-review-dispatch` for finding reconciliation rules.

**Action thresholds:** P0/P1/P2 findings must be fixed before proceeding to the next task. P3 findings are recorded but not actioned.

### Degraded-Mode Behavior

#### Verdict Definitions

These are the authoritative verdict definitions. Tool files (`review-code.md`, `review-pr.md`) reference these.

| Verdict | Condition |
|---------|-----------|
| `pass` | All configured channels ran, no unresolved P0/P1/P2 |
| `degraded-pass` | Channels skipped/compensated, no unresolved P0/P1/P2 |
| `blocked` | Unresolved P0/P1/P2 after 3 fix rounds |
| `needs-user-decision` | Contradictions or unresolvable findings |

**Verdict precedence:** `needs-user-decision` > `blocked` > `degraded-pass` > `pass`. When multiple conditions apply, the higher-precedence verdict wins.

**Both external channels missing:** Maximum achievable verdict is `degraded-pass` — never `pass`. Review summary must note: "All findings are single-model (Claude only). External validation was unavailable."

#### Status Model

`compensating` is a **coverage label** applied to a channel's output, not a replacement for the root-cause status. Each channel retains its root-cause status (`not_installed`, `auth_failed`, `auth_timeout`, `failed`) AND gains a coverage label (`compensating (X-equivalent)`) when a compensating pass ran. The fix cycle uses the **root-cause status** to decide whether to retry (never retry `not_installed`, `auth_failed`, `auth_timeout`). The report uses the **coverage label** to show the reader what ran.

#### Compensating Passes

When an external channel (Codex or Gemini) is unavailable, run a compensating Claude self-review pass:

- Same prompt structure as the missing channel, executed as a Claude self-review pass.
- Labeled `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]` in the review summary.
- Missing Codex → focus on implementation correctness, security, API contracts.
- Missing Gemini → focus on architectural patterns, design reasoning, broad context.
- Missing both → two compensating passes (one per missing channel's strength area).
- Compensating-pass findings are **single-source confidence** — they do NOT raise to high confidence even if they agree with another channel's findings.
- Normal mandatory-fix thresholds apply: P0/P1/P2 findings from compensating passes still require fixing.

**Superpowers channel:** No compensating pass needed — Superpowers is a Claude subagent and is always available. If the Superpowers plugin is not installed, run available external CLIs and warn the user that review coverage is reduced.

#### Foreground-Only Execution

Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty or truncated output from Codex and Gemini CLIs. Multiple foreground calls can still run in parallel if the tool runner supports parallel tool invocations.

This constraint is intentionally duplicated from `multi-model-review-dispatch`. Knowledge entries are injected independently by the assembly engine — an agent may receive this entry without `multi-model-review-dispatch`, so both need the constraint.

## Deep Guidance

### Finding Reconciliation

After all channels complete (including compensating passes), reconcile findings using the rules in `multi-model-review-dispatch`. This orchestration entry triggers reconciliation; the dispatch entry defines how to perform it.

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

### Fallback When Models Unavailable

When external CLIs are unavailable, the degraded-mode behavior defined above applies:

1. For each unavailable external channel, queue a compensating Claude self-review pass focused on that channel's strength area.
2. Label findings as `[compensating: Codex-equivalent]` or `[compensating: Gemini-equivalent]`.
3. Treat compensating findings as single-source confidence.
4. Maximum verdict is `degraded-pass` when any channel is compensated.
5. When both external channels are unavailable, note "All findings are single-model" in the review summary.
