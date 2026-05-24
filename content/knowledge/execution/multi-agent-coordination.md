---
name: multi-agent-coordination
description: Upstream Beads primitives for coordinating parallel agents — bd merge-slot for serialized merge resolution and bd gate for async coordination
topics: [beads, multi-agent, worktrees, merge-conflicts, coordination, parallel-execution]
---

# Multi-Agent Coordination (Beads Primitives)

When multiple agents work in parallel worktrees and converge on `main`, two upstream Beads primitives prevent the most common coordination failures. Both are optional — scaffold's multi-agent flows work without them — but they meaningfully reduce coordination cost in active parallel workloads.

## `bd merge-slot` — serialized merge resolution

**Problem:** Two agents finish in-flight tasks at roughly the same time. Both rebase on `origin/main` and push. The second agent's push races with the first agent's merge — either gets `non-fast-forward` (retry) or merges a stale base (silent conflict).

**Solution:** Acquire an exclusive merge slot before rebasing/pushing. Release it after the PR merges or after a timeout.

### Commands

```bash
# Before rebasing your feature branch on main:
SLOT=$(bd merge-slot acquire --json | jq -r '.slot_id')
# If the call blocks (another agent holds the slot), wait — your acquire returns
# as soon as the slot frees.

# Now safe to rebase and push:
git fetch origin && git rebase origin/main
git push -u origin HEAD

# After your PR merges (or if you abandon the work):
bd merge-slot release "$SLOT"

# To inspect current holder:
bd merge-slot check
```

### When to use

Use `bd merge-slot` in multi-agent flows (3+ agents, OR projects where a merge conflict requires careful manual resolution). Skip it for single-agent or two-agent workflows where collisions are rare and `git push` retries are acceptable.

### Failure modes

- **Stale slot** (agent crashes between acquire and release): `bd merge-slot check` reports the holder + age; `bd merge-slot release --force <slot-id>` clears it. The slot has a built-in TTL (default 30 minutes) for safety.
- **Slot held by yourself in a different worktree**: not a deadlock — `acquire` is per-actor. If `$BEADS_ACTOR` differs, you'll queue behind your other worktree.

## `bd gate` — async coordination gates

**Problem:** Agent A's task can't start until Agent B's task lands. Without a gate, Agent A either polls (wasteful) or proceeds anyway and discovers the missing dependency the hard way.

**Solution:** Create a named gate. Dependent tasks declare they're waiting for it. When the underlying condition resolves, anyone can resolve the gate, unblocking all waiters at once.

### Commands

```bash
# When you discover a blocking dependency, create a gate for it:
bd gate create "auth-middleware-v2" \
  --description "Blocks downstream tasks until the new auth middleware lands and is verified"

# A downstream task adds itself as a waiter:
bd gate add-waiter "auth-middleware-v2" --task "$DOWNSTREAM_TASK_ID"

# When the gate's underlying condition is met (e.g., the blocking PR merges):
bd gate resolve "auth-middleware-v2" --reason "PR #123 merged, middleware live"

# Check what's gated:
bd gate list
bd gate show "auth-middleware-v2"
```

### When to use

Use gates when a *category* of work is blocked on a known thing landing, especially when multiple downstream tasks share the same dependency. Skip them for one-off "this task blocks that task" cases — `bd dep add --blocks` already covers those.

### Pattern: discovery → gate

If you're implementing a task and discover that downstream work depends on something not yet done, file the dependency as a gate (not just a discovered-from task):

```bash
bd gate create "user-model-finalization" \
  --description "Discovered during $CURRENT_TASK — downstream registration/login tasks depend on the user model shape."
```

Then `bd gate add-waiter` from each affected downstream issue. This communicates the blocker to all waiters atomically.

## Composition

Both primitives compose with the rest of the multi-agent flow:

- `bd ready --claim` picks a non-gated, non-blocked task.
- `bd preflight` validates task readiness before PR (already in scaffold's start prompts).
- `bd merge-slot acquire` serializes the merge.
- `bd gate resolve` unblocks downstream waiters when your work lands.

For the canonical sequence in scaffold's multi-agent prompts, see `content/pipeline/build/multi-agent-start.md`.
