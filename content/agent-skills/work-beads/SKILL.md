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
for each selected bead (strictly sequential, one open PR per agent):
  claim -> worktree -> build (draft PR on first push) -> verify (make check)
  -> review (mmr, 3-round cap) -> squash-merge -> sync + prune -> close bead
batch end: report in the required slots
```

**The bead is not done until the PR is MERGED and the bead is CLOSED.**
Standing authorization: run the whole loop without asking permission. Do not
end your turn after opening a draft PR with a list of "next steps" — that is
the #1 observed agent failure. The only mid-loop stops: a verified,
still-reproducing P0, or a blocker you can name.

Invocation: `/work-beads` (1 bead) · `/work-beads N` · `/work-beads N <label>`
· `/work-beads <id> [<id>...]` (explicit IDs, worked in dependency order).
<!-- lean:end -->

## Step 0 — Orient (read-only, from the primary checkout)

The primary checkout is the first entry of `git worktree list`. Run:

```bash
bd ready && bd stats
gh pr list --state open        # open + draft PRs = live registry of what others build
git worktree list
make doctor                    # wedged home base? make doctor-fix (unattended-safe)
```

Version gate: `bd version` must be **≥ 1.1.0** (the `bd dolt` durability
commands below require it). Older? Stop and report: upgrade with
`brew upgrade beads` or the project's equivalent — never work around the gate.

**Database safety (binding for every step):** never run `bd bootstrap`,
destructive `bd init` (`--reinit-local`/`--discard-remote`; legacy `--force`),
or any reset against a populated `.beads/` — bootstrap replaces local state
with the often-stale remote and silently drops unpushed beads (fresh clones
only). Before any deliberate reset, and before deleting a checkout with local
beads: `bd stats && bd dolt commit && bd dolt push`, then `make beads-snapshot`.
Drive the database only through `bd` subcommands — never a standalone `dolt`
CLI. Full runbook: docs/beads-workflow.md ("Durability & the bootstrap trap").

If `bd` or the agent-ops scripts are missing, stop and instruct:
`scaffold agent-ops install` (scripts) / see docs/beads-workflow.md (tracker).

## Step 1 — Select beads

Ranking, strict order: (1) priority P0 > P1 > P2 > P3; (2) beads labeled with a
`critical_labels` entry from `.scaffold/agent-ops.yaml`, if any; (3) work that
unblocks other beads; (4) fit to your strengths.

Hard exclusions — never select:
- a bead already `in_progress` under another agent, or covered by ANY open/draft PR
- a bead conflicting with an open PR's surface (same module, same migration
  sequence, same shared code — see docs/git-workflow.md conflict rules)

Mandatory duplicate-work scan per candidate:
`scripts/setup-agent-worktree.sh --preflight-only --task "<bead title>"`

For explicit-ID invocations: topologically sort the listed IDs by dependency
(blockers first); stop and report if they form a cycle.

## Step 2 — Per-bead loop

**2.1 Claim** (from the primary checkout): `bd ready --claim` scoped with
`--has-metadata-key plan_task_id` when a materialized plan exists; otherwise
`bd update <id> --status in_progress`. If the project has build observability
(a `.scaffold/` directory and the `scaffold` CLI), also
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
- 3+ agents active? Serialize the merge: `bd merge-slot acquire --wait` → merge
  → `bd merge-slot release` (if the project's Beads has merge-slots) — release
  even if the merge fails, or the slot stays held and blocks every other agent.
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
Beads:              <id> -> PR #<n> -> merged | parked (why) | skipped (why) | not started (why)
Docs updated in-PR: <paths - or "none needed: <why>">
Beads filed (open): <id - one-line title - or none>
```

Before reporting, refresh the durability net (feature-detect; skip silently
when the target is absent): `make beads-snapshot`, then COMMIT the refreshed
restore copy so it is durable — `git add .beads/issues.jsonl && git commit -m
"chore(beads): refresh restore snapshot" || true` (a no-op when nothing
changed). Uncommitted, the copy is stranded locally and a later reset destroys
it. One batch-end snapshot covers every bead closed above.

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
| Bootstrap/reset a populated `.beads` DB | Wipes unpushed beads — fresh clones only; push first (`bd dolt commit && bd dolt push`) |
