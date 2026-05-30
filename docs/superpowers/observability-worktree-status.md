# Observability Worktree + Feature Status

Generated 2026-05-28 from main @ `c65c7ffa` (worktree audit run from
`feat+knowledge-freshness` worktree).

## TL;DR

**Build Observability feature work is complete and shipped.** All eight plans
(Foundation through Fix-Flow) plus Lens I (knowledge-gaps, post-v3.26 follow-on)
are in `main` and were released as `v3.26.0 — Build Observability` on
2026-05-07 23:10 UTC (GitHub release published; tag chain v3.26.0 → v3.28.0).

**All 5 observability worktrees are safe to tear down.** Every unique commit
on each workspace branch is content-equivalent to the squash-merge that
landed on `main`. No ledgers to harvest (none of the worktrees ever wrote a
`.scaffold/activity.jsonl`). The active-archive directory is empty.

The only non-merged delta worth flagging is **trivial and identical in all 5
worktrees**: a 54-line path-substitution edit (`Documents/dev-projects/scaffold`
→ `Developer/scaffold`) in 3 plan archive docs, plus a working-tree-only
deletion of 6 build-step pipeline files (still present on main; deletion is
local-only and looks like leftover scratch). Neither is observability
"feature work" — both can be ignored or, if desired, recreated as a one-line
PR on main.

## Per-worktree status

All 5 worktrees share the **same uncommitted local state**:

- `D content/pipeline/build/{multi-agent-resume,multi-agent-start,new-enhancement,quick-task,single-agent-resume,single-agent-start}.md`
  → these 6 files still exist on `main` (last edited in PR #355 "Beads
  integration overhaul"). Their workspace-branch HEAD also contains them.
  The deletion is **working-tree only** — nobody staged or committed it.
  Looks like leftover scratch from a prior session. Nothing to recover.
- `M docs/superpowers/plans/2026-04-28-mmr-fix-threshold-config.md` (26 lines)
- `M docs/superpowers/plans/2026-04-30-build-observability-foundation.md` (13 lines)
- `M docs/superpowers/plans/2026-05-04-build-observability-fix-flow.md` (15 lines)

All three plan-doc modifications are **identical across worktrees** and are
just **path substitutions** in embedded smoke-test commands:

```
-/Users/kenallred/Documents/dev-projects/scaffold/...
+/Users/kenallred/Developer/scaffold/...
```

Real but tiny. Plan archives — not load-bearing feature work.

None of the worktrees has a `.scaffold/activity.jsonl` (no build-observability
events were ever ledger-recorded). The active-archive directory
`.scaffold/activity-archive/active/` is empty. **No ledger harvest is
needed for any of them.**

---

### 1. `/Users/kenallred/Developer/scaffold-observability-fix-flow`

| | |
|--|--|
| Branch | `observability-fix-flow-workspace` |
| HEAD | `5f1995a0` (`chore(release): v3.26.0 — Build Observability (Plans 1-8)`) |
| Subsystem | Plan 8 — `--fix` flow, worktree teardown, stale-archive recovery |
| Position vs main | 14 ahead / 142 behind |

**Unique commits**: 14, covering `buildFixPlan` → `dispatchFixAgent` →
`abort-snapshot` → `runFixFlow` → `handleAudit --fix` →
`recoverStaleArchives` → `scaffold observe harvest --recover` →
`scripts/teardown-agent-worktree.sh`, plus Plan 8 Tasks 9/10, three CI lint
fixes, and a release commit (`v3.26.0`).

**Shipped on main?** Yes. PR #337 squashed the entire 14-commit series into
commit `06fca3ef` (tagged `v3.26.0`, GitHub release published 2026-05-07).
On-disk: `src/observability/engine/fix-flow.ts`, `fix-plan.ts`,
`fix-agent-dispatcher.ts`, `abort-snapshot.ts`, `harvester.ts`
(`recoverStaleArchives`), and `scripts/teardown-agent-worktree.sh` all
present on main.

**Delta beyond the squash:** the workspace's own `chore(release): v3.26.0`
commit modifies CHANGELOG.md / README.md / package.json. v3.26.0 was already
shipped from main with its own CHANGELOG/README entries; main is now on
v3.28.0. The workspace's release-prep work is **superseded, not lost**.

**Verdict:** `safe-to-teardown`

---

### 2. `/Users/kenallred/Developer/scaffold-observability-fix-flow-test`

| | |
|--|--|
| Branch | `test-workspace` |
| HEAD | `229f53fc` (`cli: scaffold observe harvest --recover`) |
| Subsystem | Plan 8 — same as fix-flow but at an earlier point |
| Position vs main | 7 ahead / 142 behind |

**Identity:** This worktree's HEAD `229f53fc` is **literally an earlier
commit on the fix-flow branch's history** (it appears in fix-flow's commit
log too). The branch name `test-workspace` plus the snapshot position
suggests this was a "is the fix flow itself testable?" probe — a checkout
of the fix-flow series at an intermediate point. No unique commits vs the
fix-flow branch ancestor.

**Shipped on main?** Yes. Every unique commit here is a prefix of the
fix-flow workspace's commit list, all squashed into PR #337 / commit
`06fca3ef` on main.

**Verdict:** `safe-to-teardown` — it's a strict subset of the fix-flow
workspace.

---

### 3. `/Users/kenallred/Developer/scaffold-observability-full-lens-suite`

| | |
|--|--|
| Branch | `observability-full-lens-suite-workspace` |
| HEAD | `826a1d5d` (`fix(observability): gate untouched-story finding on grace period`) |
| Subsystem | Plan 3 — full eight-lens audit suite (C / D / E / F / G + registry + config) |
| Position vs main | 23 ahead / 147 behind |

**Unique commits**: 23, building the lens-c through lens-g implementations
plus doc-graph component-use/token-use detectors, registry wiring, bats
coverage, and 10 follow-up review-fix commits.

**Shipped on main?** Yes. PR #332 squashed everything into commit
`bd014634 observability: Plan 3 — full eight-lens audit suite`. On-disk:
`src/observability/checks/lens-c-standards.ts` through `lens-g-decisions.ts`
all present, plus `lens-h-cross-doc.ts` and `lens-i-knowledge-gaps.ts`
shipped in follow-on PRs #336 and #406.

**Verdict:** `safe-to-teardown`

---

### 4. `/Users/kenallred/Developer/scaffold-observability-phase-triggers`

| | |
|--|--|
| Branch | `observability-phase-triggers-workspace` |
| HEAD | `10bd37ed` (`fix(lint): break long line in state.test.ts`) |
| Subsystem | Plan 6 — phase-boundary triggers via `StateManager.markCompleted` |
| Position vs main | 11 ahead / 144 behind |

**Unique commits**: 11 — `StepEntry` timestamps, `isPhaseBoundary` helper,
`runPhaseAudit` orchestrator, async `markCompleted` hook, CLI surfacing of
the audit line, state-adapter timestamp handling, bats coverage, CLAUDE.md
update, plus 2 lint fixes.

**Shipped on main?** Yes. PR #335 squashed into commit `ff04a1a6
feat(observability): Plan 6 — phase-boundary triggers via
StateManager.markCompleted`. On-disk: `src/observability/engine/phase-audit.ts`
and `phase-subsets.ts` present; `StateManager.markCompleted` is async on
main.

**Verdict:** `safe-to-teardown`

---

### 5. `/Users/kenallred/Developer/scaffold-observability-replay-stall`

| | |
|--|--|
| Branch | `observability-replay-stall-workspace` |
| HEAD | `586d8ea3` (`fix(observability): remove lensGDecisions process.cwd() default export (round 9)`) |
| Subsystem | Plan 5 — replay timeline + stall detection + Lens G keyword scan |
| Position vs main | 26 ahead / 145 behind |

**Unique commits**: 26 — `synthesizer.composeReplay`, `runProgress` wiring
for `--replay`/`--no-stall-check`, terminal/markdown/dashboard-fragment
"Needs Attention" sections, lens-G decision-keyword commit scan, bats
coverage, then **9 rounds of code-review fixes** (rounds 2–9). The high
round count means this was the most contested PR in the suite — but every
finding eventually landed.

**Shipped on main?** Yes. PR #334 squashed all 26 commits into `cdbfd1de
feat(observability): Plan 5 — replay timeline + stall detection + Lens G
keyword scan`. On-disk: `src/observability/engine/stall.ts`,
`synthesizer.ts`'s replay composition, `lens-g-decisions.ts`, and the
"Needs Attention" surfaces in all three renderers are present on main.

**Verdict:** `safe-to-teardown`

## Spec coverage matrix

Cross-checking the parent spec (`docs/superpowers/specs/2026-04-30-build-observability-design.md`)
and the 8 plan files. Plans are listed in the spec's intended order (per
CLAUDE.md's "Build observability" paragraph).

| # | Plan / Subsystem | Shipped on main? | Squash commit | Workspace | Verdict |
|---|---|---|---|---|---|
| 1 | Foundation (deps, identity, validation, redaction, ledger writer, harvester, adapters, synthesizer, API, CLI, renderers) | Yes — Tasks 1–27 | PRs #320–329 (multiple squashes) | — | shipped, no workspace |
| 2 | Audit MVP (doc-graph, checks framework, 3 lenses, CLI `audit`+`ack`) | Yes | `8eb70986` (PR #331) | — | shipped, no workspace |
| 3 | Full eight-lens suite (C / D / E / F / G + registry + config) | Yes | `bd014634` (PR #332) | `full-lens-suite` | `safe-to-teardown` |
| 4 | Renderers + history (markdown reports, JSON sidecars, dashboard fragments, audit-history trends) | Yes | `37f63ae4` (PR #333) | — | shipped, no workspace |
| 5 | Replay + stall + Lens G keyword scan | Yes | `cdbfd1de` (PR #334) | `replay-stall` | `safe-to-teardown` |
| 6 | Phase-boundary triggers via `StateManager.markCompleted` | Yes | `ff04a1a6` (PR #335) | `phase-triggers` | `safe-to-teardown` |
| 7 | MMR `doc-conformance` channel + Lens H full-profile LLM-graded checks | Yes | `8b723617` (PR #336) | — | shipped, no workspace |
| 8 | `--fix` flow, worktree teardown, stale-archive recovery | Yes | `06fca3ef` (PR #337, tagged `v3.26.0`) | `fix-flow` + `fix-flow-test` | `safe-to-teardown` |

**Follow-on observability work after v3.26.0** (shipped, not a workspace
hold-out):

| Topic | Shipped via |
|---|---|
| Lens I — knowledge-gaps + lessons scanner | PR #397 (`31e45f03`) |
| Lens I — `--knowledge-root` flag + existing-entry suppression | PR #406 (`46a47037`) |
| Observability TypeScript cleanup (`as never` → typed helper) | PR #411 (`362c7f93`) |

## Open follow-ups

**Open PRs touching `src/observability/`:** none. The only open PR is
`#413 feat(mmr): auto-link review jobs to session state (T2-B)`, which is
MMR work, not observability.

**Deferred-findings mentioning observability:** two, both about
knowledge-freshness (Lens I) work — not the Plan 1–8 observability suite:

- `docs/superpowers/deferred-findings/feat+knowledge-freshness-phase-3.md`
- `docs/superpowers/deferred-findings/worktree-feat+knowledge-freshness.md`

These belong to the `feat+knowledge-freshness` track (separate worktree
that just merged PRs #414–#416) and don't block teardown of the 5
observability worktrees.

**`disabled_lenses`:** the on-main `.scaffold/observability.yaml` does not
set `disabled_lenses`, so no lens is marked broken.

## Recommended actions

1. **`safe-to-teardown` × 5** — every observability workspace branch's
   substantive work is on main via its respective squash merge. Tear down
   in any order using `scripts/teardown-agent-worktree.sh <path>` (which
   will also no-op the empty ledger harvest):
   - `scripts/teardown-agent-worktree.sh /Users/kenallred/Developer/scaffold-observability-fix-flow-test`
   - `scripts/teardown-agent-worktree.sh /Users/kenallred/Developer/scaffold-observability-fix-flow`
   - `scripts/teardown-agent-worktree.sh /Users/kenallred/Developer/scaffold-observability-full-lens-suite`
   - `scripts/teardown-agent-worktree.sh /Users/kenallred/Developer/scaffold-observability-phase-triggers`
   - `scripts/teardown-agent-worktree.sh /Users/kenallred/Developer/scaffold-observability-replay-stall`

   **Wait for the user's go-ahead.** This audit is read-only by request.

2. **Optional plan-doc path cleanup (low priority)** — if you want the 3
   plan archive docs (`2026-04-28-mmr-fix-threshold-config.md`,
   `2026-04-30-build-observability-foundation.md`,
   `2026-05-04-build-observability-fix-flow.md`) to have correct paths in
   their embedded smoke-test commands, run a single `sed -i ''
   's|/Users/kenallred/Documents/dev-projects/scaffold|/Users/kenallred/Developer/scaffold|g'`
   over them on main and open a 3-file PR. Total: 54 lines. **This is not
   a blocker for teardown** — the worktrees can be removed without it,
   and the discarded edits don't change feature behavior.

3. **No action needed for the 6 "deleted" pipeline files.** They still
   exist on main. The deletion is local-only working-tree scratch.

4. **No ledger harvest needed.** No worktree wrote a
   `.scaffold/activity.jsonl`, and the active-archive directory is empty.
   `scripts/teardown-agent-worktree.sh` will exit cleanly on the harvest
   step.
