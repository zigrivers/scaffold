---
name: decision-completeness
description: Verifying all architectural decisions are recorded, justified, and non-contradictory
topics: [validation, decisions, adr, completeness, contradictions]
---

# Decision Completeness

Decision completeness validation ensures that every architectural and design decision made during the pipeline has been explicitly recorded in an ADR, that no decisions contradict each other, and that no deferred decisions remain unresolved before implementation begins.

## Why Decision Completeness Matters

Unrecorded decisions become tribal knowledge. When AI agents implement the system, they have no tribal knowledge — only documented decisions. Every implicit "we agreed that..." or "obviously we'd use..." that is not in an ADR is a gap that will cause agents to guess, and guesses introduce inconsistency.

## What to Check

### 1. Explicit Decision Extraction

Walk through every artifact and extract every explicit decision.

**Where explicit decisions live:**
- **ADRs** — The primary home. Each ADR records a decision, its context, and consequences.
- **Architecture document** — Technology choices, pattern selections, component organization.
- **Database schema** — Choice of database type, normalization level, indexing strategy.
- **API contracts** — Choice of API style (REST/GraphQL), versioning strategy, auth mechanism.
- **UX spec** — Framework choice, design system decisions, accessibility level target.
- **Task breakdown** — Sequencing decisions, parallelization choices.
- **Testing strategy** — Test framework, coverage targets, test environment setup.
- **Operations runbook** — Deployment strategy, CI/CD tool choice, monitoring approach.

**Process:**
1. Read each artifact sequentially.
2. For every statement that represents a choice between alternatives, extract it:
   - "We use PostgreSQL" — this is a decision.
   - "Authentication is handled via JWT tokens" — this is a decision.
   - "The frontend uses React" — this is a decision.
   - "We follow trunk-based development" — this is a decision.
3. Record the decision, the artifact it appears in, and whether it has a corresponding ADR.

### 2. Implied Decision Mining

Many decisions are implied rather than stated. These are harder to find but equally important.

**Techniques for finding implied decisions:**

**Absence-based detection** — Ask "what was NOT chosen?" If the architecture uses REST, there is an implied decision not to use GraphQL. If the schema uses PostgreSQL, there is an implied decision not to use MongoDB. Each such absence is a decision that may need an ADR.

**Convention-based detection** — When an artifact follows a specific pattern without justification, that is an implied decision. "All endpoints return JSON" — decided but not documented. "Errors follow RFC 7807" — decided but not documented.

**Technology-stack detection** — Extract the full technology stack from all artifacts. Each technology is a decision. Common technologies that often lack ADRs:
- Package manager (npm vs yarn vs pnpm)
- ORM or query builder
- Logging library
- Date/time library
- Validation library
- State management approach
- Test runner and assertion library
- CSS approach (modules, Tailwind, styled-components)
- Linter and formatter configuration

**Pattern-based detection** — Scan for phrases that indicate undocumented decisions:
- "We decided to..." (but no ADR exists)
- "The approach is..." (implies alternatives were considered)
- "For simplicity..." (implies a trade-off was made)
- "Following best practices..." (implies a specific practice was chosen)
- "Using the standard..." (implies a standard was selected)

**Assumption-based detection** — When one artifact assumes something about another, there may be an undocumented decision behind the assumption. "The API assumes eventual consistency for order status updates" — was that decided? By whom? What are the consequences?

### 3. ADR Coverage Verification

For every extracted decision (explicit and implied), verify:

1. **An ADR exists** — The decision is recorded in a numbered ADR document.
2. **The ADR has context** — Why was this decision needed? What problem was being solved?
3. **The ADR has rationale** — Why was this option chosen over alternatives?
4. **Alternatives were considered** — At least for significant decisions, alternatives should be listed.
5. **Consequences are documented** — What are the positive and negative consequences?
6. **Status is current** — The ADR status is "accepted" (not "proposed" or "deprecated" without a replacement).

### 4. Contradiction Detection

Contradictions occur when two decisions conflict. They are especially dangerous because each may be internally consistent — the conflict only appears when both are considered together.

**Where contradictions hide:**

**Cross-ADR contradictions** — Two ADRs make conflicting choices. Example: ADR-005 mandates "all inter-service communication via REST" and ADR-012 mandates "order events are published to a message queue." These may or may not contradict depending on whether the message queue counts as inter-service communication.

**ADR-vs-artifact contradictions** — An ADR mandates one approach, but an artifact implements a different one. Example: ADR-003 says "use bcrypt for password hashing" but the auth service implementation task references "argon2."

**Cross-artifact contradictions** — Two artifacts make different assumptions about the same thing. Example: API contracts define pagination with `page` and `pageSize` parameters, but the UX spec assumes cursor-based pagination with `after` tokens.

**Detection process:**
1. Group decisions by topic (database, authentication, API style, deployment, etc.).
2. Within each topic, compare all decisions for consistency.
3. For each pair of potentially conflicting decisions, determine:
   - Are they actually about the same thing?
   - Can both be true simultaneously?
   - If not, which takes precedence and why?

### 5. Deferred Decision Resolution

During earlier pipeline phases, some decisions may have been explicitly deferred with "we'll decide later" or "TBD" annotations. By validation time, these should be resolved.

**Process:**
1. Search all artifacts for deferred-decision indicators:
   - "TBD", "TODO", "to be decided", "to be determined"
   - "deferred", "will decide later", "pending decision"
   - "open question", "needs investigation", "spike needed"
   - Question marks in decision contexts ("PostgreSQL or MongoDB?")
2. For each deferred item, determine:
   - Has it been silently resolved in a later artifact? (If so, add the ADR.)
   - Is it still genuinely unresolved? (If so, it must be resolved before implementation.)
   - Was it rendered moot by another decision? (If so, document why.)

## Decision Categories Checklist

Use this checklist to verify that all common decision categories have been addressed:

### Infrastructure & Platform
- [ ] Cloud provider / hosting platform
- [ ] Programming language(s) and version(s)
- [ ] Runtime environment (Node.js version, Python version, etc.)
- [ ] Package manager
- [ ] Containerization approach (Docker, etc.)
- [ ] CI/CD pipeline tool

### Data
- [ ] Primary database type and product
- [ ] Caching strategy and product (if applicable)
- [ ] Search engine (if applicable)
- [ ] Message queue / event bus (if applicable)
- [ ] File/blob storage (if applicable)
- [ ] Data migration strategy

### API & Communication
- [ ] API style (REST, GraphQL, gRPC)
- [ ] API versioning strategy
- [ ] Authentication mechanism
- [ ] Authorization model
- [ ] Real-time communication (WebSockets, SSE, polling)

### Frontend (if applicable)
- [ ] Frontend framework
- [ ] State management approach
- [ ] CSS / styling approach
- [ ] Component library (build vs buy)
- [ ] Routing approach (client-side, server-side, hybrid)
- [ ] Build tool

### Quality
- [ ] Test framework(s) and runner(s)
- [ ] Coverage targets
- [ ] Linting and formatting tools
- [ ] Code review process
- [ ] Error tracking / monitoring tool

### Operations
- [ ] Deployment strategy (rolling, blue-green, canary)
- [ ] Environment management (staging, production)
- [ ] Logging approach and tool
- [ ] Monitoring and alerting tool
- [ ] Secret management approach
- [ ] Backup and disaster recovery

### Process
- [ ] Branching strategy (trunk-based, GitFlow, feature branches)
- [ ] Commit message format
- [ ] PR and merge strategy
- [ ] Release versioning scheme

## Output Format

### Decision Inventory

```markdown
| # | Decision | Source | ADR? | Status |
|---|----------|--------|------|--------|
| 1 | Use PostgreSQL 16 | Architecture doc §4.2 | ADR-007 | Covered |
| 2 | JWT for auth | API contracts §2.1 | ADR-003 | Covered |
| 3 | React 19 for frontend | UX spec §1.1 | MISSING | Needs ADR |
| 4 | Use pnpm | Task breakdown §setup | MISSING | Needs ADR |
| 5 | TBD: caching strategy | Architecture doc §5.3 | — | Unresolved |
| 6 | REST for all APIs | ADR-005 | ADR-005 | Contradicted by ADR-012 |
```

### Contradiction Report

```markdown
## Contradiction: API Communication Style

**Decision A:** ADR-005 — "All inter-service communication uses REST endpoints"
**Decision B:** ADR-012 — "Order state changes are published to a message queue for downstream consumers"

**Analysis:** These decisions conflict if message queue communication is considered inter-service communication. If ADR-005 intends only synchronous request-response, the contradiction is real.

**Recommended Resolution:** Amend ADR-005 to clarify scope: "Synchronous inter-service communication uses REST. Asynchronous event distribution uses the message queue per ADR-012."
```

### Deferred Decision Report

```markdown
## Unresolved: Caching Strategy

**Source:** Architecture document §5.3 — "Caching strategy TBD based on load testing results"
**Impact:** Without a caching decision, the operations runbook cannot define cache invalidation procedures, and the architecture cannot specify cache layers.
**Recommendation:** Make a provisional decision (e.g., Redis with read-through caching for frequently accessed entities) and record as an ADR. Note that it may be revisited after load testing.
```

## Prioritizing Findings

Not all missing ADRs are equally important. Prioritize by impact:

- **Critical** — Decisions that affect system architecture, data model, or security. Missing these leads to incompatible implementations.
- **Major** — Decisions that affect developer workflow, tooling, or operational procedures. Missing these leads to inconsistent practices.
- **Minor** — Decisions about conventions, formatting, or low-impact library choices. Missing these is annoying but not dangerous.

Focus resolution on critical and major findings. Minor findings can be resolved during implementation as they arise, as long as they are documented when made.
