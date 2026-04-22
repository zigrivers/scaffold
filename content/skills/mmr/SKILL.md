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

`mmr review` works for any review target — not just PRs. Pick the input mode
that matches what you want reviewed:

```bash
# GitHub PR (fetches diff via `gh pr diff`)
mmr review --pr <number> --focus "description of what to focus on"

# Staged git changes (pre-commit review)
mmr review --staged --focus "..."

# All tracked uncommitted changes (staged + unstaged) — excludes untracked
# files; use `scaffold run review-code` for full-worktree coverage
git diff HEAD | mmr review --diff - --focus "..."

# Branch diff / ref range
mmr review --base main --head <branch> --focus "..."

# Changes to a specific tracked file since HEAD (pending edits only).
# If the file has no local changes this pipeline sends an empty diff
# and MMR will refuse with "no diff content"; use the next form instead
# to review the file's current contents regardless of git state.
git diff HEAD -- path/to/file.md | mmr review --diff - --focus "..."

# A file's current contents, regardless of git state (tracked-with-no-
# changes, untracked, or brand-new). Synthesizes an "all added" diff.
# `|| true` is required: diff exits 1 whenever files differ, which breaks
# pipelines under `set -o pipefail`.
(diff -u /dev/null path/to/file.md || true) | mmr review --diff - --focus "..."

# Existing patch or diff file
mmr review --diff path/to/changes.patch --focus "..."

# Check progress
mmr status <job-id>

# Collect reconciled results
mmr results <job-id>

# Pre-flight: verify all channels are authenticated
mmr config test
```

All input modes accept `--focus`, `--sync`, `--format`, and `--fix-threshold`
the same way. The "3-channel review" is not PR-specific — it reviews whatever
diff you point it at.

**`--diff` contract:** the flag expects diff-format content (a path to a
`.patch`/`.diff` file, or `-` for stdin). It does not read raw document
content — wrap the target in a diff first (see the `git diff …` and
`(diff -u /dev/null … || true)` patterns above). The `|| true` guard is
required because `diff` exits 1 whenever files differ, which breaks
pipelines under `set -o pipefail`.

## Common Workflows

**After creating a PR**

1. Run `mmr review --pr <number>`
2. Note the job ID from the output
3. Continue working on other tasks
4. Periodically run `mmr status <job-id>` until all channels complete
5. Run `mmr results <job-id>` to get reconciled findings
6. If gate failed: fix findings at or above the threshold severity
7. If gate passed: proceed to merge

**Reviewing a document or arbitrary file**

Pick the case that matches what the user wants reviewed:

- **Just the pending edits** to a tracked file (what changed since last
  commit): `git diff HEAD -- path/to/doc.md | mmr review --diff -
  --focus "..."`. Fails with "no diff content" if the file has no
  local changes.
- **The file's current contents**, whether it's tracked-with-no-
  changes, untracked, or brand-new: wrap as a synthetic "all added"
  diff first: `(diff -u /dev/null path/to/doc.md || true) |
  mmr review --diff - --focus "..."`. The `|| true` guard avoids
  `diff`'s exit-1-on-differences breaking the pipeline under
  `set -o pipefail`.

Same dispatch / status / results flow as above.

**Reviewing uncommitted work before push**

1. `git add` the files you want reviewed
2. Run `mmr review --staged`
3. Fix findings at or above the gate threshold, re-stage, re-run as needed

Prefer the wrapper tools (`scaffold run review-pr`, `scaffold run review-code`)
when they cover your target — they add auth checks, compensating passes, and
the agent-review channel on top of `mmr review`. Call `mmr review` directly
for targets the wrappers don't cover (docs, arbitrary diffs, ref ranges
outside `main`).

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
