---
name: review-code
description: Run all configured code review channels on local code before commit or push
summary: "Review the current local delivery candidate with the three MMR CLI channels (Codex CLI, Gemini CLI, Claude CLI) plus the Superpowers code-reviewer agent as a complementary 4th channel reconciled into the same MMR job, before committing or pushing. Supports staged changes, an explicit ref range, or the full local delivery candidate (committed branch diff + staged + unstaged); untracked files are not included."
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [multi-model-review-dispatch, automated-review-tooling]
argument-hint: "[--base <ref>] [--head <ref>] [--staged] [--report-only] [--fix-threshold P0|P1|P2|P3]"
---

## Purpose

Run the same review stack used by `review-pr` (three MMR CLI channels plus
the Superpowers code-reviewer agent as a complementary 4th channel), but on
local code before commit or push. This is the preflight review entry point
for bug fixes, small features, and quick tasks when the user wants
multi-model review before anything leaves the machine.

The three CLI channels are:
1. **Codex CLI** — implementation correctness, security, API contracts
2. **Gemini CLI** — architectural patterns, broad-context reasoning
3. **Claude CLI** — code quality, tests, and plan alignment

Plus the 4th channel:
4. **Superpowers code-reviewer** — agent-based review dispatched via the
   `superpowers:code-reviewer` skill, reconciled into the same MMR job via
   `mmr reconcile` for a unified verdict.

Scope: the full local delivery candidate (committed branch diff + staged +
unstaged changes) by default, or a narrower slice when `--staged` or
`--base`/`--head` flags are provided. **Untracked files are not reviewed** —
use `(diff -u /dev/null <path> || true) | mmr review --diff -` directly for
brand-new files.

## Inputs

- `$ARGUMENTS` (optional) — review scope flags:
  - `--base <ref>` — explicit base ref for diff review
  - `--head <ref>` — explicit head ref for diff review
  - `--staged` — review only staged changes (`git diff --cached`)
  - `--report-only` — collect findings and verdict, but do not apply fixes
  - `--fix-threshold P0|P1|P2|P3` — override the project's configured threshold for this run
- `docs/coding-standards.md` (required) — coding conventions for review context
- `docs/tdd-standards.md` (optional) — test expectations
- `docs/review-standards.md` (optional) — severity definitions and review criteria
- `AGENTS.md` (optional) — project-specific reviewer rules
- Local git state — staged diff, unstaged diff, branch diff, and changed file contents

## Expected Outputs

- A reconciled four-channel review summary for the local delivery candidate (three MMR CLI channels + Superpowers code-reviewer)
- One of these verdicts: `pass`, `degraded-pass`, `blocked`, `needs-user-decision`
- Fixed code when findings are resolved in normal mode

## Instructions

### Primary: MMR CLI + Agent Reconcile

When the MMR CLI is installed, use it as the primary entry point. Pick the
invocation that matches the scope the user asked for:

A common helper across all four invocation modes — set `MMR_FLAGS` once
and reuse it. **Note:** `FIX_THRESHOLD` is parsed from `$ARGUMENTS` in
Step 1 below; if you're skipping ahead to the invocations, run Step 1's
detection block first so the `--fix-threshold` flag actually flows
through.

```bash
MMR_FLAGS=(--sync --format json)
[ -n "$FIX_THRESHOLD" ] && MMR_FLAGS+=(--fix-threshold "$FIX_THRESHOLD")
```

```bash
# Default (no flags) — full local delivery candidate:
# committed branch diff (vs origin/main or main) + staged + unstaged.
# `mmr review` with no input flags defaults to `git diff` alone
# (unstaged only), so we MUST synthesize the combined bundle explicitly
# and pipe it in via --diff -:
# Resolve the TRUNK ref (not the branch's own upstream — we want the
# full delivery candidate, not just un-pushed work). Precedence:
# origin/HEAD (the remote's default branch) → origin/main → main →
# origin/master → master → HEAD~1 → HEAD (working-tree-only fallback).
# NOTE: do NOT use `@{u}` / branch upstream here — on a feature branch
# that tracks `origin/<branch>`, `@{u}` is that remote branch, so
# diffing against its merge-base would silently exclude already-pushed
# branch commits from the review.
BASE_REF=""
if   ORIGIN_HEAD=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null); then BASE_REF="${ORIGIN_HEAD#refs/remotes/}"
elif git rev-parse --verify origin/main   >/dev/null 2>&1; then BASE_REF=origin/main
elif git rev-parse --verify main          >/dev/null 2>&1; then BASE_REF=main
elif git rev-parse --verify origin/master >/dev/null 2>&1; then BASE_REF=origin/master
elif git rev-parse --verify master        >/dev/null 2>&1; then BASE_REF=master
elif git rev-parse --verify HEAD~1        >/dev/null 2>&1; then BASE_REF=HEAD~1
else                                                           BASE_REF=HEAD
fi
# Compute the merge-base so we only review the local delivery candidate,
# not unrelated upstream changes that have accumulated on BASE_REF since
# the branch diverged. `git diff <merge-base>` then compares that point
# to the working tree (including the index), giving one coherent patch
# that covers committed branch work + staged + unstaged edits, with
# repeated edits to the same file collapsed into a single final hunk.
MERGE_BASE=$(git merge-base "$BASE_REF" HEAD 2>/dev/null || echo "$BASE_REF")
git diff "$MERGE_BASE" | mmr review --diff - "${MMR_FLAGS[@]}"

# Staged changes only:
mmr review --staged "${MMR_FLAGS[@]}"

# Branch diff against main (committed only, no staged/unstaged):
mmr review --base main "${MMR_FLAGS[@]}"

# Explicit ref range:
mmr review --base <base-ref> --head <head-ref> "${MMR_FLAGS[@]}"
```

Routing rules:
- If `--staged` flag passed to the tool → use the `--staged` MMR invocation
- If `--base`/`--head` flags passed → use the ref-range MMR invocation
- Otherwise (no flags) → use the synthesized full-delivery-candidate form
  above. Do NOT fall back to bare `mmr review` — it would miss committed
  and staged work.

After the CLI review completes, dispatch the agent's code-reviewer skill (4th channel) and inject findings into the MMR job for unified reconciliation:

```bash
# job_id is captured from mmr review --sync --format json output
# Write agent findings to a temp file for mmr reconcile
echo "$AGENT_FINDINGS" > /tmp/agent-findings.json
mmr reconcile "$JOB_ID" --channel superpowers --input /tmp/agent-findings.json
```

The agent's review output must use MMR-compatible finding schema: each finding needs `severity` (P0-P3), `location` (file:line), and `description` (`suggestion` is optional).

If `mmr` is not installed (`command -v mmr` fails), fall back to the manual multi-channel flow below.

### Step 1: Detect Mode

Parse `$ARGUMENTS` and set:

- `REPORT_ONLY=true` if `$ARGUMENTS` contains `--report-only`
- `STAGED_ONLY=true` if `$ARGUMENTS` contains `--staged`
- `BASE_REF` from `--base <ref>` if present
- `HEAD_REF` from `--head <ref>` if present
- `FIX_THRESHOLD` from `--fix-threshold <value>` if present (must match `P0`, `P1`, `P2`, or `P3`); leave empty to defer to `.mmr.yaml`/built-in default

```bash
FIX_THRESHOLD=""
if [[ "$ARGUMENTS" =~ (^|[[:space:]])--fix-threshold[[:space:]]+(P[0-3])($|[[:space:]]) ]]; then
  FIX_THRESHOLD="${BASH_REMATCH[2]}"
fi
```

If `--head` is provided without `--base`, stop and tell the user both refs are
required for explicit-range review.

### Step 2: Build the Review Scope

Determine the delivery candidate to review.

#### Mode A: Explicit ref range

If `BASE_REF` is provided (with or without `HEAD_REF`):

```bash
git rev-parse --verify "$BASE_REF"
# When --head is omitted, default head to HEAD so the base-only form
# mirrors the MMR primary path (`mmr review --base <ref>`).
HEAD_REF="${HEAD_REF:-HEAD}"
[ "$HEAD_REF" != "HEAD" ] && git rev-parse --verify "$HEAD_REF"
REVIEW_DIFF=$(git diff "$BASE_REF...$HEAD_REF")
CHANGED_FILES=$(git diff --name-only "$BASE_REF...$HEAD_REF")
```

Set the scope label to:

```text
ref-range: BASE_REF...HEAD_REF
```

If the diff is empty, stop and tell the user there is nothing to review in that range.

#### Mode B: Staged-only review

If `--staged` is provided:

```bash
REVIEW_DIFF=$(git diff --cached)
CHANGED_FILES=$(git diff --cached --name-only)
```

Set the scope label to:

```text
staged changes
```

If the staged diff is empty, stop and tell the user there are no staged changes.

#### Mode C: Default local delivery candidate

If no scope flags are provided, review everything that would be part of the next
delivery candidate:

1. Determine a reasonable base for committed work:
   - Prefer `origin/main` if it exists
   - Otherwise prefer `main`
   - Otherwise use `HEAD~1` if it exists
   - Otherwise treat this as a working-tree-only review
2. Collect these diff segments:
   - **Committed branch diff** from the base ref to `HEAD` (if a base ref exists and differs)
   - **Staged diff** from `git diff --cached`
   - **Unstaged diff** from `git diff`
3. Concatenate all non-empty segments into one review bundle with labels:

```text
=== COMMITTED DIFF (BASE...HEAD) ===
[diff]

=== STAGED DIFF ===
[diff]

=== UNSTAGED DIFF ===
[diff]
```

4. Build `CHANGED_FILES` as the union of file names from all non-empty segments

If all three segments are empty, stop and tell the user there is nothing to review.

### Step 3: Gather Review Context

Read these files if they exist:
- `docs/coding-standards.md`
- `docs/tdd-standards.md`
- `docs/review-standards.md`
- `AGENTS.md`

Then read the full contents of changed files from `CHANGED_FILES`, excluding:
- `node_modules/`
- `.git/`
- build artifacts (`dist/`, `build/`, `coverage/`, `.next/`)

If more than 15 files changed, prioritize:
1. Production files directly modified
2. New files
3. Test files covering the change
4. Config files affecting behavior or quality gates

Format the changed-file context like:

```text
=== relative/path/to/file.ts ===
[full file contents]
```

### Step 4: Run All Three Review Channels

Each channel reviews independently. Do NOT share one channel's output with another.

**Foreground only:** Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`. Background execution produces empty output. Multiple foreground calls in a single message are fine.

#### Channel 1: Codex CLI

Check installation and auth:

```bash
command -v codex >/dev/null 2>&1
codex login status 2>/dev/null
```

- If `codex` is not installed: skip this channel and record root-cause `not_installed`
- If auth fails: tell the user to run `! codex login`, retry after recovery, and if recovery is not possible, record root-cause `auth_failed` and continue with the remaining channels

If auth cannot be recovered, or if Codex is not installed, queue a compensating Claude self-review pass focused on implementation correctness, security, and API contracts. Label findings as `[compensating: Codex-equivalent]`. If the auth check times out (the configured `channels.codex.auth.timeout`; 5s by default since Codex's check is a local file probe), retry once; if still failing, record `timeout` and queue compensating pass. This pass runs after all channel dispatch attempts complete.

Build the prompt in a temporary file and pass it over stdin:

```bash
PROMPT_FILE=$(mktemp)
# ...write the full review prompt to "$PROMPT_FILE"...
codex exec --skip-git-repo-check -s read-only --ephemeral - < "$PROMPT_FILE" 2>/dev/null
```

If the CLI exits with a non-zero code, produces malformed/unparseable output, or is killed by the tool runner timeout, record root-cause `failed` and queue a compensating pass for that channel.

#### Channel 2: Gemini CLI

Check installation and auth:

```bash
command -v gemini >/dev/null 2>&1
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
```

- If `gemini` is not installed: skip this channel and record root-cause `not_installed`
- If auth fails (including exit 41): tell the user to run `! gemini -p "hello"`, retry after recovery, and if recovery is not possible, record root-cause `auth_failed` and continue with the remaining channels

If auth cannot be recovered, or if Gemini is not installed, queue a compensating Claude self-review pass focused on architectural patterns, design reasoning, and broad context. Label findings as `[compensating: Gemini-equivalent]`. If the auth check times out (the configured `channels.gemini.auth.timeout`; 20s by default since Gemini's check is a full LLM round-trip), retry once; if still failing, record `auth timeout` and queue compensating pass. This pass runs after all channel dispatch attempts complete.

Build the prompt in a temporary file and pass it as a single prompt string:

```bash
PROMPT_FILE=$(mktemp)
# ...write the full review prompt to "$PROMPT_FILE"...
NO_BROWSER=true gemini -p "$(cat "$PROMPT_FILE")" --output-format json --approval-mode yolo 2>/dev/null
```

If the CLI exits with a non-zero code, produces malformed/unparseable output, or is killed by the tool runner timeout, record root-cause `failed` and queue a compensating pass for that channel.

#### Channel 3: Claude CLI

Dispatch via `claude -p` with the review prompt.

- If explicit refs are being reviewed, provide `BASE_SHA` and `HEAD_SHA`
- Otherwise provide:
  - the scope label
  - the unified review diff bundle
  - the changed-file contents
  - project review standards

This channel must review the same local delivery candidate, even when no PR or
clean ref range exists.

**After all channels:** Run any queued compensating passes as foreground Claude self-review passes. Each compensating pass uses the same review prompt as the missing channel, focusing on that channel's strength area.

### Step 5: Use This Review Prompt

All channels should receive an equivalent prompt bundle built from the local review scope:

```text
You are reviewing local code changes before commit or push. Report all P0, P1,
P2, and P3 findings; the project's fix threshold is applied downstream.

## Scope
[scope label]

## Review Standards
[docs/review-standards.md if present, otherwise define P0–P3]

## Coding Standards
[docs/coding-standards.md]

## Test Standards
[docs/tdd-standards.md if present]

## Project Review Rules
[AGENTS.md excerpts if present]

## Delivery Candidate Diff
[review diff bundle]

## Changed File Contents
[changed file contents]

## Output Format
Respond with JSON:
{
  "approved": true/false,
  "findings": [
    {
      "severity": "P0" | "P1" | "P2" | "P3",
      "location": "file:line or section",
      "description": "what is wrong",
      "suggestion": "specific fix"
    }
  ],
  "summary": "one-line assessment"
}
```

### Step 6: Reconcile Findings

Use these rules:

| Scenario | Action |
|----------|--------|
| Same issue flagged by 2+ channels | High confidence — fix immediately |
| Any single P0 | Fix immediately |
| Any single P1 | Fix immediately |
| Any single P2 | Fix unless clearly inapplicable; if disputed, surface to user |
| All executed channels approve | Candidate passes review |
| Strong contradiction on a medium-severity issue | Verdict becomes `needs-user-decision` |
| Compensating-pass blocking finding | Single-source confidence — fix per normal thresholds, but label as compensating in summary |

### Step 7: Apply Fixes Unless in Report-Only Mode

If `REPORT_ONLY=true`:
- Do NOT edit code
- Output the review summary and final verdict
- Stop

Otherwise:
1. Fix all findings at or above `fix_threshold` (read from `results.fix_threshold` in the verdict JSON; default `P2`)
2. Re-run the channels that produced findings
3. Keep iterating as long as each new round surfaces *different, concrete, fixable* findings — that is healthy review/fix iteration, not a stuck loop
4. The 3-round limit is **per finding**: stop and surface to the user when the *same* blocking finding (or set) recurs across 3 attempts without progress. Other stop conditions: a finding is genuinely ambiguous (channels contradict each other), or the user explicitly asks to stop. Use verdict `needs-user-decision` for ambiguity, `blocked` for stuck-loop cases.

**Fix cycle channel rule:** Re-run only channels that originally completed or ran as compensating passes. Never retry a channel marked `not_installed`, `auth_failed`, or `timeout` during fix rounds — its availability does not change within a session.

### Step 7a: Wrapper-Side Per-Finding Hash (Stopgap until MMR v3.30)

Same wrapper-side bookkeeping as `review-pr.md` Step 7a. Local review reuses
the helpers verbatim — only the session-id derivation differs (no PR number,
so the rule falls through to `<branch>@<base>` or a timestamp).

This section is throwaway — when MMR v3.30 lands, replace this entire block
with `mmr review --session <id> --max-rounds N` and read `finding_key` from
the verdict JSON directly.

#### Session id (review-code variant)

```bash
_review_session_id() {
  _review_sanitize_session_id() {
    local raw="$1" sanitized
    sanitized=$(printf '%s' "$raw" | tr -c 'a-zA-Z0-9_.-' '_')
    if [ -z "$sanitized" ] || [ "$sanitized" = "." ] || [ "$sanitized" = ".." ]; then
      echo "Error: review session id resolves to an unsafe path segment" >&2
      return 1
    fi
    printf '%s' "$sanitized"
  }

  if [ -n "${REVIEW_SESSION_ID:-}" ]; then
    _review_sanitize_session_id "$REVIEW_SESSION_ID"
    return
  fi
  if [ -n "${__REVIEW_SESSION_ID:-}" ]; then
    _review_sanitize_session_id "$__REVIEW_SESSION_ID"
    return
  fi
  local branch base
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  base="${BASE_REF:-main}"
  if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
    __REVIEW_SESSION_ID=$(_review_sanitize_session_id "$branch@$base") || return 1
    printf '%s' "$__REVIEW_SESSION_ID"
    return
  fi
  __REVIEW_SESSION_ID=$(_review_sanitize_session_id "ts-$(date -u +%Y%m%dT%H%M%SZ)") || return 1
  printf '%s' "$__REVIEW_SESSION_ID"
}

_review_attempts_file() {
  local id; id=$(_review_session_id)
  mkdir -p .scaffold/review-attempts
  printf '.scaffold/review-attempts/%s.json' "$id"
}
```

#### Normalization, hashing, shingle, and attempt-recording helpers

The functions `_review_normalize_location`, `_review_normalize_description`,
`_review_normalize_suggestion`, `_review_finding_hash`,
`_review_description_shingle`, `_review_record_attempt`, and
`_review_at_strike_limit` match the semantics of the ones defined in
`content/tools/review-pr.md` Step 7a. They are reproduced here so this file is
self-contained:

They are intentionally reproduced in this tool file instead of sourced from a
shared script because agent-facing tool markdown must be self-contained until
MMR v3.30 provides native `finding_key` and session tracking.

```bash
_review_require_python3() {
  command -v python3 >/dev/null 2>&1 || {
    echo "Error: python3 is required for review finding normalization" >&2
    return 1
  }
}

_review_normalize_location() {
  # Input: $1 = raw location (e.g. "src/foo.ts:42-44" or "pkg/Bar.kt (line 10)")
  # Output: lowercased file path with trailing :N, :N-M, :N:M, (line N) stripped
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | awk '{ sub(/^[ \t]+/, ""); sub(/[ \t]+$/, ""); print }' \
    | sed -E 's/(:[0-9]+(:[0-9]+)?(-[0-9]+)?|[[:space:]]+\(line[[:space:]]+[0-9]+\))$//'
}

_review_normalize_description() {
  # Input: $1 = raw description
  # Output: tokenize on backticks → normalize non-code segments → reassemble
  _review_require_python3 || return 1
  printf '%s' "$1" | python3 -c '
import re, sys
s = sys.stdin.read()
parts = s.split("`")
out = []
for i, seg in enumerate(parts):
    if i % 2 == 1:
        # Odd index = inside backticks = code, preserve exactly
        out.append("`" + seg + "`")
    else:
        seg = seg.lower()
        seg = re.sub(r"\bline\s+\d+\b", "", seg)
        seg = re.sub(r"\bat\s+line\s+\d+\b", "", seg)
        seg = re.sub(r"^\s*(p[0-3]|critical|high|medium|low|trivial)\s*:\s*", "", seg)
        seg = re.sub(r"\s+", " ", seg).strip()
        out.append(seg)
print(" ".join(p for p in out if p))
'
}

_review_normalize_suggestion() {
  _review_require_python3 || return 1
  printf '%s' "$1" | python3 -c 'import re, sys; print(re.sub(r"\s+", " ", sys.stdin.read().lower()).strip())'
}

_review_finding_hash() {
  # Input: $1 = single-finding JSON object (with location, category, description, suggestion fields)
  # Output: 40-char sha1 hex of normalized_location + "|" + category + "|" + sha1(description_normalized) + "|" + sha1(suggestion_normalized)
  local f="$1"
  local loc cat desc sugg
  loc=$(printf '%s' "$f"  | jq -r '.location // ""')
  cat=$(printf '%s' "$f"  | jq -r '.category // ""')
  desc=$(printf '%s' "$f" | jq -r '.description // ""')
  sugg=$(printf '%s' "$f" | jq -r '.suggestion // ""')

  local nloc ndesc nsugg dhash shash
  nloc=$(_review_normalize_location "$loc")
  ndesc=$(_review_normalize_description "$desc")
  nsugg=$(_review_normalize_suggestion "$sugg")
  dhash=$(printf '%s' "$ndesc" | shasum -a 1 | awk '{print $1}')
  shash=$(printf '%s' "$nsugg" | shasum -a 1 | awk '{print $1}')

  printf '%s|%s|%s|%s' "$nloc" "$cat" "$dhash" "$shash" \
    | shasum -a 1 | awk '{print $1}'
}

_review_description_shingle() {
  # Input: $1 = normalized description
  # Output: JSON array of normalized 5-grams (token-based)
  _review_require_python3 || return 1
  printf '%s' "$1" | python3 -c '
import json, sys
tokens = sys.stdin.read().split()
shingles = sorted({" ".join(tokens[i:i+5]) for i in range(max(0, len(tokens)-4))})
print(json.dumps(shingles))
'
}

_review_record_attempt() {
  # Input: $1 = finding JSON, $2 = current round number (1-based), $3 = optional precomputed finding hash
  # Side effect: increments attempts in the attempts file
  # Output: prints new attempt count on stdout
  local f="$1" round="$2" hash="${3:-}"
  local file loc desc nloc ndesc shingle
  file=$(_review_attempts_file)
  loc=$(printf '%s' "$f"  | jq -r '.location // ""')
  desc=$(printf '%s' "$f" | jq -r '.description // ""')
  nloc=$(_review_normalize_location "$loc")
  ndesc=$(_review_normalize_description "$desc")
  if [ -z "$hash" ]; then
    hash=$(_review_finding_hash "$f")
  fi
  shingle=$(_review_description_shingle "$ndesc")

  [ -f "$file" ] || jq -n --arg id "$(_review_session_id)" --arg created "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{session_id: $id, created_at: $created, findings: {}}' > "$file"

  jq --arg h "$hash" --arg loc "$nloc" --argjson sh "$shingle" --argjson r "$round" '
    .findings[$h] = (
      .findings[$h] // {attempts: 0, first_seen_round: $r, normalized_location: $loc, description_shingle: $sh}
      | .attempts += (if .last_seen_round == $r then 0 else 1 end)
      | .last_seen_round = $r
    )
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"

  jq -r --arg h "$hash" '.findings[$h].attempts' "$file"
}

_review_at_strike_limit() {
  # Input: $1 = finding JSON, $2 = optional precomputed finding hash
  # Exit: 0 if hash already has >= REVIEW_STRIKE_LIMIT attempts, 1 otherwise
  local f="$1" file hash
  hash="${2:-}"
  file=$(_review_attempts_file)
  [ -f "$file" ] || return 1
  [ -n "$hash" ] || hash=$(_review_finding_hash "$f")
  local n; n=$(jq -r --arg h "$hash" '.findings[$h].attempts // 0' "$file")
  [ "$n" -ge "${REVIEW_STRIKE_LIMIT:-3}" ]
}
```

This bookkeeping assumes sequential execution within a single workspace or
worktree. Do not run multiple review/fix loops against the same
`REVIEW_SESSION_ID` concurrently.

#### Per-round flow

After each `mmr review …` call (or `mmr results "$JOB_ID"` for the manual
fallback), iterate the reconciled findings at or above `fix_threshold`,
call `_review_at_strike_limit` before incrementing, call
`_review_record_attempt` when still below the strike limit, then stop the
fix loop and emit verdict `blocked` per Step 8 when any blocking finding has
hit 3 strikes.

For very noisy fix loops you may suggest `--fix-threshold P1` to narrow the
gate; the project default stays at P2 per the design's Decision 4. Do not
auto-change the threshold.

Identity components — `location`, `category`, `description`, `suggestion` —
mirror MMR T2-A's forthcoming native `finding_key` so this is a clean
migration when v3.30 ships.

### Step 8: Final Verdict

Return exactly one verdict:

- `pass` — all channels completed with `full` coverage, no unresolved findings at or above `fix_threshold`
- `degraded-pass` — at least one channel was skipped/compensated (coverage is not all `full`), but all executed and compensating channels have no unresolved findings at or above `fix_threshold`
- `blocked` — gate failed: at least one unresolved finding sits at or above the fix threshold (typically the *same* finding(s) remain unresolved after 3 fix attempts; the threshold defaults to `P2` but is configurable via `.mmr.yaml` or `--fix-threshold`)
- `needs-user-decision` — no channels completed (no reconciled result was possible), reviewer disagreement / contradictions, or a finding requires human judgment that automated iteration can't resolve

When compensating passes ran for any channel, the maximum achievable verdict is `degraded-pass` — never `pass`, even if all findings are resolved. When both external channels were compensated, the review summary must note: "All findings are single-model (Claude only)."

### Step 9: Report Results

Output a concise summary in this format:

```text
## Code Review Summary — Local Delivery Candidate

### Scope
[scope label]

### Channels Executed
- Codex CLI — root cause: [completed / not_installed / auth_failed / timeout / failed], coverage: [full / compensating (Codex-equivalent)]
- Gemini CLI — root cause: [completed / not_installed / auth_failed / timeout / failed], coverage: [full / compensating (Gemini-equivalent)]
- Claude CLI — root cause: [completed / not_installed / auth_failed / timeout / failed], coverage: [full / none (Claude is never compensated — it IS the compensator for Codex/Gemini)]
- Agent review (Superpowers code-reviewer, 4th channel) — [completed / skipped], injected via `mmr reconcile`

### Findings
[consensus findings first, then single-source findings]

### Verdict
[pass / degraded-pass / blocked / needs-user-decision]
```

If the verdict is `pass` or `degraded-pass`, explicitly say the code is ready
for the next delivery step (commit, push, or PR creation).

## Process Rules

1. **Foreground only** — Always run Codex and Gemini CLI commands as foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`.
2. **All 3 channels are mandatory** — skip only when a tool is genuinely not installed, never by choice.
3. **Auth failures are not silent** — always surface to the user with recovery instructions.
4. **Independence** — never share one channel's output with another.
5. **Fix before proceeding** — findings at or above `fix_threshold` must be resolved before moving to the next task.
6. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-pr.md` and `post-implementation-review.md`.
