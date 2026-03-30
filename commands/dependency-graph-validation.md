---
description: "Verify task dependency graphs are acyclic, complete, correctly ordered"
long-description: "Verifies the task dependency graph has no cycles (which would deadlock agents), no orphaned tasks, and no chains deeper than three sequential dependencies."
---

## Purpose
Verify task dependency graphs are acyclic, complete, correctly ordered.
Validate that the implementation task dependency graph forms a valid DAG,
that all dependencies are satisfied before dependent tasks, and that no
critical tasks are missing from the graph.

At depth 4+, dispatches to external AI models (Codex, Gemini) for
independent graph validation — different models catch different ordering
and completeness issues.

## Inputs
- All phase output artifacts (docs/plan.md, docs/domain-models/, docs/adrs/,
  docs/system-architecture.md, etc.)

## Expected Outputs
- docs/validation/dependency-graph-validation.md — findings report
- docs/validation/dependency-graph-validation/review-summary.md (depth 4+) — multi-model validation synthesis
- docs/validation/dependency-graph-validation/codex-review.json (depth 4+, if available) — raw Codex findings
- docs/validation/dependency-graph-validation/gemini-review.json (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) Task dependency graph verified as acyclic (no circular dependencies)
- (mvp) Every task with dependencies has all dependencies present in the graph
- (deep) Critical path identified and total estimated duration documented
- (deep) No task is blocked by more than 3 sequential dependencies (flag deep chains)
- (deep) Wave assignments are consistent with dependency ordering
- (mvp) Findings categorized P0-P3 with specific file, section, and issue for each
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Finding Disposition
- **P0 (blocking)**: Must be resolved before proceeding to implementation. Create
  fix tasks and re-run affected upstream steps.
- **P1 (critical)**: Should be resolved; proceeding requires explicit risk acceptance
  documented in an ADR. Flag to project lead.
- **P2 (medium)**: Document in implementation plan as tech debt. May defer to
  post-launch with tracking issue.
- **P3 (minor)**: Log for future improvement. No action required before implementation.

Findings are reported in the validation output file with severity, affected artifact,
and recommended resolution. P0/P1 findings block the implementation-plan step from
proceeding without acknowledgment.

## Methodology Scaling
- **deep**: Exhaustive analysis with all sub-checks. Multi-model validation
  dispatched to Codex and Gemini if available, with graceful fallback to
  Claude-only enhanced validation.
- **mvp**: High-level scan for blocking issues only.
- **custom:depth(1-5)**:
  - Depth 1: cycle detection and basic ordering check.
  - Depth 2: add transitive dependency completeness.
  - Depth 3: full DAG validation with critical path identification and parallelization opportunities.
  - Depth 4: add external model review.
  - Depth 5: multi-model validation with optimization recommendations.

## Mode Detection
Not applicable — validation always runs fresh against current artifacts. If
multi-model artifacts exist under docs/validation/dependency-graph-validation/,
they are regenerated each run.

## Update Mode Specifics
- **Detect**: `docs/validation/dependency-graph-validation/` directory exists with prior multi-model artifacts
- **Preserve**: Prior multi-model artifacts are regenerated each run (not preserved). However, if prior findings were resolved and documented, reference the resolution log to distinguish regressions from known-resolved issues.
- **Triggers**: Any upstream artifact change triggers fresh validation
- **Conflict resolution**: If a previously-resolved finding reappears, flag as regression rather than new finding

---

## Domain Knowledge

### dependency-validation

*Verifying dependency graphs are acyclic, complete, and correctly ordered*

# Dependency Validation

Dependency validation extracts all dependency relationships between implementation tasks, builds a graph, checks for correctness, and verifies that the ordering matches architectural constraints. A valid dependency graph ensures that tasks can be executed in an order that never requires unbuilt dependencies.

## Summary

- Extract dependencies from task declarations, architecture data flows, schema foreign keys, API contract prerequisites, and implicit shared resources.
- **Cycle detection**: Use Kahn's algorithm to find tasks that can never start; resolve by splitting tasks into "define interface" and "implement interface."
- **Completeness check**: Every referenced task ID must exist in the task list; orphaned dependencies indicate renames, removals, or typos.
- **Ordering validation**: Dependencies should follow architectural layer ordering (infrastructure -> schema -> domain -> service -> API -> frontend -> tests).
- **Parallel independence**: Tasks with no dependency path between them must not share mutable files, tables, or configuration.
- **Critical path analysis**: Identify the longest sequential chain to determine minimum project duration and focus optimization efforts.
- **Fan-in/fan-out analysis**: High fan-in tasks are blockers (prioritize and split); high fan-out tasks start late (review whether all dependencies are necessary).

## Deep Guidance

## What a Dependency Graph Represents

Each node in the graph is an implementation task. Each directed edge represents a "must complete before" relationship: if task A depends on task B, then B must be completed before A can start.

The graph encodes:
- **Sequencing constraints** — What must happen before what.
- **Parallelization opportunities** — Tasks with no dependency relationship can run simultaneously.
- **Critical path** — The longest chain of sequential dependencies, which determines minimum project duration.
- **Blocking risk** — Tasks that many other tasks depend on, whose delay blocks the most work.

## How to Extract Dependencies

### From the Task Breakdown

Implementation tasks should have explicit dependency declarations. Extract these directly:

```
Task T-012: Set up database schema
  Depends on: T-010 (database connection config)

Task T-015: Implement user registration endpoint
  Depends on: T-012 (user table must exist), T-011 (auth middleware)

Task T-020: Build sign-up form
  Depends on: T-015 (registration endpoint must exist)
```

### From Architecture Data Flows

Data flow diagrams imply dependencies. If Component A sends data to Component B, then Component B's implementation depends on Component A's interface being defined (though not necessarily fully implemented — interface-first development can decouple this).

### From Schema Dependencies

Database schema has inherent ordering:
- Tables with foreign keys depend on the referenced tables.
- Migration scripts must run in order.
- Seed data depends on table creation.

### From API Contract Dependencies

API implementation depends on:
- Schema (data layer must exist for the API to read/write)
- Auth middleware (if endpoints are protected)
- External service clients (if the endpoint calls external services)

### Implicit Dependencies to Look For

Some dependencies are not stated but are real:

1. **Shared configuration** — Multiple tasks may depend on environment setup, config files, or shared constants that no task explicitly produces.
2. **Shared libraries** — Multiple tasks may depend on utility functions, custom error classes, or helper modules.
3. **Framework scaffolding** — All tasks may depend on the initial project setup (package.json, tsconfig, linting config) which may or may not be its own task.
4. **Test infrastructure** — Tests depend on test utilities, fixtures, and configuration that must be set up first.

## Graph Validation Checks

### 1. Cycle Detection

A cycle means task A depends on B, B depends on C, and C depends on A. No task in the cycle can ever start because each is waiting for another.

**Detection algorithm (Kahn's algorithm):**
1. Compute the in-degree (number of incoming edges) for each node.
2. Add all nodes with in-degree 0 to a queue.
3. While the queue is not empty:
   a. Remove a node from the queue.
   b. For each outgoing edge from that node, decrement the in-degree of the target.
   c. If the target's in-degree reaches 0, add it to the queue.
4. If all nodes have been processed, the graph is acyclic.
5. If nodes remain unprocessed, they are part of cycles.

**What to do when cycles are found:**
- Identify the minimal cycle (the smallest set of tasks that form a loop).
- Determine which dependency is weakest — can it be broken by splitting a task or defining an interface?
- Common resolution: split a task into "define interface" and "implement interface" — other tasks can depend on the interface definition without waiting for the full implementation.

### 2. Completeness Check

Every task referenced as a dependency must exist in the task list.

**Process:**
1. Collect all task IDs from the implementation tasks.
2. Collect all task IDs referenced in dependency declarations.
3. Any referenced ID not in the task list is an orphaned dependency.

**Common causes:**
- Task was removed or renamed but its dependents were not updated.
- Dependency references a task from a different phase or project.
- Typo in the task ID.

### 3. Ordering vs. Architectural Constraints

The dependency ordering should match the architecture's layered structure:

**Layer ordering (typical):**
1. Infrastructure setup (database, message queue, cache)
2. Schema creation (tables, indexes, constraints)
3. Core domain logic (entities, business rules, domain services)
4. Repository/data access layer
5. Service layer (application services, orchestration)
6. API layer (endpoints, middleware, serialization)
7. Frontend components (if applicable)
8. Integration and E2E tests

Verify that no task in a lower layer depends on a task in a higher layer (e.g., schema creation should not depend on an API endpoint).

**Exceptions:** Some cross-cutting concerns (logging, auth, error handling) may be set up early and used by all layers. This is acceptable as long as the dependency is on the shared infrastructure, not on a specific feature in a higher layer.

### 4. Parallel Task Independence

Tasks that can run in parallel (no dependency relationship between them) should not share mutable state.

**Process:**
1. Identify all task pairs that have no dependency path between them (neither A→B nor B→A exists).
2. For each parallel pair, verify:
   - They do not modify the same files.
   - They do not modify the same database tables in conflicting ways.
   - They do not depend on the same external service configuration.
   - They do not modify the same API endpoints.

**What findings look like:**
- "Tasks T-015 and T-018 can run in parallel but both modify `src/middleware/auth.ts`. If both agents work simultaneously, they will produce merge conflicts."
- "Tasks T-020 and T-022 both add columns to the `users` table. Parallel execution will cause migration conflicts."

**Resolution options:**
- Add a dependency between the conflicting tasks (breaking the parallelism).
- Split the shared resource into separate modules that can be independently modified.
- Sequence the conflicting tasks and note that parallelism is not available.

### 5. Critical Path Analysis

The critical path is the longest chain of sequential dependencies. It determines the minimum time to complete all tasks, even with unlimited parallelism.

**How to find it:**
1. Perform a topological sort of the graph.
2. For each node, compute the longest path from any root (node with no dependencies) to that node.
3. The node with the longest path is the end of the critical path.
4. Trace backward from that node along the longest incoming path to find the full critical path.

**Why it matters:**
- Tasks on the critical path cannot be parallelized — any delay directly extends the project.
- Tasks NOT on the critical path have slack — they can be delayed without extending the project.
- Optimization efforts should focus on the critical path: Can any critical-path task be split? Can any dependency be relaxed?

### 6. Fan-in and Fan-out Analysis

**High fan-in tasks** (many tasks depend on them):
- These are blockers. If they are delayed, many downstream tasks are blocked.
- They should be prioritized and possibly split into smaller deliverables.
- Example: "Set up authentication middleware" — 15 API tasks depend on it.

**High fan-out tasks** (depend on many other tasks):
- These can only start late in the project.
- They should be reviewed for whether all dependencies are truly necessary.
- Example: "E2E test suite" depends on all API and frontend tasks.

## Graph Visualization

For communication, represent the dependency graph visually:

```
T-001 (Project setup)
  ├─> T-010 (DB config)
  │     └─> T-012 (Schema creation)
  │           ├─> T-015 (User registration endpoint)
  │           │     └─> T-020 (Sign-up form)
  │           └─> T-016 (Product CRUD endpoints)
  │                 └─> T-021 (Product listing page)
  └─> T-011 (Auth middleware)
        ├─> T-015 (User registration endpoint)
        └─> T-016 (Product CRUD endpoints)
```

Or as a dependency table:

```markdown
| Task | Depends On | Depended On By | Parallelizable With |
|------|-----------|----------------|---------------------|
| T-001 | — | T-010, T-011 | — |
| T-010 | T-001 | T-012 | T-011 |
| T-011 | T-001 | T-015, T-016 | T-010, T-012 |
| T-012 | T-010 | T-015, T-016 | T-011 |
| T-015 | T-012, T-011 | T-020 | T-016 |
| T-016 | T-012, T-011 | T-021 | T-015 |
| T-020 | T-015 | — | T-016, T-021 |
| T-021 | T-016 | — | T-015, T-020 |
```

## Output Format

### Validation Summary

```markdown
## Dependency Graph Validation Results

**Total tasks:** 45
**Total dependencies:** 72
**Graph is acyclic:** Yes / No
**Cycles found:** [list if any]
**Orphaned dependencies:** [list if any]
**Critical path length:** 12 tasks
**Critical path:** T-001 → T-010 → T-012 → T-015 → T-025 → ... → T-045
**Maximum parallelism:** 6 tasks simultaneously (at step 4 of topological sort)
**High fan-in tasks (>5 dependents):** T-001, T-011, T-012
**Parallel conflicts found:** 3 (listed below)
```

### Finding Report

```markdown
## Finding: Parallel Conflict Between T-020 and T-022

**Type:** Parallel task conflict
**Severity:** Major
**Description:** Both tasks modify `src/models/User.ts` — T-020 adds email verification fields, T-022 adds profile fields. Parallel execution will cause merge conflicts.
**Recommendation:** Add dependency T-020 → T-022 (or vice versa) to serialize these tasks.
```

## When to Run Dependency Validation

- After the implementation tasks are complete.
- After any task is added, removed, or modified.
- Before starting implementation — the dependency graph is the work scheduler.
- When agents report being blocked — verify the blockage is real and not a missing dependency resolution.

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

## After This Step

Continue with: `/scaffold:apply-fixes-and-freeze`
