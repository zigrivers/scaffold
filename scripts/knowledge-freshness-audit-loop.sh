#!/usr/bin/env bash
set -euo pipefail

candidates_file="${1:-/tmp/candidates.json}"

# Materialize candidates so a jq failure trips set -e (not hidden in a pipe),
# and so the while loop runs in the main shell (had_failure must persist).
jq -c '.[]' "$candidates_file" > /tmp/candidate-lines.json
had_failure=0
while read -r candidate; do
  name=$(printf '%s' "$candidate" | jq -r '.name')
  path=$(printf '%s' "$candidate" | jq -r '.path')
  if [ "$path" = "null" ] || [ -z "$path" ]; then
    echo "skip $name: no path resolved"
    continue
  fi
  echo "::group::audit $name"
  verdict_path="/tmp/verdict-${name}.json"
  if ! node dist/index.js knowledge-freshness audit-run-entry "$path" > "$verdict_path"; then
    echo "::error::audit-run-entry failed for $name (transient/infra error)"
    had_failure=1
    echo "::endgroup::"
    continue
  fi
  # Fail-closed skip: a source-unusable stub yields a skip envelope, not a verdict.
  if jq -e '.skipped == true' "$verdict_path" >/dev/null 2>&1; then
    echo "skip $name: $(jq -r '.reason // "skipped"' "$verdict_path") — $(jq -r '.detail // ""' "$verdict_path")"
    echo "::endgroup::"
    continue
  fi
  verdict=$(jq -r '.verdict' "$verdict_path")
  echo "verdict: $verdict"
  # F-001 round-5: persist non-rewrite verdicts too. Without this,
  # entries with `current`/`minor-drift` verdicts never get
  # `last-reviewed`/`hash`/`retrieved` updated and stay due every
  # day, consuming the 10-entry daily budget and starving entries
  # behind them in the prefilter queue.
  case "$verdict" in
    current|minor-drift|major-drift|superseded)
      # F-003: run gates inline because GITHUB_TOKEN-opened PRs don't
      # trigger the gate workflow. We apply the verdict in a transient
      # staged state, then run the same per-file gates the workflow
      # would run, then either open the PR or skip the entry.
      if ! node dist/index.js knowledge-freshness audit-apply "$path" "$verdict_path"; then
        echo "audit-apply (pre-gates dry-run) failed for $name"
        git checkout -- "$path"
        echo "::endgroup::"
        continue
      fi
      # F-002 round-5: anti-over-rewrite is BLOCKING inline. The
      # PR-gate workflow doesn't fire on GITHUB_TOKEN-opened PRs,
      # so making the inline check advisory (round-3) opened a
      # bypass path: cron-generated stable-entry rewrites over
      # the 20% threshold could merge without any enforcement.
      # Maintainers who genuinely need to push such a rewrite
      # through should run `audit-apply --open-pr` LOCALLY (where
      # the gate workflow fires normally on their PR via their
      # user token) and apply the override:anti-over-rewrite
      # label there. The cron deliberately refuses to do it.
      # lint-unsourced remains advisory (spec §A.5 design).
      gate_failed=0
      node dist/index.js validate-knowledge || gate_failed=1
      node dist/index.js knowledge-freshness link-check "$path" || gate_failed=1
      node dist/index.js knowledge-freshness deep-guidance-check "$path" || gate_failed=1
      node dist/index.js knowledge-freshness anti-over-rewrite "$path" --pr-labels "" || gate_failed=1
      # Advisory-only: do not affect gate_failed.
      node dist/index.js knowledge-freshness lint-unsourced "$path" || true
      if [ "$gate_failed" != "0" ]; then
        echo "::error::gates failed for $name — not opening PR (anti-over-rewrite failures on stable entries: run audit-apply --open-pr locally as a maintainer with the override label applied)"
        # Restore the file so subsequent entries aren't poisoned.
        git checkout -- "$path"
        echo "::endgroup::"
        continue
      fi
      # Restore the file so each open-pr starts from a clean main.
      # audit-apply --open-pr re-runs the on-disk edits inside the
      # branch it creates.
      git checkout -- "$path"
      if ! node dist/index.js knowledge-freshness audit-apply "$path" "$verdict_path" --open-pr; then
        echo "audit-apply --open-pr failed for $name"
      fi
      ;;
    *)
      echo "unknown verdict for $name: $verdict"
      ;;
  esac
  # F-004: audit-apply --open-pr leaves us on the freshness PR
  # branch. Restore main before the next iteration so each
  # candidate's audit starts from a clean base.
  git checkout main >/dev/null 2>&1 || true
  echo "::endgroup::"
done < /tmp/candidate-lines.json

if [ "$had_failure" != "0" ]; then
  echo "::error::one or more entries failed with a transient/infra error"
  exit 1
fi
