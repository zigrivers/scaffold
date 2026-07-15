#!/usr/bin/env bats
# Traceable-IDs convention (spec 2026-07-15, superseding D7's body-only rule):
# the bead ID leads commit subjects and PR titles as `<bead-id>: `, ends the
# work branch name (agent/<name>/<bead-id>), and the PR body's `Closes <id>`
# stays the canonical machine mapping. STILL retired: the pre-nibble forms —
# the bead ID as a branch's LEADING path segment (bd-<id>/<desc>) and the
# bracketed [bd-<id>] subject prefix. D4: generated projects defer CI.

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

@test "no leading work-item-ID branch examples remain in content/" {
    # The bead ID belongs at the END of a workspace branch
    # (agent/<name>/<bead-id>), never as a leading segment of a type branch.
    # Reject concrete leading-ID examples like feat/US-001 or bd-a3f8/some-branch;
    # trailing-ID forms (agent/alpha/bd-a3f8) do not match these patterns.
    run grep -rnE '(feat|fix|chore|docs|refactor|perf|test|build|ci)/(US|us)-[0-9]|(feat|fix|chore|docs|refactor|perf|test|build|ci)/(bd|BD)-[0-9a-z]+|bd-[a-z0-9]+/[a-z]' content/
    [ "$status" -ne 0 ]
}
