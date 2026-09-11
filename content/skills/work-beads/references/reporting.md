## Step 3 — Batch report (required slots — answer each, say "none" out loud)

```
Beads:              <id> -> PR #<n> -> merged | enqueued (PR #<n> awaiting queue) | parked (why) | skipped (why: e.g. claim lost to <actor>) | not started (why: e.g. queue drained after <k> of N)
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
| Start bead k+1 before bead k reaches its delivery finish line | With the queue, verify enqueue acceptance before moving on; without it, verify merge first |
| Skip the draft PR "until it's ready" | The draft IS the claim other agents see |
| End the turn after the draft PR with "next steps" | #1 observed agent failure — finish the loop |
| Leave work accepted for follow-up under 2.5 as a TODO/FIXME comment | That work is a bead, filed now |
| File a bead because a reviewer called something P2/P3 | Severity is not task authority; apply all five gates in 2.7 |
| Merge with a red `make check` or a required defect | Fix or block; a future bead cannot make the current PR safe |
| Chase a cosmetically clean review | Stop dispatching once every root cause has a disposition and no verified fix-now or block item remains; a real repaired blocker starts a fresh bounded cycle |
| Leave a staging stack you started running | `make staging-down` from the worktree before merging (only if you ran `staging-up`; never from the primary — it refuses there, and `prune-merged` reclaims it too) |
| `--no-verify`, plain `--force`, merge commits | Forbidden; `--force-with-lease` after rebase only |
| Close the bead when the PR opens | Close only after MERGED + verified |
| Prose summary instead of the Step 3 slots | The slots are the report format |
| Pick N beads at batch start and work the list | The queue moves under you — select ONE bead at claim time, every time |
| Claim by setting the status field | Not atomic — a concurrent claimant goes undetected; `bd update <id> --claim` is the claim |
| Claim without a per-agent `BEADS_ACTOR` | Same-actor claims are idempotent — two agents sharing the default identity both "own" the bead |
| Retry a lost claim | Normal traffic at high parallelism — take the next candidate |
| Validate a bead before claiming it | Claim first — validation reads shared state; holding the claim hides the bead from peers while you decide |
| Release a rejected bead straight to `--status open` | Persistent dup/conflict → the fleet re-claims/re-rejects it forever; cooldown-release with an ABSOLUTE UTC `--defer "$until_ts"` instead (see 2.1c) |
| Skip or park a bead because its `Owner` is another agent | `Owner` is the immutable CREATOR, not an assignee — it names a departed agent forever. Only `Assignee` + `in_progress` holds a bead (Step 1) |
| Honor an existing park note without re-resolving what it cites | Park notes go stale silently; a "recheck: still parked" line you did not verify is the ratchet that freezes a backlog (2.1b) |
| `bd update <id> --notes "..."` on an existing bead | `--notes` REPLACES — it can destroy a bead's whole investigation history in one command. Use `bd note` / `--append-notes` (2.1c) |
| Defer with a reason like "not autonomously shippable this session" | That is your capacity, not the bead's state — unfalsifiable, so it can never be cleared. Name a PR/bead/branch/command and the re-check condition (2.1c) |
| Mass-defer beads to empty `bd ready` | An empty queue is not the goal. Deferring more beads than you worked is a stop-and-report signal, not a session outcome (2.1c) |
| Cooldown-release the same bead a third time | 2+ prior cooldown notes for one cause = it will not clear itself — `Wait:` note + human triage instead of an hourly claim→reject cycle (2.1c) |
| Pre-filter the queue to your capability slice | Rank the WHOLE queue; capability fit is a within-tier tie-break only — an out-of-slice P0 beats an in-slice P2 |
| Reap/release another agent's stranded bead by hand | Surface it in the reaper report; releasing a claim is an `--apply`/operator decision |
| Bootstrap/reset a populated `.beads` DB | Wipes unpushed beads — fresh clones only; push first (`bd dolt commit && bd dolt push`) |
