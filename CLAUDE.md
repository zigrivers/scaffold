# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Minimal code, minimal impact. Don't over-engineer.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **TDD Always**: Write failing tests first, then make them pass, then refactor. No exceptions.
- **Prove It Works**: Never mark a task complete without demonstrating correctness — tests pass, logs clean, behavior verified.

## Project Overview

This is a **prompt pipeline** — a curated sequence of structured meta-prompts used to scaffold new software projects with Claude Code and other supported AI tools. The pipeline is defined as individual `.md` files in `content/pipeline/`, organized into 16 phases, and assembled into full prompts at runtime by the TypeScript CLI.

## Structure

This repo is a **Claude Code plugin** (installable via `/plugin marketplace add`) and a TypeScript CLI distributed via npm and Homebrew.

### Source of Truth
- `content/pipeline/` — 60 meta-prompt files organized into 16 phases (source of truth for pipeline steps)
- `content/tools/` — 11 tool meta-prompts (`category: tool`, `stateless: true`) orthogonal to the pipeline
- `content/knowledge/` — 64 domain expertise entries in 7 categories (injected into prompts during assembly)
- `content/skills/` — Skill templates with `{{markers}}` for multi-platform resolution
- `content/methodology/` — Preset configs (deep, mvp, custom)
- `src/types/frontmatter.ts` — Canonical `PHASES` constant defining all 16 phase slugs, numbers, and display names

### Legacy (v1)
The original v1 prompt content is archived at `docs/archive/prompts-v1.md`. It is **not** the source of truth — pipeline steps in `content/pipeline/` are authoritative.

### Plugin Structure
- `.claude-plugin/plugin.json` — Plugin manifest (name: `scaffold`)
- `skills/` — Generated skills (built from `content/skills/` templates; gitignored)
- `scripts/` — Bash utility scripts

## Key Concepts

- **Phases are sequential**: Phase 0 (prerequisites) through Phase 7 (implementation), with dependency constraints documented in the "Key Dependencies Between Prompts" section
- **Worktrees** are used for parallel agent execution — see `docs/git-workflow.md` section 7 for setup
- **Optional prompts** are marked and only apply to specific project types (web apps, mobile/Expo, multi-platform)

## Editing Guidelines

When modifying prompts:
- Preserve the `# Name (Prompt)` heading convention — this is how prompts are identified
- Respect inter-prompt dependencies (documented in frontmatter `depends-on` fields)
- Every document-creating prompt has a **Mode Detection** block and **Update Mode Specifics** block — when modifying prompts, preserve these blocks and keep them positioned after the opening paragraph and before the first content section
- When adding a new document-creating prompt, include Mode Detection + Update Mode Specifics following the same pattern as existing prompts (check any existing prompt for the template)

### Key Commands

| Command | Purpose |
|---------|---------|
| `make check` | Run bash quality gates (lint + validate + test + eval) |
| `make check-all` | Run all quality gates (bash + TypeScript) |
| `make test` | Run bats test suite |
| `make lint` | Run ShellCheck on all shell scripts |
| `make validate` | Validate frontmatter in pipeline and tool files |
| `make setup` | Install dev dependencies via Homebrew |
| `make hooks` | Install pre-commit and pre-push hooks |
| `scripts/setup-agent-worktree.sh <name>` | Create worktree for parallel agent |
| `git worktree list` | List all active worktrees |
| `gh pr create` | Create pull request from current branch |
| `gh pr merge --squash --delete-branch` | Squash-merge PR and clean up branch |
| `gh pr diff` | Review PR diff before merging |
| `gh pr checks` | Check CI status on current PR |
| `make dashboard-test` | Generate test-ready dashboard HTML for visual verification |

### Committing and Creating PRs

1. Run `make check-all` to verify all quality gates pass
2. Push branch: `git push -u origin HEAD`
3. Create PR: `gh pr create`
4. Wait for CI (`check` job) to pass
5. Squash-merge: `gh pr merge --squash --delete-branch`

See `docs/git-workflow.md` for the full workflow.

### Scaffold Release Workflow

The generic `/scaffold:release` command is for downstream projects. When
releasing Scaffold itself, use the maintainer flow in
`docs/architecture/operations-runbook.md`.

Minimum checklist:
- Update `CHANGELOG.md` and `README.md` when user-facing behavior or install,
  upgrade, or migration guidance changed
- Merge release-prep work to `main`
- Tag `main` with `vX.Y.Z` and push the tag
- Create the GitHub release
- `publish.yml` uses npm trusted publishing via GitHub OIDC; if npm publish
  fails with auth errors, verify the trusted-publisher config in npm package
  settings rather than looking for a repo `NPM_TOKEN` secret
- Verify npm publish and Homebrew update workflows succeeded
- Verify users can update with `npm update -g @zigrivers/scaffold` and
  `brew upgrade scaffold`

## Self-Improvement

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules that prevent the same mistake recurring
- Review `tasks/lessons.md` at session start before picking up work

## Autonomous Behavior

- **Fix bugs on sight**: When encountering bugs, errors, or failing tests — fix them. Zero hand-holding required.
- **Use subagents**: Offload research, exploration, and parallel analysis to subagents. Keeps main context clean.
- **Re-plan when stuck**: If implementation goes sideways, stop and rethink your approach rather than pushing through. (Do NOT enter interactive `/plan` mode — just think through the problem and adjust.)

## Code Review

Before pushing, review `git diff origin/main...HEAD` against CLAUDE.md and docs/coding-standards.md. Fix any issues and re-run `make check-all`. Log recurring patterns to tasks/lessons.md.

### Mandatory Code Review

**Mandatory after `gh pr create`** — run all review channels before moving to
the next task. A PostToolUse hook on `gh pr create` will remind you.
**Optional but supported** for any non-PR target: staged changes, an unstaged
working tree, a branch diff, a specific diff file, or an arbitrary document.
The MMR CLI accepts any of these — the review is not gated to PRs.

**Channel model:** direct `mmr review` runs the three CLI channels (Codex,
Gemini, Claude). The scaffold wrappers (`scaffold run review-pr` and
`scaffold run review-code`) add the Superpowers code-reviewer agent as a
complementary 4th channel and reconcile its findings into the same MMR job.
(`scaffold run post-implementation-review` has its own channel layout
documented in `content/tools/post-implementation-review.md` — consult that
file directly rather than assuming it matches this pattern.)

**Entry points by target:**
- PR → `scaffold run review-pr` (or `mmr review --pr <number>`)
- Local code before commit → `scaffold run review-code` (recommended — covers
  staged, unstaged, **and untracked** files). Direct-CLI equivalents:
  `mmr review --staged` for staged only, or `git diff HEAD | mmr review --diff -`
  for all **tracked** uncommitted changes (this does not include untracked
  files; use `review-code` for full worktree coverage).
- Branch diff → `mmr review --base <ref> --head <ref>`
- Changes to a specific file or doc →
  `git diff HEAD -- path/to/file.md | mmr review --diff -`
- Untracked / brand-new file (synthesize an "all added" diff) →
  `diff -u /dev/null path/to/new.md | mmr review --diff -`
- Pre-made patch or diff file → `mmr review --diff path/to/changes.patch`

The `--diff` flag expects diff-format content (a path to a `.patch`/`.diff`
file, or `-` for stdin piping a git/diff command). It does **not** accept raw
document content — wrap the target in a diff first.

The wrapper tools (`review-pr`, `review-code`) handle dispatch, auth checks,
reconciliation, and verdict logic. For targets not covered by a wrapper, call
`mmr review` directly — it accepts `--focus "…" --sync --format json` the same
way.

**The three channels:**
1. **Codex CLI** — implementation correctness, security, API contracts
2. **Gemini CLI** — architectural patterns, broad-context reasoning
3. **Claude CLI** — plan alignment, code quality, testing

**Critical rules:**
- **Foreground only** — Always run Codex, Gemini, and Claude CLI commands as
  foreground Bash calls. Never use `run_in_background`, `&`, or `nohup`.
  Background execution produces empty output. Multiple foreground calls in a
  single message are fine (the tool runner supports parallel invocations).
- **All 3 channels are required** — A channel enters degraded mode when it is
  not installed (`command -v` fails), auth fails and the user cannot recover,
  or it fails during execution (non-zero exit, malformed output, timeout).
  Run a compensating pass via `claude -p` for each missing **external**
  channel (Codex or Gemini), focused on that channel's strength area and
  labeled `[compensating: Codex-equivalent]` or
  `[compensating: Gemini-equivalent]`. Compensating findings are single-source
  confidence.
- **Auth failures are NOT silent** — surface to the user with recovery commands:
  - Codex: `! codex login`
  - Gemini: `! gemini -p "hello"`
- **Independence** — never share one channel's output with another.
- **Fix all P0/P1/P2** findings before proceeding to the next task.
- **Verdict handling** — proceed only on `pass` or `degraded-pass`. If the
  review returns `blocked` or `needs-user-decision`, stop and surface the
  verdict and remaining findings to the user. Do NOT merge automatically.
- **3-round limit** — after 3 fix rounds with unresolved findings, stop and
  ask the user.

**Quick reference** (when `scaffold run` is unavailable):
<!-- Escape hatch only. Canonical commands live in content/tools/review-pr.md.
     Update both if CLI syntax changes. -->
```bash
# Primary — pick the input mode that matches your target
mmr review --pr "$PR_NUMBER" --sync --format json                    # PR
mmr review --staged --sync --format json                             # pre-commit (staged)
git diff HEAD | mmr review --diff - --sync --format json             # tracked uncommitted (no untracked)
mmr review --base main --head "$BRANCH" --sync --format json         # branch diff
git diff HEAD -- docs/foo.md | mmr review --diff - --sync --format json  # single file
mmr review --diff path/to/changes.patch --sync --format json         # existing diff file

# Capture job_id, dispatch agent review, then inject:
mmr reconcile "$JOB_ID" --channel superpowers --input findings.json

# Fallback (text output for human reading)
mmr review --pr "$PR_NUMBER" --sync --format text

# Manual fallback — installation checks
command -v codex >/dev/null 2>&1 || echo "Codex not installed"
command -v gemini >/dev/null 2>&1 || echo "Gemini not installed"

# Manual fallback — auth checks
codex login status 2>/dev/null
NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1

# Manual fallback — review dispatch (foreground only — never run_in_background)
codex exec --skip-git-repo-check -s read-only --ephemeral "PROMPT" 2>/dev/null
NO_BROWSER=true gemini -p "PROMPT" --output-format json --approval-mode yolo 2>/dev/null
claude -p "PROMPT" --output-format json 2>/dev/null
```

## Project Structure Quick Reference

See `docs/project-structure.md` for the full authoritative guide.

| Directory | Purpose |
|-----------|---------|
| `content/pipeline/` | Meta-prompt files organized by phase (source of truth) |
| `content/tools/` | Stateless tool meta-prompts |
| `content/knowledge/` | Domain expertise entries injected during assembly |
| `content/methodology/` | Preset methodology configs (mvp, deep) |
| `content/skills/` | Skill templates with `{{markers}}` for multi-platform resolution |
| `src/` | TypeScript CLI source code |
| `scripts/` | Bash utility scripts |
| `lib/` | Shared assets (dashboard CSS) |
| `docs/` | Project documentation and standards |
| `docs/architecture/` | Active system architecture and design docs |
| `docs/archive/` | Historical artifacts and legacy content |
| `tests/` | bats-core and vitest test files |
| `tasks/` | Lessons learned and session notes |
| `.claude-plugin/` | Plugin manifest (`plugin.json`) |
| `.scaffold/` | Runtime state (config, state, decisions) |

**File placement**: Scripts → `scripts/<name>.sh` | Tests → `tests/<name>.bats` | Docs → `docs/<topic>.md` | Source → `src/` | Content → `content/<category>/`

## Dev Environment

See `docs/dev-setup.md` for the full setup guide.

- **Build tool**: GNU Make (`Makefile` at repo root)
- **Lint**: ShellCheck (`make lint`)
- **Test**: bats-core (`make test`)
- **All gates**: `make check-all` (bash + TypeScript)
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
| What's the prompt pipeline order? | `content/pipeline/` directory (organized by phase) |
