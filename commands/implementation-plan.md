---
description: "Create task graph from stories and standards"
long-description: "Converts user stories into a dependency-ordered implementation plan in docs/implementation-plan.md with prioritized tasks. If Beads is configured, also creates corresponding Beads tasks."
---

Review the PRD (`docs/plan.md`), user stories (`docs/user-stories.md`), and all project standards, then create an implementation plan and task graph for this project.

> **Prerequisites:** Run `tdd`, `operations`, `security`, `review-architecture`, and `create-evals` first.

**Beads Detection:** Check if `.beads/` directory exists. If yes, create tasks via `bd create` and manage dependencies via `bd dep add`. If no, document the task graph in `docs/implementation-plan.md` as a structured markdown task list with dependencies noted inline.

## Mode Detection

Before starting, check if `docs/implementation-plan.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:implementation-plan v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative. If Beads: also run `bd list` to see existing tasks.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/plan.md`, `docs/user-stories.md`, `docs/project-structure.md`, `docs/tdd-standards.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:implementation-plan v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/implementation-plan.md`
- **Secondary output**: Tasks (via `bd create` if Beads, or markdown task list if not)
- **Preserve**: Architecture decisions, component boundaries, existing task descriptions
- **Related docs**: `docs/plan.md`, `docs/user-stories.md`, `docs/project-structure.md`, `docs/tdd-standards.md`, `docs/coding-standards.md`
- **Special rules**: **Never duplicate tasks.** If Beads: run `bd list` first and cross-reference before creating any tasks. **Never re-create tasks that already exist** (even if their description differs from what this prompt would produce). Only create tasks for genuinely new work not covered by existing tasks.

## Required Reading Before Creating Tasks

Read ALL of these before creating any tasks or documentation:

| Document | What to Extract |
|----------|----------------|
| `docs/plan.md` | Features to build, technical requirements, constraints |
| `docs/user-stories.md` | Acceptance criteria, user flows, priority |
| `docs/system-architecture.md` | Component structure, data flows, module boundaries |
| `docs/domain-models/` | Entities, aggregates, domain events, bounded contexts |
| `docs/adrs/` | Technology choices, architectural patterns, constraints |
| `docs/project-structure.md` | File locations, module organization strategy, high-contention files, shared code rules |
| `docs/tdd-standards.md` | Test categories (unit/integration/e2e), which code gets which test type, mocking strategy, test file locations, reference patterns |
| `docs/coding-standards.md` | Naming conventions, code style, patterns to follow |
| `docs/tech-stack.md` | Libraries, frameworks, tooling |
| `docs/dev-setup.md` | Available dev commands, environment setup, Key Commands |
| `docs/git-workflow.md` | CI configuration, branch protection, worktree setup |
| `docs/operations-runbook.md` | *(if exists)* Deployment requirements, monitoring hooks, CI extensions |
| `docs/security-review.md` | *(if exists)* Security controls, auth patterns, data protection requirements |
| `docs/database-schema.md` | *(if exists)* Schema, migrations, indexes to implement |
| `docs/api-contracts.md` | *(if exists)* Endpoints, error contracts, auth per endpoint |
| `docs/ux-spec.md` | *(if exists)* User flows, component hierarchy, accessibility requirements |
| `tests/acceptance/` | *(if exists)* Test skeleton files — reference in task descriptions so agents know which tests to implement |
| `docs/story-tests-map.md` | *(if exists)* AC-to-test mapping — verify task coverage against test coverage |
| `CLAUDE.md` | Workflow, priority definitions, commit format |

## What to Produce

### 1. Architecture Overview (`docs/implementation-plan.md`)

Create a concise document covering ONLY decisions specific to this implementation that aren't already in the standards docs:

- Technical architecture decisions and rationale
- Component/service boundaries and how they map to the module organization in project-structure.md
- Shared infrastructure that must exist before feature work begins (respect the shared code rules from project-structure.md — don't pre-build shared utils; only create shared infrastructure that is genuinely foundational like DB setup, auth middleware, etc.)
- Data flow between components
- Any open questions or risks

**Do NOT restate** testing strategy, coding conventions, or project structure — reference the existing docs instead:
```markdown
## References
- Testing approach: docs/tdd-standards.md
- Code conventions: docs/coding-standards.md
- File locations: docs/project-structure.md
```

### 2. Task Graph (the actual plan)

**If Beads:** Create every implementation task using `bd create "Title" -p <priority>`.
**Without Beads:** Document each task as a structured list item in `docs/implementation-plan.md` with title, priority (P0-P3), dependencies, and description.

#### Task Descriptions Must Include:

For each task, include everything an AI agent needs to complete it in isolation:

- **Acceptance criteria** tied to specific user stories
- **Files to create or modify** with correct paths per `docs/project-structure.md` (e.g., `src/features/auth/services/login.ts`, not just "auth service")
- **Test requirements** specifying:
  - Which test category per `docs/tdd-standards.md` (unit, integration, or e2e)
  - Test file location per the project's test file convention
  - Which reference pattern from tdd-standards.md to follow
  - What to mock and what NOT to mock per the project's mocking strategy
- **Key interfaces or contracts** to conform to
- **Any gotchas or decisions** already made

#### Task Titles

Titles should be imperative, specific, and map cleanly to commit messages:
- Good: `feat(auth): implement POST /api/sessions with validation`
- Good: `feat(dashboard): add session list component with pagination`
- Bad: `Set up auth` (too vague)
- Bad: `Models and routes for sessions` (horizontal, not vertical)

**If Beads:** These become the basis for commit messages in format `[BD-<id>] title`.

#### Task Sizing

- Each task should be completable in a single Claude Code session
- Prefer small, focused tasks over large ones — keeps context windows small
- Infrastructure/shared tasks come first as dependencies to unblock parallel work
- Follow the module organization strategy in `docs/project-structure.md` when grouping tasks (vertical slices if feature-based, etc.)

#### Dependency Graph — File Contention Awareness

When setting dependencies (**If Beads:** `bd dep add <child> <parent>`. **Without Beads:** note `depends on: <task>` in the task description), consider TWO types of dependencies:

1. **Logical dependencies** — Task B needs Task A's output (e.g., API endpoint needs DB schema)
2. **File contention dependencies** — Tasks that modify the same high-contention files must be sequenced

Review the high-contention files identified in `docs/project-structure.md` (route indexes, DB schemas, shared type definitions, app entry points, etc.). If two tasks both modify a high-contention file:
- Add a dependency between them so they don't run in parallel
- Note in the task description which shared file is being modified and why

Tasks that only touch files within their own feature directory can safely run in parallel with no dependency.

#### Shared Code Rules

Follow the shared code strategy from `docs/project-structure.md`:
- Don't create "build shared utilities" tasks upfront
- Only create shared infrastructure tasks for genuinely foundational work (DB setup, auth middleware, app configuration, CI pipeline)
- Feature-specific helpers stay in the feature folder until 2+ features need them
- If a task creates shared code, its description must include tests for that shared code

#### Risk Flags

For each task, assess and document risk where non-trivial:
- **Technology risk**: Uses a library/API the team hasn't used before — note in description
- **Integration risk**: Touches 3+ external systems — note mitigation (mocks, stubs)
- **Complexity risk**: Non-trivial algorithms, concurrency, or state management — consider splitting
- **Critical path risk**: Bottleneck task blocking many downstream tasks — consider splitting

Mark high-risk tasks with a `⚠️ HIGH RISK` annotation in the task description with the risk type and recommended mitigation.

### 3. Wave Plan & Parallelism

After the task graph is complete, produce a wave summary showing how tasks group for parallel execution:

```
Wave 1: N tasks (infrastructure) — N agents useful
Wave 2: N tasks (core features) — N agents useful
Wave 3: N tasks (dependent features) — N agents useful
...
Maximum useful agents: N (Wave X)
Critical path: Task A → Task B → ... → Task Z (N tasks)
```

This helps the user plan how many agents/worktrees to set up before execution begins.

## What NOT to Do

- Do NOT start implementing anything
- **If Beads:** Do NOT create a flat ordered list in markdown — that's what `bd ready` is for. The dependency graph handles sequencing.
- **Without Beads:** Document tasks with explicit dependency annotations so the execution order is clear.
- Do NOT restate testing strategy or coding conventions in implementation-plan.md — reference the existing docs
- Do NOT create tasks with vague file locations like "create the auth service" — use exact paths

## Process

- Use subagents to research implementation best practices for the project's specific tech stack in parallel
- Use AskUserQuestionTool for any questions or important decisions
- **If Beads:** After creating all tasks, run `bd dep tree` on root tasks so I can review the dependency graph. Run `bd ready` at the end to show the first wave of parallelizable work. Verify no two tasks in the first wave modify the same high-contention file.
- **Without Beads:** Present the task list grouped by wave (tasks with no unmet dependencies form wave 1, etc.). Verify no two tasks in wave 1 modify the same high-contention file.

## After This Step

When this step is complete, tell the user:

---
**Phase 7 in progress** — `docs/implementation-plan.md` created, task graph built.

**Next:** Run `/scaffold:implementation-plan-review` — Review task quality, coverage, and dependencies.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
