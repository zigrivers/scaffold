#!/usr/bin/env bats
# D7 (spec 2026-07-10): bead IDs live in commit/PR bodies, never branch names
# or commit subjects. D4: generated projects defer CI.

@test "no bd-<id> branch-name convention remains in content/" {
    run grep -rn 'bd-<task-id>/\|bd-<id>/' content/
    [ "$status" -ne 0 ]
}

@test "no [bd-<id>] commit-prefix convention remains in content/" {
    run grep -rln '\[bd-<id>\]\|\[bd-<task-id>\]' content/
    [ "$status" -ne 0 ]
}

@test "no pipeline prompt outputs a GitHub Actions workflow" {
    run grep -rln 'workflows/ci.yml' content/pipeline/
    [ "$status" -ne 0 ]
}
