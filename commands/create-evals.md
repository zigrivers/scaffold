---
description: "Generate project-specific eval checks"
long-description: "Reads project documentation and generates automated eval checks in the project's own test framework, verifying AI-generated code meets documented standards."
---

Read the project's documentation and generate automated eval checks that verify AI-generated code meets the project's own documented standards. Evals are test files in the project's own test framework — not a separate tool.

> **Note:** This command produces full-depth output. For lighter execution at a specific methodology depth, use the pipeline engine with presets.

## Mode Detection

Before starting, check if `tests/evals/` directory already exists:

**If the directory does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the directory exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing eval files and `docs/eval-standards.md`. Check for a tracking comment on line 1 of `docs/eval-standards.md`: `<!-- scaffold:create-evals v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing eval files against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing evals
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific customizations (exclusion patterns, custom adherence rules)
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/project-structure.md`, `docs/user-stories.md`, `docs/plan.md`) and verify evals align with current project state. Skip any that don't exist yet.
4. **Run existing evals**: Execute `make eval` (or equivalent) and capture the current baseline results.
5. **Preview changes**: Present the user a summary:
   | Action | File | Detail |
   |--------|------|--------|
   | ADD | ... | ... |
   | REGENERATE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Evals have been significantly customized. Update will add missing checks but won't force restructuring."
   Wait for user approval before proceeding.
6. **Execute update**: Regenerate evals from current docs (respecting preserve rules below). Run `make eval` and produce a coverage/adherence summary report. Create Beads tasks for P0 findings. Log recurring adherence patterns to `tasks/lessons.md`.
7. **Update tracking comment**: Add/update on line 1 of `docs/eval-standards.md`: `<!-- scaffold:create-evals v<ver> <date> -->`
8. **Post-update summary**: Report evals added, evals regenerated, evals preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing evals rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `tests/evals/` directory
- **Secondary output**: `docs/eval-standards.md`, `make eval` target
- **Preserve**: Custom exclusion patterns in adherence evals, user-added eval files, `docs/eval-standards.md` customizations (exclusion lists, "What Evals Don't Check" additions)
- **Related docs**: `docs/tech-stack.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/project-structure.md`, `docs/user-stories.md`, `docs/plan.md`, `docs/system-architecture.md`, `docs/api-contracts.md`, `docs/security-review.md`, `docs/database-schema.md`, `docs/ux-spec.md`, `docs/dev-setup.md`
- **Special rules**: Never delete user-added eval files. Adherence, security, and error-handling evals are generated once then preserved on re-run — users customize exclusion patterns. Consistency, structure, cross-doc, and all other conditional categories are fully regenerated. Coverage evals are regenerated when `docs/plan.md` or `docs/user-stories.md` change. Conditional categories are added/removed based on whether their source doc exists.

---

## What Evals Check

Evals verify that AI-generated code adheres to the project's documented standards. They check up to 13 categories — 5 core (always generated) and 8 conditional (generated when their source document exists):

### 1. Consistency Checks

Verify that documentation and tooling stay in sync:

- **Command matching**: Every command in CLAUDE.md's Key Commands table has a corresponding target in Makefile/package.json/pyproject.toml (and vice versa)
- **Commit format**: Recent commits in `git log` follow the documented format in `docs/coding-standards.md`
- **Cross-doc references**: File paths referenced in documentation actually exist; doc cross-references resolve

**Example** (vitest):
```typescript
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

describe('Consistency: CLAUDE.md Key Commands', () => {
  const claudeMd = readFileSync('CLAUDE.md', 'utf-8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));

  it('every Key Commands entry has a matching script', () => {
    const commandTable = claudeMd.match(/\|[^|]+\|[^|]+\|/g) || [];
    const scriptEntries = commandTable
      .map(row => row.match(/`([^`]+)`/)?.[1])
      .filter(Boolean);

    for (const cmd of scriptEntries) {
      const scriptName = cmd.replace(/^npm run /, '');
      expect(
        packageJson.scripts[scriptName],
        `Key Command "${cmd}" has no matching script in package.json`
      ).toBeDefined();
    }
  });

  it('recent commits follow documented format', () => {
    const log = execSync('git log --oneline -20').toString();
    const lines = log.trim().split('\n');
    // Beads format: [BD-<id>] type(scope): description
    // Conventional format: type(scope): description
    const beadsRegex = /^\w+ \[BD-\w+\] \w+(\(\w+\))?:/;
    const conventionalRegex = /^\w+ \w+(\(\w+\))?:/;
    const formatRegex = fs.existsSync('.beads') ? beadsRegex : conventionalRegex;
    const violations = lines.filter(l => !formatRegex.test(l) && !l.includes('Merge'));
    expect(violations).toEqual([]);
  });
});
```

### 2. Structure Checks

Verify file placement follows `docs/project-structure.md` rules:

- **File placement**: Source files are in the correct directories per the documented module organization
- **Shared code rules**: Files in shared/common directories have 2+ consumers (grep for imports)
- **Test co-location**: Test files follow the test location convention from `docs/tdd-standards.md`

**Example** (vitest):
```typescript
import { globSync } from 'glob';
import { readFileSync } from 'fs';

describe('Structure: shared code has multiple consumers', () => {
  const sharedFiles = globSync('src/shared/**/*.{ts,tsx}')
    .filter(f => !f.includes('.test.'));

  for (const sharedFile of sharedFiles) {
    it(`${sharedFile} is imported by 2+ modules`, () => {
      const importName = sharedFile.replace(/^src\//, '@/').replace(/\.\w+$/, '');
      const allSource = globSync('src/**/*.{ts,tsx}')
        .filter(f => f !== sharedFile && !f.includes('.test.'));
      const consumers = allSource.filter(f =>
        readFileSync(f, 'utf-8').includes(importName)
      );
      expect(
        consumers.length,
        `${sharedFile} has ${consumers.length} consumer(s) — shared code needs 2+`
      ).toBeGreaterThanOrEqual(2);
    });
  }
});
```

### 3. Adherence Checks

Verify code follows patterns from `docs/coding-standards.md` and `docs/tdd-standards.md`:

- **TODO format**: If Beads: no TODO/FIXME/HACK comments without a `[BD-` task ID. Without Beads: no TODO/FIXME/HACK comments without a linked issue or explanation
- **Mock patterns**: Test files follow the mocking strategy from `docs/tdd-standards.md` (e.g., no mocking what shouldn't be mocked)
- **Error handling**: Code follows the error handling patterns from `docs/coding-standards.md`
- **Stack-specific patterns**: Generated from `docs/tech-stack.md` (e.g., no `any` type in TypeScript projects, no raw SQL without parameterized queries)

### 4. Coverage Checks

Verify documented requirements have corresponding implementation and tests:

- **Feature coverage**: Every Must-have feature in `docs/plan.md` has implementation files (keyword/path matching)
- **AC coverage**: Every acceptance criterion in `docs/user-stories.md` has test assertions (keyword/regex matching against test file content — e.g., does any test mention "lockout" or "5 failed attempts" for a lockout AC?)
- **API coverage**: Every API endpoint described in `docs/plan.md` has a route and test

**Important**: Coverage checks use approximate keyword/regex matching. They catch the most common gap — entirely missing test coverage for a documented requirement. They do NOT verify correctness or completeness of tests.

### 5. Cross-Document Consistency Checks

Verify that scaffold-produced documentation is internally consistent across documents:

- **Technology consistency**: Stack choices declared in `docs/tech-stack.md` match technology references in `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/system-architecture.md`, and `CLAUDE.md`
- **Path consistency**: File paths declared in `docs/project-structure.md` match paths referenced in `docs/implementation-plan.md` task descriptions (if both exist)
- **Terminology consistency**: Entity names used in `docs/plan.md` appear consistently in `docs/user-stories.md` and `docs/domain-models/` (if all exist)
- **Cross-reference integrity**: Internal doc references (`docs/X.md` mentioned in another doc) resolve to existing files

**Example** (vitest):
```typescript
import { readFileSync, existsSync } from 'fs';
import { globSync } from 'glob';

describe('Cross-Document Consistency: tech stack references', () => {
  const techStack = existsSync('docs/tech-stack.md')
    ? readFileSync('docs/tech-stack.md', 'utf-8') : '';

  it('coding-standards references match tech-stack choices', () => {
    if (!techStack || !existsSync('docs/coding-standards.md')) return;
    const standards = readFileSync('docs/coding-standards.md', 'utf-8');
    // Extract framework names from tech-stack
    const frameworks = techStack.match(/(?:React|Vue|Angular|Next|Express|FastAPI|Django|Flask)/gi) || [];
    for (const fw of frameworks) {
      expect(standards.toLowerCase()).toContain(fw.toLowerCase());
    }
  });

  it('internal doc references resolve to existing files', () => {
    const docs = globSync('docs/**/*.md');
    const failures: string[] = [];
    for (const doc of docs) {
      const content = readFileSync(doc, 'utf-8');
      const refs = content.match(/`docs\/[^`]+\.md`/g) || [];
      for (const ref of refs) {
        const path = ref.replace(/`/g, '');
        if (!existsSync(path)) {
          failures.push(`${doc}: references ${path} but it doesn't exist`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
```

**Note**: Cross-document consistency evals are only generated when the project has scaffold-produced docs. If `docs/tech-stack.md` doesn't exist, this category is skipped entirely.

---

## Conditional Eval Categories (Document-Driven)

The following categories are **only generated when their source document exists**. Each closes a specific gap between "document says X" and "code actually does X."

### 6. Architecture Conformance *(requires `docs/system-architecture.md` + `docs/project-structure.md`)*

Verify code follows documented architecture:

- **Layer/dependency direction**: Imports only flow in documented directions (e.g., controllers → services → repositories, never reverse). Checks import/require statements with grep/regex.
- **Module boundary enforcement**: Feature directories don't import directly from another feature's internal modules. Cross-feature dependencies must go through shared/public interfaces.
- **No circular dependencies**: Import chains between documented modules don't form cycles.

For complex projects, recommend installing `dependency-cruiser` (JS/TS) or equivalent. For simpler projects, grep-based import direction checks are sufficient.

### 7. API Contract Validation *(requires `docs/api-contracts.md`)*

Verify API implementations match documented contracts:

- **Endpoint existence**: Every documented endpoint has a corresponding route definition in code.
- **HTTP method match**: Documented GET/POST/PUT/DELETE matches the route's method.
- **Response shape coverage**: For each documented endpoint, a test file validates the response structure.
- **Error response coverage**: Documented error codes (400, 401, 403, 404, 422) have corresponding test cases.

### 8. Security Pattern Verification *(requires `docs/security-review.md`)*

Verify documented security controls are implemented:

- **Auth middleware presence**: Protected routes (documented in security review or API contracts) have authentication middleware applied.
- **No hardcoded secrets**: No API keys, passwords, or tokens in source code (regex for common secret formats: `(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]+['"]`).
- **Input validation**: User-facing endpoints have validation (check for validation library imports or manual validation).
- **SQL injection prevention**: Database queries use parameterized statements (no string concatenation in query construction).
- **CORS configuration**: If documented, verify CORS settings match the security review's allowed origins.

### 9. Database Schema Conformance *(requires `docs/database-schema.md`)*

Verify database implementation matches documented schema:

- **Migration existence**: Every documented table has a corresponding migration file.
- **Column coverage**: Documented columns appear in the migration or model definition.
- **Index presence**: Documented indexes are defined in migrations.
- **Relationship integrity**: Documented foreign keys exist in migration files.

### 10. Accessibility Compliance *(requires `docs/ux-spec.md` with accessibility section)*

Verify documented accessibility requirements are met:

- **ARIA attributes**: Interactive components have required ARIA attributes.
- **Alt text coverage**: Image elements have alt text (grep for `<img` without `alt=`).
- **Keyboard navigation**: Focusable elements have visible focus styles (check CSS for `:focus` or `:focus-visible`).
- **Color contrast**: If design tokens are documented, verify contrast ratios meet WCAG AA (4.5:1 for normal text).

For frontend projects, recommend installing `axe-core` for runtime accessibility checking.

### 11. Performance Budget *(requires performance requirements in `docs/plan.md`)*

Verify documented performance targets are tracked:

- **Budget file exists**: A `budget.json`, `size-limit` config, or equivalent performance budget definition exists.
- **Bundle size tracking**: If documented, verify JS/CSS bundle sizes are tracked in CI config.
- **Performance test existence**: Critical user flows have corresponding performance tests or Lighthouse CI config.

Only generated when `docs/plan.md` contains non-functional requirements mentioning performance, load time, or response time.

### 12. Configuration Validation *(requires `docs/dev-setup.md`)*

Verify documented environment configuration is correct:

- **Env var documentation**: Every env var referenced in code (`process.env.X`, `os.environ["X"]`, `os.Getenv("X")`) exists in `.env.example` or dev setup docs.
- **No undocumented env vars**: Env vars in `.env.example` are actually used in code (detect dead config).
- **Startup validation**: The app validates required config at startup (check for config schema validation with Zod, Pydantic, envconfig, etc.).

### 13. Error Handling Completeness *(requires error patterns in `docs/coding-standards.md`)*

Verify documented error handling patterns are followed:

- **No bare catch blocks**: Catch blocks don't swallow errors (no empty catch, no catch without logging/rethrowing).
- **Documented error responses tested**: For each error response in API contracts, a test triggers that error path.
- **Custom error classes used**: If coding standards define custom error classes, verify they're used instead of generic `Error`/`Exception`.

---

## What Evals Produce

### Core categories (always generated)

| File | Contents | Regeneration behavior |
|------|----------|-----------------------|
| `tests/evals/consistency.test.*` | Command matching, format checking, cross-doc refs | Fully regenerated on re-run |
| `tests/evals/structure.test.*` | File placement, shared code, test location | Fully regenerated on re-run |
| `tests/evals/adherence.test.*` | Coding convention patterns, mock rules, TODO format | Generated once, then PRESERVED on re-run (users customize exclusions) |
| `tests/evals/coverage.test.*` | Feature→code mapping, AC→test mapping | Regenerated when plan.md or user-stories.md change |
| `tests/evals/cross-doc.test.*` | Tech stack refs, path consistency, terminology, internal links | Fully regenerated on re-run |

### Conditional categories (generated when source doc exists)

| File | Source Doc | Contents | Regeneration behavior |
|------|-----------|----------|-----------------------|
| `tests/evals/architecture.test.*` | system-architecture.md | Layer direction, module boundaries, circular deps | Fully regenerated |
| `tests/evals/api-contract.test.*` | api-contracts.md | Endpoint existence, methods, error codes | Fully regenerated |
| `tests/evals/security.test.*` | security-review.md | Auth middleware, secrets, input validation, SQL injection | Generated once, then PRESERVED |
| `tests/evals/database.test.*` | database-schema.md | Migration coverage, columns, indexes, relationships | Fully regenerated |
| `tests/evals/accessibility.test.*` | ux-spec.md | ARIA, alt text, focus styles, contrast | Fully regenerated |
| `tests/evals/performance.test.*` | plan.md (NFRs) | Budget files, bundle tracking, perf test existence | Fully regenerated |
| `tests/evals/config.test.*` | dev-setup.md | Env var docs, dead config, startup validation | Fully regenerated |
| `tests/evals/error-handling.test.*` | coding-standards.md | Bare catches, error responses tested, custom error classes | Generated once, then PRESERVED |

### Supporting files (always generated)

| File | Contents | Regeneration behavior |
|------|----------|-----------------------|
| `tests/evals/helpers.*` | Shared utilities for reading files, globbing, parsing docs | Regenerated |
| `docs/eval-standards.md` | Documents what each eval checks, how to add exclusions, what is NOT checked | Generated once, updated in update mode |
| Makefile/package.json addition | `make eval` or `npm run eval` target that runs only `tests/evals/` | Added once |

The test file extension and framework match the project's stack from `docs/tech-stack.md` (vitest for TS/JS, pytest for Python, bats for shell, go test for Go).

---

## What Evals Do NOT Check

These must be documented in `docs/eval-standards.md`:

- **Code quality or elegance** — evals check patterns, not taste
- **Algorithmic correctness** — that's what unit/integration tests are for
- **UX quality** — visual and interaction quality requires human judgment (beyond automated a11y checks)
- **Deep security vulnerabilities** — evals check documented patterns; use dedicated SAST/DAST tools (Semgrep, OWASP ZAP) for deep scanning
- **Test quality** — evals verify tests exist for requirements, not that the tests are good
- **Runtime performance** — evals verify budgets and tracking config exist, not actual measured performance

These remain the domain of functional tests, security scanning tools, and human review.

---

## Design Decisions

1. **Evals are test files in the project's own test framework.** Not a separate eval tool. They run via `make eval` and integrate into CI. Separate tooling gets forgotten.

2. **`make eval` is separate from `make test`.** Evals check project-wide properties (coverage, structure). Unit/integration tests check correctness. They serve different purposes and run at different cadences. `make check` should NOT include `make eval` by default — it's opt-in for CI.

3. **Coverage evals use keyword/regex matching.** They check: does a test file reference the concept from the AC? This is approximate but catches the most common gap: entirely missing test coverage for a documented requirement.

4. **Update mode with existing code = review mode.** When re-run on a project with code, it: (a) regenerates evals from current docs, (b) runs `make eval`, (c) produces a coverage/adherence summary report, (d) creates Beads tasks for P0 findings, (e) logs recurring adherence patterns to `tasks/lessons.md`.

5. **Adapts to what docs exist.** The 8 conditional categories (architecture, API contract, security, database, accessibility, performance, config, error handling) are only generated when their source document exists. No `docs/api-contracts.md`? No API contract evals. No `docs/security-review.md`? No security evals. This keeps the eval suite lean and relevant.

6. **Goodhart's Law mitigation.** Evals check existence and pattern adherence, not quality. Binary PASS/FAIL, not scores. The "What Evals Don't Check" section is explicit about boundaries.

---

## Process

1. **Read all project docs** — Start by reading `docs/tech-stack.md` to determine the test framework, then read all standards docs to understand what patterns to check.
2. **Use AskUserQuestionTool** for these decisions:
   - **Eval strictness level**: Strict (all categories, no exceptions), moderate (all categories with reasonable exclusions), or lenient (consistency + structure only, skip adherence + coverage)
   - **Include coverage checks?** Coverage checks require `docs/user-stories.md` which is optional at this pipeline stage. If it doesn't exist, skip coverage evals and note they can be added by re-running this prompt later.
   - **Custom adherence patterns**: Any project-specific patterns the user wants enforced (beyond what's in coding-standards.md)
3. **Use subagents** to research eval patterns for the project's specific test framework in parallel
4. **Generate eval files** using the project's test framework conventions from `docs/tdd-standards.md`
5. **Run `make eval`** (or equivalent) to verify all generated evals pass on the current codebase. Fix any false positives before finishing.
6. **Create `docs/eval-standards.md`** documenting what each eval checks, how to add exclusions, and what is explicitly not checked
7. **Add `make eval` target** (or equivalent) to Makefile/package.json that runs only `tests/evals/`
8. If using Beads: create a task (`bd create "docs: create eval infrastructure" -p 0 && bd update <id> --claim`) and close when done (`bd close <id>`)
10. If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now

## What This Prompt Should NOT Do

- **Don't implement features** — evals verify existing code meets standards, they don't build features
- **Don't run the full test suite** — only run `make eval` to verify the generated eval checks
- **Don't modify existing tests** — eval files go in `tests/evals/`, separate from existing test files
- **Don't create overly specific evals** — evals should check patterns and existence, not exact implementations
- **Don't make `make eval` part of `make check`** — it's opt-in for CI, not a default gate

## After This Step

When this step is complete, tell the user:

---
**Phase 6 complete** — Eval infrastructure created in `tests/evals/`, `docs/eval-standards.md` documents what is and isn't checked.

**Next:** Run `/scaffold:implementation-plan` — Convert user stories and standards into a dependency-ordered task graph.

**Note:** `/scaffold:operations` and `/scaffold:security` are independent quality-phase steps that can run in parallel.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
