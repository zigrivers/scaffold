---
name: traceability
description: Building traceability matrices from requirements through architecture to implementation tasks
topics: [validation, traceability, requirements, coverage]
---

# Traceability

Traceability validation ensures that every requirement flows from its origin in the PRD through domain modeling, architecture decisions, system design, and into implementable tasks. A complete traceability matrix is the strongest evidence that nothing has been lost or invented during the documentation pipeline.

## Summary

- **Traceability matrix**: A table where each row is a requirement and columns are pipeline artifacts (domain, ADR, architecture, schema, API, UX, tasks, tests). Empty cells are gaps.
- **Build process**: Extract all PRD requirements (functional, NFR, constraints, deferred), then trace each forward through every downstream artifact.
- **Gap detection**: Empty cells (not N/A), orphaned artifacts tracing to no requirement, thin traces, and deferred items appearing downstream.
- **Bidirectional tracing**: Forward (requirement -> implementation) catches gaps; backward (implementation -> requirement) catches scope creep.
- **NFR tracing**: Performance, security, and accessibility requirements cut across components and need special tracing through architecture, schema, API, testing, and UX.
- **Common issues**: Orphan features, assumed infrastructure, tested-but-not-specified behaviors, specified-but-not-tested requirements, and split requirements across unlinked tasks.
- Use consistent identifiers (REQ-001, ADR-003, T-012) so traces are searchable across all artifacts.

## Deep Guidance

## What a Traceability Matrix Is

A traceability matrix is a table where each row represents a requirement and each column represents a pipeline artifact. A complete row means the requirement is fully traced from origin to implementation. A missing cell means a gap — either the requirement was not addressed at that phase, or it was addressed but the connection is not explicit.

### The Columns

| Column | Source Artifact | What to Extract |
|--------|----------------|-----------------|
| **Requirement** | PRD | Feature descriptions, user needs, NFRs, constraints |
| **Domain Concept** | Domain Model | Which entities, aggregates, events, or invariants relate to this requirement |
| **Decision** | ADRs | Which architectural decisions were made to support this requirement |
| **Architecture** | System Architecture | Which components, modules, or services implement this requirement |
| **Data** | Database Schema | Which tables, columns, or indexes support this requirement |
| **API** | API Contracts | Which endpoints or operations expose this requirement |
| **UX** | UX Specification | Which screens, flows, or components deliver this requirement to users |
| **Task** | Implementation Tasks | Which tasks implement this requirement |
| **Test** | Testing Strategy | Which test cases verify this requirement |

Not every requirement needs every column. A backend NFR like "p95 latency under 200ms" will not have a UX column. A database requirement will not have a UX column. The matrix should indicate "N/A" for legitimately inapplicable cells versus blank for gaps.

## How to Build the Matrix

### Step 1: Extract Requirements from PRD

Read the PRD and extract every discrete requirement. Include:

- **Functional requirements** — Features, user stories, acceptance criteria.
- **Non-functional requirements** — Performance, security, scalability, accessibility, availability.
- **Constraints** — Technology mandates, timeline, budget, regulatory.
- **Deferred items** — Requirements explicitly marked as out of scope or deferred. Track these too — they should NOT appear in downstream artifacts.

Give each requirement a unique identifier (e.g., `REQ-001`). If the PRD does not number them, assign them during extraction.

### Step 2: Trace Each Requirement Forward

For each requirement, search downstream artifacts for references:

1. **Domain Model:** Which domain concepts address this requirement? Look for entities that model the data, events that represent state changes, invariants that enforce rules.

2. **ADRs:** Which decisions were driven by this requirement? Technology choices, pattern selections, trade-off resolutions.

3. **Architecture:** Which component or module is responsible? Where does this requirement live in the system structure?

4. **Database Schema:** Which tables store the data? Which indexes support the queries? Which constraints enforce the rules?

5. **API Contracts:** Which endpoints expose the functionality? Which request/response shapes carry the data?

6. **UX Spec:** Which screens display the information? Which user flows exercise the feature? Which form inputs capture the data?

7. **Tasks:** Which implementation tasks build this feature? Are all layers covered (backend, frontend, infrastructure)?

8. **Tests:** Which test cases verify the requirement works correctly? Are edge cases covered?

### Step 3: Identify Gaps

After building the matrix, scan for:

- **Empty cells (not N/A)** — A requirement that reaches architecture but has no tasks is a gap. A requirement with tasks but no tests is a gap.
- **Orphaned artifacts** — Artifacts that trace to no requirement. These may indicate scope creep (see scope-management knowledge base) or missing PRD entries.
- **Thin traces** — A requirement that has only one task and one test for a complex feature. The trace exists but is insufficient.
- **Deferred items appearing downstream** — Requirements marked as deferred in the PRD but implemented in architecture or tasks.

### Step 4: Handle Missing Cells

For each gap, determine the appropriate action:

| Gap Type | Likely Action |
|----------|---------------|
| Requirement has no domain concept | Add to domain model or confirm it is a cross-cutting concern |
| Requirement has no ADR | Verify no decision was needed, or create an ADR |
| Requirement has no architecture component | Add component or map to existing component |
| Requirement has no schema support | Add schema elements (if requirement involves data persistence) |
| Requirement has no API endpoint | Add endpoint (if requirement involves external interface) |
| Requirement has no UX | Add UX elements (if requirement is user-facing) |
| Requirement has no tasks | Create tasks to implement it |
| Requirement has no tests | Add test cases |
| Artifact has no requirement | Flag as potential scope creep or identify missing PRD requirement |

## Matrix Format

### Compact Format (for overview)

```markdown
| Req ID | Requirement | Domain | ADR | Arch | DB | API | UX | Task | Test |
|--------|-------------|--------|-----|------|----|-----|----|------|------|
| REQ-001 | User registration | User entity | ADR-003 | AuthService | users | POST /auth/register | SignUp flow | T-012 | TS-001 |
| REQ-002 | Password reset | User.resetToken | ADR-003 | AuthService | users.reset_token | POST /auth/reset | Reset flow | T-015 | TS-002 |
| REQ-003 | p95 < 200ms | — | ADR-008 | CDN + caching | indexes | — | — | T-050 | TS-040 |
| REQ-004 | (deferred) Export PDF | — | — | — | — | — | — | — | — |
```

### Detailed Format (for gap investigation)

```markdown
## REQ-001: User Registration

**PRD Source:** Section 3.1, "Users must be able to create accounts with email and password"

**Domain Model Trace:**
- Entity: `User` (email, passwordHash, createdAt)
- Invariant: email must be unique
- Event: `UserRegistered`

**ADR Trace:**
- ADR-003: Use bcrypt for password hashing (cost factor 12)

**Architecture Trace:**
- Component: `AuthService` handles registration
- Data Flow: Client → API Gateway → AuthService → UserRepository → Database

**Schema Trace:**
- Table: `users` (id, email, password_hash, created_at)
- Index: `idx_users_email` UNIQUE
- Constraint: NOT NULL on email, password_hash

**API Trace:**
- POST /auth/register — request: {email, password}, response: {user, token}
- Error: 409 Conflict if email exists

**UX Trace:**
- Screen: SignUp (email input, password input, confirm password, submit)
- Flow: SignUp → Email Verification → Dashboard
- Validation: client-side email format, password strength

**Task Trace:**
- T-012: Implement user registration endpoint
- T-013: Build sign-up form component
- T-014: Add email verification flow

**Test Trace:**
- TS-001: Unit test — registration with valid data
- TS-002: Unit test — duplicate email rejection
- TS-003: Integration test — full registration flow
- TS-004: E2E test — sign up from UI
```

## Traceability for Non-Functional Requirements

NFRs require special tracing because they often cut across multiple components rather than mapping cleanly to a single feature.

### Performance Requirements

Trace through: ADR (caching strategy, database choice) → Architecture (caching layers, CDN, connection pooling) → Schema (indexes, query optimization) → API (pagination, rate limiting) → Testing (load tests, benchmarks).

### Security Requirements

Trace through: ADR (auth strategy, encryption) → Architecture (security boundaries, auth service) → Schema (encrypted columns, audit tables) → API (auth headers, CORS, rate limits) → Testing (penetration tests, auth tests) → UX (CSRF tokens, secure forms).

### Accessibility Requirements

Trace through: ADR (WCAG level target) → UX (ARIA labels, keyboard navigation, screen reader support, color contrast) → Testing (accessibility audits, screen reader tests).

## Common Issues Found During Traceability

1. **The "orphan feature" pattern** — Tasks exist for features that are not in the PRD. Often introduced during architecture when engineers think of improvements. Must be either added to PRD (with stakeholder approval) or removed from tasks.

2. **The "assumed infrastructure" pattern** — Architecture assumes infrastructure (Redis, message queue, CDN) that has no ADR, no tasks, and no operational runbook entry. The requirement is implicit.

3. **The "tested but not specified" pattern** — Test cases exist for behaviors that are not documented in any specification. Often indicates tacit knowledge that should be made explicit.

4. **The "specified but not tested" pattern** — Requirements with full implementation traces but no test coverage. Especially common for error cases and NFRs.

5. **The "split requirement" pattern** — A single PRD requirement maps to tasks across multiple phases that are not linked to each other. If one task is cut, the feature is half-built.

## Bidirectional Tracing

The matrix should be walkable in both directions:

- **Forward (requirement → implementation):** Start from a PRD requirement, verify it has complete downstream coverage.
- **Backward (implementation → requirement):** Start from a task or test, verify it traces back to a PRD requirement.

Backward tracing catches scope creep — artifacts that exist without a requirement justification. Forward tracing catches gaps — requirements without implementation.

## Tooling Considerations

For the pipeline context, the traceability matrix is a markdown document. Key practices:

- Use consistent identifiers (REQ-001, ADR-003, T-012) so traces are searchable.
- Cross-reference identifiers rather than duplicating content.
- Update the matrix when any artifact changes — it is a living document until docs are frozen.
- During validation, the matrix is the primary output. During finalization, it should be complete.

## When to Use Traceability Validation

- After all pipeline phases are complete, before finalization.
- When a significant change is made to any artifact (re-run affected rows).
- When stakeholders ask "is feature X covered?" — the matrix answers immediately.
- When prioritizing cuts — the matrix shows what is affected if a requirement is deferred.
