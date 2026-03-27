---
description: "Verify every technical decision has an ADR with rationale and no contradictions"
long-description: "Extracts every explicit and implicit technical decision from all artifacts, verifies each has a corresponding ADR with context and rationale, detects contradictions between decisions, and ensures no deferred decisions remain unresolved before implementation."
---

Audit every technical and architectural decision across all documentation artifacts. AI agents implementing the system have no institutional memory — every implicit "obviously we'd use X" that is not in an ADR is a gap that will cause agents to guess. Your job is to make every decision explicit, justified, and non-contradictory.

## Inputs

Read all of these artifacts (skip any that do not exist):

- `docs/adrs/` — Existing architectural decision records
- `docs/system-architecture.md` — Technology choices, patterns, component organization
- `docs/database-schema.md` or `docs/schema/` — Database type, normalization, indexing
- `docs/api-contracts.md` or `docs/api/` — API style, versioning, auth mechanism
- `docs/ux-specification.md` or `docs/ux/` — Framework choice, design system decisions
- `docs/tech-stack.md` — Technology selections
- `docs/implementation-plan.md` or `docs/plan.md` — Sequencing decisions
- `docs/testing-strategy.md` or `docs/tdd-standards.md` — Test framework, coverage targets
- `docs/plan.md` — Constraints and technology mandates

## What to Check

### 1. Explicit Decision Extraction

Walk through every artifact and extract every statement that represents a choice between alternatives:
- "We use PostgreSQL" — decision
- "Authentication via JWT tokens" — decision
- "Frontend uses React" — decision
- "Trunk-based development" — decision

Record each decision, the artifact it appears in, and whether it has a corresponding ADR.

### 2. Implied Decision Mining

Find decisions that are made but not stated:

- **Absence-based**: What was NOT chosen? REST implies a decision against GraphQL.
- **Convention-based**: Patterns followed without justification ("all endpoints return JSON").
- **Technology-stack**: Each technology is a decision. Commonly missing: package manager, ORM, logging library, validation library, state management, CSS approach, test runner, linter config.
- **Pattern-based**: Scan for "We decided to..." / "For simplicity..." / "Following best practices..." without corresponding ADRs.

### 3. ADR Quality Verification

For every extracted decision (explicit and implied), verify:
- [ ] An ADR exists — the decision is recorded in a numbered ADR
- [ ] Context is documented — why was this decision needed?
- [ ] Rationale is provided — why was this option chosen over alternatives?
- [ ] Alternatives were considered — at least for significant decisions
- [ ] Consequences are documented — positive and negative
- [ ] Status is current — not stale "Proposed" or "Deprecated" without replacement

### 4. Contradiction Detection

Check three contradiction types:
- **Cross-ADR**: Two ADRs conflict (e.g., "all communication via REST" vs "events published to message queue")
- **ADR-vs-artifact**: ADR mandates one approach, artifact implements another (e.g., ADR says bcrypt, task references argon2)
- **Cross-artifact**: Two artifacts assume differently (e.g., API uses offset pagination, UX assumes cursor-based)

Group decisions by topic, compare within each group, and determine if conflicting decisions can coexist.

### 5. Deferred Decision Resolution

Search all artifacts for unresolved decisions:
- "TBD", "TODO", "to be decided", "to be determined"
- "deferred", "will decide later", "pending decision"
- "open question", "needs investigation", "spike needed"
- Question marks in decision contexts

For each: Has it been silently resolved? Is it still unresolved? Was it rendered moot?

### 6. Decision Category Checklist

Verify these common categories are covered:
- **Infrastructure**: Cloud provider, language(s), runtime, package manager, containerization, CI/CD
- **Data**: Database, caching, search, message queue, file storage, migration strategy
- **API**: Style (REST/GraphQL/gRPC), versioning, auth mechanism, authorization model
- **Frontend** (if applicable): Framework, state management, CSS approach, build tool
- **Quality**: Test framework, coverage targets, linting, error tracking
- **Operations**: Deployment strategy, logging, monitoring, secret management

## Findings Format

For each issue found:
- **ID**: DC-NNN
- **Severity**: P0 (blocks implementation) / P1 (significant gap) / P2 (minor issue) / P3 (informational)
- **Finding**: What's wrong
- **Location**: Which file/section
- **Fix**: Specific remediation

### Severity guidelines:
- **P0**: Contradiction between ADRs or between ADR and artifact. Unresolved decision that blocks implementation.
- **P1**: Significant implied decision with no ADR (database, auth, API style). Stale "Proposed" ADR.
- **P2**: Minor implied decision without ADR (library choice, convention). ADR missing alternatives section.
- **P3**: ADR could be clearer. Convention-level decision without formal record.

## Process

1. Read all input artifacts listed above
2. Extract all explicit decisions with source locations
3. Mine implied decisions using detection techniques
4. Verify ADR coverage and quality for each decision
5. Run contradiction detection across all decision pairs
6. Check for unresolved deferred decisions
7. Run the category checklist for coverage gaps
8. Compile findings report sorted by severity
9. Present to user for review
10. Execute approved fixes

## After This Step

When this step is complete, tell the user:

---
**Validation: Decision Completeness complete** — All decisions inventoried, ADR coverage verified, contradictions checked.

**Next:** Run `/scaffold:critical-path-walkthrough` — Walk critical user journeys end-to-end across all specs.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
