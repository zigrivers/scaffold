#!/usr/bin/env bats
# Behavior tests for the stale-claim reaper (spec: Work-Beads Concurrency
# Hardening §5.2 / §6.1). The reaper is report-only by default; --apply performs
# a guarded release. bd/gh are stubbed to emit controlled JSON fixtures.

load fixtures/agent-ops/resolve-template.bash

TEMPLATE="$BATS_TEST_DIRNAME/../content/assets/agent-ops/git/reap-stale-claims.sh.tmpl"

# A fixed wall-clock so lease/updated_at comparisons are deterministic.
NOW_ISO="2026-07-15T12:00:00Z"

iso_epoch() {
    date -u -d "$1" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s
}

setup() {
    command -v jq >/dev/null 2>&1 || skip "jq not installed"
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export FX="$RESOLVED_TMPDIR/reap-$$"
    mkdir -p "$FX/bin"
    export REAP_FIXTURE="$FX"
    export REAP_NOW; REAP_NOW="$(iso_epoch "$NOW_ISO")"
    rm -f "$FX/bd-update.log"

    resolve_agent_ops_template "$TEMPLATE" "$FX/reap-stale-claims.sh"

    # Stub bd: dispatch on subcommand, log update calls, serve show fixtures.
    cat > "$FX/bin/bd" <<'EOF'
#!/usr/bin/env bash
FX="$REAP_FIXTURE"
case "$1" in
  list) cat "$FX/inprogress.json" 2>/dev/null || echo '[]' ;;
  show) id="$2"; if [ -f "$FX/show-$id.json" ]; then cat "$FX/show-$id.json"; else echo '[]'; fi ;;
  update) printf '%s\n' "$*" >> "$FX/bd-update.log" ;;
  *) : ;;
esac
exit 0
EOF
    # Stub gh: pr list returns the PR fixture (default: none).
    cat > "$FX/bin/gh" <<'EOF'
#!/usr/bin/env bash
cat "$REAP_FIXTURE/prs.json" 2>/dev/null || echo '[]'
exit 0
EOF
    chmod +x "$FX/bin/bd" "$FX/bin/gh"
    export PATH="$FX/bin:$PATH"
    printf '[]' > "$FX/prs.json"
}

teardown() { rm -rf "$FX"; }

# Helper: write an in_progress list fixture from inline JSON.
write_inprogress() { printf '%s' "$1" > "$FX/inprogress.json"; }
# Helper: make bd show <id> return the same record (guard re-read matches).
mirror_show() {
    local id="$1"
    printf '%s' "$2" > "$FX/show-$id.json"
}

@test "reaper default is report-only: a lapsed-lease claim is reported but NOT released" {
    write_inprogress '[{"id":"proj-aaa","assignee":"agent-ghost","updated_at":"2026-07-15T05:00:00Z","issue_type":"task","metadata":{"lease_until":"2026-07-15T06:00:00Z"}}]'
    run "$FX/reap-stale-claims.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"proj-aaa"* ]]
    [[ "$output" == *"REAP"* ]]
    [ ! -f "$FX/bd-update.log" ]  # NO mutation in report mode
}

@test "reaper --apply releases a lapsed-lease claim with a full guarded release" {
    local rec='[{"id":"proj-aaa","assignee":"agent-ghost","updated_at":"2026-07-15T05:00:00Z","issue_type":"task","metadata":{"lease_until":"2026-07-15T06:00:00Z"}}]'
    write_inprogress "$rec"
    mirror_show proj-aaa "$rec"  # re-read matches → guard passes
    run "$FX/reap-stale-claims.sh" --apply
    [ "$status" -eq 0 ]
    [ -f "$FX/bd-update.log" ]
    grep -q 'proj-aaa' "$FX/bd-update.log"
    grep -q -- '--status open' "$FX/bd-update.log"
    grep -q -- '--assignee' "$FX/bd-update.log"
    grep -q -- '--unset-metadata lease_until' "$FX/bd-update.log"
}

@test "reaper --apply ABORTS the release when the assignee changed since the read (guard)" {
    local listed='[{"id":"proj-aaa","assignee":"agent-ghost","updated_at":"2026-07-15T05:00:00Z","issue_type":"task","metadata":{"lease_until":"2026-07-15T06:00:00Z"}}]'
    write_inprogress "$listed"
    # Re-read shows a DIFFERENT assignee (a new agent re-claimed) → must abort.
    mirror_show proj-aaa '[{"id":"proj-aaa","assignee":"agent-new","updated_at":"2026-07-15T11:59:00Z","issue_type":"task","metadata":{"lease_until":"2026-07-15T16:00:00Z"}}]'
    run "$FX/reap-stale-claims.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]  # aborted — no release
    [[ "$output" == *"abort"* || "$output" == *"ABORT"* ]]
}

@test "reaper never reaps an epic (umbrella sits in_progress by design)" {
    local rec='[{"id":"proj-epic","assignee":"agent-ghost","updated_at":"2026-07-15T05:00:00Z","issue_type":"epic","metadata":{"lease_until":"2026-07-15T06:00:00Z"}}]'
    write_inprogress "$rec"
    mirror_show proj-epic "$rec"
    run "$FX/reap-stale-claims.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]  # epic excluded from reaping
}

@test "reaper treats a still-valid (future) lease as LIVE — never a candidate" {
    write_inprogress '[{"id":"proj-live","assignee":"agent-live","updated_at":"2026-07-15T11:30:00Z","issue_type":"task","metadata":{"lease_until":"2026-07-15T20:00:00Z"}}]'
    run "$FX/reap-stale-claims.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" != *"REAP"* ]]
}

@test "no-lease fallback: stale claim with no PR is reapable; a PR-referenced one is HELD" {
    write_inprogress '[{"id":"proj-nopr","assignee":"agent-x","updated_at":"2026-07-13T12:00:00Z","issue_type":"task"},{"id":"proj-pr","assignee":"agent-y","updated_at":"2026-07-13T12:00:00Z","issue_type":"task"}]'
    mirror_show proj-nopr '[{"id":"proj-nopr","assignee":"agent-x","updated_at":"2026-07-13T12:00:00Z","issue_type":"task"}]'
    # An open PR references proj-pr in its body → conservative guard HOLDS it.
    printf '%s' '[{"number":7,"title":"work","body":"Closes proj-pr","isDraft":false}]' > "$FX/prs.json"
    run "$FX/reap-stale-claims.sh" --apply
    [ "$status" -eq 0 ]
    [ -f "$FX/bd-update.log" ]
    grep -q 'proj-nopr' "$FX/bd-update.log"      # no PR → reaped
    ! grep -q 'proj-pr' "$FX/bd-update.log"       # PR-guarded → not reaped
    [[ "$output" == *"proj-pr"* ]]                # …but still surfaced in the report
}

@test "reaper treats a missing lease as freshly-claimed (F6): recent no-lease claim is not reaped" {
    write_inprogress '[{"id":"proj-fresh","assignee":"agent-z","updated_at":"2026-07-15T11:45:00Z","issue_type":"task"}]'
    run "$FX/reap-stale-claims.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]  # recent updated_at, no lease → not expired
}
