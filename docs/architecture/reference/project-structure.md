<!-- scaffold:project-structure v2 2026-03-12 -->
# Project Structure

Repository-oriented map of the Scaffold codebase and generated project runtime layout. The target-project runtime section below is current; some repository examples remain historical reference material for older prompt-packaging layouts.

## 1. Directory Tree

```
scaffold/
├── commands/                  # Individual command .md files (36, generated from prompts.md)
│   ├── add-e2e-testing.md
│   ├── beads.md
│   ├── ...                    # 30 more command files
│   ├── version-bump.md
│   ├── version.md
│   └── workflow-audit.md
├── scripts/                   # Bash utility scripts and JSON schemas
│   ├── extract-commands.sh
│   ├── generate-dashboard.sh
│   ├── implementation-plan-mmr.sh
│   ├── implementation-plan-mmr.schema.json
│   ├── install-hooks.sh
│   ├── install.sh
│   ├── setup-agent-worktree.sh
│   ├── uninstall.sh
│   ├── update.sh
│   └── validate-frontmatter.sh
├── lib/                       # Shared assets
│   └── dashboard-theme.css    # Dashboard CSS (embedded into generated HTML)
├── docs/                      # Project documentation and standards
│   ├── coding-standards.md
│   ├── design-system.md       # Dashboard visual design system
│   ├── dev-setup.md           # Development environment setup
│   ├── git-workflow.md        # Git branching and PR workflow
│   ├── plan.md                # Product requirements document (PRD)
│   ├── project-structure.md   # This file
│   ├── scaffold-overview.md   # High-level project overview
│   ├── tdd-standards.md
│   ├── tech-stack.md
│   ├── user-stories.md
│   ├── add-automated-pr-review.md
│   ├── multi-model-stories-review-setup.md
│   ├── reviews/               # Multi-model review artifacts
│   │   └── user-stories/      # Codex/Gemini review data, coverage analysis
│   └── superpowers/           # Superpowers integration specs
│       └── specs/
├── tests/                     # bats-core test files
│   ├── generate-dashboard.bats
│   ├── setup-agent-worktree.bats
│   ├── validate-frontmatter.bats
│   ├── test_helper/           # Shared test setup (placeholder)
│   ├── fixtures/              # Test data files (placeholder)
│   └── screenshots/           # Dashboard visual testing (Playwright MCP)
│       ├── baseline/          # Committed — known-good reference screenshots
│       ├── current/           # Gitignored — current verification run
│       └── diff/              # Gitignored — visual comparison outputs
├── skills/                    # Auto-activated skills
│   └── scaffold-pipeline/
│       └── SKILL.md
├── agent-skills/              # Shared skill sources packaged for project-local installs
│   ├── scaffold-pipeline/
│   │   └── SKILL.md
│   └── scaffold-runner/
│       └── SKILL.md
├── .claude-plugin/            # Plugin manifest
│   ├── plugin.json
│   └── marketplace.json
├── .github/                   # GitHub CI and templates
│   ├── workflows/
│   │   └── ci.yml             # Runs make check on PRs
│   └── pull_request_template.md
├── .claude/                   # Claude Code configuration
│   ├── settings.json          # Project-level permissions
│   └── settings.local.json    # Local machine overrides
├── .beads/                    # Beads task database (managed by bd CLI)
│   ├── config.yaml            # Beads project configuration
│   ├── beads.db               # SQLite database
│   ├── issues.jsonl           # Issue log
│   ├── interactions.jsonl     # Interaction history
│   ├── metadata.json          # Database metadata
│   ├── sync-state.json        # Git sync state
│   └── dolt/                  # Distributed database storage
├── tasks/                     # Session-specific task notes
│   └── lessons.md
├── prompts.md                 # Source of truth for all prompts
├── Makefile                   # Build automation (test, lint, validate, check)
├── CLAUDE.md                  # AI agent guidance
├── AGENTS.md                  # Multi-agent coordination
├── README.md                  # Project overview
├── CHANGELOG.md               # Release history
├── LICENSE                    # MIT license
├── .editorconfig              # Editor formatting rules
├── .shellcheckrc              # ShellCheck configuration
├── .gitignore                 # Git ignore patterns
└── .gitattributes             # Git file attributes
```

**Runtime directory (target projects only — not in this repo):**

```
.scaffold/
  config.yml                    # Methodology + project config
  state.json                    # Pipeline state (committed)
  decisions.jsonl               # Decision log (committed)
  lock.json                     # Advisory lock (gitignored)
  instructions/                 # User instructions
    global.md                   # Applied to all steps
    <step-name>.md              # Applied to specific step
  generated/                    # Hidden adapter artifacts (gitignored)
    claude-code/
      commands/
        <step-name>.md
    codex/
      AGENTS.md
    universal/
      prompts/
        README.md
.agents/
  skills/
    scaffold-pipeline/
      SKILL.md
    scaffold-runner/
      SKILL.md
GEMINI.md                       # Managed project instructions that import the shared skills
.gemini/
  commands/
    scaffold/
      *.toml
```

`scaffold init` and `scaffold build` maintain a dedicated `.gitignore` block for `.scaffold/generated/`, `.scaffold/lock.json`, and Scaffold temp files. Root-level `commands/`, `prompts/`, `codex-prompts/`, and generated `AGENTS.md` are no longer Scaffold-owned project outputs.

## 2. Module Organization Strategy

Scaffold uses a **role-based** organization. Each directory has a single clear purpose — there are no feature modules or domain groupings because Scaffold is a tool pipeline, not a feature-driven application.

| Role | Directory | Contents |
|------|-----------|----------|
| Prompts (source of truth) | `prompts.md` | All prompt text, extracted to `commands/` |
| Commands (distributed) | `commands/` | Individual `.md` files with YAML frontmatter (36 files) |
| Scripts (deterministic ops) | `scripts/` | Bash utilities and JSON schemas called by prompts |
| Shared assets | `lib/` | `dashboard-theme.css` (embedded into generated HTML) |
| Tests | `tests/` | bats-core `.bats` files, one per script |
| Documentation | `docs/` | Standards docs, reviews, specs, this file |
| Skills | `skills/` | Auto-activated skill files |
| Shared agent skills | `agent-skills/` | Packaged skill sources copied into project-local installs |
| Plugin manifest | `.claude-plugin/` | `plugin.json`, `marketplace.json` |
| CI/CD & templates | `.github/` | GitHub Actions workflows, PR template |
| Claude Code config | `.claude/` | Project and local permissions (`settings.json`) |
| Task tracking | `.beads/` | Beads SQLite database (managed by `bd` CLI) |
| Session notes | `tasks/` | Learning log (`lessons.md`) |

**Why role-based**: Scaffold isn't a feature-driven app — it's a tool pipeline. Each directory has a single clear purpose. There's no "auth module" or "sessions feature." Merge conflicts are minimized because prompt work, script work, and doc work happen in separate directories.

## 3. File Placement Rules

| File Type | Location | Naming Convention | Example |
|-----------|----------|-------------------|---------|
| Bash scripts | `scripts/` | `<name>.sh` (kebab-case) | `scripts/generate-dashboard.sh` |
| JSON schemas | `scripts/` | `<name>.schema.json` | `scripts/implementation-plan-mmr.schema.json` |
| Command prompts | `commands/` | `<slug>.md` (generated from `prompts.md`) | `commands/tech-stack.md` |
| Documentation | `docs/` | `<topic>.md` (kebab-case) | `docs/coding-standards.md` |
| Test files | `tests/` | `<script-name>.bats` | `tests/generate-dashboard.bats` |
| Test fixtures | `tests/fixtures/` | `<descriptive-name>.<ext>` | `tests/fixtures/valid-config.json` |
| Test helpers | `tests/test_helper/` | `common-setup.bash` | `tests/test_helper/common-setup.bash` |
| CSS / theme files | `lib/` | `<name>.css` (kebab-case) | `lib/dashboard-theme.css` |
| Skills | `skills/<skill-name>/` | `SKILL.md` | `skills/scaffold-pipeline/SKILL.md` |
| Shared agent skills | `agent-skills/<skill-name>/` | `SKILL.md` | `agent-skills/scaffold-runner/SKILL.md` |
| GitHub workflows | `.github/workflows/` | `<name>.yml` (kebab-case) | `.github/workflows/ci.yml` |
| Config files | repo root | standard names | `.editorconfig`, `.shellcheckrc`, `.gitignore` |

**Rules:**

- **No barrel/index files** — Every file is imported directly by path.
- **No nested script directories** — All scripts live flat in `scripts/`. If the count grows beyond ~15, revisit.
- **One `.bats` file per script** — Mirrors the script it tests.
- **kebab-case everywhere** — Files, directories, command slugs. No camelCase, no snake_case in filenames.

## 4. Shared Code Strategy

### High-Contention Files

| File | Risk | Mitigation |
|------|------|------------|
| `prompts.md` | Single source of truth, ~8500 lines | Only one agent edits at a time. Extract to `commands/` after editing. |
| `CLAUDE.md` | Project guidance | Sections are independent — agents edit specific sections only. |
| `.beads/beads.db` | Task tracking database | Managed by `bd` CLI — never edit directly. |

### Shared Utility Rule (future)

When scripts share common functions, extract them to `lib/common.sh` — but only when used by 2+ scripts. Until then, keep functions local in the script that needs them. Currently no shared bash library exists; `lib/` contains only CSS assets.

## 5. Import Conventions

Bash script preamble — error flags and path resolution:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."
```

When a shared library (`lib/common.sh`) is introduced in the future, source it after path resolution:

```bash
source "$REPO_DIR/lib/common.sh"    # Shared library — always first
```

- No path aliases.
- No barrel files.
- No index files.
- Every script resolves its own `SCRIPT_DIR` and `REPO_DIR` — no reliance on `pwd`.

## 6. Test File Location

**Mirrored** strategy — each source script should have a corresponding test file:

| Source | Test |
|--------|------|
| `scripts/<name>.sh` | `tests/<name>.bats` |

Supporting files:

| File | Purpose |
|------|---------|
| `tests/test_helper/` | Shared test setup (placeholder — populate as test suite grows) |
| `tests/fixtures/` | Test data files (placeholder — add configs, frontmatter samples as needed) |

Current test directory structure:

```
tests/
├── generate-dashboard.bats      # Tests for scripts/generate-dashboard.sh
├── setup-agent-worktree.bats    # Tests for scripts/setup-agent-worktree.sh
├── validate-frontmatter.bats    # Tests for scripts/validate-frontmatter.sh
├── test_helper/                 # Shared test setup (placeholder)
├── fixtures/                    # Test data files (placeholder)
└── screenshots/                 # Dashboard visual testing (Playwright MCP)
    ├── baseline/                # Committed — known-good reference screenshots
    ├── current/                 # Gitignored — current verification run
    ├── diff/                    # Gitignored — visual comparison outputs
    └── dashboard-test.html      # Generated by make dashboard-test (gitignored)
```

Additional `.bats` files should be added as scripts are created or modified, following the mirrored naming convention.

## 7. Generated vs. Committed Files

| Committed | Not Committed (in .gitignore) |
|-----------|-------------------------------|
| All source files (scripts, commands, docs, lib) | `coverage/` (kcov output) |
| `.beads/config.yaml`, `issues.jsonl`, `metadata.json` | `.beads/beads.db-wal`, `.beads/beads.db-shm` (WAL files) |
| `.beads/beads.db` (task database) | `.beads/daemon.*` (daemon lock/pid/log) |
| Config files (`.editorconfig`, `.shellcheckrc`) | `.beads/ephemeral.sqlite3` |
| `plugin.json`, `marketplace.json` | `*.tmp` (atomic write temp files) |
| `tests/fixtures/` (test data) | `.DS_Store` (already ignored) |
| `tests/screenshots/baseline/` (reference screenshots) | `.history/` (already ignored) |
| `.github/` (CI workflows, PR template) | `*~`, `*.bak` (editor backup files) |
| | `tests/screenshots/current/` (verification runs) |
| | `tests/screenshots/diff/` (comparison outputs) |
| | `tests/screenshots/dashboard-test.html` (generated) |
| | `.playwright-mcp/` (Playwright MCP cache) |
| | `.worktrees/` (git worktree working dirs) |

## 8. Root-Level File Policy

Root level is reserved for project-wide config and documentation:

| Category | Files |
|----------|-------|
| Source of truth | `prompts.md` |
| Build automation | `Makefile` |
| Project docs | `CLAUDE.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`, `LICENSE` |
| Tooling config | `.editorconfig`, `.shellcheckrc`, `.gitignore`, `.gitattributes` |

**No feature code, research notes, or ad-hoc files at root.**
