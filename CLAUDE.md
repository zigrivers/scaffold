# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code, minimal impact. Don't over-engineer.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **TDD Always**: Write failing tests first, then make them pass, then refactor. No exceptions.
- **Prove It Works**: Never mark a task complete without demonstrating correctness — tests pass, logs clean, behavior verified.

## Project Overview

This is a **prompt pipeline** — a curated sequence of structured prompts used to scaffold new software projects with Claude Code. The entire pipeline lives in a single file (`prompts.md`) and is designed to be run in order, with each prompt building on artifacts produced by earlier ones.

## Structure

This repo is a **Claude Code plugin** (installable via `/plugin marketplace add`) and also distributable as user commands.

### Source of Truth
`prompts.md` contains:
1. **Setup Order table** (top of file) — The execution sequence across 7 phases, from product definition through implementation
2. **Individual prompt sections** — Each marked with `# Prompt Name (Prompt)`, containing the full prompt text to paste into Claude Code sessions
3. **Update mode** — All document-creating prompts auto-detect fresh vs. update mode via Mode Detection blocks

### Plugin Structure
- `.claude-plugin/plugin.json` — Plugin manifest (name: `scaffold`)
- `commands/` — 25 individual command `.md` files with YAML frontmatter and "Next Steps" guidance, generated from `prompts.md`
- `skills/scaffold-pipeline/SKILL.md` — Auto-activated pipeline context skill
- `scripts/` — Install, uninstall, and extraction scripts

## Key Concepts

- **Phases are sequential**: Phase 0 (prerequisites) through Phase 7 (implementation), with dependency constraints documented in the "Key Dependencies Between Prompts" section
- **Beads** (`@beads/bd`) is the task tracking tool used throughout the pipeline
- **Worktrees** are used for parallel agent execution — the Git Workflow prompt sets up permanent worktrees for multiple Claude Code sessions
- **Optional prompts** are marked and only apply to specific project types (web apps, mobile/Expo, multi-platform)
- **Parallel agents** pull tasks from Beads and work in separate git worktrees — see `docs/git-workflow.md` section 10 for setup

## Editing Guidelines

When modifying prompts:
- Preserve the `# Name (Prompt)` heading convention — this is how prompts are identified
- Keep the Setup Order table at the top in sync with the actual prompt sections below
- Respect inter-prompt dependencies (documented in the dependency graph at line ~128)
- Each prompt's "Process" section at the end defines its execution rules — don't remove these
- After editing `prompts.md`, update the corresponding file in `commands/` to stay in sync (frontmatter + "After This Step" sections are maintained in `commands/` only, not in `prompts.md`)
- Every document-creating prompt has a **Mode Detection** block and **Update Mode Specifics** block — when modifying prompts, preserve these blocks and keep them positioned after the opening paragraph and before the first content section
- When adding a new document-creating prompt, include Mode Detection + Update Mode Specifics following the same pattern as existing prompts (check any existing prompt for the template)

## Task Management (Beads)

All task tracking lives in Beads — no separate todo files.

### Creating Tasks
```bash
bd create "Imperative, specific title" -p <0-3>
bd update <id> --claim                   # Always claim after creating
bd dep add <child> <parent>              # Child blocked by parent
```

Priority levels:
- 0 = blocking release
- 1 = must-have v1
- 2 = should-have
- 3 = nice-to-have

Good titles: `"Fix streak calculation for timezone edge case"`
Bad titles: `"Backend stuff"`

### Closing Tasks
```bash
bd close <id>                            # Marks complete — use this, not bd update --status completed
bd sync                                  # Force sync to git
```

### Key Commands

| Command | Purpose |
|---------|---------|
| `make check` | Run all quality gates (lint + validate + test) |
| `make test` | Run bats test suite |
| `make lint` | Run ShellCheck on all shell scripts |
| `make validate` | Validate frontmatter in command files |
| `make setup` | Install dev dependencies via Homebrew |
| `make hooks` | Install pre-commit and pre-push hooks |
| `make install` | Install scaffold commands to ~/.claude/commands/ |
| `make extract` | Extract commands from prompts.md |
| `bd ready` | Show unblocked tasks ready for work |
| `bd create "Title" -p N` | Create task with priority |
| `bd update <id> --status S` | Update status (in_progress, blocked, etc.) |
| `bd update <id> --claim` | Claim task (uses BD_ACTOR for attribution) |
| `bd close <id>` | Close completed task |
| `bd dep add <child> <parent>` | Add dependency |
| `bd dep tree <id>` | View dependency graph |
| `bd show <id>` | Full task details |
| `bd sync` | Force sync to git |
| `bd list` | List all tasks |
| `bd dep cycles` | Debug stuck/circular dependencies |
| `scripts/setup-agent-worktree.sh <name>` | Create permanent worktree for parallel agent |
| `git worktree list` | List all active worktrees |
| `gh pr create` | Create pull request from current branch |
| `gh pr merge --squash --delete-branch` | Squash-merge PR and clean up branch |
| `gh pr diff` | Review PR diff before merging |
| `gh pr checks` | Check CI status on current PR |
| `git push --force-with-lease` | Safe force push after rebase (feature branches only) |
| `make dashboard-test` | Generate test-ready dashboard HTML for visual verification |

**NEVER** use `bd edit` — it opens an interactive editor and breaks AI agents.

### Every Commit Needs a Task

All commits require a Beads task ID in the message: `[BD-<id>] type(scope): description`

If you encounter a bug or need to make an ad-hoc fix:
```bash
bd create "fix: <description>" -p 1
bd update <id> --claim
# implement fix, then close when done
bd close <id>
```
This keeps Beads as the single source of truth for all changes.

### Committing and Creating PRs

1. Run `make check` to verify all quality gates pass
2. Rebase on latest main: `git fetch origin && git rebase origin/main`
3. Push branch: `git push -u origin HEAD`
4. Create PR: `gh pr create --title "[BD-<id>] type(scope): description"`
5. Wait for CI (`check` job) to pass
6. Self-review: `gh pr diff`
7. Merge: `gh pr merge --squash --delete-branch`

See `docs/git-workflow.md` for the full PR workflow.

### Task Closure and Next Task

After a PR is merged:
```bash
bd close <id>
bd sync
bd ready                # Pick next task
```

In a worktree, also update main first:
```bash
bd close <id>
bd sync
git checkout main && git pull origin main
bd ready
```

### Parallel Sessions (Worktrees)

Each parallel agent runs in its own git worktree — an independent working directory sharing the same `.git` repository.

```bash
# Create a worktree for a new agent
scripts/setup-agent-worktree.sh agent-1

# Set agent identity for Beads attribution
export BD_ACTOR="agent-1"

# Install dev dependencies in the worktree
make setup
```

### Worktree Awareness

When running in a worktree:
- **Always check `bd ready`** before starting work — another agent may have claimed your next task
- **Rebase frequently** — other agents are merging to main
- **Never edit high-contention files** (`prompts.md`, `CLAUDE.md`) without rebasing first
- **Use `bd update <id> --claim`** immediately after picking a task to prevent conflicts

## Self-Improvement

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake recurring
- Review `tasks/lessons.md` at session start before picking up work

## Autonomous Behavior

- **Fix bugs on sight**: When encountering bugs, errors, or failing tests — create a Beads task and fix them. Zero hand-holding required.
- **Use subagents**: Offload research, exploration, and parallel analysis to subagents. Keeps main context clean.
- **Keep working**: Continue until `bd ready` returns no available tasks.
- **Re-plan when stuck**: If implementation goes sideways, stop and rethink your approach rather than pushing through. (Do NOT enter interactive `/plan` mode — just think through the problem and adjust.)

## Project Structure Quick Reference

See `docs/project-structure.md` for the full authoritative guide.

| Directory | Purpose |
|-----------|---------|
| `commands/` | Individual command `.md` files (generated from `prompts.md`) |
| `scripts/` | Bash utility scripts called by prompts |
| `lib/` | Shared bash libraries (`common.sh`) |
| `docs/` | Project documentation and standards |
| `tests/` | bats-core `.bats` test files |
| `tests/test_helper/` | Shared test setup (`common-setup.bash`) |
| `tests/fixtures/` | Test data files |
| `skills/` | Auto-activated skills |
| `.claude-plugin/` | Plugin manifest (`plugin.json`) |
| `.beads/` | Beads issue database (managed by `bd` CLI) |

**File placement**: Scripts → `scripts/<name>.sh` | Tests → `tests/<name>.bats` | Docs → `docs/<topic>.md` | Shared functions → `lib/common.sh` (only when used by 2+ scripts)

## Dev Environment

See `docs/dev-setup.md` for the full setup guide.

- **Build tool**: GNU Make (`Makefile` at repo root)
- **Lint**: ShellCheck (`make lint`)
- **Test**: bats-core (`make test`)
- **All gates**: `make check` (lint + validate + test)
- **Git hooks**: `make hooks` installs pre-commit (ShellCheck + frontmatter) and pre-push (test suite)

## Design System

Before modifying any dashboard HTML/CSS, review `docs/design-system.md`.

### Key Rules
- Use ONLY colors from CSS custom properties in `lib/dashboard-theme.css`
- Use ONLY spacing values from the defined `--sp-*` scale
- Follow component patterns exactly — don't invent new styles
- Always provide both light and dark mode token values
- Config: `lib/dashboard-theme.css`

## Browser Testing with Playwright MCP

Use Playwright MCP tools to visually verify the pipeline dashboard after modifying dashboard CSS, HTML, or JS.

### When to Use

After any change to:
- `scripts/generate-dashboard.sh` (HTML structure, inline JS)
- `lib/dashboard-theme.css` (styles, theme tokens)
- Dashboard-related bats tests that affect rendered output

### Setup & Verification Process

```bash
make dashboard-test    # Generates tests/screenshots/dashboard-test.html
```

Then use Playwright MCP tools:
1. `browser_navigate` to `file://` path from make output
2. `browser_resize` to 1280×800 (desktop) → `browser_take_screenshot`
3. `browser_resize` to 375×812 (mobile) → `browser_take_screenshot`
4. `browser_run_code` to emulate dark mode → repeat screenshots
5. `browser_click` interactive elements (expand/collapse, filters)
6. `browser_snapshot` to verify accessibility
7. `browser_close`

### Screenshot Convention

Save to `tests/screenshots/current/` with naming: `{feature}_{viewport}_{state}.png`

Examples: `dashboard_desktop_default.png`, `dashboard_mobile_dark.png`

### Baseline Management

- Baselines: `tests/screenshots/baseline/` (committed)
- Current: `tests/screenshots/current/` (gitignored)
- Update baselines only for intentional visual changes — copy from `current/` to `baseline/` and commit

### Minimum Checks Per Dashboard Change

- Desktop + mobile light mode
- Desktop + mobile dark mode
- Interactive elements (expand/collapse sections)
- Compare against baselines

## When to Consult Other Docs

| Question | Document |
|----------|----------|
| How do I branch, commit, create PRs? | `docs/git-workflow.md` |
| What are the coding conventions? | `docs/coding-standards.md` |
| How is the project structured? | `docs/project-structure.md` |
| How do I set up my dev environment? | `docs/dev-setup.md` |
| How should dashboard HTML/CSS look? | `docs/design-system.md` |
| How do I visually test the dashboard? | `docs/tdd-standards.md` Section 7 |
| What's the prompt pipeline order? | `prompts.md` (Setup Order table at top) |
