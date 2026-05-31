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

@test "multi-agent-start.md validates the agent name to a safe token" {
  grep -qF '^[A-Za-z0-9_-]+$' "$ROOT/content/pipeline/build/multi-agent-start.md"
}

@test "multi-agent-resume.md validates the agent name to a safe token" {
  grep -qF '^[A-Za-z0-9_-]+$' "$ROOT/content/pipeline/build/multi-agent-resume.md"
}

@test "multi-agent-start.md quotes setup-agent-worktree.sh argument" {
  grep -q 'setup-agent-worktree.sh "\$ARGUMENTS"' "$ROOT/content/pipeline/build/multi-agent-start.md"
  ! grep -q 'setup-agent-worktree.sh \$ARGUMENTS' "$ROOT/content/pipeline/build/multi-agent-start.md"
}

@test "multi-agent-resume.md quotes shell expansions of the agent name" {
  ! grep -q 'setup-agent-worktree.sh \$ARGUMENTS' "$ROOT/content/pipeline/build/multi-agent-resume.md"
  ! grep -q 'bd list --assignee \$ARGUMENTS' "$ROOT/content/pipeline/build/multi-agent-resume.md"
}
