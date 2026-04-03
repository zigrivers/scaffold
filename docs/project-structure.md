<!-- scaffold:project-structure v3 2026-04-03 -->
# Project Structure

Repository-oriented map of the Scaffold codebase and generated project runtime layout.

## 1. Directory Tree

```
scaffold/
├── content/                   # Build inputs (source of truth for all content)
│   ├── pipeline/              # 60 meta-prompt files organized by 16 phases
│   │   ├── vision/
│   │   ├── pre/
│   │   ├── foundation/
│   │   ├── environment/
│   │   ├── integration/
│   │   ├── modeling/
│   │   ├── decisions/
│   │   ├── architecture/
│   │   ├── specification/
│   │   ├── quality/
│   │   ├── parity/
│   │   ├── consolidation/
│   │   ├── planning/
│   │   ├── validation/
│   │   ├── finalization/
│   │   └── build/
│   ├── tools/                 # 10 tool meta-prompts (stateless, category: tool)
│   ├── knowledge/             # 61 domain expertise entries in 7 categories
│   │   ├── core/
│   │   ├── product/
│   │   ├── review/
│   │   ├── validation/
│   │   ├── finalization/
│   │   ├── execution/
│   │   └── tools/
│   ├── methodology/           # Preset configs (deep.yml, mvp.yml, custom-defaults.yml)
│   └── skills/                # Skill templates with {{markers}} for multi-platform resolution
│       ├── multi-model-dispatch/
│       ├── scaffold-pipeline/
│       └── scaffold-runner/
├── src/                       # TypeScript CLI source code
│   ├── cli/                   # CLI commands, middleware, output strategies
│   ├── core/                  # Assembly engine, adapters, dependency graph, knowledge
│   ├── state/                 # State manager, lock manager, decision logger
│   ├── config/                # Config loading, migration, schema validation
│   ├── project/               # Project detector, CLAUDE.md/GEMINI.md managers
│   ├── wizard/                # Init wizard
│   ├── validation/            # Config, state, frontmatter validators
│   ├── types/                 # TypeScript types and enums
│   ├── utils/                 # FS helpers, errors, levenshtein
│   └── dashboard/             # HTML dashboard generator
├── scripts/                   # Bash utility scripts
│   ├── generate-dashboard.sh
│   ├── implementation-plan-mmr.sh
│   ├── implementation-plan-mmr.schema.json
│   ├── install-hooks.sh
│   ├── prepublish.sh
│   ├── setup-agent-worktree.sh
│   ├── update.sh
│   └── validate-frontmatter.sh
├── lib/                       # Shared assets
│   └── dashboard-theme.css    # Dashboard CSS (embedded into generated HTML)
├── docs/                      # Project documentation and standards
│   ├── architecture/          # Active system architecture and design docs
│   │   ├── adrs/              # Architecture decision records
│   │   └── ...
│   ├── archive/               # Historical artifacts and legacy content
│   │   ├── prompts-v1.md      # Original v1 prompt content (archived)
│   │   ├── audits/
│   │   ├── reviews/
│   │   └── v2-archive/
│   ├── coding-standards.md
│   ├── design-system.md
│   ├── dev-setup.md
│   ├── git-workflow.md
│   ├── plan.md
│   ├── project-structure.md   # This file
│   ├── tdd-standards.md
│   ├── tech-stack.md
│   └── ...
├── tests/                     # Test files
│   ├── *.bats                 # bats-core shell script tests
│   ├── test_helper/           # Shared test setup
│   ├── fixtures/              # Test data files
│   └── screenshots/           # Dashboard visual testing (Playwright MCP)
│       ├── baseline/          # Committed — known-good reference screenshots
│       ├── current/           # Gitignored — current verification run
│       └── diff/              # Gitignored — visual comparison outputs
├── skills/                    # GENERATED — resolved skills (gitignored)
├── dist/                      # GENERATED — compiled TypeScript output (gitignored)
├── .claude-plugin/            # Plugin manifest
│   ├── plugin.json
│   └── marketplace.json
├── .github/                   # GitHub CI and templates
│   ├── workflows/
│   └── pull_request_template.md
├── .claude/                   # Claude Code configuration
│   ├── settings.json          # Project-level permissions
│   └── settings.local.json    # Local machine overrides
├── tasks/                     # Session-specific task notes
│   └── lessons.md
├── Makefile                   # Build automation (test, lint, validate, check)
├── package.json               # npm package config
├── tsconfig.json              # TypeScript config
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
├── config.yml                 # Methodology + project config
├── state.json                 # Pipeline state (committed)
├── decisions.jsonl            # Decision log (committed)
├── lock.json                  # Advisory lock (gitignored)
├── instructions/              # User instructions
│   ├── global.md              # Applied to all steps
│   └── <step-name>.md         # Applied to specific steps
└── generated/                 # Hidden adapter artifacts (gitignored)
    ├── claude-code/
    │   └── commands/
    │       └── <step-name>.md
    ├── codex/
    │   └── AGENTS.md
    └── universal/
        └── prompts/
            └── README.md
.agents/
└── skills/
    ├── scaffold-pipeline/
    │   └── SKILL.md           # Resolved from content/skills/ templates
    └── scaffold-runner/
        └── SKILL.md
GEMINI.md                      # Managed project instructions that import the shared skills
.gemini/
└── commands/
    └── scaffold/
        ├── *.toml             # Gemini slash commands for Scaffold steps
        ├── next.toml
        └── status.toml
```

`scaffold init` and `scaffold build` maintain a dedicated `.gitignore` block for `.scaffold/generated/`, `.scaffold/lock.json`, and Scaffold temp files.

## 2. Module Organization Strategy

Scaffold uses a **role-based** organization. Each directory has a single clear purpose — there are no feature modules or domain groupings because Scaffold is a tool pipeline, not a feature-driven application.

| Role | Directory | Contents |
|------|-----------|----------|
| Pipeline meta-prompts | `content/pipeline/` | 60 `.md` files organized by 16 phases |
| Tool meta-prompts | `content/tools/` | 10 stateless tool `.md` files |
| Knowledge base | `content/knowledge/` | 61 domain expertise entries in 7 categories |
| Methodology presets | `content/methodology/` | YAML preset configs (deep, mvp, custom) |
| Skill templates | `content/skills/` | Skill sources with `{{markers}}` for multi-platform resolution |
| TypeScript CLI | `src/` | CLI commands, assembly engine, state management |
| Scripts (deterministic ops) | `scripts/` | Bash utilities and JSON schemas |
| Shared assets | `lib/` | `dashboard-theme.css` (embedded into generated HTML) |
| Tests | `tests/` | bats-core `.bats` files and vitest TypeScript tests |
| Documentation | `docs/` | Standards docs, architecture, this file |
| Architecture docs | `docs/architecture/` | Active system design docs, ADRs, runbooks |
| Archive | `docs/archive/` | Legacy content (prompts-v1.md, old audits, reviews) |
| Generated skills | `skills/` | Resolved from `content/skills/` templates (gitignored) |
| Plugin manifest | `.claude-plugin/` | `plugin.json`, `marketplace.json` |
| CI/CD & templates | `.github/` | GitHub Actions workflows, PR template |
| Claude Code config | `.claude/` | Project and local permissions (`settings.json`) |
| Session notes | `tasks/` | Learning log (`lessons.md`) |

**Why role-based**: Scaffold isn't a feature-driven app — it's a tool pipeline. Each directory has a single clear purpose. There's no "auth module" or "sessions feature." Merge conflicts are minimized because prompt work, script work, and doc work happen in separate directories.

## 3. File Placement Rules

| File Type | Location | Naming Convention | Example |
|-----------|----------|-------------------|---------|
| Pipeline meta-prompts | `content/pipeline/<phase>/` | `<slug>.md` | `content/pipeline/pre/create-prd.md` |
| Tool meta-prompts | `content/tools/` | `<slug>.md` | `content/tools/release.md` |
| Knowledge entries | `content/knowledge/<category>/` | `<slug>.md` | `content/knowledge/core/testing-strategy.md` |
| Methodology presets | `content/methodology/` | `<preset>.yml` | `content/methodology/deep.yml` |
| Skill templates | `content/skills/<skill-name>/` | `SKILL.md` | `content/skills/scaffold-runner/SKILL.md` |
| Bash scripts | `scripts/` | `<name>.sh` (kebab-case) | `scripts/generate-dashboard.sh` |
| JSON schemas | `scripts/` | `<name>.schema.json` | `scripts/implementation-plan-mmr.schema.json` |
| Documentation | `docs/` | `<topic>.md` (kebab-case) | `docs/coding-standards.md` |
| Test files | `tests/` | `<script-name>.bats` | `tests/generate-dashboard.bats` |
| Test fixtures | `tests/fixtures/` | `<descriptive-name>.<ext>` | `tests/fixtures/valid-config.json` |
| Test helpers | `tests/test_helper/` | `common-setup.bash` | `tests/test_helper/common-setup.bash` |
| CSS / theme files | `lib/` | `<name>.css` (kebab-case) | `lib/dashboard-theme.css` |
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
| `CLAUDE.md` | Project guidance | Sections are independent — agents edit specific sections only. |
| `content/pipeline/` files | Meta-prompt definitions | Each phase is a separate directory — parallel edits are safe across phases. |

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
| All source files (`content/`, `src/`, `scripts/`, `lib/`, `docs/`) | `dist/` (compiled TypeScript output) |
| Config files (`.editorconfig`, `.shellcheckrc`) | `skills/` (resolved from `content/skills/` templates) |
| `plugin.json`, `marketplace.json` | `coverage/` (kcov output) |
| `tests/fixtures/` (test data) | `*.tmp` (atomic write temp files) |
| `tests/screenshots/baseline/` (reference screenshots) | `.DS_Store` |
| `.github/` (CI workflows, PR template) | `.history/` |
| `content/skills/` (skill templates — source of truth) | `*~`, `*.bak` (editor backup files) |
| | `tests/screenshots/current/` (verification runs) |
| | `tests/screenshots/diff/` (comparison outputs) |
| | `tests/screenshots/dashboard-test.html` (generated) |
| | `.playwright-mcp/` (Playwright MCP cache) |
| | `.worktrees/` (git worktree working dirs) |

## 8. Root-Level File Policy

Root level is reserved for project-wide config and documentation:

| Category | Files |
|----------|-------|
| Build automation | `Makefile`, `package.json`, `tsconfig.json` |
| Project docs | `CLAUDE.md`, `AGENTS.md`, `README.md`, `CHANGELOG.md`, `LICENSE` |
| Tooling config | `.editorconfig`, `.shellcheckrc`, `.gitignore`, `.gitattributes` |

**No feature code, research notes, or ad-hoc files at root.**
