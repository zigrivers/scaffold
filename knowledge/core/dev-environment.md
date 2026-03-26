---
name: dev-environment
description: Development environment setup patterns including Makefile conventions, live reload, and toolchain configuration
topics: [dev-environment, makefile, live-reload, env-files, toolchain, ci, git-hooks, scripts]
---

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
