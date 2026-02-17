<!-- scaffold:coding-standards v1 2026-02-16 -->
# Coding Standards

Standards for all code in the Scaffold project. Scaffold is a prompt pipeline and Claude Code plugin — its stack is Bash 3.2+ scripts, Markdown prompts with YAML frontmatter, and JSON configs parsed with jq.

## 1. Project Structure & Organization

### Root Layout

```
scaffold/
├── commands/           # Individual command .md files (generated from prompts.md)
├── scripts/            # Bash utility scripts
├── lib/                # Shared bash libraries (common.sh)
├── docs/               # Project documentation
├── tests/              # bats-core test files
│   └── test_helper/    # Shared test setup
├── skills/             # Auto-activated skills
│   └── scaffold-pipeline/
├── .claude-plugin/     # Plugin manifest
└── prompts.md          # Source of truth for all prompts
```

### File Naming

- **kebab-case everywhere**: `resolve-deps.sh`, `tech-stack.md`, `plugin.json`
- Extensions: `.sh` for scripts, `.md` for prompts/docs, `.json` for config
- Test files: `tests/<script-name>.bats`
- No barrel/index files

### Import Ordering

Bash scripts source shared libraries at the top, after error flags:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"
```

## 2. Bash Scripting Standards

### Shebang & Error Handling

Every script starts with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

- `#!/usr/bin/env bash` — portable shebang (works across macOS and Linux)
- `set -euo pipefail` — fail on errors (`-e`), undefined variables (`-u`), and pipe failures (`-o pipefail`)

> **Tech debt note**: Existing v1 scripts use `#!/bin/bash` and some use only `set -e`. New scripts use the portable form. Migration tracked separately.

### Path Resolution

Always resolve absolute paths — never rely on `pwd`:

```bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."
```

### Variable Naming

| Type | Convention | Example |
|------|-----------|---------|
| Constants / env vars | UPPER_SNAKE_CASE | `SCRIPT_DIR`, `REPO_DIR`, `OUTPUT_DIR` |
| Local variables | lower_snake_case | `count`, `filename`, `skipped` |
| Loop variables | lower_snake_case | `file`, `entry`, `slug` |

### Quoting

Always quote variables. ShellCheck enforces this.

```bash
# Good
cp "$file" "$TARGET_DIR/$filename"
if [ -f "$PROMPTS_FILE" ]; then

# Bad — unquoted variables
cp $file $TARGET_DIR/$filename
if [ -f $PROMPTS_FILE ]; then
```

### Exit Codes

| Code | Meaning | Example |
|------|---------|---------|
| 0 | Success | Script completed normally |
| 1 | User/input error | Missing required argument, invalid input file |
| 2 | Missing dependency | `jq` not installed, `git` not found |

### Output Streams

- **stdout**: Data output only (file paths, JSON, prompt names). Consumed by callers.
- **stderr**: Diagnostics, errors, warnings, progress. Visible to humans.

```bash
# Good — data to stdout, diagnostics to stderr
echo "Error: prompts.md not found at $PROMPTS_FILE" >&2
exit 1

# Good — structured output to stdout
jq -r '.prompts[]' "$CONFIG"
```

### No Interactive Input

Scripts never use `read` or expect stdin (except when receiving piped data). All interaction goes through Claude Code prompts using `AskUserQuestion`.

### Section Comments

Use the section divider pattern for logical sections:

```bash
# ─── Section Name ───────────────────────────────────────────
```

### Bash 3.2 Compatibility

Target Bash 3.2+ (macOS system default). Avoid Bash 4+ features:

| Avoid | Use Instead |
|-------|-------------|
| `declare -A` (associative arrays) | Indexed arrays with delimiter parsing |
| `mapfile` / `readarray` | `while IFS= read -r` loops |
| `${var,,}` (lowercase) | `tr '[:upper:]' '[:lower:]'` |
| `${var^^}` (uppercase) | `tr '[:lower:]' '[:upper:]'` |
| `|&` (pipe stderr) | `2>&1 |` |

> **Tech debt note**: `scripts/extract-commands.sh` uses `declare -A`. This is a known Bash 4+ dependency — tracked for migration.

### Function Style

Use `name() { ... }` — not `function name { ... }`:

```bash
# Good
get_frontmatter() {
    local slug="$1"
    # ...
}

# Bad
function get_frontmatter {
    local slug="$1"
    # ...
}
```

### Preflight Checks

Validate inputs and dependencies before any mutations:

```bash
# Good — check before acting (from install.sh)
if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: commands/ directory not found at $SOURCE_DIR"
    exit 1
fi

mkdir -p "$TARGET_DIR"
```

### Complete Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$SCRIPT_DIR/.."

# ─── Preflight ──────────────────────────────────────────────

command -v jq >/dev/null 2>&1 || {
    echo "Error: jq is required but not installed" >&2
    exit 2
}

if [ ! -f "$REPO_DIR/prompts.md" ]; then
    echo "Error: prompts.md not found" >&2
    exit 1
fi

# ─── Main ───────────────────────────────────────────────────

# ... script logic ...
```

## 3. Markdown & Prompt Standards

### YAML Frontmatter

Command files in `commands/` use YAML frontmatter:

```yaml
---
description: "Short description of the command"
argument-hint: "<optional argument placeholder>"
---
```

- `description` is required
- `argument-hint` is optional — only include if the command takes arguments

### Prompt Heading Convention

In `prompts.md`, each prompt section uses:

```markdown
# Prompt Name (Prompt)
```

The `(Prompt)` suffix identifies extractable prompt sections. This is how `extract-commands.sh` maps headings to command slugs.

### Tracking Comment

Document-creating prompts produce files with a tracking comment on line 1:

```markdown
<!-- scaffold:<slug> v<version> <date> -->
```

Example: `<!-- scaffold:coding-standards v1 2026-02-16 -->`

### Mode Detection

Every document-creating prompt includes Mode Detection and Update Mode Specifics blocks. These appear after the opening paragraph and before the first content section. When modifying prompts, preserve these blocks.

### Formatting Rules

- **ATX headings only**: Use `## Heading` — never `Heading\n===`
- **Code blocks**: Always specify language (` ```bash `, ` ```json `, ` ```yaml `)
- **Tables**: GitHub-flavored markdown
- **No emoji** in output unless the user explicitly requests it
- **Trailing whitespace**: Not trimmed in `.md` files (EditorConfig preserves it for line breaks)

## 4. JSON Standards

### jq for All JSON Operations

Never use `sed`, `awk`, or `grep` to manipulate JSON. Use `jq`:

```bash
# Good — read a field
profile=$(jq -r '.profile' "$CONFIG")

# Good — update a field
jq '.profile = "web-app"' "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"

# Bad — fragile text manipulation
profile=$(grep '"profile"' "$CONFIG" | sed 's/.*: "\(.*\)".*/\1/')
```

### Atomic Writes

Write to a temp file, then move — prevents corruption on failure:

```bash
jq '.version = "2.0.0"' "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
```

### Formatting

- Pretty-print with 2-space indent (jq's default)
- One JSON object per file
- Semantic versioning for version fields

### Validation

Use `jq -e` for validation — it exits non-zero if the expression evaluates to `false` or `null`:

```bash
# Validate required fields exist
if ! jq -e '.["scaffold-version"] and .profile and .prompts' "$CONFIG" >/dev/null 2>&1; then
    echo "Error: config.json missing required fields" >&2
    exit 1
fi
```

### Plugin Manifest

`.claude-plugin/plugin.json` requires: `name`, `version`, `description`.

## 5. Security Standards

### No Secrets in Code

- Never commit API keys, tokens, passwords, or credentials
- No `.env` files in the repository
- Use environment variables for sensitive configuration

### No `eval` on Untrusted Input

Never `eval` user-provided or externally-sourced strings. Use `jq` for JSON, parameter expansion for simple transformations.

### Always Quote Variables

Unquoted variables cause word splitting and glob expansion — security and correctness bugs:

```bash
# Good
rm "$file"

# Bad — if $file contains spaces or globs, this breaks or deletes wrong files
rm $file
```

### Validate Paths

Check that paths exist before operating on them:

```bash
if [ ! -f "$CONFIG" ]; then
    echo "Error: config file not found at $CONFIG" >&2
    exit 1
fi
```

### Dependency Checks

Use `command -v` to check for required tools:

```bash
command -v jq >/dev/null 2>&1 || {
    echo "Error: jq is required but not installed" >&2
    exit 2
}
```

### File Permissions

| File Type | Permission | Why |
|-----------|-----------|-----|
| `.sh` scripts | `755` (executable) | Must be executable to run directly |
| Config files (`.json`, `.md`, `.editorconfig`) | `644` (read/write owner, read others) | Data files, not executables |

## 6. Logging & Observability

### Message Prefixes

| Level | Prefix | Stream | Example |
|-------|--------|--------|---------|
| Error | `Error:` | stderr | `echo "Error: config.json not found" >&2` |
| Warning | `Warning:` | stderr | `echo "Warning: $filename already exists" >&2` |
| Progress | (none) | stdout | `echo "Installed $count command(s)"` |

### v2 Shared Logging

The `lib/common.sh` shared library provides `scaffold_log` for leveled logging:

```bash
source "$SCRIPT_DIR/../lib/common.sh"

scaffold_log info "Processing $filename"
scaffold_log warn "File already exists, skipping"
scaffold_log error "Config file not found"
```

All log output goes to stderr. Stdout is reserved for structured data.

### Never Log

- PII or user-specific data
- Secrets, tokens, or credentials
- File contents verbatim (log file paths instead)

## 7. Testing Standards

### bats-core for Bash Scripts

All scripts in `scripts/` and `lib/` have corresponding test files:

```
tests/
├── test_helper/
│   └── common-setup.bash    # Shared setup: temp dirs, fixtures, source lib/common.sh
├── resolve-deps.bats
├── resolve-profile.bats
├── validate-config.bats
└── common.bats
```

### Test Structure

```bash
#!/usr/bin/env bats

setup() {
    load 'test_helper/common-setup'
    _common_setup
}

@test "rejects missing config file" {
    run scripts/validate-config.sh /nonexistent/path
    [ "$status" -eq 1 ]
    [[ "$output" == *"Error:"* ]]
}

@test "validates required fields in config" {
    echo '{"scaffold-version":"2","profile":"web","prompts":[]}' > "$BATS_TMPDIR/config.json"
    run scripts/validate-config.sh "$BATS_TMPDIR/config.json"
    [ "$status" -eq 0 ]
}
```

### Test Both Paths

Every test file must cover:

- **Success path**: Valid inputs produce correct outputs
- **Failure path**: Invalid inputs produce correct errors and exit codes

### Prompt Validation

Prompts can't be unit-tested (they're natural language for an LLM), but their structure can be validated:

- **Frontmatter**: `scripts/validate-frontmatter.sh` verifies required fields
- **Dependency graph**: `scripts/resolve-deps.sh --validate` checks for cycles and missing references
- **Smoke testing**: Run the pipeline on a test project (release checklist, not automated)

### JSON Validation in Tests

Use `jq -e` assertions in bats tests:

```bash
@test "config.json has required fields" {
    run jq -e '.["scaffold-version"] and .profile and .prompts' "$CONFIG"
    [ "$status" -eq 0 ]
}
```

## 8. AI-Specific Coding Rules

### No Premature Abstraction

Don't extract a helper until it's used in 2+ places. Three similar lines of code is better than a premature abstraction.

### No Dead Code

- No commented-out code blocks
- No `TODO` comments without a Beads task ID: `# TODO [BD-xyz] description`
- No unused variables or functions — delete them

### Follow Existing Patterns

Match the conventions in the file you're editing. Don't introduce new patterns for consistency's sake — that creates inconsistency during the migration period.

### No Over-Engineering

- Don't add features that weren't requested
- Don't add error handling for scenarios that can't happen
- Don't design for hypothetical future requirements
- Don't add configuration for one-time operations

### Explicit Over Implicit

- Name constants instead of using magic values
- Make control flow obvious
- Prefer `if/then/else` over short-circuit tricks for non-trivial logic

## 9. Commit Message Standards

### Format

```
[BD-<id>] type(scope): description
```

### Commit Types

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `test` | Adding or updating tests |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `docs` | Documentation only |
| `chore` | Maintenance, dependencies, CI |

### Rules

- **Imperative mood**: "add feature" not "added feature"
- **Lowercase** after the type prefix
- **`[BD-0]`** for bootstrapping tasks (initial setup before Beads is configured)
- Every commit needs a Beads task ID — if fixing a bug ad-hoc, create a task first
- See `CLAUDE.md` for the authoritative reference

### Examples

```
[BD-scaffold-abc] feat(scripts): add resolve-deps topological sort
[BD-scaffold-xyz] fix(install): handle spaces in TARGET_DIR path
[BD-0] chore: initialize project structure
```

## 10. Styling / Dashboard Design System

- **Use ONLY CSS custom properties** from `lib/dashboard-theme.css` — no hardcoded hex colors or arbitrary pixel values
- **Reference component patterns** from `docs/design-system.md` before modifying or extending the dashboard
- **Always provide both light and dark mode values** when adding new CSS custom properties
- **Dashboard CSS location**: `lib/dashboard-theme.css` (embedded into generated HTML by `scripts/generate-dashboard.sh`)
- **Generated HTML must remain self-contained** — no external resource references (CDN fonts, stylesheets, scripts)

For the full design system reference, see `docs/design-system.md`.

## 11. Code Review Checklist

Before merging any change, verify:

### Bash Scripts
- [ ] ShellCheck passes with no warnings
- [ ] All variables are quoted (`"$VAR"`)
- [ ] `set -euo pipefail` is present
- [ ] Exit codes follow convention (0/1/2)
- [ ] Preflight checks run before any mutations
- [ ] Executable permission is set (`chmod 755`)
- [ ] No Bash 4+ features (unless documented exception)

### JSON Files
- [ ] Valid JSON (parseable by `jq`)
- [ ] Pretty-printed with 2-space indent
- [ ] Atomic write pattern used for updates

### Markdown / Prompts
- [ ] YAML frontmatter is valid (if command file)
- [ ] Tracking comment on line 1 (if document-creating prompt)
- [ ] Code blocks specify language
- [ ] ATX headings only

### General
- [ ] Commit message follows `[BD-<id>] type(scope): description` format
- [ ] Tests cover success and failure paths
- [ ] No secrets or credentials committed
- [ ] No dead code or TODOs without Beads task IDs
- [ ] File naming is kebab-case
