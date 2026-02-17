<!-- scaffold:dev-setup v1 2026-02-16 -->

# Dev Environment Setup

How to set up and work with the scaffold development environment.

## Prerequisites

### Required

| Tool | Install | Purpose |
|------|---------|---------|
| Bash 3.2+ | Pre-installed on macOS | Script runtime |
| Git | Pre-installed on macOS | Version control |
| jq | `brew install jq` | JSON processing |
| Node.js 18+ | `brew install node` | Claude Code runtime |
| Beads (`bd`) | `brew install beads` | Task tracking |

### Dev-Only

| Tool | Install | Purpose |
|------|---------|---------|
| ShellCheck | `brew install shellcheck` | Bash linting |
| bats-core | `brew install bats-core` | Bash test framework |

## First-Time Setup

```bash
# Clone the repo
git clone <repo-url>
cd scaffold

# Install dev dependencies (skips already-installed tools)
make setup

# Install git hooks (ShellCheck + frontmatter validation on commit)
make hooks

# Run all quality gates to verify setup
make check
```

## Daily Development

```bash
# 1. See what's ready to work on
bd ready

# 2. Claim and start a task
bd update <id> --claim

# 3. Make your changes (TDD: write tests first)

# 4. Run quality gates
make check

# 5. Commit (requires Beads task ID)
git commit -m "[BD-<id>] type(scope): description"

# 6. Close the task
bd close <id>
```

## Common Tasks

| Task | Command |
|------|---------|
| Run tests | `make test` |
| Lint shell scripts | `make lint` |
| Validate command frontmatter | `make validate` |
| Run all quality gates | `make check` |
| Install dev dependencies | `make setup` |
| Install git hooks | `make hooks` |
| Install scaffold commands | `make install` |
| Extract commands from prompts.md | `make extract` |
| Show available make targets | `make help` |

## Troubleshooting

### `shellcheck: command not found`

```bash
brew install shellcheck
```

### `bats: command not found`

```bash
brew install bats-core
```

### `bd: command not found`

```bash
brew install beads
```

### Pre-commit hook fails on ShellCheck

ShellCheck warnings in existing scripts are expected tech debt. If blocked:

```bash
# Commit without hooks (use sparingly)
git commit --no-verify -m "[BD-<id>] message"
```

### `make lint` shows warnings on existing scripts

Some v1 scripts use `#!/bin/bash` instead of `#!/usr/bin/env bash` or use `set -e` alone. These are known issues tracked separately — don't fix them in unrelated PRs.

## For AI Agents

Quick-start for automated workflows:

```bash
make setup          # Ensure all tools are installed
make check          # Run all quality gates
bd ready            # Find available work
bd create "title" -p 1 && bd update <id> --claim  # Create + claim a task
bd close <id>       # Mark task complete
bd sync             # Sync state to git
```
