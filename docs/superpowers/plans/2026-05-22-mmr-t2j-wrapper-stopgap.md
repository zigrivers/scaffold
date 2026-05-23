# MMR T2-J Wrapper-Side Stopgap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `review-pr.md` and `review-code.md` to compute a wrapper-side stable per-finding hash (mirroring MMR T2-A's identity shape: normalized-location + category + normalized-description + normalized-suggestion), persist attempt counts in `.scaffold/review-attempts/<session-id>.json`, and stop at 3 attempts per hash so agents stop running 20+ rounds of `mmr review → fix → mmr review`.

**Architecture:** Pure prompt-engineering change to two markdown meta-prompts plus one update to CLAUDE.md and one new bats regression test. No MMR (TypeScript) source changes. The wrappers embed bash snippets that use `jq` (to extract `location` / `category` / `description` / `suggestion` from MMR's reconciled-findings JSON), an inline Python one-liner (for the case-sensitive backtick-preserving description normalization), and `shasum -a 1` (cross-platform sha1; available on both macOS and Linux). Session id derives from the review mode: PR number when `--pr N` is used, else `branch@base` slug, else a timestamp-based id. **This entire plan is throwaway when MMR v3.30 ships native `--session` and stable `finding_key` support** — the wrappers will then call MMR directly instead of computing their own hashes.

**Tech Stack:** Bash/shell snippets embedded in the meta-prompts; `jq` for JSON manipulation; `shasum -a 1` for hashing; an inline `python3 -c` block for backtick-aware description normalization (avoids painful pure-sed for the tokenize/normalize/reassemble step).

---

### Task 1: Choose and document the shared helper-snippet conventions

**Files:**
- Reference only (no edits yet): `content/tools/review-pr.md`, `content/tools/review-code.md`

- [ ] **Step 1: Confirm the exact name and JSON shape of every helper introduced by this plan**

The helpers (bash function names, file paths, and JSON keys) must stay consistent across both files. Use this table verbatim as the authority for later tasks:

| Helper | Location in wrappers | Purpose |
|---|---|---|
| `_review_session_id` | embedded snippet in both files | derives `SESSION_ID` (PR# → branch@base → ts) |
| `_review_attempts_file` | embedded snippet in both files | resolves `.scaffold/review-attempts/<SESSION_ID>.json` |
| `_review_normalize_location` | embedded snippet (sed/bash) | strips trailing `:N`, `:N-M`, `:N:M`, `(line N)` |
| `_review_normalize_description` | embedded snippet (python3 -c) | three-step backtick-preserving normalization |
| `_review_normalize_suggestion` | embedded snippet (tr / awk) | lowercase + collapse whitespace |
| `_review_finding_hash` | embedded snippet (jq + shasum) | concatenates and sha1's the four fields |
| `_review_description_shingle` | embedded snippet (python3 -c) | normalized 5-gram set as JSON array |
| `_review_record_attempt` | embedded snippet (jq) | increments attempts, returns N (1=first, 3=at-limit) |
| `_review_at_strike_limit` | embedded snippet (jq) | exit 0 if hash hit 3 strikes, else exit 1 |

JSON shape of the attempts file (single source of truth — referenced by every subsequent task):

```json
{
  "session_id": "pr-42",
  "created_at": "2026-05-22T14:30:00Z",
  "findings": {
    "<sha1-hex-hash>": {
      "attempts": 2,
      "first_seen_round": 1,
      "last_seen_round": 2,
      "normalized_location": "src/foo.ts",
      "description_shingle": ["the variable foo", "variable foo is", "foo is never", "is never used", "never used in"]
    }
  }
}
```

- [ ] **Step 2: Verify `shasum` and `jq` are available in the dev environment**

Run: `command -v shasum && command -v jq && command -v python3`
Expected: three absolute paths printed (e.g. `/usr/bin/shasum`, `/usr/bin/jq`, `/usr/bin/python3`). If any are missing, stop and tell the user — the wrappers depend on these being present on every developer machine and CI runner.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore(t2j): record helper-snippet conventions for wrapper-side stopgap"
```

---

### Task 2: Add the shared "Wrapper-Side Per-Finding Hash" section to `review-pr.md`

**Files:**
- Modify: `content/tools/review-pr.md` (add a new section after Step 7, before the existing Step 8 "Confirm Completion")

- [ ] **Step 1: Open `content/tools/review-pr.md` and locate the line containing `### Step 8: Confirm Completion`**

The new section is inserted *before* that line and *after* the existing Step 7 block that ends with the "Fix cycle channel rule" paragraph (currently around line 240).

- [ ] **Step 2: Insert this new section (verbatim) between Step 7 and Step 8**

Insert immediately after the line `**Fix cycle channel rule:** Re-run only channels that originally completed or ran as compensating passes. Never retry a channel marked \`not_installed\`, \`auth_failed\`, or \`timeout\` during fix rounds — its availability does not change within a session.` and immediately before `### Step 8: Confirm Completion`:

````markdown
### Step 7a: Wrapper-Side Per-Finding Hash (Stopgap until MMR v3.30)

Before each fix round, compute a stable hash per finding and record an attempt
in `.scaffold/review-attempts/<session-id>.json`. The hash mirrors MMR T2-A's
forthcoming `finding_key` identity (location + category + description +
suggestion) so it migrates cleanly when MMR v3.30 ships native `--session` and
`finding_key`. **Until then**, this wrapper-side bookkeeping is what enforces
the per-finding 3-strike rule.

This section is throwaway — when MMR v3.30 lands, replace this entire block
with `mmr review --session <id> --max-rounds N` and read `finding_key` from
the verdict JSON directly.

#### Derive the session id

```bash
# Session id rules (first match wins):
#   1. PR mode (--pr N) → "pr-<N>"
#   2. Branch+base    → "<branch>@<base>" (sanitized to ^[a-zA-Z0-9_.-]+$)
#   3. Fallback       → "ts-$(date -u +%Y%m%dT%H%M%SZ)"
_review_session_id() {
  if [ -n "${PR_NUMBER:-}" ]; then
    printf 'pr-%s' "$PR_NUMBER"
    return
  fi
  local branch base
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  base="${BASE_REF:-main}"
  if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
    printf '%s@%s' "$branch" "$base" | tr -c 'a-zA-Z0-9_.-' '_'
    return
  fi
  printf 'ts-%s' "$(date -u +%Y%m%dT%H%M%SZ)"
}

_review_attempts_file() {
  local id; id=$(_review_session_id)
  mkdir -p .scaffold/review-attempts
  printf '.scaffold/review-attempts/%s.json' "$id"
}
```

#### Normalize the four identity components

`normalized_location` strips trailing line/column spans (anchored to
end-of-string so mid-path digits survive):

```bash
_review_normalize_location() {
  # Input: $1 = raw location (e.g. "src/foo.ts:42-44" or "pkg/Bar.kt (line 10)")
  # Output: lowercased file path with trailing :N, :N-M, :N:M, (line N) stripped
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | awk '{ sub(/^[ \t]+/, ""); sub(/[ \t]+$/, ""); print }' \
    | sed -E 's/(:[0-9]+(:[0-9]+)?(-[0-9]+)?|[[:space:]]*\(line[[:space:]]+[0-9]+\))$//'
}
```

`description_normalized` is the tricky one — backtick-quoted code spans must
stay case-sensitive while prose around them is lowercased and stripped of
line-number filler. A python3 one-liner is the least painful implementation:

```bash
_review_normalize_description() {
  # Input: $1 = raw description
  # Output: tokenize on backticks → normalize non-code segments → reassemble
  python3 - "$1" <<'PY'
import re, sys
s = sys.argv[1]
parts = s.split("`")
out = []
for i, seg in enumerate(parts):
    if i % 2 == 1:
        # Odd index = inside backticks = code, preserve exactly
        out.append("`" + seg + "`")
    else:
        seg = seg.lower()
        seg = re.sub(r"\bline\s+\d+\b", "", seg)
        seg = re.sub(r"\bat\s+\d+\b", "", seg)
        seg = re.sub(r"^\s*(p[0-3]|critical|high|medium|low)\s*:\s*", "", seg)
        seg = re.sub(r"\s+", " ", seg).strip()
        out.append(seg)
print(" ".join(p for p in out if p))
PY
}
```

`suggestion_normalized` is lowercase + collapse-whitespace only (suggestions
are short and distinguishing — no further stripping):

```bash
_review_normalize_suggestion() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | awk '{ $1=$1; print }'
}
```

#### Compute the stable hash

```bash
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
```

#### Compute the description shingle (for future cross-round fuzzy matching)

This array is persisted alongside the hash so a follow-up MMR v3.30 migration
can run Jaccard ≥ 0.7 against historical findings without re-deriving
shingles. The wrapper itself does not currently consume the shingle for any
gating decision — strict-hash exact match is enough for the 3-strike rule.

```bash
_review_description_shingle() {
  # Input: $1 = normalized description
  # Output: JSON array of normalized 5-grams (token-based)
  python3 - "$1" <<'PY'
import json, sys
tokens = sys.argv[1].split()
shingles = sorted({" ".join(tokens[i:i+5]) for i in range(max(0, len(tokens)-4))})
print(json.dumps(shingles))
PY
}
```

#### Record an attempt and check the strike limit

```bash
_review_record_attempt() {
  # Input: $1 = finding JSON, $2 = current round number (1-based)
  # Side effect: increments attempts in the attempts file
  # Output: prints new attempt count on stdout
  local f="$1" round="$2"
  local file hash nloc shingle desc ndesc
  file=$(_review_attempts_file)
  hash=$(_review_finding_hash "$f")
  nloc=$(_review_normalize_location "$(printf '%s' "$f" | jq -r '.location // ""')")
  desc=$(printf '%s' "$f" | jq -r '.description // ""')
  ndesc=$(_review_normalize_description "$desc")
  shingle=$(_review_description_shingle "$ndesc")

  [ -f "$file" ] || printf '{"session_id":"%s","created_at":"%s","findings":{}}' \
    "$(_review_session_id)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$file"

  jq --arg h "$hash" --arg loc "$nloc" --argjson sh "$shingle" --argjson r "$round" '
    .findings[$h] = (
      .findings[$h] // {attempts: 0, first_seen_round: $r, normalized_location: $loc, description_shingle: $sh}
      | .attempts += 1
      | .last_seen_round = $r
    )
    | .findings[$h]
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"

  jq -r --arg h "$hash" '.findings[$h].attempts' "$file"
}

_review_at_strike_limit() {
  # Input: $1 = finding JSON
  # Exit: 0 if hash already has >= 3 attempts, 1 otherwise
  local f="$1" file hash
  file=$(_review_attempts_file)
  [ -f "$file" ] || return 1
  hash=$(_review_finding_hash "$f")
  local n; n=$(jq -r --arg h "$hash" '.findings[$h].attempts // 0' "$file")
  [ "$n" -ge 3 ]
}
```

#### Per-round flow

After every `mmr review … --sync --format json` call:

1. Extract reconciled findings: `FINDINGS=$(mmr results "$JOB_ID" | jq -c '.reconciled_findings[]')`
2. For each blocking finding (severity at or above `fix_threshold`):
   - Compute its hash via `_review_finding_hash`.
   - Call `_review_record_attempt "$f" "$ROUND"` to increment its counter.
   - Call `_review_at_strike_limit "$f"` — if true, this finding has hit the
     3-strike limit. Stop the fix loop, emit verdict `blocked`, and follow
     the **Stop path** in Step 8.
3. Otherwise apply fixes, re-push, increment `ROUND`, and loop.

For very noisy fix loops, you may suggest the user re-run with
`--fix-threshold P1` to narrow the gate (the project default stays at P2 per
the design's Decision 4). Do not auto-change the threshold.

This mirrors T2-A's identity components — `location`, `category`,
`description`, `suggestion` — so a future migration to MMR's native
`finding_key` is a search-and-replace of the helper calls with the field
read from the verdict JSON.
````

- [ ] **Step 3: Verify the section was inserted in the right place**

Run: `grep -n "Step 7a: Wrapper-Side Per-Finding Hash" content/tools/review-pr.md`
Expected: exactly one match, with a line number between the "Fix cycle channel rule" paragraph and `### Step 8: Confirm Completion`.

Run: `grep -n "^### Step " content/tools/review-pr.md`
Expected: Step 1 through Step 8 listed in order, with Step 7a between Step 7 and Step 8.

- [ ] **Step 4: Commit**

```bash
git add content/tools/review-pr.md
git commit -m "feat(review-pr): add wrapper-side per-finding hash stopgap (T2-J)"
```

---

### Task 3: Update the "3-round limit" wording in `review-pr.md` Step 7 to reference the wrapper hash

**Files:**
- Modify: `content/tools/review-pr.md` (around lines 233-238 in the original; the inserted Step 7a will have shifted the numbering — find by text, not line number)

- [ ] **Step 1: Locate the current Step 7 numbered-list bullet 4 ("The 3-round limit is per finding, not total rounds")**

Run: `grep -n "The 3-round limit is" content/tools/review-pr.md`

- [ ] **Step 2: Replace bullet 4 of Step 7 with the hash-aware wording**

Replace this exact text:

```markdown
4. The 3-round limit is **per finding**, not total rounds:
   - **Keep going** when each new round surfaces *different, concrete, fixable* findings — that is healthy review/fix iteration.
   - **Stop and ask the user** when (a) the *same* blocking finding (or set) recurs across 3 attempts without progress, (b) a finding is genuinely ambiguous (channels contradict each other), or (c) the user explicitly asks to stop.
   - **When stopped**, do NOT merge automatically. Document the unresolved findings (severity, location, attempt count) and let the user decide whether to continue fixing, create follow-up issues, or override.
```

With:

```markdown
4. The 3-round limit is **per finding**, enforced by the wrapper-side hash in Step 7a (`.scaffold/review-attempts/<session-id>.json`):
   - **Keep going** when each new round surfaces findings with *new* hashes — that is healthy review/fix iteration.
   - **Stop and ask the user** when (a) any blocking finding's hash hits 3 attempts in the attempts file (`_review_at_strike_limit` returns true), (b) a finding is genuinely ambiguous (channels contradict each other), or (c) the user explicitly asks to stop.
   - **When stopped**, do NOT merge automatically. Document the unresolved findings (severity, location, hash, attempt count) and let the user decide whether to continue fixing, create follow-up issues, or override.
   - Identity components used by the hash — `location`, `category`, `description`, `suggestion` — mirror MMR T2-A's forthcoming native `finding_key` (v3.30) so this bookkeeping migrates cleanly.
```

- [ ] **Step 3: Verify**

Run: `grep -n "wrapper-side hash in Step 7a" content/tools/review-pr.md`
Expected: exactly one match.

Run: `grep -c "3-round limit" content/tools/review-pr.md`
Expected: at least 1 (the updated bullet plus any other historical mentions — the next task updates Process Rules item 6 too).

- [ ] **Step 4: Commit**

```bash
git add content/tools/review-pr.md
git commit -m "docs(review-pr): point Step 7 3-round limit at wrapper hash"
```

---

### Task 4: Update Process Rules item 6 in `review-pr.md`

**Files:**
- Modify: `content/tools/review-pr.md` (Process Rules section, item 6)

- [ ] **Step 1: Locate Process Rules item 6**

Run: `grep -n "3-round limit (per finding)" content/tools/review-pr.md`

- [ ] **Step 2: Replace item 6**

Replace this exact text:

```markdown
6. **3-round limit (per finding)** — never attempt to fix the *same* blocking finding more than 3 times. Each round that surfaces a *new* fixable finding is healthy iteration — keep going. Stop only when the same finding recurs across 3 attempts, channels contradict each other, or the user asks to stop.
```

With:

```markdown
6. **3-round limit (per finding hash)** — never attempt to fix the *same* blocking finding (identified by the Step 7a hash of `location` + `category` + `description` + `suggestion`) more than 3 times. The attempts file `.scaffold/review-attempts/<session-id>.json` is the source of truth; `_review_at_strike_limit` checks it. Each round that surfaces findings with *new* hashes is healthy iteration — keep going. Stop only when a hash hits 3 attempts, channels contradict each other, or the user asks to stop. For noisy fix loops, optionally suggest `--fix-threshold P1` (the project default stays at P2).
```

- [ ] **Step 3: Verify**

Run: `grep -n "3-round limit (per finding hash)" content/tools/review-pr.md`
Expected: exactly one match.

- [ ] **Step 4: Commit**

```bash
git add content/tools/review-pr.md
git commit -m "docs(review-pr): update Process Rules item 6 to reference wrapper hash"
```

---

### Task 5: Mirror the new Step 7a section into `review-code.md`

**Files:**
- Modify: `content/tools/review-code.md` (add a parallel "Step 7a" before the existing Step 8 "Final Verdict")

- [ ] **Step 1: Locate `### Step 8: Final Verdict` in `review-code.md`**

Run: `grep -n "^### Step 8: Final Verdict" content/tools/review-code.md`

- [ ] **Step 2: Insert the same Step 7a section between Step 7 and Step 8**

Insert this verbatim block immediately before `### Step 8: Final Verdict`. The bash helpers are identical to `review-pr.md` Step 7a; only the prose wrapper differs:

````markdown
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
  # Local review never has PR_NUMBER set; fall through to branch@base, then ts.
  local branch base
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  base="${BASE_REF:-main}"
  if [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
    printf '%s@%s' "$branch" "$base" | tr -c 'a-zA-Z0-9_.-' '_'
    return
  fi
  printf 'ts-%s' "$(date -u +%Y%m%dT%H%M%SZ)"
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
`_review_at_strike_limit` are **identical** to the ones defined in
`content/tools/review-pr.md` Step 7a. Copy them verbatim; they are
reproduced here so this file is self-contained:

```bash
_review_normalize_location() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | awk '{ sub(/^[ \t]+/, ""); sub(/[ \t]+$/, ""); print }' \
    | sed -E 's/(:[0-9]+(:[0-9]+)?(-[0-9]+)?|[[:space:]]*\(line[[:space:]]+[0-9]+\))$//'
}

_review_normalize_description() {
  python3 - "$1" <<'PY'
import re, sys
s = sys.argv[1]
parts = s.split("`")
out = []
for i, seg in enumerate(parts):
    if i % 2 == 1:
        out.append("`" + seg + "`")
    else:
        seg = seg.lower()
        seg = re.sub(r"\bline\s+\d+\b", "", seg)
        seg = re.sub(r"\bat\s+\d+\b", "", seg)
        seg = re.sub(r"^\s*(p[0-3]|critical|high|medium|low)\s*:\s*", "", seg)
        seg = re.sub(r"\s+", " ", seg).strip()
        out.append(seg)
print(" ".join(p for p in out if p))
PY
}

_review_normalize_suggestion() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | awk '{ $1=$1; print }'
}

_review_finding_hash() {
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
  python3 - "$1" <<'PY'
import json, sys
tokens = sys.argv[1].split()
shingles = sorted({" ".join(tokens[i:i+5]) for i in range(max(0, len(tokens)-4))})
print(json.dumps(shingles))
PY
}

_review_record_attempt() {
  local f="$1" round="$2"
  local file hash nloc shingle desc ndesc
  file=$(_review_attempts_file)
  hash=$(_review_finding_hash "$f")
  nloc=$(_review_normalize_location "$(printf '%s' "$f" | jq -r '.location // ""')")
  desc=$(printf '%s' "$f" | jq -r '.description // ""')
  ndesc=$(_review_normalize_description "$desc")
  shingle=$(_review_description_shingle "$ndesc")
  [ -f "$file" ] || printf '{"session_id":"%s","created_at":"%s","findings":{}}' \
    "$(_review_session_id)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$file"
  jq --arg h "$hash" --arg loc "$nloc" --argjson sh "$shingle" --argjson r "$round" '
    .findings[$h] = (
      .findings[$h] // {attempts: 0, first_seen_round: $r, normalized_location: $loc, description_shingle: $sh}
      | .attempts += 1
      | .last_seen_round = $r
    )
    | .findings[$h]
  ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  jq -r --arg h "$hash" '.findings[$h].attempts' "$file"
}

_review_at_strike_limit() {
  local f="$1" file hash
  file=$(_review_attempts_file)
  [ -f "$file" ] || return 1
  hash=$(_review_finding_hash "$f")
  local n; n=$(jq -r --arg h "$hash" '.findings[$h].attempts // 0' "$file")
  [ "$n" -ge 3 ]
}
```

#### Per-round flow

After each `mmr review …` call (or `mmr results "$JOB_ID"` for the manual
fallback), iterate the reconciled findings at or above `fix_threshold`,
call `_review_record_attempt`, then check `_review_at_strike_limit`. When
any blocking finding has hit 3 strikes, stop the fix loop and emit verdict
`blocked` per Step 8.

For very noisy fix loops you may suggest `--fix-threshold P1` to narrow the
gate; the project default stays at P2 per the design's Decision 4. Do not
auto-change the threshold.

Identity components — `location`, `category`, `description`, `suggestion` —
mirror MMR T2-A's forthcoming native `finding_key` so this is a clean
migration when v3.30 ships.
````

- [ ] **Step 3: Verify**

Run: `grep -n "Step 7a: Wrapper-Side Per-Finding Hash" content/tools/review-code.md`
Expected: exactly one match, between Step 7 and Step 8.

- [ ] **Step 4: Commit**

```bash
git add content/tools/review-code.md
git commit -m "feat(review-code): add wrapper-side per-finding hash stopgap (T2-J)"
```

---

### Task 6: Update `review-code.md` Step 7 3-round wording

**Files:**
- Modify: `content/tools/review-code.md` (Step 7 bullet 4)

- [ ] **Step 1: Locate Step 7 bullet 4**

Run: `grep -n "The 3-round limit is" content/tools/review-code.md`

- [ ] **Step 2: Replace bullet 4 of Step 7**

Replace this exact text:

```markdown
4. The 3-round limit is **per finding**: stop and surface to the user when the *same* blocking finding (or set) recurs across 3 attempts without progress. Other stop conditions: a finding is genuinely ambiguous (channels contradict each other), or the user explicitly asks to stop. Use verdict `needs-user-decision` for ambiguity, `blocked` for stuck-loop cases.
```

With:

```markdown
4. The 3-round limit is **per finding hash**, enforced by the wrapper-side bookkeeping in Step 7a (`.scaffold/review-attempts/<session-id>.json`). Stop and surface to the user when any blocking finding's hash hits 3 attempts (`_review_at_strike_limit` returns true). Other stop conditions: a finding is genuinely ambiguous (channels contradict each other), or the user explicitly asks to stop. Use verdict `needs-user-decision` for ambiguity, `blocked` for stuck-hash cases. Identity components — `location`, `category`, `description`, `suggestion` — mirror MMR T2-A's forthcoming native `finding_key` (v3.30).
```

- [ ] **Step 3: Verify**

Run: `grep -n "per finding hash" content/tools/review-code.md`
Expected: exactly one match.

- [ ] **Step 4: Commit**

```bash
git add content/tools/review-code.md
git commit -m "docs(review-code): point Step 7 3-round limit at wrapper hash"
```

---

### Task 7: Update Process Rules in `review-code.md`

**Files:**
- Modify: `content/tools/review-code.md` (Process Rules)

- [ ] **Step 1: Read the existing Process Rules block**

Run: `grep -n "^## Process Rules" content/tools/review-code.md`

The current list ends at item 6 ("Dispatch pattern follows multi-model-review-dispatch"). Item 6 stays as-is; we add a new item 7.

- [ ] **Step 2: Append a new item 7 immediately before the end of the Process Rules section**

Replace this exact text:

```markdown
6. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-pr.md` and `post-implementation-review.md`.
```

With:

```markdown
6. **Dispatch pattern** follows `multi-model-review-dispatch` knowledge entry. When modifying channel dispatch in this file, verify consistency with `review-pr.md` and `post-implementation-review.md`.
7. **3-round limit (per finding hash)** — never attempt to fix the *same* blocking finding (identified by the Step 7a hash of `location` + `category` + `description` + `suggestion`) more than 3 times. The attempts file `.scaffold/review-attempts/<session-id>.json` is the source of truth; `_review_at_strike_limit` checks it. For noisy fix loops, optionally suggest `--fix-threshold P1` (the project default stays at P2).
```

- [ ] **Step 3: Verify**

Run: `grep -n "^7\. \*\*3-round limit" content/tools/review-code.md`
Expected: exactly one match in the Process Rules section.

- [ ] **Step 4: Commit**

```bash
git add content/tools/review-code.md
git commit -m "docs(review-code): add Process Rules item 7 for wrapper hash"
```

---

### Task 8: Update CLAUDE.md "Mandatory Code Review" 3-round bullet

**Files:**
- Modify: `/Users/kenallred/Developer/scaffold/CLAUDE.md` (lines 205-211 — the "3-round limit" bullet under "Critical rules")

- [ ] **Step 1: Read the exact current text**

Run: `sed -n '205,211p' CLAUDE.md`
Expected current text:

```text
- **3-round limit** — the limit is **per finding**, not per total review
  rounds. Stop and ask the user only when the *same* blocking finding (or
  set of findings) remains unresolved after 3 fix attempts. Each round
  surfacing a *new, different, fixable* finding is healthy review/fix
  iteration — keep going. Other stop conditions: a finding is genuinely
  ambiguous or channels contradict each other; the user explicitly asks
  to stop.
```

- [ ] **Step 2: Replace with hash-aware wording**

Use Edit to replace that bullet with:

```text
- **3-round limit** — the limit is **per finding hash**, enforced by the
  wrapper-side bookkeeping in `content/tools/review-pr.md` Step 7a (and the
  parallel Step 7a in `review-code.md`). The hash combines normalized
  `location` + `category` + `description` + `suggestion` and is persisted
  in `.scaffold/review-attempts/<session-id>.json`. Stop and ask the user
  only when a blocking finding's hash hits 3 attempts (`_review_at_strike_limit`
  returns true). Each round surfacing findings with *new* hashes is healthy
  review/fix iteration — keep going. Other stop conditions: a finding is
  genuinely ambiguous or channels contradict each other; the user explicitly
  asks to stop. This wrapper-side bookkeeping is a stopgap until MMR v3.30
  ships native `--session` and stable `finding_key` (see
  `docs/superpowers/specs/2026-05-22-mmr-config-ux-and-round-bounding-design.md`).
```

- [ ] **Step 3: Verify**

Run: `grep -n "per finding hash" CLAUDE.md`
Expected: exactly one match in the "Critical rules" subsection of "Mandatory Code Review".

Run: `grep -n "review-attempts" CLAUDE.md`
Expected: exactly one match (the bullet just inserted).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude-md): point 3-round rule at wrapper hash bookkeeping"
```

---

### Task 9: Add `.scaffold/review-attempts/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Inspect current `.gitignore`**

Run: `grep -n "\.scaffold" .gitignore`

- [ ] **Step 2: Append the new ignore entry if it isn't already covered**

If `.scaffold/` (whole directory) is already ignored, do nothing. Otherwise add to the end of `.gitignore`:

```text

# Wrapper-side per-finding attempt counts (T2-J stopgap until MMR v3.30)
.scaffold/review-attempts/
```

- [ ] **Step 3: Verify**

Run: `git check-ignore -v .scaffold/review-attempts/test.json`
Expected: a line showing the matching `.gitignore` rule.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore(gitignore): exclude .scaffold/review-attempts/ (T2-J)"
```

---

### Task 10: Write a bats regression test for the hash + 3-strike rule

**Files:**
- Create: `tests/review-wrapper-hash.bats`

- [ ] **Step 1: Confirm the existing bats pattern**

Run: `ls tests/*.bats | head -3`
Expected: existing tests like `fix-threshold-language-guard.bats` and `validate-frontmatter.bats`. Match their shebang and structure.

- [ ] **Step 2: Write the test file**

Create `tests/review-wrapper-hash.bats` with this exact content:

```bash
#!/usr/bin/env bats

# T2-J regression: extracts the bash helpers from content/tools/review-pr.md
# into a temp shell file, sources them, and verifies the per-finding hash
# is stable and the 3-strike rule trips on the 3rd record_attempt call.

ROOT="$BATS_TEST_DIRNAME/.."

setup() {
    TMPDIR_REVIEW="$(mktemp -d)"
    export ORIG_PWD="$PWD"
    cd "$TMPDIR_REVIEW"
    git init -q .
    # Extract every fenced bash block under Step 7a from review-pr.md.
    # The block we want starts at the "### Step 7a:" header and ends at the
    # next "### Step 8:" header; we then keep only fenced bash blocks inside it.
    awk '
        /^### Step 7a: Wrapper-Side Per-Finding Hash/ { in_section=1 }
        /^### Step 8: Confirm Completion/ { in_section=0 }
        in_section && /^```bash$/ { in_fence=1; next }
        in_section && /^```$/ && in_fence { in_fence=0; next }
        in_section && in_fence { print }
    ' "$ROOT/content/tools/review-pr.md" > helpers.sh
    # The section embeds a python3 heredoc; bats sources helpers.sh, which
    # defines the functions — they call python3 at runtime, not source time.
    # shellcheck disable=SC1091
    . ./helpers.sh
}

teardown() {
    cd "$ORIG_PWD"
    rm -rf "$TMPDIR_REVIEW"
}

@test "_review_normalize_location strips trailing :N-M" {
    result=$(_review_normalize_location "src/Foo.ts:42-44")
    [ "$result" = "src/foo.ts" ]
}

@test "_review_normalize_location strips trailing (line N)" {
    result=$(_review_normalize_location "pkg/Bar.kt (line 10)")
    [ "$result" = "pkg/bar.kt" ]
}

@test "_review_normalize_location leaves mid-path digits alone" {
    result=$(_review_normalize_location "src/v2/api3/foo.ts")
    [ "$result" = "src/v2/api3/foo.ts" ]
}

@test "_review_normalize_description preserves backtick code spans case" {
    result=$(_review_normalize_description "Variable \`fooBar\` IS UNUSED on line 42")
    [[ "$result" == *'`fooBar`'* ]]
    [[ "$result" != *"line 42"* ]]
}

@test "_review_normalize_description distinguishes fooBar from FooBar" {
    a=$(_review_normalize_description "the \`fooBar\` thing")
    b=$(_review_normalize_description "the \`FooBar\` thing")
    [ "$a" != "$b" ]
}

@test "_review_finding_hash is stable across identical findings" {
    f='{"location":"src/foo.ts:42","category":"unused","description":"Variable `x` unused on line 42","suggestion":"remove the variable"}'
    h1=$(_review_finding_hash "$f")
    h2=$(_review_finding_hash "$f")
    [ "$h1" = "$h2" ]
    [ "${#h1}" -eq 40 ]
}

@test "_review_finding_hash is stable when only line numbers change" {
    f1='{"location":"src/foo.ts:42","category":"unused","description":"Variable `x` unused on line 42","suggestion":"remove the variable"}'
    f2='{"location":"src/foo.ts:99","category":"unused","description":"Variable `x` unused on line 99","suggestion":"remove the variable"}'
    h1=$(_review_finding_hash "$f1")
    h2=$(_review_finding_hash "$f2")
    [ "$h1" = "$h2" ]
}

@test "_review_finding_hash differs when suggestions differ" {
    f1='{"location":"src/foo.ts","category":"unused","description":"Variable `x` unused","suggestion":"remove it"}'
    f2='{"location":"src/foo.ts","category":"unused","description":"Variable `x` unused","suggestion":"rename to underscore"}'
    h1=$(_review_finding_hash "$f1")
    h2=$(_review_finding_hash "$f2")
    [ "$h1" != "$h2" ]
}

@test "_review_record_attempt + _review_at_strike_limit trips on third call" {
    export PR_NUMBER="999"
    f='{"location":"src/foo.ts:1","category":"unused","description":"Variable `x` is unused","suggestion":"remove it"}'

    n1=$(_review_record_attempt "$f" 1)
    [ "$n1" = "1" ]
    run _review_at_strike_limit "$f"
    [ "$status" -ne 0 ]

    n2=$(_review_record_attempt "$f" 2)
    [ "$n2" = "2" ]
    run _review_at_strike_limit "$f"
    [ "$status" -ne 0 ]

    n3=$(_review_record_attempt "$f" 3)
    [ "$n3" = "3" ]
    run _review_at_strike_limit "$f"
    [ "$status" -eq 0 ]
}

@test "attempts file is written under .scaffold/review-attempts/<session-id>.json" {
    export PR_NUMBER="123"
    f='{"location":"src/foo.ts","category":"x","description":"y","suggestion":"z"}'
    _review_record_attempt "$f" 1 >/dev/null
    [ -f ".scaffold/review-attempts/pr-123.json" ]
    sid=$(jq -r '.session_id' .scaffold/review-attempts/pr-123.json)
    [ "$sid" = "pr-123" ]
}
```

- [ ] **Step 3: Run the new test in isolation**

Run: `bats tests/review-wrapper-hash.bats`
Expected: 10 tests pass (`ok 1` through `ok 10`, "10 tests, 0 failures").

If any test fails, the helper extraction (awk script) is the most likely culprit — re-run the awk command standalone and verify it captures every bash block under Step 7a.

- [ ] **Step 4: Commit**

```bash
git add tests/review-wrapper-hash.bats
git commit -m "test(review-wrapper-hash): regression test for T2-J wrapper hash"
```

---

### Task 11: Verify `review-pr.md` and `review-code.md` still pass frontmatter and language guards

**Files:** none modified — verification only.

- [ ] **Step 1: Run the frontmatter validator**

Run: `make validate`
Expected: exit 0, no errors. Both files have unchanged frontmatter (we only edited body content).

- [ ] **Step 2: Run the fix-threshold language guard**

Run: `bats tests/fix-threshold-language-guard.bats`
Expected: 2 tests pass. We added one mention of `--fix-threshold P1` in each wrapper, which the guard allows (it bans `P0/P1/P2` slash-separated triples, not single-flag references).

- [ ] **Step 3: Run ShellCheck on any extracted helpers**

Run: `make lint`
Expected: exit 0. ShellCheck targets `scripts/*.sh` and does not parse the embedded bash inside markdown, but we still run it to confirm we did not break any sibling script.

- [ ] **Step 4: Commit (no changes expected — skip if `git status` is clean)**

If `make validate` or `make lint` surfaced issues that require code edits, fix them and commit. Otherwise this task has no commit.

---

### Task 12: Run `make check-all` and confirm full green

**Files:** none modified — final verification.

- [ ] **Step 1: Run the full quality-gate suite**

Run: `make check-all`
Expected: exit 0. All bash gates (lint + validate + test + eval) plus all TypeScript gates pass. The new `tests/review-wrapper-hash.bats` runs as part of `make test`.

- [ ] **Step 2: If any gate fails, fix the root cause and rerun**

Do NOT mark this task complete without a green `make check-all`. Per CLAUDE.md "Prove It Works": "Never mark a task complete without demonstrating correctness — tests pass, logs clean, behavior verified."

- [ ] **Step 3: Confirm the implementation is complete**

Sanity grep:

```bash
grep -l "_review_finding_hash" content/tools/review-pr.md content/tools/review-code.md tests/review-wrapper-hash.bats
```

Expected: all three paths print. The helpers are referenced consistently across both wrappers and the regression test.

- [ ] **Step 4: Final commit (only if anything changed during verification)**

If Task 11 or Task 12 surfaced fixes, those are already committed. Otherwise nothing to commit here.

---

## Self-review checklist (run before declaring done)

1. **Spec coverage:**
   - T2-J option in §2 of the design doc → Tasks 2 and 5 add the wrapper-side hash + persistence.
   - Decision 6 in §5 ("ship immediately, throwaway when v3.30 lands") → architecture paragraph + every Step 7a section's opening note.
   - "Sequence" paragraph in §3 Thread 2 → all four identity components (location, category, description, suggestion) included in `_review_finding_hash` (Task 2 Step 2); shingle persisted alongside (Task 2 Step 2 `_review_description_shingle`); optional `--fix-threshold P1` suggestion called out in Tasks 3, 4, 6, 7; project default stays at P2 (called out in those same tasks).
2. **Placeholder scan:** No "TBD", "TODO", "appropriate", "implement later", "similar to Task N", or "as needed" appears in any task body.
3. **Type/name consistency:**
   - Function names: `_review_session_id`, `_review_attempts_file`, `_review_normalize_location`, `_review_normalize_description`, `_review_normalize_suggestion`, `_review_finding_hash`, `_review_description_shingle`, `_review_record_attempt`, `_review_at_strike_limit` — all used identically in Task 1's table, Tasks 2 and 5 (the inserted prose), and Task 10's bats test.
   - File paths: `.scaffold/review-attempts/<session-id>.json` is the single attempts-file shape; mentioned consistently in Tasks 1, 2, 3, 4, 5, 6, 7, 8, 9, 10.
   - JSON keys: `session_id`, `created_at`, `findings.<hash>.{attempts, first_seen_round, last_seen_round, normalized_location, description_shingle}` — defined once in Task 1, used unchanged in Task 2 / Task 5 (`_review_record_attempt`) and asserted in Task 10's bats test.
