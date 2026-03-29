# Agent Executability Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tighten task decomposition heuristics for AI agent reliability and add a dedicated Agent Executability review pass to the implementation plan review step.

**Architecture:** Enhance three existing files — the task-decomposition knowledge entry (new section with 5 formalized rules), the implementation-plan pipeline step (new Task Size Constraints section + tighter quality criteria), and the implementation-plan-review pipeline step (new Pass 8 + tighter quality criteria). Rebuild commands via `scaffold build`.

**Tech Stack:** Markdown (pipeline steps, knowledge), YAML frontmatter, bats-core (shell evals), vitest (TypeScript tests)

**Spec:** `docs/superpowers/specs/2026-03-29-agent-executability-design.md`

---

## File Map

### Files to Modify
| File | Change |
|------|--------|
| `knowledge/core/task-decomposition.md` | Tighten Summary sizing, add Agent Executability Heuristics section |
| `pipeline/planning/implementation-plan.md` | Add Task Size Constraints section, update quality criteria |
| `pipeline/planning/implementation-plan-review.md` | Add Pass 8: Agent Executability, update quality criteria |
| `knowledge/review/review-implementation-tasks.md` | Add Pass 8 summary entry |
| `CHANGELOG.md` | Add 2.36.0 entry |
| `package.json` | Bump version to 2.36.0 |

### Files Regenerated (via `scaffold build`)
| File | Regenerated From |
|------|-----------------|
| `commands/implementation-plan.md` | `pipeline/planning/implementation-plan.md` |
| `commands/implementation-plan-review.md` | `pipeline/planning/implementation-plan-review.md` |

---

## Task 1: Tighten Task Sizing in Knowledge Base Summary

**Files:**
- Modify: `knowledge/core/task-decomposition.md:17-21`

- [ ] **Step 1: Update the Task Sizing summary paragraph**

In `knowledge/core/task-decomposition.md`, replace the current Task Sizing summary (lines 17-21):

```markdown
### Task Sizing

Each task should be completable in a single AI agent session (30-90 minutes of agent time). A well-sized task has a clear title (usable as commit message), touches 1-5 files, produces a testable result, and has no ambiguity about "done."

Split large tasks by layer (API, UI, DB, tests), by feature slice (happy path, validation, edge cases), or by entity. Combine tiny tasks that touch the same file and have no independent value.
```

With:

```markdown
### Task Sizing

Each task should be completable in a single AI agent session (30-90 minutes of agent time). A well-sized task has a clear title (usable as commit message), touches 1-3 application files (hard limit; justify exceptions), produces ~150 lines of net-new application code (excluding tests and generated files), and has no ambiguity about "done."

Five rules govern agent-friendly task sizing:
1. **Three-File Rule** — Max 3 application files modified (test files excluded)
2. **150-Line Budget** — Max ~150 lines of net-new application code per task
3. **Single-Concern Rule** — One task does one thing (no "and" connecting unrelated work)
4. **Decision-Free Execution** — All design decisions resolved in the task description; agents implement, they don't architect
5. **Test Co-location** — Tests live in the same task as the code they test; no deferred testing

Split large tasks by layer (API, UI, DB, tests), by feature slice (happy path, validation, edge cases), or by entity. Combine tiny tasks that touch the same file and have no independent value.
```

- [ ] **Step 2: Verify file is valid markdown**

Run: `head -25 knowledge/core/task-decomposition.md`
Expected: Updated summary visible with the 5 rules listed.

- [ ] **Step 3: Commit**

```bash
git add knowledge/core/task-decomposition.md
git commit -m "feat: tighten task sizing summary with 5 agent executability rules"
```

---

## Task 2: Add Agent Executability Heuristics Deep Guidance Section

**Files:**
- Modify: `knowledge/core/task-decomposition.md` (add new section before "### Common Pitfalls")

- [ ] **Step 1: Update the "well-sized task" list in Task Sizing — Extended**

In `knowledge/core/task-decomposition.md`, find the "A well-sized task:" list (lines 158-163) and replace:

```markdown
**A well-sized task:**
- Has a clear, specific title that could be a commit message
- Touches 1-5 files (not counting test files)
- Produces a testable, verifiable result
- Has no ambiguity about what "done" means
- Can be code-reviewed independently
```

With:

```markdown
**A well-sized task:**
- Has a clear, specific title that could be a commit message
- Touches 1-3 application files (hard limit; test files excluded from count)
- Produces ~150 lines of net-new application code (excluding tests and generated files)
- Does exactly one thing (passes the single-concern test: describable without "and")
- Requires no design decisions from the agent (all choices resolved in the description)
- Includes co-located tests (the task isn't done until tests pass)
- Has no ambiguity about what "done" means
- Can be code-reviewed independently
```

- [ ] **Step 2: Add the Agent Executability Heuristics section**

In `knowledge/core/task-decomposition.md`, find the `### Common Pitfalls` heading (line 379) and insert the following NEW section BEFORE it:

```markdown
### Agent Executability Heuristics

Five formalized rules for ensuring tasks are the right size for AI agent execution. These are hard rules with an escape hatch — tasks exceeding limits must be split unless the author provides explicit justification via `<!-- agent-size-exception: reason -->`.

#### Rule 1: Three-File Rule

A task modifies at most 3 application files (test files don't count toward this limit). If it would touch more, split by layer or concern.

**Why 3:** Reading 3 files plus their context (imports, types, interfaces) consumes roughly 40-60% of a standard agent context window, leaving room for the task description, test code, and reasoning. At 5+ files, context pressure causes agents to lose track of cross-file consistency.

**Splitting when exceeded:**
- 4 files across 2 layers → split into one task per layer
- 5 files in the same layer → split by entity or concern within the layer
- Config files touched alongside application files → separate config task if non-trivial

#### Rule 2: 150-Line Budget

A task produces at most ~150 lines of net-new application code (excluding tests, generated files, and config). This keeps the entire change reviewable in one screen and within agent context budgets.

**Why 150:** Agent output quality degrades measurably after ~200 lines of new code in a single session. At 150 lines, the agent can hold the entire change in context while writing tests and verifying correctness.

**Estimating line count from task descriptions:**
- A CRUD endpoint with validation: ~80-120 lines
- A UI component with state management: ~100-150 lines
- A database migration with seed data: ~50-80 lines
- A full feature slice (API + UI + tests): ~300+ lines — MUST split

#### Rule 3: Single-Concern Rule

A task does exactly one thing. The test: can you describe what this task does in one sentence without "and"?

**Passes the test:**
- "Implement the user registration endpoint with input validation" (validation is part of the endpoint)
- "Create the order model with database migration" (migration is part of model creation)

**Fails the test:**
- "Add the API endpoint AND update the dashboard" — two tasks
- "Implement authentication AND set up the database" — two tasks
- "Build the payment form AND integrate with Stripe AND add webhook handling" — three tasks

**Splitting signals:**
- Task description contains "and" connecting unrelated work
- Task spans multiple architectural layers (API + frontend + database in one task)
- Task affects multiple bounded contexts or feature domains
- Task has acceptance criteria for two distinct user-facing behaviors

#### Rule 4: Decision-Free Execution

The task description must resolve all design decisions upfront. The agent implements, it doesn't architect. No task should require the agent to:

- Choose between patterns (repository vs active record, REST vs GraphQL)
- Select libraries or tools
- Decide module structure or file organization
- Determine API contract shapes (these come from upstream specs)

**Red flags in task descriptions:**
- "Choose the best approach for..."
- "Determine whether to use X or Y"
- "Decide how to structure..."
- "Evaluate options for..."
- "Select the most appropriate..."
- "Figure out the best way to..."

If a task contains any of these, the decision belongs in the task description — resolved by the plan author — not left to agent judgment. Local implementation choices (variable names, loop style, internal helper structure) are fine.

#### Rule 5: Test Co-location

Tests live in the same task as the code they test. The task follows TDD: write the failing test, then the implementation, then verify. The task isn't done until tests pass.

**Anti-pattern:** "Tasks 1-8: implement features. Task 9: write tests for everything." This produces untestable code, violates TDD, and creates a single massive testing task that exceeds all size limits.

**What co-location looks like:**
```
Task: Implement user registration endpoint
  1. Write failing integration test (POST /register with valid data → 201)
  2. Implement endpoint to make test pass
  3. Write failing validation test (invalid email → 400)
  4. Add validation to make test pass
  5. Commit
```

#### Escape Hatch

If a task genuinely can't be split further without creating tasks that have no independent value, add an explicit annotation in the task description: `<!-- agent-size-exception: [reason] -->`. The review pass flags unjustified exceptions but accepts reasoned ones.

**Valid exception reasons:**
- "Migration task touches 4 files but they're all trivial one-line renames"
- "Config file changes across 4 files are mechanical and identical in structure"
- "Test setup file is large but generated from a template"

**Invalid exception reasons:**
- "It's easier to do it all at once" (convenience is not a justification)
- "The files are related" (related files can still be separate tasks)
- "It would create too many tasks" (more small tasks > fewer large tasks)

#### Concrete "Too Big" Examples

| Task (Too Big) | Violations | Split Into |
|---------------|-----------|------------|
| "Implement user authentication" (8+ files, registration + login + reset + middleware) | Three-File, Single-Concern | 4 tasks: registration endpoint, login endpoint, password reset flow, auth middleware |
| "Build the settings page with all preferences" (6 files, multiple forms + APIs) | Three-File, 150-Line, Single-Concern | Per-group: profile settings, notification settings, security settings |
| "Set up database with all migrations and seed data" (10+ files, every entity) | Three-File, 150-Line | Per-entity: users table, orders table, products table, then seed data task |
| "Create API client with retry, caching, and auth" (4 concerns in one module) | Single-Concern, Decision-Free | 3 tasks: base client with auth, retry middleware, cache layer |
| "Implement the dashboard with charts, filters, and real-time updates" (5+ files, 300+ lines) | All five rules | 4 tasks: dashboard layout + routing, chart components, filter system, WebSocket integration |

```

- [ ] **Step 3: Verify the file structure**

Run: `grep "^### " knowledge/core/task-decomposition.md`
Expected: Sections in order: Story-to-Task Mapping, Task Sizing, Dependency Types, Definition of Done, From Stories to Tasks — Extended, Writing Acceptance Criteria, Story to Task Mapping, Maintaining Traceability, Task Sizing — Extended, Dependency Analysis — Extended, Parallelization and Wave Planning, Agent Context Requirements, **Agent Executability Heuristics**, Common Pitfalls

- [ ] **Step 4: Commit**

```bash
git add knowledge/core/task-decomposition.md
git commit -m "feat: add Agent Executability Heuristics section with 5 rules"
```

---

## Task 3: Add Task Size Constraints to Implementation Plan Step

**Files:**
- Modify: `pipeline/planning/implementation-plan.md:38-53` (quality criteria)
- Modify: `pipeline/planning/implementation-plan.md` (add section at end)

- [ ] **Step 1: Update quality criteria**

In `pipeline/planning/implementation-plan.md`, replace lines 41-42:

```markdown
- (mvp) Each task estimated at 1-4 hours of agent work (produces <= 500 lines of net-new application code, excluding tests and generated files)
```

With:

```markdown
- (mvp) Each task produces ~150 lines of net-new application code (excluding tests and generated files)
```

And replace line 52:

```markdown
- (mvp) No task modifies more than 5 files (flag for splitting if exceeded)
```

With:

```markdown
- (mvp) No task modifies more than 3 application files (test files excluded; exceptions require justification)
- (mvp) No task contains unresolved design decisions (agents implement, they don't architect)
- (mvp) Every code-producing task includes co-located test requirements
```

- [ ] **Step 2: Add Task Size Constraints section at the end of the file**

Append to `pipeline/planning/implementation-plan.md`:

```markdown

## Task Size Constraints

Before finalizing the implementation plan, scan every task against the five agent
executability rules from the task-decomposition knowledge base:

1. **Three-File Rule** — Count application files each task modifies (exclude test files).
   Any task touching 4+ files must be split by layer or concern.
2. **150-Line Budget** — Estimate net-new application code lines per task. Any task
   likely to produce 200+ lines must be split by feature slice or entity.
3. **Single-Concern Rule** — Check each task description for "and" connecting unrelated
   work. Split if the task spans multiple architectural layers or feature domains.
4. **Decision-Free Execution** — Verify all design decisions are resolved in the task
   description. No "choose", "determine", "decide", or "evaluate options" language.
   Resolve decisions inline before presenting the plan.
5. **Test Co-location** — Confirm every code-producing task includes its test
   requirements. No "write tests later" aggregation tasks.

Tasks that fail any rule should be split inline. If a task genuinely can't be split
further, annotate with `<!-- agent-size-exception: reason -->`. The implementation
plan review will flag unjustified exceptions.
```

- [ ] **Step 3: Run make validate**

Run: `make validate`
Expected: Frontmatter validation passes.

- [ ] **Step 4: Commit**

```bash
git add pipeline/planning/implementation-plan.md
git commit -m "feat: add task size constraints to implementation-plan step"
```

---

## Task 4: Add Pass 8 to Review Knowledge Base

**Files:**
- Modify: `knowledge/review/review-implementation-tasks.md:14-21` (summary) and append new pass

- [ ] **Step 1: Update the summary to include Pass 8**

In `knowledge/review/review-implementation-tasks.md`, find the summary list (lines 14-21). After the line about Pass 7, add:

```markdown
- **Pass 8 — Agent Executability**: Every task complies with the 5 agent sizing rules (three-file, 150-line, single-concern, decision-free, test co-location); exceptions are justified.
```

Also update the opening paragraph (line 9) from "7 passes" to "8 passes":

```markdown
The implementation tasks document translates the architecture into discrete, actionable work items that AI agents can execute. Each task must be self-contained enough for a single agent session, correctly ordered by dependency, and clear enough to implement without asking questions. This review uses 8 passes targeting the specific ways implementation tasks fail.
```

- [ ] **Step 2: Add Pass 8 section before Common Review Anti-Patterns**

In `knowledge/review/review-implementation-tasks.md`, find the `## Common Review Anti-Patterns` heading (line 218) and insert the following BEFORE it:

```markdown
---

## Pass 8: Agent Executability

### What to Check

Every task complies with the five agent executability rules. Tasks exceeding limits without justification must be split.

- **Three-File Rule**: Count application files each task modifies (test files excluded). Flag any task touching 4+ files. Check for `<!-- agent-size-exception -->` annotations on flagged tasks.
- **150-Line Budget**: Estimate net-new lines per task based on the task description scope. Flag tasks likely to produce 200+ lines. Signals: "implement X with Y and Z", multiple acceptance criteria spanning different modules, multi-layer work.
- **Single-Concern Rule**: Check each task description for "and" connecting unrelated work. Flag tasks spanning multiple architectural layers or feature domains.
- **Decision-Free Execution**: Scan for unresolved design decisions. Red flags: "choose", "determine", "decide", "evaluate options", "select the best approach", "pick the right", "figure out". Every design choice must be resolved in the task description.
- **Test Co-location**: Verify every task that produces application code also includes test requirements. Flag any "write tests for tasks X-Y" aggregation pattern. Flag tasks with no test mention.

### Why This Matters

Large tasks are the #1 cause of AI agent failure during implementation. When a task requires reading 5+ files, holding multiple abstractions in context, and writing 300+ lines — agents lose coherence, make inconsistent changes, or run out of context window. Tasks with unresolved design decisions cause agents to make architectural choices they shouldn't, producing inconsistent implementations across tasks. Deferred testing produces untestable code and violates TDD.

### How to Check

1. For each task, count the application files it modifies (exclude test files). Flag 4+ files.
2. Estimate net-new application code lines from the task scope. Flag 200+ estimated lines.
3. Read the task description. Does it contain "and" connecting distinct concerns? Flag it.
4. Scan for decision language: "choose", "determine", "decide", "evaluate", "select", "figure out". Flag any unresolved decisions.
5. Check test requirements. Does every code-producing task specify what to test? Flag tasks with no test mention or deferred testing.
6. For flagged tasks, check for `<!-- agent-size-exception: reason -->`. Accept justified exceptions; flag unjustified ones.
7. For each P0/P1 finding, provide a specific split recommendation: name the sub-tasks, list files each owns, specify dependencies between them.

### Severity

- P0: Task exceeds 6+ files or 300+ estimated lines — must split immediately, no exceptions
- P1: Task violates three-file rule without justification — must split or add exception annotation
- P1: Task violates 150-line budget without justification — must split or justify
- P1: Task contains unresolved design decisions — must resolve in task description
- P2: Task has "and" connecting concerns but stays within limits — recommend split
- P2: Test requirements vague ("add appropriate tests") or deferred — strengthen with specifics
- P3: Task near limits (3 files, ~150 lines) — note as borderline, no action required

### What a Finding Looks Like

- P1: "Task BD-15 'Implement order management API' modifies 5 files (routes, controller, service, validator, model). Violates three-file rule. Split into: BD-15a 'Create order model and migration' (1 file + migration), BD-15b 'Implement order service with validation' (2 files), BD-15c 'Add order routes and controller' (2 files, depends on BD-15a, BD-15b)."
- P1: "Task BD-22 'Build settings page' says 'determine whether to use tabs or accordion for organizing preferences.' This is an unresolved design decision. The task description must specify the layout pattern."
- P2: "Task BD-08 'Set up error handling AND configure logging' connects two concerns with 'and'. Recommend splitting into error handling task and logging task."

```

- [ ] **Step 3: Commit**

```bash
git add knowledge/review/review-implementation-tasks.md
git commit -m "feat: add Pass 8 Agent Executability to review knowledge base"
```

---

## Task 5: Add Pass 8 to Implementation Plan Review Pipeline Step

**Files:**
- Modify: `pipeline/planning/implementation-plan-review.md:36-44` (quality criteria)

- [ ] **Step 1: Update quality criteria**

In `pipeline/planning/implementation-plan-review.md`, after line 43:

```markdown
- (deep) Every task has verb-first description, >= 1 input file reference, >= 1 acceptance criterion, and defined output artifact
```

Add:

```markdown
- (mvp) Every task complies with agent executability rules (3-file, 150-line, single-concern, decision-free, test co-location)
- (mvp) Tasks exceeding limits have explicit `<!-- agent-size-exception -->` justification
```

- [ ] **Step 2: Update the Purpose section**

In `pipeline/planning/implementation-plan-review.md`, update the Purpose section (line 12) to mention agent executability. Replace:

```markdown
## Purpose
Review implementation tasks targeting task-specific failure modes: architecture
coverage gaps, missing dependencies, tasks too large or too vague for agents,
critical path inaccuracy, and invalid parallelization assumptions. At depth 4+,
```

With:

```markdown
## Purpose
Review implementation tasks targeting task-specific failure modes: architecture
coverage gaps, missing dependencies, tasks too large or too vague for agents,
agent executability violations, critical path inaccuracy, and invalid
parallelization assumptions. At depth 4+,
```

- [ ] **Step 3: Run make validate**

Run: `make validate`
Expected: Frontmatter validation passes.

- [ ] **Step 4: Commit**

```bash
git add pipeline/planning/implementation-plan-review.md
git commit -m "feat: add agent executability quality criteria to review step"
```

---

## Task 6: Build Generated Commands and Run Quality Gates

**Files:**
- Regenerated: `commands/implementation-plan.md`, `commands/implementation-plan-review.md`

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: TypeScript compilation succeeds.

- [ ] **Step 2: Regenerate commands**

Run `scaffold build` (or the equivalent build process) to regenerate command files from pipeline steps. If `scaffold build` requires a project context, use:

```bash
cd /tmp && rm -rf scaffold-build-test && mkdir scaffold-build-test && cd scaffold-build-test && git init && node /Users/kenallred/dev-projects/scaffold/dist/cli.js init --methodology deep --no-interactive && node /Users/kenallred/dev-projects/scaffold/dist/cli.js build --output /Users/kenallred/dev-projects/scaffold/commands/
```

Or from the project root if scaffold can build in place:
```bash
scaffold build
```

- [ ] **Step 3: Verify regenerated commands contain new content**

```bash
grep -l "agent-size-exception" commands/implementation-plan.md commands/implementation-plan-review.md
```

Expected: Both files should contain the new agent executability content.

- [ ] **Step 4: Run all quality gates**

```bash
make check-all
```

Expected: All bash tests (bats + evals) AND TypeScript tests pass.

- [ ] **Step 5: Commit regenerated commands**

```bash
git add commands/implementation-plan.md commands/implementation-plan-review.md
git commit -m "chore: regenerate planning commands with agent executability content"
```

---

## Task 7: Update CHANGELOG and Bump Version

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Add 2.36.0 entry to CHANGELOG.md**

Add after the `# Changelog` header and description line, before the `## [2.35.0]` entry:

```markdown
## [2.36.0] — 2026-03-29

### Added

- **Agent Executability Heuristics** — Five formalized rules for AI-agent-friendly task sizing added to the `task-decomposition` knowledge base: Three-File Rule (max 3 application files), 150-Line Budget (~150 lines net-new code), Single-Concern Rule (no "and" connecting unrelated work), Decision-Free Execution (all design decisions resolved upfront), and Test Co-location (tests in the same task as the code they test). Hard rules with an escape hatch (`<!-- agent-size-exception: reason -->`).
- **Pass 8: Agent Executability** — New review pass in `implementation-plan-review` that evaluates every task against the 5 agent sizing rules. Flags oversized tasks with specific split recommendations. Severity: P0 for 6+ files or 300+ lines, P1 for rule violations without justification.

### Changed

- **Task sizing limits tightened** — `implementation-plan` quality criteria updated from "≤500 lines / 5 files" to "~150 lines / 3 files" with mandatory decision-free execution and test co-location requirements.
- **Implementation plan review** now includes agent executability as a quality gate at all methodology depths (mvp through deep).
```

- [ ] **Step 2: Bump version in package.json**

Change `"version": "2.35.0"` to `"version": "2.36.0"`.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "chore: bump version to 2.36.0"
```

---

## Task 8: Quality Gates, PR, and Release

- [ ] **Step 1: Run all quality gates**

```bash
make check-all
```

Expected: All gates pass.

- [ ] **Step 2: Push branch and create PR**

```bash
git push -u origin HEAD
gh pr create --title "feat: agent executability heuristics for task sizing" --body "$(cat <<'EOF'
## Summary

- Tightens task decomposition limits from 5 files / 500 lines to 3 files / ~150 lines
- Adds 5 formalized agent executability rules to task-decomposition knowledge base
- Adds Pass 8 (Agent Executability) to implementation-plan-review
- Adds Task Size Constraints section to implementation-plan
- Version bump to 2.36.0

## The 5 Rules

1. **Three-File Rule** — max 3 application files (test files excluded)
2. **150-Line Budget** — max ~150 lines net-new application code
3. **Single-Concern Rule** — one task does one thing (no "and")
4. **Decision-Free Execution** — all design decisions resolved upfront
5. **Test Co-location** — tests in the same task as the code they test

Hard rules with escape hatch: `<!-- agent-size-exception: reason -->`

## Test plan

- [x] `make check-all` passes
- [x] `scaffold build` regenerates planning commands with new content
- [x] Frontmatter validation passes for modified pipeline steps
- [x] Knowledge entry structure valid (Summary + Deep Guidance)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI**

```bash
gh pr checks --watch
```

Expected: All CI checks pass.

- [ ] **Step 4: Merge PR**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 5: Tag release**

```bash
git checkout main && git pull
git tag v2.36.0
git push origin v2.36.0
```
