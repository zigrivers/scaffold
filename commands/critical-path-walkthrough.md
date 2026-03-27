---
description: "Walk critical user journeys end-to-end across all specs"
long-description: "Identifies the most important user journeys and traces each step through UX, API, architecture, database, and tasks. Verifies that every component, endpoint, query, and screen needed for each journey exists and is consistent. Uses story acceptance criteria as the definition of correct behavior."
---

Walk the most critical user journeys end-to-end across every specification artifact. For each journey, verify that every component, endpoint, database query, UI screen, and implementation task needed to make the journey work actually exists and is internally consistent. If a step in a journey references something that does not exist in any spec, that is a gap that will block implementation.

## Inputs

Read all of these artifacts (skip any that do not exist):

- `docs/plan.md` — Success criteria, personas, feature descriptions
- `docs/user-stories.md` — Stories and acceptance criteria (defines "correct behavior")
- `docs/domain-models/` — Entities, state machines, events
- `docs/system-architecture.md` — Components, data flows
- `docs/database-schema.md` or `docs/schema/` — Tables, queries, indexes
- `docs/api-contracts.md` or `docs/api/` — Endpoints, request/response shapes
- `docs/ux-specification.md` or `docs/ux/` — Screens, flows, components
- `docs/implementation-plan.md` or `docs/plan.md` — Task breakdown

## What to Check

### 1. Identify Critical Journeys

Select 5-10 critical journeys from these sources:
- **PRD success criteria** — measurable outcomes imply user journeys
- **Primary user stories** — core stories describe the most important flows
- **Persona primary needs** — each persona's main goal implies a journey
- **Revenue/value paths** — journeys that deliver the product's primary value
- **Architecture data flows** — major flows represent system-level critical paths

Prioritize: happy paths of core features, authentication flows, primary CRUD operations, cross-bounded-context journeys, and error-recovery journeys.

### 2. Trace Each Journey Step-by-Step

For each step of each journey, map to concrete artifacts:

| Step | UX Component | API Endpoint | Architecture Component | Database Query | Task ID |
|------|-------------|-------------|----------------------|----------------|---------|

### 3. Verify Each Mapping

For every cell in the mapping table, check:

**Existence** — Does the referenced artifact actually exist? Is there a `POST /auth/register` in the API contracts? Is there a `SignUpForm` in the UX spec?

**Completeness** — Does the artifact cover what this step needs? Does the endpoint accept the right parameters? Return the right response?

**Connectivity** — Does the output of step N connect to the input of step N+1? If registration returns `{user, token}`, does the next step know how to use that token?

**Error handling** — What happens if this step fails? Is the failure mode documented? Is there a recovery path? Does the UX spec define what the user sees on error?

### 4. Check for Common Gap Patterns

**Handoff gaps** — Where one bounded context ends and another begins, verify the integration mechanism (event, sync call, shared DB) is specified. Look for steps where the architecture component changes.

**State transition gaps** — For entities that change state during the journey, extract the state machine and verify every transition has API support and UX feedback. Check error transitions too (paid to refunded, shipped to returned).

**Async gaps** — Steps involving async processing (email, payment, report generation) must specify: what the user sees while waiting, how they are notified of completion, and what happens on failure.

**First-time user gaps** — Trace each journey assuming zero prior state. Do empty states exist? Do onboarding flows exist?

**Permission gaps** — For each step, verify the auth model supports who is allowed to perform the action. Check what happens when the user lacks permission.

### 5. Acceptance Criteria Cross-Check

For each critical journey, find the corresponding user story acceptance criteria. Verify:
- Every AC is testable against the mapped artifacts
- No AC references behavior that is not specified in any artifact
- Error-case ACs have corresponding error paths in the journey trace

## Findings Format

For each issue found:
- **ID**: CPW-NNN
- **Severity**: P0 (blocks implementation) / P1 (significant gap) / P2 (minor issue) / P3 (informational)
- **Finding**: What's wrong
- **Location**: Which journey, step, and artifact
- **Fix**: Specific remediation

### Severity guidelines:
- **P0**: Missing component/endpoint/screen for a step in a critical journey. Broken connection between steps (output of N does not match input of N+1).
- **P1**: Missing error path for a critical journey step. Async step without completion/failure specification.
- **P2**: Missing error path for a non-critical step. First-time-user gap on secondary journey.
- **P3**: Journey could be more efficient. Minor UX gap in non-critical flow.

### Journey summary table:

| Journey | Steps | Gaps Found | Critical Gaps | Assessment |
|---------|-------|-----------|---------------|------------|

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3. MANDATORY at depth 4+.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check before each review step.

1. **Verify auth**: Run `codex login status` and `gemini -p "respond with ok" -o json 2>/dev/null` (exit 41 = auth failure). If auth fails, tell the user to run `! codex login` or `! gemini -p "hello"` for interactive recovery. Do not silently skip.
2. **Bundle context**: Include the reviewed artifacts + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- 5-10 critical user journeys traced across UX, API, architecture, schema, and tasks
- All relevant docs for the traced journeys
- Focus areas: handoff gaps, missing error paths, state transition gaps

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read all input artifacts listed above
2. Identify 5-10 critical journeys from PRD, stories, and architecture
3. Trace each journey step-by-step through all layers
4. Verify existence, completeness, connectivity, and error handling at each step
5. Check for handoff, state transition, async, first-time, and permission gaps
6. Cross-check against acceptance criteria
7. Compile findings report sorted by severity
8. Present journey summary table and detailed findings to user
9. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
10. Execute approved fixes

## After This Step

When this step is complete, tell the user:

---
**Validation: Critical Path Walkthrough complete** — Critical user journeys traced end-to-end across all specs.

**Next:** Run `/scaffold:implementability-dry-run` — Dry-run specs from an implementing agent's perspective.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
