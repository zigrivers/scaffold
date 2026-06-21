# MMR — Multi-Model Code Review

Use the `mmr` CLI to dispatch a code review across several AI model CLIs (Claude,
Codex, Grok, Antigravity), reconcile the findings, and gate on severity.
Reach for it when asked to review code, a PR, a diff, or staged changes, and before
committing, pushing, or finishing a change.

## Run a review

Pick the input mode that matches the target. Pass `--sync --format json` so you get
reconciled findings back in a single call:

```bash
# GitHub PR (fetches the diff via `gh pr diff`)
mmr review --pr <number> --focus "what to focus on" --sync --format json

# Staged changes (pre-commit)
mmr review --staged --sync --format json

# All tracked uncommitted changes (excludes untracked files)
git diff HEAD | mmr review --diff - --sync --format json

# Branch / ref range
mmr review --base main --head <branch> --sync --format json

# A specific file's current contents (tracked-no-changes, untracked, or new)
(diff -u /dev/null path/to/file.ts || true) | mmr review --diff - --sync --format json
```

The `--diff` flag expects diff-format content (a `.patch`/`.diff` path, or `-` for
stdin). It does not read raw file content — wrap the target in a diff first. The
`|| true` guard is required because `diff` exits 1 when files differ, which breaks
pipelines under `set -o pipefail`.

## Severity gate

The verdict blocks on findings at or above `fix_threshold` (default `P2`: blocks
P0/P1/P2; P3 is advisory). Override per run with `--fix-threshold P0|P1|P2|P3`.
Proceed only on `pass` or `degraded-pass`; fix blocking findings on `blocked`.

## Async flow (without `--sync`)

`mmr review …` prints a job id → `mmr status <job-id>` until complete →
`mmr results <job-id> --format markdown`.

## Avoid the nested self-review

Gemini CLI itself is deprecated as an MMR reviewer. When you trigger MMR from
inside Gemini, use the supported reviewer CLIs and do not add the legacy `gemini`
channel. Pass channels space-separated (the `--channels` flag is a list, not a
comma-separated string):

```bash
mmr review --pr <number> --channels codex claude grok antigravity --sync --format json
# or set channels_disabled: ["gemini"] in .mmr.yaml
```

## Design critique (`mmr critique`)

`mmr review` reviews a *diff* for defects and gates by severity. Its peer
`mmr critique` reviews a *design* — a design doc, a pasted "problem + proposed
solution", or a plan — and is **advisory**: no severity and no pass/fail gate,
so a critique never blocks (only a usage error like a missing input file exits
non-zero). Reach for it to get independent models to weigh an approach
*before* building it.

```bash
mmr critique design.md --format json                 # critique a design doc
mmr critique - --focus scaling                       # critique stdin, focused
mmr critique design.md --context repo                # ground it in the codebase
mmr critique design.md --session redesign            # iterate across rounds
mmr critique design.md --lenses skeptic,simplifier   # one persona per channel
```

It reports **convergence** (where independent models agreed), **divergence**
(genuine splits + the deciding crux — it never picks a winner), and an editorial
**synthesis**. `--context repo` (or `--context-paths a.ts,b.ts`) grounds it in
the codebase; `--session <id>` carries the prior round across edits; `--lenses`
gives each channel a persona (and relabels output to "perspectives");
`--no-synthesis` skips the synthesis pass. It is **advisory only** — never a
merge gate.

## Auth

If a channel reports an auth failure, follow the recovery line in the output
(`claude login`, `codex login`, `grok login`, `agy -p 'hello'`), then re-run
`mmr config test` to verify.
