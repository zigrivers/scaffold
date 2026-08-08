#!/usr/bin/env bats
# Behavior tests for the lapsed-defer sweeper. bd (through 1.1.2) never returns
# a deferred bead to `bd ready` when its defer_until passes (gastownhall/beads#5289),
# so cooldown-released beads rot invisibly unless this sweep restores them.
# Report-only by default; --apply performs a guarded restore. bd/gh are stubbed
# to emit controlled JSON fixtures (same harness as the stale-claim reaper tests).

load fixtures/agent-ops/resolve-template.bash

TEMPLATE="$BATS_TEST_DIRNAME/../content/assets/agent-ops/git/reap-lapsed-defers.sh.tmpl"

# A fixed wall-clock so lapse/grace comparisons are deterministic.
NOW_ISO="2026-07-15T12:00:00Z"

iso_epoch() {
    date -u -d "$1" +%s 2>/dev/null || date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$1" +%s
}

setup() {
    command -v jq >/dev/null 2>&1 || skip "jq not installed"
    RESOLVED_TMPDIR="$(cd "$BATS_TMPDIR" && pwd -P)"
    export FX="$RESOLVED_TMPDIR/sweep-$$"
    mkdir -p "$FX/bin"
    export REAP_FIXTURE="$FX"
    export REAP_NOW; REAP_NOW="$(iso_epoch "$NOW_ISO")"
    rm -f "$FX/bd-update.log"

    resolve_agent_ops_template "$TEMPLATE" "$FX/reap-lapsed-defers.sh"

    # Stub bd: dispatch on subcommand, log update calls, serve show fixtures.
    cat > "$FX/bin/bd" <<'EOF'
#!/usr/bin/env bash
FX="$REAP_FIXTURE"
case "$1" in
  list) cat "$FX/deferred.json" 2>/dev/null || echo '[]' ;;
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

teardown() { [ -n "${FX:-}" ] && rm -rf "$FX" || true; }

# Helper: write the deferred-list fixture from inline JSON.
write_deferred() { printf '%s' "$1" > "$FX/deferred.json"; }
# Helper: make bd show <id> return the same record (guard re-read matches).
mirror_show() { printf '%s' "$2" > "$FX/show-$1.json"; }

# A canonical lapsed cooldown-release: defer_until AND updated_at hours ago,
# no assignee, no notes — exactly what the 365/129-bead incidents looked like.
LAPSED='[{"id":"proj-cold","status":"deferred","assignee":"","updated_at":"2026-07-15T05:00:00Z","defer_until":"2026-07-15T05:00:00Z","notes":"","external_ref":""}]'

@test "sweeper default is report-only: a lapsed defer is reported RESTORE but NOT mutated" {
    write_deferred "$LAPSED"
    run "$FX/reap-lapsed-defers.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"proj-cold"* ]]
    [[ "$output" == *"RESTORE"* ]]
    [ ! -f "$FX/bd-update.log" ]  # NO mutation in report mode
}

@test "--apply performs the full guarded restore (open + clear assignee/defer/lease)" {
    write_deferred "$LAPSED"
    mirror_show proj-cold "$LAPSED"  # re-read matches → guard passes
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ -f "$FX/bd-update.log" ]
    grep -q 'proj-cold' "$FX/bd-update.log"
    grep -q -- '--status open' "$FX/bd-update.log"
    grep -q -- '--assignee' "$FX/bd-update.log"
    grep -q -- '--defer' "$FX/bd-update.log"
    grep -q -- '--unset-metadata lease_until' "$FX/bd-update.log"
    [[ "$output" == *"RESTORED"* ]]
}

@test "--apply ABORTS when updated_at moved since the scan (guard)" {
    write_deferred "$LAPSED"
    mirror_show proj-cold '[{"id":"proj-cold","assignee":"","updated_at":"2026-07-15T11:59:00Z","defer_until":"2026-07-15T05:00:00Z","status":"deferred"}]'
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]  # aborted — no restore
    [[ "$output" == *"ABORT"* ]]
}

@test "a deferred bead with NO defer_until is always HELD (open-ended park)" {
    write_deferred '[{"id":"proj-park","assignee":"","updated_at":"2026-07-15T05:00:00Z","notes":""}]'
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" == *"HOLD"* ]]
    [[ "$output" == *"proj-park"* ]]
}

@test "an open/draft PR referencing the bead id HOLDs it (work in flight)" {
    write_deferred "$LAPSED"
    printf '%s' '[{"number":7,"title":"work","body":"touches proj-cold surface","isDraft":true,"headRefName":"agent/x/other"}]' > "$FX/prs.json"
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" == *"HOLD"* ]]
}

@test "a still-assigned deferred bead is HELD (deliberate self-park, restore would strip it)" {
    write_deferred '[{"id":"proj-mine","assignee":"agent-busy","updated_at":"2026-07-15T05:00:00Z","defer_until":"2026-07-15T05:00:00Z","notes":""}]'
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" == *"HOLD"* ]]
    [[ "$output" == *"agent-busy"* ]]
}

@test "an explicit Wait: marker in notes HOLDs the bead (deliberate external wait)" {
    write_deferred '[{"id":"proj-wait","assignee":"","updated_at":"2026-07-15T05:00:00Z","defer_until":"2026-07-15T05:00:00Z","notes":"Wait: upstream bd release fixing gastownhall/beads#5289"}]'
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" == *"HOLD"* ]]
    [[ "$output" == *"external-wait"* ]]
}

@test "notes citing a still-open PR number HOLD the bead (file-conflict park)" {
    write_deferred '[{"id":"proj-note","status":"deferred","assignee":"","updated_at":"2026-07-15T05:00:00Z","defer_until":"2026-07-15T05:00:00Z","notes":"parked: Draft PR #42 modifies these exact files","external_ref":""}]'
    printf '%s' '[{"number":42,"title":"other work","body":"unrelated","isDraft":true,"headRefName":"feature-x"}]' > "$FX/prs.json"
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" == *"HOLD"* ]]
    [[ "$output" == *"#42"* ]]
}

@test "a non-closed blocks dependency HOLDs the bead" {
    write_deferred '[{"id":"proj-dep","assignee":"","updated_at":"2026-07-15T05:00:00Z","defer_until":"2026-07-15T05:00:00Z","notes":"","dependencies":[{"type":"blocks","depends_on_id":"proj-blocker"}]}]'
    mirror_show proj-blocker '[{"id":"proj-blocker","status":"open"}]'
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" == *"HOLD"* ]]
    [[ "$output" == *"proj-blocker"* ]]
}

@test "grace anchors on updated_at: a fresh park whose defer_until is already past (bd#5233 skew) is NOT swept" {
    # defer_until stamped 7h in the past (the timezone-skew fingerprint) but the
    # bead was touched 15 minutes ago — it is a LIVE cooldown, not debt.
    write_deferred '[{"id":"proj-fresh","assignee":"","updated_at":"2026-07-15T11:45:00Z","defer_until":"2026-07-15T05:00:00Z","notes":""}]'
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" != *"RESTORE"* ]]
    [[ "$output" == *"1 not-lapsed"* ]]
}

@test "unparseable bd list output is INCONCLUSIVE (exit 1), never a clean 'nothing lapsed'" {
    printf '%s' 'not valid json {' > "$FX/deferred.json"
    run "$FX/reap-lapsed-defers.sh"
    [ "$status" -eq 1 ]
    [[ "$output" == *"INCONCLUSIVE"* ]]
    [ ! -f "$FX/bd-update.log" ]
}

@test "PR-lister failure HOLDs a lapsed candidate (fail closed, never restore blind)" {
    write_deferred "$LAPSED"
    printf '%s' 'not valid json {' > "$FX/prs.json"
    run "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 0 ]
    [ ! -f "$FX/bd-update.log" ]
    [[ "$output" == *"HOLD"* ]]
    [[ "$output" == *"PR check unavailable"* ]]
}

@test "bd absent: report mode skips cleanly (exit 0); --apply is INCONCLUSIVE (exit 1)" {
    local shimdir="$FX/shim"
    mkdir -p "$shimdir"
    ln -s "$(command -v bash)" "$shimdir/bash"
    run env -i PATH="$shimdir" REAP_NOW="$REAP_NOW" bash "$FX/reap-lapsed-defers.sh"
    [ "$status" -eq 0 ]
    [[ "$output" == *"skipping"* ]]
    run env -i PATH="$shimdir" REAP_NOW="$REAP_NOW" bash "$FX/reap-lapsed-defers.sh" --apply
    [ "$status" -eq 1 ]
}
