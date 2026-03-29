---
description: "Review implementation tasks for coverage, feasibility, and multi-model validation"
long-description: "Verifies every feature has implementation tasks, no task is too large for one session, the dependency graph has no cycles, and every acceptance criterion maps to at least one task."
---

## Purpose
Review implementation tasks targeting task-specific failure modes: architecture
coverage gaps, missing dependencies, tasks too large or too vague for agents,
agent executability violations, critical path inaccuracy, and invalid
parallelization assumptions. At depth 4+,
dispatch to independent AI models (Codex/Gemini CLIs) for multi-model validation
and produce a structured coverage matrix and review summary.

## Inputs
- docs/implementation-plan.md (required) — tasks to review
- docs/system-architecture.md (required at deep; optional — not available in MVP) — for coverage checking
- docs/domain-models/ (required at deep; optional — not available in MVP) — for completeness
- docs/user-stories.md (required) — for AC coverage mapping
- docs/plan.md (required) — for traceability
- docs/project-structure.md (required) — for file contention analysis
- docs/tdd-standards.md (required) — for test requirement verification

## Expected Outputs
- docs/reviews/review-tasks.md — findings and resolution log
- docs/implementation-plan.md — updated with fixes
- docs/reviews/implementation-plan/task-coverage.json — AC-to-task coverage matrix (depth 3+)
- docs/reviews/implementation-plan/review-summary.md — multi-model review summary (depth 4+)
- docs/reviews/implementation-plan/codex-review.json — raw Codex findings (depth 4+, if available)
- docs/reviews/implementation-plan/gemini-review.json — raw Gemini findings (depth 4+, if available)

## Quality Criteria
- (mvp) Architecture coverage verified (every component has tasks)
- (mvp) Dependency graph is valid DAG
- (mvp) No task is too large for a single agent session
- (deep) Critical path is accurate
- (deep) Parallelization assumptions are valid
- (deep) Every acceptance criterion maps to at least one task (100% AC coverage)
- (deep) Every task has verb-first description, >= 1 input file reference, >= 1 acceptance criterion, and defined output artifact
- (mvp) Every task complies with agent executability rules (3-file, 150-line, single-concern, decision-free, test co-location)
- (mvp) Tasks exceeding limits have explicit `<!-- agent-size-exception -->` justification
- (depth 4+) Independent model reviews completed and reconciled

## Methodology Scaling
- **deep**: Full multi-pass review with multi-model validation. AC coverage
  matrix. Independent Codex/Gemini dispatches. Detailed reconciliation report.
- **mvp**: Coverage check only. No external model dispatch.
- **custom:depth(1-5)**: Depth 1: architecture coverage check (every component has tasks). Depth 2: coverage check plus DAG validation and agent executability rules. Depth 3: add dependency analysis, AC coverage matrix, and task sizing audit. Depth 4: add one external model review (Codex or Gemini). Depth 5: full multi-model review with reconciliation and detailed findings report.

## Mode Detection
Re-review mode if previous review exists. If multi-model review artifacts exist
under docs/reviews/implementation-plan/, preserve prior findings still valid.

## Update Mode Specifics

- **Detect**: `docs/reviews/review-tasks.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Upstream artifact changed since last review (compare tracking comment dates)
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate

---

## Domain Knowledge

### review-methodology

*Shared process for conducting multi-pass reviews of documentation artifacts*

# Review Methodology

This document defines the shared process for reviewing pipeline artifacts. It covers HOW to review, not WHAT to check — each artifact type has its own review knowledge base document with domain-specific passes and failure modes. Every review phase (1a through 10a) follows this process.

## Summary

- **Multi-pass review**: Each pass has a single focus (coverage, consistency, structure, downstream readiness). Passes are ordered broadest-to-most-specific.
- **Finding severity**: P0 blocks next phase (must fix), P1 is a significant gap (should fix), P2 is an improvement opportunity (fix if time permits), P3 is nice-to-have (skip).
- **Fix planning**: Group findings by root cause, same section, and same severity. Fix all P0s first, then P1s. Never fix ad hoc.
- **Re-validation**: After applying fixes, re-run the specific passes that produced the findings. Stop when no new P0/P1 findings appear.
- **Downstream readiness gate**: Final check verifies the next phase can proceed with these artifacts. Outcomes: pass, conditional pass, or fail.
- **Review report**: Structured output with executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Deep Guidance

## Multi-Pass Review Structure

### Why Multiple Passes

A single read-through catches surface errors but misses structural problems. The human tendency (and the AI tendency) is to get anchored on the first issue found and lose track of the broader picture. Multi-pass review forces systematic coverage by constraining each pass to one failure mode category.

Each pass has a single focus: coverage, consistency, structural integrity, or downstream readiness. The reviewer re-reads the artifact with fresh eyes each time, looking for one thing. This is slower than a single pass but catches 3-5x more issues in practice.

### Pass Ordering

Order passes from broadest to most specific:

1. **Coverage passes first** — Is everything present that should be? Missing content is the highest-impact failure mode because it means entire aspects of the system are unspecified. Coverage gaps compound downstream: a missing domain in the domain modeling step means missing ADRs in the decisions step, missing components in the architecture step, missing tables in the specification step, and so on.

2. **Consistency passes second** — Does everything agree with itself and with upstream artifacts? Inconsistencies are the second-highest-impact failure because they create ambiguity for implementing agents. When two documents disagree, the agent guesses — and guesses wrong.

3. **Structural integrity passes third** — Is the artifact well-formed? Are relationships explicit? Are boundaries clean? Structural issues cause implementation friction: circular dependencies, unclear ownership, ambiguous boundaries.

4. **Downstream readiness last** — Can the next phase proceed? This pass validates that the artifact provides everything its consumers need. It is the gate that determines whether to proceed or iterate.

### Pass Execution

For each pass:

1. State the pass name and what you are looking for
2. Re-read the entire artifact (or the relevant sections) with only that lens
3. Record every finding, even if minor — categorize later
4. Do not fix anything during a pass — record only
5. After completing all findings for this pass, move to the next pass

Do not combine passes. The discipline of single-focus reading is the mechanism that catches issues a general-purpose review misses.

## Finding Categorization

Every finding gets a severity level. Severity determines whether the finding blocks progress or gets deferred.

### P0: Blocks Next Phase

The artifact cannot be consumed by the next pipeline phase in its current state. The next phase would produce incorrect output or be unable to proceed.

**Examples:**
- A domain entity referenced by three other models is completely undefined
- An ADR contradicts another ADR with no acknowledgment, and the architecture depends on both
- A database schema is missing tables for an entire bounded context
- An API endpoint references a data type that does not exist in any domain model

**Action:** Must fix before proceeding. No exceptions.

### P1: Significant Gap

The artifact is usable but has a meaningful gap that will cause rework downstream. The next phase can proceed but will need to make assumptions that may be wrong.

**Examples:**
- An aggregate is missing one invariant that affects validation logic
- An ADR lists alternatives but does not evaluate them
- A data flow diagram omits error paths
- An API endpoint is missing error response definitions

**Action:** Should fix before proceeding. Fix unless the cost of fixing now significantly exceeds the cost of fixing during the downstream phase (rare).

### P2: Improvement Opportunity

The artifact is correct and usable but could be clearer, more precise, or better organized. The next phase can proceed without issue.

**Examples:**
- A domain model uses informal language where a precise definition would help
- An ADR's consequences section is vague but the decision is clear
- A diagram uses inconsistent notation but the meaning is unambiguous
- An API contract could benefit from more examples

**Action:** Fix if time permits. Log for future improvement.

### P3: Nice-to-Have

Stylistic, formatting, or polish issues. No impact on correctness or downstream consumption.

**Examples:**
- Inconsistent heading capitalization
- A diagram could be reformatted for readability
- A section could be reordered for flow
- Minor wording improvements

**Action:** Fix during finalization phase if at all. Do not spend review time on these.

## Fix Planning

After all passes are complete and findings are categorized, create a fix plan before making any changes. Ad hoc fixing (fixing issues as you find them) risks:

- Introducing new issues while fixing old ones
- Fixing a symptom instead of a root cause (two findings may share one fix)
- Spending time on P2/P3 issues before P0/P1 are resolved

### Grouping Findings

Group related findings into fix batches:

1. **Same root cause** — Multiple findings that stem from a single missing concept, incorrect assumption, or structural issue. Fix the root cause once.
2. **Same section** — Findings in the same part of the artifact that can be addressed in a single editing pass.
3. **Same severity** — Process all P0s first, then P1s. Do not interleave.

### Prioritizing by Downstream Impact

Within the same severity level, prioritize fixes that have the most downstream impact:

- Fixes that affect multiple downstream phases rank higher than single-phase impacts
- Fixes that change structure (adding entities, changing boundaries) rank higher than fixes that change details (clarifying descriptions, adding examples)
- Fixes to artifacts consumed by many later phases rank higher (domain models affect everything; API contracts affect fewer phases)

### Fix Plan Format

```markdown
## Fix Plan

### Batch 1: [Root cause or theme] (P0)
- Finding 1.1: [description]
- Finding 1.3: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 2: [Root cause or theme] (P0)
- Finding 2.1: [description]
- Fix approach: [what to change and why]
- Affected sections: [list]

### Batch 3: [Root cause or theme] (P1)
...
```

## Re-Validation

After applying all fixes in a batch, re-run the specific passes that produced the findings in that batch. This is not optional — fixes routinely introduce new issues.

### What to Check

1. The original findings are resolved (the specific issues no longer exist)
2. The fix did not break anything checked by the same pass (re-read the full pass scope, not just the fixed section)
3. The fix did not introduce inconsistencies with other parts of the artifact (quick consistency check)

### When to Stop

Re-validation is complete when:
- All P0 and P1 findings are resolved
- Re-validation produced no new P0 or P1 findings
- Any new P2/P3 findings are logged but do not block progress

If re-validation produces new P0/P1 findings, create a new fix batch and repeat. If this cycle repeats more than twice, the artifact likely has a structural problem that requires rethinking a section rather than patching individual issues.

## Downstream Readiness Gate

The final check in every review: can the next phase proceed with these artifacts?

### How to Evaluate

1. Read the meta-prompt for the next phase — what inputs does it require?
2. For each required input, verify the current artifact provides it with sufficient detail and clarity
3. For each quality criterion in the next phase's meta-prompt, verify the current artifact supports it
4. Identify any questions the next phase's author would need to ask — each question is a gap

### Gate Outcomes

- **Pass** — The next phase can proceed. All required information is present and unambiguous.
- **Conditional pass** — The next phase can proceed but should be aware of specific limitations or assumptions. Document these as handoff notes.
- **Fail** — The next phase cannot produce correct output. Specific gaps must be addressed first.

A conditional pass is the most common outcome. Document the conditions clearly so the next phase knows what assumptions it is inheriting.

## Review Report Format

Every review produces a structured report. This format ensures consistency across all review phases and makes it possible to track review quality over time.

```markdown
# Review Report: [Artifact Name]

## Executive Summary
[2-3 sentences: overall artifact quality, number of findings by severity,
whether downstream gate passed]

## Findings by Pass

### Pass N: [Pass Name]
| # | Severity | Finding | Location |
|---|----------|---------|----------|
| 1 | P0 | [description] | [section/line] |
| 2 | P1 | [description] | [section/line] |

### Pass N+1: [Pass Name]
...

## Fix Plan
[Grouped fix batches as described above]

## Fix Log
| Batch | Findings Addressed | Changes Made | New Issues |
|-------|-------------------|--------------|------------|
| 1 | 1.1, 1.3 | [summary] | None |
| 2 | 2.1 | [summary] | 2.1a (P2) |

## Re-Validation Results
[Which passes were re-run, what was found]

## Downstream Readiness Assessment
- **Gate result:** Pass | Conditional Pass | Fail
- **Handoff notes:** [specific items the next phase should be aware of]
- **Remaining P2/P3 items:** [count and brief summary, for future reference]
```

---

### review-implementation-tasks

*Failure modes and review passes specific to implementation tasks artifacts*

# Review: Implementation Tasks

The implementation tasks document translates the architecture into discrete, actionable work items that AI agents can execute. Each task must be self-contained enough for a single agent session, correctly ordered by dependency, and clear enough to implement without asking questions. This review uses 8 passes targeting the specific ways implementation tasks fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Architecture Coverage**: Every architectural component, module, and integration point has corresponding tasks; cross-cutting concerns and infrastructure included.
- **Pass 2 — Missing Dependencies**: Task dependencies are complete and correct; no circular dependencies; no implicit prerequisites left undeclared.
- **Pass 3 — Task Sizing**: No task too large for a single agent session (30-60 min) or too small to be meaningful; clear scope boundaries.
- **Pass 4 — Acceptance Criteria**: Every task has clear, testable criteria covering happy path and at least one error/edge case.
- **Pass 5 — Critical Path Accuracy**: The identified critical path is actually the longest dependency chain; near-critical paths identified.
- **Pass 6 — Parallelization Validity**: Tasks marked as parallel are truly independent; no shared state, files, or undeclared dependencies.
- **Pass 7 — Agent Context**: Each task specifies which documents/sections the implementing agent should read; context is sufficient and minimal.
- **Pass 8 — Agent Executability**: Every task complies with the 5 agent sizing rules (three-file, 150-line, single-concern, decision-free, test co-location); exceptions are justified.

## Deep Guidance

---

## Pass 1: Architecture Coverage

### What to Check

Every architectural component, module, and integration point has corresponding implementation tasks. No part of the architecture is left without work items.

### Why This Matters

Uncovered components are discovered during implementation when an agent realizes a dependency has no task. This blocks the agent, creates unplanned work, and disrupts the critical path. Coverage gaps typically occur in cross-cutting concerns (logging, error handling, auth middleware) and infrastructure (CI/CD, deployment, database migrations).

### How to Check

1. List every component from the system architecture document
2. For each component, find implementation tasks that cover it
3. Flag components with no corresponding tasks
4. Check cross-cutting concerns: logging, error handling, authentication/authorization middleware, configuration management, health checks
5. Check infrastructure tasks: database migration scripts, CI/CD pipeline setup, deployment configuration, environment setup
6. Check integration tasks: component-to-component wiring, API client generation, event bus configuration
7. Verify that testing tasks exist alongside implementation tasks (not deferred to "later")

### What a Finding Looks Like

- P0: "Architecture describes an 'API Gateway' component with routing, rate limiting, and auth validation, but no implementation tasks exist for it. Five downstream tasks assume it exists."
- P1: "Database migration tasks cover schema creation but no task covers seed data or test fixtures. The testing strategy requires test data."
- P2: "Logging infrastructure is mentioned in architecture but has no dedicated task. Individual component tasks may handle it ad hoc, creating inconsistent logging."

---

## Pass 2: Missing Dependencies

### What to Check

Task dependencies are complete and correct. No task assumes a prerequisite that is not listed as a dependency. No circular dependencies exist.

### Why This Matters

Missing dependencies cause agents to start work that immediately blocks — the agent picks up a task, discovers it depends on something not yet built, and wastes a session. Circular dependencies make it impossible to determine a valid execution order. Both destroy parallelization efficiency.

### How to Check

1. For each task, read its description and acceptance criteria
2. Identify everything the task needs to exist before it can start (database tables, API endpoints, shared libraries, configuration)
3. Verify each prerequisite is listed as a dependency
4. Check for implicit dependencies: "implement user dashboard" implicitly depends on "implement user authentication" — is this explicit?
5. Build the full dependency graph and check for cycles
6. Verify that the dependency graph has at least one task with no dependencies (the starting point)
7. Check for over-specified dependencies: tasks blocked on things they do not actually need, creating artificial bottlenecks

### What a Finding Looks Like

- P0: "Task 'Implement order API endpoints' has no dependency on 'Create database schema.' The API task cannot start without tables to query."
- P1: "Tasks 'Implement user service' and 'Implement auth middleware' depend on each other. Circular dependency — determine which can be built first with a mock."
- P2: "Task 'Build product listing page' lists 'Deploy staging environment' as a dependency. This is over-specified — the page can be built and tested locally."

---

## Pass 3: Task Sizing

### What to Check

No task is too large for a single agent session (typically 30-60 minutes of focused work). No task is too small to be meaningful (trivial one-line changes should be grouped). Tasks have a clear scope boundary.

### Why This Matters

Too-large tasks exceed agent context windows and session limits. The agent runs out of context mid-task, produces incomplete work, and the next session must understand and continue partial progress — which is error-prone. Too-small tasks create overhead (setup, context loading, validation) that exceeds the actual work.

### How to Check

1. For each task, estimate the implementation scope: how many files touched, how many functions written, how much logic?
2. Flag tasks that involve more than one major component or module — these are likely too large
3. Flag tasks that involve more than 5-7 files — these may exceed agent context
4. Flag tasks that are trivial (rename a variable, update a config value) — these should be grouped into a larger task
5. Check that each task has a clear boundary: when does the agent stop? "Implement the order module" has no clear boundary; "Implement order creation endpoint with validation" does
6. Verify that tasks do not mix concerns: a single task should not be "implement auth AND set up database"

### What a Finding Looks Like

- P0: "Task 'Implement the entire backend' is a single task covering 15 architectural components, 40+ files, and hundreds of functions. This must be decomposed into component-level tasks."
- P1: "Task 'Set up user service with authentication, authorization, profile management, and email verification' covers four distinct features. Split into separate tasks."
- P2: "Task 'Update README with API documentation link' is a one-line change. Group with other documentation tasks."

---

## Pass 4: Acceptance Criteria

### What to Check

Every task has clear, testable acceptance criteria that define "done." Criteria are specific enough that an agent can verify its own work.

### Why This Matters

Without acceptance criteria, agents do not know when to stop. They either under-deliver (missing edge cases, skipping error handling) or over-deliver (adding features not asked for, over-engineering). Clear criteria also enable automated verification — if the criteria are testable, CI can validate them.

### How to Check

1. For each task, read the acceptance criteria
2. Check that criteria are testable assertions, not vague goals: "user can log in" is vague; "POST /auth/login returns 200 with JWT token when given valid credentials, 401 with error message when given invalid credentials" is testable
3. Verify criteria cover the happy path AND at least one error/edge case
4. Check that criteria reference specific inputs and expected outputs
5. Look for criteria that say "should work correctly" or "handle errors properly" — these are not actionable
6. Verify that criteria align with the API contract, database schema, and UX spec (no contradictions with upstream artifacts)

### What a Finding Looks Like

- P0: "Task 'Implement payment processing' has acceptance criteria: 'Payments should work.' This is untestable. Specify: which payment methods, what validation, what error responses, what idempotency behavior."
- P1: "Task 'Build user registration' criteria say 'user can register' but do not specify validation rules (password requirements, email format, duplicate handling)."
- P2: "Acceptance criteria reference 'standard error format' without specifying what that format is. Link to the error contract in the API spec."

---

## Pass 5: Critical Path Accuracy

### What to Check

The identified critical path is actually the longest dependency chain. Moving tasks on/off the critical path would not shorten total project duration.

### Why This Matters

An incorrect critical path means optimization effort is misdirected. If the team parallelizes work on the perceived critical path but the actual bottleneck is elsewhere, total project duration does not improve. The critical path determines the minimum project duration — optimizing anything else has zero impact on delivery date.

### How to Check

1. Trace the longest dependency chain from start to finish — this is the critical path
2. Compare with the documented critical path — do they match?
3. Check for hidden long chains: integration tasks, end-to-end testing, deployment setup — these are often on the actual critical path but not recognized
4. Verify that critical path tasks are not blocked by non-critical tasks (this would extend the critical path)
5. Check for near-critical paths: chains that are only 1-2 tasks shorter than the critical path. These become the critical path if any task slips.
6. Verify that critical path tasks have clear owners and no ambiguity — these are the tasks that cannot afford delays

### What a Finding Looks Like

- P0: "The documented critical path is: schema -> API -> frontend. But the actual longest chain is: schema -> API -> integration tests -> deployment pipeline -> end-to-end tests, which is 2 tasks longer."
- P1: "Critical path task 'Implement auth service' depends on non-critical task 'Design admin dashboard.' This dependency makes the admin dashboard silently critical."
- P2: "Two dependency chains are within one task of the critical path length. These near-critical paths should be identified to guide resource allocation."

---

## Pass 6: Parallelization Validity

### What to Check

Tasks marked as parallelizable are truly independent. They do not share state, modify the same files, or have undeclared dependencies on each other's output.

### Why This Matters

False parallelization causes merge conflicts, race conditions, and wasted work. If two agents build features that both modify the same shared module, their changes conflict at merge time. One agent's work may need to be redone. Worse, if both agents assume they own a shared resource, they may produce incompatible implementations.

### How to Check

1. For each set of tasks marked as parallel, check: do they modify the same files?
2. Check for shared state: do parallel tasks both write to the same database tables, configuration files, or shared modules?
3. Check for shared dependencies: if both tasks depend on a shared library, will one task's changes to that library affect the other?
4. Verify that parallel tasks produce independent outputs that can be merged without conflict
5. Check for ordering assumptions: does parallel task A assume parallel task B has or has not completed?
6. Look for shared infrastructure: if both tasks need to modify CI/CD configuration, they will conflict

### What a Finding Looks Like

- P0: "Tasks 'Implement user service' and 'Implement auth middleware' are marked as parallel, but both modify 'src/middleware/index.ts'. These will produce merge conflicts."
- P1: "Tasks 'Build order API' and 'Build inventory API' are parallel but both need to modify the shared database connection configuration. Sequence the config setup first."
- P2: "Parallel tasks 'Build feature A' and 'Build feature B' both add entries to the routing table. Minor merge conflict risk — document the resolution strategy."

---

## Pass 7: Agent Context

### What to Check

Each task specifies which documents and artifacts the implementing agent should read before starting. The context is sufficient for the agent to complete the task without hunting for information.

### Why This Matters

AI agents have limited context windows. If a task does not specify what to read, the agent either loads too much context (wasting tokens, risking truncation) or too little (missing crucial design decisions). Explicit context references are the difference between an agent that executes efficiently and one that spends half its session discovering what it needs to know.

### How to Check

1. For each task, verify a context section lists the specific documents/sections to read
2. Check that the listed context is sufficient: does it cover the relevant architecture section, API contract, database schema, and UX spec for this task?
3. Check that the listed context is minimal: does it include only what is needed for this specific task, not the entire project documentation?
4. Verify that context references are specific: "docs/system-architecture.md, Section 3.2: Order Service" not just "docs/system-architecture.md"
5. Check for missing context: does the task require knowledge that is not in any listed document? (This may indicate a documentation gap)
6. Verify that coding standards, testing strategy, and git workflow references are included where relevant

### What a Finding Looks Like

- P0: "Task 'Implement order creation endpoint' lists no context documents. The agent needs the API contract (endpoint spec), database schema (orders table), domain model (Order aggregate invariants), and architecture section (Order Service design)."
- P1: "Task 'Build user dashboard' references the architecture document but not the UX spec. The agent will build the component structure correctly but not the visual design."
- P2: "Task context references 'docs/system-architecture.md' without specifying which section. The agent will load the entire 2000-line document instead of the relevant 100-line section."

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

---

## Common Review Anti-Patterns

### 1. Reviewing Tasks in Isolation

The reviewer checks each task individually (sizing, acceptance criteria, context) but never builds the full dependency graph or traces the critical path. Individual tasks may look fine, but the overall task structure has cycles, missing coverage, or an incorrect critical path. Passes 2, 5, and 6 require looking at the task set as a whole, not one task at a time.

**How to spot it:** The review report has findings only from Passes 3, 4, and 7 (task-level checks) and none from Passes 1, 2, 5, or 6 (structural checks). The reviewer never drew the dependency graph.

### 2. Trusting Dependency Declarations Without Verification

The reviewer reads the declared dependencies for each task and checks for cycles, but never verifies that the declared dependencies are complete. A task that says "depends on: database schema" may also implicitly depend on "auth middleware" (because the endpoint requires authentication), but this dependency is not declared. The reviewer must read the task description and infer actual prerequisites, not just validate declared ones.

**Example finding:**

```markdown
## Finding: ITR-022

**Priority:** P0
**Pass:** Missing Dependencies (Pass 2)
**Document:** docs/implementation-tasks.md, Task 14

**Issue:** Task 14 ("Implement order creation endpoint") declares dependency on Task 3
("Create database schema") but does not declare dependency on Task 7 ("Implement auth
middleware"). The task's acceptance criteria include "returns 401 for unauthenticated
requests," which requires auth middleware to exist. If an agent starts Task 14 before
Task 7 is complete, they cannot implement or test the auth requirement.

**Recommendation:** Add Task 7 as an explicit dependency for Task 14.
```

### 3. Accepting "Implement Feature X" as a Valid Task

The reviewer sees a task titled "Implement user management" with acceptance criteria listing 8 endpoints, 3 database tables, 2 background jobs, and role-based access control — and does not flag it as too large. A single task should be completable in one agent session (30-60 minutes). "Implement user management" is a project phase, not a task.

**How to spot it:** Count the acceptance criteria and the distinct concerns. More than 5-7 acceptance criteria or more than 2 distinct concerns (e.g., API + database + auth) means the task needs splitting.

### 4. Ignoring Test Tasks

The reviewer verifies implementation tasks but does not check whether corresponding test tasks exist. The testing strategy says "integration tests for all API endpoints," but there is no task for writing those tests. Tests are not free — they require their own implementation time, and if no task exists for them, they will not be written.

**How to spot it:** For each implementation task, search for a corresponding test task. If implementation tasks outnumber test tasks by more than 3:1, testing is systematically under-tasked.

### 5. No Verification of Parallelization Claims

Tasks are marked as parallelizable, and the reviewer accepts this at face value. But two tasks marked as parallel both modify `src/config/database.ts` or both add routes to the same router file. The reviewer must check for shared file modifications, not just logical independence.

**How to spot it:** The review has no findings from Pass 6 (Parallelization Validity). The reviewer checked for logical dependencies but not for file-level conflicts.

---

### task-decomposition

*Breaking architecture into implementable tasks with dependency analysis and agent context*

# Task Decomposition

Expert knowledge for breaking user stories into implementable tasks with dependency analysis, sizing, parallelization, and agent context requirements.

## Summary

### Story-to-Task Mapping

User stories bridge PRD features and implementation tasks. Each story decomposes into tasks following the technical layers needed. Every task must trace back to a user story, and every story to a PRD feature (PRD Feature → US-xxx → Task BD-xxx).

### Task Sizing

Each task should be completable in a single AI agent session (30-90 minutes of agent time). A well-sized task has a clear title (usable as commit message), touches 1-3 application files (hard limit; justify exceptions), produces ~150 lines of net-new application code (excluding tests and generated files), and has no ambiguity about "done."

Five rules govern agent-friendly task sizing:
1. **Three-File Rule** — Max 3 application files modified (test files excluded)
2. **150-Line Budget** — Max ~150 lines of net-new application code per task
3. **Single-Concern Rule** — One task does one thing (no "and" connecting unrelated work)
4. **Decision-Free Execution** — All design decisions resolved in the task description; agents implement, they don't architect
5. **Test Co-location** — Tests live in the same task as the code they test; no deferred testing

Split large tasks by layer (API, UI, DB, tests), by feature slice (happy path, validation, edge cases), or by entity. Combine tiny tasks that touch the same file and have no independent value.

### Dependency Types

- **Logical** — Task B requires Task A's output (endpoint needs DB schema)
- **File contention** — Two tasks modify the same file (merge conflict risk)
- **Infrastructure** — Task requires setup that must exist first (DB, auth, CI)
- **Knowledge** — Task benefits from understanding gained in another task

Only logical, file contention, and infrastructure dependencies should be formal constraints.

### Definition of Done

1. Acceptance criteria from the user story are met
2. Unit tests pass (for new logic)
3. Integration tests pass (for API endpoints or component interactions)
4. No linting or type errors
5. Code follows project coding standards
6. Changes committed with proper message format

## Deep Guidance

### From Stories to Tasks — Extended

> **Note:** User stories are created as an upstream artifact in the pre-pipeline phase and available at `docs/user-stories.md`. This section covers how to consume stories and derive implementation tasks from them.

User stories bridge the gap between what the business wants (PRD features) and what developers build (implementation tasks). Every PRD feature maps to one or more user stories (created in the pre-pipeline), and every user story should map to one or more implementation tasks.

**Feature -> Story mapping:**

A PRD feature like "User can manage their profile" becomes multiple stories:

```
US-001: As a user, I can view my profile information
US-002: As a user, I can edit my display name and bio
US-003: As a user, I can upload a profile picture
US-004: As a user, I can change my password
US-005: As a user, I can delete my account
```

Each story focuses on a single capability from the user's perspective. The INVEST criteria validate the decomposition:

- **Independent:** Each story can be implemented and delivered without requiring another story to be complete (ideally)
- **Negotiable:** The implementation approach is open to discussion; the story defines what, not how
- **Valuable:** Each story delivers something the user can see, do, or benefit from
- **Estimable:** The team can roughly estimate the effort
- **Small:** Completable in 1-3 focused implementation sessions
- **Testable:** Acceptance criteria define unambiguous pass/fail conditions

### Writing Acceptance Criteria

Acceptance criteria are the bridge between stories and tests. They must be specific enough that pass/fail is unambiguous:

**Good acceptance criteria (Given/When/Then format):**

```
Story: US-002 - Edit display name and bio

AC-1: Given I am on my profile page,
      When I click "Edit Profile",
      Then I see editable fields for display name and bio
      And the fields are pre-populated with my current values

AC-2: Given I have modified my display name,
      When I click "Save",
      Then my profile updates immediately
      And I see a success notification "Profile updated"
      And navigating away and returning shows the updated name

AC-3: Given I enter a display name longer than 50 characters,
      When I try to save,
      Then I see an error "Display name must be 50 characters or fewer"
      And the form is not submitted

AC-4: Given I click "Edit Profile" and then "Cancel",
      When I return to view mode,
      Then no changes are saved
      And my original values are displayed
```

**Bad acceptance criteria:**
- "Profile editing works correctly" — untestable
- "User can edit their profile" — restates the story title
- "Handle errors gracefully" — what errors? What does gracefully mean?

### Story to Task Mapping

Each user story decomposes into implementation tasks. The decomposition follows the technical layers needed:

```
US-002: Edit display name and bio

Tasks:
1. feat(api): implement PATCH /api/v1/users/:id endpoint with validation
   - Accepts: { displayName?, bio? }
   - Validates: displayName max 50 chars, bio max 500 chars
   - Returns: updated user object
   - Test: integration test for endpoint (valid update, validation error, auth)

2. feat(ui): add profile edit form component
   - Form with display name and bio fields
   - Pre-populated with current values
   - Client-side validation matching API rules
   - Submit calls PATCH endpoint
   - Test: component test (render, validation, submit)

3. feat(ui): add profile edit page with state management
   - Edit/view mode toggle
   - Success notification on save
   - Cancel reverts to original values
   - Loading state during save
   - Test: integration test (full edit flow with mocked API)
```

### Maintaining Traceability

Every task must trace back to a user story, and every user story must trace to a PRD feature:

```
PRD Feature: User Profile Management
  -> US-002: Edit display name and bio
    -> Task BD-42: implement PATCH /api/v1/users/:id
    -> Task BD-43: add profile edit form component
    -> Task BD-44: add profile edit page with state management
```

This traceability ensures:
- No PRD feature is missed (coverage check)
- No orphan tasks exist (every task serves a purpose)
- Impact analysis is possible (changing a PRD feature reveals which tasks are affected)

### Task Sizing — Extended

#### Right-Sizing for Agent Sessions

Each task should be completable in a single AI agent session (typically 30-90 minutes of agent time). Tasks that are too large overflow the context window; tasks that are too small create unnecessary coordination overhead.

**A well-sized task:**
- Has a clear, specific title that could be a commit message
- Touches 1-3 application files (hard limit; test files excluded from count)
- Produces ~150 lines of net-new application code (excluding tests and generated files)
- Does exactly one thing (passes the single-concern test: describable without "and")
- Requires no design decisions from the agent (all choices resolved in the description)
- Includes co-located tests (the task isn't done until tests pass)
- Has no ambiguity about what "done" means
- Can be code-reviewed independently

**Size calibration:**

| Too Small | Right Size | Too Large |
|-----------|------------|-----------|
| "Add email field to User model" | "Implement user registration API endpoint with validation and tests" | "Build the entire auth system" |
| "Create Button component" | "Build form components (Input, Select, Textarea) with validation states" | "Create the full design system" |
| "Add index to users table" | "Create database schema for user management with migration" | "Set up the entire database" |

#### Splitting Large Tasks

When a task is too large, split along these axes:

**By layer (horizontal split):**
- Backend API endpoint
- Frontend component
- Database migration
- Integration test

**By feature slice (vertical split):**
- Core happy-path flow
- Validation and error handling
- Edge cases and special states
- Performance optimization

**By entity/scope:**
- User CRUD operations
- Order CRUD operations
- Payment processing

**Splitting signals:**
- The task description has "and" connecting unrelated work
- The task requires reading more than 3 existing documents for context
- The task involves more than 2 architectural boundaries (e.g., database + API + frontend + auth)
- You can't describe what "done" looks like in 2-3 sentences

#### Combining Small Tasks

If multiple tiny tasks touch the same file and have no independent value, combine them:

- "Add field X to model" + "Add field Y to model" + "Add field Z to model" -> "Create user profile model with all fields"
- "Add route A" + "Add route B" (same controller) -> "Implement routes for user profile management"

The test: would the small task result in a useful commit on its own? If not, combine.

### Dependency Analysis — Extended

#### Types of Dependencies

**Logical dependencies:** Task B requires Task A's output. The API endpoint task depends on the database schema task because the endpoint queries tables that must exist first.

**File contention dependencies:** Two tasks modify the same file. Even if logically independent, they'll produce merge conflicts if run in parallel. Sequence them.

**Infrastructure dependencies:** A task requires infrastructure (database, auth system, CI pipeline) that must be set up first. These are implicit dependencies that are easy to miss.

**Knowledge dependencies:** A task requires understanding gained from completing another task. The developer who builds the auth system understands the auth patterns needed by other features.

#### Building Dependency Graphs (DAGs)

A dependency graph is a directed acyclic graph (DAG) where:
- Nodes are tasks
- Edges point from dependency to dependent (A -> B means "A must complete before B can start")
- No cycles exist (a cycle means neither task can start)

**Process:**

1. List all tasks
2. For each task, identify what it needs that doesn't exist yet
3. Find or create the task that produces what's needed
4. Draw an edge from producer to consumer
5. Check for cycles (if A depends on B and B depends on A, something is wrong — split or reorganize)

#### Detecting Cycles

Cycles indicate a modeling problem. Common causes and fixes:

- **Mutual data dependency:** Service A needs data from Service B, and Service B needs data from Service A. Fix: extract the shared data into a separate task that both depend on.
- **Feature interaction:** Feature X needs Feature Y's component, and Feature Y needs Feature X's component. Fix: extract the shared component into its own task.
- **Testing dependency:** "Can't test A without B, can't test B without A." Fix: use mocks/stubs to break the cycle during testing. The integration test that tests both together becomes a separate task.

#### Finding Critical Path

The critical path is the longest chain of dependent tasks from start to finish. It determines the minimum project duration.

**To find the critical path:**

1. Assign estimated effort to each task
2. Trace all paths from start (no dependencies) to end (no dependents)
3. Sum the effort along each path
4. The longest path is the critical path

**Why it matters:**
- Tasks on the critical path cannot be parallelized — they directly determine project duration
- Delays on the critical path delay the entire project
- To shorten the project, focus on splitting or accelerating critical-path tasks
- Non-critical-path tasks have "float" — they can be delayed without affecting the project end date

#### Dependency Documentation

For each dependency, document:

| Dependency | Type | Reason | Risk |
|------------|------|--------|------|
| BD-10 -> BD-15 | Logical | BD-15 queries the users table created by BD-10 | Low — schema is stable |
| BD-12 -> BD-13 | File contention | Both modify src/routes/index.ts | Medium — merge conflict risk |
| BD-01 -> BD-* | Infrastructure | BD-01 sets up the database; everything needs it | High — blocks all work |

### Parallelization and Wave Planning

#### Identifying Independent Tasks

Tasks are safe to run in parallel when:
- They have no shared dependencies (no common prerequisite still in progress)
- They don't modify the same files (no merge conflict risk)
- They don't affect the same database tables (no migration conflicts)
- Their test suites don't share state (no test interference)

**Parallel-safe patterns:**
- Two features in separate directories (auth and billing)
- Frontend and backend tasks for different features
- Documentation tasks alongside implementation tasks
- Test infrastructure tasks alongside feature tasks (if different directories)

**Not parallel-safe:**
- Two tasks that both add routes to the same router file
- Two database migration tasks (migration ordering conflicts)
- Tasks that modify the same shared utility file
- Tasks where one produces test fixtures the other consumes

#### Managing Shared-State Tasks

When tasks must share state (database, shared configuration, route registry):

**Sequencing:** Add explicit dependencies so tasks run one after another. This is the safest approach.

**Interface agreement:** Tasks agree on an interface (API contract, database schema) before implementation. Both can work in parallel as long as neither deviates from the agreed interface.

**Feature flags:** Both tasks can merge independently. A feature flag controls which one is active. Integrate them in a separate task after both complete.

#### Merge Strategies for Parallel Work

When parallel tasks produce branches that must be merged to main:

- **Rebase before merge:** Each task rebases onto the latest main before creating a PR. This catches conflicts before they reach main.
- **First-in wins:** The first task to merge gets a clean merge. Subsequent tasks must rebase and resolve conflicts.
- **Minimize shared files:** Design the task decomposition to minimize file overlap. Feature-based directory structure helps enormously.

#### Wave Planning

Organize tasks into waves based on the dependency graph:

```
Wave 1 (no dependencies): Infrastructure setup, database schema, design system tokens
Wave 2 (depends on Wave 1): API endpoints, base components, auth middleware
Wave 3 (depends on Wave 2): Feature pages, integration tests, documentation
Wave 4 (depends on Wave 3): End-to-end tests, performance optimization, polish
```

Each wave's tasks can run in parallel. Wave N+1 starts only when all its dependencies in Wave N are complete. The number of parallel agents should match the number of independent tasks in the current wave.

### Agent Context Requirements

#### What Context Each Task Needs

Every task description should specify what documents and code the implementing agent needs to read:

```
Task: Implement user registration endpoint

Read before starting:
- docs/system-architecture.md — understand the API layer structure
- docs/coding-standards.md — error handling patterns, naming conventions
- docs/tdd-standards.md — integration test pattern for API endpoints
- src/features/auth/ — existing auth code (if any)
- src/shared/middleware/auth.ts — auth middleware interface

Produces:
- src/features/auth/controllers/register.controller.ts
- src/features/auth/services/register.service.ts
- src/features/auth/validators/register.validator.ts
- tests/features/auth/register.integration.test.ts
```

#### Handoff Information

When a task produces output that another task consumes, specify the handoff:

```
This task produces: POST /api/v1/auth/register
Contract:
  Request: { email: string, password: string, displayName: string }
  Response 201: { user: { id, email, displayName }, token: string }
  Response 400: { error: { code: "VALIDATION_ERROR", details: [...] } }
  Response 409: { error: { code: "ALREADY_EXISTS", message: "..." } }

Consuming tasks:
  BD-25 (registration page) will call this endpoint
  BD-30 (onboarding flow) expects the response shape above
```

#### Assumed Prior Work

Explicitly state what the agent can assume exists:

```
Assumes:
- Database is set up with migration infrastructure (BD-01, completed)
- Auth middleware exists at src/shared/middleware/auth.ts (BD-05, completed)
- Design system tokens are configured (BD-08, completed)

Does NOT assume:
- Users table exists (this task creates it)
- Any auth endpoints exist (this is the first)
```

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

### Common Pitfalls

**Tasks too vague.** "Implement backend" or "Set up auth" with no acceptance criteria, no file paths, and no test requirements. An agent receiving this task will guess wrong about scope, structure, and conventions. Fix: every task must specify exact files to create/modify, acceptance criteria, and test requirements.

**Missing dependencies.** Two tasks that modify the same file run in parallel and produce merge conflicts. Or a task tries to query a table that hasn't been created yet. Fix: explicitly map file ownership and identify all data dependencies before finalizing the task graph.

**Unrealistic parallelization.** Planning for 10 parallel agents when the dependency graph only allows 3 tasks at a time. Fix: analyze the dependency graph. The number of useful parallel agents equals the width of the widest wave.

**Giant foundation tasks.** "Set up everything: database, auth, API framework, shared types, error handling, logging, configuration" as a single task. This single task blocks all other work and is too large for a single agent session. Fix: split foundation into the smallest useful pieces — each should produce something that unblocks at least one other task.

**Testing as a separate phase.** All implementation tasks first, then "write all tests" as a final task. This violates TDD and produces lower-quality code. Fix: every implementation task includes its tests. The task isn't done until tests pass.

**No traceability.** Tasks exist in a task tracker with no link to user stories or PRD features. When a PRD feature changes, nobody knows which tasks are affected. Fix: every task references its user story. Every user story references its PRD feature.

**Premature shared utilities.** Creating "shared utility library" tasks before any feature needs them. This produces speculative abstractions that don't fit actual use cases. Fix: shared code emerges from feature work. Only create shared utility tasks after two or more features demonstrate the need.

**Ignoring the critical path.** Assigning agents to low-priority tasks while critical-path tasks wait for resources. Fix: always prioritize critical-path tasks. Non-critical tasks are parallelized around the critical path, not instead of it.

### Critical Path and Wave Planning

#### Identifying the Critical Path

The critical path is the longest chain of sequentially dependent tasks from project start to finish. To find it:

1. **Build the full DAG** — list every task and its dependencies (logical, file contention, infrastructure)
2. **Assign effort estimates** — use story points or hours per task
3. **Trace all paths** — walk from every root node (no dependencies) to every leaf node (no dependents)
4. **Sum each path** — the path with the highest total effort is the critical path
5. **Mark float** — non-critical tasks have float equal to (critical path length - their path length); they can slip by that amount without delaying the project

Critical path tasks get top priority for agent assignment. Delays on these tasks delay the entire project; delays on non-critical tasks do not (up to their float).

#### Wave Planning

Waves group independent tasks for parallel execution. Each wave starts only after its dependency wave completes.

```
Wave 0: Project infrastructure (DB setup, CI pipeline, auth scaffold)
Wave 1: Core data models, base API framework, design tokens
Wave 2: Feature endpoints, UI components, middleware (per-feature)
Wave 3: Integration flows, cross-feature wiring, E2E test scaffolds
Wave 4: Polish, performance, E2E tests, documentation finalization
```

**Rules for wave construction:**
- A task belongs to the earliest wave where all its dependencies are satisfied
- Tasks within a wave have zero dependencies on each other
- The number of useful parallel agents equals the task count of the widest wave
- If one wave has 8 tasks and the next has 2, consider whether splitting wave-2 tasks could improve parallelism

#### Agent Allocation by Wave

Assign agents based on task type to maximize context reuse within an agent session:

- **Backend agents** — API endpoints, database migrations, service logic. Context: architecture doc, API contracts, coding standards
- **Frontend agents** — UI components, pages, client-side state. Context: UX spec, design system, component patterns
- **Infrastructure agents** — CI/CD, deployment, config, monitoring. Context: dev setup, operations runbook
- **Cross-cutting agents** — Auth, error handling, shared utilities. Context: security review, coding standards

An agent working consecutive tasks of the same type retains relevant context and produces more consistent output.

#### Parallelization Signals

Tasks are safe to run in parallel when they share no file dependencies. Quick checklist:

- **Different feature directories** — `src/features/auth/` vs `src/features/billing/` can always parallelize
- **Different layers of different features** — backend auth + frontend billing have no file overlap
- **Same feature, different layers** — only if the interface contract is agreed upfront (API shape, component props)
- **Same file touched** — must be sequenced, no exceptions (merge conflicts are expensive)
- **Shared utility creation** — block until the utility task merges, then dependents can parallelize

---

### multi-model-review-dispatch

*Patterns for dispatching reviews to external AI models (Codex, Gemini) at depth 4+, including fallback strategies and finding reconciliation*

# Multi-Model Review Dispatch

At higher methodology depths (4+), reviews benefit from independent validation by external AI models. Different models have different blind spots — Codex excels at code-centric analysis while Gemini brings strength in design and architectural reasoning. Dispatching to multiple models and reconciling their findings produces higher-quality reviews than any single model alone. This knowledge covers when to dispatch, how to dispatch, how to handle failures, and how to reconcile disagreements.

## Summary

### When to Dispatch

Multi-model review activates at depth 4+ in the methodology scaling system:

| Depth | Review Approach |
|-------|----------------|
| 1-2 | Claude-only, reduced pass count |
| 3 | Claude-only, full pass count |
| 4 | Full passes + one external model (if available) |
| 5 | Full passes + multi-model with reconciliation |

Dispatch is always optional. If no external model CLI is available, the review proceeds as a Claude-only enhanced review with additional self-review passes to partially compensate.

### Model Selection

| Model | Strength | Best For |
|-------|----------|----------|
| **Codex** (OpenAI) | Code analysis, implementation correctness, API contract validation | Code reviews, security reviews, API reviews, database schema reviews |
| **Gemini** (Google) | Design reasoning, architectural patterns, broad context understanding | Architecture reviews, PRD reviews, UX reviews, domain model reviews |

When both models are available at depth 5, dispatch to both and reconcile. At depth 4, choose the model best suited to the artifact type.

### Graceful Fallback

External models are never required. The fallback chain:
1. Attempt dispatch to selected model(s)
2. If CLI unavailable → skip that model, note in report
3. If timeout → use partial results if any, note incompleteness
4. If all external models fail → Claude-only enhanced review (additional self-review passes)

The review never blocks on external model availability.

## Deep Guidance

### Dispatch Mechanics

#### CLI Availability Check

Before dispatching, verify the model CLI is installed and authenticated:

```bash
# Codex check
which codex && codex --version 2>/dev/null

# Gemini check (via Google Cloud CLI or dedicated tool)
which gemini 2>/dev/null || (which gcloud && gcloud ai models list 2>/dev/null)
```

If the CLI is not found, skip dispatch immediately. Do not prompt the user to install it — this is a review enhancement, not a requirement.

#### Prompt Formatting

External model prompts must be self-contained. The external model has no access to the pipeline context, CLAUDE.md, or prior conversation. Every dispatch includes:

1. **Artifact content** — The full text of the document being reviewed
2. **Review focus** — What specific aspects to evaluate (coverage, consistency, correctness)
3. **Upstream context** — Relevant upstream artifacts that the document should be consistent with
4. **Output format** — Structured JSON for machine-parseable findings

**Prompt template:**
```
You are reviewing the following [artifact type] for a software project.

## Document Under Review
[full artifact content]

## Upstream Context
[relevant upstream artifacts, summarized or in full]

## Review Instructions
Evaluate this document for:
1. Coverage — Are all expected topics addressed?
2. Consistency — Does it agree with the upstream context?
3. Correctness — Are technical claims accurate?
4. Completeness — Are there gaps that would block downstream work?

## Output Format
Respond with a JSON array of findings:
[
  {
    "id": "F-001",
    "severity": "P0|P1|P2|P3",
    "category": "coverage|consistency|correctness|completeness",
    "location": "section or line reference",
    "finding": "description of the issue",
    "suggestion": "recommended fix"
  }
]
```

#### Output Parsing

External model output is parsed as JSON. Handle common parsing issues:
- Strip markdown code fences (```json ... ```) if the model wraps output
- Handle trailing commas in JSON arrays
- Validate that each finding has the required fields (severity, category, finding)
- Discard malformed entries rather than failing the entire parse

Store raw output for audit:
```
docs/reviews/{artifact}/codex-review.json   — raw Codex findings
docs/reviews/{artifact}/gemini-review.json  — raw Gemini findings
docs/reviews/{artifact}/review-summary.md   — reconciled synthesis
```

### Timeout Handling

External model calls can hang or take unreasonably long. Set reasonable timeouts:

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| CLI availability check | 5 seconds | Should be instant |
| Small artifact review (<2000 words) | 60 seconds | Quick read and analysis |
| Medium artifact review (2000-10000 words) | 120 seconds | Needs more processing time |
| Large artifact review (>10000 words) | 180 seconds | Maximum reasonable wait |

#### Partial Result Handling

If a timeout occurs mid-response:
1. Check if the partial output contains valid JSON entries
2. If yes, use the valid entries and note "partial results" in the report
3. If no, treat as a model failure and fall back

Never wait indefinitely. A review that completes in 3 minutes with Claude-only findings is better than one that blocks for 10 minutes waiting for an external model.

### Finding Reconciliation

When multiple models produce findings, reconciliation synthesizes them into a unified report.

#### Consensus Analysis

Compare findings across models to identify agreement and disagreement:

**Consensus** — Multiple models flag the same issue (possibly with different wording). High confidence in the finding. Use the most specific description.

**Single-source finding** — Only one model flags an issue. Lower confidence but still valuable. Include in the report with a note about which model found it.

**Disagreement** — One model flags an issue that another model explicitly considers correct. Requires manual analysis.

#### Reconciliation Process

1. **Normalize findings.** Map each model's findings to a common schema (severity, category, location, description).

2. **Match findings across models.** Two findings match if they reference the same location and describe the same underlying issue (even with different wording). Use location + category as the matching key.

3. **Score by consensus.**
   - Found by all models → confidence: high
   - Found by majority → confidence: medium
   - Found by one model → confidence: low (but still reported)

4. **Resolve severity disagreements.** When models disagree on severity:
   - If one says P0 and another says P1 → use P0 (err on the side of caution)
   - If one says P1 and another says P3 → investigate the specific finding before deciding
   - Document the disagreement in the synthesis report

5. **Merge descriptions.** When multiple models describe the same finding differently, combine their perspectives. Model A might identify the symptom while Model B identifies the root cause.

#### Disagreement Resolution

When models actively disagree (one flags an issue, another says the same thing is correct):

1. **Read both arguments.** Each model explains its reasoning. One may have a factual error.
2. **Check against source material.** Read the actual artifact and upstream docs. The correct answer is in the documents, not in model opinions.
3. **Default to the stricter interpretation.** If genuinely ambiguous, the finding stands at reduced severity (P1 → P2).
4. **Document the disagreement.** The reconciliation report should note: "Models disagreed on [topic]. Resolution: [decision and rationale]."

### Consensus Classification

When synthesizing multi-model findings, classify each finding:
- **Consensus**: All participating models flagged the same issue at similar severity → report at the agreed severity
- **Majority**: 2+ models agree, 1 dissents → report at the lower of the agreeing severities; note the dissent
- **Divergent**: Models disagree on severity or one model found an issue others missed → present to user for decision, minimum P2 severity
- **Unique**: Only one model raised the finding → include with attribution, flag as "single-model finding" for user review

### Output Format

#### Review Summary (review-summary.md)

```markdown
# Multi-Model Review Summary: [Artifact Name]

## Models Used
- Claude (primary reviewer)
- Codex (external, depth 4+) — [available/unavailable/timeout]
- Gemini (external, depth 5) — [available/unavailable/timeout]

## Consensus Findings
| # | Severity | Finding | Models | Confidence |
|---|----------|---------|--------|------------|
| 1 | P0 | [description] | Claude, Codex | High |
| 2 | P1 | [description] | Claude, Codex, Gemini | High |

## Single-Source Findings
| # | Severity | Finding | Source | Confidence |
|---|----------|---------|--------|------------|
| 3 | P1 | [description] | Gemini | Low |

## Disagreements
| # | Topic | Claude | Codex | Resolution |
|---|-------|--------|-------|------------|
| 4 | [topic] | P1 issue | No issue | [resolution rationale] |

## Reconciliation Notes
[Any significant observations about model agreement patterns, recurring themes,
or areas where external models provided unique value]
```

#### Raw JSON Preservation

Always preserve the raw JSON output from external models, even after reconciliation. The raw findings serve as an audit trail and enable re-analysis if the reconciliation logic is later improved.

```
docs/reviews/{artifact}/
  codex-review.json     — raw output from Codex
  gemini-review.json    — raw output from Gemini
  review-summary.md     — reconciled synthesis
```

### Quality Gates

Minimum standards for a multi-model review to be considered complete:

| Gate | Threshold | Rationale |
|------|-----------|-----------|
| Minimum finding count | At least 3 findings across all models | A review with zero findings likely missed something |
| Coverage threshold | Every review pass has at least one finding or explicit "no issues found" note | Ensures all passes were actually executed |
| Reconciliation completeness | All cross-model disagreements have documented resolutions | No unresolved conflicts |
| Raw output preserved | JSON files exist for all models that were dispatched | Audit trail |

If the primary Claude review produces zero findings and external models are unavailable, the review should explicitly note this as unusual and recommend a targeted re-review at a later stage.

### Common Anti-Patterns

**Blind trust of external findings.** An external model flags an issue and the reviewer includes it without verification. External models hallucinate — they may flag a "missing section" that actually exists, or cite a "contradiction" based on a misread. Fix: every external finding must be verified against the actual artifact before inclusion in the final report.

**Ignoring disagreements.** Two models disagree, and the reviewer picks one without analysis. Fix: disagreements are the most valuable signal in multi-model review. They identify areas of genuine ambiguity or complexity. Always investigate and document the resolution.

**Dispatching at low depth.** Running external model reviews at depth 1-2 where the review scope is intentionally minimal. The external model does a full analysis anyway, producing findings that are out of scope. Fix: only dispatch at depth 4+. Lower depths use Claude-only review with reduced pass count.

**No fallback plan.** The review pipeline assumes external models are always available. When Codex is down, the review fails entirely. Fix: external dispatch is always optional. The fallback to Claude-only enhanced review must be implemented and tested.

**Over-weighting consensus.** Two models agree on a finding, so it must be correct. But both models may share the same bias (e.g., both flag a pattern as an anti-pattern that is actually appropriate for this project's constraints). Fix: consensus increases confidence but does not guarantee correctness. All findings still require artifact-level verification.

**Dispatching the full pipeline context.** Sending the entire project context (all docs, all code) to the external model. This exceeds context limits and dilutes focus. Fix: send only the artifact under review and the minimal upstream context needed for that specific review.

**Ignoring partial results.** A model times out after producing 3 of 5 findings. The reviewer discards all results because the review is "incomplete." Fix: partial results are still valuable. Include them with a note about incompleteness. Three real findings are better than zero.

---

### review-step-template

*Shared template pattern for review pipeline steps including multi-model dispatch, finding severity, and resolution workflow*

# Review Step Template

## Summary

This entry documents the common structure shared by all 15+ review pipeline steps. Individual review steps customize this structure with artifact-specific failure modes and review passes, but the scaffolding is consistent across all reviews.

**Purpose pattern**: Every review step targets domain-specific failure modes for a given artifact — not generic quality checks. Each pass has a specific focus, concrete checking instructions, and example findings.

**Standard inputs**: Primary artifact being reviewed, upstream artifacts for cross-reference validation, `review-methodology` knowledge + artifact-specific review knowledge entry.

**Standard outputs**: Review document (`docs/reviews/review-{artifact}.md`), updated primary artifact with P0/P1 fixes applied, and at depth 4+: multi-model artifacts (`codex-review.json`, `gemini-review.json`, `review-summary.md`) under `docs/reviews/{artifact}/`.

**Finding severity**: P0 (blocking — must fix), P1 (significant — fix before implementation), P2 (improvement — fix if time permits), P3 (nitpick — log for later).

**Methodology scaling**: Depth 1-2 runs top passes only (P0 focus). Depth 3 runs all passes. Depth 4-5 adds multi-model dispatch to Codex/Gemini with finding synthesis.

**Mode detection**: First review runs all passes from scratch. Re-review preserves prior findings, marks resolved ones, and reports NEW/EXISTING/RESOLVED status.

**Frontmatter conventions**: Reviews are order = creation step + 10, always include `review-methodology` in knowledge-base, and are never conditional.

## Deep Guidance

### Purpose Pattern

Every review step follows the pattern:

> Review **[artifact]** targeting **[domain]**-specific failure modes.

The review does not check generic quality ("is this document complete?"). Instead, it runs artifact-specific passes that target the known ways that artifact type fails. Each pass has a specific focus, concrete checking instructions, and example findings.

### Standard Inputs

Every review step reads:
- **Primary artifact**: The document being reviewed (e.g., `docs/domain-models.md`, `docs/api-contracts.md`)
- **Upstream artifacts**: Documents the primary artifact was built from (e.g., PRD, domain models, ADRs) -- used for cross-reference validation
- **Knowledge base entries**: `review-methodology` (shared process) + artifact-specific review knowledge (e.g., `review-api-design`, `review-database-design`)

### Standard Outputs

Every review step produces:
- **Review document**: `docs/reviews/review-{artifact}.md` -- findings organized by pass, with severity and trace information
- **Updated artifact**: The primary artifact with fixes applied for P0/P1 findings
- **Depth 4+ multi-model artifacts** (when methodology depth >= 4):
  - `docs/reviews/{artifact}/codex-review.json` -- Codex independent review findings
  - `docs/reviews/{artifact}/gemini-review.json` -- Gemini independent review findings
  - `docs/reviews/{artifact}/review-summary.md` -- Synthesized findings from all models

### Finding Severity Levels

All review steps use the same four-level severity scale:

| Level | Name | Meaning | Action |
|-------|------|---------|--------|
| P0 | Blocking | Cannot proceed to downstream steps without fixing | Must fix before moving on |
| P1 | Significant | Downstream steps can proceed but will encounter problems | Fix before implementation |
| P2 | Improvement | Artifact works but could be better | Fix if time permits |
| P3 | Nitpick | Style or preference | Log for future cleanup |

### Finding Format

Each finding includes:
- **Pass**: Which review pass discovered it (e.g., "Pass 3 -- Auth/AuthZ Coverage")
- **Priority**: P0-P3
- **Location**: Specific section, line, or element in the artifact
- **Issue**: What is wrong, with concrete details
- **Impact**: What goes wrong downstream if this is not fixed
- **Recommendation**: Specific fix, not just "fix this"
- **Trace**: Link back to upstream artifact that establishes the requirement (e.g., "PRD Section 3.2 -> Architecture DF-005")

### Example Finding

```markdown
### Finding F-003 (P1)
- **Pass**: Pass 2 — Entity Coverage
- **Location**: docs/domain-models/order.md, Section "Order Aggregate"
- **Issue**: Order aggregate does not include a `cancellationReason` field, but PRD
  Section 4.1 requires cancellation reason tracking for analytics.
- **Impact**: Implementation will lack cancellation reason; analytics pipeline will
  receive null values, causing dashboard gaps.
- **Recommendation**: Add `cancellationReason: CancellationReason` value object to
  Order aggregate with enum values: USER_REQUEST, PAYMENT_FAILED, OUT_OF_STOCK,
  ADMIN_ACTION.
- **Trace**: PRD §4.1 → User Story US-014 → Domain Model: Order Aggregate
```

### Review Document Structure

Every review output document follows a consistent structure:

```markdown
  # Review: [Artifact Name]

  **Date**: YYYY-MM-DD
  **Methodology**: deep | mvp | custom:depth(N)
  **Status**: INITIAL | RE-REVIEW
  **Models**: Claude | Claude + Codex | Claude + Codex + Gemini

  ## Findings Summary
  - Total findings: N (P0: X, P1: Y, P2: Z, P3: W)
  - Passes run: N of M
  - Artifacts checked: [list]

  ## Findings by Pass

  ### Pass 1 — [Pass Name]
  [Findings listed by severity, highest first]

  ### Pass 2 — [Pass Name]
  ...

  ## Resolution Log
  | Finding | Severity | Status | Resolution |
  |---------|----------|--------|------------|
  | F-001   | P0       | RESOLVED | Fixed in commit abc123 |
  | F-002   | P1       | EXISTING | Deferred — tracked in ADR-015 |

  ## Multi-Model Synthesis (depth 4+)
  ### Convergent Findings
  [Issues found by 2+ models — high confidence]

  ### Divergent Findings
  [Issues found by only one model — requires manual triage]
```

### Methodology Scaling Pattern

Review steps scale their thoroughness based on the methodology depth setting:

### Depth 1-2 (MVP/Minimal)
- Run only the highest-impact passes (typically passes 1-3)
- Single-model review only
- Focus on P0 findings; skip P2/P3
- Abbreviated finding descriptions

### Depth 3 (Standard)
- Run all review passes
- Single-model review
- Report all severity levels
- Full finding descriptions with trace information

### Depth 4-5 (Comprehensive)
- Run all review passes
- Multi-model dispatch: send the artifact to Codex and Gemini for independent analysis
- Synthesize findings from all models, flagging convergent findings (multiple models found the same issue) as higher confidence
- Cross-artifact consistency checks against all upstream documents
- Full finding descriptions with detailed trace and impact analysis

### Depth Scaling Example

At depth 2 (MVP), a domain model review might produce:

```markdown
  # Review: Domain Models (MVP)
  ## Findings Summary
  - Total findings: 3 (P0: 1, P1: 2)
  - Passes run: 3 of 10
  ## Findings
  ### F-001 (P0) — Missing aggregate root for Payment bounded context
  ### F-002 (P1) — Order entity lacks status field referenced in user stories
  ### F-003 (P1) — No domain event defined for order completion
```

At depth 5 (comprehensive), the same review would run all 10 passes, dispatch to
Codex and Gemini, and produce a full synthesis with 15-30 findings across all
severity levels.

### Mode Detection Pattern

Every review step checks whether this is a first review or a re-review:

**First review**: No prior review document exists. Run all passes from scratch.

**Re-review**: A prior review document exists (`docs/reviews/review-{artifact}.md`). The step:
1. Reads the prior review findings
2. Checks which findings were addressed (fixed in the artifact)
3. Marks resolved findings as "RESOLVED" rather than removing them
4. Runs all passes again looking for new issues or regressions
5. Reports findings as "NEW", "EXISTING" (still unfixed), or "RESOLVED"

This preserves review history and makes progress visible.

### Resolution Workflow

The standard workflow from review to resolution:

1. **Review**: Run the review step, producing findings
2. **Triage**: Categorize findings by severity; confirm P0s are genuine blockers
3. **Fix**: Update the primary artifact to address P0 and P1 findings
4. **Re-review**: Run the review step again in re-review mode
5. **Verify**: Confirm all P0 findings are resolved; P1 findings are resolved or have documented justification for deferral
6. **Proceed**: Move to the next pipeline phase

For depth 4+ reviews, the multi-model dispatch happens in both the initial review and the re-review, ensuring fixes do not introduce new issues visible to other models.

### Frontmatter Pattern

Review steps follow a consistent frontmatter structure:

```yaml
---
name: review-{artifact}
description: "Review {artifact} for completeness, consistency, and downstream readiness"
phase: "{phase-slug}"
order: {N}20  # Reviews are always 10 after their creation step
dependencies: [{creation-step}]
outputs: [docs/reviews/review-{artifact}.md, docs/reviews/{artifact}/review-summary.md, docs/reviews/{artifact}/codex-review.json, docs/reviews/{artifact}/gemini-review.json]
conditional: null
knowledge-base: [review-methodology, review-{artifact-domain}]
---
```

Key conventions:
- Review steps always have order = creation step order + 10
- Primary output uses `review-` prefix; multi-model directory uses bare artifact name
- Knowledge base always includes `review-methodology` plus a domain-specific entry
- Reviews are never conditional — if the creation step ran, the review runs

### Common Anti-Patterns

### Reviewing Without Upstream Context
Running a review without loading the upstream artifacts that define requirements.
The review cannot verify traceability if it does not have the PRD, domain models,
or ADRs that establish what the artifact should contain.

### Severity Inflation
Marking everything as P0 to force immediate action. This undermines the severity
system and causes triage fatigue. Reserve P0 for genuine blockers where downstream
steps will fail or produce incorrect output.

### Fix Without Re-Review
Applying fixes to findings without re-running the review. Fixes can introduce new
issues or incompletely address the original finding. Always re-review after fixes.

### Ignoring Convergent Multi-Model Findings
When multiple models independently find the same issue, it has high confidence.
Dismissing convergent findings without strong justification undermines the value
of multi-model review.

### Removing Prior Findings
Deleting findings from a re-review output instead of marking them RESOLVED. This
loses review history and makes it impossible to track what was caught and fixed.

---

## After This Step

Continue with: `/scaffold:critical-path-walkthrough`, `/scaffold:cross-phase-consistency`, `/scaffold:decision-completeness`, `/scaffold:dependency-graph-validation`, `/scaffold:implementability-dry-run`, `/scaffold:scope-creep-check`, `/scaffold:traceability-matrix`
