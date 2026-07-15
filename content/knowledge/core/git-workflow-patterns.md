---
name: git-workflow-patterns
description: >-
  Git branching strategies, commit conventions, PR workflows, merge policies, and CI integration patterns for
  AI-agent-driven development
topics:
  - git
  - branching
  - commits
  - pull-requests
  - ci-cd
  - merge-strategy
  - worktrees
volatility: stable
last-reviewed: 2026-07-11
version-pin: null
sources:
  - url: https://git-scm.com/docs/git-worktree
    anchor: '#_description'
    hash: sha256:ab586ee537518edb32bab0c05a161fb2e37eaae0a0af82b99bca3e579fbd1a4b
    retrieved: 2026-06-08
  - url: https://www.conventionalcommits.org/en/v1.0.0/
    anchor: '#specification'
    hash: sha256:1f02d0f99e4a830daafa4cc75d92e1fe4aef50984c6c398aabd50d7c1214091f
    retrieved: 2026-06-08
---

# Git Workflow Patterns

Structured git workflows for AI-agent-driven projects ensure consistent branching, meaningful commit history, automated quality gates, and smooth multi-agent collaboration via worktrees.

## Summary

### Branching Strategy

The trunk-based development model works best for AI-agent workflows:

- **Main branch** (`main`) — always deployable, protected by the local quality
  gate (pre-commit hooks + `make check` + agent self-review + `mmr review`)
  and PR review; CI is deliberately deferred until a launch target is chosen
  — see "Quality gates (CI deferred)" below
- **Feature branches** — short-lived, one per task (`feat/short-desc`,
  `fix/bug-description`)
- **Worktree branches** — parallel agent execution using git worktrees; the
  workspace branch is `agent/<name>/<bead-id>` — the agent's name plus the
  bead id as the final segment, so `git branch -r` reads as a live roster of
  in-flight work (bare `agent/<name>` when there is no bead; an agent commits
  its task work directly on this branch)

Traceable IDs — when a tracker is configured, the work-item/bead ID leads the
commit subject and the PR title as `<bead-id>: ` and ends the worktree branch
name; the PR body's `Closes <id>` stays the CANONICAL machine-readable
bead↔PR mapping. Tooling treats the body as authoritative; the stale-claim
reaper may additionally use a bead id found in the PR title or head branch as
a conservative HOLD signal (extra protection only, never a substitute for the
body). Under squash-merge the PR title becomes the commit subject on
main, which is what makes `git log --oneline` show the bead per commit.

Branch naming conventions — `<type>` matches the Conventional Commits type;
`<short-desc>` is kebab-case and <= 40 chars:
```
feat/user-registration           # Feature work
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

Standard PR lifecycle (the harmonized 8-step workflow, with the mandatory
AI review inserted as step 5.5):
1. Commit — on a branch created from `main`, with passing tests
2. Local review — `make check` green, re-read the diff
3. Rebase onto latest `origin/main`
4. Push the branch
5. Create the PR with a structured description
   - **Step 5.5 — mandatory AI review**: `mmr review --pr <N> --sync
     --format json` (3-round cap; a degraded-pass self-merge past the cap
     is the documented path, not a stall)
6. Watch the local quality gates — pre-commit hooks ran, `make check`
   passes on the branch HEAD; CI is deliberately deferred until a launch
   target is chosen, so these local gates *are* the merge bar
7. Squash-merge and delete the branch (`gh pr merge --squash
   --delete-branch`) — with 3+ concurrent agents, serialize the merge via
   `bd merge-slot acquire --wait` when the project's Beads has merge-slots,
   releasing after the merge
8. Sync `main` from the primary checkout: `make main-sync &&
   make prune-merged` (squash-aware pruning with a triage report — see
   [worktree-management](../execution/worktree-management.md))

## Deep Guidance

### Merge Policies

- **Squash merge** for feature branches — keeps main history clean
- **Merge commit** for release branches — preserves the merge point
- **Never force-push** to main or shared branches
- **Delete branches** after merge to prevent clutter

### Quality gates (CI deferred)

Scaffold projects run their quality gate locally, not in CI, until a launch
or deploy target is chosen:
1. **Pre-commit hooks** — lint (ShellCheck, ESLint, or language-appropriate),
   secret scanning, frontmatter validation on changed files
2. **`make check` (or equivalent)** — full test suite including evals, type
   check, and build verification
3. **Agent self-review** — re-read the diff against the project's coding
   standards before pushing
4. **`mmr review --pr <N> --sync --format json`** — mandatory multi-model AI
   review (3-round cap, degraded-pass self-merge past the cap)

`.github/workflows/` is deliberately absent until a launch/deploy target is
picked — nothing runs these checks server-side yet, so this local stack **is**
the gate, not a supplement to one.

#### Adding CI at launch
When a launch target is chosen, wire the same `make check` and `mmr review`
commands into a CI workflow, then turn on branch protection referencing that
workflow's job name (see "Branch Protection Rules" below) so the gate becomes
enforced rather than merely documented.

### Worktree Patterns for Multi-Agent Work

Git worktrees enable parallel agent execution on the same repository:

```bash
# Create a worktree for an agent (--install runs the dependency-install
# setup commands; a plain invocation creates the worktree but installs nothing)
scripts/setup-agent-worktree.sh agent-name --install

# Each worktree gets its own branch and working directory
# Agents can work simultaneously without conflicts
```

Key rules:
- Each agent works in its own worktree with its own branch
- Agents coordinate via the implementation plan task assignments
- Merge conflicts are resolved by the agent whose branch is behind
- The main worktree is the coordination point

### Branch Protection Rules

Before a CI workflow exists, enforce the settings that don't depend on status
checks directly as repo-host settings (e.g. GitHub repository settings):
- Squash merging only for feature branches (disable merge commits and
  rebase-merge in the UI)
- Delete the head branch automatically on merge

Full branch protection — required status checks, "require branches up to
date before merge," blocking direct pushes — is a launch-time addition: once
"Adding CI at launch" above wires `make check` and `mmr review` into a CI
workflow, turn on branch protection referencing that workflow's job name so
it becomes an enforced gate rather than a documented convention.

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
6. **Force-pushing to main** — this is never acceptable. Even if `make check` or `mmr review` is broken, create a fix branch.
7. **Mixing concerns in one commit** — each commit should be atomic and focused on one change.
