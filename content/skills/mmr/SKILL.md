---
name: mmr
description: Multi-model code review — dispatch, poll, and collect results from multiple AI model CLIs
topics:
  - code review
  - multi-model review
  - review gate
  - mmr
---

# mmr — Multi-Model Review

Dispatch code reviews to multiple AI model CLIs, poll for results, and collect reconciled findings with severity gating.

## Quick Reference

```bash
# Dispatch a review for a PR
mmr review --pr <number> --focus "description of what to focus on"

# Check progress
mmr status <job-id>

# Collect reconciled results
mmr results <job-id>

# Pre-flight: verify all channels are authenticated
mmr config test
```

## After Creating a PR

1. Run `mmr review --pr <number>`
2. Note the job ID from the output
3. Continue working on other tasks
4. Periodically run `mmr status <job-id>` until all channels complete
5. Run `mmr results <job-id>` to get reconciled findings
6. If gate failed: fix findings at or above the threshold severity
7. If gate passed: proceed to merge

## Auth Failures

If `mmr review` reports auth failures, follow the recovery instructions in the output:
- **Claude:** `claude login`
- **Gemini:** `gemini -p 'hello'` (interactive, opens browser)
- **Codex:** `codex login`

Re-run `mmr config test` after re-authenticating to verify.

## Severity Gate

Default threshold is P2 (fix P0/P1/P2, skip P3). Override per-review:

```bash
mmr review --pr 47 --fix-threshold P1   # Only fix P0 and P1
mmr review --pr 47 --fix-threshold P0   # Only fix critical issues
```

## Output Formats

```bash
mmr results <job-id>                    # JSON (default)
mmr results <job-id> --format text      # Human-readable terminal output
mmr results <job-id> --format markdown  # For PR comments
```
