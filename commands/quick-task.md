---
description: "Create a focused Beads task for a bug fix, refactor, or small improvement"
long-description: "Creates a single well-defined Beads task with acceptance criteria, test plan, and implementation notes for a focused code change."
argument-hint: "<task description>"
---

Create a focused Beads task for a small, well-defined piece of work — a bug fix, refactor, performance improvement, or minor refinement. This prompt produces a single, implementation-ready task with clear acceptance criteria and a TDD test plan, without the full discovery process of the Enhancement prompt.

## The Request

$ARGUMENTS

---

## Phase 0: Complexity Gate

Before proceeding, evaluate whether this task is actually small enough for Quick Task. If **any** of these are true, **stop and redirect**:

1. The change requires updating `docs/plan.md` or `docs/user-stories.md`
2. The change introduces a new user-facing feature (not a fix or improvement to an existing one)
3. The change affects 3+ unrelated modules or features
4. The change requires new data model entities or schema migrations
5. The change requires competitive analysis or UX research
6. You estimate 4+ Beads tasks will be needed

**If any criteria match**, tell the user:

> This looks like an enhancement, not a quick task. Redirecting to the Enhancement prompt which handles PRD updates, user stories, and multi-task planning.
>
> Run: `/scaffold:new-enhancement <description>`

**Hard stop** — do not continue with the Quick Task flow.

---

## Phase 1: Understand & Contextualize

### Review Project Context
Before asking questions, review:
- `CLAUDE.md` — Project conventions, Key Commands, workflow
- `docs/coding-standards.md` — Code conventions, naming, patterns
- `docs/tdd-standards.md` — Test categories, mocking strategy, test file locations
- `docs/project-structure.md` — Where files live, module organization
- `tasks/lessons.md` — Previous lessons learned (extract any relevant to this task)
- Relevant source code — Read the files that will be modified

### Check for Duplicates
Run `bd list` and check for existing tasks that overlap with this request. If a matching or overlapping task exists:
- Tell the user which task(s) already cover this work
- Ask whether to proceed (create a new task) or use the existing one
- If proceeding, note the relationship in the new task's description

### Extract Relevant Lessons
Review `tasks/lessons.md` for anti-patterns, gotchas, or conventions related to:
- The area of code being modified
- The type of change (fix, refactor, perf, etc.)
- Similar past mistakes to avoid

### Clarify Ambiguities
If anything is unclear about the request, use AskUserQuestionTool to batch all questions in a single call. Common clarifications:
- What is the expected behavior vs. current behavior? (for bugs)
- What metric or outcome defines success? (for performance)
- What should NOT change? (for refactors)

---

## Phase 2: Define the Task

### Categorize
Determine the task type using conventional commit prefixes:
- `fix` — Bug fix (something is broken)
- `feat` — Small feature addition within an existing feature area
- `perf` — Performance improvement
- `a11y` — Accessibility fix
- `refactor` — Code restructuring with no behavior change
- `chore` — Tooling, dependencies, config
- `test` — Adding or fixing tests only
- `style` — Code style, formatting (no logic change)

### Priority
Assign priority using Beads conventions:
- **P0** — Blocking release or breaking production
- **P1** — Must-have for current milestone
- **P2** — Should-have (default for most quick tasks)
- **P3** — Nice-to-have, backlog

### Acceptance Criteria
Write 2–5 testable acceptance criteria in Given/When/Then format:

```
Given <precondition>
When <action>
Then <expected result>
```

Each criterion must be unambiguous — pass/fail should be obvious. Cover:
- The primary fix or change (happy path)
- At least one edge case or error state
- Any regression guard (behavior that must NOT change)

### Files to Modify
List exact file paths from `docs/project-structure.md`:
```
Files:
- src/features/auth/services/session.ts (modify)
- src/features/auth/services/__tests__/session.test.ts (modify)
```

### Test Plan
Reference `docs/tdd-standards.md` for the project's test conventions:
- **Test category**: unit / integration / e2e (per tdd-standards.md rules for this code area)
- **Test cases**: Map each acceptance criterion to at least one test case
- **Mocking**: What to mock and what NOT to mock (per the project's mocking strategy)
- **Test file location**: Per the project's test file convention

### Implementation Notes
- Patterns to follow (reference specific conventions from coding-standards.md)
- Known gotchas or pitfalls (from lessons.md or code review)
- What is explicitly out of scope

---

## Phase 3: Create the Beads Task

Create the task:

```bash
bd create "type(scope): description" -p <priority>
# Example: bd create "fix(auth): prevent duplicate session creation on rapid re-login" -p 2
```

Then set the task description with the full context from Phase 2. Include all of:

```
## Acceptance Criteria

- Given <precondition>, when <action>, then <expected result>
- ...

## Files to Modify

- path/to/file.ts (modify — reason)
- path/to/test.ts (modify — add test cases)

## Test Plan

**Category**: unit
**Cases**:
1. Test description → validates AC #1
2. Test description → validates AC #2
**Mocking**: Mock X, do not mock Y
**Location**: path/to/__tests__/file.test.ts

## Implementation Notes

- Follow pattern from [reference]
- Watch out for [gotcha from lessons.md]
- Out of scope: [what NOT to do]
```

---

## Phase 4: Output Summary

Present the task summary:

```
┌─────────────────────────────────────────────────┐
│ Quick Task Created                              │
├──────────┬──────────────────────────────────────┤
│ ID       │ <task-id>                            │
│ Title    │ type(scope): description             │
│ Priority │ P<n>                                 │
│ Status   │ open                                 │
├──────────┴──────────────────────────────────────┤
│ Acceptance Criteria                             │
│ • Given... When... Then...                      │
│ • Given... When... Then...                      │
├─────────────────────────────────────────────────┤
│ Files                                           │
│ • path/to/file.ts                               │
│ • path/to/test.ts                               │
├─────────────────────────────────────────────────┤
│ Test Plan                                       │
│ • Category: unit                                │
│ • Cases: N test cases                           │
├─────────────────────────────────────────────────┤
│ Implementation Notes                            │
│ • Key note 1                                    │
│ • Key note 2                                    │
└─────────────────────────────────────────────────┘
```

---

## Process Rules

1. **Respect the complexity gate** — If it's bigger than a quick task, redirect immediately. Don't try to squeeze a feature into the quick task format.
2. **One task only** — Quick Task creates exactly one Beads task. If you need multiple, use the Enhancement prompt.
3. **Check for duplicates first** — Run `bd list` before creating. Don't create tasks that already exist.
4. **Lessons.md is required reading** — Always check `tasks/lessons.md` for relevant anti-patterns before defining the task.
5. **Acceptance criteria drive tests** — Every criterion must map to at least one test case. If you can't test it, rewrite the criterion.
6. **Conventional commit titles** — Always use `type(scope): description` format. This feeds directly into commit messages.

---

## When to Use This Prompt

- Bug fixes — something is broken and needs fixing
- Refactoring — restructuring code without changing behavior
- Performance improvements — targeted optimizations
- Accessibility fixes — a11y improvements to existing features
- Test gaps — adding missing test coverage
- Chores — dependency updates, config changes, tooling fixes
- Small refinements — polish within an existing feature

## When NOT to Use This Prompt

- **New features**: Use `/scaffold:new-enhancement` — new features need PRD updates and user stories
- **Multi-task work**: Use `/scaffold:new-enhancement` — if you need 4+ tasks, it's an enhancement
- **Initial project setup**: Use the pipeline from `/scaffold:create-prd` forward
- **Major refactors**: If the refactor touches 3+ unrelated modules, use `/scaffold:new-enhancement` for proper impact analysis

---

## Quality Standards

### From `docs/tdd-standards.md`:
- Every acceptance criterion maps to at least one test case
- Test category (unit/integration/e2e) follows the project's rules for this code area
- Mocking strategy matches the project's conventions — don't over-mock or under-mock

### From `docs/coding-standards.md`:
- File paths match `docs/project-structure.md` conventions
- Naming follows project patterns
- Implementation notes reference specific standards, not generic advice

---

## Example

Here's what the output looks like for a typical quick task:

**Request**: "The save button shows a success toast even when the API returns a 409 conflict"

```
┌─────────────────────────────────────────────────┐
│ Quick Task Created                              │
├──────────┬──────────────────────────────────────┤
│ ID       │ abc-123                              │
│ Title    │ fix(editor): show error toast on     │
│          │ 409 conflict during save             │
│ Priority │ P1                                   │
│ Status   │ open                                 │
├──────────┴──────────────────────────────────────┤
│ Acceptance Criteria                             │
│ 1. Given the user saves a document,             │
│    when the API returns 409 Conflict,           │
│    then an error toast "Save conflict —         │
│    someone else edited this document"           │
│    is shown instead of the success toast        │
│ 2. Given the user saves a document,             │
│    when the API returns 200 OK,                 │
│    then the success toast still appears          │
│    (regression guard)                           │
│ 3. Given the user sees a 409 error toast,       │
│    when they click "Refresh",                   │
│    then the latest version is fetched           │
├─────────────────────────────────────────────────┤
│ Files                                           │
│ • src/features/editor/services/save.ts          │
│ • src/features/editor/services/__tests__/       │
│   save.test.ts                                  │
├─────────────────────────────────────────────────┤
│ Test Plan                                       │
│ • Category: unit                                │
│ • Cases: 3 (one per AC)                         │
│ • Mock: HTTP client. Don't mock toast service.  │
├─────────────────────────────────────────────────┤
│ Implementation Notes                            │
│ • save.ts catches errors but doesn't check      │
│   status codes — add 409 handling in catch      │
│ • Follow error handling pattern from            │
│   src/features/auth/services/login.ts           │
│ • Out of scope: auto-merge or diff view         │
└─────────────────────────────────────────────────┘
```

## After This Step

When this step is complete, tell the user:

---
**Quick task created** — Beads task ready with acceptance criteria, test plan, and implementation notes.

**Next:** Run `/scaffold:single-agent-start` or `/scaffold:single-agent-resume` to begin implementation (or `/scaffold:multi-agent-start <agent-name>` / `/scaffold:multi-agent-resume <agent-name>` for worktree agents).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
