---
description: "Configure git workflow with branching, PRs, CI, and worktree scripts for parallel agents"
long-description: "Configure the repository for parallel Claude Code sessions working simultaneously."
---

## Purpose
Configure the repository for parallel Claude Code sessions working simultaneously.
Define branching strategy (one task = one branch = one PR), commit standards
(with Beads task IDs if configured, conventional commits otherwise), rebase
strategy, PR workflow with squash-merge and auto-merge, worktree setup for
parallel agents, CI pipeline, branch protection, and conflict prevention rules.

## Inputs
- CLAUDE.md (required) — Key Commands table for lint/test/install commands
- docs/tech-stack.md (required) — CI environment setup (language, runtime)
- docs/coding-standards.md (required) — commit message format reference

## Expected Outputs
- docs/git-workflow.md — branching strategy, commit standards, rebase strategy,
  PR workflow (8 sub-steps), task closure, agent crash recovery, branch protection,
  conflict prevention, and worktree documentation
- scripts/setup-agent-worktree.sh — permanent worktree creation script
- .github/workflows/ci.yml — CI workflow with lint and test jobs
- .github/pull_request_template.md — PR template with task ID format
- CLAUDE.md updated with Committing/PR Workflow, Task Closure, Parallel Sessions,
  Worktree Awareness, and Code Review sections

## Quality Criteria
- Branch naming format is consistent (Beads: bd-<task-id>/<desc>. Non-Beads: <type>/<desc>)
- Commit format is consistent (Beads: [BD-<id>] type(scope): desc. Non-Beads: type(scope): desc)
- PR workflow includes all 8 sub-steps (commit, AI review, rebase, push, create,
  auto-merge with --delete-branch, watch CI, confirm merge)
- Worktree script creates permanent worktrees with workspace branches
- If Beads: BD_ACTOR environment variable documented for agent identity
- CI workflow job name matches branch protection context
- Branch cleanup documented for both single-agent and worktree-agent variants
- Agent crash recovery procedure documented
- Conflict prevention rule: don't parallelize tasks touching same files
- (mvp) CI workflow YAML is valid and references commands from Key Commands table

## Methodology Scaling
- **deep**: Full git workflow with all sections, CI pipeline, branch protection
  via gh api, worktree script, PR template, agent crash recovery, batch branch
  cleanup, and comprehensive CLAUDE.md updates.
- **mvp**: Branching strategy, commit format, basic PR workflow, CI config.
  Skip worktree script and crash recovery. Minimal CLAUDE.md updates.
- **custom:depth(1-5)**: Depth 1-2: branching + commits + CI. Depth 3: add PR
  workflow and branch protection. Depth 4: add worktrees and crash recovery.
  Depth 5: full suite with all sections.

## Mode Detection
Update mode if docs/git-workflow.md exists. In update mode: never rename CI jobs
without checking branch protection rules, preserve worktree directory naming,
keep setup-agent-worktree.sh customizations intact.

## Update Mode Specifics
- **Detect prior artifact**: docs/git-workflow.md exists
- **Preserve**: branch naming convention, commit message format, CI job names,
  branch protection rules, worktree directory structure, PR template fields,
  setup-agent-worktree.sh customizations
- **Triggers for update**: coding-standards.md changed commit format, new CI
  stages needed (e.g., evals added), Beads status changed (added or removed),
  new worktree patterns needed for parallel execution
- **Conflict resolution**: if CI job rename is required, update branch
  protection rules in the same operation; verify CLAUDE.md workflow section
  stays consistent after any changes

---

## Domain Knowledge

### dev-environment

*Development environment setup patterns including Makefile conventions, live reload, and toolchain configuration*

# Dev Environment

A development environment should be reproducible, fast, and invisible. "It works on my machine" is a build system failure, not a developer excuse. This knowledge covers task runners, environment management, git hooks, CI integration, and toolchain patterns that make environments reliable across machines and team members.

## Summary

### Core Components

Every project needs four environment pillars:

1. **Build Tool / Task Runner** — A single entry point for all project tasks. Makefile is the universal choice (works everywhere, zero dependencies). Language-specific alternatives: `package.json` scripts, `pyproject.toml`, `go` tool.
2. **Environment Management** — `.env` files for local config, `.env.example` committed as documentation, validation at startup, sensible development defaults.
3. **Git Hooks** — Pre-commit (fast checks: lint, format, type check). Pre-push (slower checks: full test suite). Installed by `make hooks`.
4. **CI/CD Integration** — CI runs the same commands as local development. `make check` in CI, `make check` locally. No divergent CI-specific scripts.

### Makefile as Universal Task Runner

Makefile provides: discoverable interface (`make help`), dependency management between targets, idempotent execution, parallel execution (`make -j4`), and universal availability on any Unix system with zero installation. Language-specific task runners complement but do not replace it — `make test` calls `npm test` or `pytest`, keeping the stable interface independent of underlying tools. If the underlying tool changes (e.g., Jest to Vitest), only the Makefile target body changes — not CI or documentation.

### The Setup Contract

New developer from clone to green tests in three commands or fewer:
```bash
git clone <repo>
make setup    # Install dependencies, tools, hooks
make check    # Verify everything works
```

### Branching Strategy Summary

**Trunk-Based**: All commits to main, feature flags for incomplete work. For small teams with strong tests and continuous deployment. **GitHub Flow**: Feature branches, PR review, squash merge. Best for most teams — simple and structured. **GitFlow**: Separate develop/release/hotfix branches. Only for scheduled releases or multi-version support. Most web apps do not need it.

## Deep Guidance

### Makefile Patterns

#### The Help Target

Every Makefile starts with self-documentation:

```makefile
.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
```

Every public target gets a `## Description` comment. Internal targets use `_` prefix and no description.

#### Standard Target Set

```makefile
.PHONY: test lint format check setup clean hooks

test: ## Run test suite
	npm test

lint: ## Run linters
	npm run lint

format: ## Format code
	npm run format

check: lint test ## Run all quality gates

setup: ## Install dependencies and hooks
	npm install
	$(MAKE) hooks

clean: ## Remove build artifacts
	rm -rf dist/ node_modules/.cache/

hooks: ## Install git hooks
	@mkdir -p .git/hooks
	@cp scripts/pre-commit.sh .git/hooks/pre-commit
	@cp scripts/pre-push.sh .git/hooks/pre-push
	@chmod +x .git/hooks/pre-commit .git/hooks/pre-push
```

#### Dependency Chains and Parallel Execution

Targets depend on other targets: `deploy: check build` runs lint, test, and build before deploying. For CI, parallelize independent targets: `$(MAKE) -j2 lint test`.

#### Variables and Platform Compatibility

Use `?=` for overridable variables: `TEST_FLAGS ?=` lets users run `make test TEST_FLAGS="--watch"`. Detect OS for platform-specific commands with `UNAME := $(shell uname -s)` and conditional blocks.

### Environment Variable Management

#### The .env Pattern

```
.env.example     # Committed — documents all variables with safe placeholders
.env             # Gitignored — local overrides
.env.test        # Gitignored — test environment
.env.production  # Never on disk — injected by deployment platform
```

`.env.example` is documentation: every variable listed with explanatory comments and placeholder values.

#### Startup Validation

Validate all environment variables at startup, not at point of use. Fail fast with clear messages:

```typescript
// src/config/env.ts — centralized env access
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  database: { url: requireEnv('DATABASE_URL') },
  auth: { jwtSecret: requireEnv('JWT_SECRET') },
} as const;
```

No `process.env.SOMETHING` scattered throughout the codebase. Python equivalent: use `pydantic_settings.BaseSettings` for typed validation with defaults.

### Live Reload by Stack

| Stack | Tool | Command |
|-------|------|---------|
| Next.js / Vite | Built-in HMR | `next dev` / `vite dev` |
| Express/Fastify | tsx watch | `tsx watch src/server.ts` |
| FastAPI | uvicorn | `uvicorn app:app --reload` |
| Go | air | `air` |
| Shell | entr | `ls scripts/*.sh \| entr make test` |

For full-stack projects, run frontend and backend in parallel via `make dev` using `$(MAKE) -j2 dev-frontend dev-backend` or a process manager like `concurrently`.

### Git Hook Strategies

#### Pre-Commit (Fast, Under 10 Seconds)

Check only staged files when possible:
- Formatting (run formatter check, fail if files would change)
- Linting (staged files only via `lint-staged`)
- Secrets scanning (detect accidentally committed API keys)
- File size limits (prevent accidental binary commits)

#### Pre-Push (Thorough, Under 60 Seconds)

Run the full quality gate:
- Complete test suite
- Full lint (all files, not just staged)
- Build verification

#### Installation

Single command: `make hooks`. Wrap whichever hook manager the project uses (husky, pre-commit, lefthook, or plain shell scripts).

### CI/CD Integration

#### The Mirror Principle

CI runs `make check` — the exact same command developers run locally. If it passes locally, it passes in CI. No environment-specific surprises.

```yaml
# .github/workflows/check.yml
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: make check
```

#### Caching

Cache dependencies keyed on lockfile hashes: `node_modules/` on `package-lock.json`, `.venv/` on `pyproject.toml`, `~/go/pkg/mod/` on `go.sum`.

#### Job Structure

Parallelize independent checks, gate dependent steps:
```yaml
jobs:
  lint:  { steps: [checkout, setup, make lint] }
  test:  { steps: [checkout, setup, make test] }
  build: { needs: [lint, test], steps: [checkout, setup, make build] }
```

### Branching Strategies — When to Use Each

#### Trunk-Based Development

All developers commit to `main`. Feature flags gate incomplete work. Releases cut directly from `main`. Requires: strong test suite, feature flag infrastructure, team discipline. Best for: small teams (1-5), continuous deployment. Risk: broken commits affect everyone immediately.

#### GitHub Flow

Feature branches from `main`, PRs with review, squash merge back. `main` is always deployable. Best for: most teams, most projects. Keep branches short (1-3 days), rebase frequently. Risk: long-lived branches diverge.

#### GitFlow

Separate `develop`, `release/*`, `hotfix/*`, `main` branches. Formalized release process. Best for: scheduled releases (mobile, enterprise), multiple supported versions. Risk: branch complexity, merge conflicts. Most web apps do not need this.

### Common Anti-Patterns

**Scripts That Only Work on One OS**: `setup.sh` uses `apt-get`, breaks on macOS. Fix: detect OS and branch, or use devcontainers. Document OS-specific prerequisites.

**Missing Setup Documentation**: New developer spends a day figuring out the build. Fix: `make setup` automates everything possible. `docs/dev-setup.md` covers the rest. Test by having a new team member follow it verbatim.

**Hardcoded Paths**: Scripts reference `/Users/alice/projects/myapp/`. Fix: use relative paths or compute from `$(pwd)` / `$(dirname "$0")`. Never commit absolute paths.

**No Clean Target**: Build artifacts accumulate, stale caches cause mystery failures. Fix: `make clean` removes generated artifacts. `make pristine` removes everything including `node_modules/` for a full reset.

**CI Drift**: CI runs different commands than local dev. Fix: CI calls `make check`. If CI needs extras (artifact upload, deploy), those are separate steps after the quality gate. The gate itself is identical everywhere.

## See Also

- [ai-memory-management](../core/ai-memory-management.md) — Environment setup affects memory hooks

---

### git-workflow-patterns

*Git branching strategies, commit conventions, PR workflows, merge policies, and CI integration patterns for AI-agent-driven development*

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

---

## After This Step

Continue with: `/scaffold:claude-md-optimization`, `/scaffold:ai-memory-setup`, `/scaffold:automated-pr-review`, `/scaffold:add-e2e-testing`
