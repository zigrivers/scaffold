---
name: eval-craft
description: Writing effective project evals that verify AI-generated code meets documented standards
topics: [evals, verification, coverage, adherence, consistency, structure, code-quality, standards-compliance]
---

# Eval Craft

Evals are project-wide property checks — automated tests that verify AI-generated code meets the project's own documented standards. They sit alongside unit tests and integration tests but serve a fundamentally different purpose.

## Summary

### What Evals Are

Evals verify that a project follows its own documented rules. They operate at the project level — reading documentation, scanning source trees, parsing configuration, and checking git history. They do not test whether code is correct (that is what functional tests do). They test whether the project is internally consistent and complete.

Unit tests answer: "Does this function return the right result?"
Integration tests answer: "Do these components work together?"
Evals answer: "Does this project follow its own documented rules?"

### The Four Categories

1. **Consistency Evals** — Verify documentation and tooling stay in sync. Command tables match build targets, commit messages follow documented format, cross-doc references resolve.
2. **Structure Evals** — Verify files are in the right places per project-structure.md. File placement rules, shared code 2+ consumer requirement, test co-location conventions.
3. **Adherence Evals** — Verify code follows patterns from coding-standards.md and tdd-standards.md. TODO format, mock patterns, error handling, stack-specific rules. Must support exclusion mechanisms.
4. **Coverage Evals** — Verify documented requirements have corresponding implementation and tests. Feature-to-code keyword matching, AC-to-test mapping, API endpoint coverage.

### Design Principles

- **Binary PASS/FAIL, not scores** — prevents Goodhart's Law gaming
- **Every eval needs a false-positive mitigation strategy** — exclusion mechanism is mandatory
- **Prefer grep over AST** — faster to write, run, and maintain
- **Evals must be fast** — full suite under 15 seconds, individual file under 2 seconds
- **One category per eval file** — don't mix consistency and adherence in one file
- **Document what evals don't check** — prevent false confidence

### What Evals Do NOT Verify

- Whether code is correct (functional tests)
- Whether code is elegant or well-designed (code review)
- Whether tests are good quality (manual review)
- Whether the UI looks right (visual testing)
- Whether performance meets targets (benchmarks)
- Whether security vulnerabilities exist (security scanning)

This boundary must be documented explicitly in `docs/eval-standards.md`.

## Deep Guidance

### Evals vs. Other Quality Tools

| Tool | What It Checks | Scope | When It Runs |
|------|---------------|-------|-------------|
| **Unit tests** | Algorithmic correctness of individual functions | Single function/class | Every commit |
| **Integration tests** | Component interaction correctness | Multi-component | Every commit |
| **E2E tests** | User-facing behavior correctness | Full system | Pre-merge/CI |
| **Linters** | Syntax rules, style enforcement | Single file | Pre-commit |
| **Evals** | Standards adherence, coverage completeness, doc-code sync | Entire project | On demand / CI opt-in |

### What Evals Verify

- Documentation says X commands exist → do they?
- Coding standards say no bare `any` types → are there any?
- Project structure says shared code needs 2+ consumers → does it?
- User stories define acceptance criteria → do tests reference them?
- Commit format is documented → do recent commits follow it?

### Consistency Evals — Deep Dive

#### What to Check

- **Command tables → build targets**: Every command listed in CLAUDE.md's Key Commands table has a corresponding target in Makefile, package.json scripts, or pyproject.toml. And vice versa — no orphan targets that aren't documented.
- **Commit message format**: Recent commits in `git log` follow the format documented in `docs/coding-standards.md`. Use regex matching against the documented pattern.
- **Cross-document references**: File paths referenced in documentation actually exist on disk. Markdown links between docs resolve. Section references point to real headings.
- **Configuration consistency**: Values in config files match what docs describe (port numbers, environment variable names, feature flags).

#### Techniques

**Parsing markdown tables**: Extract rows from pipe-delimited tables, pull backtick-quoted commands, normalize whitespace.

```typescript
function extractCommandsFromTable(markdown: string): string[] {
  const tableRows = markdown.match(/\|[^|]+\|[^|]+\|/g) || [];
  return tableRows
    .map(row => row.match(/`([^`]+)`/)?.[1])
    .filter((cmd): cmd is string => cmd !== undefined)
    .filter(cmd => !cmd.startsWith('|')); // skip header separators
}
```

**Matching commands to targets**: Different build systems have different lookup methods.

```typescript
// package.json: direct key lookup
const scripts = JSON.parse(readFileSync('package.json', 'utf-8')).scripts || {};
const hasTarget = (cmd: string) => cmd.replace(/^npm run /, '') in scripts;

// Makefile: parse target lines (lines starting with word characters followed by colon)
const makefile = readFileSync('Makefile', 'utf-8');
const targets = makefile.match(/^[\w-]+(?=\s*:)/gm) || [];
const hasTarget = (cmd: string) => targets.includes(cmd.replace(/^make /, ''));
```

**Validating cross-doc references**: Scan for markdown links and file path references, verify targets exist.

```typescript
function findBrokenRefs(docPath: string): string[] {
  const content = readFileSync(docPath, 'utf-8');
  const refs = content.match(/`((?:docs|src|tests|scripts)\/[^`]+)`/g) || [];
  return refs
    .map(ref => ref.replace(/`/g, ''))
    .filter(ref => !existsSync(ref));
}
```

#### Common False Positives

- **Dynamic commands**: Commands with arguments (e.g., `scripts/setup-agent-worktree.sh <name>`) won't match a static Makefile target. Solution: match the base command, not the full invocation.
- **Aliased commands**: `npm test` matches `scripts.test`, not `scripts["npm test"]`. Normalize before matching.
- **Heading anchors in docs**: Markdown heading IDs are auto-generated and case-sensitive. Match against the raw heading text, not a guessed slug.
- **Git log on fresh repos**: A new project has no commit history. Guard against empty log output.

### Structure Evals — Deep Dive

#### What to Check

- **File placement**: Source files are in the directories their module defines. No stray files in the root. No feature code in shared directories.
- **Shared code consumer count**: Files in `shared/`, `common/`, or `lib/` directories must have 2+ distinct importers. A "shared" file used by only one module is misplaced — it belongs in that module.
- **Test co-location**: Test files follow the convention from `docs/tdd-standards.md` — either co-located with source (`foo.test.ts` next to `foo.ts`) or in a mirror directory (`tests/features/` mirroring `src/features/`).
- **No orphan files**: Every source file is either imported by another file or is an entry point (main, index, route handler). Dead files indicate incomplete cleanup.

#### Techniques

**Checking the 2+ consumer rule**: Scan all source files for imports of the shared file.

```typescript
function countConsumers(sharedFile: string, allFiles: string[]): number {
  // Build possible import forms for this file
  const importPath = sharedFile
    .replace(/^src\//, '@/')
    .replace(/\.\w+$/, '');  // strip extension
  const fileName = path.basename(sharedFile, path.extname(sharedFile));

  return allFiles.filter(f => {
    if (f === sharedFile) return false;
    const content = readFileSync(f, 'utf-8');
    // Check both path-style imports and named imports
    return content.includes(importPath) ||
           content.includes(`from '${importPath}'`) ||
           content.includes(`require('${importPath}')`);
  }).length;
}
```

**Verifying test co-location**: Given the project's test convention, check that every source file has a corresponding test file.

```typescript
// Co-located: src/features/auth/login.ts -> src/features/auth/login.test.ts
function findColocatedTest(sourceFile: string): string {
  const ext = path.extname(sourceFile);
  return sourceFile.replace(ext, `.test${ext}`);
}

// Mirror directory: src/features/auth/login.ts -> tests/features/auth/login.test.ts
function findMirrorTest(sourceFile: string): string {
  const ext = path.extname(sourceFile);
  return sourceFile
    .replace(/^src\//, 'tests/')
    .replace(ext, `.test${ext}`);
}
```

#### Common False Positives

- **Entry points with no importers**: `main.ts`, `index.ts`, route files, and CLI entry points won't be imported by other files. Maintain an exclusion list for known entry point patterns.
- **Type-only files**: TypeScript `.d.ts` files and type exports may have only type-level imports that are erased at runtime. Count type imports as consumers.
- **Generated files**: Files in `generated/` or `__generated__/` directories follow different rules. Exclude them from structure checks.
- **Config files**: `tailwind.config.ts`, `vite.config.ts`, etc. live in the root by convention, not by module placement rules.

### Adherence Evals — Deep Dive

#### What to Check

- **TODO format**: No `TODO`, `FIXME`, or `HACK` comments without a task ID (e.g., `[BD-123]`). Untagged TODOs are tracking gaps.
- **Mock patterns**: Test files follow the project's mocking strategy. If `docs/tdd-standards.md` says "don't mock the database in integration tests," scan for that pattern.
- **Error handling**: Code follows the error handling convention (e.g., custom error classes, no bare `catch {}`, no swallowed errors).
- **Stack-specific patterns**: Derived from `docs/tech-stack.md`:
  - TypeScript: no `any` type, no `@ts-ignore` without justification
  - Python: no bare `except:`, no `import *`
  - Go: no ignored error returns (unchecked `_`)
  - Shell: `set -euo pipefail` at top of scripts

#### The Exclusion Mechanism

Adherence evals MUST support exclusions. Users will have legitimate reasons to violate patterns — third-party library types require `any`, a specific `@ts-ignore` is the only workaround for a known bug, etc.

**Exclusion pattern** (inline comment):
```typescript
// eval-ignore: any — third-party lib returns untyped response
const data: any = legacyApi.fetch();
```

**Exclusion pattern** (test file configuration):
```typescript
const EXCLUDED_FILES = [
  'src/legacy/**',           // pre-standards code, being migrated
  'src/generated/**',        // auto-generated, not human-maintained
];

const EXCLUDED_PATTERNS = [
  { pattern: /: any\b/, file: 'src/adapters/legacy-api.ts', reason: 'legacy API returns untyped' },
];
```

The exclusion list lives in the adherence eval file itself. When the Create Evals prompt runs in update mode, it preserves these exclusions — they represent institutional knowledge about legitimate exceptions.

#### Techniques

**Scanning for pattern violations**: Use regex against file content, filtering by file extension and respecting exclusions.

```typescript
function findViolations(
  pattern: RegExp,
  files: string[],
  exclusions: { file: string; reason: string }[]
): { file: string; line: number; match: string }[] {
  const excluded = new Set(exclusions.map(e => e.file));
  const violations: { file: string; line: number; match: string }[] = [];

  for (const file of files) {
    if (excluded.has(file)) continue;
    const lines = readFileSync(file, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('eval-ignore')) continue; // inline exclusion
      const match = lines[i].match(pattern);
      if (match) {
        violations.push({ file, line: i + 1, match: match[0] });
      }
    }
  }
  return violations;
}
```

**Stack-specific pattern detection**: Read `docs/tech-stack.md` to determine which patterns apply.

```python
# pytest example: detect bare except clauses
import ast, pathlib

def find_bare_excepts(src_dir: str) -> list[dict]:
    violations = []
    for py_file in pathlib.Path(src_dir).rglob("*.py"):
        try:
            tree = ast.parse(py_file.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ExceptHandler) and node.type is None:
                violations.append({
                    "file": str(py_file),
                    "line": node.lineno,
                    "issue": "bare except: clause"
                })
    return violations
```

#### String Matching vs. AST Parsing

**Prefer string/regex matching** for most adherence checks:
- Faster to write and run
- Works across all languages without language-specific tooling
- Sufficient for pattern detection (TODO format, type annotations, comment conventions)
- Easier to maintain and debug

**Use AST parsing only when**:
- Regex would produce unacceptable false positive rates (e.g., matching patterns inside string literals)
- The check requires structural understanding (e.g., "function has more than 5 parameters")
- The project already has AST tooling available (e.g., Python projects can use `ast` module with zero dependencies)

Rule of thumb: if grep can find it, use grep. If grep finds too many false positives, try a more specific regex. Only reach for AST parsing as a last resort.

### Coverage Evals — Deep Dive

#### What to Check

- **Feature coverage**: Every Must-have feature in `docs/plan.md` or `docs/prd.md` maps to at least one implementation file. Match by keywords from the feature description against file names and file content.
- **AC coverage**: Every acceptance criterion in `docs/user-stories.md` is referenced by at least one test file. Match by domain keywords extracted from the AC text.
- **API coverage**: Every API endpoint described in docs has a route definition and at least one test.

#### Extracting Requirements from Markdown

Parse structured markdown to extract testable requirements:

```typescript
interface Requirement {
  id: string;
  text: string;
  keywords: string[];
}

function extractACs(userStoriesContent: string): Requirement[] {
  const acs: Requirement[] = [];
  const lines = userStoriesContent.split('\n');
  let currentStoryId = '';

  for (const line of lines) {
    // Match story headers like "## US-001: User Login"
    const storyMatch = line.match(/^##\s+(US-\d+)/);
    if (storyMatch) {
      currentStoryId = storyMatch[1];
      continue;
    }

    // Match AC lines like "- AC-1: Given..." or "- [ ] User can..."
    const acMatch = line.match(/^[-*]\s+(?:AC-\d+:\s*)?(.+)/);
    if (acMatch && currentStoryId) {
      const text = acMatch[1];
      acs.push({
        id: `${currentStoryId}`,
        text,
        keywords: extractKeywords(text),
      });
    }
  }
  return acs;
}

function extractKeywords(text: string): string[] {
  // Remove common filler words, keep domain terms
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'shall', 'should', 'may', 'might', 'must', 'can', 'could',
    'would', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'when', 'then', 'given', 'and', 'or', 'but', 'if', 'that',
    'this', 'with', 'for', 'from', 'to', 'in', 'on', 'at',
    'by', 'not', 'no', 'see', 'also',
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}
```

#### The Confidence Spectrum

Coverage matching is inherently fuzzy. Categorize matches by confidence:

| Confidence | Criteria | Action |
|-----------|---------|--------|
| **High** | Test file contains the exact requirement ID (e.g., `US-001`) or exact key phrase (e.g., `"5 failed attempts"`) | PASS |
| **Medium** | Test file contains 2+ domain keywords from the AC (e.g., `login` + `lockout`) | PASS with note |
| **Low** | Test file contains only 1 keyword that could be coincidental | WARNING — manual review needed |
| **None** | No test file references any keyword from the AC | FAIL — likely missing coverage |

Coverage evals should report the confidence level alongside the result, so that teams can calibrate their response.

#### Handling Compound ACs

Some ACs contain multiple verifiable behaviors:

```
AC-3: Given I enter an invalid email, When I submit,
      Then I see "Invalid email format" AND the submit button is disabled
```

This AC has two checkable behaviors: the error message and the button state. Coverage evals should extract both key phrases and check for each independently. A test that checks the error message but not the button state gets a "partial" coverage note.

```typescript
function splitCompoundAC(acText: string): string[] {
  // Split on AND/and that separate distinct behaviors
  return acText
    .split(/\b(?:AND|and)\b/)
    .map(s => s.trim())
    .filter(s => s.length > 10); // filter out fragments
}
```

#### Feature-to-Code Mapping Heuristics

When checking whether a feature has implementation:

1. **File name matching**: Feature "user authentication" → look for files containing `auth`, `login`, `session` in their paths
2. **Content keyword matching**: Grep source files for domain terms from the feature description
3. **Route/endpoint matching**: Feature describes an API operation → look for the HTTP method + path pattern in route definitions
4. **Component matching**: Feature describes a UI screen → look for component files with matching names

```typescript
function featureHasImplementation(
  featureKeywords: string[],
  sourceFiles: string[]
): { found: boolean; matchedFiles: string[] } {
  const matchedFiles = sourceFiles.filter(file => {
    const fileLower = file.toLowerCase();
    const content = readFileSync(file, 'utf-8').toLowerCase();

    // Check file path for keyword matches
    const pathMatch = featureKeywords.some(kw => fileLower.includes(kw));
    // Check file content for 2+ keyword matches
    const contentMatches = featureKeywords.filter(kw => content.includes(kw));

    return pathMatch || contentMatches.length >= 2;
  });

  return { found: matchedFiles.length > 0, matchedFiles };
}
```

### Eval Design Principles — Extended

#### 1. Binary PASS/FAIL, Not Scores

Evals produce pass or fail, not scores. A "compliance score of 87%" invites gaming — teams optimize the score instead of fixing the underlying issues. Binary results force a clear decision: either the project meets the standard or it doesn't.

If a finding is not worth failing the eval, it should be a warning in the output, not a reduced score. If it IS worth failing, it should be a hard failure with a clear remediation path.

This directly mitigates Goodhart's Law: "When a measure becomes a target, it ceases to be a good measure."

#### 2. Every Eval Needs a False-Positive Mitigation Strategy

Before writing an eval, answer: "What legitimate code will this incorrectly flag?" If the answer is "nothing," you haven't thought hard enough. Every pattern check has false positives.

The mitigation strategy is the exclusion mechanism. Without it, teams disable noisy evals entirely — losing the signal along with the noise. With it, the eval stays active and exclusions document institutional knowledge.

#### 3. Prefer Grep Over AST

String and regex matching is:
- **Faster** to write (minutes, not hours)
- **Faster** to run (milliseconds, not seconds)
- **More portable** (works across languages with the same code)
- **Easier to debug** ("this regex matched this line" is obvious; "this AST visitor triggered on this node" is not)

The tradeoff is precision — regex can match patterns inside comments or string literals. In practice, eval-level checks (TODOs, type annotations, import patterns) rarely suffer from this. When they do, a more specific regex usually solves it.

#### 4. Evals Must Be Fast

The entire eval suite should run in seconds, not minutes. If evals are slow, developers won't run them.

**Performance targets:**
- Individual eval file: < 2 seconds
- Full eval suite (`make eval`): < 15 seconds
- File I/O: read files once, share across checks via helpers

**What makes evals slow:**
- Spawning subprocesses per check (shell out to `git` once, not per-commit)
- Reading the same file multiple times (cache file content in a helper)
- Globbing the entire source tree repeatedly (glob once, filter per-eval)

#### 5. One Category of Problem Per Eval

Each eval file checks one category: consistency, structure, adherence, or coverage. Don't mix them. A consistency eval that also checks adherence patterns is harder to maintain, harder to reason about when it fails, and harder to exclude false positives from.

If a check doesn't fit neatly into one category, it probably needs to be split or it doesn't belong in evals at all.

#### 6. Document What Evals Don't Check

The `docs/eval-standards.md` file must explicitly list what evals do NOT verify. This prevents false confidence and clearly delineates eval scope from functional testing, security scanning, and manual review.

### Framework-Specific Patterns

#### vitest / jest (TypeScript/JavaScript)

The most common eval framework for TypeScript projects. Evals are `.test.ts` files in `tests/evals/`.

```typescript
// tests/evals/helpers.ts — shared utilities
import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import { execSync } from 'child_process';

export function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

export function sourceFiles(pattern = 'src/**/*.{ts,tsx}'): string[] {
  return globSync(pattern).filter(f => !f.includes('.test.'));
}

export function testFiles(pattern = 'src/**/*.test.{ts,tsx}'): string[] {
  return globSync(pattern);
}

export function gitLog(count = 20): string[] {
  try {
    return execSync(`git log --oneline -${count}`)
      .toString().trim().split('\n');
  } catch {
    return []; // no git history (fresh repo)
  }
}

export function markdownFiles(dir = 'docs'): string[] {
  return globSync(`${dir}/**/*.md`);
}
```

**Running evals separately**:
```json
// package.json
{
  "scripts": {
    "eval": "vitest run tests/evals/ --reporter=verbose"
  }
}
```

#### pytest (Python)

Python evals use pytest with `conftest.py` for shared fixtures.

```python
# tests/evals/conftest.py
import pathlib
import subprocess
import pytest

@pytest.fixture(scope="session")
def source_files():
    return list(pathlib.Path("src").rglob("*.py"))

@pytest.fixture(scope="session")
def test_files():
    return list(pathlib.Path("tests").rglob("test_*.py"))

@pytest.fixture(scope="session")
def git_log():
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-20"],
            capture_output=True, text=True, check=True
        )
        return result.stdout.strip().split("\n")
    except subprocess.CalledProcessError:
        return []

@pytest.fixture(scope="session")
def doc_files():
    return list(pathlib.Path("docs").rglob("*.md"))
```

```python
# tests/evals/test_adherence.py
import re

def test_no_bare_except(source_files):
    """No bare except: clauses — must catch specific exception types."""
    violations = []
    for f in source_files:
        for i, line in enumerate(f.read_text().splitlines(), 1):
            if re.match(r'\s*except\s*:', line):
                if 'eval-ignore' not in line:
                    violations.append(f"{f}:{i}")
    assert violations == [], f"Bare except: found in: {violations}"

def test_no_import_star(source_files):
    """No wildcard imports — explicit imports only."""
    violations = []
    for f in source_files:
        for i, line in enumerate(f.read_text().splitlines(), 1):
            if re.match(r'from\s+\S+\s+import\s+\*', line):
                violations.append(f"{f}:{i}")
    assert violations == [], f"Wildcard imports found in: {violations}"
```

**Running evals separately**:
```toml
# pyproject.toml
[tool.pytest.ini_options]
markers = ["eval: project eval checks"]

# Or use a separate config
# pytest tests/evals/ -v
```

#### bats (Shell)

Shell project evals use bats-core. Simpler patterns — mostly file existence and grep checks.

```bash
# tests/evals/consistency.bats
#!/usr/bin/env bats

setup() {
  load '../test_helper/common-setup'
}

@test "every Makefile target is documented in CLAUDE.md" {
  # Extract targets from Makefile (lines matching "target:")
  local targets
  targets=$(grep -oE '^[a-zA-Z_-]+:' Makefile | tr -d ':' | sort)

  for target in $targets; do
    # Skip internal targets (prefixed with _)
    [[ "$target" == _* ]] && continue
    run grep -q "\`make $target\`" CLAUDE.md
    [ "$status" -eq 0 ] || fail "Makefile target '$target' not documented in CLAUDE.md"
  done
}

@test "all scripts have shellcheck directive" {
  for script in scripts/*.sh; do
    [ -f "$script" ] || continue
    run head -5 "$script"
    echo "$output" | grep -q 'shellcheck' || \
      fail "$script missing shellcheck directive in first 5 lines"
  done
}

@test "no TODO without task ID" {
  local violations
  violations=$(grep -rn 'TODO\|FIXME\|HACK' scripts/ lib/ --include='*.sh' \
    | grep -v '\[BD-' \
    | grep -v 'eval-ignore' || true)
  [ -z "$violations" ] || fail "Untagged TODOs found:\n$violations"
}
```

#### go test (Go)

Go evals use the standard `testing` package with file I/O helpers.

```go
// tests/evals/helpers_test.go
package evals

import (
    "os"
    "os/exec"
    "path/filepath"
    "strings"
    "testing"
)

func sourceFiles(t *testing.T) []string {
    t.Helper()
    var files []string
    filepath.Walk(".", func(path string, info os.FileInfo, err error) error {
        if err != nil { return nil }
        if strings.HasSuffix(path, ".go") &&
           !strings.HasSuffix(path, "_test.go") &&
           !strings.Contains(path, "vendor/") {
            files = append(files, path)
        }
        return nil
    })
    return files
}

func gitLog(t *testing.T, count int) []string {
    t.Helper()
    out, err := exec.Command("git", "log", "--oneline",
        "-"+string(rune('0'+count))).Output()
    if err != nil { return nil }
    return strings.Split(strings.TrimSpace(string(out)), "\n")
}

func readDoc(t *testing.T, path string) string {
    t.Helper()
    data, err := os.ReadFile(path)
    if err != nil {
        t.Skipf("doc not found: %s", path)
    }
    return string(data)
}
```

```go
// tests/evals/adherence_test.go
package evals

import (
    "os"
    "regexp"
    "strings"
    "testing"
)

func TestNoIgnoredErrors(t *testing.T) {
    // Go convention: error returns must be checked, not assigned to _
    pattern := regexp.MustCompile(`\b\w+,\s*_\s*:?=\s*\w+\(`)
    for _, file := range sourceFiles(t) {
        data, _ := os.ReadFile(file)
        lines := strings.Split(string(data), "\n")
        for i, line := range lines {
            if strings.Contains(line, "eval-ignore") { continue }
            if pattern.MatchString(line) {
                t.Errorf("%s:%d: unchecked error return: %s",
                    file, i+1, strings.TrimSpace(line))
            }
        }
    }
}
```

### Common Eval Anti-Patterns

#### 1. Evals That Are Too Specific

**Symptom**: Evals break on every refactor, even when the project is perfectly compliant.

**Example**: An eval that checks for exactly 5 entries in a Key Commands table. Adding a 6th command fails the eval even though the project is more documented, not less.

**Fix**: Check the property (every command has a target), not the count. Check patterns (files exist in the right directories), not exact paths.

#### 2. Evals That Are Too Vague

**Symptom**: Evals always pass, even on projects with clear problems.

**Example**: An eval that checks "at least one test file exists." Every project passes, even one with a single meaningless test.

**Fix**: Be specific about what the eval verifies. "Every module directory has at least one test file" is more useful than "some tests exist."

#### 3. Evals That Test the Framework

**Symptom**: Eval failures reveal framework behavior, not project problems.

**Example**: An eval that verifies `glob('**/*.ts')` returns files. If it returns nothing, the problem is the glob pattern or the working directory, not the project.

**Fix**: Evals should assume the testing framework works correctly. If a helper returns no files, skip the eval rather than failing it (use `test.skip` or `t.Skip()`).

#### 4. Evals That Duplicate Linter Rules

**Symptom**: Evals flag the same issues as ESLint, Ruff, or ShellCheck.

**Example**: An eval that checks for unused variables. ESLint already does this with better precision and better editor integration.

**Fix**: Don't duplicate what linters do. Evals check project-level properties that linters can't: cross-file consistency, doc-code sync, requirement coverage. If a linter rule covers it, defer to the linter.

#### 5. Evals Without Exclusion Mechanisms

**Symptom**: Teams disable entire eval files because they produce too many false positives that can't be individually suppressed.

**Example**: An adherence eval that flags every use of `any` in TypeScript, including legitimate uses in generic utility types, third-party library interfaces, and JSON parsing.

**Fix**: Every adherence eval must support both file-level exclusions (glob patterns) and line-level exclusions (inline comments). Document how to add exclusions in `docs/eval-standards.md`.

#### 6. Coverage Evals With Exact String Matching

**Symptom**: Coverage evals fail because the test uses slightly different wording than the acceptance criterion.

**Example**: AC says "user sees error message" — eval looks for the exact string "user sees error message" in test files. The test actually says `expect(screen.getByText('Invalid email')).toBeVisible()` which validates the same requirement.

**Fix**: Use keyword extraction, not exact string matching. Extract domain terms from the AC ("error", "message", "invalid", "email") and match on 2+ keyword co-occurrence in test content.

### The Update/Review Cycle

Evals evolve with the project. The Create Evals prompt handles both fresh creation and updates to existing evals.

#### Fresh Mode

1. Read all project docs to understand standards and conventions
2. Generate all four eval categories from documentation content
3. Generate the helpers file for shared utilities
4. Run `make eval` to verify no false positives on current codebase
5. Fix any failures — they represent either false positives (add exclusions) or real problems (report to user)
6. Create `docs/eval-standards.md` documenting scope and boundaries

#### Update Mode

1. Read existing evals and compare against what current docs would produce
2. Categorize content as ADD, RESTRUCTURE, or PRESERVE
3. **Consistency and structure evals**: Fully regenerated from current docs. These are derived directly from documentation content — regenerating ensures they stay in sync.
4. **Adherence evals**: PRESERVED on re-run. Users customize exclusion patterns over time, and regenerating would lose that institutional knowledge. Only add new adherence checks for newly documented patterns.
5. **Coverage evals**: Regenerated when `docs/plan.md` or `docs/user-stories.md` change. The keyword extraction must reflect current requirements.
6. **Helpers**: Regenerated. Shared utilities should always match current patterns.
7. Run `make eval` to verify updates don't break existing passing evals

#### When to Add vs. Modify Evals

**Add a new eval when**:
- A new document creates new standards to verify (e.g., adding `docs/design-system.md` enables design token adherence checks)
- A new type of requirement appears (e.g., adding API contracts enables endpoint coverage checks)
- A recurring issue is found that evals should catch (log to `tasks/lessons.md`, then add the eval)

**Modify an existing eval when**:
- A false positive pattern is identified (add exclusion)
- The underlying standard changes (update the check to match)
- A check is too broad or too narrow (refine the regex/pattern)

**Delete an eval when**:
- The standard it checks has been removed from documentation
- The check is fully covered by a linter rule that's now configured
- The eval has been disabled for so long that nobody remembers what it checked

#### The Feedback Loop

Eval failures create a feedback loop with `tasks/lessons.md`:

```
1. Eval fails → team investigates
2. If real problem: fix the code, close the finding
3. If false positive: add exclusion, document why
4. If recurring pattern: add to tasks/lessons.md
5. Next eval update: lessons.md patterns become new adherence checks
```

This cycle ensures evals get better over time rather than accumulating noise.

### Eval Severity and Triage

Not all eval failures are equal. Categorize findings by severity to guide response priority.

#### P0: Critical — Missing Coverage for Must-Have Features

Nothing tests a critical path. A Must-have feature from `docs/plan.md` has zero matching test files. An API endpoint has no integration test.

**Response**: Create a task immediately. This is a gap that can reach production.

**Examples**:
- "Feature 'user authentication' has no test files matching any auth-related keywords"
- "POST /api/v1/payments endpoint has no test file"
- "No tests reference any acceptance criteria from US-001 (core user flow)"

#### P1: High — Structure Violations, Consistency Gaps, Untested ACs

The project is out of sync or structurally incorrect. Not an immediate risk, but will compound.

**Response**: Fix in the current iteration. These indicate drift between documentation and implementation.

**Examples**:
- "CLAUDE.md lists `make deploy` but no Makefile target exists"
- "3 files in `src/shared/` are only imported by one module"
- "AC-3 of US-005 (account lockout after 5 failures) has no matching test assertions"
- "Commits from the last 5 PRs don't follow the documented format"

#### P2: Medium — Adherence Pattern Violations

Code doesn't follow a documented convention. May have legitimate exclusions.

**Response**: Review and either fix or add an exclusion with justification. These are the noisiest findings — handle carefully.

**Examples**:
- "14 uses of `any` type found across 8 files"
- "TODO without task ID in `src/features/billing/invoice.ts:42`"
- "Test file `src/features/auth/login.test.ts` mocks the database (docs say don't mock DB in integration tests)"

#### P3: Low — Informational Findings

Style observations, minor inconsistencies, documentation improvements. Not actionable as tasks.

**Response**: Note in the eval report. Fix opportunistically during related work. Don't create tasks for these.

**Examples**:
- "3 documentation files have no cross-references from other docs (possibly orphaned)"
- "Coverage eval matched 'user profile' by file name only, not by test content — confidence is low"
- "Makefile has 2 targets not listed in CLAUDE.md Key Commands, but they start with `_` (internal targets)"
