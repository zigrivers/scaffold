#!/bin/bash
# Decide whether a batched knowledge release should be cut on this run.
#
# Best-practice batching: merge content PRs daily, but release on a cadence —
#   * release on the weekly cadence day (default Sunday), OR
#   * release early if a surge of topics has accumulated (threshold valve),
#   * never release on an empty batch.
#
# Emits a single line on stdout:
#   release:scheduled-dow-<n>     — cadence day reached, changes pending
#   release:threshold-<n>         — >= threshold topics accumulated
#   defer:no-unreleased-changes   — nothing to release
#   defer:awaiting-cadence-or-threshold
#
# Inputs (flags):
#   --dow <0-6>                day-of-week, 0=Sunday (matches `date +%w`)
#   --unreleased-topics <n>    distinct knowledge topics changed since last tag
#   --threshold <n>            surge valve (default 10)
#   --release-dow <0-6>        cadence day (default 0=Sunday)
#
# Exit status is always 0; the decision is on stdout. Callers branch on the
# `release:` / `defer:` prefix.

set -euo pipefail

dow=""
topics=""
threshold=10
release_dow=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dow) dow="$2"; shift 2 ;;
    --unreleased-topics) topics="$2"; shift 2 ;;
    --threshold) threshold="$2"; shift 2 ;;
    --release-dow) release_dow="$2"; shift 2 ;;
    *) echo "kb-release-decision: unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$dow" ] || [ -z "$topics" ]; then
  echo "kb-release-decision: --dow and --unreleased-topics are required" >&2
  exit 2
fi

# Validate all numeric inputs before using integer operators, so a malformed
# value fails loudly instead of crashing mid-comparison under `set -e`.
for _n in "$dow" "$topics" "$threshold" "$release_dow"; do
  case "$_n" in
    ''|*[!0-9]*)
      echo "kb-release-decision: expected a non-negative integer, got '$_n'" >&2
      exit 2
      ;;
  esac
done

if [ "$topics" -le 0 ]; then
  echo "defer:no-unreleased-changes"
  exit 0
fi

if [ "$dow" -eq "$release_dow" ]; then
  echo "release:scheduled-dow-${release_dow}"
  exit 0
fi

if [ "$topics" -ge "$threshold" ]; then
  echo "release:threshold-${threshold}"
  exit 0
fi

echo "defer:awaiting-cadence-or-threshold"
