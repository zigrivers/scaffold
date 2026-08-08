#!/usr/bin/env bats
# Content guards for the deferred-debt wake path: bd (≤1.1.2) never returns a
# deferred bead to `bd ready` (gastownhall/beads#5289), and relative --defer
# offsets serialize as local wall-clock stamped Z (gastownhall/beads#5233).
# These tests pin the three surfaces that keep generated projects from
# rebuilding perpetual deferred debt: the agent-ops Makefile wiring, the
# work-beads skill doctrine, and the beads pipeline step's generated docs.

ROOT="$BATS_TEST_DIRNAME/.."
MK="$ROOT/content/assets/agent-ops/make/agent-ops.mk.tmpl"
SKILL="$ROOT/content/agent-skills/work-beads/SKILL.md"
BEADS="$ROOT/content/pipeline/foundation/beads.md"

# --- agent-ops.mk wiring (auto-wake) ---

@test "mk template ships a reap-lapsed-defers target" {
  grep -q '^reap-lapsed-defers:' "$MK"
  grep -q 'scripts/reap-lapsed-defers.sh \$(ARGS)' "$MK"
}

@test "prune-merged auto-applies the lapsed-defer sweep (feature-detected, non-fatal)" {
  # The wake must run mechanically after merges so the debt can never silently
  # rebuild — but a missing script (older install) must not break prune-merged.
  awk '/^prune-merged:/,/^$/' "$MK" | grep -q 'reap-lapsed-defers.sh --apply'
  awk '/^prune-merged:/,/^$/' "$MK" | grep -q 'if \[ -x scripts/reap-lapsed-defers.sh \]'
}

# --- work-beads skill doctrine ---

@test "skill orient step runs the lapsed-defer report" {
  grep -q 'reap-lapsed-defers.sh' "$SKILL"
}

@test "skill cooldown-release uses an ABSOLUTE UTC instant, never a bare relative +1h" {
  # bd#5233: west of UTC a relative offset lands in the past at write time.
  grep -q 'date -u -v+1H' "$SKILL"
  # The release command itself must not carry the relative form anywhere.
  ! grep -q -- '--defer +1h' "$SKILL"
}

@test "skill states the true lifecycle: bd never wakes a deferred bead" {
  # The false promise that froze 365 beads in nibble must never come back.
  ! grep -qi 'reappears unassigned' "$SKILL"
  grep -q 'NEVER wakes' "$SKILL"
}

@test "skill mandates append-only notes (bd note), never --notes replacement" {
  grep -q 'bd note' "$SKILL"
  grep -qi 'REPLACES' "$SKILL"
}

@test "skill requires a re-resolvable defer reason and bans mass-deferral" {
  grep -qi 'mass-defer' "$SKILL"
  grep -q 'Wait:' "$SKILL"
}

@test "skill escalates repeated cooldowns to human triage instead of cycling forever" {
  # A persistent dup/conflict must not claim->reject->defer->wake hourly forever.
  grep -qi 'cooldown-release note' "$SKILL"
  awk '/prior cooldown/,/triage/' "$SKILL" | grep -qi 'do NOT re-defer'
}

# --- beads pipeline step (generated docs/beads-workflow.md) ---

@test "beads step generates the deferred-cooldown section with the sweeper and both upstream bugs" {
  grep -q 'cooldown, not a graveyard' "$BEADS"
  grep -q 'reap-lapsed-defers.sh' "$BEADS"
  grep -q 'gastownhall/beads#5289' "$BEADS"
  grep -q 'gastownhall/beads#5233' "$BEADS"
}

@test "beads step folds in the upstream tracking bead (retire the workaround when bd fixes land)" {
  grep -qi 'tracking bead' "$BEADS"
  grep -qi 'scratch DB' "$BEADS"
}

@test "beads step update-mode triggers include the missing deferred-cooldown section" {
  grep -qi 'missing the deferred-cooldown' "$BEADS"
}

# --- generated skill copy stays in sync (drift gate exists, but the deferral
# --- doctrine specifically must reach the generated copy too) ---

@test "generated work-beads skill carries the absolute-UTC release" {
  grep -q 'date -u -v+1H' "$ROOT/content/skills/work-beads/SKILL.md"
}
