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
# by github-actions[bot]. OWNER falls back to the Actions-provided owner, then gh.
BASE="${BASE:-main}"
ALLOW_AUTHOR="${ALLOW_AUTHOR:-github-actions[bot]}"
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

# Wait until no knowledge-freshness version-bump runs are queued/in-progress.
# Called after each merge so the version-bump workflow's single concurrency
# group can't cancel an intermediate bump (which would undercount KB VERSION).
wait_version_bump_idle() {
  local deadline
  deadline=$(( $(date +%s) + 360 ))
  sleep 15  # let the just-triggered bump run register
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local active
    active="$(gh run list --workflow=knowledge-freshness-version-bump.yml --json status \
      --jq '[.[] | select(.status=="queued" or .status=="in_progress")] | length' \
      2>/dev/null || echo 0)"
    [ "${active:-0}" -eq 0 ] && return 0
    log "…waiting for $active version-bump run(s) to finish"
    sleep 15
  done
  echo "::warning::version-bump still active after wait; KB VERSION may lag"
}

# ── Step 1: plan ──────────────────────────────────────────────────
log "Surveying open knowledge-freshness PRs (base=$BASE author=$ALLOW_AUTHOR owner=$OWNER)"
PRS_JSON="$(gh pr list --state open --limit 100 \
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
    run gh pr close "$num" \
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

    # In scope: every changed file must live under content/knowledge/.
    OUT_OF_SCOPE="$(gh pr view "$num" --json files \
      --jq '[.files[].path | select(startswith("content/knowledge/") | not)] | length')"
    if [ "${OUT_OF_SCOPE:-0}" -ne 0 ]; then
      echo "::warning::PR #$num touches files outside content/knowledge/ — skipping (needs human review)"
      continue
    fi

    # Skip PRs with merge conflicts.
    MERGEABLE="$(gh pr view "$num" --json mergeable --jq '.mergeable' 2>/dev/null || echo UNKNOWN)"
    if [ "$MERGEABLE" = "CONFLICTING" ]; then
      echo "::notice::PR #$num has merge conflicts — skipping"
      continue
    fi

    # Check state. Nightly freshness PRs are opened with GITHUB_TOKEN, whose
    # events GitHub suppresses, so they legitimately have NO check runs (they are
    # gated inline at audit time). Accept "none"; require any present checks to be
    # green; skip while any are failing or still pending. The trust filters above
    # (base/author/owner) are what keep "no checks" safe to merge.
    CHECK_STATE="$(gh pr view "$num" --json statusCheckRollup --jq '
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
    if run gh pr merge "$num" --squash --delete-branch; then
      MERGED_COUNT=$((MERGED_COUNT + 1))
      # Serialize bumps: wait for this PR's VERSION-bump run before the next merge.
      [ "$DRY_RUN" = "true" ] || wait_version_bump_idle
    fi
  done <<< "$MERGE_NUMS"
fi
log "Merged $MERGED_COUNT PR(s) this run"

# ── Step 3: release decision ──────────────────────────────────────
git fetch --quiet --tags origin main
LAST_TAG="$(git tag --list 'v*' --sort=-version:refname | head -1)"
EMPTY_TREE="4b825dc642cb6eb9a0ff3e489513474fbd011014"  # git's well-known empty tree
if [ -n "$LAST_TAG" ]; then RANGE="$LAST_TAG..origin/main"; else RANGE="$EMPTY_TREE..origin/main"; fi

# Distinct knowledge entry slugs changed since the last release tag. The slug is
# the .md filename stem (e.g. content/knowledge/core/database-design.md →
# database-design), which matches the freshness branch topic.
ENTRIES="$(git diff --name-only "$RANGE" -- content/knowledge/ \
  | grep '\.md$' \
  | sed -E 's#.*/([^/]+)\.md$#\1#' \
  | sort -u || true)"
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
# Per-merge serialization above already waited for each bump; a final idle check
# covers any straggler before we read VERSION.
log "Releasing: confirming KB VERSION bumps have settled"
[ "$DRY_RUN" = "true" ] || wait_version_bump_idle

git fetch --quiet origin main
git reset --hard origin/main

# Recompute the entry list against settled main (VERSION bumps now landed).
ENTRIES="$(git diff --name-only "$RANGE" -- content/knowledge/ \
  | grep '\.md$' \
  | sed -E 's#.*/([^/]+)\.md$#\1#' \
  | sort -u || true)"
KB_VERSION="$(tr -d '[:space:]' < content/knowledge/VERSION)"

# Validate EXACTLY as publish.yml will, so a tag we push always publishes clean.
log "Validating release tree (build + test) before tagging"
npm run build
npm test

# Bump scaffold's patch version (package.json + lockfile; no git tag/commit).
npm version patch --no-git-tag-version >/dev/null
NEW_VERSION="$(node -p "require('./package.json').version")"
RELEASE_DATE="$(date -u +%F)"
log "New scaffold version: $NEW_VERSION (KB VERSION $KB_VERSION, $RELEASE_DATE)"

# Write the CHANGELOG block.
printf '%s\n' "$ENTRIES" | bash "$SCRIPT_DIR/kb-release-changelog.sh" \
  --version "$NEW_VERSION" --date "$RELEASE_DATE" \
  --kb-version "$KB_VERSION" --changelog CHANGELOG.md > CHANGELOG.md.new
mv CHANGELOG.md.new CHANGELOG.md

echo "──── release diff preview ────"
git --no-pager diff -- package.json CHANGELOG.md | head -60

# Commit to main and push the tag (PAT → triggers publish.yml + homebrew).
git config user.name "$BOT_NAME"
git config user.email "$BOT_EMAIL"
run git add package.json package-lock.json CHANGELOG.md
run git commit -m "release: scaffold v$NEW_VERSION — knowledge freshness batch ($RELEASE_DATE)"
run git pull --rebase origin main
run git push origin HEAD:main
run git tag "v$NEW_VERSION"
run git push origin "v$NEW_VERSION"

log "Release v$NEW_VERSION pushed. publish.yml + update-homebrew.yml will run on the tag."
