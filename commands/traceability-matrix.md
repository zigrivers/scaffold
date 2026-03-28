---
description: "Verify every requirement traces from PRD through stories to tasks and tests"
long-description: "Builds a full traceability matrix mapping every PRD requirement through user stories, domain model, architecture, database, API, UX, tasks, and tests. Identifies orphans in both directions — requirements without implementation and artifacts without requirement justification."
---

Build a traceability matrix that maps every PRD requirement through the full pipeline: PRD requirement to user story to domain model to architecture to database to API to UX to task to test. Every requirement must have a complete forward trace. Every artifact must have a backward trace to a requirement. Gaps in either direction are findings.

## Inputs

Read all of these artifacts (skip any that do not exist):

- `docs/plan.md` — Source of all requirements
- `docs/user-stories.md` — Stories and acceptance criteria
- `docs/domain-models/` — Entities, aggregates, events, invariants
- `docs/adrs/` — Architectural decision records
- `docs/system-architecture.md` — Components and modules
- `docs/database-schema.md` or `docs/schema/` — Tables and columns
- `docs/api-contracts.md` or `docs/api/` — Endpoints and operations
- `docs/ux-specification.md` or `docs/ux/` — Screens, flows, components
- `docs/implementation-plan.md` or `docs/plan.md` — Task breakdown
- `docs/testing-strategy.md` or `docs/tdd-standards.md` — Test coverage plan
- `docs/story-tests-map.md` — *(if exists)* AC-to-test-case traceability mapping
- `tests/acceptance/` — *(if exists)* Test skeleton files for verification
- `docs/eval-standards.md` — *(if exists)* Eval coverage documentation

## What to Check

### 1. Requirement Extraction

Extract every discrete requirement from the PRD:
- **Functional requirements** — Features, user stories, acceptance criteria
- **Non-functional requirements** — Performance, security, scalability, accessibility
- **Constraints** — Technology mandates, timeline, regulatory
- **Deferred items** — Requirements explicitly marked out of scope (these must NOT appear downstream)

Assign each requirement a unique identifier (REQ-NNN) if the PRD does not already number them.

### 2. Forward Tracing (Requirement to Implementation)

For each requirement, search downstream artifacts for coverage:

| Column | Source Artifact | What to Find |
|--------|----------------|--------------|
| User Story | `docs/user-stories.md` | Story that delivers this requirement |
| Domain Concept | `docs/domain-models/` | Entities, events, or invariants that model it |
| Decision | `docs/adrs/` | ADRs driven by this requirement |
| Architecture | `docs/system-architecture.md` | Component responsible for it |
| Data | Database schema | Tables/columns that store it |
| API | API contracts | Endpoints that expose it |
| UX | UX specification | Screens that deliver it to users |
| Task | Implementation plan | Tasks that build it |
| Test Case | `docs/story-tests-map.md` or testing strategy | Tagged test cases that verify it |
| Test | Testing strategy | Test coverage plan that verifies it |

Mark cells as: **Covered**, **N/A** (legitimately not applicable), or **GAP** (missing and should exist).

### 3. Backward Tracing (Artifact to Requirement)

For each artifact element (every endpoint, table, screen, task), verify it traces back to a PRD requirement. Classify elements that do not trace back:
- **Supporting infrastructure** — Necessary for traced features (e.g., auth middleware, database migrations)
- **Orphan** — No requirement justification, not necessary infrastructure (potential scope creep)

### 4. Deferred Item Leak Check

Extract all explicitly deferred items from the PRD. Search all downstream artifacts for any reference to deferred items — even partial infrastructure or "ready for v2" preparations.

### 5. Thin Trace Detection

Flag requirements where coverage technically exists but is insufficient:
- A complex feature with only one task (should have multiple)
- A requirement with tasks but no tests
- A requirement that reaches architecture but has no tasks
- A user story whose acceptance criteria have no corresponding test assertions

### 6. NFR Tracing

Non-functional requirements require special tracing across multiple components:
- **Performance** — ADR (caching strategy) to architecture (caching layers) to schema (indexes) to API (pagination) to tests (load tests)
- **Security** — ADR (auth strategy) to architecture (security boundaries) to schema (encryption) to API (auth headers) to tests (penetration tests)
- **Accessibility** — ADR (WCAG target) to UX (ARIA labels, keyboard nav) to tests (accessibility audits)

## Findings Format

For each issue found:
- **ID**: TM-NNN
- **Severity**: P0 (blocks implementation) / P1 (significant gap) / P2 (minor issue) / P3 (informational)
- **Finding**: What's wrong
- **Location**: Which file/section
- **Fix**: Specific remediation

### Severity guidelines:
- **P0**: Must-have requirement with no tasks or no tests. Deferred item implemented downstream.
- **P1**: Requirement with incomplete trace (missing intermediate layers). Orphan artifact with significant effort.
- **P2**: Thin trace for a non-critical requirement. Minor orphan artifact.
- **P3**: N/A classification that could be debated. Informational trace gap.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3. MANDATORY at depth 4+.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check before each review step.

1. **Verify auth**: Run `codex login status` and `NO_BROWSER=true gemini -p "respond with ok" -o json 2>/dev/null` (exit 41 = auth failure). If auth fails, tell the user to run `! codex login` or `! gemini -p "hello"` for interactive recovery. Do not silently skip.
2. **Bundle context**: Include the reviewed artifacts + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- ALL pipeline documents (this step traces through all artifacts)
- Focus areas: orphaned requirements, incomplete traces, deferred item leaks

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read all input artifacts listed above
2. Extract and number all PRD requirements
3. Build the forward traceability matrix row by row
4. Perform backward tracing on every artifact element
5. Check for deferred item leaks
6. Identify thin traces
7. Compile findings report sorted by severity
8. Present to user for review
9. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
10. Execute approved fixes

## After This Step

When this step is complete, tell the user:

---
**Validation: Traceability Matrix complete** — Full forward and backward tracing from PRD through implementation.

**Next:** Run `/scaffold:decision-completeness` — Verify every technical decision has an ADR with rationale.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
