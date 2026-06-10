#!/bin/bash
# Orchestrate the daily knowledge-base auto-merge + batched release.
#
# This is the GLUE the knowledge-auto-merge-release.yml workflow runs. It has
# network/git side effects (gh, git push, tags) and is intentionally NOT unit
# tested — the deterministic logic lives in the three pure scripts it calls:
#   * kb-auto-merge-plan.sh     newest-per-topic merge/close plan
#   * kb-release-decision.sh    release-vs-defer cadence decision
#   * kb-release-changelog.sh   CHANGELOG block generation
# (all covered by tests/kb-auto-merge-release.bats).
#
# Flow each run:
#   1. Plan the open knowledge-freshness PRs (newest-per-topic).
#   2. Close superseded dupes; merge the newest IF its checks are green AND it
#      only touches content/knowledge/** (defense in depth).
#   3. Decide whether to cut a batched release (Sunday / surge threshold).
#   4. If releasing: wait for KB-VERSION bumps to settle, validate exactly as
#      publish.yml will (build + test), bump scaffold's patch version, write the
#      CHANGELOG block, commit to main, and push a v* tag (which fires
#      publish.yml + update-homebrew.yml).
#
# Driven by env (set by the workflow):
#   GH_TOKEN            PAT used for gh + the tag push (so downstream workflows fire)
#   DRY_RUN             true → plan/validate only; never merge, commit, tag, or push
#   FORCE_RELEASE       true → release whenever changes are pending, ignoring cadence
#   RELEASE_THRESHOLD   surge valve (default 10)
#   RELEASE_DOW         cadence day, 0=Sunday UTC (default 0)
#   BOT_NAME / BOT_EMAIL  git identity for the release commit
#
# Bash 3.2+ compatible.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_DIR"

DRY_RUN="${DRY_RUN:-false}"
FORCE_RELEASE="${FORCE_RELEASE:-false}"
RELEASE_THRESHOLD="${RELEASE_THRESHOLD:-10}"
RELEASE_DOW="${RELEASE_DOW:-0}"
BOT_NAME="${BOT_NAME:-knowledge-release-bot}"
BOT_EMAIL="${BOT_EMAIL:-knowledge-freshness@users.noreply.github.com}"

# Trust filters for which PRs are eligible to auto-merge (passed to the plan).
# Defaults match the nightly freshness automation: same-repo, base main, opened
# by the Actions bot. The bot's login is rendered as `app/github-actions` OR
# `github-actions[bot]` across gh versions/contexts, so the allowlist names both.
# OWNER falls back to the Actions-provided owner, then gh.
BASE="${BASE:-main}"
ALLOW_AUTHOR="${ALLOW_AUTHOR:-app/github-actions github-actions[bot]}"
OWNER="${OWNER:-${GITHUB_REPOSITORY_OWNER:-}}"
if [ -z "$OWNER" ]; then
  OWNER="$(gh repo view --json owner --jq '.owner.login' 2>/dev/null || echo '')"
fi

# Echo a command, then run it unless DRY_RUN — used for every mutating action.
run() {
  echo "+ $*"
  if [ "$DRY_RUN" = "true" ]; then
    echo "  (dry-run: not executed)"
    return 0
  fi
  "$@"
}

log() { echo "── $*"; }

# Run a `gh` command with retry/backoff. GitHub's GraphQL endpoint intermittently
# returns transient `HTTP 401`/5xx under burst usage even with a valid token;
# a lone failure mid-batch should be retried, not fatal. Retries up to 4 times
# with linear backoff. Used for the network-y gh calls (reads, merge, close) —
# NOT for calls whose non-zero exit is meaningful (e.g. `gh pr checks`).
gh_retry() {
  local n=0 max=4
  while :; do
    if gh "$@"; then return 0; fi
    n=$((n + 1))
    [ "$n" -ge "$max" ] && { echo "::warning::gh $* failed after $max attempts" >&2; return 1; }
    echo "  (gh transient failure; retry $n/$((max - 1)) after $((n * 5))s)" >&2
    sleep $((n * 5))
  done
}

# Wait until no knowledge-freshness version-bump runs are queued/in-progress.
# Called after each merge so the version-bump workflow's single concurrency
# group can't cancel an intermediate bump (which would undercount KB VERSION).
#
# A failed `gh run list` (transient API error, or a token lacking Actions:read)
# must NOT be read as "0 active runs" — that would silently skip serialization.
# We distinguish failure (retry until the deadline) from a real idle result, and
# only proceed past the deadline with an explicit warning.
wait_version_bump_idle() {
  local deadline
  deadline=$(( $(date +%s) + 360 ))
  sleep 15  # let the just-triggered bump run register
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local active rc
    active="$(gh run list --workflow=knowledge-freshness-version-bump.yml --json status \
      --jq '[.[] | select(.status=="queued" or .status=="in_progress")] | length')" && rc=0 || rc=$?
    if [ "${rc:-1}" -ne 0 ]; then
      echo "::warning::could not query version-bump runs (gh exit ${rc}; RELEASE_BOT_TOKEN needs Actions:read) — retrying"
      sleep 15
      continue
    fi
    [ "${active:-0}" -eq 0 ] && return 0
    log "…waiting for $active version-bump run(s) to finish"
    sleep 15
  done
  echo "::warning::version-bump runs still active or unverifiable after wait; KB VERSION may lag"
}

# ── Step 0: preflight ─────────────────────────────────────────────
# Merge serialization polls `gh run list`, which needs the Actions:read scope.
# Verify it ONCE up front (live runs only) and fail fast with an actionable
# message, rather than discovering it mid-loop and burning the retry budget on
# every merge.
if [ "$DRY_RUN" != "true" ]; then
  if ! gh_retry run list --workflow=knowledge-freshness-version-bump.yml --limit 1 \
        --json status >/dev/null 2>&1; then
    echo "::error::RELEASE_BOT_TOKEN cannot read Actions runs (needs the Actions:read scope), required for merge serialization. Add the scope and re-run."
    exit 1
  fi
fi

# ── Step 1: plan ──────────────────────────────────────────────────
log "Surveying open knowledge-freshness PRs (base=$BASE author=$ALLOW_AUTHOR owner=$OWNER)"
PRS_JSON="$(gh_retry pr list --state open --limit 100 \
  --json number,title,headRefName,createdAt,baseRefName,author,headRepositoryOwner)"
PLAN="$(printf '%s' "$PRS_JSON" \
  | BASE="$BASE" ALLOW_AUTHOR="$ALLOW_AUTHOR" OWNER="$OWNER" \
    bash "$SCRIPT_DIR/kb-auto-merge-plan.sh")"

MERGE_NUMS="$(printf '%s' "$PLAN" | jq -r '.merge[].number')"
CLOSE_LINES="$(printf '%s' "$PLAN" | jq -r '.close[] | "\(.number) \(.supersededBy)"')"

# ── Step 2a: close superseded dupes ───────────────────────────────
if [ -n "$CLOSE_LINES" ]; then
  while IFS=' ' read -r num winner; do
    [ -z "$num" ] && continue
    log "Closing #$num as superseded by #$winner"
    # --delete-branch so a closed dupe doesn't leave a stale remote branch
    # (GitHub's auto-delete only fires on MERGE, not on close).
    run gh_retry pr close "$num" --delete-branch \
      --comment "Superseded by #$winner (newer freshness run for the same topic)."
  done <<< "$CLOSE_LINES"
else
  log "No duplicate PRs to close"
fi

# ── Step 2b: merge the newest-per-topic PRs that are green + in scope ──
MERGED_COUNT=0
if [ -n "$MERGE_NUMS" ]; then
  while IFS= read -r num; do
    [ -z "$num" ] && continue

    # In scope: every changed file must live under content/knowledge/. A gh
    # failure here must not abort the whole run (set -e) — skip this PR instead.
    OUT_OF_SCOPE="$(gh_retry pr view "$num" --json files \
      --jq '[.files[].path | select(startswith("content/knowledge/") | not)] | length' \
      2>/dev/null || echo "error")"
    if [ "$OUT_OF_SCOPE" = "error" ]; then
      echo "::notice::could not read files for #$num — skipping this run"
      continue
    fi
    if [ "$OUT_OF_SCOPE" -ne 0 ]; then
      echo "::warning::PR #$num touches files outside content/knowledge/ — skipping (needs human review)"
      continue
    fi

    # Only merge a PR GitHub reports as cleanly MERGEABLE. CONFLICTING is skipped;
    # UNKNOWN (GitHub still computing) is also skipped so we don't merge blind —
    # the next daily run retries once the state settles.
    MERGEABLE="$(gh_retry pr view "$num" --json mergeable --jq '.mergeable' 2>/dev/null || echo UNKNOWN)"
    if [ "$MERGEABLE" != "MERGEABLE" ]; then
      echo "::notice::PR #$num mergeable=$MERGEABLE — skipping this run"
      continue
    fi

    # Check state. Nightly freshness PRs are opened with GITHUB_TOKEN, whose
    # events GitHub suppresses, so they legitimately have NO check runs (they are
    # gated inline at audit time). Accept "none"; require any present checks to be
    # green; skip while any are failing or still pending. The trust filters above
    # (base/author/owner) are what keep "no checks" safe to merge.
    CHECK_STATE="$(gh_retry pr view "$num" --json statusCheckRollup --jq '
      if (.statusCheckRollup | length) == 0 then "none"
      elif any(.statusCheckRollup[];
               ((.conclusion // .state // "") | ascii_upcase) as $c
               | ($c != "SUCCESS" and $c != "NEUTRAL" and $c != "SKIPPED"))
      then "not-green" else "green" end' 2>/dev/null || echo "unknown")"
    if [ "$CHECK_STATE" = "not-green" ] || [ "$CHECK_STATE" = "unknown" ]; then
      echo "::notice::PR #$num checks not green yet ($CHECK_STATE) — skipping this run"
      continue
    fi

    log "Merging #$num (squash; checks=$CHECK_STATE)"
    if run gh_retry pr merge "$num" --squash --delete-branch; then
      MERGED_COUNT=$((MERGED_COUNT + 1))
      # Serialize bumps: wait for this PR's VERSION-bump run before the next merge.
      [ "$DRY_RUN" = "true" ] || wait_version_bump_idle
    fi
  done <<< "$MERGE_NUMS"
fi
log "Merged $MERGED_COUNT PR(s) this run"

# ── Step 3: release decision ──────────────────────────────────────
# Fetch without an explicit branch so the origin/main remote-tracking ref (and
# tags) are reliably updated — `git fetch origin main` only guarantees
# FETCH_HEAD, which would let us read a pre-merge origin/main.
git fetch --quiet --tags origin
LAST_TAG="$(git tag --list 'v*' --sort=-version:refname | head -1)"
# Compute the empty-tree hash for this repo's object format (works for both
# SHA-1 and a SHA-256 repo) rather than hardcoding the SHA-1 constant.
EMPTY_TREE="$(git hash-object -t tree /dev/null)"
if [ -n "$LAST_TAG" ]; then RANGE="$LAST_TAG..origin/main"; else RANGE="$EMPTY_TREE..origin/main"; fi

# Distinct knowledge entry slugs changed since the last release tag. The slug is
# the .md filename stem (e.g. content/knowledge/core/database-design.md →
# database-design), which matches the freshness branch topic.
ENTRIES="$(git diff --name-only --diff-filter=d "$RANGE" -- content/knowledge/ \
  | { grep '\.md$' || true; } \
  | sed -E 's#.*/([^/]+)\.md$#\1#' \
  | sort -u)"
TOPIC_COUNT="$(printf '%s' "$ENTRIES" | grep -c '^' || true)"
log "Unreleased knowledge topics since ${LAST_TAG:-<no tag>}: $TOPIC_COUNT"

DOW="$(date -u +%w)"
DECISION="$(bash "$SCRIPT_DIR/kb-release-decision.sh" \
  --dow "$DOW" --unreleased-topics "$TOPIC_COUNT" \
  --threshold "$RELEASE_THRESHOLD" --release-dow "$RELEASE_DOW")"
log "Cadence decision: $DECISION"

DO_RELEASE=false
case "$DECISION" in
  release:*) DO_RELEASE=true ;;
esac
if [ "$FORCE_RELEASE" = "true" ] && [ "$TOPIC_COUNT" -gt 0 ]; then
  log "FORCE_RELEASE set — overriding cadence (changes pending)"
  DO_RELEASE=true
fi

if [ "$DO_RELEASE" != "true" ]; then
  log "No release this run. Done."
  exit 0
fi

# ── Step 4: cut the batched release ───────────────────────────────
git fetch --quiet origin   # update origin/main tracking ref (not just FETCH_HEAD)

# Read settled values straight from origin/main via `git show`/`git diff` so we
# never touch the working tree until we are committed to a LIVE release. The
# entry list is recomputed against settled main (VERSION bumps now landed).
ENTRIES="$(git diff --name-only --diff-filter=d "$RANGE" -- content/knowledge/ \
  | { grep '\.md$' || true; } \
  | sed -E 's#.*/([^/]+)\.md$#\1#' \
  | sort -u)"
KB_VERSION="$(git show origin/main:content/knowledge/VERSION | tr -d '[:space:]')"
RELEASE_DATE="$(date -u +%F)"

# Dry-run is strictly read-only: no reset, no file writes, no npm version, no
# git mutations. Preview the planned version + CHANGELOG block, then stop.
if [ "$DRY_RUN" = "true" ]; then
  NEW_VERSION="$(node -e 'const m=require("./package.json").version.match(/^(\d+)\.(\d+)\.(\d+)/); if(!m){console.error("unparseable version");process.exit(1)} console.log(`${m[1]}.${m[2]}.${+m[3]+1}`)')"
  log "(dry-run) would release scaffold v$NEW_VERSION (KB VERSION $KB_VERSION, $RELEASE_DATE) covering $TOPIC_COUNT topic(s)"
  echo "──── (dry-run) CHANGELOG block that would be inserted ────"
  printf '%s\n' "$ENTRIES" | bash "$SCRIPT_DIR/kb-release-changelog.sh" \
    --version "$NEW_VERSION" --date "$RELEASE_DATE" \
    --kb-version "$KB_VERSION" --changelog CHANGELOG.md \
    | sed -n "/^## \\[$NEW_VERSION\\]/,/KB .VERSION/p"
  log "(dry-run) no merge/commit/tag/push performed. Done."
  exit 0
fi

# ── live release (mutations from here) ────────────────────────────
wait_version_bump_idle
# Surface (don't abort on) a failed latest VERSION bump: the release still works,
# but KB VERSION may lag. A `cancelled` run is expected under the concurrency
# group and is not treated as a failure.
LATEST_BUMP="$(gh run list --workflow=knowledge-freshness-version-bump.yml \
  --status completed --limit 1 --json conclusion --jq '.[0].conclusion // ""' \
  2>/dev/null || echo "")"
if [ "$LATEST_BUMP" = "failure" ]; then
  echo "::warning::latest knowledge-freshness version-bump run FAILED — KB VERSION may be stale in this release"
fi

git config user.name "$BOT_NAME"
git config user.email "$BOT_EMAIL"

# Build the release commit on the current settled main and push it
# FAST-FORWARD-ONLY, so the commit we tag is exactly the tree we built and
# validated. If main advanced meanwhile (e.g. a late version-bump), the push is
# rejected — we re-sync, re-validate, and retry rather than rebasing unvalidated
# content under the tag (a plain `git pull --rebase` would do exactly that).
# Bounded so a pathological race can't loop forever.
attempt=0
while :; do
  attempt=$((attempt + 1))
  git fetch --quiet origin
  git reset --hard origin/main

  # Recompute against the just-synced main (entries + KB VERSION may have moved).
  ENTRIES="$(git diff --name-only --diff-filter=d "$RANGE" -- content/knowledge/ \
    | { grep '\.md$' || true; } \
    | sed -E 's#.*/([^/]+)\.md$#\1#' \
    | sort -u)"
  KB_VERSION="$(tr -d '[:space:]' < content/knowledge/VERSION)"

  # Validate EXACTLY as publish.yml will, so a tag we push always publishes clean.
  log "Validating release tree (build + test) before tagging (attempt $attempt)"
  npm run build
  npm test

  # Bump scaffold's patch version (package.json + lockfile; no git tag/commit).
  npm version patch --no-git-tag-version >/dev/null
  NEW_VERSION="$(node -p "require('./package.json').version")"
  log "New scaffold version: $NEW_VERSION (KB VERSION $KB_VERSION, $RELEASE_DATE)"

  printf '%s\n' "$ENTRIES" | bash "$SCRIPT_DIR/kb-release-changelog.sh" \
    --version "$NEW_VERSION" --date "$RELEASE_DATE" \
    --kb-version "$KB_VERSION" --changelog CHANGELOG.md > CHANGELOG.md.new
  mv CHANGELOG.md.new CHANGELOG.md

  echo "──── release diff preview ────"
  git --no-pager diff -- package.json CHANGELOG.md | head -60

  git add package.json package-lock.json CHANGELOG.md
  git commit -m "release: scaffold v$NEW_VERSION — knowledge freshness batch ($RELEASE_DATE)"

  # Fast-forward-only push: succeeds only if main is still at the commit we
  # validated on top of.
  if git push origin HEAD:main; then
    break
  fi
  if [ "$attempt" -ge 3 ]; then
    echo "::error::main kept advancing during release after $attempt attempts — aborting before tagging"
    exit 1
  fi
  log "main advanced during release — re-syncing and re-validating"
done

# Tag the exact commit we just validated and pushed (now main's HEAD), so
# publish.yml + update-homebrew.yml build the validated tree.
git tag "v$NEW_VERSION"
git push origin "v$NEW_VERSION"

log "Release v$NEW_VERSION pushed. publish.yml + update-homebrew.yml will run on the tag."
