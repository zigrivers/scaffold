<!-- scaffold:git-workflow v1 2026-02-16 -->
# Git Workflow

Conventions for branching, committing, PRs, and parallel agent execution in the scaffold project.

## 1. Branching Strategy

All work happens on feature branches created from `origin/main`.

### Branch Naming

```
bd-<task-id>/<short-description>
```

Examples:
```
bd-scaffold-abc/add-worktree-script
bd-scaffold-xyz/fix-frontmatter-validation
```

### Creating a Branch

```bash
git fetch origin
git checkout -b bd-<task-id>/<desc> origin/main
```

Always branch from `origin/main`, not local `main`, to avoid stale base commits.

## 2. Commit Standards

### Format

```
[BD-<id>] type(scope): description
```

### Types

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `docs` | Documentation only |
| `chore` | Maintenance, dependencies, CI |

### Rules

- Imperative mood: "add feature" not "added feature"
- Lowercase after the type prefix
- Every commit needs a Beads task ID
- `[BD-0]` for bootstrapping tasks only

### Examples

```
[BD-scaffold-abc] feat(scripts): add setup-agent-worktree script
[BD-scaffold-xyz] fix(install): handle spaces in TARGET_DIR path
[BD-0] chore: initialize project structure
```

## 3. Rebase Strategy

Rebase before creating a PR to keep history linear.

```bash
git fetch origin
git rebase origin/main
```

### Force Push Rules

- **Feature branches**: `git push --force-with-lease` is safe and expected after rebasing
- **main**: Never force push to main
- `--force-with-lease` protects against overwriting someone else's push to the same branch

### Conflict Resolution

If rebase produces conflicts:
1. Resolve each conflict
2. `git add <resolved-files>`
3. `git rebase --continue`
4. If hopelessly stuck: `git rebase --abort` and rethink the approach

## 4. PR Workflow

### Creating a PR

1. Ensure all quality gates pass:
   ```bash
   make check
   ```
2. Rebase on latest main:
   ```bash
   git fetch origin && git rebase origin/main
   ```
3. Push branch:
   ```bash
   git push -u origin HEAD
   ```
4. Create PR:
   ```bash
   gh pr create --title "[BD-<id>] type(scope): description" --body "$(cat <<'EOF'
   ## Summary
   - <what changed and why>

   ## Test plan
   - [ ] `make check` passes
   EOF
   )"
   ```
5. Wait for CI (`check` job) to pass
6. Self-review the diff:
   ```bash
   gh pr diff
   ```
7. Merge when CI is green:
   ```bash
   gh pr merge --squash --delete-branch
   ```
8. Pull updated main:
   ```bash
   git checkout main && git pull origin main
   ```

### PR Title Convention

Same as commit format: `[BD-<id>] type(scope): description`

## 5. Task Closure

### Single-Agent Flow

```bash
# After PR is merged
bd close <id>
bd sync
bd ready                # Pick next task
```

### Worktree-Agent Flow

```bash
# In the worktree
bd close <id>
bd sync
git checkout main && git pull origin main
bd ready                # Pick next task
```

### Rules

- Only close a task after the PR is merged (not just created)
- `bd close` is the only way to close — never use `bd update --status completed`
- Always `bd sync` after closing to persist state

## 6. Crash Recovery

### Worktree State Inspection

If a worktree agent crashes or is interrupted:

```bash
# From the main repo, list all worktrees
git worktree list

# Check status of a specific worktree
git -C ../scaffold-<agent> status

# Check for in-progress rebases
ls ../scaffold-<agent>/.git/rebase-merge 2>/dev/null && echo "rebase in progress"
```

### Recovering a Stuck Worktree

```bash
# Abort any in-progress rebase
git -C ../scaffold-<agent> rebase --abort

# Reset to clean state
git -C ../scaffold-<agent> checkout main
git -C ../scaffold-<agent> pull origin main
```

### Branch Cleanup

```bash
# Remove merged branches
git branch --merged main | grep -v main | xargs git branch -d

# Prune remote tracking branches
git fetch --prune
```

## 7. Branch Protection

CI is required on PRs to main. The `check` job in `.github/workflows/ci.yml` runs `make check` (lint + validate + test).

### Setup (After First CI Run)

Branch protection can only reference status checks that have run at least once. After the first PR triggers CI:

```bash
gh api repos/{owner}/{repo}/branches/main/protection -X PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["check"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

Fallback: GitHub web UI (Settings > Branches > Add rule).

### Current Configuration

- **Required checks**: `check` (CI job)
- **Review required**: No (single-developer project with AI agents)
- **Admin enforcement**: No (allows emergency merges)

## 8. Conflict Prevention

### High-Contention Files

These files are edited by multiple prompts and agents. Coordinate carefully:

| File | Risk | Mitigation |
|------|------|------------|
| `prompts.md` | Highest — source of truth for all prompts | Never edit in parallel; rebase immediately before touching |
| `CLAUDE.md` | High — all agents read this | Append-only edits preferred; rebase before merging |
| `lib/common.sh` | Medium — shared library | Keep changes minimal; test thoroughly |

### Best Practices

- Keep feature branches short-lived (merge within hours, not days)
- Rebase frequently during long-running work
- Avoid reformatting files you're not otherwise changing
- If two agents need the same file, serialize their tasks via Beads dependencies

## 9. Repository Hygiene

### .gitignore

The current `.gitignore` covers:
- OS files (`.DS_Store`, `Thumbs.db`)
- Editor files (`.vscode/`, `.idea/`)
- Node artifacts (`node_modules/`)
- Temporary files

No additions needed for the current stack.

### Local Hooks

`make hooks` installs pre-commit and pre-push hooks:
- **Pre-commit**: ShellCheck + frontmatter validation
- **Pre-push**: Full test suite

These are local-only (not committed to `.git/hooks/`). Each developer/agent runs `make hooks` after cloning.

### CI by Design

Quality gates run both locally (`make check`) and in CI (`.github/workflows/ci.yml`). The CI workflow is the authoritative gate — local hooks are a convenience.

## 10. Parallel Agent Setup

### Worktree Model

Each parallel agent gets a permanent git worktree — an independent working directory sharing the same `.git` repository.

```
~/projects/
├── scaffold/                  # Main repo (orchestrator)
├── scaffold-agent-1/          # Worktree for agent 1
├── scaffold-agent-2/          # Worktree for agent 2
└── scaffold-agent-3/          # Worktree for agent 3
```

### Creating Worktrees

```bash
scripts/setup-agent-worktree.sh <agent-name>
```

This creates `../<repo-name>-<agent-suffix>` with a `<agent-suffix>-workspace` branch.

### Agent Identity

Set `BD_ACTOR` so Beads tracks who did what:

```bash
export BD_ACTOR="agent-1"
```

### Launch Workflow

1. Create worktrees for each agent:
   ```bash
   scripts/setup-agent-worktree.sh agent-1
   scripts/setup-agent-worktree.sh agent-2
   ```
2. In each worktree, set actor and start working:
   ```bash
   cd ../scaffold-agent-1
   export BD_ACTOR="agent-1"
   bd ready                    # Pick a task
   ```
3. Each agent creates feature branches from its worktree, makes PRs, and picks new tasks after merge.

### Worktree Maintenance

```bash
# List all worktrees
git worktree list

# Remove a worktree (from main repo)
git worktree remove ../scaffold-<agent>

# Prune stale worktree references
git worktree prune
```
