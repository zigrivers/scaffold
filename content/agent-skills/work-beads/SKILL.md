---
name: work-beads
description: Work the project's Beads task queue end-to-end - claim a bead, build in an isolated worktree, verify, review, merge, close, report. Use when the user says "/work-beads", "/work-beads 5", "work the next N beads", "work on <bead-id>", "pick up some open tasks", or asks to work the backlog. Applies to every coding agent (Claude Code, Codex, OpenCode, Antigravity, Cursor, Grok).
---

<!-- lean:start -->
# Work Beads

Work the Beads queue with the ship loop. Multiple agents run this concurrently
with no memory of each other — the loop is self-contained on purpose; do not
skip steps.

**The loop contract (memorize this):**

```
set identity once, then repeat up to N times (one bead in flight per agent):
  refresh view -> select ONE bead -> claim atomically, then validate (lost the
  claim? next candidate; dup/conflict? cooldown-release + next) -> worktree
  -> build (draft PR on first push; renew lease on each push)
  -> verify (make check) -> review (mmr, 3-round cap) -> squash-merge
  -> sync + prune -> close bead
batch end (budget spent, queue drained, or P0/blocker): report in the slots
```

**The bead is not done until the PR is MERGED and the bead is CLOSED.**
Standing authorization: run the whole loop without asking permission. Do not
end your turn after opening a draft PR with a list of "next steps" — that is
the #1 observed agent failure. The only mid-loop stops: a verified,
still-reproducing P0, or a blocker you can name.

Invocation: `/work-beads` (1 bead) · `/work-beads N` (up to N beads, selected
**one at a time at claim time** — N is a budget, not a reservation; never
pre-pick a list) · `/work-beads N <label>` (same, scoped to a label) ·
`/work-beads <id> [<id>...]` (explicit IDs, worked in dependency order).
<!-- lean:end -->

## Step 0 — Orient (once per batch, read-only, from the primary checkout)

The primary checkout is the first entry of `git worktree list`. Run:

```bash
bd ready && bd stats
gh pr list --state open        # open + draft PRs = live registry of what others build
git worktree list
make doctor                    # wedged home base? make doctor-fix (unattended-safe)
```

**Identity — T1-ACTOR (a HARD, blocking prerequisite, not an enhancement):**
the atomic claim is a compare-and-set *keyed on the Beads actor*, and a
same-actor claim is idempotent (exit 0). Two agents sharing one identity (the
default `git user.name`) therefore BOTH "win" the same bead — the claim gives
**zero** collision protection. Establish a distinct actor BEFORE any claim:
- Already have `BEADS_ACTOR` exported in THIS shell (the multi-agent prompt set
  it, or you sourced a worktree `.agent-env` on resume)? Keep it.
- Otherwise `export BEADS_ACTOR=<distinctive-name>` (e.g. `agent-cobalt-fox`) in
  THIS shell **now, before Step 1** — or pass `--actor <name>` on every `bd`
  write. The first claim runs from the primary checkout, BEFORE any worktree
  exists, so the actor must live in your current shell; a not-yet-created
  worktree cannot supply it.
- Cannot get an actor distinct from the shared human identity? You MUST NOT trust
  `--claim` for safety: **fail loud** — refuse the claim path, or fall back to a
  plain non-atomic in-progress write AND record in the batch report that
  collision protection is DISABLED. Never degrade silently.

Unique across concurrent agents = mutual exclusion; stable within your session =
your resume path works. (Merge-slot commands are the exception — a separately
minted holder value; see 2.7.)

> **[HOST] `.agent-env` persists the actor for the worktree, not the first claim.**
> The generated `scripts/setup-agent-worktree.sh` writes `BEADS_ACTOR=agent-<name>`
> into a worktree-local `.agent-env` so `bd` writes made FROM that worktree (and a
> resumed session) are attributable — but a child script cannot export into your
> shell, so you must `source .agent-env` yourself, and it does NOT set the actor
> for the pre-worktree claim above (that is the in-shell `export` you just did).
> Any `bd` wrapper the project ships MUST preserve `BEADS_ACTOR` (env is inherited
> across `cd`, so a wrapper only has to avoid overriding it).

**Stale-claim orient (surface + self-resume):** run the reaper in **report
mode** and list your own live claims:

```bash
scripts/reap-stale-claims.sh                              # REPORT ONLY — never releases
bd list --status in_progress --assignee "$BEADS_ACTOR"   # your own crashed-session claims to resume
```

The reaper report names beads whose claim looks abandoned (lease lapsed, or —
absent a lease — stale with no open/draft PR). It NEVER mutates in report mode;
its `--apply` release is gated (see the red flags). Resume your OWN stranded
claims; for another agent's, leave it in the report — releasing a claim is an
`--apply`/operator decision, not a manual `bd` edit. (Missing script? It ships
with `scaffold agent-ops install`; feature-detect and skip if absent.)

Version gate: `bd version` must be **≥ 1.1.0** (the `bd dolt` durability
commands below require it). Older? Stop and report: upgrade with
`brew upgrade beads` or the project's equivalent — never work around the gate.

**Database safety (binding for every step):** never run `bd bootstrap`,
destructive `bd init` (`--reinit-local`/`--discard-remote`/`--destroy-token`;
legacy `--force`), or any reset against a populated `.beads/` — bootstrap
replaces local state
with the often-stale remote and silently drops unpushed beads (fresh clones
only). Before any deliberate reset, and before deleting a checkout with local
beads: `bd stats && bd dolt commit && bd dolt push`, then `make beads-snapshot`.
Drive the database only through `bd` subcommands — never a standalone `dolt`
CLI. Full runbook: docs/beads-workflow.md ("Durability & the bootstrap trap").

If `bd` or the agent-ops scripts are missing, stop and instruct:
`scaffold agent-ops install` (scripts) / see docs/beads-workflow.md (tracker).

## Step 1 — Select ONE bead (repeat before every claim)

Selection happens per bead, at claim time — never pre-select a batch. The
queue moves while you work: at high parallelism (a 12-agent fleet is
normal), any bead you "reserved" in your head at batch start will be gone
by the time you reach it. Refresh the cheap view before each selection:

```bash
bd ready --unassigned           # the claimable queue as of NOW (-u trims
                                #   open-but-assigned beads that refuse claims)
gh pr list --state open         # what others are building NOW
```

Ranking, strict order over the WHOLE ready queue: (1) priority P0 > P1 > P2 >
P3; (2) beads labeled with a `critical_labels` entry from
`.scaffold/agent-ops.yaml`, if any; (3) work that unblocks other beads.
**Capability fit is a within-tier TIE-BREAKER only — applied AFTER the priority
sort to separate otherwise-equal candidates, NEVER a pre-filter.** Ranking always
sees the whole queue, so an out-of-slice P0 is always taken over an in-slice P2.
Do NOT run `bd ready -l <your-slice>` first with a fallback-when-empty: that is
exactly the pre-filter that wrongly picks an in-slice P2 over an out-of-slice P0
(§6.2). (The capability→label mapping is project-specific; a project may ship an
example in `.scaffold/agent-ops.yaml` — treat an empty/absent mapping as "no
tie-breaker.")

Maintain a per-pass SKIP-SET of bead IDs you have already lost-raced or
cooldown-released this invocation, and skip them when you re-rank.

Cheap pre-claim exclusions (knowable from the queue view — skip before claiming):
- the merge-slot infrastructure bead: the project's `<prefix>-merge-slot` bead
  (or anything labeled `gt:slot`) is the merge LOCK, not work — it sits open at
  P0 whenever the slot is free, and an unfiltered claim would hold the global
  merge lock and block every other agent. Exclude it (`--exclude-label gt:slot`).
- a bead already `in_progress` under another agent (`bd ready --unassigned`
  trims open-but-assigned beads; a lingering assigned one just refuses your claim
  at 2.1 — normal traffic, not an error).

The expensive gates — duplicate-work scan, open-PR-surface conflict, and
epic-sibling re-poll — are **validation gates that run AFTER the claim** (Step
2.1): claim first so the bead is invisible to peers while you evaluate it.

Queue drained (or no candidate survives) before the budget is spent? The batch
ends early — go to Step 3 and report `queue drained after <k> of N`.

For explicit-ID invocations: topologically sort the listed IDs by dependency
(blockers first); stop and report if they form a cycle. Before claiming each
ID at its turn (Step 2.1), re-verify its blockers are all closed
(`bd show <id>`): an ID already claimed by another agent is skipped and
reported with its holder, and every listed ID that depends on a skipped or
still-open blocker is skipped too (report as `blocked by <id>`) — never
start downstream work whose prerequisite isn't done.

## Step 2 — Per-bead loop

**2.1 Claim first, then validate (atomic; from the primary checkout).** The bead
leaves `bd ready` the instant you claim it, so claim FIRST and evaluate it while
it is invisible to peers — this shrinks the collision window to zero.

a. **Claim** the ranked candidate: `bd update <id> --claim` — one atomic
   round-trip that sets assignee + `in_progress`, and fails (exit 1,
   `already claimed by <actor>`) if anyone else holds it. Never claim by editing
   the status field — a plain write cannot detect a concurrent claimant.
   - **exit 1 = LOST RACE** (normal traffic at high parallelism, not an error):
     add the ID to the SKIP-SET and take the next candidate. Do **not** retry it
     and do **not** defer it — it is another agent's LIVE claim; deferring would
     sabotage them.
   - **exit 0 = you hold it.** Immediately stamp a lease (§6.1) so a crash frees
     it: `bd update <id> --set-metadata lease_until=<now+TTL>` (default TTL 4h —
     compute the stamp as `date -u +%Y-%m-%dT%H:%M:%SZ` plus your TTL: UTC, whole
     seconds, `...Z`, the exact form the reaper parses; do NOT use `--defer` for
     the lease, which would only HIDE the bead instead of releasing it on expiry).
     Then run the validation gates in (b). If the project has build observability (a
     `.scaffold/` directory + the `scaffold` CLI), also
     `scaffold observe event claim --task <id>` — feature-detect, skip silently.

b. **Validation gates** (they read shared state, so they run AFTER the claim):
   - duplicate-work scan: `scripts/setup-agent-worktree.sh --preflight-only --task "<bead title>"`
   - open-PR-surface conflict: does any open/draft PR touch the same module,
     migration sequence, or shared single-writer code? (docs/git-workflow.md)
   - **epic-sibling re-poll (§6.3 — Window C / semantic-dup defense):** if the
     bead's parent/epic is under active work, re-poll `gh pr list` (open AND
     draft) for a PR referencing ANY sibling under the same parent (`bd dep tree`
     / `bd children <parent>`); a sibling PR on the same surface is a conflict.
     Re-poll again right before each rebase — siblings can appear mid-flight.

c. **On a gate REJECT** (you hold it, but it is a dup/conflict — a PERSISTENT
   condition that would reject the next agent too), cooldown-release in ONE
   command so the whole fleet backs off (prevents a claim→reject→release
   busy-loop): `bd update <id> --assignee "" --defer +1h --unset-metadata lease_until`.
   That clears ownership + the lease AND leaves the bead `deferred` (out of
   `bd ready`) until the cooldown lapses, when it reappears unassigned. Do NOT
   add `--status open` — it cancels the defer. (Never write `+30m`; `bd` reads
   `m` as MONTHS → 2029. Use `+1h`/`+6h`/`+1d`.) Add the ID to the SKIP-SET and
   take the next candidate.

d. **All gates pass → this is your bead.** Go to worktree setup (2.2).

**Generic no-ranking path (§4.2):** for a bare `/work-beads` (or a materialized
plan queue via `--has-metadata-key plan_task_id`, or a label scope) you MAY
substitute the one-shot `bd ready --claim [filters] --json` for the
rank-then-claim of (a) — add `--exclude-label gt:slot`. This changes only HOW the
candidate is chosen; it does NOT skip validation: the claimed bead still stamps
the (a) lease, runs the (b) gates, and on reject follows the SAME single-command
cooldown-release in (c). It still requires a distinct `BEADS_ACTOR`.

**2.2 Worktree:** `scripts/setup-agent-worktree.sh <name> --install --task "<bead title>"`,
then `cd .worktrees/<name>`. The `--install` flag runs the configured worktree
setup commands (dependency installs) — omitting it is a known `make check`
breaker, because a plain invocation creates the worktree but installs nothing.
Need a live stack? `make staging-up` **from the worktree** (never the primary).

**2.3 Build:** use the Superpowers discipline if available (brainstorm → plan →
TDD); otherwise write the failing test first. Commit and push frequently on
`agent/<name>`. **Open a draft PR on the first push — the draft is the visible
claim.** Bead IDs go in commit/PR bodies (`Closes <id>`), never in branch names
or commit subjects.

**Lease heartbeat + lost-claim check (§6.1, §5.2):** on each push, first re-read
your bead, then renew its lease. This is both the liveness signal AND your
self-heal against a wrongful reap:
1. **Re-read:** `bd show <id> --json`. If the assignee is no longer your
   `BEADS_ACTOR` (or the lease was cleared), your claim was reaped/reassigned out
   from under you — try to re-claim `bd update <id> --claim`: exit 0 = you have it
   back, keep going; **exit 1 = another agent now holds it, so STOP and report**
   (never double-work a bead someone else owns).
2. **Renew:** `bd update <id> --set-metadata lease_until=<now+TTL>`, computing the
   stamp as `date -u +%Y-%m-%dT%H:%M:%SZ` **plus your TTL** (default 4h) — always
   UTC, whole seconds, `...Z` (the exact form the reaper parses; avoid fractional
   seconds or numeric offsets). A renewed lease stays far beyond the reaper's grace
   margin, so a live agent is never evaluated as expired; a crashed agent stops
   renewing and its lease lapses, which frees the bead.

A long build with no pushes could let the lease lapse — renew explicitly in 2.6
before a long-running gate. *([HOST] a project may wire the renew into a post-push
hook; the cadence is the host's to bind.)*

**2.4 Docs travel with the PR:** resolve the bead's `docs:` tail and update
every stale doc in this same PR. Check the project-invariants section of
AGENTS.md (if the project defines one) before shipping.

**2.5 Defer = bead, immediately.** Anything you decide not to do now:

```bash
bd create "<imperative title>" -t task -p 2 --deps discovered-from:<id> \
  -d "<what, why, where (file/function)>; docs: <paths or none>"
```

A TODO comment, PR note, or mental note is NOT tracking.

**2.6 Verify yourself:** `make check` green on the branch HEAD, personally
watched — a subagent's or reviewer's claim doesn't count. Docker contention
(testcontainer timeouts, DockerException) is not a code defect:
`make docker-doctor` → `make tc-reap && make staging-prune` → re-run. Never
merge on a red gate. Never `docker system prune`.

**2.7 Review and merge:** `mmr review --pr <N> --sync --format json`.
- Check the diff is uncontaminated first: `gh pr diff <N> --name-only` shows
  only your intended surface.
- Surface channel auth failures to the user with recovery commands; never
  silently skip a channel.
- Round budget: round 1 fixes every real finding; round 2+ fixes only P0/P1
  and files beads for P2/P3. **Hard cap: 3 rounds — then complete the
  degraded-pass merge yourself**: file a bead per unresolved finding, map them
  in a PR comment, and merge. Do not stop for user sign-off at the cap.
- The one thing that still blocks the merge: a verified, still-reproducing
  real P0 — file it, keep the PR open, post the reproduction, notify the user,
  end the batch.
- If the project has a merge slot (`bd merge-slot check` reports one — the
  Beads setup step creates it), serialize EVERY merge. `bd merge-slot
  acquire` does NOT block: `--wait` only adds you to the waiters queue and
  exits non-zero while the slot is held, and a released slot never
  auto-promotes a waiter — so loop on `bd merge-slot acquire` itself until
  it succeeds, then re-verify ownership with `bd merge-slot check --json`
  before merging. Merge, then `bd merge-slot release` — release even if the
  merge fails, or the slot stays held and blocks every other agent. The slot needs
  a holder identity unique among agents: generate ONE value (e.g. a UUID)
  and reuse that SAME value for acquire → merge → release — run them as a
  single scripted block with a release trap where possible. A fresh
  per-command identity (like `$$` evaluated in separate shell calls)
  acquires under one holder and tries to release under another, stranding
  the slot for everyone. Scope any `BEADS_ACTOR` override to the slot
  commands and restore your stable claim actor before the next claim.
- If the staging component is installed **and** you brought a stack up this bead
  (`make staging-up`), tear it down FIRST from **inside the worktree** (there
  `make staging-down` targets your per-worktree stack). Skip it when staging was
  never installed or you never ran `staging-up` — `staging-down` exits non-zero
  then and must not block the merge. Never run it from the primary: it refuses
  there (from the primary it would select the shared QA stack and `down -v` its
  volumes).
- Merge: `gh pr merge <N> --squash --delete-branch`. Then from the primary:
  `make main-sync && make prune-merged` — `prune-merged` also reclaims any
  leftover worktree staging stack automatically (no separate `staging-down`
  needed post-merge, and running it from the primary would be wrong anyway).

**2.8 Close out** (from the primary): `bd close <id>` — only now, with the
merge verified. Noticed a repo-file fix after merging? Micro follow-up PR;
never edit the primary checkout directly.

## Step 3 — Batch report (required slots — answer each, say "none" out loud)

```
Beads:              <id> -> PR #<n> -> merged | parked (why) | skipped (why: e.g. claim lost to <actor>) | not started (why: e.g. queue drained after <k> of N)
Docs updated in-PR: <paths - or "none needed: <why>">
Beads filed (open): <id - one-line title - or none>
Stale claims:       <id - assignee - last activity - or "none noticed">
```

Before reporting, make the batch durable and refresh the restore net. Every step
is BEST-EFFORT — none may abort the report (a purely local Beads DB has no Dolt
remote; a `bd backup` target may be absent):

1. **Push the beads off-machine when a Dolt remote is configured — this is the
   real durability:** `bd dolt commit`, then `bd dolt push` ONLY if the project
   has a Dolt remote (a purely local Beads DB has none — skip the push; its local
   Dolt DB plus the committed JSONL export is its durability). Note a push failure
   for a *configured* remote in your report, but never abort the batch over it.
2. `make beads-snapshot` — refresh the `.beads/issues.jsonl` restore copy and
   sync any configured `bd backup` full-history copy.
`.beads/issues.jsonl` (refreshed by step 2) is a LOCAL, regenerable restore copy
— `bd export` recreates it from the DB. Durability is layered: step 1's Dolt
remote is the OFF-MACHINE copy (survives a lost machine); step 2's `bd backup`
(default target `$HOME/.beads-backups`, same machine) survives checkout deletion
or a reset but NOT machine loss unless you point it at a remote (DoltHub/S3); the
JSONL copy is neither — commit it through your project's normal beads-commit flow.
Do NOT force a direct commit onto a protected base branch or push one outside the
PR flow.

One batch-end pass covers every bead closed above.

If the batch ran long and `launchpad` is installed: `launchpad notify "<summary>"`.

## Red flags — stop if you're about to…

| Temptation | Reality |
|---|---|
| Commit or edit in the primary checkout | Work happens in `.worktrees/` only |
| Start bead k+1 before bead k's PR merges | One open PR per agent, strictly sequential |
| Skip the draft PR "until it's ready" | The draft IS the claim other agents see |
| End the turn after the draft PR with "next steps" | #1 observed agent failure — finish the loop |
| Leave a TODO/FIXME comment | That work is a bead, filed now |
| Merge with a red `make check` or Docker gate | Fix or file; never merge red |
| Chase a clean review past round 3 | Degraded-pass self-merge is the documented path |
| Leave a staging stack you started running | `make staging-down` from the worktree before merging (only if you ran `staging-up`; never from the primary — it refuses there, and `prune-merged` reclaims it too) |
| `--no-verify`, plain `--force`, merge commits | Forbidden; `--force-with-lease` after rebase only |
| Close the bead when the PR opens | Close only after MERGED + verified |
| Prose summary instead of the Step 3 slots | The slots are the report format |
| Pick N beads at batch start and work the list | The queue moves under you — select ONE bead at claim time, every time |
| Claim by setting the status field | Not atomic — a concurrent claimant goes undetected; `bd update <id> --claim` is the claim |
| Claim without a per-agent `BEADS_ACTOR` | Same-actor claims are idempotent — two agents sharing the default identity both "own" the bead |
| Retry a lost claim | Normal traffic at high parallelism — take the next candidate |
| Validate a bead before claiming it | Claim first — validation reads shared state; holding the claim hides the bead from peers while you decide |
| Release a rejected bead straight to `--status open` | Persistent dup/conflict → the fleet re-claims/re-rejects it forever; cooldown-release `bd update <id> --assignee "" --defer +1h` instead |
| Pre-filter the queue to your capability slice | Rank the WHOLE queue; capability fit is a within-tier tie-break only — an out-of-slice P0 beats an in-slice P2 |
| Reap/release another agent's stranded bead by hand | Surface it in the reaper report; releasing a claim is an `--apply`/operator decision |
| Bootstrap/reset a populated `.beads` DB | Wipes unpushed beads — fresh clones only; push first (`bd dolt commit && bd dolt push`) |
