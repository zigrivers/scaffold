#!/usr/bin/env bats

COMMAND="$BATS_TEST_DIRNAME/../commands/post-implementation-review.md"

@test "generated command file exists" {
    [ -f "$COMMAND" ]
}

@test "command has description frontmatter" {
    run grep -q '^description:' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Phase 1 cross-cutting sweep" {
    run grep -q 'Phase 1' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Phase 2 user story review" {
    run grep -q 'Phase 2' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Phase 3 consolidation" {
    run grep -qE 'Phase 3|Step 6.*[Cc]onsolid|[Cc]onsolid.*[Ff]inding' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents report-only mode" {
    run grep -q 'report-only' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents Update Mode" {
    run grep -qi 'update mode' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command references Codex CLI" {
    run grep -q 'Codex' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command references Gemini CLI" {
    run grep -q 'Gemini' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command references Superpowers code-reviewer" {
    run grep -q 'Superpowers' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents fallback behavior" {
    run grep -qi 'fallback' "$COMMAND"
    [ "$status" -eq 0 ]
}

@test "command documents P0 severity" {
    run grep -q 'P0' "$COMMAND"
    [ "$status" -eq 0 ]
}
