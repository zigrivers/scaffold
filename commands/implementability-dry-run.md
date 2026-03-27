---
description: "Dry-run specs as an implementing agent to catch ambiguity and missing detail"
long-description: "Simulates what an AI agent would experience when picking up each implementation task. For every task, verifies that inputs are clear, acceptance criteria are testable, patterns are referenced, and no ambiguity would force the agent to guess. Scores each task on a 1-5 implementability scale."
---

Read every implementation task as if you were an AI agent about to implement it. For each task, the question is: "Do I have everything I need to start coding right now?" Every question you would need to ask is a gap. Every ambiguity you would need to resolve is a defect. This is the most practical validation — it tests whether the specs actually work for their intended consumer.

Remember: AI agents have no institutional memory, cannot ask clarifying questions in real-time, interpret literally, and may not have all specs loaded simultaneously.

## Inputs

Read all of these artifacts (skip any that do not exist):

- `docs/implementation-plan.md` or `docs/plan.md` — Task breakdown (primary input)
- `docs/coding-standards.md` — Patterns and conventions agents must follow
- `docs/tdd-standards.md` — Testing patterns and conventions
- `docs/project-structure.md` — File placement rules
- `docs/system-architecture.md` — Component design
- `docs/database-schema.md` or `docs/schema/` — Data layer
- `docs/api-contracts.md` or `docs/api/` — Endpoint specifications
- `docs/ux-specification.md` or `docs/ux/` — UI specifications
- `docs/tech-stack.md` — Technology selections
- `docs/adrs/` — Decision records

## What to Check

### 1. Task-Level Completeness

For each implementation task, verify:
- **Inputs specified** — What files/modules to modify or create? What code does it depend on? What specs to read?
- **Output clear** — What is the concrete deliverable? How is success measured?
- **Scope bounded** — Clear start/stop boundaries? No overlap with adjacent tasks?
- **Dependencies explicit** — What must be done first? What does this task produce for others?

### 2. Ambiguity Detection

Flag any statement two implementers could reasonably interpret differently:

- **Vague adjectives** — "fast", "secure", "appropriate", "gracefully" must have specific targets
- **Missing specifics** — Pagination (size, cursor/offset, sort), notifications (channel, template), logging (level, fields), caching (TTL, invalidation)
- **Implicit behavior** — How unauthenticated requests are handled, what roles can do, fallback behavior

### 3. Error Case Coverage

For each operation, verify error handling is specified for: input validation (missing fields, out-of-range, wrong types, specific messages), business logic (invariant violations, missing entities, invalid state transitions), infrastructure (DB unavailable, service timeout), and concurrency (simultaneous modifications, locking strategy). Each must define the error response format (status code, body structure, user-facing message).

### 4. Data Shape Precision

For every data structure crossing a boundary (API request/response, DB row, event payload):
- Types beyond `string` (email? UUID? max length?), optional/required/nullable distinguished
- Enum values listed exhaustively, date/money/ID formats specified, nested shapes defined

### 5. Pattern and Convention References

Verify each task references: file placement rules, error handling pattern, testing pattern, logging pattern. If `docs/coding-standards.md` exists, tasks should reference it. Undocumented patterns are findings.

### 6. External Dependency Readiness

For tasks involving external services: credential sourcing documented, rate limits and retry policies specified, sandbox environments identified, SDK versions pinned.

## Findings Format

For each issue found:
- **ID**: IDR-NNN
- **Severity**: P0 (blocks implementation) / P1 (significant gap) / P2 (minor issue) / P3 (informational)
- **Finding**: What's wrong
- **Location**: Which task and what aspect
- **Fix**: Specific remediation

### Per-task implementability score:
- **5/5** — Fully implementable. No questions, no assumptions needed.
- **4/5** — Mostly implementable. Minor clarifications needed but reasonable assumptions possible.
- **3/5** — Partially implementable. Gaps that could lead to incorrect implementation.
- **2/5** — Significant gaps. Agent would need to guess about core behavior.
- **1/5** — Not implementable. Fundamental information is missing.

**Target**: All tasks should score 4/5 or higher before implementation begins.

### Summary table:

| Task | Score | Gaps | Critical | Assessment |
|------|-------|------|----------|------------|

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns in the `multi-model-dispatch` skill.

1. **Detect CLIs**: Check for `codex` and `gemini` CLI availability
2. **Bundle context**: Include the reviewed artifacts + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- Implementation tasks (the reviewed artifact)
- `docs/coding-standards.md`
- `docs/project-structure.md`
- `docs/tdd-standards.md`
- Focus areas: ambiguous task descriptions, untestable acceptance criteria, missing pattern references

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read all input artifacts listed above
2. For each implementation task, role-play as an implementing agent
3. Attempt to outline pseudocode based solely on the specification
4. Record every point where you would need to ask a question or make an assumption
5. Score each task on the 1-5 scale
6. Compile findings report sorted by severity
7. Present summary table and detailed findings to user
8. Execute approved fixes

## After This Step

When this step is complete, tell the user:

---
**Validation: Implementability Dry Run complete** — Every task scored for agent-readiness, ambiguities and gaps cataloged.

**Next:** Run `/scaffold:dependency-graph-validation` — Verify the task dependency graph is acyclic and parallelization is feasible.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
