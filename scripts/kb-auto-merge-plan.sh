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
# Pure: no network, no side effects. The workflow executes the plan.
#
# Usage: gh pr list --json number,title,headRefName,createdAt | bash scripts/kb-auto-merge-plan.sh

set -euo pipefail

jq '
  [ .[]
    | select(.headRefName | startswith("knowledge-freshness/"))
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
               | {number, topic, supersededBy: $winner}
             ]
    }
'
