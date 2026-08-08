# Deferred-Debt Wake (Lapsed-Defer Sweeper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the converged nibble/rumble deferred-debt fix in Scaffold itself: a lapsed-defer sweeper in the agent-ops git bundle, corrected work-beads deferral doctrine (absolute-UTC defers, true lifecycle, escalation), smoke-test wake assertions, and generated-doc coverage — so no future generated project accumulates perpetual deferred beads.

**Architecture:** Port rumble's battle-hardened `scripts/reap-lapsed-defers.sh` (7 MMR rounds, fail-closed HOLD guards) as an agent-ops template, with nibble's automation posture (auto `--apply` wake wired into `make prune-merged`, loud report line). Skill text ports the field-corrected doctrine already proven in the user-level copy, genericized. Upstream-bug tracking (gastownhall/beads#5289 auto-wake, #5233 UTC serialization) folds in as documented tracking-bead guidance.

**Tech Stack:** bash (bats-core tests), TypeScript (vitest for install manifest), markdown content.

## Background evidence (why)

- nibble: 365 beads frozen `deferred` (24 P1) 2026-07-16→07-29; fix PR #2772 (defer-wake in reaper, runs on `make prune-merged`).
- rumble: 129 frozen (127 lapsed); fix PR #932 (`reap-lapsed-defers.sh`, report at orient, guarded `--apply`), PR #813 (absolute-UTC defer).
- Root cause: work-beads 2.1c mandates cooldown-release `--defer +1h`; bd ≤1.1.2 never wakes a deferred bead (`bd undefer` is the only exit; zero callers shipped by Scaffold); template text falsely claims the bead "reappears unassigned". Amplifier: bd serializes relative defers as local wall-clock stamped `Z`.

## Global Constraints

- Canonical skill source is `content/agent-skills/work-beads/SKILL.md`; `content/skills/work-beads/SKILL.md` is GENERATED — edit canonical, then `node scripts/generate-agent-skills.mjs`; drift gate `make agent-skills-check`.
- Sweeper env knobs keep rumble's names (`SWEEP_GRACE_SECONDS`, `REAP_PR_LIST_CMD`, `REAP_NOW`) — tests inject them; consistent with `reap-stale-claims.sh.tmpl`.
- Machine-specific user-copy additions (ponytail 2.6b, ponytail red-flag rows, lean markers) are OUT of scope — port only deferral/queue-hygiene doctrine.
- Skipped deliberately: deferred-count line in `beads-snapshot.sh`/`doctor.sh` — the sweeper's summary line already surfaces the count everywhere it matters (orient + every prune-merged).
- All gates green via `make check-all` before push; PR + mandatory MMR review; squash-merge.

---

### Task 1: Sweeper template + bats behavior tests

**Files:**
- Create: `content/assets/agent-ops/git/reap-lapsed-defers.sh.tmpl`
- Test: `tests/agent-ops-reap-lapsed-defers.bats`

**Interfaces:**
- Produces: `scripts/reap-lapsed-defers.sh` (installed dest) — report-only default, `--apply` guarded restore, exit 0 clean / 1 inconclusive-or-failed; restore command shape `bd update <id> --status open --assignee "" --defer "" --unset-metadata lease_until`.

- [x] **Step 1: Write failing bats tests** — clone the stub pattern from `tests/agent-ops-reap-stale-claims.bats` (bd/gh stubs, `REAP_NOW` pinned to `2026-07-15T12:00:00Z`, `resolve_agent_ops_template`). Cases:
  1. report-only default: lapsed defer printed `RESTORE`, no `bd-update.log`.
  2. `--apply` guarded restore: log contains `--status open`, `--assignee`, `--defer ""`, `--unset-metadata lease_until`.
  3. `--apply` ABORT when re-read `updated_at` moved (no mutation, output `ABORT`).
  4. HOLD: no `defer_until` (open-ended park).
  5. HOLD: open PR references the bead id (body).
  6. HOLD: still-assigned bead.
  7. HOLD: `Wait:` marker in notes.
  8. HOLD: non-closed `blocks` dependency.
  9. not-lapsed: fresh park inside grace anchored on `updated_at` even when `defer_until` is hours in the past (the bd#5233 skew case) — no candidate.
  10. malformed `bd list` JSON → exit 1 + `INCONCLUSIVE`.
  11. PR-lister failure → HOLD, never restore.
  12. report mode with bd absent → exit 0 `skipping`; `--apply` with bd absent → exit 1.
- [x] **Step 2: Run** `bats tests/agent-ops-reap-lapsed-defers.bats` — expect all FAIL (template missing).
- [x] **Step 3: Port the script** from `/Users/kenallred/Developer/rumble/scripts/reap-lapsed-defers.sh` (verbatim logic) with these exact changes:
  - Header: `{{PROJECT_NAME}} — lapsed-defer sweeper…`, "Installed by `scaffold agent-ops install --component git`", upstream refs gastownhall/beads#5289 + #5233, and the tracking-bead line: "When a bd release fixes both, file a bead to retire this sweeper (re-verify in a scratch DB first)."
  - Drop the rumble bead-id references (`rumble-we65`, `rumble-buz4`) — keep the `[HOST]` PR-lister note.
  - Keep everything else: to_epoch, whole-token id match, pr_ok fail-closed, grace anchored on `max(defer_until, updated_at)`, guarded_restore, exit contract.
- [x] **Step 4: Run tests** — expect PASS. Also `shellcheck` clean if `make lint` covers templates.
- [x] **Step 5: Commit** `feat(agent-ops): ship the lapsed-defer sweeper template`

### Task 2: Register in the install manifest

**Files:**
- Modify: `src/core/agent-ops/install.ts` (AGENT_OPS_FILE_MAP)
- Test: `src/core/agent-ops/install.test.ts`

- [x] **Step 1: Failing test** — in the FILE_MAP spec block add:
  ```ts
  expect(AGENT_OPS_FILE_MAP['git/reap-lapsed-defers.sh.tmpl']).toEqual({
    dest: 'scripts/reap-lapsed-defers.sh', component: 'git', executable: true,
  })
  ```
- [x] **Step 2: Run** `npx vitest run src/core/agent-ops/install.test.ts` — FAIL.
- [x] **Step 3: Add map entry** after `git/reap-stale-claims.sh.tmpl`.
- [x] **Step 4: Run** — PASS (install/manifest/check tests seed from Object.keys, so they pick it up automatically).
- [x] **Step 5: Commit** `feat(agent-ops): register reap-lapsed-defers in the install manifest`

### Task 3: Makefile wiring (auto-wake post-merge)

**Files:**
- Modify: `content/assets/agent-ops/make/agent-ops.mk.tmpl`
- Test: `tests/defer-wake-content.bats` (new — content assertions for mk + skill + beads.md)

- [x] **Step 1: Failing content tests** — mk template must contain a `reap-lapsed-defers:` target calling `scripts/reap-lapsed-defers.sh $(ARGS)`, and `prune-merged:` must invoke `reap-lapsed-defers.sh --apply` (feature-detected, non-fatal).
- [x] **Step 2: Implement** — add to `.PHONY` + targets:
  ```make
  reap-lapsed-defers: ## [agent-safe] Report lapsed deferred beads (ARGS=--apply to restore)
  	@test -x scripts/reap-lapsed-defers.sh || { echo "reap-lapsed-defers not installed (run: scaffold agent-ops install --component git)"; exit 1; }
  	@scripts/reap-lapsed-defers.sh $(ARGS)
  ```
  and append to `prune-merged` (after cleanup-merged-branches):
  ```make
  	@if [ -x scripts/reap-lapsed-defers.sh ]; then scripts/reap-lapsed-defers.sh --apply || echo "reap-lapsed-defers: incomplete sweep — rerun: make reap-lapsed-defers ARGS=--apply"; fi
  ```
- [x] **Step 3: Run new bats file** — PASS.
- [x] **Step 4: Commit** `feat(agent-ops): auto-wake lapsed deferrals on prune-merged`

### Task 4: Smoke-test wake assertions

**Files:**
- Modify: `content/assets/agent-ops/git/bd-claim-smoke-test.sh.tmpl` (check 3 + new check)
- Test: `tests/agent-ops-bd-smoke-test.bats` (existing — runs the resolved script against real bd)

- [x] **Step 1: Extend check 3** — cooldown-release now uses an absolute UTC instant (portable: `date -u -v+1H … || date -u -d '+1 hour' …`), then asserts the STORED `defer_until` parses and is in the future (catches bd#5233 regressions). Keep the hidden-from-ready assert.
- [x] **Step 2: New check 3b (wake primitive)** — `bd update "$B" --status open --assignee "" --defer ""` returns the bead to `bd ready` — the exact restore the sweeper performs must round-trip.
- [x] **Step 3: Run** `bats tests/agent-ops-bd-smoke-test.bats` (real bd) — PASS.
- [x] **Step 4: Commit** `feat(agent-ops): smoke-test the defer round-trip (store-future + wake)`

### Task 5: Work-beads skill doctrine

**Files:**
- Modify: `content/agent-skills/work-beads/SKILL.md` (canonical)
- Regenerate: `node scripts/generate-agent-skills.mjs` → `content/skills/work-beads/SKILL.md`
- Test: `tests/defer-wake-content.bats` (same file as Task 3)

Port from the field-tested user-level copy (`~/.claude-2/skills/work-beads/SKILL.md`), genericized (no nibble/rumble paths — point at the now-shipped `scripts/reap-lapsed-defers.sh`):

- [x] **Step 1: Failing content tests** — canonical skill must: contain `reap-lapsed-defers.sh` (orient) · contain the absolute-UTC release (`date -u -v+1H`) · NOT contain the false claim `reappears unassigned` · NOT contain a bare `--defer +1h` release command · contain `bd note` / append-notes rule · contain the escalation rule (`Wait:` after repeated cooldowns) · red-flag row updated.
- [x] **Step 2: Edit the skill**:
  - Step 0 orient block: add `scripts/reap-lapsed-defers.sh   # REPORT ONLY — lapsed cooldowns rotting out of bd ready (skip if absent)`.
  - Step 1: add the **Owner is not an assignment** paragraph (user-copy text).
  - 2.1b: add the **stale-park re-check** paragraph (user-copy text).
  - 2.1c rewrite: keep the cooldown-release rationale; add the two hard rules (append-only notes via `bd note`; defer reason must name a re-resolvable artifact + banned unfalsifiable reasons); mass-defer ban; compute ABSOLUTE UTC instant (`until="$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ)"`, GNU alt) and release with `--defer "$until"`; state the true lifecycle: bd itself NEVER wakes it — the shipped sweeper restores it (`make prune-merged` auto-applies; `scripts/reap-lapsed-defers.sh --apply` manually); keep "no `--status open`", keep the MONTHS footgun note; **escalation**: each cooldown-release appends a dated `bd note` naming the blocking artifact — on finding 2+ prior cooldown notes for the same cause, do NOT re-defer: append a `Wait:` note naming what must change (the sweeper holds `Wait:` beads) and report it in the Step 3 slots for human triage.
  - Red-flag rows: update the `--status open` row to reference absolute-UTC cooldown-release; add the Owner row, stale-park row, `--notes`-replaces row, unfalsifiable-reason row, mass-defer row (user-copy text, genericized).
- [x] **Step 3: Regenerate + drift gate** — `node scripts/generate-agent-skills.mjs && make agent-skills-check`.
- [x] **Step 4: Run content bats** — PASS.
- [x] **Step 5: Commit** `fix(skills): true deferral lifecycle in work-beads (absolute-UTC, wake, escalation)`

### Task 6: beads.md generated-doc coverage

**Files:**
- Modify: `content/pipeline/foundation/beads.md`
- Test: `tests/defer-wake-content.bats`

- [x] **Step 1: Failing content tests** — beads.md must contain a "cooldown, not a graveyard" docs/beads-workflow.md item referencing `reap-lapsed-defers.sh`, both upstream issue numbers, and the tracking-bead instruction; Update Mode triggers must include the missing-section trigger.
- [x] **Step 2: Add item 8** to "Generate docs/beads-workflow.md":
  **Deferred is a cooldown, not a graveyard** — verbatim rules: bd (through 1.1.2) never returns a deferred bead to `bd ready` when `defer_until` passes (gastownhall/beads#5289) — restore is `bd undefer` or the shipped sweeper `scripts/reap-lapsed-defers.sh` (`make prune-merged` auto-applies it; report mode runs at work-beads orient). Always defer to an ABSOLUTE UTC instant — bd serializes relative offsets as local wall-clock stamped `Z` (gastownhall/beads#5233). Deliberate indefinite parking = a `Wait:`/`external-wait` note naming the exit condition (the sweeper holds it), or close the bead. File a tracking bead to retire the sweeper + absolute-instant workaround when a bd release fixes both upstream bugs (re-verify in a scratch DB first).
  Plus Update Mode trigger: "docs/beads-workflow.md is missing the deferred-cooldown (lapsed-defer sweeper) section".
- [x] **Step 3: Run content bats + `make validate`** — PASS.
- [x] **Step 4: Commit** `feat(pipeline): document the deferred-cooldown lifecycle in generated beads docs`

### Task 7: Gate, ship, review

- [x] **Step 1:** `make check-all` green on the branch.
- [x] **Step 2:** Push `feat/defer-wake`, `gh pr create` (body: root-cause evidence, both project incidents, upstream issue links).
- [x] **Step 3:** Mandatory MMR review (`scaffold run review-pr` or `mmr review --pr <N> --sync --format json`); fix blocking findings ≤3 rounds.
- [x] **Step 4:** Squash-merge on pass, delete branch, `launchpad notify`.

## Self-review notes

- Spec coverage: sweeper (T1–T3), skill (T5), smoke test (T4), docs (T6), B-fold tracking bead (T1 header + T6 text), propagation unchanged (skill auto-resync; scripts via `agent-ops install` — no code change needed, documented behavior).
- Type consistency: dest `scripts/reap-lapsed-defers.sh` used identically in T1/T2/T3/T5/T6.
