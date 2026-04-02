<!-- scaffold:git-workflow v2 2026-03-16 -->
# Git Workflow

Standard GitHub flow: branch, commit, push, PR, squash-merge.

## 1. Branching

All work happens on feature branches from `origin/main`.

### Branch Naming

```
type/short-description
```

Types match conventional commits: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`.

Examples:
```
feat/assembly-engine
fix/state-write-race
docs/onboarding-guide
```

### Creating a Branch

```bash
git fetch origin
git checkout -b type/short-description origin/main
```

Always branch from `origin/main`, not local `main`, to avoid stale base commits.

## 2. Commits

### Format

```
type(scope): description
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

### Examples

```
feat(scripts): add resolve-deps topological sort
fix(install): handle spaces in TARGET_DIR path
chore: initialize project structure
```

## 3. PR Workflow

1. Run quality gates:
   ```bash
   make check-all
   ```
2. Push branch:
   ```bash
   git push -u origin HEAD
   ```
3. Create PR:
   ```bash
   gh pr create
   ```
4. Wait for CI (`check` job) to pass
5. Squash-merge:
   ```bash
   gh pr merge --squash --delete-branch
   ```
6. Pull updated main:
   ```bash
   git checkout main && git pull origin main
   ```

## 4. Branch Protection

CI is required on PRs to main. The `check` job in `.github/workflows/ci.yml` runs `make check-all` (the full bash + TypeScript gate).

### Setup (After First CI Run)

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

## 5. Conflict Prevention

### High-Contention Files

| File | Risk | Mitigation |
|------|------|------------|
| `prompts.md` | Highest — source of truth for all prompts | Never edit in parallel; rebase before touching |
| `CLAUDE.md` | High — all agents read this | Append-only edits preferred; rebase before merging |
| `lib/common.sh` | Medium — shared library | Keep changes minimal; test thoroughly |

### Best Practices

- Keep feature branches short-lived (merge within hours, not days)
- Rebase if needed to resolve conflicts before merging
- Avoid reformatting files you're not otherwise changing
- If two agents need the same file, serialize their work

## 6. Repository Hygiene

### Local Hooks

`make hooks` installs pre-commit and pre-push hooks:
- **Pre-commit**: ShellCheck + frontmatter validation
- **Pre-push**: Full test suite

These are local-only. Each developer/agent runs `make hooks` after cloning.

### CI by Design

Quality gates run both locally (`make check-all`) and in CI. The CI workflow is the authoritative gate — local hooks are a convenience.

## 7. Advanced: Parallel Agents (Worktrees)

For parallel development, each agent gets a git worktree — an independent working directory sharing the same `.git` repository.

```
~/projects/
├── scaffold/                  # Main repo
├── scaffold-agent-1/          # Worktree for agent 1
└── scaffold-agent-2/          # Worktree for agent 2
```

### Creating Worktrees

```bash
scripts/setup-agent-worktree.sh <agent-name>
```

This creates `../<repo-name>-<agent-suffix>` with a workspace branch.

### Worktree Workflow

Each agent follows the same PR workflow (section 3) from its worktree. Additional guidelines:

- Rebase frequently — other agents are merging to main
- Never edit high-contention files without rebasing first
- Keep branches short-lived to minimize conflicts

### Worktree Maintenance

```bash
git worktree list                          # List all worktrees
git worktree remove ../scaffold-<agent>    # Remove a worktree
git worktree prune                         # Prune stale references
```
