---
description: "Generate project-specific eval checks from standards documentation"
long-description: "Generates automated checks that verify your code matches your documented standards — file placement, naming conventions, feature-to-test coverage, API contract alignment — using your project's own test framework."
---

## Purpose
Generate automated eval checks that verify AI-generated code meets the project's
own documented standards. Evals are test files in the project's own test framework
— not a separate tool. They check up to 13 categories: 5 core (always generated)
and 8 conditional (generated when their source document exists). Core: consistency,
structure, adherence, coverage, cross-doc. Conditional: architecture conformance,
API contract, security patterns, database schema, accessibility, performance budget,
configuration validation, error handling completeness.

## Inputs
- docs/tech-stack.md (required) — determines test framework and stack-specific patterns
- docs/coding-standards.md (required) — adherence and error handling patterns
- docs/tdd-standards.md (required) — test co-location rules, mocking strategy
- docs/project-structure.md (required) — file placement rules for structure evals
- CLAUDE.md (required) — Key Commands table for consistency evals
- Makefile or package.json (required) — build targets to match against
- tests/acceptance/ (optional) — story test skeletons for coverage validation
- docs/user-stories.md (optional) — acceptance criteria for coverage evals
- docs/plan.md (optional) — feature list for coverage evals, performance NFRs
- docs/system-architecture.md (optional) — architecture conformance evals
- docs/api-contracts.md (optional) — API contract validation evals
- docs/security-review.md (optional) — security pattern verification evals
- docs/database-schema.md (optional) — database schema conformance evals
- docs/ux-spec.md (optional) — accessibility compliance evals
- docs/dev-setup.md (optional) — configuration validation evals

## Expected Outputs

Core (always generated):
- tests/evals/consistency.test.* — command matching, format checking, cross-doc refs
- tests/evals/structure.test.* — file placement, shared code rules, test co-location
- tests/evals/adherence.test.* — coding convention patterns, mock rules, TODO format
- tests/evals/coverage.test.* — feature-to-code mapping, AC-to-test mapping
- tests/evals/cross-doc.test.* — tech stack consistency, path consistency, terminology

Conditional (generated when source doc exists):
- tests/evals/architecture.test.* — layer direction, module boundaries, circular deps
- tests/evals/api-contract.test.* — endpoint existence, methods, error codes
- tests/evals/security.test.* — auth middleware, secrets, input validation, SQL injection
- tests/evals/database.test.* — migration coverage, columns, indexes, relationships
- tests/evals/accessibility.test.* — ARIA, alt text, focus styles, contrast
- tests/evals/performance.test.* — budget files, bundle tracking, perf test existence
- tests/evals/config.test.* — env var docs, dead config, startup validation
- tests/evals/error-handling.test.* — bare catches, error responses tested, custom errors

Supporting:
- tests/evals/helpers.* — shared utilities
- docs/eval-standards.md — documents what is and isn't checked
- make eval target (or equivalent build command) added to project build configuration

## Quality Criteria
- (mvp) Consistency + Structure evals generated
- (mvp) Evals use the project's own test framework from docs/tech-stack.md
- (mvp) All generated evals pass on the current codebase when exclusion mechanisms are applied
- (mvp) Eval results are binary PASS/FAIL, not scores
- (mvp) make eval is separate from make test and make check (opt-in for CI)
- (deep) All applicable eval categories generated including security, API, DB, accessibility (conditional on source doc existence)
- (deep) Adherence, security, and error-handling evals include exclusion mechanisms
- (deep) docs/eval-standards.md explicitly documents what evals do NOT check
- (deep) Full eval suite runs in under 30 seconds
- (mvp) `make eval` (or equivalent) runs and all generated evals pass
- (mvp) All core eval categories (consistency, structure, adherence, coverage, cross-doc) are generated
- (deep) Eval false-positive assessment: each eval category documents at least one scenario where valid code might incorrectly fail, with exclusion mechanism
- (deep) Every conditional eval category with a source document is generated

## Methodology Scaling
- **deep**: All 13 eval categories (conditional on doc existence). Stack-specific
  patterns. Coverage with keyword extraction. Cross-doc consistency. Architecture
  conformance. API contract validation. Security patterns. Full suite.
- **mvp**: Consistency + Structure only. Skip everything else.
- **custom:depth(1-5)**:
  - Depth 1: Consistency + Structure only
  - Depth 2: Consistency + Structure with stack-specific patterns
  - Depth 3: Add Adherence + Cross-doc
  - Depth 4: Add Coverage + Architecture + Config + Error handling
  - Depth 5: All 13 categories (Security, API, Database, Accessibility, Performance)

## Mode Detection
Update mode if tests/evals/ directory or docs/eval-standards.md exists. In
update mode: regenerate consistency, structure, cross-doc, and conditional
category evals. Preserve adherence, security, and error-handling eval
exclusions. Regenerate coverage evals only if plan.md or user-stories.md
changed. Add/remove conditional categories based on whether their source doc
exists.

## Update Mode Specifics
- **Detect prior artifact**: tests/evals/ directory exists with eval test files
- **Preserve**: adherence eval exclusions, security eval exclusions,
  error-handling eval exclusions, custom helper utilities in tests/evals/helpers,
  make eval target configuration
- **Triggers for update**: source docs changed (coding-standards, project-structure,
  tech-stack), new conditional source docs appeared (e.g., security-review.md
  now exists), Makefile targets changed, user-stories.md changed
- **Conflict resolution**: if a source doc was removed, archive its conditional
  eval category rather than deleting; if exclusion patterns conflict with new
  standards, flag for user review

---

## Domain Knowledge

### eval-craft

*Writing effective project evals that verify AI-generated code meets documented standards*

# Eval Craft

Evals are project-wide property checks — automated tests that verify AI-generated code meets the project's own documented standards. They sit alongside unit tests and integration tests but serve a fundamentally different purpose.

## Summary

### What Evals Are

Evals verify that a project follows its own documented rules. They operate at the project level — reading documentation, scanning source trees, parsing configuration, and checking git history. They do not test whether code is correct (that is what functional tests do). They test whether the project is internally consistent and complete.

Unit tests answer: "Does this function return the right result?"
Integration tests answer: "Do these components work together?"
Evals answer: "Does this project follow its own documented rules?"

### Eval Categories (up to 13)

**5 Core categories** (always generated):
1. **Consistency** — Doc-tooling sync: command tables ↔ build targets, commit format, cross-doc refs
2. **Structure** — File placement per project-structure.md, shared code 2+ consumers, test co-location
3. **Adherence** — Coding patterns from coding-standards.md: TODO format, mock rules, error handling, stack-specific
4. **Coverage** — Requirement→code keyword matching, AC→test mapping, API endpoint coverage
5. **Cross-doc** — Technology, path, terminology consistency across scaffold-produced docs

**8 Conditional categories** (generated when source doc exists):
6. **Architecture conformance** ← system-architecture.md — Layer direction, module boundaries, circular deps
7. **API contract** ← api-contracts.md — Endpoint existence, HTTP methods, error response coverage
8. **Security patterns** ← security-review.md — Auth middleware, no secrets, input validation, SQL injection
9. **Database schema** ← database-schema.md — Migration coverage, columns, indexes, foreign keys
10. **Accessibility** ← ux-spec.md — ARIA, alt text, focus styles, color contrast
11. **Performance budget** ← plan.md NFRs — Budget files, bundle tracking, perf test existence
12. **Configuration** ← dev-setup.md — Env var docs, dead config, startup validation
13. **Error handling** ← coding-standards.md — No bare catches, error responses tested, custom error classes

### Design Principles

- **Binary PASS/FAIL, not scores** — prevents Goodhart's Law gaming
- **Every eval needs a false-positive mitigation strategy** — exclusion mechanism is mandatory
- **Conditional on source doc** — never generate evals for docs that don't exist
- **Prefer grep over AST** — faster to write, run, and maintain
- **Evals must be fast** — full suite under 30 seconds, individual file under 2 seconds
- **One category per eval file** — don't mix consistency and adherence in one file
- **Document what evals don't check** — prevent false confidence

### What Evals Do NOT Verify

- Whether code is correct (functional tests)
- Whether code is elegant or well-designed (code review)
- Whether tests are good quality (manual review)
- Whether the UI looks right (visual testing, beyond automated a11y)
- Deep security vulnerabilities (use dedicated SAST/DAST tools)
- Actual runtime performance (evals verify tracking config, not measurements)

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

- **Feature coverage**: Every Must-have feature in `docs/plan.md` or `docs/plan.md` maps to at least one implementation file. Match by keywords from the feature description against file names and file content.
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

### Architecture Conformance Evals — Deep Dive

**Source doc**: `docs/system-architecture.md` + `docs/project-structure.md`

Architecture conformance evals prevent code from silently diverging from documented architecture. They check three things: import direction, module boundaries, and circular dependencies.

**Import direction checking** (grep-based):
1. Parse the architecture doc for layer definitions (e.g., "controllers depend on services, services depend on repositories")
2. For each source file, determine its layer from its file path (e.g., `src/controllers/` → controller layer)
3. Scan its import statements and verify they only reference allowed layers
4. Report violations: "src/repositories/user.ts imports from src/controllers/auth.ts — repositories should not depend on controllers"

**Module boundary checking**:
1. Parse `docs/project-structure.md` for feature directories (e.g., `src/features/auth/`, `src/features/billing/`)
2. For each feature directory, scan imports
3. Flag imports that reach into another feature's internal modules (e.g., `src/features/auth/services/token.ts` importing `src/features/billing/internal/invoice-calc.ts`)
4. Cross-feature imports should go through shared/public interfaces only

**False positive mitigation**: Exclude shared/common directories, type-only imports, and test files. Allow an `// eval-exclude: cross-feature` inline comment to suppress.

**Tool recommendations**: For JS/TS projects with complex architecture, recommend `dependency-cruiser` or `eslint-plugin-boundaries` in `docs/eval-standards.md`. The eval checks for their config existence as a positive signal.

### API Contract Evals — Deep Dive

**Source doc**: `docs/api-contracts.md`

API contract evals verify that documented API specifications match actual code. They use grep/regex — not runtime testing (that's Dredd/Pact territory).

**Endpoint existence checking**:
1. Parse `docs/api-contracts.md` for endpoint definitions (look for patterns like `GET /api/v1/users`, `POST /api/auth/login`)
2. For each endpoint, search route definition files for the path pattern
3. Report missing routes: "POST /api/v1/orders documented but no route definition found"

**Error response coverage**:
1. For each endpoint, extract documented error codes (400, 401, 403, 404, 422)
2. Search test files for tests that verify these status codes for that endpoint
3. Report: "GET /api/v1/users/:id documents 404 response but no test triggers it"

**False positive mitigation**: Route frameworks vary widely — check for common patterns (`app.get`, `router.post`, `@Get()`, `@app.route`). Allow pattern overrides via a config section in `docs/eval-standards.md`.

### Security Pattern Evals — Deep Dive

**Source doc**: `docs/security-review.md`

Security evals verify documented security controls are implemented. They check patterns, not vulnerabilities — use SAST/DAST tools for deep scanning.

**No hardcoded secrets** (regex patterns):
```
# Common secret patterns to flag
(?:api[_-]?key|secret|password|token|credential)\s*[:=]\s*['"][^'"]{8,}['"]
(?:sk|pk)[-_][a-zA-Z0-9]{20,}    # Stripe-style keys
AKIA[0-9A-Z]{16}                  # AWS access key IDs
ghp_[a-zA-Z0-9]{36}              # GitHub personal tokens
```

**Auth middleware presence**:
1. Parse security review for protected routes/resources
2. Check route definitions for auth middleware application (e.g., `requireAuth`, `@authenticated`, `authMiddleware`)
3. Flag unprotected routes that should be protected

**SQL injection prevention**:
1. Search for database query patterns (e.g., string concatenation in SQL: `` `SELECT * FROM ${table}` ``)
2. Flag string interpolation in query strings
3. Allow parameterized queries and ORM usage

**False positive mitigation**: Security evals are PRESERVED on re-run because teams customize exclusion patterns extensively. Inline `// eval-exclude: secret-pattern` for test fixtures and config examples.

### Database Schema Evals — Deep Dive

**Source doc**: `docs/database-schema.md`

Database evals verify migration files produce the documented schema. Grep-based — no database connection needed.

**Migration existence checking**:
1. Parse `docs/database-schema.md` for table names
2. Search migration files for `CREATE TABLE` or equivalent ORM statements
3. Report: "Table 'order_items' documented but no migration creates it"

**Column coverage**:
1. For each documented table, extract column names
2. Search the table's migration file for column definitions
3. Report missing columns

**False positive mitigation**: ORM-generated migrations use different syntax than raw SQL. Check for both patterns. Allow `docs/eval-standards.md` to specify the migration framework for accurate matching.

### Accessibility Evals — Deep Dive

**Source doc**: `docs/ux-spec.md` (accessibility section)

Only generated when the UX spec documents accessibility requirements (search for "WCAG", "accessibility", "a11y", "screen reader").

**Alt text checking**:
```
# Flag img elements without alt attribute
<img[^>]*(?!alt=)[^>]*>
# Also check framework-specific: Image, next/image without alt
```

**Focus style checking**: Search CSS/styled-components for `:focus` or `:focus-visible` rules. Flag interactive elements (button, a, input) without visible focus styles.

**Tool recommendation**: If the project has a frontend, recommend `@axe-core/cli` or Playwright's built-in accessibility assertions in `docs/eval-standards.md`. The eval checks for axe-core in dependencies as a positive signal.

### Performance Budget Evals — Deep Dive

**Source doc**: `docs/plan.md` (non-functional requirements section)

Only generated when the PRD contains performance targets. Search for patterns: "response time", "load time", "within X seconds", "under X ms", "bundle size".

**What to check**:
1. A performance budget file exists (`budget.json`, `.size-limit.json`, or equivalent)
2. CI config references performance testing (Lighthouse CI, k6, Artillery)
3. Critical user flows (from user stories) have corresponding performance test config

**False positive mitigation**: Skip if no performance-related NFRs are found in plan.md. Don't enforce specific tools — just verify that *some* performance tracking exists.

### Configuration Validation Evals — Deep Dive

**Source doc**: `docs/dev-setup.md`

Config evals prevent the "works on my machine" problem by verifying env vars are documented and validated.

**Env var scanning** (per-stack patterns):
- TypeScript/JS: `process.env.X` or `process.env['X']`
- Python: `os.environ["X"]` or `os.getenv("X")`
- Go: `os.Getenv("X")`
- Shell: `$X` or `${X}`

For each env var found in code, verify it appears in `.env.example` or `docs/dev-setup.md`. For each var in `.env.example`, verify it's actually referenced in code (detect dead config).

**Startup validation check**: Search for config schema validation at app startup — Zod parse of process.env, Pydantic BaseSettings, Go envconfig struct tags. The existence of startup validation is a positive signal.

### Error Handling Completeness Evals — Deep Dive

**Source doc**: `docs/coding-standards.md` + `docs/api-contracts.md`

Error handling evals verify that documented error patterns are followed and documented error responses are tested.

**Bare catch detection** (per-stack):
- TypeScript/JS: `catch\s*\(\s*\w*\s*\)\s*\{\s*\}` (empty catch block)
- Python: `except:\s*$` or `except Exception:\s*pass`
- Go: `if err != nil \{\s*\}` (swallowed errors)

**Error response test coverage**: For each error code documented in API contracts, search test files for assertions on that status code + endpoint combination. Report: "PUT /api/users/:id documents 422 but no test verifies it."

**False positive mitigation**: Error handling evals are PRESERVED on re-run. Intentionally empty catches (e.g., cleanup code) can use `// eval-exclude: bare-catch` inline comments.

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
- Full eval suite (`make eval`): < 30 seconds
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

### Per-Category Implementation Guidance

Concrete checks to implement for each eval category. For each category, these are the highest-value grep/scan targets.

#### Adherence

- **Naming conventions**: Grep source files for patterns that violate documented naming (e.g., `camelCase` in a `snake_case` project, uppercase constants that should be enums)
- **Error handling patterns**: Scan for bare `catch {}`, swallowed errors (`catch (e) { /* ignore */ }`), and missing error propagation per `docs/coding-standards.md`
- **Import rules**: Check for barrel import violations, circular imports, and forbidden cross-layer imports (e.g., UI importing directly from DB layer)
- **TODO hygiene**: Grep for `TODO|FIXME|HACK` without a task ID tag like `[BD-xxx]` — untagged TODOs are tracking gaps

#### Consistency

- **Cross-doc refs match**: Extract all file path references from markdown docs (`docs/*.md`) and verify each referenced path exists on disk
- **Format standardization**: Verify commit messages follow the documented pattern in `docs/coding-standards.md` by regex-matching `git log --oneline`
- **Command table sync**: Parse the Key Commands table in `CLAUDE.md`, extract each backtick-quoted command, and verify a matching Makefile target or package.json script exists
- **Config value consistency**: Check that port numbers, env var names, and feature flags in config files match what documentation describes

#### Structure

- **File placement rules**: For each source file, verify its directory matches the module placement rules in `docs/project-structure.md` (e.g., no feature code in `shared/`, no stray files in root)
- **Test co-location**: For each source file with logic, verify a corresponding `.test.*` file exists per the documented convention (co-located or mirror directory)
- **Shared code 2+ consumers**: Scan every file in `shared/`, `common/`, or `lib/` directories and count distinct importers — flag any with fewer than 2 consumers
- **No orphan files**: Verify every source file is either imported by another file or is a documented entry point (main, index, CLI handler)

#### Coverage

- **Feature-to-code mapping**: Extract Must-have features from `docs/plan.md`, derive domain keywords, and grep source tree for 2+ keyword matches per feature
- **AC-to-test mapping**: Extract acceptance criteria from `docs/user-stories.md`, extract keywords, and search test files for keyword co-occurrence (high confidence: exact AC ID reference; medium: 2+ domain keywords)
- **API endpoint coverage**: Parse documented endpoints from `docs/api-contracts.md`, verify each has a route definition in code and at least one test file asserting its status codes

#### Cross-doc

- **Terminology consistency**: Extract key domain terms from the PRD and verify the same terms (not synonyms) appear in architecture, user stories, and coding standards docs
- **Tech stack references**: Verify that technology names referenced across docs match the canonical list in `docs/tech-stack.md` (e.g., no doc says "Postgres" when the canonical name is "PostgreSQL")
- **Path consistency**: Collect all file path references across all docs and verify they use the same path format (no mix of `src/features/` and `features/src/`)

#### Security

- **Auth middleware usage**: Parse the security review for protected routes, then verify each route definition includes auth middleware (`requireAuth`, `@authenticated`, or equivalent)
- **Secret patterns**: Grep for hardcoded API keys, tokens, and passwords using known patterns (`AKIA...`, `sk_live_...`, `ghp_...`, and generic `password\s*=\s*['"][^'"]+`)
- **Input validation**: For each API endpoint accepting user input, verify a validation step exists (Zod `.parse()`, Joi `.validate()`, express-validator chain, or equivalent)
- **No secrets in git**: Run `git log --diff-filter=A --name-only` and check that no `.env`, credentials, or key files were ever committed

---

### testing-strategy

*Test pyramid, testing patterns, coverage strategy, and quality gates*

# Testing Strategy

Expert knowledge for test pyramid design, testing patterns, coverage strategy, and quality gates across all test levels.

## Summary

### Test Pyramid

```
        /  E2E Tests  \         Few, slow, high confidence
       / Integration    \       Moderate, medium speed
      /   Unit Tests      \     Many, fast, focused
     ________________________
```

### Test Level Definitions

- **Unit Tests** — Single function/method/class in isolation. No I/O, deterministic, millisecond execution. Test pure business logic, state machines, edge cases, error handling.
- **Integration Tests** — Interaction between 2+ components with real infrastructure. Seconds to execute. Test API handlers, DB queries, auth middleware, external service integrations.
- **E2E Tests** — Complete user flows with real browser/device. Seconds to minutes. Test critical user journeys only (5-15 tests for most apps).

### Basic Patterns

- **Arrange/Act/Assert (AAA)** — Set up conditions, perform action, verify result.
- **Given/When/Then (BDD)** — Behavior-oriented variant for integration and E2E tests.
- **Test Doubles** — Stubs (return predetermined data), Mocks (verify interactions), Spies (wrap real implementations), Fakes (simplified working implementations).

### What NOT to Mock

- The thing you're testing
- Value objects and simple data transformations
- The database in integration tests
- Too many things (if 10 mocks needed, refactor the code)

## Deep Guidance

### Unit Tests — Extended

**What they test:** A single function, method, or class in isolation from all external dependencies (database, network, file system, other modules).

**Characteristics:**
- Execute in milliseconds
- No I/O (no database, no network, no file system)
- Deterministic (same input always produces same output)
- Can run in any order and in parallel
- External dependencies are replaced with test doubles

**What to unit test:**
- Pure business logic (calculations, transformations, validations)
- State machines and state transitions
- Edge cases and boundary conditions
- Error handling logic
- Data formatting and parsing

**What NOT to unit test:**
- Framework behavior (don't test that Express routes requests correctly)
- Configuration (don't test that environment variables are read)
- Trivial getters/setters with no logic
- Third-party library functions

**Example structure:**

```typescript
describe('calculateOrderTotal', () => {
  it('sums line item prices', () => {
    const lines = [
      { quantity: 2, unitPrice: 1000 },  // $10.00 each
      { quantity: 1, unitPrice: 2500 },  // $25.00
    ];
    expect(calculateOrderTotal(lines)).toBe(4500); // $45.00
  });

  it('returns zero for empty order', () => {
    expect(calculateOrderTotal([])).toBe(0);
  });

  it('rejects negative quantities', () => {
    const lines = [{ quantity: -1, unitPrice: 1000 }];
    expect(() => calculateOrderTotal(lines)).toThrow('Quantity must be positive');
  });
});
```

### Integration Tests — Extended

**What they test:** The interaction between two or more components, including real infrastructure (database, API calls between layers, message queues).

**Characteristics:**
- Execute in seconds
- Use real infrastructure (test database, local services)
- May require setup and teardown (database seeding, service startup)
- Test that components integrate correctly, not that each component works in isolation

**What to integration test:**
- API endpoint handlers (request -> business logic -> database -> response)
- Database query builders and repositories (do queries return correct data?)
- Authentication/authorization middleware (does the auth chain work end-to-end?)
- External service integrations (with a test/sandbox instance or contract tests)

**API endpoint integration test example:**

```typescript
describe('POST /api/v1/users', () => {
  beforeEach(async () => {
    await db.users.deleteAll();  // Clean slate
  });

  it('creates a user and returns 201', async () => {
    const response = await request(app)
      .post('/api/v1/users')
      .send({ email: 'test@example.com', password: 'SecurePass123!' })
      .expect(201);

    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user).not.toHaveProperty('password');  // Never return password

    // Verify the user actually exists in the database
    const dbUser = await db.users.findByEmail('test@example.com');
    expect(dbUser).not.toBeNull();
  });

  it('returns 409 when email already exists', async () => {
    await db.users.create({ email: 'taken@example.com', password: 'hash' });

    const response = await request(app)
      .post('/api/v1/users')
      .send({ email: 'taken@example.com', password: 'SecurePass123!' })
      .expect(409);

    expect(response.body.error.code).toBe('ALREADY_EXISTS');
  });
});
```

### End-to-End (E2E) Tests — Extended

**What they test:** Complete user flows from the user's perspective, using a real browser (for web apps) or real device/emulator (for mobile apps).

**Characteristics:**
- Execute in seconds to minutes
- Use a full running application stack
- Simulate real user behavior (clicks, typing, navigation)
- Most expensive to maintain and slowest to run
- Highest confidence that the system works as users expect

**What to E2E test:**
- Critical user journeys (registration, login, core business flow, payment)
- Flows that integrate multiple features (add to cart -> checkout -> payment -> confirmation)
- Accessibility checks on key pages

**What NOT to E2E test:**
- Every possible validation error (covered by unit/integration tests)
- Internal API behavior (covered by integration tests)
- Visual pixel-perfection (use visual regression testing tools separately)

**Keep E2E tests focused:**
- 5-15 E2E tests for most applications
- Each tests a complete user journey, not a single interaction
- If an E2E test breaks, it reveals a real user-facing problem

### Test Doubles — Detailed Patterns

#### Stubs

Return predetermined responses. Use when you need to control what a dependency returns.

```typescript
const userRepo = { findById: jest.fn().mockResolvedValue({ id: '1', name: 'Alice' }) };
```

#### Mocks

Record calls and verify interactions. Use when you need to verify that a dependency was called correctly.

```typescript
const emailService = { send: jest.fn() };
// ... execute code ...
expect(emailService.send).toHaveBeenCalledWith({
  to: 'alice@example.com',
  subject: 'Welcome!'
});
```

#### Spies

Wrap real implementations and record calls. Use when you want real behavior but also want to verify calls.

#### Fakes

Working implementations with simplified behavior. Use for expensive dependencies in tests (in-memory database instead of real database).

#### When to Use Which

- Stub external services (HTTP APIs, email, payment)
- Mock side-effect-producing dependencies (to verify they're called)
- Spy on internal functions (to verify call patterns without changing behavior)
- Fake databases in unit tests (in-memory implementations of repository interfaces)

### What NOT to Mock — Extended

- **The thing you're testing.** If you mock the function under test, you're testing the mock, not the code.
- **Value objects and simple data transformations.** Use real instances; they're fast and deterministic.
- **The database in integration tests.** The point of integration tests is to test real database interactions.
- **Too many things.** If a test requires 10 mocks, the code under test has too many dependencies. Refactor the code, not the test.

### Snapshot Testing

Captures the output of a component or function and compares it to a stored reference:

**When to use:** Catching unintended changes to serializable output (React component trees, API response shapes, configuration objects).

**When NOT to use:** For testing correctness (snapshots don't assert meaning, only shape). Don't use as a substitute for specific assertions.

**Rules:**
- Review snapshot changes carefully — don't just update blindly
- Keep snapshots small (snapshot a component, not an entire page)
- Use inline snapshots for small outputs

### Contract Testing

Verify that a service provider and its consumers agree on the API contract:

- The consumer defines a contract (expected request/response pairs)
- The provider runs the consumer's contracts as tests
- If the provider changes break a consumer contract, tests fail before deployment

Best for: microservices, separate frontend/backend teams, or any system where the API producer and consumer are developed independently.

### Coverage Strategy — In Depth

#### Coverage Targets by Layer

Coverage targets should vary by the criticality and testability of each layer:

| Layer | Coverage Target | Rationale |
|-------|----------------|-----------|
| Domain logic (pure business rules) | 90-100% branch | Business rules are the core value; they must be correct |
| API endpoints | 80-90% branch | Integration tests cover happy path and major error paths |
| UI components | 70-80% branch | Component tests cover rendering and interaction |
| Infrastructure (adapters, config) | 50-70% line | Low logic density; over-testing adds maintenance burden |
| Generated code | 0% | Don't test generated code; test the generator |

#### Meaningful vs. Vanity Coverage

**Meaningful coverage** tests behavior that could break:
- Branch coverage (both sides of every `if` statement)
- Boundary value testing (0, 1, N, max, max+1)
- Error path coverage (every `catch` block has a test that triggers it)

**Vanity coverage** inflates the number without adding value:
- Testing that a constructor sets properties (tests language features, not logic)
- Testing obvious delegation (service calls repository, returns result)
- Achieving 100% line coverage by testing every getter/setter

### Mutation Testing

Mutation testing introduces small changes (mutations) to production code and checks whether tests detect them. If a mutation survives (tests still pass), the tests are weak.

Common mutations:
- Flipping `>` to `>=`
- Changing `&&` to `||`
- Replacing a return value with `null`
- Removing a function call

Tools: Stryker (JavaScript/TypeScript), mutmut (Python), PITest (Java).

Use mutation testing periodically (not on every CI run — it's slow) to assess test suite quality.

### Quality Gates — Detailed

#### Pre-Commit Checks

Run on every commit (should complete in <10 seconds):

- **Linting:** Code style violations (ESLint, Ruff, ShellCheck)
- **Type checking:** Static type errors (TypeScript compiler, mypy)
- **Formatting:** Code formatting (Prettier, Black, gofmt)

These are fast, catch obvious mistakes, and prevent noisy diffs in PRs.

#### CI Pipeline Checks

Run on every push and PR (should complete in <5 minutes):

- **All pre-commit checks** (redundant but catches bypassed hooks)
- **Unit tests** with coverage report
- **Integration tests** with test database
- **Build verification** (the application compiles and builds successfully)
- **Security audit** (dependency vulnerability scan)

#### Pre-Merge Requirements

Before a PR can be merged:

- All CI checks pass
- Code review approved (by human or AI reviewer)
- No merge conflicts
- Branch is up-to-date with main (or rebased)

#### Performance Benchmarks (Optional)

For performance-critical applications:

- Benchmark tests run in CI
- Results compared against baseline
- Significant regressions (>10% degradation) block merge
- Baselines updated when intentional changes affect performance

### Test Data Management

#### Fixtures

Static test data stored in files or constants. Best for:
- Reference data (country lists, category hierarchies, status enums)
- Large datasets for performance tests
- Complex object graphs that are tedious to construct in code

```typescript
// fixtures/users.ts
export const validUser = {
  email: 'test@example.com',
  displayName: 'Test User',
  password: 'SecurePassword123!',
};

export const adminUser = {
  ...validUser,
  email: 'admin@example.com',
  role: 'admin',
};
```

#### Factories

Functions that generate test data with sensible defaults and selective overrides. Best for:
- Creating many variations of the same entity
- Ensuring test data is always valid
- Keeping tests focused on what varies (not boilerplate setup)

```typescript
function createUser(overrides: Partial<User> = {}): User {
  return {
    id: randomUUID(),
    email: `user-${randomId()}@example.com`,
    displayName: 'Test User',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

// Usage: only specify what matters for this test
const suspendedUser = createUser({ status: 'suspended' });
```

#### Seeds

Initial data loaded into the test database for integration tests. Rules:
- Seed data represents realistic scenarios (not just one record per table)
- Seed data is idempotent (safe to run twice)
- Seed data is minimal (only what tests need; don't replicate production)
- Seed data includes edge cases (user with no orders, order with many items)

#### Test Database Management

**Transaction rollback pattern:** Each test runs inside a database transaction that is rolled back after the test. Fast, clean, but doesn't test commit behavior.

**Truncate-and-seed pattern:** Before each test (or test suite), truncate all tables and re-seed. Slower but tests real commit behavior.

**Dedicated test database:** Each test run creates a fresh database. Slowest but most isolated.

**Recommendation:** Use transaction rollback for unit-level database tests. Use truncate-and-seed for integration test suites. Use dedicated databases for CI.

### Common Pitfalls

**Testing implementation details.** "Verify that `_processPayment` was called with exactly these parameters." This test breaks whenever the internal implementation changes, even if the observable behavior is unchanged. Fix: test the observable outcome, not the internal mechanism.

**Flaky tests.** Tests that pass sometimes and fail other times. Common causes: time-dependent logic, race conditions, shared mutable state, network dependencies, random ordering. Fix: each flaky test is a bug. Fix the root cause (mock time, eliminate shared state, isolate network calls) or delete the test. Never ignore flaky tests.

**Slow test suites.** A test suite that takes 20 minutes to run discourages running tests frequently. Common causes: E2E tests doing unit-level work, no test parallelization, unnecessary database setup per test, sleeping in tests. Fix: move fine-grained logic tests to unit level. Parallelize test execution. Use transaction rollback instead of database recreation.

**Testing through the UI for logic tests.** An E2E test that clicks through a form to verify that email validation works. This is a unit test masquerading as an E2E test — it's 100x slower and 10x more fragile. Fix: test validation logic with a unit test. Use E2E only for verifying the full user flow.

**No test data strategy.** Tests that create data inline with inconsistent formats, duplicate setup logic, and fragile assumptions. Fix: use factories for all test data. Define fixtures for static reference data. Establish seed data for integration tests.

**100% coverage as a goal.** Pursuing 100% line coverage leads to tests that test trivial code, tests that are coupled to implementation, and team resistance to writing more tests. Fix: set meaningful coverage targets per layer. Focus on branch coverage over line coverage. Use mutation testing to assess quality.

**Testing the framework.** "Test that the Express router returns 404 for an undefined route." This tests Express, not your code. Fix: test your handlers, your middleware, your business logic. Assume the framework works correctly.

**Skipped tests accumulate.** Tests marked as `skip` or `xit` that are never re-enabled. They represent either dead code or known bugs that nobody addresses. Fix: skipped tests are technical debt. Set a policy: fix or delete within one sprint.

**No test naming convention.** Test descriptions like "test 1," "works correctly," or "handles the thing." Uninformative when tests fail. Fix: test names should describe the scenario and expected outcome: "returns 404 when user does not exist," "applies 10% discount for premium members."

### From Acceptance Criteria to Test Cases

Acceptance criteria are the bridge between user stories and automated tests. Every AC should produce one or more test cases with clear traceability.

#### Given/When/Then to Arrange/Act/Assert

The mapping is direct:

- **Given** (precondition) becomes **Arrange** — set up test data, mock dependencies, configure state
- **When** (action) becomes **Act** — call the function, hit the endpoint, trigger the event
- **Then** (expected outcome) becomes **Assert** — verify return value, check database state, assert response body

```typescript
// AC: Given a user with 5 failed login attempts,
//     When they attempt a 6th login,
//     Then the account is locked and they see "Account locked"
it('locks account after 5 failed attempts', async () => {
  // Arrange: create user with 5 failed attempts
  const user = await createUser({ failedAttempts: 5 });
  // Act: attempt login
  const res = await request(app).post('/login').send({ email: user.email, password: 'wrong' });
  // Assert: locked
  expect(res.status).toBe(423);
  expect(res.body.error.message).toContain('Account locked');
});
```

#### One AC, Multiple Test Cases

Each AC produces at minimum one happy-path test. Then derive edge cases:

- **Boundary values**: If the AC says "max 50 characters," test 49, 50, and 51
- **Empty/null inputs**: If the AC assumes input exists, test what happens when it does not
- **Concurrency**: If the AC describes a state change, test what happens with simultaneous requests

#### Negative Case Derivation

For every "Given X" in an AC, systematically test "Given NOT X":

- AC says "Given user is authenticated" — test unauthenticated access (expect 401)
- AC says "Given the order exists" — test with nonexistent order ID (expect 404)
- AC says "Given valid payment details" — test with expired card, insufficient funds, invalid CVV

#### Parameterized Tests for Similar ACs

When multiple ACs follow the same pattern with different inputs, use data-driven tests:

```typescript
it.each([
  ['empty email', { email: '', password: 'valid' }, 'Email is required'],
  ['invalid email', { email: 'notanemail', password: 'valid' }, 'Invalid email format'],
  ['short password', { email: 'a@b.com', password: '123' }, 'Password too short'],
])('rejects registration with %s', async (_, input, expectedError) => {
  const res = await request(app).post('/register').send(input);
  expect(res.status).toBe(400);
  expect(res.body.error.message).toContain(expectedError);
});
```

#### Test Naming for Traceability

Test names should mirror the AC wording so that when a test fails, the team can trace it back to the requirement without reading the test body:

- AC: "User sees error when email is already taken" — Test: `'returns 409 when email is already taken'`
- AC: "Profile updates immediately after save" — Test: `'updates profile and reflects changes on next fetch'`
- Include the story or AC ID in the describe block when practical: `describe('US-002: Edit profile', () => { ... })`

### Pending Test Syntax and Skeleton-to-TDD Workflow

#### Pending Test Syntax

A pending test (also called a test skeleton or todo test) marks a test case that is known to be needed but not yet implemented. It fails intentionally, serving as a reminder and a contract — CI will report it, nobody can accidentally claim the work is done.

**TypeScript / Jest:**
```typescript
// it.todo() — built-in pending marker; no callback needed
it.todo('returns 404 when user does not exist');
it.todo('rejects payment with expired card');

// xit() / xdescribe() — skipped test with a body (useful to sketch logic first)
xit('locks account after 5 failed login attempts', async () => {
  // stub: arrange/act/assert goes here
});
```

**Python / pytest:**
```python
import pytest

@pytest.mark.skip(reason="not yet implemented — US-014 payment failure handling")
def test_rejects_expired_card():
    pass  # implementation stub

# Or with pytest-todo plugin:
@pytest.mark.todo
def test_sends_confirmation_email_on_order():
    pass
```

**Go / testing:**
```go
func TestRejectsExpiredCard(t *testing.T) {
    t.Skip("not yet implemented — US-014")
}
```

**Bats (shell):**
```bash
@test "rejects request without auth token" {
  skip "not yet implemented — US-007"
}
```

The key property of a pending test: it must be **visible in CI output** (not silently ignored) and **clearly labeled** with the story or AC it corresponds to.

#### Skeleton-to-TDD Workflow

The skeleton-to-TDD workflow takes user stories all the way to passing tests through four explicit stages:

1. **Story → Acceptance Criteria.** Extract the Given/When/Then conditions from the user story. Each condition becomes a candidate test.
2. **Acceptance Criteria → Pending Tests.** Write one `it.todo()` (or language equivalent) per AC. Name each test after the AC's expected outcome. Commit. CI now shows red for all pending tests — this is the intended state.
3. **Pending Test → Failing Test.** For one pending test at a time: fill in the Arrange/Act/Assert body. Remove `.todo`. Run tests — the test must fail (because the implementation doesn't exist yet). If it passes immediately, the test is not testing anything real.
4. **Failing Test → Passing Test.** Write the minimum implementation to make the failing test pass. No speculative code. Run tests — green. Commit.

Repeat steps 3-4 for each pending test. When all pending tests for a story are passing, the story is done.

**Example progression for US-014: "User sees error when paying with expired card":**

```
Stage 1: AC derived → "given expired card, POST /checkout returns 402 with error.code CARD_EXPIRED"
Stage 2: it.todo('returns 402 CARD_EXPIRED for expired card')    ← CI: pending
Stage 3: it('returns 402 CARD_EXPIRED for expired card', ...) { ... } ← CI: failing
Stage 4: PaymentService.charge() → check expiry → throw CardExpiredError   ← CI: passing
```

#### story-tests-map.md Format

The `story-tests-map.md` file provides a traceability matrix linking user stories to the test files and test names that verify them. It lives in the project root or `docs/` directory.

**Minimal format (Markdown table):**

```markdown
# Story-to-Tests Map

| Story ID | Story Title                | Test File                              | Test Name(s)                                              | Status   |
|----------|----------------------------|----------------------------------------|-----------------------------------------------------------|----------|
| US-001   | User registers account     | tests/auth/register.test.ts            | creates user and returns 201                              | passing  |
| US-001   | User registers account     | tests/auth/register.test.ts            | returns 409 when email already exists                     | passing  |
| US-002   | User logs in               | tests/auth/login.test.ts               | returns JWT on valid credentials                          | passing  |
| US-002   | User logs in               | tests/auth/login.test.ts               | returns 401 on invalid password                           | passing  |
| US-014   | Payment with expired card  | tests/checkout/payment.test.ts         | returns 402 CARD_EXPIRED for expired card                 | pending  |
| US-014   | Payment with expired card  | tests/checkout/payment.test.ts         | returns 402 INSUFFICIENT_FUNDS for declined card          | pending  |
```

**Rules for maintaining the map:**
- Every user story must have at least one row (even if all tests are pending)
- The `Status` column reflects the current CI state: `passing`, `failing`, or `pending`
- When a test is renamed or moved, update the map in the same commit
- The map is machine-readable — keep it parseable (consistent column counts, no merged cells)

## See Also

- [api-design](../core/api-design.md) — Contract testing patterns

---

## After This Step

Continue with: `/scaffold:implementation-plan`
