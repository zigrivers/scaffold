---
name: review-adr
description: Failure modes and review passes specific to Architecture Decision Records
topics: [review, adr, decisions]
---

# Review: Architecture Decision Records

ADRs encode the "why" behind the architecture. They must be complete (every significant decision recorded), honest (genuine trade-off analysis), and non-contradictory (no two ADRs making incompatible decisions). This review uses 7 passes targeting the specific ways ADR sets fail.

Follows the review process defined in `review-methodology.md`.

---

## Pass 1: Decision Coverage

### What to Check

Every significant architectural decision has an ADR. Technology choices, pattern selections, component boundaries, integration strategies, and constraint trade-offs are all recorded.

### Why This Matters

Unrecorded decisions become folklore — known to the original author but invisible to implementing agents. When an agent encounters an undocumented technology choice, it either assumes incorrectly or asks questions the ADR should have answered. At scale, unrecorded decisions are the primary source of "but why do we do it this way?" confusion.

### How to Check

1. Read through the domain models and architecture document (if it exists at this point)
2. List every decision implied by the structure: technology choices (language, framework, database), architectural patterns (monolith vs. microservices, event-driven vs. request-response), component boundaries, integration mechanisms, data storage strategies
3. For each identified decision, find the corresponding ADR
4. Flag decisions that are visible in the artifacts but have no ADR
5. Check that technology selection decisions cover: primary language/framework, database(s), key infrastructure (message queue, cache, CDN), deployment platform

### What a Finding Looks Like

- P0: "The architecture uses PostgreSQL and Redis but there is no ADR recording why these were chosen over alternatives."
- P1: "The system uses event-driven communication between Order and Inventory services, but no ADR documents this pattern choice versus synchronous calls."
- P2: "The testing framework choice (Jest) is implied by package.json conventions but not recorded as a decision."

---

## Pass 2: Rationale Quality

### What to Check

Each ADR has genuine alternatives that were seriously considered (not straw-manned). Consequences are honest — both positive and negative. The rationale explains why the chosen option was selected, not just what was selected.

### Why This Matters

Straw-manned alternatives ("we could do nothing" or obviously bad options) indicate the decision was made before the analysis. This means the real reasoning is undocumented. When conditions change, the team has no basis for re-evaluating because they do not know why the decision was actually made.

### How to Check

1. For each ADR, read the alternatives section
2. Check that at least 2-3 alternatives are genuinely viable — would a reasonable engineer consider them?
3. Verify each alternative has honest pros and cons (not just cons)
4. Read the consequences section: are there negative consequences? (Every decision has trade-offs — all-positive consequences indicate dishonest analysis)
5. Check the rationale: does it explain why the chosen option's trade-offs are acceptable, or does it just restate the decision?
6. Look for evaluation criteria: what dimensions were the options compared on?

### What a Finding Looks Like

- P0: "ADR-003 lists 'do nothing' and 'use an obviously unsuitable technology' as alternatives. The real alternatives (comparable frameworks) are missing."
- P1: "ADR-007 consequences section lists only benefits. A REST API decision always has trade-offs (chatty calls, over-fetching, versioning complexity) — these are absent."
- P2: "ADR-012 explains what was chosen but not why. The rationale section reads 'We chose React' without explaining what made it the best fit."

---

## Pass 3: Contradiction Detection

### What to Check

No two ADRs make contradictory decisions without explicit acknowledgment. When one ADR supersedes or modifies another, the relationship is documented.

### Why This Matters

Contradictory ADRs give implementing agents conflicting instructions. If ADR-005 says "use REST for all APIs" and ADR-012 says "use GraphQL for the dashboard API" without referencing ADR-005, an agent reading both does not know which takes precedence. Contradictions that are intentional (scoped exceptions) must be explicit.

### How to Check

1. Build a decision matrix: for each ADR, note what it decides and what domain it constrains
2. Look for overlapping constraints: two ADRs that affect the same architectural concern
3. For each overlap, determine: do they agree, or do they contradict?
4. For contradictions, check: does the later ADR reference the earlier one and explain the exception?
5. Check for implicit contradictions: ADR-A says "minimize external dependencies" while ADR-B adds three new external services
6. Verify supersession chains: if ADR-X supersedes ADR-Y, is ADR-Y marked as superseded?

### What a Finding Looks Like

- P0: "ADR-005 specifies 'all state in PostgreSQL' but ADR-011 introduces Redis for session management without referencing ADR-005 or explaining the exception."
- P1: "ADR-003 (monolith-first) and ADR-009 (separate auth service) contradict. ADR-009 should reference ADR-003 and explain why auth is the exception."
- P2: "ADR-015 supersedes ADR-008 but ADR-008 status is still 'accepted'. Update to 'superseded by ADR-015'."

---

## Pass 4: Implied Decision Mining

### What to Check

Decisions visible in domain models, architecture, or code that were never formally recorded as ADRs. These are the "everyone knows" decisions that new team members do not know.

### Why This Matters

Implied decisions are the most dangerous gap in an ADR set. They represent consensus that was never examined or documented. When an implementing agent encounters an implied decision, it has no rationale to evaluate whether the decision still applies. Implied decisions also tend to be the decisions most likely to be wrong — they were never subjected to alternatives analysis.

### How to Check

1. Read domain models looking for architectural assumptions: "the system uses X" statements embedded in narrative
2. Read architecture documents for technology mentions without corresponding ADRs
3. Check for pattern assumptions: "RESTful API" assumed without an ADR choosing REST over alternatives
4. Look for constraint assumptions: "single database" or "multi-tenant" assumed without formal analysis
5. Check for deployment assumptions: cloud provider, containerization, CI/CD tool — all are decisions
6. Review domain event patterns: synchronous vs. asynchronous, at-least-once vs. exactly-once — these are decisions

### What a Finding Looks Like

- P0: "The domain models assume multi-tenancy (tenant_id on entities) but there is no ADR analyzing single-tenant vs. multi-tenant trade-offs."
- P1: "The architecture assumes containerized deployment (Docker references throughout) but no ADR records this decision."
- P2: "TypeScript is used throughout code examples in domain models but no ADR formally selects TypeScript over JavaScript."

---

## Pass 5: Status Hygiene

### What to Check

ADR statuses reflect reality. No stale "proposed" ADRs (should be accepted or rejected). Supersession chains are clean. Deprecated ADRs point to their replacements.

### Why This Matters

Stale statuses create confusion about which decisions are in effect. A "proposed" ADR that was accepted months ago but never updated looks like an undecided question. Broken supersession chains mean both the old and new ADR appear active, leading to the contradiction problems in Pass 3.

### How to Check

1. List all ADRs and their statuses
2. Flag any "proposed" or "draft" ADRs — are these genuinely pending, or were they accepted but not updated?
3. For "superseded" or "deprecated" ADRs, verify they reference their replacement
4. For "accepted" ADRs, verify they are still current — has a later ADR effectively superseded them?
5. Check for "rejected" ADRs — are the rejections still valid, or have circumstances changed?
6. Verify ADR numbering is sequential and has no gaps (gaps suggest deleted ADRs, which violates ADR principles)

### What a Finding Looks Like

- P1: "ADR-004 has status 'proposed' but is referenced by three other ADRs as if it were accepted. Update status."
- P1: "ADR-006 status is 'deprecated' but does not reference which ADR replaces it."
- P2: "ADR numbering jumps from 008 to 010. If ADR-009 was removed, it should exist as 'rejected' or 'withdrawn', not deleted."

---

## Pass 6: Cross-Reference Integrity

### What to Check

ADRs that reference each other do so correctly. Cross-references point to real ADRs, the referenced content matches what is claimed, and no circular reference chains create logical loops.

### Why This Matters

Broken cross-references make it impossible to follow decision chains. When ADR-015 says "as decided in ADR-007," but ADR-007 does not actually address that topic, the rationale chain is broken. Implementing agents cannot trace why decisions were made.

### How to Check

1. For each ADR, extract all references to other ADRs
2. Verify each referenced ADR exists
3. Verify the referenced ADR actually says what the referencing ADR claims it says
4. Check for circular reference chains (A references B references C references A)
5. Verify "supersedes" relationships are bidirectional (superseding ADR says "supersedes X"; X says "superseded by Y")
6. Check that references to domain models and architecture documents are also accurate

### What a Finding Looks Like

- P1: "ADR-012 says 'per ADR-007, we use event-driven communication' but ADR-007 actually decides on synchronous REST. Wrong cross-reference."
- P1: "ADR-015 supersedes ADR-008, but ADR-008 does not mention being superseded."
- P2: "ADR-020 references 'the data model in Section 3' without specifying which document's Section 3."

---

## Pass 7: Downstream Readiness

### What to Check

The system architecture step needs technology choices and pattern decisions finalized. All architecture-constraining decisions must be in "accepted" status with clear rationale.

### Why This Matters

The architecture document translates ADR decisions into component structure. If technology choices are unresolved, the architect must either make the decision inline (bypassing the ADR process) or leave the architecture ambiguous. Both lead to rework.

### How to Check

The system architecture step specifically needs:
1. **Technology stack decisions** — Language, framework, database, key infrastructure, all accepted
2. **Architectural pattern decisions** — Monolith vs. services, synchronous vs. asynchronous, state management approach
3. **Integration pattern decisions** — How components communicate, what protocols, what data formats
4. **Deployment topology decisions** — Where the system runs, how many environments, how deploys work
5. **Cross-cutting concern decisions** — Logging, monitoring, authentication, error handling patterns
6. **Data management decisions** — Single vs. multiple databases, caching strategy, data consistency model

For each category, verify at least one accepted ADR covers it. If a category is intentionally deferred, verify the deferral is documented with a timeline.

### What a Finding Looks Like

- P0: "No accepted ADR covers database technology selection. The system architecture step cannot design data storage components without this decision."
- P0: "The monolith-vs-services question has two proposed ADRs (ADR-003, ADR-004) but neither is accepted. The system architecture step cannot define component boundaries."
- P1: "Authentication approach is not covered by any ADR. The system architecture step needs to know the auth pattern to design the auth component."
- P2: "Monitoring strategy has no ADR. This could be deferred to the operations step but should be noted."
