---
name: work-beads
description: Use for /work-beads, a requested Beads backlog batch, or implementation of named bead IDs.
---

<!-- lean:start -->
# Work Beads

Work the requested Beads queue with the ship loop. Preserve the atomic claim,
lease, verification, review, and queue contracts across agents.

**The loop contract:**

```
set identity once, then repeat up to N times (one bead in flight per agent):
  refresh view -> select ONE bead -> claim atomically, then validate (lost the
  claim? next candidate; dup/conflict? cooldown-release + next) -> worktree
  -> build (draft PR on first push; renew lease on each push)
  -> verify (make check-affected) -> review (mmr, max 3 rounds per cycle)
  -> enqueue (make mq-enqueue) and move on -> daemon lands + closes the bead
batch end (budget spent, queue drained, or an external stop): report in the slots
```

**The agent's finish line is a green gate + passing review + the PR ENQUEUED** —
the merge-queue daemon batches, lands, and closes the bead; do not wait for the
merge or `bd close` an enqueued bead yourself. (No merge queue installed? Land
via the serialized merge slot instead — same finish line, you just do the
merge.) Standing authorization: run the whole loop without asking permission. Do
not end your turn after opening a draft PR with a list of "next steps" — that is
the #1 observed agent failure. Stop when the user asks to stop. Otherwise, the
only mid-loop stops are a true external dependency, missing credentials or
authority, a destructive action, a material product decision outside the
acceptance criteria, or a demonstrated technical plateau after safe approaches
are exhausted. An unresolved required-safeguard defect is not a plateau; an
in-scope blocker starts or continues remediation.

Each review cycle has at most three rounds. A genuine round-three in-scope or
required-safeguard blocker starts a new cycle only after a concrete repair,
focused regression proof, and the required gate; review the new exact head from
round one. Duplicate, stale, hypothetical, speculative, cosmetic, and already-
dispositioned findings cannot restart review. No owner approval is required for
in-scope remediation. Merge only when the final exact head meets the channel
floor, all required gates pass, every finding is dispositioned, and no verified
blocker remains.

Invocation: `/work-beads` (1 bead) · `/work-beads N` (up to N beads, selected
**one at a time at claim time** — N is a budget, not a reservation; never
pre-pick a list) · `/work-beads N <label>` (same, scoped to a label) ·
`/work-beads <id> [<id>...]` (explicit IDs, worked in dependency order).
For the detailed phase procedures, load the router in
`.agents/skills/work-beads/SKILL.md` when reading this as an AGENTS.md or Cursor rule.
<!-- lean:end -->

## Load the current phase

Read the procedure for the phase you are entering. Do not preload later phases
or repeat completed orientation. The required gates inside each phase still apply.

| Phase | Procedure |
|---|---|
| Start a batch or select the next bead | [Queue and orientation](references/queue.md): identity, readiness, ownership, and ranking. |
| Claim and validate the selected bead | [Claims](references/claims.md): atomic claim, duplicate/conflict checks, and safe cooldown/recovery. |
| Create the worktree through verification, review, and enqueue/merge | [Shipping](references/shipping.md): required TDD/checks, bounded review, merge queue and fallback, closeout. |
| End a batch or diagnose a workflow mistake | [Reporting and safeguards](references/reporting.md): durable snapshot, required report slots, and recovery constraints. |

A phase transition is a reading boundary, not a permission stop. Continue the
already-authorized loop; do not alter repository-specific checks, approval
boundaries, or the delivery finish line.
