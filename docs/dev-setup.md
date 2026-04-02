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
make check-all
```

## Daily Development

```bash
# 1. Create a feature branch
git fetch origin
git checkout -b type/short-description origin/main

# 2. Make your changes (TDD: write tests first)

# 3. Run quality gates
make check-all

# 4. Commit
git commit -m "type(scope): description"

# 5. Push and create PR
git push -u origin HEAD
gh pr create
```

## Common Tasks

| Task | Command |
|------|---------|
| Run tests | `make test` |
| Lint shell scripts | `make lint` |
| Validate command frontmatter | `make validate` |
| Run bash quality gates only | `make check` |
| Run all quality gates | `make check-all` |
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

### Pre-commit hook fails on ShellCheck

ShellCheck warnings in existing scripts are expected tech debt. If blocked:

```bash
# Commit without hooks (use sparingly)
git commit --no-verify -m "type(scope): message"
```

### `make lint` shows warnings on existing scripts

Some v1 scripts use `#!/bin/bash` instead of `#!/usr/bin/env bash` or use `set -e` alone. These are known issues tracked separately — don't fix them in unrelated PRs.

## For AI Agents

Quick-start for automated workflows:

```bash
make setup          # Ensure all tools are installed
make check-all      # Run all quality gates
```
