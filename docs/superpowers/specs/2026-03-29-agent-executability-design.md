# Agent Executability Enhancement Design

## Summary

Tighten the existing task decomposition guidance and add a dedicated Agent Executability review pass to enforce AI-agent-friendly task sizes. Five formalized rules — Three-File Rule, 150-Line Budget, Single-Concern Rule, Decision-Free Execution, and Test Co-location — replace the current permissive guidance (5 files, 500 lines) with stricter, enforceable heuristics.

## Motivation

Large tasks are the #1 cause of AI agent failure during implementation. When a task requires reading 8 files, holding multiple abstractions in context, and writing 300+ lines across 5 files — agents lose coherence, make inconsistent changes, or run out of context window. The current guidance (1-5 files, ≤500 lines) is too permissive for reliable agent execution.

Smaller tasks also produce smaller diffs, which are easier for two-stage review (spec compliance + code quality) to verify. The subagent-driven-development workflow specifically benefits from bite-sized tasks.

## Changes

### 1. Knowledge Base Enhancement — `knowledge/core/task-decomposition.md`

#### Summary Section Updates

Update the existing sizing guidance:
- "Touches 1-5 files" → "Touches 1-3 application files (hard limit; justify exceptions)"
- "produces <= 500 lines" → "produces ~150 lines of net-new application code (excluding tests and generated files)"
- Add three new named concepts: single-concern rule, decision-free execution, test co-location

#### New Deep Guidance Section: "Agent Executability Heuristics"

Five formalized rules with hard limits and an escape hatch:

**1. Three-File Rule**
A task modifies at most 3 application files (test files don't count toward this limit). If it would touch more, split by layer or concern. Exceptions require explicit justification in the task description (`<!-- agent-size-exception: reason -->`).

**Why 3:** Reading 3 files plus their context (imports, types, interfaces) consumes roughly 40-60% of a standard agent context window, leaving room for the task description, test code, and reasoning. At 5+ files, context pressure causes agents to lose track of cross-file consistency.

**2. 150-Line Budget**
A task produces at most ~150 lines of net-new application code (excluding tests, generated files, and config). This keeps the entire change reviewable in one screen and within agent context budgets.

**Why 150:** Agent output quality degrades measurably after ~200 lines of new code in a single session. At 150 lines, the agent can hold the entire change in context while writing tests and verifying correctness. The 500-line previous limit was calibrated for human developers, not agents.

**3. Single-Concern Rule**
A task does exactly one thing. The test: can you describe what this task does in one sentence without "and"? "Add the API endpoint AND update the dashboard" is two tasks. "Implement the user registration endpoint with validation" is one task (validation is part of the endpoint, not a separate concern).

Splitting signals:
- Task description contains "and" connecting unrelated work
- Task spans multiple architectural layers (e.g., "API + frontend + database")
- Task affects multiple bounded contexts or feature domains
- Task has acceptance criteria for two distinct user-facing behaviors

**4. Decision-Free Execution**
The task description must resolve all design decisions upfront. The agent implements, it doesn't architect. No task should require:
- Choosing between patterns (repository vs active record, REST vs GraphQL)
- Selecting libraries or tools
- Deciding module structure or file organization
- Determining API contract shapes (these come from upstream specs)

If a task contains "choose", "determine", "decide", "evaluate options", or "select the best approach" — the decision belongs in the task description, resolved by the plan author, not left to the agent's judgment. Local implementation choices (variable names, loop style, internal helper structure) are fine.

**5. Test Co-location**
Tests live in the same task as the code they test. No "write all tests later" pattern. The task follows TDD: write the failing test, then the implementation, then verify. The task isn't done until tests pass.

Anti-pattern: "Task 1-8: implement features. Task 9: write tests for everything." This produces untestable code, violates TDD, and creates a single massive testing task that exceeds all size limits.

#### Concrete "Too Big" Examples with Splitting Strategies

| Task (Too Big) | Violations | Split Into |
|---------------|-----------|------------|
| "Implement user authentication" (8+ files, registration + login + reset + middleware) | 3-file, single-concern | 4 tasks: registration endpoint, login endpoint, password reset flow, auth middleware |
| "Build the settings page with all preferences" (6 files, multiple forms + APIs) | 3-file, 150-line, single-concern | Per-group: profile settings, notification settings, security settings |
| "Set up database with all migrations and seed data" (10+ files, every entity) | 3-file, 150-line | Per-entity: users table, orders table, products table, then seed data task |
| "Create API client with retry, caching, and auth" (4 concerns in one module) | Single-concern, decision-free (pattern choices) | 3 tasks: base client with auth, retry middleware, cache layer |
| "Implement the dashboard with charts, filters, and real-time updates" (5+ files, 300+ lines) | All five rules | 4 tasks: dashboard layout + routing, chart components, filter system, WebSocket integration |

#### Escape Hatch

If a task genuinely can't be split further without creating tasks that have no independent value, add an explicit annotation: `<!-- agent-size-exception: [reason] -->`. The review pass flags unjustified exceptions but accepts reasoned ones. Valid reasons:
- "Migration task touches 4 files but they're all trivial one-line renames"
- "Config file changes across 4 files are mechanical and identical in structure"
- "Test setup file is large but generated from a template"

### 2. Implementation Plan Enhancement — `pipeline/planning/implementation-plan.md`

#### New Section: "Task Size Constraints"

Add to the Instructions section, after the task decomposition guidance:

The plan creator must apply the five agent executability rules to every task before finalizing the plan:

1. Scan each task for file count — any task touching 4+ application files must be split
2. Estimate net-new lines — any task likely to produce 200+ lines must be split
3. Check for "and" in task descriptions — split if connecting unrelated concerns
4. Verify all design decisions are resolved in the task description — no "choose" or "decide"
5. Confirm tests are co-located with implementation — no deferred testing tasks

Tasks that fail any rule should be split inline. If a task genuinely can't be split, annotate with `<!-- agent-size-exception: reason -->`.

#### Quality Criteria Update

Update the existing quality criteria:
- Change "Each task estimated at 1-4 hours of agent work (produces <= 500 lines)" to "Each task produces ~150 lines of net-new application code, excluding tests and generated files"
- Change "No task modifies more than 5 files" to "No task modifies more than 3 application files (test files excluded; exceptions require justification)"
- Add: "No task contains unresolved design decisions"
- Add: "Every code-producing task includes co-located test requirements"

### 3. Implementation Plan Review Enhancement — `pipeline/planning/implementation-plan-review.md`

#### New Pass 8: Agent Executability

Position: after existing Pass 7 (Agent Context), before the downstream readiness conclusion.

**What to Check:**

- **Three-File Rule**: Count application files each task modifies (exclude test files). Flag any task touching 4+ files. Check for `<!-- agent-size-exception -->` annotations on flagged tasks.
- **150-Line Budget**: Estimate net-new lines per task based on the task description scope. Flag tasks likely to produce 200+ lines. Signals: "implement X with Y and Z", multiple acceptance criteria spanning different modules, multi-layer work.
- **Single-Concern Rule**: Check each task description for "and" connecting unrelated work. Flag tasks spanning multiple architectural layers or feature domains.
- **Decision-Free Execution**: Scan for unresolved design decisions. Red flags: "choose", "determine", "decide", "evaluate options", "select the best approach", "pick the right", "figure out". Every design choice must be resolved in the task description.
- **Test Co-location**: Verify every task that produces application code also includes test requirements. Flag any "write tests for tasks X-Y" aggregation pattern. Flag tasks with no test mention.

**Severity Levels:**
- P0: Task exceeds 6+ files or 300+ estimated lines — must split immediately, no exceptions
- P1: Task violates 3-file rule without justification — must split or add exception annotation
- P1: Task violates 150-line budget without justification — must split or justify
- P1: Task contains unresolved design decisions — must resolve in task description
- P2: Task has "and" connecting concerns but stays within limits — recommend split
- P2: Test requirements are vague ("add appropriate tests") or deferred — strengthen with specific test descriptions
- P3: Task near the limits (3 files, ~150 lines) — note as borderline, no action required

**Fix Approach:**
For each P0/P1 finding, provide a specific split recommendation:
- Name the sub-tasks
- List the files each sub-task would own
- Specify the dependency between the sub-tasks
- Estimate lines per sub-task

**Example Finding:**
```
P1 — Three-File Rule: Task BD-15 "Implement order management API" modifies 5 files:
  - src/routes/orders.ts
  - src/controllers/orders.controller.ts
  - src/services/orders.service.ts
  - src/validators/orders.validator.ts
  - src/models/order.model.ts

Split recommendation:
  BD-15a: "Create order model and database migration" (1 file: models/order.model.ts + migration)
  BD-15b: "Implement order service with validation" (2 files: services + validators)
  BD-15c: "Add order API routes and controller" (2 files: routes + controller, depends on BD-15a, BD-15b)
```

## What This Design Does NOT Change

- No new pipeline steps — enhances two existing steps
- No new knowledge base entries — enhances the existing `task-decomposition.md`
- No changes to the build system, dashboard, or runner skill
- No changes to other pipeline phases
- The existing 7 review passes remain unchanged
- Existing Pass 3 (Task Sizing) continues to check general sizing — Pass 8 adds the stricter agent-specific checks

## Implementation Notes

### Files to Modify
- `knowledge/core/task-decomposition.md` — Tighten Summary section, add Agent Executability Heuristics section with 5 rules, add "too big" examples table, add escape hatch
- `pipeline/planning/implementation-plan.md` — Add Task Size Constraints section, update quality criteria
- `pipeline/planning/implementation-plan-review.md` — Add Pass 8: Agent Executability, update quality criteria

### Files to Regenerate (via `scaffold build`)
- `commands/implementation-plan.md`
- `commands/implementation-plan-review.md`

### Other Updates
- `CHANGELOG.md` — Add entry for version bump
- `package.json` — Bump version
- `README.md` — No changes needed (pipeline step count and names unchanged)
