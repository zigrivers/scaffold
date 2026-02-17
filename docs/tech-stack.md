<!-- scaffold:tech-stack v1 2026-02-16 -->
# Tech Stack

Scaffold is a prompt pipeline and Claude Code plugin — not a traditional application. Its "tech stack" is a hybrid of Claude Code command prompts (for reasoning, interaction, and orchestration) and bash scripts (for deterministic, repeatable operations). Every technology choice below optimizes for zero external dependencies, Claude Code native integration, and simplicity.

## 1. Architecture Overview

### Hybrid Model: Prompts + Scripts

Scaffold v2 splits work between two execution layers:

| Layer | Handles | Examples |
|-------|---------|----------|
| **Prompts** (Claude Code commands) | Reasoning, user interaction, document generation, decision-making | `init` profile selection, `resume` progress display, all pipeline prompts |
| **Scripts** (Bash utilities) | Deterministic operations, JSON manipulation, file scanning, validation | Dependency resolution, config read/write, artifact verification, profile resolution |

**Boundary principle**: If an operation has exactly one correct output for a given input (no judgment needed), it belongs in a script. If it requires interpretation, user interaction, or adaptive behavior, it belongs in a prompt. Prompts call scripts via Claude's Bash tool; scripts never invoke Claude.

### Why Not a Compiled Engine?

A Node.js/Python engine was considered and rejected:

- **Added dependency**: Scaffold currently requires only Bash and Git. A runtime would add Node.js or Python as a hard requirement for the engine itself (not just for Beads).
- **Plugin size**: Claude Code plugins are lightweight file bundles. A compiled engine with `node_modules/` would bloat the plugin.
- **Claude integration**: Prompts already run in Claude Code sessions with full tool access. A compiled engine would need to replicate tool-calling patterns that prompts get for free.
- **Maintenance**: Bash scripts are inspectable, editable, and debuggable without build steps. Contributors can modify pipeline behavior by editing markdown and shell scripts.

**AI compatibility note**: Bash is one of the most heavily represented languages in LLM training data. Claude generates correct bash reliably, and `set -euo pipefail` patterns are well-understood. The hybrid model leverages Claude's strength (reasoning over prompts) while keeping deterministic operations in scripts where correctness can be tested.

## 2. Scripting & Utilities

### Bash 3.2+

- **What**: All utility scripts target Bash 3.2+ (macOS system default).
- **Why**: Zero-dependency — every macOS and Linux system has it. No installation step required. Claude Code's Bash tool executes bash natively.
- **Why not zsh/fish/POSIX sh**: Bash 3.2 is the lowest common denominator across macOS (which ships 3.2 due to GPLv3 licensing) and Linux. Zsh and fish aren't guaranteed. Pure POSIX sh lacks arrays, which the scripts need. Bash 4+ features (associative arrays, `mapfile`) are avoided for macOS compatibility.

### Conventions

All scripts follow patterns established by the existing v1 scripts (`scripts/extract-commands.sh`, `scripts/user-stories-mmr.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."
```

- `set -euo pipefail` — Fail on errors, undefined variables, and pipe failures
- `SCRIPT_DIR` / `REPO_DIR` — Absolute path resolution, no reliance on `pwd`
- Preflight checks before any mutations — validate inputs exist, tools available
- `echo` to stderr for diagnostics, stdout for data (when piped)
- Exit codes: 0 = success, 1 = user/input error, 2 = missing dependency

### v2 Script Inventory

| Script | Purpose | Called By |
|--------|---------|-----------|
| `lib/common.sh` | Shared functions: config read/write, path resolution, logging | All scripts below |
| `scripts/resolve-deps.sh` | Topological sort (Kahn's algorithm) on prompt dependency graph | `init`, `validate` commands |
| `scripts/resolve-profile.sh` | Profile inheritance chain resolution (up to 3 levels) | `init`, `validate` commands |
| `scripts/resolve-prompt.sh` | 4-tier prompt file lookup (profile override → project → user → built-in) | `resume`, `init` commands |
| `scripts/check-artifacts.sh` | Verify predecessor `produces` artifacts exist on disk | `resume` command (pre-execution gate) |
| `scripts/detect-completion.sh` | Artifact-based completion detection — infer which prompts have run | `resume`, `init` (v1 detection) |
| `scripts/validate-config.sh` | Validate `.scaffold/config.json` schema and referential integrity | `validate`, `resume` commands |
| `scripts/validate-frontmatter.sh` | Parse and validate YAML frontmatter from prompt `.md` files | `validate` command |

### `lib/common.sh` — Shared Library

Sourced by all scripts. Provides:

- **`scaffold_read_config`** — Read `.scaffold/config.json` via `jq`, with fallback for missing/corrupt files
- **`scaffold_write_config`** — Atomic write to config.json (write to `.tmp`, then `mv`)
- **`scaffold_log`** — Leveled logging (info/warn/error) to stderr
- **`scaffold_require`** — Preflight check for required commands (`jq`, `git`, etc.)
- **`scaffold_resolve_root`** — Find the project root by walking up to find `.scaffold/` or `.git/`

### Error Handling

Scripts follow a strict error contract:

- **Stdout**: Structured output only (JSON from `jq`, file paths, prompt names). Prompts parse this.
- **Stderr**: Human-readable diagnostics and errors. Visible in Claude Code tool output.
- **Exit codes**: Non-zero on any failure. The calling prompt decides whether to abort or recover.
- **No interactive input**: Scripts never use `read` or expect stdin (except when receiving piped data). All interaction goes through prompts using `AskUserQuestion`.

## 3. Configuration & State Management

### JSON for All Configuration

- **What**: All machine-readable configuration uses JSON: `.scaffold/config.json`, `.scaffold/context.json`, `.scaffold/decisions.json`, profile definitions (`.scaffold/profiles/*.json`).
- **Why**: Already the established format (`plugin.json`). Parseable with `jq`. Claude reads and writes JSON natively — it's the most reliable structured format for AI-generated output.
- **Why not TOML/YAML for config**: TOML adds a parser dependency. YAML is ambiguous (the Norway problem, implicit type coercion) and requires a parser beyond what bash provides. JSON + `jq` is deterministic and well-understood.

### YAML Frontmatter — Retained for Commands

- **What**: Command `.md` files in `commands/` retain YAML frontmatter for metadata (`description`, `depends-on`, `phase`, `produces`, `reads`, `argument-hint`).
- **Why**: This is the established pattern from v1 (31 command files already use it). Claude Code's command system may parse frontmatter. Changing to JSON frontmatter would break backward compatibility for no gain.
- **Parsing**: `scripts/validate-frontmatter.sh` extracts frontmatter between `---` delimiters and validates required fields. Complex parsing (if needed) uses `python3 -c` as a fallback — Python is available on all target systems for YAML parsing via `yaml.safe_load`.

### `.scaffold/` File Layout

```
.scaffold/
├── config.json          # Pipeline state (profile, completed, skipped)
├── context.json         # Shared key-value context (should-have, may be deferred)
├── decisions.json       # Append-only decision log (should-have, may be deferred)
├── prompts/             # Project-level prompt overrides and custom prompts
│   └── *.md
└── profiles/            # Project-level custom profiles
    └── *.json
```

All files in `.scaffold/` are committed to git. User-level equivalents live at `~/.scaffold/` (not committed).

### Schema Definitions

Config and profile JSON files follow implicit schemas documented in the PRD (Section 5, Data Model). Formal JSON Schema files (like the existing `scripts/user-stories-mmr.schema.json`) will be created for:

- `.scaffold/config.json` — Pipeline configuration schema
- `.scaffold/profiles/*.json` — Profile definition schema

These schemas enable validation via `scripts/validate-config.sh` using `jq`-based checks (not a full JSON Schema validator, to avoid adding a dependency).

## 4. Testing

### bats-core 1.10+ — Script Testing

- **What**: [bats-core](https://github.com/bats-core/bats-core) (Bash Automated Testing System) for testing all scripts in `scripts/` and `lib/`.
- **Why**: Purpose-built for bash testing. TAP (Test Anything Protocol) output integrates with CI. Tests are bash files themselves — no language mismatch. Active maintenance, widely used.
- **Why not shunit2/roundup**: shunit2 has stalled development. roundup is unmaintained. bats-core is the clear ecosystem winner with helper libraries (`bats-support`, `bats-assert`, `bats-file`).
- **AI compatibility note**: bats-core has strong representation in training data. Claude generates correct bats tests reliably.

Test structure:

```
tests/
├── test_helper/
│   └── common-setup.bash       # Shared setup: temp dirs, load helpers, source lib
├── fixtures/                    # Test data files (configs, frontmatter samples)
├── common.bats                  # Tests for lib/common.sh
├── install.bats                 # Tests for scripts/install.sh
├── uninstall.bats               # Tests for scripts/uninstall.sh
├── update.bats                  # Tests for scripts/update.sh
├── extract-commands.bats        # Tests for scripts/extract-commands.sh
├── user-stories-mmr.bats        # Tests for scripts/user-stories-mmr.sh
├── resolve-deps.bats            # Tests for topological sort
├── resolve-profile.bats         # Tests for profile inheritance
├── resolve-prompt.bats          # Tests for 4-tier prompt lookup
├── check-artifacts.bats         # Tests for artifact verification
├── detect-completion.bats       # Tests for completion detection
├── validate-config.bats         # Tests for config validation
└── validate-frontmatter.bats    # Tests for frontmatter parsing
```

### Prompt Validation — Manual Checklist

Prompts (Claude Code commands) can't be unit-tested — they're natural language executed by an LLM. Instead:

- **Structural checks**: `scripts/validate-frontmatter.sh` verifies every command file has valid frontmatter with required fields.
- **Dependency graph check**: `scripts/resolve-deps.sh --validate` verifies the full dependency graph is a valid DAG (no cycles, no missing references).
- **Manual smoke test**: Run the pipeline on a test project and verify artifacts are produced. This is documented as a release checklist, not automated.

### JSON Schema Validation

JSON config/profile files are validated against their schemas using `jq`-based assertions in bats tests. Example:

```bash
@test "config.json has required fields" {
  run jq -e '.["scaffold-version"] and .profile and .prompts' "$CONFIG"
  [ "$status" -eq 0 ]
}
```

## 5. Developer Tooling

### ShellCheck 0.9+ — Bash Linting

- **What**: [ShellCheck](https://www.shellcheck.net/) static analysis for all `.sh` files.
- **Why**: Industry standard. Catches real bugs (unquoted variables, unreachable code, POSIX compatibility issues). Integrates with CI and editors.
- **Configuration**: `.shellcheckrc` at repo root with project-wide settings:
  - `shell=bash`
  - `enable=all` (enable all optional checks)
  - Per-file overrides via `# shellcheck disable=SC2034` where justified

### EditorConfig

`.editorconfig` at repo root ensures consistent formatting across contributors:

```ini
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.sh]
indent_size = 4

[Makefile]
indent_style = tab
```

### Pre-commit Hooks

Pre-commit hooks are chained with the existing Beads hooks (Beads installs its own pre-commit hook for task tracking):

1. **Beads hook** (existing) — Validates commit message format `[BD-<id>] type(scope): description`
2. **ShellCheck** — Runs `shellcheck` on staged `.sh` files
3. **Frontmatter validation** — Runs `scripts/validate-frontmatter.sh` on staged `commands/*.md` files

Hook installation is handled by the dev environment setup, not by Scaffold's `install.sh`.

### No Prettier/Formatter

Markdown and JSON files are not auto-formatted. Rationale:

- **Zero-dependency principle**: Prettier requires Node.js. Scaffold's core has no Node.js dependency.
- **AI-generated content**: Prompts are written by humans and edited by AI. Formatter churn on AI-generated markdown creates noise in diffs.
- **EditorConfig is sufficient**: Basic formatting (indent, line endings, trailing whitespace) is handled by EditorConfig, which editors respect natively.

## 6. Distribution

### Claude Code Plugin System

- **What**: Scaffold is distributed as a Claude Code plugin, installable via `/plugin marketplace add scaffold`.
- **Why**: This is the established v1 distribution mechanism. Users get all commands as `/scaffold:<name>` immediately.
- **Manifest**: `.claude-plugin/plugin.json` defines the plugin metadata (name, version, description, keywords).
- **Commands**: Each command in `commands/*.md` is exposed as `/scaffold:<slug>`. New v2 orchestration commands (`init`, `resume`, `status`, `next`, `skip`, `validate`, `reset`) are added as new files in `commands/`.

### User Commands (Fallback)

For users who prefer not to use the plugin system:

- `scripts/install.sh` copies `commands/*.md` to `~/.claude/commands/`
- `scripts/uninstall.sh` removes them
- `scripts/update.sh` pulls latest and re-copies

### Auto-activated Skill

`skills/scaffold-pipeline/SKILL.md` auto-activates when users ask about pipeline ordering or "what's next." v2 updates this skill to read `.scaffold/config.json` for the resolved pipeline instead of the hardcoded v1 table.

## 7. Dependencies & External Tools

### Required — Core Operation

| Tool | Version | Purpose | Installation |
|------|---------|---------|-------------|
| Claude Code | Latest with plugin support | Runtime environment — executes all prompts and scripts | `brew install claude-code` or npm |
| Bash | 3.2+ | Script execution | Pre-installed on macOS/Linux |
| Git | 2.20+ | Version control, worktrees for parallel agents | Pre-installed or `brew install git` |
| **jq** | **1.6+** | **JSON parsing/manipulation in all v2 scripts** | **`brew install jq` or package manager** |

**jq is new for v2.** v1 had no jq dependency because it had no JSON config files. v2's `.scaffold/config.json`, profile resolution, and validation all require reliable JSON processing. `jq` is a single static binary with no dependencies of its own — it aligns with the zero-dependency principle better than any alternative (Python json module, Node.js, custom bash JSON parser).

**Why jq over alternatives**:
- **vs. Python `json` module**: Would make Python a hard dependency. jq is simpler for the operations needed (read field, update field, validate structure).
- **vs. `sed`/`awk` JSON parsing**: Fragile, error-prone, breaks on edge cases (nested objects, escaped quotes). Not a serious option.
- **vs. `jo` (JSON output)**: Only handles creation, not parsing. Would need jq anyway for reads.

### Required — Task Tracking

| Tool | Version | Purpose | Installation |
|------|---------|---------|-------------|
| Beads (`bd`) | Latest | Task tracking throughout the pipeline | `npm install -g @beads/bd` or `brew install beads` |
| Node.js | 18+ | Runtime for Beads CLI | Pre-installed or `brew install node` |

Beads and Node.js are required by the pipeline prompts (specifically the `beads` prompt and all implementation prompts), not by Scaffold's engine. If Beads is not installed, the `beads` prompt handles the error — the engine doesn't enforce it.

### Dev-Only — Contributing to Scaffold

| Tool | Version | Purpose | Installation |
|------|---------|---------|-------------|
| ShellCheck | 0.9+ | Bash linting | `brew install shellcheck` |
| bats-core | 1.10+ | Bash testing | `brew install bats-core` |
| bats-support | Latest | bats helper library | `brew install bats-support` (or git submodule) |
| bats-assert | Latest | bats assertion library | `brew install bats-assert` (or git submodule) |
| bats-file | Latest | bats file assertions | `brew install bats-file` (or git submodule) |

### Optional — Enhanced Workflows

| Tool | Version | Purpose | When Needed |
|------|---------|---------|-------------|
| Python 3 | 3.8+ | YAML frontmatter parsing fallback, JSON schema validation in `user-stories-mmr.sh` | Only if `validate-frontmatter.sh` needs complex YAML parsing |
| Codex CLI | Latest | Multi-model review of user stories | Only for `/scaffold:user-stories-multi-model-review` |
| Gemini CLI | Latest | Multi-model review of user stories | Only for `/scaffold:user-stories-multi-model-review` |
| Playwright MCP | Latest | E2E testing for web apps | Only for `/scaffold:add-playwright` |
| `gh` CLI | 2.0+ | GitHub PR/issue operations, CI setup | Only for `/scaffold:git-workflow` and `/scaffold:multi-model-review` |

## 8. Quick Reference

All dependencies in one table — the source of truth for what Scaffold v2 requires.

| Dependency | Version | Category | Required By |
|------------|---------|----------|-------------|
| Claude Code | Latest (plugin support) | Required | Everything |
| Bash | 3.2+ | Required | All scripts |
| Git | 2.20+ | Required | Version control, worktrees |
| jq | 1.6+ | Required | All v2 config/profile scripts |
| Beads (`bd`) | Latest | Required (pipeline) | Task tracking prompts |
| Node.js | 18+ | Required (pipeline) | Beads runtime |
| ShellCheck | 0.9+ | Dev-only | Linting `.sh` files |
| bats-core | 1.10+ | Dev-only | Testing `.sh` files |
| bats-support | Latest | Dev-only | bats helper library |
| bats-assert | Latest | Dev-only | bats assertion library |
| bats-file | Latest | Dev-only | bats file assertion library |
| Python 3 | 3.8+ | Optional | YAML parsing fallback |
| Codex CLI | Latest | Optional | Multi-model review |
| Gemini CLI | Latest | Optional | Multi-model review |
| Playwright MCP | Latest | Optional | Web app E2E testing |
| `gh` CLI | 2.0+ | Optional | GitHub operations |
