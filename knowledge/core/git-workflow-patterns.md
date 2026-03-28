---
name: git-workflow-patterns
description: Git branching strategies, commit conventions, PR workflows, merge policies, and CI integration patterns for AI-agent-driven development
topics: [git, branching, commits, pull-requests, ci-cd, merge-strategy, worktrees]
---

# Git Workflow Patterns

Structured git workflows for AI-agent-driven projects ensure consistent branching, meaningful commit history, automated quality gates, and smooth multi-agent collaboration via worktrees.

## Summary

### Branching Strategy

The trunk-based development model works best for AI-agent workflows:

- **Main branch** (`main`) — always deployable, protected by CI
- **Feature branches** — short-lived, created per task or story (`feat/US-xxx-slug`, `fix/bug-description`)
- **Worktree branches** — parallel agent execution using git worktrees (`agent/<name>/<task>`)

Branch naming conventions:
```
feat/US-001-user-registration    # Feature work tied to a story
fix/login-timeout-handling       # Bug fix
chore/update-dependencies        # Maintenance
docs/api-contract-updates        # Documentation only
```

### Commit Conventions

Use Conventional Commits format for machine-parseable history:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`

AI agent commits should include the Co-Authored-By trailer for attribution and auditability.

### Pull Request Workflow

Standard PR lifecycle:
1. Create branch from `main`
2. Implement changes with passing tests
3. Push branch, create PR with structured description
4. CI runs all quality gates (`make check` or equivalent)
5. Review (automated or manual)
6. Squash-merge to maintain clean history
7. Delete branch after merge

## Deep Guidance

### Merge Policies

- **Squash merge** for feature branches — keeps main history clean
- **Merge commit** for release branches — preserves the merge point
- **Never force-push** to main or shared branches
- **Delete branches** after merge to prevent clutter

### CI Integration

Minimum CI pipeline for scaffold projects:
1. **Lint** — ShellCheck, ESLint, or language-appropriate linter
2. **Test** — Full test suite including evals
3. **Build** — Verify compilation/bundling succeeds
4. **Type check** — For typed languages (TypeScript, etc.)

### Worktree Patterns for Multi-Agent Work

Git worktrees enable parallel agent execution on the same repository:

```bash
# Create a worktree for an agent
scripts/setup-agent-worktree.sh agent-name

# Each worktree gets its own branch and working directory
# Agents can work simultaneously without conflicts
```

Key rules:
- Each agent works in its own worktree with its own branch
- Agents coordinate via the implementation plan task assignments
- Merge conflicts are resolved by the agent whose branch is behind
- The main worktree is the coordination point

### Branch Protection Rules

Configure branch protection for `main`:
- Require status checks to pass before merge
- Require branches to be up to date before merge
- Do not allow direct pushes
- Require squash merging for feature branches

### Commit Message Quality

Good commit messages for AI agents:
```
feat(auth): add JWT token refresh endpoint

Implements automatic token refresh when the access token expires
within 5 minutes. Refresh tokens are rotated on each use.

Closes US-015
```

Bad commit messages to avoid:
- `fix stuff` — no context
- `WIP` — should never be pushed
- `update` — what was updated?

### PR Description Template

```
### What changed
- [1-3 bullet points describing the change]

### Files modified
- [Specific files/components modified]

### How to test
- [How to verify the changes work]

### Related
- [Story ID, issue link, or ADR reference]
```

### Conflict Resolution Strategy

When multiple agents work in parallel:
1. Agent finishing first merges normally
2. Agent finishing second rebases onto updated main
3. If conflicts arise, the second agent resolves them
4. Never force-push over another agent's work

Conflict resolution checklist:
- Pull latest main before starting any task
- Rebase frequently on long-running branches (every few commits)
- If a rebase produces conflicts in files you didn't modify, investigate — another agent may have refactored the same area
- After resolving conflicts, re-run the full test suite before pushing
- Document unusual conflict resolutions in the commit message body

### Release Workflow

For version-tagged releases:
1. Ensure all PRs are merged to main
2. Run full quality gates on main
3. Create a version tag (`v1.2.3`)
4. Generate changelog from conventional commits
5. Push tag to trigger release pipeline

### Semantic Versioning

Follow semver for version tags:
- **MAJOR** (`X.0.0`) — breaking API changes, incompatible migrations
- **MINOR** (`0.X.0`) — new features, backward-compatible additions
- **PATCH** (`0.0.X`) — bug fixes, documentation, internal refactors

Pre-release versions for staging: `v1.2.3-rc.1`, `v1.2.3-beta.1`

### Git Hooks

Pre-commit hooks for quality enforcement:
```bash
# .husky/pre-commit or .git/hooks/pre-commit
#!/usr/bin/env bash
set -euo pipefail

# Run linter on staged files
make lint

# Validate frontmatter on changed command files
./scripts/validate-frontmatter.sh $(git diff --cached --name-only -- 'commands/*.md')
```

Pre-push hooks for broader validation:
```bash
# .husky/pre-push or .git/hooks/pre-push
#!/usr/bin/env bash
set -euo pipefail

# Run full test suite before pushing
make test
```

### Common Anti-Patterns

Patterns to avoid in AI-agent git workflows:

1. **Long-lived branches** — branches older than 1 day risk merge conflicts. Keep branches short-lived.
2. **Giant PRs** — PRs with 500+ lines changed are hard to review. Split into smaller, focused PRs.
3. **Skipping hooks** — `--no-verify` hides real issues. Fix the root cause instead.
4. **Rebasing shared branches** — only rebase branches that only you use. Shared branches use merge commits.
5. **Committing generated files** — lock files yes, build output no. Use `.gitignore` aggressively.
6. **Force-pushing to main** — this is never acceptable. Even if CI is broken, create a fix branch.
7. **Mixing concerns in one commit** — each commit should be atomic and focused on one change.
