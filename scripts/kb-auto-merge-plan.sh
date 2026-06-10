#!/bin/bash
# Compute the auto-merge plan for nightly knowledge-freshness PRs.
#
# Reads a JSON array of open PRs on stdin (the shape produced by
#   gh pr list --json number,title,headRefName,createdAt)
# and emits a plan on stdout:
#   { "merge": [ {number, topic, createdAt} ],   # newest PR per topic
#     "close": [ {number, topic, supersededBy} ] # older same-topic dupes
#   }
#
# Only PRs whose head branch starts with `knowledge-freshness/` are considered;
# anything else (human branches) is ignored. The topic is the branch name with
# the `knowledge-freshness/` prefix and the trailing `-YYYY-MM-DD` date removed,
# so `knowledge-freshness/multi-service-api-contracts-2026-06-09` → topic
# `multi-service-api-contracts`.
#
# Trust filters (set by the workflow; empty = filter disabled, for tests):
#   BASE          require .baseRefName == "$BASE"            (e.g. main)
#   ALLOW_AUTHOR  require .author.login ∈ "$ALLOW_AUTHOR" (space-separated
#                 allowlist; the Actions bot is rendered as `app/github-actions`
#                 OR `github-actions[bot]` depending on gh version/context, so
#                 the default lists both)
#   OWNER         require .headRepositoryOwner.login==$OWNER (same-repo, not a fork)
# These stop the release token from auto-merging an arbitrary PR that merely
# adopts the `knowledge-freshness/` branch name (critical because no-check bot
# PRs are otherwise eligible). Each filter FAILS CLOSED: when its env var is set,
# a PR with a missing/null/mismatched value is rejected (a null author or fork
# owner must never slip through). An unset env var disables that one filter
# (used by tests); the workflow sets all three.
#
# Pure: no network, no side effects. The workflow executes the plan.
#
# Usage:
#   gh pr list --json number,title,headRefName,createdAt,baseRefName,author,headRepositoryOwner \
#     | BASE=main ALLOW_AUTHOR='app/github-actions github-actions[bot]' OWNER=zigrivers \
#       bash scripts/kb-auto-merge-plan.sh

set -euo pipefail

jq \
  --arg base "${BASE:-}" \
  --arg author "${ALLOW_AUTHOR:-}" \
  --arg owner "${OWNER:-}" '
  # Case-folded allowlist of acceptable author logins (whitespace-separated).
  ($author | ascii_downcase | split(" ") | map(select(length > 0))) as $authors
  | [ .[]
    | select(.headRefName | startswith("knowledge-freshness/"))
    | select( $base   == "" or ((.baseRefName // "") == $base) )
    # GitHub logins are case-insensitive — compare author/owner case-folded.
    # `index` (not jq 1.6+ `IN`) for portability; bind the login first so `.`
    # inside index() still refers to the allowlist array, not the PR object.
    | select( $author == "" or (((.author.login // "") | ascii_downcase) as $lg | ($authors | index($lg)) != null) )
    | select( $owner  == "" or ((.headRepositoryOwner.login // "") | ascii_downcase) == ($owner  | ascii_downcase) )
    | .topic = ( .headRefName
                 | sub("^knowledge-freshness/"; "")
                 | sub("-[0-9]{4}-[0-9]{2}-[0-9]{2}$"; "") )
  ]
  | group_by(.topic)
  | {
      merge: [ .[] | max_by(.createdAt) | {number, topic, createdAt} ],
      close: [ .[]
               | (max_by(.createdAt).number) as $winner
               | .[]
               | select(.number != $winner)
               | {number, topic, supersededBy: $winner, headRefName}
             ]
    }
'
