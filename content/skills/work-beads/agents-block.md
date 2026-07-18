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
  -> verify (make check-affected) -> review (mmr, 3-round cap)
  -> enqueue (make mq-enqueue) and move on -> daemon lands + closes the bead
batch end (budget spent, queue drained, or P0/blocker): report in the slots
```

**The agent's finish line is a green gate + passing review + the PR ENQUEUED** —
the merge-queue daemon batches, lands, and closes the bead; do not wait for the
merge or `bd close` an enqueued bead yourself. (No merge queue installed? Land
via the serialized merge slot instead — same finish line, you just do the
merge.) Standing authorization: run the whole loop without asking permission. Do
not end your turn after opening a draft PR with a list of "next steps" — that is
the #1 observed agent failure. The only mid-loop stops: a verified,
still-reproducing P0, or a blocker you can name.

Invocation: `/work-beads` (1 bead) · `/work-beads N` (up to N beads, selected
**one at a time at claim time** — N is a budget, not a reservation; never
pre-pick a list) · `/work-beads N <label>` (same, scoped to a label) ·
`/work-beads <id> [<id>...]` (explicit IDs, worked in dependency order).
