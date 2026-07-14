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
  refresh view -> select ONE bead -> claim atomically (lost the claim?
  take the next candidate) -> worktree -> build (draft PR on first push)
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

**Identity (required before any claim):** claims key on the Beads actor, and
same-actor claims are idempotent — two agents sharing the default identity
(`git user.name`) can both "successfully" claim the SAME bead, silently
losing mutual exclusion. If `BEADS_ACTOR` is not already set to a per-agent
value (the multi-agent bootstrap prompts set one), pick a distinctive agent
name now (e.g. `agent-cobalt-fox`) and use it on every `bd` write this
session — `export BEADS_ACTOR=<name>` in each shell, or `--actor <name>` per
command. Unique across concurrent agents = mutual exclusion; stable within
your session = your own resume path works. (Merge-slot commands are the one
exception — they use a separately minted holder value; see 2.7.)

**Stale-claim scan (surface, never steal):** a dead agent's bead stays
`in_progress` forever (bd has no claim lease/TTL yet). Cross-check
`bd list --status in_progress` against the open-PR list: in progress + no
open/draft PR + no recent activity = possibly stranded. Note it for the
batch report — do NOT reclaim it; releasing another agent's claim
(`bd update <id> --status open --assignee ""`) is an operator decision.

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

Ranking, strict order: (1) priority P0 > P1 > P2 > P3; (2) beads labeled with a
`critical_labels` entry from `.scaffold/agent-ops.yaml`, if any; (3) work that
unblocks other beads; (4) fit to your strengths.

Hard exclusions — never select:
- an infrastructure bead: the project's `<prefix>-merge-slot` bead (or
  anything labeled `gt:slot`) is the merge LOCK, not work — it sits open at
  P0 whenever the slot is free and an unfiltered claim will happily "claim"
  it, which holds the global merge lock and blocks every other agent
- a bead already `in_progress` under another agent, or covered by ANY open/draft PR.
  (`bd ready` can still list open beads carrying another agent's assignee —
  those refuse your claim; that is Step 2.1's fallback, not an error.)
- a bead conflicting with an open PR's surface (same module, same migration
  sequence, same shared code — see docs/git-workflow.md conflict rules)

Mandatory duplicate-work scan for the top candidate:
`scripts/setup-agent-worktree.sh --preflight-only --task "<bead title>"`

Queue drained (or no candidate survives the exclusions) before the budget is
spent? The batch ends early — go to Step 3 and report
`queue drained after <k> of N`.

For explicit-ID invocations: topologically sort the listed IDs by dependency
(blockers first); stop and report if they form a cycle. Before claiming each
ID at its turn (Step 2.1), re-verify its blockers are all closed
(`bd show <id>`): an ID already claimed by another agent is skipped and
reported with its holder, and every listed ID that depends on a skipped or
still-open blocker is skipped too (report as `blocked by <id>`) — never
start downstream work whose prerequisite isn't done.

## Step 2 — Per-bead loop

**2.1 Claim (atomic, from the primary checkout):** claim exactly the bead you
selected: `bd update <id> --claim` — sets assignee + `in_progress` in one
atomic round-trip and fails (exit 1, `already claimed by <actor>`) if anyone
else holds it. **A lost claim is normal traffic at high parallelism, not an
error: return to Step 1 and take the next candidate.** Never claim by
editing the status field — it does not detect a concurrent claimant. Fast
path — only when ANY ready match inside a filter is acceptable and you are
not applying Step 1's ranking beyond priority (the normal case for a
materialized plan queue via `--has-metadata-key plan_task_id`; sometimes a
label scope): `bd ready --claim [filters] --json` selects and claims in one
call — add `--exclude-label gt:slot` unless the filter already excludes the
merge-slot bead (Step 1's first hard exclusion) — then run Step 1's
duplicate-work preflight for the claimed bead before building; if it reveals
live duplicate work, release (`bd update <id> --status open --assignee ""`)
and reselect. If the project has build observability (a `.scaffold/`
directory and the `scaffold` CLI), also
`scaffold observe event claim --task <id>` — feature-detect and skip silently.

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
| Reclaim another agent's stranded bead | Surface it in the report; releasing a claim is an operator decision |
| Bootstrap/reset a populated `.beads` DB | Wipes unpushed beads — fresh clones only; push first (`bd dolt commit && bd dolt push`) |
