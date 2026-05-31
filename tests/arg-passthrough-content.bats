#!/usr/bin/env bats

ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)"

@test "review-pr.md contains the imperative EXECUTE preamble" {
  grep -q "You are now executing the .review-pr. workflow" "$ROOT/content/tools/review-pr.md"
}

@test "review-pr.md wraps \$ARGUMENTS in an <arguments> data delimiter" {
  grep -q '<arguments>\$ARGUMENTS</arguments>' "$ROOT/content/tools/review-pr.md"
}

@test "review-pr.md threshold regex uses the [[:space:]=] character class" {
  grep -q 'fix-threshold\[\[:space:\]=\]+(P\[0-3\])' "$ROOT/content/tools/review-pr.md"
}

@test "review-pr.md threshold regex no longer requires a space-only separator" {
  ! grep -q 'fix-threshold\[\[:space:\]\]+(P\[0-3\])' "$ROOT/content/tools/review-pr.md"
}

@test "fix-threshold regex matches both space and = separators, threshold stays BASH_REMATCH[2]" {
  re='(^|[[:space:]])--fix-threshold[[:space:]=]+(P[0-3])($|[[:space:]])'
  s1="376 --fix-threshold P1"
  [[ "$s1" =~ $re ]]
  [ "${BASH_REMATCH[2]}" = "P1" ]
  s2="376 --fix-threshold=P2"
  [[ "$s2" =~ $re ]]
  [ "${BASH_REMATCH[2]}" = "P2" ]
}

@test "review-code.md threshold regex uses the [[:space:]=] character class" {
  grep -q 'fix-threshold\[\[:space:\]=\]+(P\[0-3\])' "$ROOT/content/tools/review-code.md"
  ! grep -q 'fix-threshold\[\[:space:\]\]+(P\[0-3\])' "$ROOT/content/tools/review-code.md"
}

@test "post-implementation-review.md threshold regex uses the [[:space:]=] character class" {
  grep -q 'fix-threshold\[\[:space:\]=\]+(P\[0-3\])' "$ROOT/content/tools/post-implementation-review.md"
  ! grep -q 'fix-threshold\[\[:space:\]\]+(P\[0-3\])' "$ROOT/content/tools/post-implementation-review.md"
}
