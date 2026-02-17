<!-- scaffold:project-structure v1 2026-02-16 -->
# Project Structure

Authoritative map of the Scaffold repository — where every file goes, why, and how directories relate to each other. All other docs (coding-standards, tech-stack, tdd-standards) reference this structure and must stay in sync with it.

## 1. Directory Tree

```
scaffold/
├── commands/                  # Individual command .md files (generated from prompts.md)
│   ├── add-maestro.md
│   ├── add-playwright.md
│   ├── ...
│   └── workflow-audit.md
├── scripts/                   # Bash utility scripts called by prompts
│   ├── extract-commands.sh
│   ├── install.sh
│   ├── uninstall.sh
│   ├── update.sh
│   └── user-stories-mmr.sh
├── lib/                       # Shared bash libraries and assets
│   ├── .gitkeep
│   └── dashboard-theme.css    # Dashboard CSS (embedded into generated HTML)
├── docs/                      # Project documentation and standards
│   ├── coding-standards.md
│   ├── design-system.md       # Dashboard visual design system
│   ├── project-structure.md   # This file
│   ├── tdd-standards.md
│   └── tech-stack.md
├── tests/                     # bats-core test files [NEW — scaffolded]
│   ├── test_helper/
│   │   ├── common-setup.bash  # Shared setup: temp dirs, fixtures, source lib
│   │   └── .gitkeep
│   ├── fixtures/              # Test data files (configs, frontmatter samples)
│   │   └── .gitkeep
│   └── screenshots/           # Dashboard visual testing (Playwright MCP)
│       ├── baseline/          # Committed — known-good reference screenshots
│       ├── current/           # Gitignored — current verification run
│       └── diff/              # Gitignored — visual comparison outputs
├── skills/                    # Auto-activated skills
│   └── scaffold-pipeline/
│       └── SKILL.md
├── .claude-plugin/            # Plugin manifest
│   ├── plugin.json
│   └── marketplace.json
├── .beads/                    # Beads issue database (committed, managed by bd CLI)
│   └── issues.jsonl
├── tasks/                     # Session-specific task notes
│   └── lessons.md
├── prompts.md                 # Source of truth for all prompts
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
.scaffold/                     # Created by /scaffold:init in target projects
├── config.json                # Pipeline state (profile, completed, skipped)
├── context.json               # Shared key-value context
├── decisions.json             # Append-only decision log
├── prompts/                   # Project-level prompt overrides
│   └── *.md
└── profiles/                  # Project-level custom profiles
    └── *.json
```

## 2. Module Organization Strategy

Scaffold uses a **role-based** organization. Each directory has a single clear purpose — there are no feature modules or domain groupings because Scaffold is a tool pipeline, not a feature-driven application.

| Role | Directory | Contents |
|------|-----------|----------|
| Prompts (source of truth) | `prompts.md` | All prompt text, extracted to `commands/` |
| Commands (distributed) | `commands/` | Individual `.md` files with YAML frontmatter |
| Scripts (deterministic ops) | `scripts/` | Bash utilities called by prompts |
| Shared library & assets | `lib/` | `common.sh` (sourced by scripts), `dashboard-theme.css` (embedded into HTML) |
| Tests | `tests/` | bats-core `.bats` files, one per script |
| Documentation | `docs/` | Standards docs, reviews, this file |
| Skills | `skills/` | Auto-activated skill files |
| Plugin manifest | `.claude-plugin/` | `plugin.json`, `marketplace.json` |
| Task tracking | `.beads/` | Beads issue database (committed) |

**Why role-based**: Scaffold isn't a feature-driven app — it's a tool pipeline. Each directory has a single clear purpose. There's no "auth module" or "sessions feature." Merge conflicts are minimized because prompt work, script work, and doc work happen in separate directories.

## 3. File Placement Rules

| File Type | Location | Naming Convention | Example |
|-----------|----------|-------------------|---------|
| Bash scripts | `scripts/` | `<name>.sh` (kebab-case) | `scripts/resolve-deps.sh` |
| Shared library functions | `lib/` | `common.sh` | `lib/common.sh` |
| Command prompts | `commands/` | `<slug>.md` (generated from `prompts.md`) | `commands/tech-stack.md` |
| Documentation | `docs/` | `<topic>.md` (kebab-case) | `docs/coding-standards.md` |
| Test files | `tests/` | `<script-name>.bats` | `tests/resolve-deps.bats` |
| Test fixtures | `tests/fixtures/` | `<descriptive-name>.<ext>` | `tests/fixtures/valid-config.json` |
| Test helpers | `tests/test_helper/` | `common-setup.bash` | `tests/test_helper/common-setup.bash` |
| JSON schemas | `scripts/` | `<name>.schema.json` | `scripts/user-stories-mmr.schema.json` |
| CSS / theme files | `lib/` | `<name>.css` (kebab-case) | `lib/dashboard-theme.css` |
| Skills | `skills/<skill-name>/` | `SKILL.md` | `skills/scaffold-pipeline/SKILL.md` |
| Config files | repo root | standard names | `.editorconfig`, `.shellcheckrc`, `.gitignore` |

**Rules:**

- **No barrel/index files** — Every file is imported directly by path.
- **No nested script directories** — All scripts live flat in `scripts/`. If the count grows beyond ~15, revisit.
- **One `.bats` file per script** — Mirrors the script it tests. `lib/common.sh` → `tests/common.bats`.
- **kebab-case everywhere** — Files, directories, command slugs. No camelCase, no snake_case in filenames.

## 4. Shared Code Strategy

### High-Contention Files

| File | Risk | Mitigation |
|------|------|------------|
| `prompts.md` | Single source of truth, ~3000 lines | Only one agent edits at a time. Extract to `commands/` after editing. |
| `lib/common.sh` | Sourced by every script | Add functions at the bottom. Each function is independent. |
| `CLAUDE.md` | Project guidance | Sections are independent — agents edit specific sections only. |
| `.beads/issues.jsonl` | Task tracking database | Managed by `bd` CLI — never edit directly. |

### Shared Utility Rule

A function goes in `lib/common.sh` only when used by 2+ scripts. Until then, keep it local in the script that needs it.

## 5. Import Conventions

Bash `source` ordering — shared library first, after error flags and path resolution:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."

source "$REPO_DIR/lib/common.sh"    # Shared library — always first
```

- No path aliases.
- No barrel files.
- No index files.
- Every script resolves its own `SCRIPT_DIR` and `REPO_DIR` — no reliance on `pwd`.

## 6. Test File Location

**Mirrored** strategy — each source file has a corresponding test file:

| Source | Test |
|--------|------|
| `scripts/<name>.sh` | `tests/<name>.bats` |
| `lib/common.sh` | `tests/common.bats` |

Supporting files:

| File | Purpose |
|------|---------|
| `tests/test_helper/common-setup.bash` | Shared setup: temp dirs, load bats helpers, source `lib/common.sh` |
| `tests/fixtures/` | Test data files: sample configs, frontmatter, prompts snippets |

Full test directory structure (from tdd-standards.md):

```
tests/
├── test_helper/
│   └── common-setup.bash       # Shared setup: temp dirs, load helpers, source lib
├── fixtures/
│   ├── valid-config.json        # Valid .scaffold/config.json for testing
│   ├── invalid-config.json      # Malformed config for error path tests
│   ├── sample-frontmatter.md    # Command file with valid frontmatter
│   ├── bad-frontmatter.md       # Command file with invalid/missing frontmatter
│   └── prompts-snippet.md       # Minimal prompts.md for extract-commands tests
├── common.bats                  # Tests for lib/common.sh
├── install.bats                 # Tests for scripts/install.sh
├── uninstall.bats               # Tests for scripts/uninstall.sh
├── update.bats                  # Tests for scripts/update.sh
├── extract-commands.bats        # Tests for scripts/extract-commands.sh
├── user-stories-mmr.bats        # Tests for scripts/user-stories-mmr.sh
├── resolve-deps.bats            # Tests for scripts/resolve-deps.sh
├── resolve-profile.bats         # Tests for scripts/resolve-profile.sh
├── resolve-prompt.bats          # Tests for scripts/resolve-prompt.sh
├── check-artifacts.bats         # Tests for scripts/check-artifacts.sh
├── detect-completion.bats       # Tests for scripts/detect-completion.sh
├── validate-config.bats         # Tests for scripts/validate-config.sh
└── validate-frontmatter.bats    # Tests for scripts/validate-frontmatter.sh
```

## 7. Generated vs. Committed Files

| Committed | Not Committed (in .gitignore) |
|-----------|-------------------------------|
| All source files (scripts, commands, docs, lib) | `coverage/` (kcov output) |
| `.beads/issues.jsonl` (task database) | `*.tmp` (atomic write temp files) |
| Config files (`.editorconfig`, `.shellcheckrc`) | `.DS_Store` (already ignored) |
| `plugin.json`, `marketplace.json` | `.history/` (already ignored) |
| `tests/fixtures/` (test data) | `*~` (editor backup files) |
| `tests/screenshots/baseline/` (reference screenshots) | `*.bak` (editor backup files) |
| `.gitkeep` files (empty dir placeholders) | `tests/screenshots/current/` (verification runs) |
| | `tests/screenshots/diff/` (comparison outputs) |
| | `.playwright-mcp/` (Playwright MCP cache) |

## 8. Root-Level File Policy

Root level is reserved for project-wide config and documentation:

| Category | Files |
|----------|-------|
| Source of truth | `prompts.md` |
| Project docs | `CLAUDE.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`, `LICENSE` |
| Tooling config | `.editorconfig`, `.shellcheckrc`, `.gitignore`, `.gitattributes` |

**No feature code, research notes, or ad-hoc files at root.**

> **Note**: Three loose files currently at root (`add-multi-model-review.md`, `Multi Model Review Cost Analysis.md`, `Multi Model Review Research.md`) predate this policy and should be relocated. Tracked in Beads.
