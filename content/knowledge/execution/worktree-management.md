---
name: worktree-management
description: Git worktree patterns for parallel multi-agent execution
topics:
  - git
  - worktrees
  - multi-agent
  - branching
volatility: evolving
last-reviewed: 2026-07-11
version-pin: null
sources:
  - url: https://git-scm.com/docs/git-worktree
    hash: sha256:bd97d0b9035900227e54d7986fb3711947d0369daf95e7c9a2563b209459e44b
    retrieved: 2026-06-13
---

# Worktree Management

Expert knowledge for managing git worktrees to enable parallel multi-agent execution. Covers setup, branching conventions, inter-task cleanup, and safe teardown procedures.

## Summary

### Setup

Use `scripts/setup-agent-worktree.sh <agent-name> --install --bead <id>` to create a worktree at `.worktrees/<agent-name>/` (project-local). Each agent gets its own isolated working directory on branch `agent/<name>/<bead-id>` — the bead id as the branch's final segment turns `git branch -r` into a roster of in-flight beads (omit `--bead` for non-bead work and the branch is `agent/<name>`). The `--install` flag runs the project's configured worktree setup commands (dependency installs); a plain invocation creates the worktree but installs nothing.

### Branching Conventions

- Each agent commits its task work **directly** on its own `agent/<name>/<bead-id>` branch — no additional per-task feature branches. The bead ID is also appended to commit subjects and the PR title as a trailing `(<bead-id>)`; the PR body's `Closes <id>` stays the canonical machine mapping
- Keep the branch current by rebasing it onto `origin/main` while the bead is in flight — never branch from local `main` (it may be stale)
- Never run `git checkout main` inside a worktree — it will fail because `main` is checked out in the primary repo

### Cleanup

After all agents finish, remove worktrees and prune stale references. Delete merged feature branches in batch to keep the repository clean.

## Deep Guidance

### Setup — Extended

**Creating a worktree:**

```bash
# From the main repository
scripts/setup-agent-worktree.sh agent-1 --install --bead bd-a3f8

# This creates:
#   .worktrees/agent-1/          (working directory, project-local)
#   Branch: agent/agent-1/bd-a3f8  (this bead's branch — task work commits here)
```

**What the setup script does:**
1. Creates a new worktree directory project-local under `.worktrees/`
2. Creates the agent's `agent/<name>/<bead-id>` branch tracking `origin/main` (bare `agent/<name>` without `--bead`)
3. Sets up the working directory with a clean state
4. Runs the project's configured worktree setup commands (dependency installs) **only when passed `--install`** — a plain invocation installs nothing

**Multiple agents:**

```bash
scripts/setup-agent-worktree.sh agent-1 --install
scripts/setup-agent-worktree.sh agent-2 --install
scripts/setup-agent-worktree.sh agent-3 --install
```

Each agent has a completely isolated working directory. They share the same `.git` object store but have separate working trees, index files, and HEAD pointers.

### The `agent/<name>/<bead-id>` Branch

Each agent's worktree carries ONE live branch at a time —
`agent/<name>/<bead-id>` — and the agent commits that bead's work to it
directly. The branch is retired when the bead ships (squash-merge with
`--delete-branch`, then `make prune-merged`), and the next bead starts a fresh
branch via `setup-agent-worktree.sh … --bead <next-id>`. There are no per-task
feature branches layered on top of it:

- The worktree is created on `agent/<name>/<bead-id>`, which tracks
  `origin/main`
- Each bead's work is committed straight onto that branch; one PR per agent at
  a time carries that work to `main`
- The bead/task ID ends the branch name and is appended to commit subjects and
  the PR title as a trailing `(<bead-id>)`; the PR body's `Closes <id>` is the
  canonical machine mapping

**Why one live branch per worktree (not a pile of task branches):**
- A worktree requires a branch that isn't checked out elsewhere;
  `agent/<name>/<bead-id>` is that branch and it never collides with `main`
  (checked out in the primary)
- Committing directly on it keeps the model simple — no extra branch
  bookkeeping, nothing to "switch back" to mid-bead; the squash-merge's
  `--delete-branch` plus `make prune-merged` retire the branch and worktree
  when the bead finishes, and the next bead gets a fresh
  `setup-agent-worktree.sh … --bead <next-id>`

### Branching — Extended

**While a bead is in flight, keep its branch current:**

```bash
# Inside the agent's worktree, whenever main advances
git fetch origin
git rebase origin/main   # bring the branch up to date; do NOT create a new branch
```

**Critical rules:**
- Rebase the workspace branch onto `origin/main` whenever `main` advances —
  never branch from local `main` (it may be stale)
- Commit task work directly on the workspace branch; do **not** create extra
  per-task branches. The bead ID is appended to the commit subject (`… (bd-42)`)
  and the PR body carries `Closes bd-42` (the canonical machine mapping)

**Never run `git checkout main` in a worktree:**
- The `main` branch is checked out in the primary repo
- Git does not allow the same branch to be checked out in multiple worktrees
- This command will fail with an error; if you need main's content, use `origin/main`

### Between Tasks

After a bead's PR has merged (local quality gates green + `mmr review` passed —
server CI deferred until launch by default, day-one for merge-throughput
projects), the bead's branch is already retired — the
squash-merge ran with `--delete-branch`. From the PRIMARY checkout, reclaim the
finished worktree and start the next bead on a fresh branch:

```bash
# From the primary checkout: sync main and prune merged worktrees/branches
make main-sync && make prune-merged

# Start the next bead with a fresh worktree branch carrying its id
scripts/setup-agent-worktree.sh <name> --install --bead <next-id>
cd .worktrees/<name>
```

**Why this matters:**
- `main-sync` + `prune-merged` pick up other agents' merged work and remove
  the retired branch/worktree (squash-aware detection)
- A fresh `--bead <next-id>` branch keeps the open-branch list an accurate
  roster of in-flight beads — never reuse the previous bead's branch
- `--install` reinstalls dependencies, catching changes merged by other agents

### Rebase Strategy

Before creating a PR, rebase your feature branch onto the latest `origin/main`:

```bash
git fetch origin
git rebase origin/main
```

**Why rebase instead of merge:**
- Produces a linear history on the feature branch
- Makes the PR diff cleaner (only your changes, no merge commits)
- Squash-merge to main produces a single clean commit

**If rebase conflicts arise:**
1. Read the conflict carefully — understand which agent's changes conflict with yours
2. If the conflict is in files you modified, resolve it preserving both changes where possible
3. If the conflict is in files you didn't modify, investigate — you may have an undetected dependency on another task
4. After resolving, run the full test suite to verify nothing broke
5. If the conflict is too complex, ask for help rather than guessing

### Conflict Resolution

**Common conflict scenarios in multi-agent work:**

| Scenario | Resolution |
|----------|------------|
| Two agents add to the same file (e.g., new exports) | Merge both additions |
| Two agents modify the same function | Deeper analysis needed — may indicate a missing dependency |
| Schema migration conflicts | Renumber the later migration |
| Lock file conflicts | Delete lock file, reinstall, commit new lock file |

### Cleanup — Extended

**Removing a single worktree:**

```bash
# From the main repository (not from inside the worktree)
git worktree remove .worktrees/agent-1
```

**Pruning stale worktree references:**

```bash
git worktree prune
```

Run this after removing worktrees or if a worktree directory was deleted manually.

**Batch cleanup of merged feature branches:**

Prefer `scripts/cleanup-merged-branches.sh` (`make prune-merged`) — see
"Squash-aware pruning with triage" below, which correctly detects
squash-merged branches (ancestry-only detection misses those). For a manual
ancestry-only sweep across all local task branches:

```bash
git fetch origin --prune
git branch --merged origin/main | grep -vE '^\*|main|agent/' | xargs -r git branch -d
```

This deletes all local branches merged to `origin/main`, excluding the
current branch, `main`, and the worktree `agent/*` branches.
Safe because `--merged` ensures only fully-merged branches are deleted, and
`-d` (not `-D`) refuses to delete unmerged branches.

**Cleanup of `agent/*` branches:**

Prefer `scripts/teardown-agent-worktree.sh <path>`, which harvests the ledger,
removes the worktree, and deletes its `agent/*` branch under guards (it
never deletes the primary's checked-out branch or the default branch). For a
manual sweep after all agents are done and their worktrees removed:

```bash
git branch --list 'agent/*' | xargs -r git branch -D
```

Use `-D` here because a squash-merged `agent/<name>` tip is never an ancestor of
`main`, so `-d` would refuse it even though the work is safely on `main`.

### Doctor, Pruning, and Preflight — Keeping the Fleet Honest

Three agent-ops scripts (installed by `scaffold agent-ops install
--component git`) keep a multi-worktree fleet from silently drifting into a
bad state.

**The primary-checkout invariant.** The primary checkout — the first entry
in `git worktree list` — must always stay on `main`, never a feature branch,
never detached; agents work in `.worktrees/`, never commit in the primary.
`scripts/doctor.sh` (`make doctor`) is a read-only diagnostic covering five
checks: `on-main` (primary is on `main`, not detached or on a feature
branch), `main-location` (`main` isn't "hostage" — checked out in some
non-primary worktree instead), `no-conflict` (no in-progress merge/rebase or
unmerged paths in the primary), `identity` (no per-agent git identity leaked
into the shared `.git/config` — it belongs in per-worktree config only), and
`main-sync` (local `main` matches `origin/main`). `scripts/doctor.sh --fix`
(`make doctor-fix`) performs only non-destructive repairs — clearing a
leaked shared identity, and, if `main` is hostage, freeing it by rebranding
the hostage worktree onto `agent/<name>` (or detaching it if the rebrand
fails), then restoring/fast-forwarding the primary via `main-sync.sh`. It
refuses every ambiguous case outright: primary on a feature branch, an
unresolved conflict/rebase, a diverged or ahead-of-origin `main`,
uncommitted tracked changes in the primary, or a detached primary whose HEAD
carries commits not on `origin/main` — all of those need a human decision,
not an automated repair.

**Squash-aware pruning with triage.** `scripts/cleanup-merged-branches.sh`
(`make prune-merged`) detects a merged branch two ways: commit ancestry
(`git merge-base --is-ancestor`) *and* a merged PR whose head branch name
**and** head SHA match the local branch tip. The second path is what catches
squash-merges — a squash-merged branch's commits are never ancestors of
`main`, so ancestry-only detection misses every one of them. The script
removes merged, clean worktrees (skipping dirty ones, worktrees younger than
5 minutes, and zero-commit branch worktrees unless `--include-zero-commit`),
deletes merged local branches, prunes stale worktree admin refs, and never
touches protected branches
(`main`/`master`/`trunk`/`develop`/`dev`/`release`/`staging`/`production`),
the current branch, or the primary checkout. It always ends with a
**Triage** section — unmerged branches with commits ahead of the base
(noting any open PR number), worktrees skipped for uncommitted changes, and
worktrees skipped as zero-commit — naming exactly what still needs a human
look instead of silently omitting it.

**Duplicate-work preflight scanning.** `scripts/setup-agent-worktree.sh
<name> --task "<description>"` runs an advisory duplicate-work scan before
creating the worktree (or standalone via `--preflight-only --task
"<description>"`, useful before even claiming a task). It extracts
lowercase keywords (>=3 chars, minus a Conventional-Commits stoplist) from
the task description and greps them against open + recently-merged PR
titles (`gh pr list`) and in-progress bead titles (`bd list --status
in_progress`, when `bd` is present). The scan is advisory only — it never
blocks worktree creation — but a match prints which keyword collided and the
commands to coordinate before building duplicate work.

### BEADS_ACTOR Environment Variable

When using Beads for task tracking, set `BEADS_ACTOR` per agent for attribution:

```bash
export BEADS_ACTOR="agent-1"
```

This ensures that task claims, completions, and other Beads operations are attributed to the correct agent. Set it in the agent's shell environment before starting work.

Tip: from inside a worktree, `bd -C <primary-checkout-path> …` (bd ≥ 1.0.4)
targets the primary's database without `cd` — useful in scripts that must not
change directory.

> Older Beads versions (<v1.0.0) used `BD_ACTOR`. It's still accepted as a deprecated alias — if you see it in legacy scripts, rename when you next edit.

### Listing Active Worktrees

To see all active worktrees and their branches:

```bash
git worktree list
```

Output shows the path, HEAD commit, and branch for each worktree. Use this to verify agent setup and identify stale worktrees.

## See Also

- [git-workflow-patterns](../core/git-workflow-patterns.md) — Branching strategy, commit conventions, PR workflow
- [task-claiming-strategy](./task-claiming-strategy.md) — Task selection and multi-agent coordination
