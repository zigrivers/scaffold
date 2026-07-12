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
