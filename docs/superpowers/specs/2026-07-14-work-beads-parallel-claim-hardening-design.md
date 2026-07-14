# Work-Beads Parallel-Claim Hardening — Design

**Date:** 2026-07-14
**Status:** Approved (autonomous /goal directive, 2026-07-14 — user pre-authorized
"analyze, improve, ship, release" without interactive review; decisions below are
documented in lieu of interactive approval)
**Scope:** The `/work-beads` skill and the content surfaces that teach bead
claiming. No CLI/TypeScript code changes; no `bd` upstream changes.

## 1. Context and problem

The user runs up to **12 concurrent agents** against one Beads queue. Observed
failure: `/work-beads 3` selects three beads at batch start, works them
sequentially, and by the time the agent reaches bead 2 or 3 another agent has
already taken it. The upfront selection is a **stale reservation that reserves
nothing**.

Analysis of the skill (canonical source
`content/agent-skills/work-beads/SKILL.md`) plus empirical verification against
the installed bd 1.1.0 surfaced these gaps, in severity order:

| # | Gap | Evidence |
|---|-----|----------|
| G1 | **Upfront multi-bead selection.** Loop contract says "for each selected bead"; Step 1 is "Select beads" (plural), run once per batch. Beads 2..N are unclaimed until their turn — hours later at 12-agent parallelism. | SKILL.md loop contract + Step 1 |
| G2 | **Non-atomic claim fallback.** Step 2.1 falls back to `bd update <id> --status in_progress`, which does not detect a concurrent claimant. bd 1.1.0 has the atomic form: `bd update <id> --claim` fails (exit 1, "already claimed by <actor>") when someone else holds the bead — verified empirically. Five other content surfaces teach the same non-atomic form. | SKILL.md 2.1; `beads.md` (two spots); `multi-agent-coordination.md`; `claude-md-optimization.md`; `setup-agent-worktree.sh.tmpl` help text |
| G3 | **No agent identity setup.** Claims key on the actor (`BEADS_ACTOR` → `git user.name` → `$USER`). A same-actor re-claim is **idempotent (exit 0)** — verified — so 12 agents sharing the default identity all "successfully" claim the same bead. The build prompts set `BEADS_ACTOR` per agent; the skill, invoked directly via `/work-beads`, never does. | bd 1.1.0 behavior; `multi-agent-start.md` two-identity rule |
| G4 | **Claim-vs-selection mismatch.** Step 1 says rank and preflight a chosen bead; Step 2.1's primary path (`bd ready --claim`) claims *the first ready match*, which may not be the bead just selected and preflighted. | SKILL.md Steps 1/2.1 |
| G5 | **No claim-failure protocol.** Nothing says what to do when a claim is lost to another agent (the *normal* case at high parallelism). | SKILL.md |
| G6 | **Unknowable merge-slot trigger.** "3+ agents active? Serialize the merge" — an agent cannot reliably count active agents. | SKILL.md 2.7 |
| G7 | **No stale-claim surfacing.** A dead agent strands its bead `in_progress` forever (bd 1.1.0 has no work leases — tracked upstream watch item). Nothing surfaces strands to the operator. | beads-surface-audit-2026-07-12 |
| G8 | **Undefined edge semantics.** Queue drained mid-batch; explicit-ID invocation where an ID is already claimed. | SKILL.md |

The build prompts (`single/multi-agent-start/resume.md`) already model the
correct behavior — atomic scoped claims, "do not claim a second bead," stable
actor, claim-conflict recovery. **The skill is the laggard; this design aligns
it with them.**

## 2. Approaches considered

- **A. Claim-all-upfront** — atomically claim all N beads at batch start.
  Rejected: hoards the queue (starves an 11-agent fleet), and with no work
  leases in bd 1.1.0 an agent death strands N claims instead of one.
- **B. Just-in-time budget (recommended)** — `N` becomes an **iteration
  budget**, not a reservation. Each iteration re-reads the queue, selects ONE
  bead, claims it atomically, and falls through to the next candidate on a lost
  claim. Zero hoarding; the view is always fresh; races become cheap no-ops.
- **C. Pipelined claim-ahead** — claim bead k+1 while bead k is in review.
  Rejected: breaks the one-open-PR-per-agent invariant's simplicity for a
  marginal latency win, and still strands a claim on agent death.

**Decision: B.** It matches the loop contract's existing "strictly sequential,
one open PR per agent" spirit and the build prompts' claim-loop model.

## 3. Design

### 3.1 Skill restructure (step numbers preserved)

External cross-references pin the numbering: four build prompts reference "the
skill's Step 2.1" (claim) and "Step 2.2" (worktree). Those meanings stay.

- **Loop contract** (lean region — flows to `agents-block.md`, `cursor.mdc`,
  and every AGENTS.md managed block):

  ```
  set identity once, then repeat up to N times (one bead in flight per agent):
    refresh view -> select ONE bead -> claim atomically (lost the claim? next candidate)
    -> worktree -> build (draft PR on first push) -> verify (make check)
    -> review (mmr, 3-round cap) -> squash-merge -> sync + prune -> close bead
  batch end (budget spent, queue drained, or P0/blocker): report in the required slots
  ```

- **Invocation semantics:** `/work-beads N` = "work up to N beads, selected
  one at a time at claim time — N is a budget, not a reservation."
- **Step 0 — Orient** gains two items:
  - **Identity:** if `BEADS_ACTOR` is empty or shared, pick a distinctive agent
    name (e.g. `agent-cobalt-fox`) and use it on **every** `bd` write for the
    whole session (env var or `--actor`). Unique across concurrent agents =
    mutual exclusion (same-actor claims are idempotent); stable within the
    session = your resume path works. Mirrors the build prompts' two-identity
    rule (merge-slot holder stays per-process unique).
  - **Stale-claim surfacing (advisory, never auto-steal):** cross-check
    `bd list --status in_progress` against open PRs; an `in_progress` bead with
    no open/draft PR and no recent activity is possibly stranded by a dead
    agent. Report it in the batch report; reclaim only with operator say-so
    (release form: `bd update <id> --status open --assignee ""` — clearing the
    assignee is what actually releases the claim).
    (When upstream bd ships work leases, this becomes native — tracked in
    docs/audits/beads-surface-audit-2026-07-12.md.)
- **Step 1 — Select ONE bead (per iteration):** refresh the cheap view first
  (`bd ready`, `gh pr list --state open`), then rank (unchanged ranking), apply
  hard exclusions, run the duplicate-work preflight **for the top candidate
  only**.
- **Step 2.1 — Claim (atomic):** `bd update <id> --claim` for the selected
  bead. Exit 1 "already claimed" = **normal traffic, not an error**: return to
  Step 1 and take the next candidate. Fast path where filters fully express
  selection (materialized plan `--has-metadata-key plan_task_id`, or a label
  scope): `bd ready --claim [filters] --json` selects and claims in one atomic
  round-trip. `bd update <id> --status in_progress` is **retired as a claim**
  everywhere. `scaffold observe event claim` feature-detection unchanged.
- **Step 2.7 merge-slot trigger becomes deterministic:** if the project has a
  merge slot (`bd merge-slot check` reports one), serialize the merge —
  acquire → merge → release. Replaces "3+ agents active?".
- **Edge semantics:**
  - Queue drained before the budget: end the batch gracefully; report
    "queue drained after k of N".
  - Explicit-ID invocation: claim each ID at its turn with
    `bd update <id> --claim`; already claimed by another agent → skip and
    report the holder (dependency order and cycle rejection unchanged).
- **Batch report** gains one required slot:
  `Stale claims: <id — assignee — last activity> — or "none noticed"`.
- **Red flags table** gains four rows: selecting N beads upfront; claiming
  with `--status in_progress`; claiming without a unique actor; retrying a
  lost claim instead of moving on.

### 3.2 Coupled content surfaces (same non-atomic-claim fix)

| File | Change |
|---|---|
| `content/agent-skills/work-beads/SKILL.md` | The redesign above (canonical source) |
| `content/skills/work-beads/{SKILL.md, agents-block.md, cursor.mdc}` | Regenerated via `node scripts/generate-agent-skills.mjs` |
| `content/knowledge/execution/multi-agent-coordination.md` | Stop presenting `bd update <id> --status in_progress` as equivalent to the atomic claim; add JIT-selection + actor-uniqueness guidance |
| `content/pipeline/foundation/beads.md` | Day-to-day command lists (two spots) teach `bd update <id> --claim` |
| `content/pipeline/consolidation/claude-md-optimization.md` | Condensed work-beads recipe: singular selection, atomic claim |
| `content/assets/agent-ops/git/setup-agent-worktree.sh.tmpl` | Preflight help text suggests the atomic claim form |
| `content/knowledge/execution/task-claiming-strategy.md` | Already models atomic claims; add the actor-uniqueness caveat |

### 3.3 Out of scope

- bd work leases / TTL claims (upstream; watch item stands).
- Build-prompt changes (`single/multi-agent-start/resume.md`) — already
  correct; verified their Step 2.1/2.2 cross-references remain valid.
- New CLI code, merge-slot machinery, guides rebake (no guide embeds
  work-beads content — verified).

## 4. Testing

TDD at the content level — assertions first, then edits:

1. Extend `tests/evals/skill-triggers.bats` (reads the **generated**
   `content/skills/work-beads/SKILL.md`) with a new eval: the skill teaches
   atomic claims only — asserts `bd update <id> --claim` present,
   `bd update <id> --status in_progress` absent, `BEADS_ACTOR` present, and
   budget-not-reservation loop language present.
2. Grep-level regression in the same eval: no living claim-teaching surface
   (`content/skills/`, `content/agent-skills/`, the five §3.2 files) retains
   `bd update <id> --status in_progress` / `bd update --status in_progress`
   (the `bd list --status in_progress` *filter* remains legitimate).
3. Existing gates: `make check-all` (includes `agent-skills-check` drift gate,
   vitest skill-roster counts — unchanged roster, so counts hold), Eval 7
   trigger phrases preserved in the description.

## 5. Risks

- **Behavior change for existing downstream projects:** skill sync delivers the
  new loop on next `scaffold skill install` / auto-sync; projects' own docs may
  still describe batch selection. Mitigation: CHANGELOG entry; the skill is
  self-contained by design.
- **Lean-region edits** feed Cursor `alwaysApply` rules and AGENTS.md managed
  blocks; a malformed lean fence fails codegen. Mitigation: drift gate +
  regeneration in the same commit.
- **`bd ready --claim` fast path bypasses the duplicate-work preflight.**
  Mitigation: skill orders it preflight-after-claim in the fast path; if the
  preflight reveals live duplicate work, release with
  `bd update <id> --status open --assignee ""` (both fields — status alone
  does NOT release; verified) and re-select — cheaper than holding a wrong
  bead through a build.

## 6. Empirical verification log (bd 1.1.0, 2026-07-14)

- `bd update <id> --claim` by second actor → exit 1, "already claimed by
  agent-a"; first claim sets assignee + `in_progress`.
- Same-actor re-claim → exit 0 (idempotent) — this is why shared identity
  defeats mutual exclusion.
- `bd ready --claim --json` → claims first ready match atomically, returns it;
  `[]` + exit 0 on empty queue; respects `--label` filters.
- Claim on closed/assigned bead → exit 1 with holder named.
- `bd update <id> --status open` does **not** release a claim — the assignee
  survives and other actors' claims still fail. Full release =
  `bd update <id> --status open --assignee ""`.
- An open-but-assigned bead still **appears in `bd ready`** yet refuses other
  actors' `--claim` — plain `bd ready` output over-promises claimability;
  claim failure must be treated as routine.
- `bd ready --claim` skips assigned-but-open beads and claims the next
  claimable match — the fast path does not wedge on them.
