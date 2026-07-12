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

@test "no work-item-ID branch examples remain in content/" {
    # D7 (spec 2026-07-10): agents commit directly on agent/<name>; a branch name
    # never embeds a work-item or bead ID (IDs ride in the commit/PR body as
    # `Closes <id>`). Reject concrete ID-in-branch examples like feat/US-001 or
    # bd-a3f8/some-branch.
    run grep -rnE '(feat|fix|chore|docs|refactor|perf|test|build|ci)/(US|us)-[0-9]|(feat|fix|chore|docs|refactor|perf|test|build|ci)/(bd|BD)-[0-9a-z]+|bd-[a-z0-9]+/[a-z]' content/
    [ "$status" -ne 0 ]
}
