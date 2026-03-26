---
description: "Generate project-specific eval checks"
long-description: "Reads project documentation and generates automated eval checks in the project's own test framework, verifying AI-generated code meets documented standards."
---

Read the project's documentation and generate automated eval checks that verify AI-generated code meets the project's own documented standards. Evals are test files in the project's own test framework — not a separate tool.

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
- **Related docs**: `docs/tech-stack.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/project-structure.md`, `docs/user-stories.md`, `docs/plan.md`
- **Special rules**: Never delete user-added eval files. Adherence evals (`adherence.test.*`) are generated once then preserved on re-run — users customize exclusion patterns. Consistency and structure evals are fully regenerated. Coverage evals are regenerated when `docs/plan.md` or `docs/user-stories.md` change.

---

## What Evals Check

Evals verify that AI-generated code adheres to the project's documented standards. They check four categories:

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
    const formatRegex = /^\w+ \[BD-\w+\] \w+(\(\w+\))?:/;
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

- **TODO format**: No TODO/FIXME/HACK comments without a `[BD-` task ID
- **Mock patterns**: Test files follow the mocking strategy from `docs/tdd-standards.md` (e.g., no mocking what shouldn't be mocked)
- **Error handling**: Code follows the error handling patterns from `docs/coding-standards.md`
- **Stack-specific patterns**: Generated from `docs/tech-stack.md` (e.g., no `any` type in TypeScript projects, no raw SQL without parameterized queries)

### 4. Coverage Checks

Verify documented requirements have corresponding implementation and tests:

- **Feature coverage**: Every Must-have feature in `docs/plan.md` has implementation files (keyword/path matching)
- **AC coverage**: Every acceptance criterion in `docs/user-stories.md` has test assertions (keyword/regex matching against test file content — e.g., does any test mention "lockout" or "5 failed attempts" for a lockout AC?)
- **API coverage**: Every API endpoint described in `docs/plan.md` has a route and test

**Important**: Coverage checks use approximate keyword/regex matching. They catch the most common gap — entirely missing test coverage for a documented requirement. They do NOT verify correctness or completeness of tests.

---

## What Evals Produce

| File | Contents | Regeneration behavior |
|------|----------|-----------------------|
| `tests/evals/consistency.test.*` | Command matching, format checking, cross-doc refs | Fully regenerated on re-run |
| `tests/evals/structure.test.*` | File placement, shared code, test location | Fully regenerated on re-run |
| `tests/evals/adherence.test.*` | Coding convention patterns, mock rules, TODO format | Generated once, then PRESERVED on re-run (users customize exclusions) |
| `tests/evals/coverage.test.*` | Feature→code mapping, AC→test mapping | Regenerated when plan.md or user-stories.md change |
| `tests/evals/helpers.*` | Shared utilities for reading files, globbing, parsing docs | Regenerated |
| `docs/eval-standards.md` | Documents what each eval checks, how to add exclusions, what is NOT checked and why | Generated once, updated in update mode |
| Makefile/package.json addition | `make eval` or `npm run eval` target that runs only `tests/evals/` | Added once |

The test file extension and framework match the project's stack from `docs/tech-stack.md` (vitest for TS/JS, pytest for Python, bats for shell, go test for Go).

---

## What Evals Do NOT Check

These must be documented in `docs/eval-standards.md`:

- **Code quality or elegance** — evals check patterns, not taste
- **Algorithmic correctness** — that's what unit/integration tests are for
- **UX quality** — visual and interaction quality requires human judgment
- **Performance** — unless performance tests already exist in the project
- **Security vulnerabilities** — beyond documented patterns in coding-standards.md (use dedicated security tools)
- **Test quality** — evals verify tests exist for requirements, not that the tests are good

These remain the domain of Step 4.5 AI Review, functional tests, and human review.

---

## Design Decisions

1. **Evals are test files in the project's own test framework.** Not a separate eval tool. They run via `make eval` and integrate into CI. Separate tooling gets forgotten.

2. **`make eval` is separate from `make test`.** Evals check project-wide properties (coverage, structure). Unit/integration tests check correctness. They serve different purposes and run at different cadences. `make check` should NOT include `make eval` by default — it's opt-in for CI.

3. **Coverage evals use keyword/regex matching.** They check: does a test file reference the concept from the AC? This is approximate but catches the most common gap: entirely missing test coverage for a documented requirement.

4. **Update mode with existing code = review mode.** When re-run on a project with code, it: (a) regenerates evals from current docs, (b) runs `make eval`, (c) produces a coverage/adherence summary report, (d) creates Beads tasks for P0 findings, (e) logs recurring adherence patterns to `tasks/lessons.md`.

5. **Adapts to what docs exist.** No `docs/design-system.md`? Skip design token checks. No `docs/user-stories.md`? Skip AC-level coverage (only feature-level). No Playwright? Skip visual test checks. The prompt reads `docs/tech-stack.md` to determine stack-specific patterns.

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
8. Create a Beads task for this work before starting: `bd create "docs: create eval infrastructure" -p 0` and `bd update <id> --claim`
9. When the eval infrastructure is complete and committed, close it: `bd close <id>`
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

**Next:** Run `/scaffold:implementation-plan` — Create task graph from stories and standards (starts Phase 7).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
