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

> **Scope & related skills.** This skill ships with Scaffold for Claude Code and
> shared-agent hosts (`.claude/skills/`, `.agents/skills/`). The MMR CLI itself can
> install an equivalent review skill into other agent CLIs — Cursor, Codex, Gemini,
> and Antigravity — via `mmr skill install` (see the
> [`mmr` reference guide](../../guides/mmr/index.md)). Those per-platform skill bodies
> live in `packages/mmr/templates/skills/` and are the source of truth for those
> platforms; keep this file's `mmr review` guidance in sync with them when the CLI
> surface changes.

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
- **Antigravity:** `agy -p 'hello'`
- **Codex:** `codex login`

Re-run `mmr config test` after re-authenticating to verify.

## Configuring Channels

Turn a channel on or off without hand-editing YAML:

```bash
mmr config disable grok      # writes channels.grok.enabled: false
mmr config enable grok       # turns it back on (and clears legacy channels_disabled)
mmr config path              # where config is read from / written to
mmr config channels --format text   # table with a SOURCE (provenance) column
mmr config set defaults.fix_threshold P1   # set any dotted value (validated before write)
mmr config unset defaults.fix_threshold    # remove an override, fall back to inherited
mmr doctor                   # diagnose every channel (install + auth) with remediation
mmr doctor --fix             # disable channels whose CLI isn't installed
```

To learn the whole command surface in one call (instead of probing `--help`),
run `mmr commands --json` — a machine-readable manifest of every command
with a runnable example and a `writes` flag. For a concept, `mmr explain <topic>`
prints inline docs (`channels`, `config`, `scopes`, `compensation`, `redaction`,
`provenance`); `mmr explain` with no topic lists them.

## Design critique (`mmr critique`)

`mmr review` reviews a diff for defects. `mmr critique` is its **peer** for
*design* work: give it a design doc, a pasted "problem + proposed solution", or
a plan, and it fans the artifact out to the same independent channels with a
design-critique prompt (alternatives, missed considerations, tradeoffs, risks)
and reports where the models **converge vs. diverge**. It is **advisory** — no
severity, no pass/fail gate, always exits 0 — so it never blocks a merge.

The output leads with **CONVERGENCE** (where independent models agreed), then
**DIVERGENCE** (genuine splits with the deciding *crux*), then single-model
points grouped by kind, and finally an **editorial SYNTHESIS** — a cited read
of the critique that never picks a winner on a split. `--no-synthesis` skips the
synthesis pass (faster; deterministic clustering only).

By default the critique sees only the artifact. `--context repo` grounds it in
the codebase (a structural skeleton: tree + manifests + README + the files the
artifact references) so the models judge fit against your real system; the
report discloses which files were used. `--context-paths a.ts,b.ts` grounds
against specific files instead (highest priority).

**Iterate** across rounds with `--session <id>`: round 1 critiques; you revise
the artifact and re-run with the same id, and the models see the prior round's
points and judge which your revision addressed (the prompt stays bounded to the
last round). **Lenses** (`--lenses skeptic,simplifier,…`) give each channel a
distinct persona for breadth; because that trades away independence, the output
relabels "consensus" as "perspectives".

```bash
mmr critique docs/design/notifications.md   # critique a design doc
mmr critique - --focus scaling              # critique stdin, focused
mmr critique plan.md --format json          # machine-readable report
mmr critique design.md --no-synthesis       # skip the editorial synthesis pass
mmr critique design.md --context repo       # ground the critique in the codebase
mmr critique design.md --session redesign   # iterative round (re-run after edits)
mmr critique design.md --lenses skeptic,simplifier   # persona lenses per channel
```

`mmr doctor` is the one-shot health check: it classifies each channel and
prints the exact fix. A channel whose CLI is **not installed** is treated as a
*structural* absence — as of mmr 2.0.0 the review no longer runs a wasteful
compensating pass for it by default (you'll see a one-line notice). Re-enable
that substitution with `--compensate-missing` on the review, or mark the
channel `required: true` in config. Transient failures (auth expired) are still
compensated automatically.

`disable`/`enable` default to the project `./.mmr.yaml`. Disabling a channel
whose CLI is **not installed** is a machine-level fact, so it records to the
global `~/.mmr/config.yaml` instead — pass `--project` to scope it to the repo.
Every mutation prints the file it wrote, the new effective value with its
provenance source, and the revert command.

If a review reports a channel as `not_installed`, the output prints the exact
remediation: install the CLI, or `mmr config disable <name>` to stop dispatching
it. `mmr config channels show <name>` inspects one channel with per-field
provenance.

## Severity Gate

Default threshold is `P2` (the verdict gate blocks on P0, P1, and P2;
P3 findings are kept in the result as **advisory** but don't cause
`blocked`). Override per-review:

```bash
mmr review --pr 47 --fix-threshold P1   # Only fix P0 and P1
mmr review --pr 47 --fix-threshold P0   # Only fix critical issues
```

The verdict JSON includes `advisory_count` (count of findings strictly
below the threshold). Formatted output shows `Advisory: N` (text) or
`**Advisory:** N` (markdown) when non-zero — useful for spotting real
findings that the gate didn't block.

## Output Formats

```bash
mmr results <job-id>                    # JSON (default)
mmr results <job-id> --format text      # Human-readable terminal output
mmr results <job-id> --format markdown  # For PR comments
```
