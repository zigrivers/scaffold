# Work-Beads Concurrency Hardening — Specification

**Status:** Draft for review · **Date:** 2026-07-14 · **Owner bead:** nibble-e6efw
**Applies to:** the `work-beads` skill (all coding-agent harnesses) and its supporting
tooling. **Also targets upstream Scaffold** — the skill originates there and is templated
into new projects, so this spec is written to be portable (see §1.3 and §10).

---

## 1. Summary

### 1.1 The problem in one sentence

Multiple AI agents run the `work-beads` loop against one shared Beads queue, and the loop
marks a task `in_progress` **too late** — so two agents routinely select and start the
**same** task, wasting whole review rounds.

### 1.2 What this spec delivers

Three tiers of hardening, each independently shippable:

| Tier | Change | Eliminates |
|---|---|---|
| **1** | **Atomic claim-then-validate** (`bd … --claim`, a real compare-and-set) + **per-agent actor identity** (`BEADS_ACTOR`) | The TOCTOU window where two agents claim the *same* bead ID |
| **2** | **Claim-one-at-a-time** selection + a **stale-claim reaper** (release abandoned `in_progress` beads) | The exposed "selected-but-unclaimed tail", and queue rot from dead claims |
| **3** | **Claim leases with TTL + heartbeat**, **soft capability partitioning**, **epic-sibling PR re-poll** | Stranded claims from crashed agents, avoidable contention, and *semantic* duplicates (two different bead IDs for the same work) |

### 1.3 Portability contract (nibble ⇄ Scaffold)

Every normative requirement below is tagged:

- **[CORE]** — expressed only against `bd` CLI primitives that ship with Beads itself.
  These are identical in any project and belong in the canonical Scaffold skill.
- **[HOST]** — a binding into project-specific tooling (a wrapper script, a `make`
  target, a CI job). The *behavior* is normative; the *host* is a parameter. Each
  **[HOST]** item names its nibble binding and the Scaffold-side generalization.

An implementer in a new project satisfies the spec by implementing every **[CORE]**
requirement verbatim and providing a host binding for every **[HOST]** requirement.

---

## 2. Background: how the loop selects work today

The current `work-beads/SKILL.md` sequence:

```
Step 0  Orient:  agent reads `bd ready`  ──────────────┐  (bead X appears OPEN)
Step 1  Select:  rank, run conflict/dup scan, pick N   │  ← seconds-to-minutes elapse
Step 2.1 Claim:  bd update <id> --status in_progress ──┘  ← ONLY NOW does X leave `bd ready`
```

Two independent race windows result:

- **Window A — TOCTOU on the first bead.** Between "read `bd ready`" (Step 0/1) and
  "write `in_progress`" (Step 2.1), a second agent reads the *same* snapshot, sees X
  open, and selects it too. The write `bd update --status in_progress` is a blind
  last-writer-wins update: it succeeds even when someone else already set it, so nothing
  detects the collision.
- **Window B — the exposed tail.** In `/work-beads N`, the loop claims **only the bead
  it is actively working**. Beads 2…N were *selected* but remain `open`/`ready`, fully
  visible to every other agent, for the entire 30–90 min it takes to ship bead 1. Any
  other `/work-beads` run grabs one.

A third, distinct failure mode is not a timing race at all:

- **Window C — semantic duplication.** Two *different* bead IDs describe the same
  underlying work (observed: option-chain hydration, PR #1772 vs #1776). No status flag
  helps, because the IDs differ; only a smarter pre-commit scan and backlog hygiene do.

### 2.1 Why the current claim records nothing useful

`work-beads/SKILL.md §2.1` runs `bd update <id> --status in_progress` through the
`scripts/bd` wrapper, which **pins `bd`'s working directory to the primary checkout**.
Beads resolves the actor as `--actor` → `$BEADS_ACTOR` → `git user.name` → `$USER`.
Because the wrapper runs in the primary checkout, `git user.name` is the shared human
identity (`Ken Allred`) — **not** the per-agent identity that
`setup-agent-worktree.sh` sets *inside the worktree*. So every claim is recorded under
the same owner and is indistinguishable from every other agent's. This is why the queue
currently shows **~19 `in_progress` beads against ~4 open PRs**: nothing can tell a live
claim from an abandoned one, and nothing ever releases the dead ones.

---

## 3. Ground truth: verified `bd` primitives (the toolbox)

These were verified against the live `bd` on 2026-07-14 (transcript in §12). **All are
[CORE]** — they ship with Beads, so they are available in every project including
Scaffold-templated ones. Implementers MUST re-run the §12 smoke test in their own project
before relying on them (Beads versions drift).

| Primitive | Verified behavior |
|---|---|
| `bd update <id> --claim` | **Atomic compare-and-set, keyed on the *actor*.** Success → sets `assignee = actor`, `status = in_progress`, **exit 0**. If already claimed by a **different** actor → prints `Error claiming <id>: issue already claimed by <owner>`, **exit 1**, **no state change**. If already claimed by the **same** actor → **exit 0, no-op (idempotent)**. |
| ⚠️ **Actor-keying consequence** | Because the CAS is keyed on the actor, **two agents that share one actor identity both get exit 0** on the same bead — each believes it won. The collision guard therefore **only works when each agent has a distinct actor** (§4.3). This is a hard prerequisite, verified in §12, not an optional enhancement. |
| `bd update <id> --status open --assignee ""` | **Verified (exit 0):** returns a claimed bead to `open` **and clears the assignee** (empty-string clear is supported). This is the release command. It is **unconditional** — it does not check who currently holds the bead, so the reaper must guard it (§5.2, finding F1). |
| `bd ready --claim [--json]` | Atomically claims the **first ready issue matching the given filters** and returns it. Filters compose: `--assignee`, `--exclude-label`, `--has-metadata-key`, `-l/--label`. Convenience primitive for the generic path (§4.2). |
| `bd ready --assignee <me>` | Lists only the ready/claimed work owned by `<me>`. |
| `bd stale` | Surfaces issues "not updated recently" — a *raw, coarse* signal (see §5.2 / §10 on its limits); the lease model (§6.1) supersedes it with an explicit `lease_until`. |
| `bd update <id> --defer <when>` | **Verified (exit 0):** sets `status = deferred`, hiding the issue from `bd ready` until the date. ⚠️ **Unit trap:** `+30m` parsed as **30 *months*** (→ 2029), not minutes — verified. Use unambiguous units: `+1h`, `+6h`, `+1d`, `+2w`, or ISO. `--due <when>` sets a due timestamp. Building block for cooldowns (§4.1) and TTL leases (§6.1). |
| `--actor <name>` / `$BEADS_ACTOR` | Sets the audit-trail actor and thus the `--claim` assignee. Precedence: flag → env → `git user.name` → `$USER`. |
| `Owner` vs `Assignee` | Distinct fields. `Owner` stays the creator/primary identity; **`Assignee` is the claim field** the reaper and `--assignee` filters key on. |

**Non-guarantee to design around:** `bd ready --claim` scoped by `--has-metadata-key`
returned `[]` for an *ephemeral* probe bead in testing (wisps appear excluded from
`bd ready`). The robust, fully-verified CAS is the **ID-specific** `bd update <id>
--claim` (exit-1-on-conflict, actor-keyed). Tier 1 therefore leans on `bd update <id>
--claim` after ranking; `bd ready --claim` is used only in the generic no-ranking path
(§4.2) and every host MUST confirm it — **on a normal (non-ephemeral) bead** — in the §12
smoke test before depending on it.

---

## 4. Tier 1 — Atomic claim + per-agent actor identity

**Goal:** close Window A. After Tier 1, two agents can never hold the same bead ID; the
loser gets a clean `exit 1` and moves on.

### 4.1 [CORE] The claim-then-validate protocol

Replace "select, then later mark in_progress" with **claim first, validate second,
release on reject**. This shrinks the collision window to zero because the bead leaves
`bd ready` the instant an agent begins evaluating it.

Normative per-bead selection algorithm:

```
0. PREREQUISITE (§4.3): this agent runs under a distinct BEADS_ACTOR. Without it the
   claim CAS gives NO protection (same-actor claims both exit 0). Refuse to proceed —
   or degrade to the plain in_progress path and log the loss of protection loudly —
   if the resolved actor is the shared human identity.
1. Read `bd ready` and rank candidates by the skill's existing ranking
   (P0>P1>P2>P3 → capital-affecting → unblocking → capability fit).
   Maintain a per-pass SKIP-SET (bead IDs this pass has already rejected).
2. For each candidate C in ranked order, skipping any C already in the SKIP-SET:
     a. Attempt the atomic claim:   bd update C --claim
        - exit 1 ("already claimed by <owner>")  → LOST RACE: another agent holds C.
          Add C to the SKIP-SET, continue. Do NOT retry C and do NOT defer C
          (deferring another agent's live claim would sabotage them).
        - exit 0                                  → you now hold C. Proceed to (b).
     b. Run the validation gates (they read shared state, so they run AFTER the claim
        so the bead is invisible to peers while you decide):
          - duplicate-work preflight scan (setup-agent-worktree.sh --preflight-only)
          - conflict check (git-workflow §6.2 surfaces: same domain/, migration
            sequence, shared/ single-writer, high-contention files)
          - epic-sibling PR re-poll (§6.3, if Tier 3 shipped; otherwise a plain
            `gh pr list` scan)
        If any gate REJECTS C (you hold it, but it is a dup/conflict — a PERSISTENT
        condition that will still reject the NEXT agent too):
          - COOLDOWN-RELEASE in a SINGLE command so the whole fleet backs off,
            preventing a claim→reject→release busy-loop (finding F5):
              bd update C --assignee "" --defer +1h
            This clears ownership AND leaves C in status=deferred (verified §12), so C
            is out of `bd ready` for the cooldown and returns automatically when it
            lapses. Do NOT follow it with `--status open`: verified (§12), `--status
            open` reverts deferred→open and CANCELS the cooldown (findings F4/F7).
          - Add C to the SKIP-SET; continue to the next candidate.
        If all gates pass → C is your bead. Break; go to worktree setup.
3. If no candidate survives (all lost-raced, deferred, or skipped), report
   "no claimable work" (queue exhausted/contended) — do NOT loop back to step 1
   in the same invocation.
```

Cooldown rationale (F5): a validation rejection (dup/conflict) is a **persistent**
property of the bead, not a transient race. Releasing straight to `open` makes C
immediately re-eligible, so every agent that ranks C first re-claims → re-rejects →
re-releases it forever (a fleet-wide busy-loop). The single-command `--assignee ""
--defer +1h` removes C from `bd ready` for a cooldown window (deferred status; it
reappears, unassigned, when the defer lapses), letting the conflicting in-flight work
finish (or a human retriage) before C is offered again. A **lost race** (exit 1) is
different — C is someone's live claim, so we skip it *without* deferring. `+1h` is a
starting default; tune per project. (Do not write `+30m` — `bd` reads `m` as *months*; §3.)

Rationale for claim-before-validate (not validate-before-claim): validation reads shared
state (`gh pr list`, the dup scan) that itself changes under concurrency. Holding the
claim during validation means the bead is invisible to peers while you decide. A brief
hold during a failed scan is cheap; a lost race *during* validation is the exact bug we
are removing.

**Crash-safety of the claim (why Tier 1 cannot ship alone):** if the agent dies between
claim and release — or between claim and opening its draft PR — the bead is left
`in_progress` with this agent's assignee and no cooldown. Nothing in Tier 1 recovers it;
that is the job of Tier 2's reaper (§5) or Tier 3's lease expiry (§6.1). **Tier 1 MUST
NOT be shipped to a multi-agent project without at least the reaper from Tier 2 or the
lease from Tier 3** (see §7 sequencing).

### 4.2 [CORE] Generic no-ranking path

When the invocation is a bare `/work-beads` or `/work-beads N` with no label filter and
no need for the nuanced ranking, an agent MAY substitute the one-shot claim for step 2a's
rank-then-claim:

```
bd ready --claim --json          # atomically claims + returns the top ready bead
```

**This substitutes ONLY the ranking + claim (step 1 + 2a); it does NOT skip validation.**
The claimed bead MUST still pass step 2b's gates (dup scan, conflict check, epic-sibling
re-poll) and, on rejection, follow the **same single-command cooldown-release**
(`bd update <id> --assignee "" --defer +1h`) before the agent re-runs `bd ready --claim`
for the next candidate (finding F6). It also requires per-agent actor identity (§4.3) —
otherwise the claim is neither collision-safe nor attributable. In short: the generic path
changes *how the candidate is chosen*, never *whether it is validated*.

### 4.3 [HOST] Per-agent actor identity (`BEADS_ACTOR`) — a HARD prerequisite

**Distinct per-agent actor identity is not an enhancement to atomic claiming — it is what
makes atomic claiming work at all.** Verified (§3, §12): `bd update <id> --claim` is a CAS
**keyed on the actor**, and a claim by the *same* actor is idempotent (exit 0). So when two
agents share one identity (the current state: every claim via `scripts/bd` resolves to the
shared `git user.name` in the primary checkout — see §2.1), **both agents get exit 0 on the
same bead and both believe they won.** Without distinct actors, Tier 1 provides **zero**
collision protection — it is exactly today's broken behavior. This is the correction of a
wrong assumption in an earlier draft that claimed the CAS is "on the row, not the actor."

**Requirement T1-ACTOR (MUST, blocking):** every agent's `bd` invocations MUST carry a
stable, unique `BEADS_ACTOR` for the duration of its session, and it MUST survive the
`scripts/bd` wrapper's `cd` into the primary checkout. An agent that cannot establish a
distinct actor MUST NOT rely on `--claim` for safety: it either refuses to run the claim
protocol, or falls back to the plain `--status in_progress` path **and logs loudly that
collision protection is disabled** (so the loss is visible, never silent).

- **nibble binding [HOST]:** `setup-agent-worktree.sh` already computes a per-agent
  identity (`agent-<name>`) and sets it as the worktree's git identity. Extend it to
  **also** write `BEADS_ACTOR=agent-<name>` where the agent's shell will pick it up, and
  make the `scripts/bd` wrapper **preserve and use** `BEADS_ACTOR` (it must not unset it
  when it `cd`s to the primary checkout; env is inherited across `cd`, so the wrapper only
  needs to avoid overriding it). Recommended concrete mechanism: `setup-agent-worktree.sh`
  appends `export BEADS_ACTOR=agent-<name>` to a worktree-local `.envrc`/`.agent-env`
  file **and** the `scripts/bd` wrapper sources that file if present. **Fallback is
  fail-loud, not fail-safe:** if `BEADS_ACTOR` is unset, `bd` records the shared human
  identity, and — because same-actor claims both exit 0 — collision protection is silently
  lost. The wrapper SHOULD therefore emit a visible warning (once per session) when it
  resolves the actor to the shared identity, so the degradation is never invisible.
- **Scaffold generalization [HOST]:** the canonical skill states requirement T1-ACTOR
  (MUST) and the precedence; the *how* (envrc vs. exported var vs. wrapper flag) is left to
  each project's worktree-bootstrap step. New projects generated from Scaffold get the
  requirement in `SKILL.md §2.1`, a fail-loud check, plus a TODO in their worktree-setup
  script. Note: projects **without** a `cd`-pinning wrapper avoid nibble's *specific*
  identity-reset bug, but still need a unique actor per agent for the CAS to distinguish
  them — the requirement is universal.

### 4.4 [HOST] Skill + docs edits

- `work-beads/SKILL.md` (`.claude/` and `.agents/` copies, kept byte-identical):
  - **§2.1 "Claim"** → rewrite to the §4.1 claim-then-validate protocol; show
    `bd update <id> --claim` and the exit-1 branch; show the release command; state
    T1-ACTOR.
  - **Step 1 "Select"** → note that ranking now *precedes* an atomic claim, and that a
    lost race (`exit 1`) is normal, not an error — skip and continue.
  - **Loop contract block** at the top → change `claim (bd update <id> --status
    in_progress)` to `claim (bd update <id> --claim — atomic; exit 1 = lost race, skip)`.
  - **Red-flags table** → add a row: "Marking in_progress with a plain `--status` write
    → use `--claim`; the plain write can't detect a collision."
- `docs/beads-workflow.md §5` → the line "Use `bd update <id> --status in_progress` to
  claim" becomes "Use `bd update <id> --claim` (atomic; records assignee)".
- The **skill↔docs alignment eval** (nibble's `make eval`) MUST be updated so the new
  claim command is the asserted one. **[HOST]** — Scaffold's equivalent eval, if any.

### 4.5 Acceptance criteria (Tier 1)

- **AC-T1-1** Two concurrent `bd update <id> --claim` on the same bead: exactly one exits
  0; the other exits 1 with `already claimed by`, and the assignee is the winner.
  (Automated: the §12 smoke test, run in CI/pre-merge where available.)
- **AC-T1-2** After a full `/work-beads` selection under two simulated agents sharing one
  queue, no two agents ever hold the same bead ID. (Test harness spawns two selection
  passes against a seeded test DB via `bd --db <tmp>`.)
- **AC-T1-3** A claim made by agent A shows `Assignee: agent-A` (not the shared human
  identity) when `BEADS_ACTOR` is wired. (Assert `bd show <id>` after a claim in a
  worktree.)
- **AC-T1-4** A rejected candidate (dup/conflict gate fails) is cooldown-released by the
  single command `bd update <id> --assignee "" --defer +1h`: its assignee is cleared and
  its status is `deferred` (NOT `open`), so it is absent from `bd ready` until the defer
  lapses, at which point it reappears unassigned and claimable (preventing the F5
  busy-loop). A **lost-race** skip (exit 1) is NOT deferred (it is another agent's live
  claim). (Assert both paths, and that the bead is out of `bd ready` during the cooldown,
  on a seeded DB.)

---

## 5. Tier 2 — Claim-one-at-a-time + stale-claim reaper

**Goal:** close Window B (exposed tail) and stop queue rot from dead claims.

### 5.1 [CORE] Claim one bead at a time

**Requirement T2-SEQ:** the loop MUST NOT reserve a batch of N beads up front. It selects
and atomically claims **exactly one** bead (via §4.1), ships it fully, and only then
re-runs selection for the next. The tail is never exposed because it is never reserved
early; re-selecting each iteration also lets the ranking react to queue changes.

- Skill edit: `work-beads/SKILL.md` Step 2 "Per-bead loop" already says work strictly
  sequentially; make explicit that **selection+claim happen at the top of each
  iteration**, and that `/work-beads N` means "do this N times", not "reserve N now".
- Interaction with the one-open-PR rule: unchanged. One PR in flight; the next claim
  happens only after the previous bead merges. This is *stronger* than batch-claiming
  because a crash strands at most one bead, which the reaper recovers.

### 5.2 [CORE + HOST] The stale-claim reaper

**Liveness authority (resolves F2/F4).** The reaper must decide "is this claim live?"
from a signal that is (a) reliable even when an agent crashed, and (b) valid across
machines/sandboxes. **The authoritative signal is a recent heartbeat** — the claimant
re-stamping a `last_heartbeat` (Tier 3 formalizes this as `lease_until`, §6.1). A PR or a
worktree is **not** proof of liveness: a crashed agent routinely leaves both behind
(false *negative* — never reaped, stranded forever), and in a multi-sandbox deployment
one agent's `git worktree list` cannot even see another's worktree (false *positive* —
premature reap). Therefore:

- **In a Tier-3 (lease) deployment:** liveness = `lease_until >= now`. The reaper reaps a
  claim **iff** its lease has lapsed. PR/worktree checks are dropped (the lease subsumes
  them). This is the recommended target design.
- **In a Tier-2-only (no lease yet) deployment:** there is no heartbeat, so the reaper
  cannot *safely auto-release* by itself. It runs in **report mode**: it surfaces
  suspected-abandoned claims for a human or the next agent to triage. Auto-release
  (`--apply`) is permitted **only** on the narrow, conservative conjunction below, and
  even then behind a guarded CAS (see "Guarded release").

```
Tier-2 interim "SUSPECTED ABANDONED" (report by default; --apply only with all of):
  (1) STALE:        bd stale flags it (not updated within THRESHOLD; default 24h).
  (2) NOT AN EPIC:  type != epic  (umbrellas sit in_progress for days by design).
  (3) NO OPEN/DRAFT PR references the bead ID
                    (gh pr list --state open --json ... , match "Closes <id>" / "<id>"
                     in title+body — the bead↔work mapping is the PR BODY, since branch
                     names deliberately exclude bead IDs, git-workflow §2.2).
  (4) NO LIVE WORKTREE on THIS host whose branch has an open PR for the bead
                    (git worktree list; valid only where all agents share one filesystem —
                     otherwise omit and rely on report-mode + human triage).
The PR/worktree checks (3)(4) only ever make the reaper MORE conservative (skip). They
are guards against false-positive reaps, NOT proof of abandonment: a crashed agent that
left a stale PR/worktree will FAIL (3)/(4) and be left for human/lease triage rather than
silently stranded — the report names it so it is visible.
```

**Guarded release (resolves F1 — the reaper must not race a fresh claimant).** The release
command `bd update <id> --status open --assignee ""` is **unconditional** (§3): if reaper R1
validates an old claim, a new agent A2 claims the bead, and R1 *then* releases, R1 clears
A2's live assignee — stealing live work, violating AC-T2-3. Because `bd` offers no
conditional update, the reaper MUST make the release a compare-and-set in software:

```
reap(id):
  before = bd show id            # capture assignee + (lease_until or updated_at)
  assert SUSPECTED_ABANDONED(before)
  ... (no long work between here and the release) ...
  now = bd show id               # RE-READ immediately before mutating
  if now.assignee != before.assignee:  abort   # someone re-claimed — do not touch
  if lease_model and now.lease_until >= wall_now:  abort   # fresh lease — do not touch
  if now.updated_at != before.updated_at:  abort   # any activity since — do not touch
  bd update id --status open --assignee ""         # release only the SAME stale claim
```

The re-read-and-compare shrinks the race to the tiny window between the second `bd show`
and the `bd update`, but **it does NOT eliminate it** (finding F1): a claimant can renew
between the reaper's re-read and its unconditional `bd update`, and the release then erases
a live claim. Adding `lease_until` narrows the window (a live agent renews far in the
future, so it is almost never validated as expired in the first place) but cannot close it,
because the release itself is still unconditional. **A fully correct release requires an
atomic conditional/fenced release primitive from `bd` that this design does not yet have:**

- **True fix — requires a `bd` capability (feature request, [CORE]-blocked):** a fenced
  release, e.g. `bd update <id> --status open --if-assignee <x>` or a lease **fencing
  token** (`--claim` returns a token; `--release --token <t>` succeeds only if the current
  token matches). This is exactly the trading-engine leadership-lease/fence pattern already
  in this repo. The reaper releases with the token it observed; a renewal rotates the token,
  so a stale reaper's release is rejected server-side — atomic, no window. **File this as a
  `bd`/Beads enhancement; it is the only way to make auto-release provably safe.**
- **Interim mitigation (until the fenced primitive exists) — make a wrongful reap rare AND
  recoverable, never catastrophic:**
  1. **Grace margin:** only reap leases lapsed by `TTL + grace` (e.g. lease TTL 4h, reap at
     +1h grace = 5h idle). A live agent heartbeats every push, so it is never within a
     grace margin of expiry — the reaper never even validates it.
  2. **Agent-side lost-claim detection:** on each heartbeat/commit the working agent
     re-reads its bead; if `assignee != me` or its lease was cleared, its claim was reaped
     out from under it. It re-claims (`bd update <id> --claim`); if that now returns exit 1
     (someone else took it) it stops and reports rather than double-working. This makes an
     erroneous reap **self-healing**.
  3. **`--apply` stays gated** (report-only default) until a soak shows zero live-claim
     hits.
  The residual race therefore has a vanishing probability and a non-destructive outcome,
  but the honest statement is: **without the fenced primitive, auto-release is best-effort,
  not provably safe** — which is why `--apply` is gated and report-mode is the default.

Idempotency + concurrency (AC-T2-3): two reapers running the same `reap(id)` are safe
because the second re-reads an already-released/re-claimed bead and aborts on the assignee
check.

**[CORE]** = the abandonment definition, the guarded-release CAS, the fenced-release
requirement, the grace-margin + agent-side re-claim mitigations, the epic exclusion, and
the lease-authority rule. **[HOST]** = the PR/worktree probes (their commands and whether
(4) applies) and the packaging.

- **nibble binding [HOST]:** add `make reap-stale-claims` — **report-only and agent-safe by
  default** (`ARGS=--dry-run` alias of default; `ARGS=--apply` performs guarded releases and
  is **"ask before"** until a soak proves it never touches live work). Fold the reaper
  *report* into hygiene commands agents already run: `make prune-merged` / `make doctor`
  gain a "stale-claim triage" report line (report only — never auto-release). All agents
  share one filesystem here, so probe (4) is valid.
- **Scaffold generalization [HOST]:** ship a project-agnostic `reap-stale-claims` that takes
  the PR-lister as a pluggable command (default `gh pr list`) and treats probe (4) as
  opt-in (`--shared-filesystem`), defaulting OFF so distributed deployments rely on the
  lease + report mode rather than an invalid worktree probe. Ship the skill text that tells
  agents to run its **report** during Step 0 orient.

### 5.3 [CORE] Orientation surfaces stale claims

`work-beads/SKILL.md Step 0 (Orient)` gains one read-only line: run the reaper **report**
(dry-run) and `bd ready --assignee <me>` so the agent sees (a) any of *its own* prior
claims still open from a crashed session, and (b) how many stale claims exist. This makes
the reaper self-reinforcing: every agent that starts a batch surfaces the rot.

### 5.4 Acceptance criteria (Tier 2)

- **AC-T2-1** `/work-beads 3` never marks bead 2 or 3 `in_progress` until bead 1 has
  merged. (Assert via loop trace / `bd show` timestamps in a seeded run.)
- **AC-T2-2** A bead that is `in_progress`, older than THRESHOLD, with no open/draft PR
  and no live worktree, is released to `open` by the reaper's `--apply` run; one that has
  a draft PR is **not** released; one that is `-t epic` is **not** released by default.
  (Automated against a seeded test DB with fixture PRs/worktrees.)
- **AC-T2-3 (guarded release, F1)** If a re-claim/renewal is **detected** between the
  reaper's re-read and its release (assignee changed, or `lease_until` moved into the
  future, or `updated_at` changed), the reaper **aborts** and makes no change. Idempotent:
  a second immediate run is a no-op. **This guard reduces but does not eliminate the
  race** — a renewal that lands *after* the re-read but *before* the unconditional write is
  still not caught (§5.2); a provable guarantee requires the `bd` fenced-release primitive
  (§8 bead 9). So the AC asserts: (a) every *detectable* change causes an abort, and (b)
  `--apply` is gated/report-only until that primitive lands. (Automated: inject a re-claim
  between the reaper's two `bd show` reads and assert abort.)
- **AC-T2-4** The reaper's default/agent-safe form makes **no** state change (report
  only); mutation requires an explicit `--apply`.
- **AC-T2-5 (crashed-with-stale-PR is surfaced, F2)** A bead `in_progress` past THRESHOLD
  whose agent crashed leaving a stale open PR is **not silently stranded**: the reaper's
  report lists it for triage (it is not auto-released, because the PR guard holds). (Assert
  it appears in report output.)

---

## 6. Tier 3 — Leases, partitioning, and semantic-dup defense

**Goal:** resilience against crashed agents (auto-expiry), reduced contention, and a real
defense for Window C (semantic duplicates).

### 6.1 [CORE] Claims as leases with TTL + heartbeat

Model a claim as a **time-boxed lease** rather than a permanent status. This subsumes and
strengthens the Tier 2 reaper: instead of "release if stale AND no PR AND no worktree", a
lease simply **expires** unless renewed, and expiry returns the bead to `bd ready`.

Mechanism, built from verified primitives:

- On claim, set a lease horizon: `bd update <id> --claim` **plus** `--defer +<TTL>` is
  *not* right (defer hides from ready while claimed, which we want, but expiry must
  *release*, not un-hide). Instead: on claim, stamp `--set-metadata
  lease_until=<now+TTL>`. **Do NOT use `--due` for lease visibility (finding F2):** `--due`
  is the bead's user-authored deadline, and overwriting it on every claim/heartbeat would
  destroy real scheduling data. Keep lease state entirely in the `lease_until` metadata key
  and surface it via the reaper report, never by hijacking `--due`. Ideally claim + stamp
  are **one atomic op** — the same `bd` fenced-claim primitive requested in §5.2 (`--claim`
  should return a token and set the lease in one call). Until then they are two ops, which
  creates two hazards the reaper MUST tolerate (finding F6):
  - **Crash between claim and stamp** → an `in_progress` bead with **no** (or empty)
    `lease_until`. The reaper MUST treat missing/empty `lease_until` as **"freshly claimed,
    not expired"** — fall back to `updated_at + grace`, never reap on absence of a lease.
  - **Stale lease metadata from a prior claim** → a released bead may retain an old
    `lease_until`. **Release MUST clear it** (`--set-metadata lease_until=`, verified §12),
    and the reaper MUST ignore any `lease_until` older than the bead's current
    claim/`updated_at` (a lease stamped before the current claim is not this claim's lease).
- **Heartbeat:** while working, the agent renews by re-stamping `lease_until` on a cadence
  (e.g. every commit/push, which already happens frequently per skill §2.3), so a live
  agent's lease is always well beyond the reap grace margin (§5.2) and never validated as
  expired.
- **Expiry = the authoritative reaper trigger:** the §5.2 reaper's coarse STALE + PR +
  worktree heuristic is **replaced** by a single reliable test — `lease_until < now`. A
  lapsed lease is reaped via the **guarded release** (§5.2: re-read `lease_until`
  immediately before releasing; abort if it moved into the future — i.e. the claimant, or
  a new claimant, renewed). Because liveness is now an explicit, machine-independent
  timestamp rather than a guess from local PR/worktree state, this **resolves F2 and F4**:
  a crashed agent's lease simply lapses (no false-negative stranding), and no cross-host
  `git worktree list` is needed (no false-positive reap in distributed deployments). The
  PR/worktree probes become optional belt-and-suspenders, not the decision.

This is intentionally the same mental model as the trading engine's leadership-lease /
fence work already in this repo (broker-truth promotion) — reuse the concept, not the
code. **[CORE]** for the metadata mechanism; **[HOST]** for the heartbeat cadence hook and
the reaper packaging.

TTL guidance: default 4h working lease (long enough for one bead, short enough that a
crash frees it within a review cycle), renewed on every push. Epics: no lease / very long
lease. All configurable.

### 6.2 [CORE + HOST] Soft capability partitioning

The skill already carries an **advisory** capability table (Claude→shared/evaluator,
Codex→single-service backend, Antigravity→audits/docs, Cursor→UI, etc.). Turn it into a
**last-resort tie-breaker** that reduces contention without ever overriding priority:

- **Rank the FULL ready queue first** by the §4.1 ranking (P0>P1>P2>P3 → capital-affecting
  → unblocking). Partitioning is applied **only to break ties among otherwise-equal
  candidates**: within a single priority tier where rules 1–3 do not separate them, prefer
  the candidate in this agent's capability slice. **Never pre-filter the queue to a slice.**
- **Priority always wins (finding F3):** an out-of-slice P0 is ALWAYS selected over an
  in-slice P2, because ranking happens over the whole queue before partitioning is even
  consulted. Partitioning changes *which of several equally-ranked beads* you take, never
  *whether a higher-priority bead is considered*. (Do NOT implement this as
  `bd ready -l <slice>` first with a fallback-when-empty — that is exactly the pre-filter
  that selects an in-slice P2 over an out-of-slice P0. Implement it as a sort key applied
  after the priority sort, or an explicit tie-break step.)
- `bd ready --assignee <me>` is still used **first and separately** — but only to reclaim
  *this agent's own* prior in-progress work from a crashed session, which is not a
  contention concern.
- **[HOST]:** the label taxonomy per class is project-specific. nibble uses its existing
  area labels; Scaffold ships the mechanism and an example mapping, projects fill theirs.

### 6.3 [CORE] Epic-sibling PR re-poll (Window C defense)

Semantic duplication happens when two *different* beads under the same parent epic cover
overlapping work. Defense (folded into §4.1 step 2b validation):

**Requirement T3-SIB:** before investing in a bead whose parent/epic is under active work,
the agent MUST re-poll `gh pr list` (open **and** draft) for a PR that references **any
sibling** under the same parent (`bd children <parent>` / `bd dep tree`), and treat a
sibling PR touching the same surface as a conflict → release and skip. Re-poll again
immediately before each rebase (siblings can appear mid-flight). This is the only defense
against Window C; it is cheap (`gh pr list` is already in Step 0).

- Strengthen the duplicate-work preflight scan **[HOST]** (`setup-agent-worktree.sh`) to
  key on the parent epic: if a sibling bead has an open/draft PR, raise it to a hard
  warning, not just a keyword match. Scaffold ships the principle; the scan script is
  host-specific.

### 6.4 Acceptance criteria (Tier 3)

- **AC-T3-1** A claimed bead whose `lease_until` has lapsed, with no live PR/worktree, is
  released by the reaper; a claimed bead whose agent is heartbeating (lease renewed within
  TTL) is never released. (Seeded DB + clock injection.)
- **AC-T3-2** With capability partitioning on, an agent whose slice is empty still selects
  from the full queue (no starvation), and a P0 outside its slice is still selected over
  an in-slice P2 (priority dominates). (Selection unit test.)
- **AC-T3-3** When a sibling bead under the same epic has an open/draft PR touching the
  same surface, the candidate is flagged and released rather than built. (Fixture PRs +
  dep tree.)

---

## 7. Sequencing, backward-compat, and safety

- **Ship order:** Tier 1 and the Tier 2 **reaper** must ship **together** (or Tier 1 with
  Tier 3's lease). Reason: claim-then-validate (§4.1) and any crash between claim and
  release strand a bead; the reaper/lease is what makes atomic claiming safe. Tier 2's
  one-at-a-time and Tier 3's partitioning/sibling-repoll can follow independently.
- **Backward-compat:** `bd update <id> --status in_progress` keeps working; agents on an
  un-upgraded skill copy still function (they just keep the old race). The reaper treats
  their timestamp-only claims via the coarse STALE + report path (§5.2) since they carry no
  `lease_until`. Mixed-version fleets keep functioning, but note the caveat below — an
  un-upgraded agent gets **no** collision protection, so the value is only realized once
  the fleet is upgraded.
- **`BEADS_ACTOR` is NOT a "blind-but-safe" fallback (corrects F3):** distinct per-agent
  actor identity is a **hard prerequisite** for the claim CAS to work at all (§4.3) —
  because same-actor claims both exit 0, an unset/shared actor means two agents both "win"
  the same bead, i.e. today's broken behavior with a false sense of safety. The only safe
  fallback is **fail-loud**: when the actor resolves to the shared identity, warn visibly
  and either refuse the claim path or fall back to plain `in_progress` while logging that
  collision protection is off. There is no silent-and-safe degradation of the actor.
- **No new hard dependency:** everything is built on `bd` primitives already present.
  Reaper `--apply` is gated behind an explicit flag (default report-only) so an over-eager
  release can never happen unattended until a soak earns trust.
- **Failure mode to avoid:** the reaper releasing a live claim. It cannot be *provably*
  prevented with today's `bd` primitives (F1) — a check-then-act release is inherently
  racy. Made rare-and-recoverable by: the guarded re-read-and-compare, the lease + **grace
  margin** so live agents are never near expiry, **agent-side lost-claim detection +
  re-claim** (self-healing), the epic exclusion, the PR/worktree conservative guards, the
  `--apply` gate, and idempotency (all §5.2). The **provably-correct fix is a `bd`
  fenced/conditional-release primitive** (§5.2) — filed as a Beads enhancement; until it
  lands, `--apply` stays gated and report-mode is the default.

---

## 8. Rollout — bead breakdown (this repo)

Filed as children/`discovered-from` of **nibble-e6efw**. This spec is the plan; these are
the execution units.

1. **T1** — Atomic claim-then-validate in `SKILL.md §2.1`/Step 1 + loop contract +
   red-flags; `docs/beads-workflow.md §5`; skill↔docs eval update. (skill/docs only)
2. **T1** — `BEADS_ACTOR` wiring: `setup-agent-worktree.sh` writes it; `scripts/bd`
   preserves it; fallback documented. (+ AC-T1-3 test)
3. **T1/T2** — `bd --claim` smoke test (§12) as a repo test, run in the pre-merge gate.
4. **T2** — `reap-stale-claims` script + `make reap-stale-claims` (report default,
   `--apply` gated) + fold report into `make doctor`/`make prune-merged` + Step-0 orient
   line. (+ AC-T2-2/3/4 tests)
5. **T2** — one-at-a-time selection wording in `SKILL.md` Step 2. (+ AC-T2-1)
6. **T3** — lease metadata + heartbeat-on-push + reaper uses `lease_until`; clear
   `lease_until` on release; reaper treats missing/stale lease as not-expired (F6).
   (+ AC-T3-1)
7. **T3** — soft capability partitioning as a within-tier tie-breaker over the full ranked
   queue (never a pre-filter) + starvation/priority tests (F3). (+ AC-T3-2)
8. **T3** — epic-sibling PR re-poll in validation + preflight-scan hardening.
   (+ AC-T3-3)
9. **Upstream (Beads) enhancement request** — an atomic **fenced/conditional release**
   (`--release --token`/`--if-assignee`) and an atomic **claim+lease** op, so auto-release
   is provably safe (F1). Until it exists, `--apply` stays gated (§5.2/§7).

Each is one PR through the normal work-beads loop. **Beads 1–4** — Tier 1 (atomic claim +
actor), the smoke test, **and the reaper (bead 4)** — are the first shippable, safe
increment: §7 requires Tier 1 to ship *with* a recovery path, so the reaper is part of the
minimum set, not a later add-on (finding F3). Bead 9 (the upstream fenced-release
primitive) is an external dependency, not a blocker — the interim mitigations (§5.2) make
Tiers 2–3 shippable without it.

---

## 9. Portability checklist for Scaffold (upstream)

The Scaffold agent (see the ready-to-paste prompt in §11) must, for the canonical skill:

- [ ] Implement every **[CORE]** requirement verbatim in the templated `SKILL.md`
      (claim-then-validate §4.1, generic path §4.2, one-at-a-time §5.1, orient line §5.3,
      lease model §6.1, partitioning principle §6.2, sibling re-poll §6.3).
- [ ] For every **[HOST]** requirement, add the requirement text to `SKILL.md` **and** a
      clearly-marked TODO/hook in whatever the Scaffold template uses for worktree
      bootstrap and its task-runner, so a generated project has an obvious place to bind:
      - T1-ACTOR (`BEADS_ACTOR` in worktree bootstrap + `bd` wrapper) — §4.3
      - reaper packaging + PR/worktree probes — §5.2
      - reaper report in orient — §5.3
      - heartbeat cadence hook — §6.1
      - capability label taxonomy example — §6.2
      - preflight-scan epic-sibling hardening — §6.3
- [ ] Include the §12 smoke test as a template test so every new project can self-verify
      its `bd` supports `--claim`/`--assignee`/`stale` before relying on them.
- [ ] Keep the skill's `.claude/` and `.agents/` copies byte-identical (nibble parity
      rule) and note the same for any harness split Scaffold maintains.

---

## 10. Risks & open questions

Resolved during review (verified in §12): `--assignee ""` clears the assignee (F7);
`--claim` is actor-keyed so same-actor claims both exit 0 (F3 → §4.3 makes actor identity
a hard prerequisite); `--defer` unit is months for `m` (use `+1h`). Remaining:

- **`bd ready --claim` on non-ephemeral beads** was not fully exercised (probe was a
  wisp, excluded from ready). Every host MUST confirm via the §12 smoke test — **on a
  normal bead** — before using the generic path §4.2; the ID-specific CAS is the primary
  mechanism regardless.
- **`bd stale` threshold semantics** ("not updated recently") — confirm whether it is
  configurable and what counts as an "update" (does a comment reset it? a metadata write?).
  The lease model (§6.1) sidesteps this entirely with explicit `lease_until`, which is why
  it is the recommended target.
- **`--set-metadata lease_until=...` filterability** — confirm the reaper can efficiently
  query "leases where `lease_until < now`" (metadata range query, or a scan of
  `in_progress`). If bd cannot range-query metadata, the reaper scans `in_progress` beads
  and compares in software (acceptable at this queue size).
- **Guarded-release residual window (F1)** — check-then-act release is inherently racy;
  the re-read-and-compare (§5.2) plus the lease grace-margin only *shrink* it. It is
  **provably** closed only by a `bd` **fenced/conditional-release** primitive (§8 bead 9).
  Until that lands: `--apply` is report-only/gated, and the grace-margin + agent-side
  lost-claim re-claim (§5.2) make any erroneous reap rare and self-healing rather than
  catastrophic.
- **Heartbeat coupling to push cadence** — a long build with no pushes could let a lease
  lapse. Mitigate with a generous TTL (4h) and/or an explicit renew step in skill §2.6
  "verify".
- **Reaper trust** — start report-only; promote `--apply` to agent-safe only after a soak
  showing it never touches live work.

---

## 11. Appendix — verification transcript (2026-07-14, live `bd`)

Ground-truth experiment on an **ephemeral** probe bead (`nibble-wisp-*`, purged after):

```
# CONFLICT is actor-keyed — different actor is refused:
$ bd update <probe> --claim --actor alpha-agent      # exit 0; Assignee: alpha-agent
$ bd update <probe> --claim --actor bravo-agent       # exit 1
  Error claiming <probe>: issue already claimed by alpha-agent
  # assignee UNCHANGED (still alpha-agent) — no theft

# BUT SAME actor is idempotent — BOTH exit 0 (this is the F3 finding):
$ bd update <probe> --claim --actor same-actor        # 1st: exit 0
$ bd update <probe> --claim --actor same-actor        # 2nd: exit 0  <-- shared identity => both "win"

# Release clears the assignee (F7):
$ bd update <probe> --status open --assignee ""       # exit 0; Assignee now EMPTY

# Defer works but the unit is a trap:
$ bd update <probe> --defer +30m                       # exit 0; status DEFERRED,
                                                        # Deferred: 2029-01-14  <-- +30m = 30 MONTHS
                                                        # use +1h / +6h / +1d instead

# Fields after a claim:
  Owner: <human> · Assignee: alpha-agent · Status: in_progress

# bd ready --claim scoped by a unique metadata key returned [] for the wisp
# (wisps excluded from ready) — hence Tier 1 uses `bd update <id> --claim` after ranking,
# and every host must re-confirm bd ready --claim on a NORMAL bead (§10).
```

Actor precedence observed: `--actor` flag → `$BEADS_ACTOR` → `git user.name` → `$USER`.
Via nibble's `scripts/bd` (pinned to primary checkout), unset `BEADS_ACTOR` yields the
shared human identity — the §2.1 / §4.3 problem this spec fixes. **The same-actor exit-0
result is why §4.3 makes distinct `BEADS_ACTOR` a hard prerequisite, not an option.**
