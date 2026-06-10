#!/usr/bin/env bats

# Tests for the durable knowledge-base auto-merge + batched-release logic
# (scripts/kb-auto-merge-plan.sh, kb-release-decision.sh, kb-release-changelog.sh).
# These scripts hold the pure, deterministic logic that the
# knowledge-auto-merge-release.yml workflow orchestrates; the gh/git glue in the
# workflow itself is intentionally thin and not unit-tested here.

ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"
PLAN="$ROOT/scripts/kb-auto-merge-plan.sh"
DECIDE="$ROOT/scripts/kb-release-decision.sh"
CHANGELOG="$ROOT/scripts/kb-release-changelog.sh"

# ─── kb-auto-merge-plan.sh ────────────────────────────────────────

@test "plan: strips knowledge-freshness/ prefix and trailing date to get the topic" {
  run bash "$PLAN" <<'JSON'
[{"number":1,"title":"chore(knowledge): refresh database-design","headRefName":"knowledge-freshness/database-design-2026-06-09","createdAt":"2026-06-09T09:05:00Z"}]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge[0].topic == "database-design"'
  echo "$output" | jq -e '.merge[0].number == 1'
}

@test "plan: preserves internal hyphens in the topic slug (only the trailing date is stripped)" {
  run bash "$PLAN" <<'JSON'
[{"number":7,"title":"x","headRefName":"knowledge-freshness/multi-service-api-contracts-2026-06-09","createdAt":"2026-06-09T09:05:00Z"}]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge[0].topic == "multi-service-api-contracts"'
}

@test "plan: newest-per-topic wins; older same-topic PRs are closed as superseded" {
  run bash "$PLAN" <<'JSON'
[
  {"number":10,"title":"x","headRefName":"knowledge-freshness/api-design-2026-06-07","createdAt":"2026-06-07T09:05:00Z"},
  {"number":22,"title":"x","headRefName":"knowledge-freshness/api-design-2026-06-09","createdAt":"2026-06-09T09:05:00Z"}
]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge | length == 1'
  echo "$output" | jq -e '.merge[0].number == 22'
  echo "$output" | jq -e '.close | length == 1'
  echo "$output" | jq -e '.close[0].number == 10'
  echo "$output" | jq -e '.close[0].supersededBy == 22'
}

@test "plan: ignores PRs whose branch is not a knowledge-freshness/ branch" {
  run bash "$PLAN" <<'JSON'
[
  {"number":3,"title":"feat: human work","headRefName":"feature/some-thing","createdAt":"2026-06-09T09:05:00Z"},
  {"number":4,"title":"x","headRefName":"knowledge-freshness/eval-craft-2026-06-09","createdAt":"2026-06-09T09:05:00Z"}
]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge | length == 1'
  echo "$output" | jq -e '.merge[0].number == 4'
  echo "$output" | jq -e '[.merge[],.close[]] | map(.number) | index(3) == null'
}

@test "plan: empty input yields empty merge and close arrays" {
  run bash "$PLAN" <<<'[]'
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge == [] and .close == []'
}

@test "plan: BASE filter rejects a PR targeting a branch other than the configured base" {
  run env BASE=main bash "$PLAN" <<'JSON'
[
  {"number":1,"headRefName":"knowledge-freshness/a-2026-06-09","createdAt":"2026-06-09T00:00:00Z","baseRefName":"develop"},
  {"number":2,"headRefName":"knowledge-freshness/b-2026-06-09","createdAt":"2026-06-09T00:00:00Z","baseRefName":"main"}
]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge | length == 1'
  echo "$output" | jq -e '.merge[0].number == 2'
}

@test "plan: ALLOW_AUTHOR filter rejects a PR from an unexpected author" {
  run env ALLOW_AUTHOR='github-actions[bot]' bash "$PLAN" <<'JSON'
[
  {"number":1,"headRefName":"knowledge-freshness/a-2026-06-09","createdAt":"2026-06-09T00:00:00Z","author":{"login":"mallory"}},
  {"number":2,"headRefName":"knowledge-freshness/b-2026-06-09","createdAt":"2026-06-09T00:00:00Z","author":{"login":"github-actions[bot]"}}
]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge | length == 1'
  echo "$output" | jq -e '.merge[0].number == 2'
}

@test "plan: ALLOW_AUTHOR is a space-separated allowlist (accepts app/github-actions OR github-actions[bot])" {
  # The Actions bot login renders as either form across gh versions/contexts;
  # both must be accepted, while a non-listed author is still rejected.
  run env ALLOW_AUTHOR='app/github-actions github-actions[bot]' bash "$PLAN" <<'JSON'
[
  {"number":1,"headRefName":"knowledge-freshness/a-2026-06-09","createdAt":"2026-06-09T00:00:00Z","author":{"login":"app/github-actions"}},
  {"number":2,"headRefName":"knowledge-freshness/b-2026-06-09","createdAt":"2026-06-09T00:00:00Z","author":{"login":"github-actions[bot]"}},
  {"number":3,"headRefName":"knowledge-freshness/c-2026-06-09","createdAt":"2026-06-09T00:00:00Z","author":{"login":"mallory"}}
]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '[.merge[].number] | sort == [1,2]'
  echo "$output" | jq -e '[.merge[],.close[]] | map(.number) | index(3) == null'
}

@test "plan: filters FAIL CLOSED — a set filter rejects a PR missing that field" {
  # BASE is set but PR #1 has no baseRefName (null/absent) → must be rejected,
  # not allowed through. PR #2 has the matching field.
  run env BASE=main bash "$PLAN" <<'JSON'
[
  {"number":1,"headRefName":"knowledge-freshness/a-2026-06-09","createdAt":"2026-06-09T00:00:00Z","author":{"login":"x"}},
  {"number":2,"headRefName":"knowledge-freshness/b-2026-06-09","createdAt":"2026-06-09T00:00:00Z","baseRefName":"main"}
]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge | length == 1'
  echo "$output" | jq -e '.merge[0].number == 2'
}

@test "plan: OWNER filter rejects a cross-repo (fork) PR" {
  run env OWNER=zigrivers bash "$PLAN" <<'JSON'
[
  {"number":1,"headRefName":"knowledge-freshness/a-2026-06-09","createdAt":"2026-06-09T00:00:00Z","headRepositoryOwner":{"login":"forker"}},
  {"number":2,"headRefName":"knowledge-freshness/b-2026-06-09","createdAt":"2026-06-09T00:00:00Z","headRepositoryOwner":{"login":"zigrivers"}}
]
JSON
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.merge | length == 1'
  echo "$output" | jq -e '.merge[0].number == 2'
}

# ─── kb-release-decision.sh ───────────────────────────────────────

@test "decision: zero unreleased topics always defers (even on Sunday)" {
  run bash "$DECIDE" --dow 0 --unreleased-topics 0 --threshold 10
  [ "$status" -eq 0 ]
  [[ "$output" == defer:* ]]
  [[ "$output" == *no-unreleased* ]]
}

@test "decision: Sunday with unreleased changes releases (scheduled cadence)" {
  run bash "$DECIDE" --dow 0 --unreleased-topics 3 --threshold 10
  [ "$status" -eq 0 ]
  [[ "$output" == release:* ]]
  [[ "$output" == *scheduled* ]]
}

@test "decision: weekday under threshold defers" {
  run bash "$DECIDE" --dow 3 --unreleased-topics 4 --threshold 10
  [ "$status" -eq 0 ]
  [[ "$output" == defer:* ]]
}

@test "decision: weekday at/over threshold releases (surge valve)" {
  run bash "$DECIDE" --dow 3 --unreleased-topics 12 --threshold 10
  [ "$status" -eq 0 ]
  [[ "$output" == release:* ]]
  [[ "$output" == *threshold* ]]
}

@test "decision: threshold boundary is inclusive (>=)" {
  run bash "$DECIDE" --dow 3 --unreleased-topics 10 --threshold 10
  [ "$status" -eq 0 ]
  [[ "$output" == release:* ]]
}

@test "decision: rejects a non-numeric argument with exit 2" {
  run bash "$DECIDE" --dow Monday --unreleased-topics 3
  [ "$status" -eq 2 ]
  [[ "$output" == *"non-negative integer"* ]]
}

# ─── kb-release-changelog.sh ──────────────────────────────────────

setup() {
  FIXTURE_CL="$BATS_TEST_TMPDIR/CHANGELOG.md"
  cat > "$FIXTURE_CL" <<'MD'
# Changelog

All notable changes to Scaffold are documented here.

## [Unreleased]

## [3.34.0] — 2026-06-08

### Added

- something earlier
MD
}

@test "changelog: inserts a dated release block directly under [Unreleased]" {
  run bash "$CHANGELOG" --version 3.35.0 --date 2026-06-14 --kb-version 0.1.20 \
    --changelog "$FIXTURE_CL" <<'ENTRIES'
api-design
database-design
eval-craft
ENTRIES
  [ "$status" -eq 0 ]
  # New block appears after [Unreleased] and before the prior release.
  echo "$output" | grep -q '## \[3.35.0\] — 2026-06-14'
  # [Unreleased] is preserved and still above the new block.
  unreleased_line="$(echo "$output" | grep -n '## \[Unreleased\]' | cut -d: -f1)"
  new_line="$(echo "$output" | grep -n '## \[3.35.0\]' | cut -d: -f1)"
  prev_line="$(echo "$output" | grep -n '## \[3.34.0\]' | cut -d: -f1)"
  [ "$unreleased_line" -lt "$new_line" ]
  [ "$new_line" -lt "$prev_line" ]
}

@test "changelog: counts entries and renders a backticked, sorted list + KB VERSION" {
  run bash "$CHANGELOG" --version 3.35.0 --date 2026-06-14 --kb-version 0.1.20 \
    --changelog "$FIXTURE_CL" <<'ENTRIES'
eval-craft
api-design
database-design
ENTRIES
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'Knowledge freshness refresh (3 entries)'
  echo "$output" | grep -q '`api-design`'
  echo "$output" | grep -q 'KB `VERSION` → 0.1.20'
  # Deterministic ordering: sorted, so api-design precedes eval-craft in the rendered line.
  line="$(echo "$output" | grep 'api-design')"
  [[ "$line" == *'`api-design`'*'`database-design`'*'`eval-craft`'* ]]
}

@test "changelog: de-duplicates repeated entry slugs before counting" {
  run bash "$CHANGELOG" --version 3.35.0 --date 2026-06-14 --kb-version 0.1.20 \
    --changelog "$FIXTURE_CL" <<'ENTRIES'
api-design
api-design
database-design
ENTRIES
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'Knowledge freshness refresh (2 entries)'
}

@test "changelog: singular wording for a single entry" {
  run bash "$CHANGELOG" --version 3.35.0 --date 2026-06-14 --kb-version 0.1.20 \
    --changelog "$FIXTURE_CL" <<'ENTRIES'
api-design
ENTRIES
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'Knowledge freshness refresh (1 entry)'
}
