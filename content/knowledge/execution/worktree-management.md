---
name: worktree-management
description: Git worktree patterns for parallel multi-agent execution
topics: [git, worktrees, multi-agent, branching]
---

# Worktree Management

Expert knowledge for managing git worktrees to enable parallel multi-agent execution. Covers setup, branching conventions, inter-task cleanup, and safe teardown procedures.

## Summary

### Setup

Use `scripts/setup-agent-worktree.sh <agent-name>` to create a worktree at `../<project>-<agent-name>/`. Each agent gets its own isolated working directory and workspace branch.

### Branching Conventions

- Each agent operates on a workspace branch (e.g., `agent-1-workspace`)
- Feature branches are created from `origin/main` — never from local `main`
- Never run `git checkout main` inside a worktree — it will fail because `main` is checked out in the primary repo

### Cleanup

After all agents finish, remove worktrees and prune stale references. Delete merged feature branches in batch to keep the repository clean.

## Deep Guidance

### Setup — Extended

**Creating a worktree:**

```bash
# From the main repository
scripts/setup-agent-worktree.sh agent-1

# This creates:
#   ../<project>-agent-1/     (working directory)
#   Branch: agent-1-workspace  (workspace branch)
```

**What the setup script does:**
1. Creates a new worktree directory adjacent to the main repo
2. Creates a workspace branch for the agent
3. Sets up the working directory with a clean state
4. Installs dependencies if a package manager is detected

**Multiple agents:**

```bash
scripts/setup-agent-worktree.sh agent-1
scripts/setup-agent-worktree.sh agent-2
scripts/setup-agent-worktree.sh agent-3
```

Each agent has a completely isolated working directory. They share the same `.git` object store but have separate working trees, index files, and HEAD pointers.

### Workspace Branch Conventions

Each agent gets a persistent workspace branch that serves as its "home base":

- `agent-1-workspace`, `agent-2-workspace`, etc.
- The workspace branch is where the agent returns between tasks
- Feature branches for individual tasks are created from `origin/main`, not from the workspace branch

**Why workspace branches exist:**
- A worktree requires a branch that isn't checked out elsewhere
- The workspace branch prevents conflicts with `main` (which is checked out in the primary repo)
- It provides a stable base for the agent to return to between tasks

### Branching — Extended

**Creating a feature branch for a task:**

```bash
# Inside the agent's worktree
git fetch origin
git checkout -b bd-42/add-user-endpoint origin/main
```

**Critical rules:**
- Always branch from `origin/main` — never from local `main` (it may be stale) and never from the workspace branch
- Branch naming: `bd-<id>/<short-desc>` when using Beads, or `feat/<task-id>-<slug>` otherwise
- One branch per task — never combine multiple tasks on a single branch

**Never run `git checkout main` in a worktree:**
- The `main` branch is checked out in the primary repo
- Git does not allow the same branch to be checked out in multiple worktrees
- This command will fail with an error; if you need main's content, use `origin/main`

### Between Tasks

After completing a task (PR created and CI passing), prepare for the next one:

```bash
# Fetch latest state from remote
git fetch origin --prune

# Switch back to workspace branch
git checkout agent-1-workspace

# Clean up untracked files and directories
git clean -fd

# Reinstall dependencies (important if package files changed on main)
# npm install / pip install -r requirements.txt / etc.
```

**Why this matters:**
- `git fetch --prune` ensures you see newly merged branches and removed remote branches
- `git clean -fd` removes artifacts from the previous task
- Dependency reinstallation catches changes merged by other agents

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
git worktree remove ../<project>-agent-1
```

**Pruning stale worktree references:**

```bash
git worktree prune
```

Run this after removing worktrees or if a worktree directory was deleted manually.

**Batch cleanup of merged feature branches:**

```bash
git fetch origin --prune
git branch --merged origin/main | grep "bd-" | xargs -r git branch -d
```

This deletes all local branches that have been merged to `origin/main` and match the `bd-` prefix. Safe because `--merged` ensures only fully-merged branches are deleted, and `-d` (not `-D`) refuses to delete unmerged branches.

**Cleanup of workspace branches:**

After all agents are done and their worktrees are removed:

```bash
git branch | grep "workspace" | xargs -r git branch -D
```

Use `-D` here because workspace branches are not merged — they're disposable.

### BD_ACTOR Environment Variable

When using Beads for task tracking, set `BD_ACTOR` per agent for attribution:

```bash
export BD_ACTOR="agent-1"
```

This ensures that task claims, completions, and other Beads operations are attributed to the correct agent. Set it in the agent's shell environment before starting work.

### Listing Active Worktrees

To see all active worktrees and their branches:

```bash
git worktree list
```

Output shows the path, HEAD commit, and branch for each worktree. Use this to verify agent setup and identify stale worktrees.

## See Also

- [git-workflow-patterns](../core/git-workflow-patterns.md) — Branching strategy, commit conventions, PR workflow
- [task-claiming-strategy](./task-claiming-strategy.md) — Task selection and multi-agent coordination
