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
