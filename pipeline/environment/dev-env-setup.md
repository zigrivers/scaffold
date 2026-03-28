---
name: dev-env-setup
description: Configure local dev environment with live reload and simple commands
phase: "environment"
order: 310
dependencies: [project-structure]
outputs: [docs/dev-setup.md]
conditional: null
knowledge-base: [dev-environment]
---

## Purpose
Set up a complete local development environment with a one-command dev experience,
live/hot reloading, local database configuration, environment variable management,
and beginner-friendly documentation. Populates the CLAUDE.md Key Commands table
which becomes the single source of truth for project-specific commands referenced
by the entire workflow.

## Inputs
- docs/tech-stack.md (required) — determines dev server, database, and tooling
- docs/project-structure.md (required) — where config files live
- docs/coding-standards.md (optional) — linter/formatter already configured
- docs/tdd-standards.md (optional) — test runner, flags, coverage thresholds, quality gates

## Expected Outputs
- docs/dev-setup.md — getting started guide, daily development, common tasks,
  troubleshooting, and AI agent instructions
- Makefile or package.json scripts (dev, test, test:watch, lint, db-setup, db-reset)
- .env.example with all required variables and sensible local defaults
- CLAUDE.md updated with Key Commands table and Dev Environment section

## Quality Criteria
- Dev server starts with a single command and supports live/hot reloading
- Local database setup is scripted (if applicable)
- .env.example documents all variables with comments
- Key Commands table in CLAUDE.md matches actual Makefile/package.json commands
- Lint and test commands exist and are runnable
- Verification checklist passes (install, dev server, browser, live reload, tests, db)
- Setup process works for first-time clone (max 5 steps)

## Methodology Scaling
- **deep**: Full environment with database setup, seed data, Docker Compose (if
  needed), watch mode tests, multi-platform instructions (Mac, Linux, WSL),
  troubleshooting section. Complete Key Commands table.
- **mvp**: Dev server with live reload, basic lint and test commands, .env.example.
  Minimal docs. Key Commands table with essentials only.
- **custom:depth(1-5)**: Depth 1-2: dev server + test command. Depth 3: add
  database and env vars. Depth 4: add troubleshooting. Depth 5: full docs with
  multi-platform support.

## Mode Detection
Update mode if docs/dev-setup.md exists. In update mode: preserve port assignments,
custom scripts, .env variable names, database configuration, and Makefile
customizations. Update CLAUDE.md Key Commands section in-place.

## Update Mode Specifics
- **Detect prior artifact**: docs/dev-setup.md exists
- **Preserve**: port assignments, .env variable names and defaults, database
  connection strings, custom Makefile targets, troubleshooting entries
- **Triggers for update**: tech stack changed (new dev server or database),
  project structure changed (new config file locations), new dependencies
  require setup steps, tdd-standards.md changed test commands
- **Conflict resolution**: if a new dependency conflicts with an existing port
  or env var, propose a non-breaking alternative; always update CLAUDE.md Key
  Commands table to match actual Makefile/package.json after changes
