---
name: review-prd
description: Failure modes and review passes specific to product requirements document artifacts
topics: [prd, requirements, completeness, clarity, nfr, constraints, review]
---

# Review: Product Requirements Document

The PRD is the foundation of the entire pipeline. Every subsequent phase builds on it — user stories, domain models, architecture, implementation tasks. A gap or error here compounds through everything downstream. This review uses 8 passes targeting the specific ways PRD artifacts fail.

Follows the review process defined in `review-methodology.md`.

## Summary

- **Pass 1 — Problem Statement Rigor**: Verify the problem is specific, testable, grounded in evidence, and names a specific user group without prescribing solutions.
- **Pass 2 — Persona & Stakeholder Coverage**: Ensure personas are goal-driven with constraints and context; 2-4 meaningful personas covering all stakeholder groups.
- **Pass 3 — Feature Scoping Completeness**: Confirm in-scope, out-of-scope, and deferred lists exist; features are specific enough to estimate with prioritization applied.
- **Pass 4 — Success Criteria Measurability**: Every criterion needs a target value, measurement method, and tie-back to the problem statement.
- **Pass 5 — NFR Quantification**: All NFR categories addressed with quantified targets and conditions, not adjectives.
- **Pass 6 — Constraint & Dependency Documentation**: Technical, timeline, budget, team, and regulatory constraints present with traceable downstream impact.
- **Pass 7 — Error & Edge Case Coverage**: Sad paths for every feature with user input or external dependencies; failure modes for third-party integrations.
- **Pass 8 — Downstream Readiness for User Stories**: Features specific enough to map to stories, personas specific enough to be actors, business rules explicit enough for acceptance criteria.

## Deep Guidance

---

## Pass 1: Problem Statement Rigor

### What to Check

- Is the problem specific, testable, grounded in observable reality?
- Has quantitative evidence where available?
- Doesn't prescribe solutions?
- Names a specific user group, not "users" or "everyone"?

### Why This Matters

The problem statement anchors every decision in the pipeline. If it prescribes a solution instead of describing a pain point, the entire product is built to validate a predetermined answer rather than solve a real problem. Vague problem statements produce vague requirements, which produce vague stories, which produce implementations that technically work but don't solve anything. A problem statement that names "users" instead of a specific group gives no signal about whose needs to prioritize when trade-offs arise.

### How to Check

1. Read the problem statement in isolation — does it describe an observable user pain point?
2. Check for solution language ("we need to build," "we should use," "modernize our stack") — these prescribe solutions, not problems
3. Check for a named, specific user group — not "users," "everyone," or "stakeholders"
4. Look for quantitative evidence (hours wasted, error rates, revenue lost, support tickets) — if none exists, flag it
5. Verify the problem is testable — could you measure whether it's been solved?

### What a Finding Looks Like

- P0: "Problem statement is 'We need to modernize our technology stack' — this prescribes a solution, not a problem. No user-facing pain point identified."
- P1: "Problem statement names 'small business owners' but provides no quantitative evidence of the pain. How many hours wasted? What error rate?"

---

## Pass 2: Persona & Stakeholder Coverage

### What to Check

- Are personas goal-driven with constraints, current behavior, and success criteria?
- Every stakeholder group represented (end users, admins, support, integrators)?
- No "Everything User" anti-pattern (contradictory persona)?
- 2-4 meaningful personas (>6 suggests scope too broad, 1 suggests missing secondary users)?

### Why This Matters

Personas become story actors. If a persona is just a role label ("Admin") with no goals, constraints, or context, stories attributed to that persona are ungrounded — the agent writing them has to invent motivations. Missing stakeholder groups mean entire user journeys have no stories. The "Everything User" anti-pattern (a single persona who is both a power user and a beginner, both technical and non-technical) makes prioritization impossible because every feature is equally important to the same persona.

### How to Check

1. List every persona defined in the PRD
2. For each persona, check for: specific goals, constraints, current behavior, and success criteria
3. Count personas — fewer than 2 usually means secondary users are missing; more than 6 usually means scope is too broad
4. Check for contradictions within a single persona (wants simplicity AND power-user features)
5. List stakeholder groups that interact with the system (end users, admins, support, integrators, billing) and verify each has a persona or is explicitly out of scope
6. Check that persona descriptions include enough context to write stories — not just "Admin: manages the system"

### What a Finding Looks Like

- P0: "PRD defines a single persona 'User' with no goals, constraints, or context. Cannot write stories — no actor to attribute them to."
- P1: "PRD describes end user and admin but no mention of support staff, who handle 200+ tickets/week per the problem statement."

---

## Pass 3: Feature Scoping Completeness

### What to Check

- In-scope, out-of-scope, and deferred lists all present?
- Features specific enough to estimate (not "user management" or "analytics")?
- Prioritization applied (MoSCoW or equivalent)?
- No "requirements as solutions" (PRD says WHAT, not HOW)?

### Why This Matters

Missing scope boundaries cause the most expensive downstream failures. Without an out-of-scope list, implementing agents may build features the product team never intended. Without a deferred list, features that should wait for v2 get built into v1, expanding scope and timeline. Vague feature descriptions ("user management") are impossible to decompose into stories — two different agents would build completely different things. Technical prescriptions ("use React and PostgreSQL") in the PRD constrain architecture before the architecture phase has run.

### How to Check

1. Verify three lists exist: in-scope, out-of-scope, and deferred
2. For each in-scope feature, check specificity — could two different people reading this description agree on what to build?
3. Check for prioritization (MoSCoW, P0-P3, or equivalent) — if all features are "must-have," prioritization hasn't happened
4. Scan for technical prescriptions — the PRD should say WHAT the product does, not HOW it's built
5. Check that feature descriptions describe user-facing behavior, not implementation details

### What a Finding Looks Like

- P0: "No out-of-scope section exists. 'Product management' is listed as a feature with no further detail — could mean anything from a product catalog to a full PIM system."
- P1: "Feature 'notifications' doesn't specify channel (push? email? in-app? all three?) — two engineers would build different things."

---

## Pass 4: Success Criteria Measurability

### What to Check

- Every criterion has a target value AND a measurement method?
- Criteria tied to the problem statement (not generic "revenue increases")?
- Types covered: user behavior, business metrics, technical metrics, adoption?

### Why This Matters

Success criteria that can't be measured can't be verified. "Users are satisfied" is not a success criterion — it's a hope. Without target values, any movement in the right direction technically satisfies the criterion. Without measurement methods, the team can't verify success even if they achieve it. Criteria disconnected from the problem statement indicate the PRD has drifted from its original purpose.

### How to Check

1. List every success criterion in the PRD
2. For each, check for a specific target value (a number, a percentage, a threshold)
3. For each, check for a measurement method (how will this be measured? what tool or process?)
4. Trace each criterion back to the problem statement — does it measure whether the problem is solved?
5. Check coverage across types: user behavior metrics, business metrics, technical metrics, adoption metrics — if only one type is present, the others are likely missing
6. Flag criteria that are generic ("increase user satisfaction") rather than specific ("reduce checkout abandonment from 72% to 45%")

### What a Finding Looks Like

- P0: "Only success criterion is 'users are satisfied with the product' — no target value, no measurement method, not tied to problem statement."
- P1: "Success criterion 'checkout abandonment decreases' has no target value. Decrease from 72% to 71% would technically satisfy it."

---

## Pass 5: NFR Quantification

### What to Check

- All NFR categories addressed: performance, scalability, availability, security, accessibility, data retention, i18n, browser/device support, monitoring?
- Quantified with numbers, not adjectives ("p95 under 200ms" not "fast")?
- Conditions specified (under what load, on what connection)?

### Why This Matters

Missing or vague NFRs force implementing agents to make arbitrary decisions about performance, security, and reliability. "The system should be fast" means something different to every engineer. Without quantified targets and conditions, the architecture phase has no constraints to design against, and the testing phase has no thresholds to verify. NFR gaps discovered during implementation are orders of magnitude more expensive to fix than NFR gaps caught during PRD review.

### How to Check

1. Check each NFR category: performance, scalability, availability, security, accessibility, data retention, i18n, browser/device support, monitoring
2. For each category present, verify quantification — numbers, not adjectives
3. For performance NFRs, check for conditions: under what load? on what hardware? at what percentile?
4. For availability NFRs, check for specifics: what's the target uptime? what's the maximum acceptable downtime window?
5. For security NFRs, check for compliance standards (SOC 2, GDPR, PCI DSS) where applicable
6. Flag any NFR category that's completely absent

### What a Finding Looks Like

- P0: "No NFRs specified at all. Implementing agents will make arbitrary performance and security decisions."
- P1: "Performance requirement says 'the system should be fast' — no response time targets, no percentile, no load conditions."

---

## Pass 6: Constraint & Dependency Documentation

### What to Check

- Technical, timeline, budget, team, and regulatory constraints present?
- Each constraint traceable to downstream architectural impact?
- External integrations identified with API limitations, costs, rate limits?

### Why This Matters

Undocumented constraints surface as surprises during implementation. A Stripe integration without PCI DSS compliance noted will derail the architecture phase. A team constraint of 3 developers without connection to scope decisions means the plan may be unachievable. Regulatory constraints discovered late can require fundamental redesigns. Every constraint should be visible to downstream phases so they can design around it rather than into it.

### How to Check

1. Check each constraint category: technical, timeline, budget, team size/skills, regulatory/compliance
2. For each constraint, trace the downstream impact — how does this affect architecture, implementation, or testing?
3. List all external integrations mentioned in the PRD
4. For each integration, check for: API limitations, costs, rate limits, authentication requirements, compliance requirements
5. Flag constraints that are stated but not connected to decisions — "we have 3 developers" without scope implications

### What a Finding Looks Like

- P1: "PRD mentions Stripe integration but doesn't note PCI DSS compliance requirement — this will surface as a surprise during architecture."
- P2: "Team constraint '3 developers' is stated but not connected to scope decisions — are all features achievable with this team size?"

---

## Pass 7: Error & Edge Case Coverage

### What to Check

- Sad paths addressed for every feature with user input or external dependencies?
- Session expiry, network failure, concurrent access scenarios considered?
- Failure modes for third-party integrations documented?

### Why This Matters

Happy-path-only PRDs produce happy-path-only implementations. When the PRD doesn't describe what happens when a payment fails, the implementing agent either guesses (producing inconsistent error handling) or ignores it (producing a broken user experience). Edge cases in user input, network conditions, and third-party integrations are where most production bugs live. Documenting them in the PRD ensures they flow into stories, acceptance criteria, and test cases.

### How to Check

1. For each feature involving user input, check: what happens with invalid input? empty input? malicious input?
2. For each feature involving external dependencies, check: what happens when the dependency is unavailable? slow? returns unexpected data?
3. Check for session-related scenarios: session expiry mid-action, concurrent access from multiple devices, browser back button during multi-step flows
4. Check for data-related edge cases: duplicate submissions, race conditions, large data volumes
5. For each third-party integration, check: failure modes documented? retry logic specified? fallback behavior defined?

### What a Finding Looks Like

- P1: "Checkout flow describes the happy path but never addresses: payment failure, session expiry mid-checkout, network drop during payment processing."
- P2: "User profile edit doesn't address concurrent edit scenario — what if user edits on two devices simultaneously?"

---

## Pass 8: Downstream Readiness for User Stories

### What to Check

- Can stories be written from this PRD without guesswork?
- Features specific enough to map to stories (one feature = one or more stories)?
- Personas specific enough to be story actors?
- Business rules explicit enough to become acceptance criteria?
- Error scenarios detailed enough to become negative test scenarios?

### Why This Matters

The PRD's primary consumer is the user stories phase. If features are too vague to decompose into stories, the story-writing agent must invent requirements — and its inventions may not match the product team's intent. Personas that are just role labels can't be story actors. Business rules that are implied but not stated produce acceptance criteria that are guesses rather than specifications. This pass is the final gate before the PRD leaves the pre-pipeline and enters the main pipeline.

### How to Check

1. Select 3-5 representative features from different areas of the PRD
2. For each, attempt to write a story title ("As a [persona], I want to [action] so that [benefit]") — if you can't fill in the blanks, the feature or persona is too vague
3. For each, attempt to write 2-3 acceptance criteria from the PRD description alone — if you have to guess at business rules, they're not explicit enough
4. Check that error scenarios in the PRD are detailed enough to become "Given [error condition], When [user action], Then [expected behavior]" acceptance criteria
5. Verify that the mapping from features to stories would be roughly 1:N (one feature produces one or more stories) — if a feature maps to zero stories, it's too vague; if it maps to 20+, it should have been decomposed in the PRD

### What a Finding Looks Like

- P0: "Feature 'user management' cannot be decomposed into stories — what operations? What user types? What permissions model?"
- P1: "Business rules for discount application are implied but not stated — story acceptance criteria will have to guess at validation logic."

### Example Review Finding

```markdown
### Finding: NFRs use qualitative adjectives instead of quantified targets

**Pass:** 5 — NFR Quantification
**Priority:** P1
**Location:** PRD Section 6 "Non-Functional Requirements"

**Issue:** Performance requirements state "the system should be fast and responsive."
No response time targets, percentile thresholds, or load conditions are specified.
"Fast" is subjective — it means <100ms to a backend engineer and <3s to a product
manager evaluating full page loads.

Similarly, availability requirement states "high availability" without specifying
a target uptime percentage, maximum acceptable downtime window, or recovery time
objective (RTO).

**Impact:** The architecture step cannot make infrastructure decisions (single
instance vs. load-balanced, database read replicas, CDN) without quantified
performance targets. The testing step cannot write performance tests without
thresholds to assert against. Implementing agents will make arbitrary performance
trade-offs with no shared baseline.

**Recommendation:** Replace with quantified targets:
- "API response time: p95 < 200ms, p99 < 500ms under 1000 concurrent users"
- "Page load time: Largest Contentful Paint < 2.5s on 4G connection"
- "Availability: 99.9% uptime (8.7 hours maximum downtime per year)"
- "Recovery: RTO < 15 minutes, RPO < 1 hour"

**Trace:** PRD Section 6 → blocks Architecture Phase → blocks Implementation
```
