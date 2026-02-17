<!-- scaffold:tdd-standards v1 2026-02-16 -->
# TDD Standards

Test-driven development standards for the Scaffold project. Every script in `scripts/` and `lib/` is developed test-first using bats-core. No implementation code is written without a failing test.

## 1. TDD Workflow

### Red → Green → Refactor

Every change follows this cycle:

1. **Red**: Write a failing test that describes the desired behavior. Run it. Confirm it fails for the right reason.
2. **Green**: Write the minimum implementation code to make the test pass. Nothing more.
3. **Refactor**: Clean up duplication and improve clarity. Tests must still pass.

```bash
# Step 1: Write the failing test
@test "scaffold_log error writes to stderr" {
    run --separate-stderr scaffold_log error "something broke"
    [ "$status" -eq 0 ]
    [[ "$stderr" == *"ERROR: something broke"* ]]
}

# Step 2: Run it — confirm it fails
bats tests/common.bats --filter "scaffold_log error"
# => FAIL (function doesn't exist yet)

# Step 3: Implement just enough to pass
scaffold_log() {
    local level="$1" msg="$2"
    echo "${level^^}: $msg" >&2
}

# Step 4: Run again — passes
# Step 5: Refactor if needed, re-run tests
```

### When to Write Which Test Type

| Change Type | Test Type | Example |
|-------------|-----------|---------|
| New function in `lib/common.sh` | Unit test | `scaffold_read_config` returns default on missing file |
| New script in `scripts/` | Script test (full invocation) | `resolve-deps.sh` exits 1 on cyclic graph |
| Bug fix | Failing test first, then fix | `install.sh` fails when path has spaces |
| Frontmatter/config validation | Structural test | Command file missing `description` field |
| JSON schema change | Validation test | `config.json` rejects unknown fields |

### Bug-Fix TDD

When fixing a bug:

1. Write a test that reproduces the bug — it must fail
2. Commit the failing test (message: `test: reproduce <bug description>`)
3. Fix the bug
4. Confirm the test passes
5. Commit the fix (message: `fix: <bug description>`)

Never fix a bug without a failing test that proves it existed.

### The Rule

No implementation code exists without a failing test written first. This applies to:

- New scripts
- New functions in shared libraries
- Bug fixes
- Refactors that change behavior

This does **not** apply to:

- Prompt text (natural language — not testable)
- Documentation changes
- Configuration file edits (`.editorconfig`, `.shellcheckrc`)

## 2. Test Architecture

### Directory Structure

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

One `.bats` file per script. Tests grouped by behavior within each file.

### Test Categorization

| Category | Tests | Scope |
|----------|-------|-------|
| **Unit** | Functions from `lib/common.sh` | Source the lib, call functions directly, assert return values and output |
| **Script** | Full script invocations in `scripts/` | Run via `run scripts/<name>.sh`, assert exit codes, stdout, stderr, and side effects |
| **Structural** | Frontmatter, config schema, dependency graph | Validate file formats and referential integrity — no runtime behavior |

### `test_helper/common-setup.bash` — Reference Implementation

```bash
_common_setup() {
    # Load bats helper libraries
    load '/usr/local/lib/bats-support/load'
    load '/usr/local/lib/bats-assert/load'
    load '/usr/local/lib/bats-file/load'

    # Resolve project root (works from any test directory)
    PROJECT_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"

    # Create isolated temp directory for each test
    TEST_TEMP_DIR="$(temp_make)"
    BATS_TEST_TMPDIR="$TEST_TEMP_DIR"

    # Source shared library for unit tests
    source "$PROJECT_ROOT/lib/common.sh"
}

_common_teardown() {
    # Clean up temp directory
    temp_del "$TEST_TEMP_DIR"
}
```

### bats Helper Library Installation

Install via Homebrew (recommended for macOS):

```bash
brew install bats-core bats-support bats-assert bats-file
```

Or via git submodules (for CI reproducibility):

```bash
git submodule add https://github.com/bats-core/bats-support tests/test_helper/bats-support
git submodule add https://github.com/bats-core/bats-assert tests/test_helper/bats-assert
git submodule add https://github.com/bats-core/bats-file   tests/test_helper/bats-file
```

If using submodules, update `common-setup.bash` load paths:

```bash
load "$BATS_TEST_DIRNAME/test_helper/bats-support/load"
load "$BATS_TEST_DIRNAME/test_helper/bats-assert/load"
load "$BATS_TEST_DIRNAME/test_helper/bats-file/load"
```

## 3. Concrete Patterns for Our Stack

### Pattern A: Testing Sourced Functions (lib/common.sh)

Unit test pattern — source the library, call the function, assert output.

```bash
#!/usr/bin/env bats

setup() {
    load 'test_helper/common-setup'
    _common_setup
}

teardown() {
    _common_teardown
}

@test "scaffold_read_config returns value for existing key" {
    echo '{"profile":"web-app","scaffold-version":"2"}' > "$TEST_TEMP_DIR/config.json"
    run scaffold_read_config "$TEST_TEMP_DIR/config.json" ".profile"
    assert_success
    assert_output "web-app"
}

@test "scaffold_read_config returns empty string for missing key" {
    echo '{"profile":"web-app"}' > "$TEST_TEMP_DIR/config.json"
    run scaffold_read_config "$TEST_TEMP_DIR/config.json" ".nonexistent"
    assert_success
    assert_output ""
}

@test "scaffold_read_config exits 1 for missing file" {
    run scaffold_read_config "/nonexistent/config.json" ".profile"
    assert_failure 1
}

@test "scaffold_require succeeds when command exists" {
    run scaffold_require "bash"
    assert_success
}

@test "scaffold_require exits 2 when command missing" {
    run scaffold_require "nonexistent_tool_xyz"
    assert_failure 2
    assert_output --partial "required but not installed"
}
```

### Pattern B: Testing Scripts That Modify Files (Temp Dir Isolation)

Script test pattern — run the full script in an isolated temp directory.

```bash
#!/usr/bin/env bats

setup() {
    load 'test_helper/common-setup'
    _common_setup

    # Create a mock commands/ directory
    mkdir -p "$TEST_TEMP_DIR/commands"
    echo "---
description: \"Test command\"
---
# Test" > "$TEST_TEMP_DIR/commands/test-cmd.md"

    # Create a mock target directory
    mkdir -p "$TEST_TEMP_DIR/target"
}

teardown() {
    _common_teardown
}

@test "install.sh copies command files to target directory" {
    run bash "$PROJECT_ROOT/scripts/install.sh" \
        "$TEST_TEMP_DIR/commands" "$TEST_TEMP_DIR/target"
    assert_success
    assert_file_exists "$TEST_TEMP_DIR/target/test-cmd.md"
}

@test "install.sh skips existing files without -f flag" {
    cp "$TEST_TEMP_DIR/commands/test-cmd.md" "$TEST_TEMP_DIR/target/test-cmd.md"
    run bash "$PROJECT_ROOT/scripts/install.sh" \
        "$TEST_TEMP_DIR/commands" "$TEST_TEMP_DIR/target"
    assert_success
    assert_output --partial "already exists"
}

@test "install.sh exits 1 when source directory missing" {
    run bash "$PROJECT_ROOT/scripts/install.sh" \
        "/nonexistent/commands" "$TEST_TEMP_DIR/target"
    assert_failure 1
    assert_output --partial "Error:"
}
```

### Pattern C: Mocking External Commands (PATH Manipulation)

Mock commands by creating stubs on a temporary PATH.

```bash
#!/usr/bin/env bats

setup() {
    load 'test_helper/common-setup'
    _common_setup

    # Create mock bin directory and prepend to PATH
    MOCK_BIN="$TEST_TEMP_DIR/mock-bin"
    mkdir -p "$MOCK_BIN"
    PATH="$MOCK_BIN:$PATH"
}

teardown() {
    _common_teardown
}

@test "detect-completion exits 0 when git is available" {
    # Create a git mock that always succeeds
    cat > "$MOCK_BIN/git" <<'MOCK'
#!/usr/bin/env bash
echo "mock-sha"
exit 0
MOCK
    chmod +x "$MOCK_BIN/git"

    run bash "$PROJECT_ROOT/scripts/detect-completion.sh" "$TEST_TEMP_DIR"
    assert_success
}

@test "user-stories-mmr exits 1 when neither codex nor gemini available" {
    # No mocks on PATH — commands don't exist
    # Override HAS_CODEX/HAS_GEMINI check by ensuring command -v fails
    run bash "$PROJECT_ROOT/scripts/user-stories-mmr.sh" \
        --skip-codex --skip-gemini
    assert_failure 1
    assert_output --partial "Neither Codex nor Gemini"
}
```

### Pattern D: Testing Exit Codes and Stderr

Use `run --separate-stderr` (bats-core 1.5+) to capture stderr independently.

```bash
@test "validate-config exits 1 with error message for missing file" {
    run --separate-stderr bash "$PROJECT_ROOT/scripts/validate-config.sh" \
        "/nonexistent/config.json"
    assert_failure 1
    assert_equal "$stderr" "Error: config file not found at /nonexistent/config.json"
}

@test "scaffold_log error writes to stderr only" {
    run --separate-stderr scaffold_log error "disk full"
    assert_success
    assert_output ""                               # stdout is empty
    assert_equal "$stderr" "ERROR: disk full"       # stderr has the message
}

@test "resolve-deps exits 1 on cyclic dependency graph" {
    # Create a config with cyclic dependencies
    cat > "$TEST_TEMP_DIR/deps.json" <<'EOF'
{"a": ["b"], "b": ["c"], "c": ["a"]}
EOF
    run bash "$PROJECT_ROOT/scripts/resolve-deps.sh" "$TEST_TEMP_DIR/deps.json"
    assert_failure 1
    assert_output --partial "cycle"
}
```

### Pattern E: JSON Validation with jq

Use `jq -e` inside bats tests to validate JSON structure.

```bash
@test "config.json has required fields" {
    cat > "$TEST_TEMP_DIR/config.json" <<'EOF'
{"scaffold-version":"2","profile":"web-app","prompts":["init","tech-stack"]}
EOF
    run jq -e '.["scaffold-version"] and .profile and .prompts' \
        "$TEST_TEMP_DIR/config.json"
    assert_success
}

@test "config.json rejects missing profile field" {
    cat > "$TEST_TEMP_DIR/config.json" <<'EOF'
{"scaffold-version":"2","prompts":[]}
EOF
    run jq -e '.profile' "$TEST_TEMP_DIR/config.json"
    assert_failure
}

@test "resolve-deps outputs valid JSON" {
    # Set up valid dependency input
    cat > "$TEST_TEMP_DIR/deps.json" <<'EOF'
{"a": ["b"], "b": [], "c": ["a"]}
EOF
    run bash "$PROJECT_ROOT/scripts/resolve-deps.sh" "$TEST_TEMP_DIR/deps.json"
    assert_success
    # Verify output is valid JSON
    run jq -e '.' <<< "$output"
    assert_success
}
```

### Pattern F: Frontmatter and Markdown Structural Validation

Test file structure without testing content.

```bash
@test "command file has valid YAML frontmatter" {
    cat > "$TEST_TEMP_DIR/test-cmd.md" <<'EOF'
---
description: "Run the test command"
---
# Test Command

Content here.
EOF
    run bash "$PROJECT_ROOT/scripts/validate-frontmatter.sh" \
        "$TEST_TEMP_DIR/test-cmd.md"
    assert_success
}

@test "command file rejected when description missing" {
    cat > "$TEST_TEMP_DIR/bad-cmd.md" <<'EOF'
---
phase: 1
---
# Bad Command
EOF
    run bash "$PROJECT_ROOT/scripts/validate-frontmatter.sh" \
        "$TEST_TEMP_DIR/bad-cmd.md"
    assert_failure
    assert_output --partial "description"
}

@test "all command files have valid frontmatter" {
    for file in "$PROJECT_ROOT"/commands/*.md; do
        run bash "$PROJECT_ROOT/scripts/validate-frontmatter.sh" "$file"
        assert_success
    done
}
```

### Mocking Strategy

| What | Mock? | Why |
|------|-------|-----|
| Network calls (`curl`, `wget`) | **Yes** | Tests must not depend on network availability |
| `bd` (Beads CLI) | **Yes** | External tool with side effects — stub it |
| `git push`, `git fetch` | **Yes** | Network operations with side effects |
| `codex`, `gemini` CLIs | **Yes** | External API calls — stub for exit code and output |
| `jq` | **No** | Local, deterministic, fast — test with real jq |
| `git` (local operations) | **No** | Local, deterministic — use real git in temp dirs |
| File operations (`cp`, `mv`, `mkdir`) | **No** | Use temp dirs for isolation instead |
| `shellcheck` | **No** | Local tool — run it for real when testing lint |

## 4. AI-Specific Testing Rules

### Rule 1: Never Test the Framework

Don't test that `jq`, `bats`, `bash`, or standard utilities work correctly. Only test our logic.

```bash
# BAD — testing jq itself
@test "jq can parse JSON" {
    run jq '.' <<< '{"key":"value"}'
    assert_success
}

# GOOD — testing our function that uses jq
@test "scaffold_read_config parses profile from config" {
    echo '{"profile":"web-app"}' > "$TEST_TEMP_DIR/config.json"
    run scaffold_read_config "$TEST_TEMP_DIR/config.json" ".profile"
    assert_success
    assert_output "web-app"
}
```

### Rule 2: Never Write Trivial Tests

If a test can't catch a real bug, delete it.

```bash
# BAD — trivial, can never catch a real bug
@test "SCRIPT_DIR is set" {
    [ -n "$SCRIPT_DIR" ]
}

# GOOD — tests actual behavior that could break
@test "SCRIPT_DIR resolves to absolute path when run from different directory" {
    cd /tmp
    run bash "$PROJECT_ROOT/scripts/install.sh" --help
    assert_success
}
```

### Rule 3: Assert Behavior, Not Implementation

Test what the code does, not how it does it.

```bash
# BAD — testing implementation detail (which function is called internally)
@test "resolve-deps uses Kahn's algorithm" {
    # Don't test internal implementation
}

# GOOD — testing observable behavior
@test "resolve-deps returns topologically sorted order" {
    cat > "$TEST_TEMP_DIR/deps.json" <<'EOF'
{"c": ["a", "b"], "a": [], "b": ["a"]}
EOF
    run bash "$PROJECT_ROOT/scripts/resolve-deps.sh" "$TEST_TEMP_DIR/deps.json"
    assert_success
    # "a" must come before "b", "b" must come before "c"
    local a_pos b_pos c_pos
    a_pos=$(echo "$output" | grep -n "a" | head -1 | cut -d: -f1)
    b_pos=$(echo "$output" | grep -n "b" | head -1 | cut -d: -f1)
    c_pos=$(echo "$output" | grep -n "c" | head -1 | cut -d: -f1)
    [ "$a_pos" -lt "$b_pos" ]
    [ "$b_pos" -lt "$c_pos" ]
}
```

### Rule 4: Every Test Must Fail Meaningfully

If you can't describe a realistic scenario where the test catches a bug, the test has no value.

```bash
# BAD — passes trivially, never fails meaningfully
@test "install.sh exists" {
    assert_file_exists "$PROJECT_ROOT/scripts/install.sh"
}

# GOOD — catches a real class of bugs (broken error handling)
@test "install.sh exits 1 when source directory does not exist" {
    run bash "$PROJECT_ROOT/scripts/install.sh" "/nonexistent/path"
    assert_failure 1
    assert_output --partial "Error:"
}
```

### Rule 5: Descriptive Test Names

Format: `"<subject> <behavior> [when <condition>]"`

```bash
# BAD
@test "test error" { ... }
@test "config test 1" { ... }

# GOOD
@test "validate-config rejects file with missing scaffold-version" { ... }
@test "scaffold_log writes warning to stderr when level is warn" { ... }
@test "resolve-deps exits 1 when dependency graph has cycle" { ... }
```

### Rule 6: No Test Ordering Dependencies

Every test must pass when run in isolation. Use `setup()` and `teardown()` for all state.

```bash
# BAD — test 2 depends on test 1's side effect
@test "create config file" {
    echo '{}' > "$SHARED_CONFIG"
}
@test "read config file" {
    run jq '.' "$SHARED_CONFIG"   # Fails if test 1 didn't run
    assert_success
}

# GOOD — each test creates its own state
@test "scaffold_read_config handles valid config" {
    echo '{"profile":"web"}' > "$TEST_TEMP_DIR/config.json"
    run scaffold_read_config "$TEST_TEMP_DIR/config.json" ".profile"
    assert_success
}
```

### Rule 7: Bug Fix = Failing Test First

No exceptions. See [Bug-Fix TDD](#bug-fix-tdd) above.

### Rule 8: No Golden-File or Snapshot Tests for stdout

Don't compare entire stdout against a saved file. Stdout format changes break tests for cosmetic reasons. Use structural assertions instead.

```bash
# BAD — fragile snapshot test
@test "install.sh output matches golden file" {
    run bash "$PROJECT_ROOT/scripts/install.sh" "$TEST_TEMP_DIR/commands" "$TEST_TEMP_DIR/target"
    diff <(echo "$output") tests/fixtures/install-expected-output.txt
}

# GOOD — structural assertions on meaningful parts
@test "install.sh reports count of installed commands" {
    run bash "$PROJECT_ROOT/scripts/install.sh" "$TEST_TEMP_DIR/commands" "$TEST_TEMP_DIR/target"
    assert_success
    assert_output --partial "Installed"
    assert_output --partial "command(s)"
}
```

## 5. Coverage & Quality Standards

### Coverage Tool

[kcov](https://github.com/SimonKagworma/kcov) provides code coverage for Bash scripts.

> **macOS caveat**: kcov requires building from source on macOS and depends on `cmake` and `libdw`. Homebrew: `brew install kcov` (if available) or build from source. CI (Linux) has simpler installation.

```bash
# Run tests with coverage
kcov --include-path=scripts/,lib/ coverage/ bats tests/

# View report
open coverage/index.html
```

### Coverage Thresholds

| Category | Target | Rationale |
|----------|--------|-----------|
| `lib/common.sh` (shared library) | 90%+ branch | Used by every script — bugs here cascade |
| Validation scripts (`validate-config.sh`, `validate-frontmatter.sh`) | 90%+ branch | Correctness is their entire purpose |
| Core scripts (`resolve-deps.sh`, `resolve-profile.sh`, `resolve-prompt.sh`) | 80%+ branch | Algorithmic — most branches are reachable |
| File operation scripts (`install.sh`, `uninstall.sh`, `update.sh`) | 80%+ branch | File system edge cases matter |
| Network-dependent scripts (`user-stories-mmr.sh`) | 70%+ branch | Heavily mocked — real coverage is lower |
| `extract-commands.sh` | 70%+ branch | Text parsing with many edge cases — focus on common paths |

### What to Measure

- **Branch coverage over line coverage**: A function with one `if/else` can have 100% line coverage while only testing the true branch. Branch coverage catches this.
- 100% coverage is explicitly **not** a goal. Chasing 100% leads to trivial tests that test the framework, not the logic.

### When Coverage Matters Most

These areas must have thorough branch coverage because bugs cause cascading failures:

- Config reading/writing (`scaffold_read_config`, `scaffold_write_config`)
- Dependency resolution (`resolve-deps.sh`)
- Path resolution (`scaffold_resolve_root`)
- Exit code paths (every error branch must be tested)

## 6. CI / Test Execution

### Running Tests

```bash
# Run all tests
bats tests/

# Run a single test file
bats tests/common.bats

# Run tests matching a filter
bats tests/ --filter "scaffold_read_config"

# Run tests in parallel (4 jobs)
bats --jobs 4 tests/

# Run with TAP output (for CI)
bats --formatter tap tests/
```

### Pre-commit Hooks

Pre-commit runs on every commit (chained with existing Beads hooks):

1. **Beads hook** (existing) — validates `[BD-<id>]` commit message format
2. **ShellCheck** — `shellcheck` on staged `.sh` files
3. **Frontmatter validation** — `scripts/validate-frontmatter.sh` on staged `commands/*.md` files

```bash
# ShellCheck on all scripts
shellcheck scripts/*.sh lib/*.sh

# ShellCheck on a single file
shellcheck scripts/install.sh
```

### Pre-push Hooks

Pre-push runs the full test suite:

```bash
bats tests/
```

If any test fails, the push is blocked.

### Performance Targets

| Metric | Target |
|--------|--------|
| Single test file | < 5 seconds |
| Full test suite | < 30 seconds |
| Individual test | < 1 second |

If tests approach these limits, investigate — slow tests usually indicate missing mocks or unnecessary I/O.

### Flaky Test Policy

Flaky tests (tests that fail intermittently) are bugs.

1. Mark with `skip "flaky: <description> [BD-<id>]"` immediately
2. Create a Beads task: `bd create "fix: flaky test <name>" -p 1`
3. Fix within the current sprint — do not let skipped tests accumulate
4. Common causes in bash tests: race conditions in background processes, temp file cleanup ordering, PATH pollution between tests

```bash
@test "background process cleanup" {
    skip "flaky: race condition in cleanup [BD-scaffold-xyz]"
    # ... test body ...
}
```

## 7. E2E / Visual Testing

Scaffold is a CLI plugin and prompt pipeline — not a web or mobile application. E2E testing in the traditional sense (browser automation, mobile flow testing) does not apply to the core project.

**Placeholder** — to be completed by:

- **`/scaffold:add-playwright`** — for web apps using Playwright (browser automation, visual regression)
- **`/scaffold:add-maestro`** — for Expo/mobile apps using Maestro (flow testing, screenshot verification)

When those prompts run on a target project, they will add E2E-specific sections to that project's TDD standards covering:

- E2E test file organization
- Page object / screen object patterns
- Visual regression baselines
- CI integration for E2E suites
- Performance budgets

Until then, TDD efforts focus on unit and script tests using bats-core.

## Quick Reference

### Commands Cheat Sheet

```bash
# ─── Test Execution ──────────────────────────────────────────
bats tests/                              # Run all tests
bats tests/common.bats                   # Run one test file
bats tests/ --filter "rejects"           # Run tests matching filter
bats --jobs 4 tests/                     # Parallel execution
bats --formatter tap tests/              # TAP output for CI

# ─── Linting ─────────────────────────────────────────────────
shellcheck scripts/*.sh lib/*.sh         # Lint all scripts
shellcheck -x scripts/install.sh         # Lint with source following

# ─── Coverage ────────────────────────────────────────────────
kcov --include-path=scripts/,lib/ coverage/ bats tests/
open coverage/index.html                 # View HTML report

# ─── Frontmatter Validation ─────────────────────────────────
bash scripts/validate-frontmatter.sh commands/*.md
```

### bats-assert Assertion Reference

| Assertion | Purpose | Example |
|-----------|---------|---------|
| `assert_success` | Exit code is 0 | `run cmd; assert_success` |
| `assert_failure` | Exit code is non-zero | `run cmd; assert_failure` |
| `assert_failure N` | Exit code is exactly N | `run cmd; assert_failure 1` |
| `assert_output "text"` | stdout equals text exactly | `assert_output "hello"` |
| `assert_output --partial "text"` | stdout contains text | `assert_output --partial "Error:"` |
| `assert_output --regexp "pattern"` | stdout matches regex | `assert_output --regexp "^v[0-9]"` |
| `refute_output` | stdout is empty | `refute_output` |
| `refute_output --partial "text"` | stdout does not contain text | `refute_output --partial "secret"` |
| `assert_line "text"` | A line of stdout equals text | `assert_line "done"` |
| `assert_line --index 0 "text"` | First line equals text | `assert_line --index 0 "header"` |

### bats-file Assertion Reference

| Assertion | Purpose |
|-----------|---------|
| `assert_file_exists "$path"` | File exists |
| `assert_file_not_exists "$path"` | File does not exist |
| `assert_dir_exists "$path"` | Directory exists |
| `assert_dir_not_exists "$path"` | Directory does not exist |
| `assert_file_executable "$path"` | File is executable |
| `assert_file_contains "$path" "text"` | File contains text |

### bats Variable Reference

| Variable | Description |
|----------|-------------|
| `$BATS_TEST_FILENAME` | Path to the current `.bats` file |
| `$BATS_TEST_DIRNAME` | Directory of the current `.bats` file |
| `$BATS_TEST_NAME` | Name of the current test |
| `$BATS_TMPDIR` | System temp directory |
| `$BATS_RUN_TMPDIR` | Temp directory for the current `bats` run |
| `$BATS_TEST_TMPDIR` | Temp directory for the current test |
| `$status` | Exit code from last `run` command |
| `$output` | Combined stdout from last `run` command |
| `$lines` | Array of stdout lines from last `run` command |
| `$stderr` | Stderr from `run --separate-stderr` (bats-core 1.5+) |
