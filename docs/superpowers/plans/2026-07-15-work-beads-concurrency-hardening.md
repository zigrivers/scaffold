# Work-Beads Concurrency Hardening — Implementation Plan

**Date:** 2026-07-15
**Spec (source of truth):** `docs/superpowers/specs/Work-Beads Concurrency Hardening.md`
**Builds on:** `docs/superpowers/specs/2026-07-14-work-beads-parallel-claim-hardening-design.md`
(shipped in scaffold v3.43.0 — JIT single-bead claiming, atomic claim, per-agent actor,
one-at-a-time selection, stale-claim surfacing).

This plan ports the remaining spec **[CORE]** requirements into the canonical
`work-beads` skill and adds the **[HOST]** binding points into the Scaffold agent-ops
templates.

## `bd 1.1.0` verification (re-run 2026-07-15, throwaway DB — spec §12)

All primitives the spec relies on were re-confirmed against the installed `bd`:

- `bd update <id> --claim` is an **actor-keyed CAS**: alpha → exit 0 (assignee=alpha,
  status=in_progress); bravo → exit 1 `already claimed by alpha-agent`, no state change;
  alpha again → exit 0 idempotent. **⇒ distinct `BEADS_ACTOR` is mandatory** (same-actor
  claims both win).
- `bd update <id> --assignee "" --defer +1h` (single command, **no** `--status open`) →
  exit 0, status=DEFERRED, assignee cleared, absent from `bd ready`. Adding `--status open`
  **reverts** deferred→open (cancels the cooldown) — confirmed (F4/F7).
- `bd update <id> --defer +30m` → `defer_until = 2029-01-15` (**30 months**, unit trap).
- `bd update <id> --set-metadata lease_until=<ts>` sets it; `--set-metadata lease_until=`
  leaves an **empty string**; `--unset-metadata lease_until` removes the key entirely.
- `bd ready --claim --json` on a **normal** bead claims + returns it (resolves spec §10).
- Reaper read path `bd list --status in_progress --json` exposes `assignee`, `updated_at`,
  `metadata.lease_until`, `issue_type`.
- **Adaptation (bd 1.1.0 differs from spec §3 table wording):** `bd ready` **excludes**
  `in_progress`, so `bd ready --assignee <me>` returns only *open*-owned beads, never a
  crashed session's `in_progress` claim. The self-resume orient line therefore uses
  **`bd list --status in_progress --assignee <me>`**.
- `bd show --json` returns a **list** (`[obj]`); `metadata`/`assignee`/`defer_until` keys
  appear only once set.
- `bd stale` minimum `--days` is 1; the reaper computes staleness from `updated_at` /
  `lease_until` directly (finer + testable) rather than depending on `bd stale`.

## Change map (spec section → file)

| Spec | Change | File |
|---|---|---|
| §4.1 claim-then-validate + cooldown-release + skip-set | Reorder: rank (Step 1) → claim (2.1) → **validate after claim** → reject = `--assignee "" --defer +1h` | `content/agent-skills/work-beads/SKILL.md` |
| §4.2 generic path | `bd ready --claim` still validates + same cooldown-release | same |
| §4.3 T1-ACTOR (HARD, [HOST]) | Blocking prerequisite + fail-loud fallback; `[HOST]` worktree-bootstrap wiring | same + `setup-agent-worktree.sh.tmpl` |
| §5.1 one-at-a-time | keep/clarify (already shipped) | same |
| §5.2 reaper ([CORE]+[HOST]) | New project-agnostic script: report-only default, guarded `--apply`, lease-authoritative, epic-excluded, `--shared-filesystem` gated, pluggable PR-lister | `content/assets/agent-ops/git/reap-stale-claims.sh.tmpl` + `make/agent-ops.mk.tmpl` + `src/core/agent-ops/install.ts` |
| §5.3 orient | Reaper **report** + `bd list --status in_progress --assignee <me>` | SKILL.md Step 0 |
| §6.1 leases ([CORE]) | Stamp `lease_until` on claim; renew on push (heartbeat); clear on release; reaper uses `lease_until` as authoritative; `[HOST]` cadence hook | SKILL.md §2.1/§2.3/§2.7 + reaper |
| §6.2 partitioning | Rank FULL queue; capability slice is a within-tier **tie-breaker only**, never a pre-filter; priority always wins | SKILL.md Step 1 |
| §6.3 epic-sibling re-poll | Validation gate: re-poll `gh pr list` for a sibling under the same parent | SKILL.md 2.1 validation |
| §4.4 docs + eval | `docs/beads-workflow.md` claim line; content evals | `docs/beads-workflow.md`, `tests/evals/skill-triggers.bats` |
| §9 smoke test template | Shipped `bd-claim-smoke-test.sh` template + a Scaffold bats test that runs it when `bd` is present | `content/assets/agent-ops/git/bd-claim-smoke-test.sh.tmpl` + `tests/…` |

## [HOST] binding points (requirement text in SKILL.md + a TODO in the template)

- **T1-ACTOR** (§4.3): `configure_identity()` in `setup-agent-worktree.sh.tmpl` writes
  `BEADS_ACTOR=agent-<name>` to a worktree-local env file; a TODO marks where a project's
  `bd` wrapper must preserve it.
- **Reaper packaging + probes** (§5.2): `make reap-stale-claims` target; PR-lister pluggable
  (default `gh pr list`); worktree probe gated behind `--shared-filesystem`.
- **Heartbeat cadence** (§6.1): SKILL.md §2.3 states renew-on-push; TODO in the template for
  a project that wants a push hook.
- **Capability taxonomy** (§6.2): SKILL.md ships the mechanism + an example label mapping;
  projects fill their own.
- **Preflight epic-sibling hardening** (§6.3): TODO in `setup-agent-worktree.sh.tmpl`
  preflight_scan to key on the parent epic.

## Sequencing (spec §7 safety)

Tier 1 (atomic claim) ships **with** its recovery path (the reaper + lease), never alone.
`--apply` on the reaper stays **report-only by default / gated** because the release is not
provably atomic without an upstream `bd` fenced-release primitive (spec §5.2, §8 bead 9).
Agent-side lost-claim re-claim (heartbeat re-reads its own bead) makes an erroneous reap
self-healing.

## Tests (TDD — assertions first)

1. `tests/evals/skill-triggers.bats` — new asserts: claim-then-validate ordering language,
   `--assignee "" --defer +1h` cooldown present, `lease_until` present, "tie-break" /
   "never pre-filter" partitioning language, reaper report in orient.
2. `tests/agent-ops-reap-stale-claims.bats` — reaper: report-only default (no mutation),
   `--apply` guarded release aborts when assignee/lease/updated_at changed between re-reads,
   epic excluded, lease-not-expired (missing/empty lease → not reaped), PR guard skips.
3. `tests/agent-ops-bd-smoke-test.bats` — the shipped smoke-test template runs green against
   a real temp `bd` DB (skips when `bd` absent).
4. `src/core/agent-ops/install.test.ts` — reaper + smoke test install as executable
   git-component files; manifest tracks them.
5. `node scripts/generate-agent-skills.mjs` regenerates derived files; `agent-skills-check`
   drift gate passes; `make check-all` green.
