---
name: multi-agent-coordination
description: >-
  Upstream Beads primitives for coordinating parallel agents — bd merge-slot for serialized merge resolution and bd gate
  for async coordination
topics:
  - beads
  - multi-agent
  - worktrees
  - merge-conflicts
  - coordination
  - parallel-execution
volatility: evolving
last-reviewed: 2026-07-11
version-pin: null
sources:
  - url: https://github.com/gastownhall/beads
    hash: sha256:23168e15ff7d87da33261f6257b5113192bf600ee6d80bb15688d99de1c80194
    retrieved: 2026-06-13
---

# Multi-Agent Coordination (Beads Primitives)

## Summary

When multiple agents work in parallel worktrees and converge on `main`, two upstream Beads primitives prevent the most common coordination failures: `bd merge-slot` serializes the rebase-and-push race so two agents finishing at once don't clobber each other, and `bd gate` lets a blocked task wait on an arbitrary asynchronous event (CI green, peer review, external approval). Both are optional — scaffold's multi-agent flows work without them — but they meaningfully reduce coordination cost in active parallel workloads.

## Deep Guidance

The two primitives below are the load-bearing Deep Guidance for this entry. The per-command sections explain when to acquire/release each, the failure modes, and the asynchronous coordination patterns they support. Treat the rest of this document (from this heading to EOF) as the section the assembly engine injects.

## `bd merge-slot` — serialized merge resolution

**Problem:** Two agents finish in-flight tasks at roughly the same time. Both rebase on `origin/main` and push. The second agent's push races with the first agent's merge — either gets `non-fast-forward` (retry) or merges a stale base (silent conflict).

**Solution:** Acquire the project's merge slot before rebasing/pushing. Release it after the PR merges. There is **one** merge slot per project (stored as a bead with ID `<prefix>-merge-slot`); the slot uses `status=in_progress` + `metadata.holder` to track the current holder, and a priority-ordered `metadata.waiters` queue.

### Commands

```bash
# First-time setup (once per project — usually done at bd init time):
bd merge-slot create

# Before rebasing your feature branch on main:
bd merge-slot acquire --wait
# Without --wait, acquire FAILS immediately if the slot is held. With --wait it
# adds you to the waiters queue and blocks until the slot frees. Holder defaults
# to $BEADS_ACTOR; pass --holder <name> to override.

# Now safe to rebase and push:
git fetch origin && git rebase origin/main
git push -u origin HEAD

# After your PR merges (or if you abandon the work):
bd merge-slot release
# --holder is optional (defaults to $BEADS_ACTOR) and is used for verification
# that you're releasing your own hold, not someone else's.

# To inspect current holder:
bd merge-slot check
```

### When to use

Use `bd merge-slot` in multi-agent flows (3+ agents, OR projects where a merge conflict requires careful manual resolution). Skip it for single-agent or two-agent workflows where collisions are rare and `git push` retries are acceptable.

### Failure modes

- **Stale slot** (agent crashes between acquire and release): `bd merge-slot check` reports the current holder. Manual recovery is `bd update <prefix>-merge-slot --status open` to clear the holder field (do this with care — verify the original holder is truly gone first).
- **Slot held by yourself in a different worktree**: the `--holder` field is checked on release, so multiple worktrees with the same `$BEADS_ACTOR` cannot interfere. Different actors queue behind each other.

## `bd gate` — async coordination gates

**Problem:** Agent A's task can't start until something happens (a PR merges, a workflow completes, a human reviews). Without a gate, Agent A either polls (wasteful) or proceeds anyway and discovers the missing dependency the hard way.

**Solution:** Create a gate issue that blocks the dependent task. The gate is itself a Beads issue with an auto-generated ID. Resolving the gate unblocks the task.

Gate types:
- `human` (default) — Requires a manual `bd gate resolve <gate-id>`.
- `timer` — Auto-resolves after `--timeout` (e.g., `--timeout=2h`).
- `gh:run` — Waits for a GitHub Actions run; `--await-id=<run-id>`.
- `gh:pr` — Waits for a PR merge; `--await-id=<pr-number>`.

### Commands

```bash
# When you discover that bd-xyz is blocked until something happens, create a gate.
# The gate has an auto-generated ID; capture it via --json:
GATE_ID=$(bd gate create \
  --blocks bd-xyz \
  --reason "Waiting for auth-middleware-v2 PR to merge" \
  --type human \
  --json | jq -r '.id')

# Common variants:
# - gh:pr gate (auto-resolves on PR merge)
bd gate create --type=gh:pr --blocks bd-xyz --await-id=123 --reason "Blocked on PR #123"

# - timer gate
bd gate create --type=timer --blocks bd-xyz --timeout=2h --reason "Recheck in 2h"

# When the underlying condition is met, resolve manually (human gates) or rely on
# the type-specific watcher (gh:pr, gh:run, timer):
bd gate resolve "$GATE_ID" --reason "PR #123 merged, middleware live"

# Check what's gated:
bd gate list           # open gates only
bd gate list --all     # include closed
bd gate check          # evaluate all open gates (resolves any whose condition is met)
```

### When to use

Use gates for one-off async dependencies — "this task can't proceed until X happens, and X is identifiable as a run ID, a PR number, a timer, or a human decision." Skip them for plain "this task depends on that task" cases, which are covered by `bd dep add --blocks` (a dependency, not a gate).

### Pattern: multiple downstream tasks share one underlying blocker

If five downstream tasks all wait on the same PR merging, create five gh:pr gates (one per blocked issue) all pointing at the same `--await-id=<pr-number>`:

```bash
for ID in bd-aaa bd-bbb bd-ccc bd-ddd bd-eee; do
  bd gate create --type=gh:pr --blocks "$ID" --await-id=123 --reason "Blocked on PR #123"
done
```

`bd gate check` (or the automatic watcher) resolves all five at once when the PR merges.

> The `bd gate add-waiter` subcommand is a different mechanism — it registers an agent's *wake address* (e.g., "my-project/workers/agent-1") to receive notifications. It's not for chaining issues to gates; use `--blocks` on `bd gate create` for that.

## Draft PRs and One-PR-Per-Agent — the Visible-Claim Layer

`bd ready --claim` (or `bd update <id> --status in_progress`) is the
authoritative, atomic claim, but it's only visible to agents that query
Beads. `gh pr list --state open` is the *other* live registry other agents
(and humans) check first — see the work-beads skill's orient step
(`bd ready && bd stats; gh pr list --state open; git worktree list`). A bead
can sit `in_progress` in Beads for a while before any code exists, so the
loop opens a **draft PR on the first push**, not once the change is
polished: the draft is what a second agent scanning `gh pr list` sees before
independently starting the same work, and it's the same signal the
project's duplicate-work preflight scan (see
[worktree-management](./worktree-management.md)) matches keywords against.
Treat "claimed in Beads" and "visible via an open/draft PR" as two halves of
one claim, not two separate mechanisms — the first stops a second Beads
claim on the same bead, the second stops a second agent from building the
same thing without ever having checked Beads at all.

This composes with the strict **one open PR per agent** rule: an agent works
its queue sequentially — claim -> worktree -> build (draft PR on first
push) -> verify -> review -> merge -> close — and does not start the next
bead until the current one's PR has merged. Ending a turn after opening a
draft PR with a "next steps" list instead of finishing through merge and
bead-close is the single most common failure mode observed in this loop.
Keeping it to one open PR per agent is also what keeps `bd merge-slot`
(above) tractable once a project reaches 3+ concurrent agents — the slot
only ever has to serialize one pending merge per agent at a time, not an
unbounded backlog each agent accumulated by moving on before finishing.

## Composition

Both primitives compose with the rest of the multi-agent flow:

- `bd ready --claim` picks a non-gated, non-blocked task.
- `bd preflight` validates task readiness before PR (already in scaffold's start prompts).
- `bd merge-slot acquire` serializes the merge.
- `bd gate resolve` unblocks downstream waiters when your work lands.

For the canonical sequence in scaffold's multi-agent prompts, see `content/pipeline/build/multi-agent-start.md`.
